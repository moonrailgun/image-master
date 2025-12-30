export interface RemoveBackgroundOptions {
  tolerance: number; // 0-100
  contiguousOnly: boolean;
  targetColor?: { r: number; g: number; b: number };
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
  const { tolerance, contiguousOnly, targetColor } = options;

  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height, data } = imageData;

  // Get target color from top-left pixel if not specified
  const topLeftColor = {
    r: data[0],
    g: data[1],
    b: data[2],
  };
  const bgColor = targetColor ?? topLeftColor;

  // Max distance in RGB space is sqrt(255^2 * 3) ≈ 441.67
  const maxDistance = 441.67;
  const toleranceDistance = (tolerance / 100) * maxDistance;

  if (contiguousOnly) {
    // Flood fill from all edge pixels that match the target color
    const visited = new Uint8Array(width * height);

    // Top and bottom edges
    for (let x = 0; x < width; x++) {
      floodFillRemove(data, visited, width, height, x, 0, bgColor, toleranceDistance);
      floodFillRemove(data, visited, width, height, x, height - 1, bgColor, toleranceDistance);
    }
    // Left and right edges (skip corners already processed)
    for (let y = 1; y < height - 1; y++) {
      floodFillRemove(data, visited, width, height, 0, y, bgColor, toleranceDistance);
      floodFillRemove(data, visited, width, height, width - 1, y, bgColor, toleranceDistance);
    }
  } else {
    // Remove all matching pixels
    for (let i = 0; i < data.length; i += 4) {
      const pixelColor = { r: data[i], g: data[i + 1], b: data[i + 2] };
      if (colorDistance(pixelColor, bgColor) <= toleranceDistance) {
        data[i + 3] = 0; // Set alpha to 0
      }
    }
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
