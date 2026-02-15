import * as ort from "onnxruntime-web";

export interface InpaintingTask {
  imageData: ImageData;
  maskData: ImageData;
}

export interface InpaintingResult {
  imageData: ImageData;
}

export interface WorkerMessage {
  type: "init" | "inpaint";
  task?: InpaintingTask;
}

export interface WorkerResponse {
  type: "init-done" | "progress" | "result" | "error";
  progress?: { stage: string; progress: number; message: string };
  result?: InpaintingResult;
  error?: string;
}

const MODEL_URL =
  "https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx";

const DB_NAME = "image-master-models";
const DB_VERSION = 1;
const STORE_NAME = "onnx-models";
const MODEL_KEY = "migan-inpainting";

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

async function getCachedModel(): Promise<ArrayBuffer | null> {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(MODEL_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result ?? null);
    });
  } catch {
    return null;
  }
}

async function cacheModel(data: ArrayBuffer): Promise<void> {
  try {
    const db = await openModelDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.put(data, MODEL_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // Ignore cache errors
  }
}

function postProgress(stage: string, progress: number, message: string) {
  self.postMessage({
    type: "progress",
    progress: { stage, progress, message },
  } as WorkerResponse);
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
      postProgress(
        "downloading",
        (received / total) * 100,
        `下载模型中... ${Math.round(received / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
      );
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
  // MiGAN model should be at least 1MB
  return buffer.byteLength > 1024 * 1024;
}

async function clearCachedModel(): Promise<void> {
  try {
    const db = await openModelDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(MODEL_KEY);
    sessionCache = null;
  } catch {
    /* ignore */
  }
}

async function initSession(): Promise<void> {
  if (sessionCache) return;

  let modelBuffer = await getCachedModel();

  if (modelBuffer && !isValidModel(modelBuffer)) {
    await clearCachedModel();
    modelBuffer = null;
  }

  if (!modelBuffer) {
    postProgress("downloading", 0, "准备下载模型...");
    modelBuffer = await fetchWithProgress(MODEL_URL);
    if (!isValidModel(modelBuffer)) throw new Error("模型文件无效");
    await cacheModel(modelBuffer);
  }

  postProgress("downloading", 100, "加载模型中...");

  try {
    sessionCache = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  } catch {
    await clearCachedModel();
    postProgress("downloading", 0, "模型加载失败，重新下载...");
    modelBuffer = await fetchWithProgress(MODEL_URL);
    await cacheModel(modelBuffer);
    sessionCache = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
  }
}

/**
 * Convert ImageData to tensor in format [1, 3, H, W] (NCHW) with uint8 values
 * MiGAN expects uint8 input in CHW format
 */
function imageDataToTensor(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;
  const uint8Data = new Uint8Array(3 * height * width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * width + x;

      // RGB channels as uint8 (0-255) in NCHW format
      uint8Data[dstIdx] = data[srcIdx];                           // R channel
      uint8Data[height * width + dstIdx] = data[srcIdx + 1];      // G channel
      uint8Data[2 * height * width + dstIdx] = data[srcIdx + 2];  // B channel
    }
  }

  return new ort.Tensor("uint8", uint8Data, [1, 3, height, width]);
}

/**
 * Convert mask ImageData to tensor in format [1, 1, H, W] (NCHW) with uint8 values
 * MiGAN expects mask as uint8 where 0 = area to inpaint, 255 = area to preserve
 */
function maskDataToTensor(maskData: ImageData): ort.Tensor {
  const { data, width, height } = maskData;
  const uint8Data = new Uint8Array(height * width);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * width + x;

      // Use alpha channel as mask
      // Painted area (alpha > 128) = 0 (inpaint this area)
      // Unpainted area = 255 (preserve this area)
      uint8Data[dstIdx] = data[srcIdx + 3] > 128 ? 0 : 255;
    }
  }

  return new ort.Tensor("uint8", uint8Data, [1, 1, height, width]);
}

/**
 * Convert output tensor back to ImageData
 * Handle both uint8 and float32 outputs, NCHW and NHWC formats
 */
function tensorToImageData(tensor: ort.Tensor, width: number, height: number): ImageData {
  const imageData = new ImageData(width, height);
  const tensorData = tensor.data;
  const dims = tensor.dims;
  const isUint8 = tensor.type === "uint8";

  // Determine format based on dimensions
  // NCHW: [1, 3, H, W] - dims[1] is 3
  // NHWC: [1, H, W, 3] - dims[3] is 3
  const isNCHW = dims.length === 4 && dims[1] === 3;

  console.log("[Inpainting] Output format:", isNCHW ? "NCHW" : "NHWC", "type:", tensor.type);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dstIdx = (y * width + x) * 4;
      let r: number, g: number, b: number;

      if (isNCHW) {
        // Format: [1, 3, H, W]
        const idx = y * width + x;
        if (isUint8) {
          r = (tensorData as Uint8Array)[idx];
          g = (tensorData as Uint8Array)[height * width + idx];
          b = (tensorData as Uint8Array)[2 * height * width + idx];
        } else {
          const fData = tensorData as Float32Array;
          // Check if values are in 0-1 range or 0-255 range
          const maxVal = Math.max(fData[idx], fData[height * width + idx], fData[2 * height * width + idx]);
          const scale = maxVal > 1.0 ? 1 : 255;
          r = Math.round(fData[idx] * scale);
          g = Math.round(fData[height * width + idx] * scale);
          b = Math.round(fData[2 * height * width + idx] * scale);
        }
      } else {
        // Format: [1, H, W, 3] (NHWC)
        const idx = (y * width + x) * 3;
        if (isUint8) {
          r = (tensorData as Uint8Array)[idx];
          g = (tensorData as Uint8Array)[idx + 1];
          b = (tensorData as Uint8Array)[idx + 2];
        } else {
          const fData = tensorData as Float32Array;
          const maxVal = Math.max(fData[idx], fData[idx + 1], fData[idx + 2]);
          const scale = maxVal > 1.0 ? 1 : 255;
          r = Math.round(fData[idx] * scale);
          g = Math.round(fData[idx + 1] * scale);
          b = Math.round(fData[idx + 2] * scale);
        }
      }

      imageData.data[dstIdx] = Math.max(0, Math.min(255, r));
      imageData.data[dstIdx + 1] = Math.max(0, Math.min(255, g));
      imageData.data[dstIdx + 2] = Math.max(0, Math.min(255, b));
      imageData.data[dstIdx + 3] = 255;
    }
  }

  return imageData;
}

async function runInpainting(task: InpaintingTask): Promise<InpaintingResult> {
  if (!sessionCache) throw new Error("Session not initialized");

  const { imageData, maskData } = task;
  const { width, height } = imageData;

  postProgress("processing", 10, "准备输入数据...");

  // Create input tensors
  const imageTensor = imageDataToTensor(imageData);
  const maskTensor = maskDataToTensor(maskData);

  postProgress("processing", 20, "分析模型结构...");

  // Log model info for debugging
  const inputNames = sessionCache.inputNames;
  const outputNames = sessionCache.outputNames;
  console.log("[Inpainting] Model inputs:", inputNames);
  console.log("[Inpainting] Model outputs:", outputNames);

  postProgress("processing", 30, "执行模型推理...");

  // Run inference
  const feeds: Record<string, ort.Tensor> = {};

  // MiGAN pipeline model has 'image' and 'mask' inputs
  if (inputNames.length >= 2) {
    // Map by name if possible, otherwise by position
    const imageInputName = inputNames.find(n => n.toLowerCase().includes("image")) || inputNames[0];
    const maskInputName = inputNames.find(n => n.toLowerCase().includes("mask")) || inputNames[1];

    feeds[imageInputName] = imageTensor;
    feeds[maskInputName] = maskTensor;
  } else if (inputNames.length === 1) {
    // Single input - concatenate image and mask in NCHW format [1, 4, H, W]
    const combinedData = new Uint8Array(4 * height * width);
    const imgData = imageTensor.data as Uint8Array;
    const mskData = maskTensor.data as Uint8Array;

    // Copy RGB channels (already in CHW format)
    for (let i = 0; i < 3 * height * width; i++) {
      combinedData[i] = imgData[i];
    }
    // Copy mask channel
    for (let i = 0; i < height * width; i++) {
      combinedData[3 * height * width + i] = mskData[i];
    }

    feeds[inputNames[0]] = new ort.Tensor("uint8", combinedData, [1, 4, height, width]);
  }

  const results = await sessionCache.run(feeds);

  postProgress("processing", 80, "处理输出结果...");

  // Get output tensor
  const outputTensor = results[outputNames[0]];
  console.log("[Inpainting] Output tensor shape:", outputTensor.dims, "type:", outputTensor.type);

  // Convert back to ImageData
  const resultImageData = tensorToImageData(outputTensor, width, height);

  postProgress("processing", 100, "完成");

  return { imageData: resultImageData };
}

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type, task } = event.data;

  try {
    if (type === "init") {
      await initSession();
      self.postMessage({ type: "init-done" } as WorkerResponse);
    } else if (type === "inpaint" && task) {
      const result = await runInpainting(task);
      self.postMessage({ type: "result", result } as WorkerResponse);
    }
  } catch (error) {
    self.postMessage({
      type: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    } as WorkerResponse);
  }
};
