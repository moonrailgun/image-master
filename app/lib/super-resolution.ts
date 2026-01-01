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
  /** Estimated time remaining in seconds */
  eta?: number;
  /** Elapsed time in seconds */
  elapsed?: number;
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}分${secs}秒`;
}

const DB_NAME = "image-master-models";
const DB_VERSION = 1;
const STORE_NAME = "onnx-models";
const TILE_SIZE = 64;

// Worker pool
const MAX_WORKERS =
  typeof navigator !== "undefined" && navigator.hardwareConcurrency
    ? Math.min(navigator.hardwareConcurrency, 8)
    : 2;

interface PooledWorker {
  id: number;
  worker: Worker;
  ready: boolean;
}

const workerPool: PooledWorker[] = [];
let workerIdCounter = 0;
let initPromise: Promise<void> | null = null;

function createWorker(): PooledWorker {
  const id = ++workerIdCounter;
  console.log(`[Worker Pool] Creating worker #${id}`);
  return {
    id,
    worker: new Worker(new URL("./super-resolution.worker.ts", import.meta.url)),
    ready: false,
  };
}

async function initWorkerPool(scale: ScaleFactor): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    console.log(`[Worker Pool] Initializing ${MAX_WORKERS} workers...`);

    // Create workers
    while (workerPool.length < MAX_WORKERS) {
      workerPool.push(createWorker());
    }

    // Init all workers in parallel
    await Promise.all(
      workerPool.map(
        (pooled) =>
          new Promise<void>((resolve, reject) => {
            const handler = (event: MessageEvent) => {
              if (event.data.type === "init-done") {
                pooled.ready = true;
                pooled.worker.removeEventListener("message", handler);
                console.log(`[Worker Pool] Worker #${pooled.id} ready`);
                resolve();
              } else if (event.data.type === "error") {
                pooled.worker.removeEventListener("message", handler);
                reject(new Error(event.data.error));
              }
            };
            pooled.worker.addEventListener("message", handler);
            pooled.worker.postMessage({ type: "init", scale });
          })
      )
    );

    console.log(`[Worker Pool] All ${MAX_WORKERS} workers initialized`);
  })();

  return initPromise;
}

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

interface TileTask {
  tileIndex: number;
  x: number;
  y: number;
  validWidth: number;
  validHeight: number;
}

interface TileResult {
  tileIndex: number;
  x: number;
  y: number;
  validWidth: number;
  validHeight: number;
  imageData: ImageData;
}

/**
 * Upscale image using parallel tile processing
 */
export async function upscaleImage(
  file: File,
  scale: ScaleFactor,
  onProgress?: (progress: UpscaleProgress) => void
): Promise<UpscaleResult> {
  const { imageData, width, height } = await loadImage(file);

  onProgress?.({
    stage: "processing",
    progress: 0,
    message: `准备并发处理 (${MAX_WORKERS}线程)...`,
  });

  // Initialize worker pool
  await initWorkerPool(scale);

  // Calculate tiles
  const tilesX = Math.ceil(width / TILE_SIZE);
  const tilesY = Math.ceil(height / TILE_SIZE);
  const totalTiles = tilesX * tilesY;

  const allTasks: TileTask[] = [];
  let tileIndex = 0;
  for (let tileY = 0; tileY < tilesY; tileY++) {
    for (let tileX = 0; tileX < tilesX; tileX++) {
      const x = tileX * TILE_SIZE;
      const y = tileY * TILE_SIZE;
      allTasks.push({
        tileIndex: tileIndex++,
        x,
        y,
        validWidth: Math.min(TILE_SIZE, width - x),
        validHeight: Math.min(TILE_SIZE, height - y),
      });
    }
  }

  console.log(`[Upscale] Processing ${totalTiles} tiles with ${MAX_WORKERS} workers`);

  // Distribute tiles to workers
  const tasksPerWorker = Math.ceil(allTasks.length / MAX_WORKERS);
  const workerTasks: TileTask[][] = [];
  for (let i = 0; i < MAX_WORKERS; i++) {
    workerTasks.push(allTasks.slice(i * tasksPerWorker, (i + 1) * tasksPerWorker));
  }

  // Create output canvas
  const outputWidth = width * scale;
  const outputHeight = height * scale;
  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d")!;

  // Time tracking for ETA
  const startTime = performance.now();
  let completedTiles = 0;

  const updateProgress = () => {
    const elapsed = (performance.now() - startTime) / 1000;
    const progress = (completedTiles / totalTiles) * 100;

    // Calculate ETA based on completed tiles
    let eta: number | undefined;
    let etaText = "";
    if (completedTiles > 0) {
      const avgTimePerTile = elapsed / completedTiles;
      const remainingTiles = totalTiles - completedTiles;
      eta = avgTimePerTile * remainingTiles;
      etaText = ` | 预计剩余 ${formatTime(eta)}`;
    }

    onProgress?.({
      stage: "processing",
      progress,
      message: `处理中... ${completedTiles}/${totalTiles} 块 (${MAX_WORKERS}线程)${etaText}`,
      eta,
      elapsed,
    });
  };

  // Process tiles in parallel
  await Promise.all(
    workerPool.map((pooled, workerIndex) => {
      const tasks = workerTasks[workerIndex];
      if (!tasks || tasks.length === 0) return Promise.resolve();

      return new Promise<void>((resolve, reject) => {
        let tasksDone = 0;

        const handler = (event: MessageEvent) => {
          const { type, tileResult, error } = event.data;

          if (type === "tile-result" && tileResult) {
            const result = tileResult as TileResult;

            // Draw tile to output canvas
            const tileCanvas = document.createElement("canvas");
            tileCanvas.width = result.imageData.width;
            tileCanvas.height = result.imageData.height;
            const tileCtx = tileCanvas.getContext("2d")!;
            tileCtx.putImageData(result.imageData, 0, 0);

            outputCtx.drawImage(
              tileCanvas,
              0,
              0,
              result.validWidth * scale,
              result.validHeight * scale,
              result.x * scale,
              result.y * scale,
              result.validWidth * scale,
              result.validHeight * scale
            );

            completedTiles++;
            tasksDone++;
            updateProgress();

            if (tasksDone >= tasks.length) {
              pooled.worker.removeEventListener("message", handler);
              resolve();
            }
          } else if (type === "error") {
            pooled.worker.removeEventListener("message", handler);
            reject(new Error(error || "Worker error"));
          }
        };

        pooled.worker.addEventListener("message", handler);
        pooled.worker.postMessage({
          type: "process-tiles",
          imageData,
          tiles: tasks,
        });
      });
    })
  );

  // Log total time
  const totalTime = (performance.now() - startTime) / 1000;
  console.log(`[Upscale] Completed in ${formatTime(totalTime)}`);

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

export async function isModelCached(scale: ScaleFactor): Promise<boolean> {
  const cached = await getCachedModel(scale);
  return cached !== null;
}

export async function clearModelCache(): Promise<void> {
  try {
    const db = await openModelDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    terminateWorkers();
  } catch {
    // Ignore
  }
}

export function terminateWorkers(): void {
  workerPool.forEach((p) => p.worker.terminate());
  workerPool.length = 0;
  initPromise = null;
}

export function getWorkerPoolInfo(): { maxWorkers: number; activeWorkers: number } {
  return {
    maxWorkers: MAX_WORKERS,
    activeWorkers: workerPool.filter((w) => w.ready).length,
  };
}
