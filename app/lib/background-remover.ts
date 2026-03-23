export interface RemoveBackgroundOptions {
  tolerance: number; // 0-100
  contiguousOnly: boolean;
  targetColor?: { r: number; g: number; b: number };
  feather?: number; // 0-20 pixels
  antiAlias?: boolean;
  seedPoints?: { x: number; y: number }[];
}

export type AIModel = "isnet" | "isnet_fp16" | "isnet_quint8";

export interface AIRemoveBackgroundOptions {
  model: AIModel;
  onProgress?: (phase: string, progress: number) => void;
}

export interface RemoveResult {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Remove background color from image
 */
export async function removeBackground(
  file: File,
  options: RemoveBackgroundOptions
): Promise<RemoveResult> {
  const {
    tolerance,
    contiguousOnly,
    targetColor,
    feather = 0,
    antiAlias = true,
    seedPoints,
  } = options;

  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height, data } = imageData;

  const topLeftColor = {
    r: data[0],
    g: data[1],
    b: data[2],
  };
  const bgColor = targetColor ?? topLeftColor;

  const maxDistance = 441.67;
  const toleranceDistance = (tolerance / 100) * maxDistance;

  const visited = new Uint8Array(width * height);

  if (contiguousOnly) {
    for (let x = 0; x < width; x++) {
      floodFillRemove(
        data, visited, width, height, x, 0, bgColor, toleranceDistance
      );
      floodFillRemove(
        data, visited, width, height, x, height - 1, bgColor, toleranceDistance
      );
    }
    for (let y = 1; y < height - 1; y++) {
      floodFillRemove(
        data, visited, width, height, 0, y, bgColor, toleranceDistance
      );
      floodFillRemove(
        data, visited, width, height, width - 1, y, bgColor, toleranceDistance
      );
    }
  } else {
    if (antiAlias) {
      const innerT = toleranceDistance * 0.85;
      const outerT = toleranceDistance * 1.15;
      for (let i = 0; i < data.length; i += 4) {
        const dist = colorDistance(
          { r: data[i], g: data[i + 1], b: data[i + 2] },
          bgColor
        );
        if (dist <= innerT) {
          data[i + 3] = 0;
          visited[i / 4] = 1;
        } else if (dist < outerT) {
          const t = (dist - innerT) / (outerT - innerT);
          const smooth = t * t * (3 - 2 * t);
          data[i + 3] = Math.round(data[i + 3] * smooth);
        }
      }
    } else {
      for (let i = 0; i < data.length; i += 4) {
        if (
          colorDistance(
            { r: data[i], g: data[i + 1], b: data[i + 2] },
            bgColor
          ) <= toleranceDistance
        ) {
          data[i + 3] = 0;
          visited[i / 4] = 1;
        }
      }
    }
  }

  if (seedPoints && seedPoints.length > 0) {
    for (const pt of seedPoints) {
      if (pt.x < 0 || pt.x >= width || pt.y < 0 || pt.y >= height) continue;
      const seedIdx = (pt.y * width + pt.x) * 4;
      const seedColor = {
        r: data[seedIdx],
        g: data[seedIdx + 1],
        b: data[seedIdx + 2],
      };
      floodFillRemove(
        data, visited, width, height, pt.x, pt.y, seedColor, toleranceDistance
      );
    }
  }

  if (antiAlias) {
    applyBoundarySoftening(
      data, visited, width, height, bgColor, toleranceDistance
    );
    gaussianBlurAlpha(data, width, height, 0.8);
  }

  if (feather > 0) {
    applyFeather(data, width, height, feather);
  }

  ctx.putImageData(imageData, 0, 0);

  const blob = await canvasToBlob(canvas);
  return {
    name: file.name.replace(/\.[^/.]+$/, "") + ".png",
    blob,
    width: canvas.width,
    height: canvas.height,
  };
}

/**
 * Get pixel color at position from image file
 */
