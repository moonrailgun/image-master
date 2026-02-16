export interface SplitResult {
  name: string;
  blob: Blob;
  width: number;
  height: number;
}

export type SplitMode = "transparent" | "grid";

export interface GridOptions {
  columns: number;
  rows: number;
}

interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Split sprite sheet into individual sprites based on transparent gaps
 */
export async function splitSprites(
  file: File
): Promise<SplitResult[]> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const { width, height, data } = imageData;

  // Create visited array and labels array
  const labels = new Int32Array(width * height);
  let currentLabel = 0;

  // Connected component labeling using flood fill
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (labels[idx] === 0 && !isTransparent(data, idx)) {
        currentLabel++;
        floodFill(data, labels, width, height, x, y, currentLabel);
      }
    }
  }

  if (currentLabel === 0) {
    return [];
  }

  // Calculate bounding boxes for each label
  const boxes: Map<number, BoundingBox> = new Map();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const label = labels[y * width + x];
      if (label > 0) {
        const box = boxes.get(label) || {
          minX: x,
          minY: y,
          maxX: x,
          maxY: y,
        };
        box.minX = Math.min(box.minX, x);
        box.minY = Math.min(box.minY, y);
        box.maxX = Math.max(box.maxX, x);
        box.maxY = Math.max(box.maxY, y);
        boxes.set(label, box);
      }
    }
  }

  // Extract each sprite
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const results: SplitResult[] = [];
  let index = 1;

  // Sort boxes by position (top-left to bottom-right)
  const sortedBoxes = Array.from(boxes.entries()).sort((a, b) => {
    const rowDiff = Math.floor(a[1].minY / 50) - Math.floor(b[1].minY / 50);
    if (rowDiff !== 0) return rowDiff;
    return a[1].minX - b[1].minX;
  });

  for (const [, box] of sortedBoxes) {
    const spriteWidth = box.maxX - box.minX + 1;
    const spriteHeight = box.maxY - box.minY + 1;

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = spriteWidth;
    spriteCanvas.height = spriteHeight;
    const spriteCtx = spriteCanvas.getContext("2d")!;

    spriteCtx.drawImage(
      canvas,
      box.minX,
      box.minY,
      spriteWidth,
      spriteHeight,
      0,
      0,
      spriteWidth,
      spriteHeight
    );

    const blob = await canvasToBlob(spriteCanvas);
    results.push({
      name: `${baseName}_${index}.png`,
      blob,
      width: spriteWidth,
      height: spriteHeight,
    });
    index++;
  }

  return results;
}

function isTransparent(data: Uint8ClampedArray, pixelIndex: number): boolean {
  return data[pixelIndex * 4 + 3] === 0;
}

function floodFill(
  data: Uint8ClampedArray,
  labels: Int32Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  label: number
): void {
  const stack: [number, number][] = [[startX, startY]];
  const directions = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];

  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    const idx = y * width + x;

    if (
      x < 0 ||
      x >= width ||
      y < 0 ||
      y >= height ||
      labels[idx] !== 0 ||
      isTransparent(data, idx)
    ) {
      continue;
    }

    labels[idx] = label;

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

/**
 * Split sprite sheet into a uniform grid
 */
export async function splitSpritesGrid(
  file: File,
  options: GridOptions
): Promise<SplitResult[]> {
  const { columns, rows } = options;
  if (columns < 1 || rows < 1) return [];

  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const cellWidth = Math.floor(img.width / columns);
  const cellHeight = Math.floor(img.height / rows);
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const results: SplitResult[] = [];
  let index = 1;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = col * cellWidth;
      const y = row * cellHeight;
      const w = col === columns - 1 ? img.width - x : cellWidth;
      const h = row === rows - 1 ? img.height - y : cellHeight;

      const cellCanvas = document.createElement("canvas");
      cellCanvas.width = w;
      cellCanvas.height = h;
      const cellCtx = cellCanvas.getContext("2d")!;
      cellCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

      const blob = await canvasToBlob(cellCanvas);
      results.push({
        name: `${baseName}_${index}.png`,
        blob,
        width: w,
        height: h,
      });
      index++;
    }
  }

  return results;
}
