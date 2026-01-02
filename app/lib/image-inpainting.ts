export interface InpaintingResult {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export interface InpaintingProgress {
  stage: "downloading" | "processing";
  progress: number;
  message: string;
}

const DB_NAME = "image-master-models";
const DB_VERSION = 1;
const STORE_NAME = "onnx-models";
const MODEL_KEY = "migan-inpainting";

let worker: Worker | null = null;
let initPromise: Promise<void> | null = null;

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

function createWorker(): Worker {
  return new Worker(new URL("./image-inpainting.worker.ts", import.meta.url));
}

async function initWorker(onProgress?: (progress: InpaintingProgress) => void): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!worker) {
      worker = createWorker();
    }

    await new Promise<void>((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        const { type, progress, error } = event.data;

        if (type === "init-done") {
          worker?.removeEventListener("message", handler);
          resolve();
        } else if (type === "progress" && progress) {
          onProgress?.({
            stage: progress.stage,
            progress: progress.progress,
            message: progress.message,
          });
        } else if (type === "error") {
          worker?.removeEventListener("message", handler);
          reject(new Error(error));
        }
      };

      worker!.addEventListener("message", handler);
      worker!.postMessage({ type: "init" });
    });
  })();

  return initPromise;
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
 * Run inpainting on an image with a mask
 * @param imageFile - Original image file
 * @param maskImageData - Mask ImageData (white/opaque areas will be inpainted)
 * @param onProgress - Progress callback
 */
export async function inpaintImage(
  imageFile: File,
  maskImageData: ImageData,
  onProgress?: (progress: InpaintingProgress) => void
): Promise<InpaintingResult> {
  // Load image
  const { imageData, width, height } = await loadImage(imageFile);

  onProgress?.({
    stage: "processing",
    progress: 0,
    message: "初始化模型...",
  });

  // Initialize worker
  await initWorker(onProgress);

  onProgress?.({
    stage: "processing",
    progress: 5,
    message: "准备处理...",
  });

  // Run inpainting
  const result = await new Promise<ImageData>((resolve, reject) => {
    const handler = (event: MessageEvent) => {
      const { type, progress, result, error } = event.data;

      if (type === "result" && result) {
        worker?.removeEventListener("message", handler);
        resolve(result.imageData);
      } else if (type === "progress" && progress) {
        onProgress?.({
          stage: progress.stage,
          progress: progress.progress,
          message: progress.message,
        });
      } else if (type === "error") {
        worker?.removeEventListener("message", handler);
        reject(new Error(error));
      }
    };

    worker!.addEventListener("message", handler);
    worker!.postMessage({
      type: "inpaint",
      task: {
        imageData,
        maskData: maskImageData,
      },
    });
  });

  // Convert result to blob
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(result, 0, 0);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to create blob"))),
      "image/png"
    );
  });

  return {
    name: imageFile.name.replace(/\.[^/.]+$/, "") + "_inpainted.png",
    blob,
    width,
    height,
  };
}

/**
 * Check if the model is cached in IndexedDB
 */
export async function isModelCached(): Promise<boolean> {
  const cached = await getCachedModel();
  return cached !== null;
}

/**
 * Clear the cached model
 */
export async function clearModelCache(): Promise<void> {
  try {
    const db = await openModelDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(MODEL_KEY);
    terminateWorker();
  } catch {
    // Ignore
  }
}

/**
 * Terminate the worker
 */
export function terminateWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
  initPromise = null;
}