export async function getPixelColor(
  file: File,
  x: number,
  y: number
): Promise<{ r: number; g: number; b: number }> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const pixel = ctx.getImageData(x, y, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

function colorDistance(
  c1: { r: number; g: number; b: number },
  c2: { r: number; g: number; b: number }
): number {
  const dr = c1.r - c2.r;
  const dg = c1.g - c2.g;
  const db = c1.b - c2.b;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Apply feather effect to smooth edges between transparent and opaque areas
 */
function applyFeather(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): void {
  // Extract alpha channel
  const alpha = new Float32Array(width * height);
  for (let i = 0; i < alpha.length; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  // Calculate distance from each opaque pixel to nearest transparent pixel
  const distance = new Float32Array(width * height);
  distance.fill(Infinity);

  // Initialize edge pixels with distance 0
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] === 0) {
      distance[i] = 0;
    }
  }

  // Multi-pass distance transform (approximation)
  const passes = Math.ceil(radius * 1.5);
  for (let pass = 0; pass < passes; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (distance[idx] === 0) continue;

        let minDist = distance[idx];
        // Check 8-connected neighbors
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborDist = distance[ny * width + nx];
              const stepDist = dx !== 0 && dy !== 0 ? 1.414 : 1;
              minDist = Math.min(minDist, neighborDist + stepDist);
            }
          }
        }
        distance[idx] = minDist;
      }
    }
    // Reverse pass for better accuracy
    for (let y = height - 1; y >= 0; y--) {
      for (let x = width - 1; x >= 0; x--) {
        const idx = y * width + x;
        if (distance[idx] === 0) continue;

        let minDist = distance[idx];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const neighborDist = distance[ny * width + nx];
              const stepDist = dx !== 0 && dy !== 0 ? 1.414 : 1;
              minDist = Math.min(minDist, neighborDist + stepDist);
            }
          }
        }
        distance[idx] = minDist;
      }
    }
  }

  // Apply feather based on distance
  for (let i = 0; i < alpha.length; i++) {
    if (alpha[i] > 0 && distance[i] < radius) {
      // Smooth falloff using cosine interpolation
      const t = distance[i] / radius;
      const falloff = (1 - Math.cos(t * Math.PI)) / 2;
      data[i * 4 + 3] = Math.round(alpha[i] * falloff);
    }
  }
}

/**
 * Smooth the boundary between flood-fill-removed region and foreground
 * using distance transform + color distance for soft alpha transition.
 */
function applyBoundarySoftening(
  data: Uint8ClampedArray,
  visited: Uint8Array,
  width: number,
  height: number,
  bgColor: { r: number; g: number; b: number },
  toleranceDistance: number
): void {
  const len = width * height;
  const band = 2.5;
  const outerTolerance = toleranceDistance * 1.5;

  const distToRemoved = new Float32Array(len);
  distToRemoved.fill(999);
  for (let i = 0; i < len; i++) {
    if (visited[i]) distToRemoved[i] = 0;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (distToRemoved[i] === 0) continue;
      if (x > 0)
        distToRemoved[i] = Math.min(distToRemoved[i], distToRemoved[i - 1] + 1);
      if (y > 0)
        distToRemoved[i] = Math.min(
          distToRemoved[i],
          distToRemoved[(y - 1) * width + x] + 1
        );
      if (x > 0 && y > 0)
        distToRemoved[i] = Math.min(
          distToRemoved[i],
          distToRemoved[(y - 1) * width + x - 1] + 1.414
        );
      if (x < width - 1 && y > 0)
        distToRemoved[i] = Math.min(
          distToRemoved[i],
          distToRemoved[(y - 1) * width + x + 1] + 1.414
        );
    }
  }

  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (distToRemoved[i] === 0) continue;
      if (x < width - 1)
        distToRemoved[i] = Math.min(distToRemoved[i], distToRemoved[i + 1] + 1);
      if (y < height - 1)
        distToRemoved[i] = Math.min(
          distToRemoved[i],
          distToRemoved[(y + 1) * width + x] + 1
        );
      if (x < width - 1 && y < height - 1)
        distToRemoved[i] = Math.min(
          distToRemoved[i],
          distToRemoved[(y + 1) * width + x + 1] + 1.414
        );
      if (x > 0 && y < height - 1)
        distToRemoved[i] = Math.min(
          distToRemoved[i],
          distToRemoved[(y + 1) * width + x - 1] + 1.414
        );
    }
  }

  for (let i = 0; i < len; i++) {
    if (visited[i]) continue;
    if (distToRemoved[i] > band) continue;

    const pixelIdx = i * 4;
    const dist = colorDistance(
      { r: data[pixelIdx], g: data[pixelIdx + 1], b: data[pixelIdx + 2] },
      bgColor
    );

    if (dist >= outerTolerance) continue;

    const spatialT = distToRemoved[i] / band;
    const colorT = dist / outerTolerance;
    const t = Math.max(spatialT, colorT);
    const smooth = t * t * (3 - 2 * t);

    data[pixelIdx + 3] = Math.round(data[pixelIdx + 3] * smooth);
  }
}

