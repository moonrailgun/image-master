import * as ort from "onnxruntime-web";

export type ScaleFactor = 4;

export interface UpscaleResult {
  name: string;
  blob: Blob;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
}

export interface UpscaleProgress {
  stage: "downloading" | "processing";
  progress: number;
  message: string;
}

// Model URL from Hugging Face (use /resolve/ for LFS files)
const MODEL_URL = "https://huggingface.co/AXERA-TECH/Real-ESRGAN/resolve/main/onnx/realesrgan-x4.onnx";

const DB_NAME = "image-master-models";
const DB_VERSION = 1;
const STORE_NAME = "onnx-models";

// Tile size for processing large images (model requires exactly 64x64 input)
const TILE_SIZE = 64;

// Session cache
const sessionCache: Map<ScaleFactor, ort.InferenceSession> = new Map();

ort.env.logLevel = "error";

/**
 * Open IndexedDB for model caching
 */
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

/**
 * Get cached model from IndexedDB
 */
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

/**
 * Cache model to IndexedDB
 */
async function cacheModel(
  scale: ScaleFactor,
  data: ArrayBuffer
): Promise<void> {
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
    // Caching failed, continue without cache
  }
}

/**
 * Try to fetch from a single URL with progress
 */
async function fetchWithProgress(
  url: string,
  onProgress?: (progress: UpscaleProgress) => void
): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const contentLength = response.headers.get("content-length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;

  if (!response.body) {
    throw new Error("Response body is not available");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    chunks.push(value);
    received += value.length;

    if (total > 0 && onProgress) {
      onProgress({
        stage: "downloading",
        progress: (received / total) * 100,
        message: `下载模型中... ${Math.round(received / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`,
      });
    }
  }

  const buffer = new Uint8Array(received);
  let position = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, position);
    position += chunk.length;
  }

  return buffer.buffer;
}

/**
 * Download model with progress callback
 */
async function downloadModel(
  onProgress?: (progress: UpscaleProgress) => void
): Promise<ArrayBuffer> {
  onProgress?.({
    stage: "downloading",
    progress: 0,
    message: "正在下载模型...",
  });

  return await fetchWithProgress(MODEL_URL, onProgress);
}

/**
 * Validate model buffer by checking size
 */
function isValidOnnxModel(buffer: ArrayBuffer): boolean {
  // Minimum valid ONNX model is at least several KB
  // Real-ESRGAN model is ~64MB, so anything less than 1MB is likely corrupted
  return buffer.byteLength > 1024 * 1024; // At least 1MB
}

/**
 * Clear cached model for specific scale
 */
async function clearCachedModel(scale: ScaleFactor): Promise<void> {
  try {
    const db = await openModelDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.delete(`realesrgan-x${scale}`);
    sessionCache.delete(scale);
  } catch {
    // Ignore errors
  }
}

/**
 * Get or create ONNX session
 */
async function getSession(
  scale: ScaleFactor,
  onProgress?: (progress: UpscaleProgress) => void
): Promise<ort.InferenceSession> {
  // Return cached session if available
  const cached = sessionCache.get(scale);
  if (cached) {
    return cached;
  }

  // Try to load from IndexedDB cache
  let modelBuffer = await getCachedModel(scale);

  // Validate cached model
  if (modelBuffer && !isValidOnnxModel(modelBuffer)) {
    console.warn("Cached model appears invalid, clearing cache...");
    await clearCachedModel(scale);
    modelBuffer = null;
  }

  if (!modelBuffer) {
    // Download from CDN
    onProgress?.({
      stage: "downloading",
      progress: 0,
      message: "准备下载模型...",
    });

    modelBuffer = await downloadModel(onProgress);

    // Validate downloaded model
    if (!isValidOnnxModel(modelBuffer)) {
      throw new Error("下载的模型文件无效，请检查网络连接后重试");
    }

    // Cache for future use
    await cacheModel(scale, modelBuffer);
  }

  onProgress?.({
    stage: "downloading",
    progress: 100,
    message: "加载模型中...",
  });

  // Create session with WebGL or WASM backend
  try {
    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["webgl", "wasm"],
      graphOptimizationLevel: "all",
    });

    sessionCache.set(scale, session);
    return session;
  } catch (error) {
    // If session creation fails, clear cache and retry once
    console.error("Session creation failed, clearing cache:", error);
    await clearCachedModel(scale);

    onProgress?.({
      stage: "downloading",
      progress: 0,
      message: "模型加载失败，正在重新下载...",
    });

    modelBuffer = await downloadModel(onProgress);
    await cacheModel(scale, modelBuffer);

    onProgress?.({
      stage: "downloading",
      progress: 100,
      message: "重新加载模型中...",
    });

    const session = await ort.InferenceSession.create(modelBuffer, {
      executionProviders: ["webgl", "wasm"],
      graphOptimizationLevel: "all",
    });

    sessionCache.set(scale, session);
    return session;
  }
}

/**
 * Load image file to ImageData
 */
