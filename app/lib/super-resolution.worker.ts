import * as ort from "onnxruntime-web";

export type ScaleFactor = 4;

export interface TileTask {
  tileIndex: number;
  x: number;
  y: number;
  validWidth: number;
  validHeight: number;
}

export interface TileResult {
  tileIndex: number;
  x: number;
  y: number;
  validWidth: number;
  validHeight: number;
  imageData: ImageData;
}

export interface WorkerMessage {
  type: "init" | "process-tiles";
  scale?: ScaleFactor;
  // For process-tiles
  imageData?: ImageData;
  tiles?: TileTask[];
}

export interface WorkerResponse {
  type: "init-done" | "progress" | "tile-result" | "error";
  progress?: { stage: string; progress: number; message: string };
  tileResult?: TileResult;
  error?: string;
}

const MODEL_URL =
  "https://huggingface.co/AXERA-TECH/Real-ESRGAN/resolve/main/onnx/realesrgan-x4.onnx";

const DB_NAME = "image-master-models";
const DB_VERSION = 1;
const STORE_NAME = "onnx-models";
const TILE_SIZE = 64;

let sessionCache: ort.InferenceSession | null = null;

// Configure ONNX Runtime for Worker environment
ort.env.logLevel = "error";
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd = true;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";

function openModelDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function getCachedModel(scale: ScaleFactor): Promise<ArrayBuffer | null> {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(`realesrgan-x${scale}`);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  } catch {
    return null;
  }
}

async function cacheModel(scale: ScaleFactor, data: ArrayBuffer): Promise<void> {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, `realesrgan-x${scale}`);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // Ignore
  }
}

function postProgress(stage: string, progress: number, message: string) {
  self.postMessage({ type: "progress", progress: { stage, progress, message } } as WorkerResponse);
}

async function fetchWithProgress(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) {
      postProgress("downloading", (received / total) * 100,
        `下载模型中... ${Math.round(received / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`);
    }
  }

  const buffer = new Uint8Array(received);
  let pos = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, pos);
    pos += chunk.length;
  }
  return buffer.buffer;
}

function isValidModel(buffer: ArrayBuffer): boolean {
  return buffer.byteLength > 1024 * 1024;
}

async function clearCachedModel(scale: ScaleFactor): Promise<void> {
  try {
    const db = await openModelDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(`realesrgan-x${scale}`);
    sessionCache = null;
  } catch { /* ignore */ }
}

async function initSession(scale: ScaleFactor): Promise<void> {
  if (sessionCache) return;

  let modelBuffer = await getCachedModel(scale);

  if (modelBuffer && !isValidModel(modelBuffer)) {
    await clearCachedModel(scale);
    modelBuffer = null;
  }

  if (!modelBuffer) {
    postProgress("downloading", 0, "准备下载模型...");
    modelBuffer = await fetchWithProgress(MODEL_URL);
    if (!isValidModel(modelBuffer)) throw new Error("模型文件无效");
    await cacheModel(scale, modelBuffer);
  }

  postProgress("downloading", 100, "加载模型中...");

  try {
    sessionCache = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  } catch {
    await clearCachedModel(scale);
    postProgress("downloading", 0, "模型加载失败，重新下载...");
    modelBuffer = await fetchWithProgress(MODEL_URL);
    await cacheModel(scale, modelBuffer);
    sessionCache = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }
}

function imageDataToTensor(imageData: ImageData, x: number, y: number): ort.Tensor {
  const { data, width, height } = imageData;
  const floatData = new Float32Array(3 * TILE_SIZE * TILE_SIZE);

  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      const srcX = Math.min(Math.max(x + tx, 0), width - 1);
      const srcY = Math.min(Math.max(y + ty, 0), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = ty * TILE_SIZE + tx;

      floatData[dstIdx] = data[srcIdx] / 255;
      floatData[TILE_SIZE * TILE_SIZE + dstIdx] = data[srcIdx + 1] / 255;
      floatData[2 * TILE_SIZE * TILE_SIZE + dstIdx] = data[srcIdx + 2] / 255;
    }
  }
  return new ort.Tensor("float32", floatData, [1, 3, TILE_SIZE, TILE_SIZE]);
}

function tensorToImageData(tensor: ort.Tensor): ImageData {
  const [, , h, w] = tensor.dims;
  const data = tensor.data as Float32Array;
  const imageData = new ImageData(w, h);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const srcIdx = y * w + x;
      const dstIdx = (y * w + x) * 4;
      imageData.data[dstIdx] = Math.max(0, Math.min(255, Math.round(data[srcIdx] * 255)));
      imageData.data[dstIdx + 1] = Math.max(0, Math.min(255, Math.round(data[w * h + srcIdx] * 255)));
      imageData.data[dstIdx + 2] = Math.max(0, Math.min(255, Math.round(data[2 * w * h + srcIdx] * 255)));
      imageData.data[dstIdx + 3] = 255;
    }
  }
  return imageData;
}

async function processTile(imageData: ImageData, task: TileTask): Promise<TileResult> {
  if (!sessionCache) throw new Error("Session not initialized");

  const inputTensor = imageDataToTensor(imageData, task.x, task.y);
  const feeds: Record<string, ort.Tensor> = {};
  feeds[sessionCache.inputNames[0]] = inputTensor;
  const results = await sessionCache.run(feeds);
  const outputTensor = results[sessionCache.outputNames[0]];
  const tileImageData = tensorToImageData(outputTensor);

  return {
    tileIndex: task.tileIndex,
    x: task.x,
    y: task.y,
    validWidth: task.validWidth,
    validHeight: task.validHeight,
    imageData: tileImageData,
  };
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, scale, imageData, tiles } = event.data;

  try {
    if (type === "init") {
      await initSession(scale || 4);
      self.postMessage({ type: "init-done" } as WorkerResponse);
    } else if (type === "process-tiles" && imageData && tiles) {
      for (const task of tiles) {
        const result = await processTile(imageData, task);
        self.postMessage({ type: "tile-result", tileResult: result } as WorkerResponse);
      }
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    } as WorkerResponse);
  }
};