/**
 * Separable Gaussian blur applied only to the alpha channel.
 * Smooths staircase artifacts at transparent/opaque boundaries.
 */
function gaussianBlurAlpha(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  sigma: number
): void {
  if (sigma <= 0) return;

  const radius = Math.ceil(sigma * 2.5);
  const kernelSize = radius * 2 + 1;
  const kernel = new Float32Array(kernelSize);

  let sum = 0;
  for (let i = 0; i < kernelSize; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < kernelSize; i++) {
    kernel[i] /= sum;
  }

  const len = width * height;
  const alpha = new Float32Array(len);
  const temp = new Float32Array(len);

  for (let i = 0; i < len; i++) {
    alpha[i] = data[i * 4 + 3];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sx = Math.min(Math.max(x + k, 0), width - 1);
        val += alpha[y * width + sx] * kernel[k + radius];
      }
      temp[y * width + x] = val;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let val = 0;
      for (let k = -radius; k <= radius; k++) {
        const sy = Math.min(Math.max(y + k, 0), height - 1);
        val += temp[sy * width + x] * kernel[k + radius];
      }
      data[(y * width + x) * 4 + 3] = Math.round(
        Math.max(0, Math.min(255, val))
      );
    }
  }
}

function floodFillRemove(
  data: Uint8ClampedArray,
  visited: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  bgColor: { r: number; g: number; b: number },
  toleranceDistance: number
): void {
  const stack: [number, number][] = [[startX, startY]];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      continue;
    }

    const idx = y * width + x;
    if (visited[idx]) {
      continue;
    }

    const pixelIdx = idx * 4;
    const pixelColor = {
      r: data[pixelIdx],
      g: data[pixelIdx + 1],
      b: data[pixelIdx + 2],
    };

    if (colorDistance(pixelColor, bgColor) > toleranceDistance) {
      continue;
    }

    visited[idx] = 1;
    data[pixelIdx + 3] = 0; // Set alpha to 0

    for (const [dx, dy] of directions) {
      stack.push([x + dx, y + dy]);
    }
  }
}

/**
 * AI-powered background removal using @imgly/background-removal
 */
export async function aiRemoveBackground(
  file: File,
  options: AIRemoveBackgroundOptions
): Promise<RemoveResult> {
  const { removeBackground: imglyRemoveBackground } = await import(
    "@imgly/background-removal"
  );

  const { model, onProgress } = options;

  onProgress?.("init", 0);

  const blob = await imglyRemoveBackground(file, {
    model,
    progress: (key: string, current: number, total: number) => {
      const ratio = total > 0 ? current / total : 0;
      if (key.includes("fetch:")) {
        onProgress?.("download", ratio);
      } else if (key === "compute:inference") {
        onProgress?.("inference", ratio);
      } else {
        onProgress?.("processing", ratio);
      }
    },
  });

  const resultBlob = blob instanceof Blob ? blob : new Blob([blob], { type: "image/png" });

  // Get dimensions from the result
  const img = await loadImageFromBlob(resultBlob);
  return {
    name: file.name.replace(/\.[^/.]+$/, "") + ".png",
    blob: resultBlob,
    width: img.width,
    height: img.height,
  };
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to create blob"));
    }, "image/png");
  });
}