async function loadImage(file: File): Promise<{
  imageData: ImageData;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      URL.revokeObjectURL(img.src);
      resolve({ imageData, width: img.width, height: img.height });
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Convert ImageData tile to ONNX tensor (always outputs TILE_SIZE x TILE_SIZE)
 */
function imageDataToTensor(
  imageData: ImageData,
  x: number,
  y: number
): ort.Tensor {
  const { data, width, height } = imageData;
  const floatData = new Float32Array(3 * TILE_SIZE * TILE_SIZE);

  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      // Clamp to image bounds (edge padding)
      const srcX = Math.min(Math.max(x + tx, 0), width - 1);
      const srcY = Math.min(Math.max(y + ty, 0), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = ty * TILE_SIZE + tx;

      // RGB channels, normalized to [0, 1]
      floatData[dstIdx] = data[srcIdx] / 255;
      floatData[TILE_SIZE * TILE_SIZE + dstIdx] = data[srcIdx + 1] / 255;
      floatData[2 * TILE_SIZE * TILE_SIZE + dstIdx] = data[srcIdx + 2] / 255;
    }
  }

  return new ort.Tensor("float32", floatData, [1, 3, TILE_SIZE, TILE_SIZE]);
}

/**
 * Convert ONNX tensor output to ImageData
 */
function tensorToImageData(tensor: ort.Tensor): ImageData {
  const [, , height, width] = tensor.dims;
  const data = tensor.data as Float32Array;
  const imageData = new ImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = y * width + x;
      const dstIdx = (y * width + x) * 4;

      // Denormalize from [0, 1] to [0, 255] and clamp
      imageData.data[dstIdx] = Math.max(
        0,
        Math.min(255, Math.round(data[srcIdx] * 255))
      );
      imageData.data[dstIdx + 1] = Math.max(
        0,
        Math.min(255, Math.round(data[width * height + srcIdx] * 255))
      );
      imageData.data[dstIdx + 2] = Math.max(
        0,
        Math.min(255, Math.round(data[2 * width * height + srcIdx] * 255))
      );
      imageData.data[dstIdx + 3] = 255;
    }
  }

  return imageData;
}

/**
 * Process a single tile through the model
 */
async function processTile(
  session: ort.InferenceSession,
  inputTensor: ort.Tensor
): Promise<ort.Tensor> {
  const feeds: Record<string, ort.Tensor> = {};
  feeds[session.inputNames[0]] = inputTensor;

  const results = await session.run(feeds);
  return results[session.outputNames[0]];
}

/**
 * Upscale image using Real-ESRGAN
 */
export async function upscaleImage(
  file: File,
  scale: ScaleFactor,
  onProgress?: (progress: UpscaleProgress) => void
): Promise<UpscaleResult> {
  // Get or create session
  const session = await getSession(scale, onProgress);

  // Load source image
  const { imageData, width, height } = await loadImage(file);

  onProgress?.({
    stage: "processing",
    progress: 0,
    message: "准备处理图片...",
  });

  // Calculate output dimensions
  const outputWidth = width * scale;
  const outputHeight = height * scale;

  // Create output canvas
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d")!;

  // Calculate number of tiles
  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const totalTiles = tilesX * tilesY;
  let processedTiles = 0;

  // Process each tile
  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      const x = tileX * TILE_SIZE;
      const y = tileY * TILE_SIZE;

      // Convert tile to tensor (always 64x64, with edge padding)
      const inputTensor = imageDataToTensor(imageData, x, y);

      // Process tile
      const outputTensor = await processTile(session, inputTensor);

      // Convert output tensor to ImageData
      const tileOutput = tensorToImageData(outputTensor);

      // Calculate how much of this tile is valid (not padded)
      const validWidth = Math.min(TILE_SIZE, width - x);
      const validHeight = Math.min(TILE_SIZE, height - y);

      // Create temporary canvas for tile
      const tileCanvas = document.createElement("canvas");
      tileCanvas.width = tileOutput.width;
      tileCanvas.height = tileOutput.height;
      const tileCtx = tileCanvas.getContext("2d")!;
      tileCtx.putImageData(tileOutput, 0, 0);

      // Draw only the valid region to output (exclude padded edges)
      outputCtx.drawImage(
        tileCanvas,
        0,
        0,
        validWidth * scale,
        validHeight * scale,
        x * scale,
        y * scale,
        validWidth * scale,
        validHeight * scale
      );

      processedTiles++;
      onProgress?.({
        stage: "processing",
        progress: (processedTiles / totalTiles) * 100,
        message: `处理中... ${processedTiles}/${totalTiles} 块`,
      });
    }
  }

  // Convert canvas to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    outputCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
      "image/png"
    );
  });

  return {
    name: file.name.replace(/\.[^/.]+$/, "") + `_x${scale}.png`,
    blob,
    width: outputWidth,
    height: outputHeight,
    originalWidth: width,
    originalHeight: height,
  };
}

/**
 * Check if model is cached
 */
export async function isModelCached(scale: ScaleFactor): Promise<boolean> {
  const cached = await getCachedModel(scale);
  return cached !== null;
}

/**
 * Clear cached models
 */
export async function clearModelCache(): Promise<void> {
  try {
    const db = await openModelDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    sessionCache.clear();
  } catch {
    // Ignore errors
  }
}
