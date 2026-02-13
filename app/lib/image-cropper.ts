/**
 * Image Cropper - Core cropping logic using Canvas API
 */

export interface CropArea {
  x: number;      // 左上角 x 坐标
  y: number;      // 左上角 y 坐标
  width: number;  // 裁剪宽度
  height: number; // 裁剪高度
}

export interface CropResult {
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Load an image file and return HTMLImageElement
 */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };

    img.src = url;
  });
}

/**
 * Crop an image file according to the specified crop area
 */
export async function cropImage(
  file: File,
  cropArea: CropArea
): Promise<CropResult> {
  const img = await loadImage(file);

  // Validate crop area
  const validX = Math.max(0, Math.min(cropArea.x, img.width));
  const validY = Math.max(0, Math.min(cropArea.y, img.height));
  const validWidth = Math.max(1, Math.min(cropArea.width, img.width - validX));
  const validHeight = Math.max(1, Math.min(cropArea.height, img.height - validY));

  // Create canvas for cropping
  const canvas = document.createElement("canvas");
  canvas.width = validWidth;
  canvas.height = validHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Draw the cropped portion
  ctx.drawImage(
    img,
    validX,
    validY,
    validWidth,
    validHeight,
    0,
    0,
    validWidth,
    validHeight
  );

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve({
            blob,
            width: validWidth,
            height: validHeight,
          });
        } else {
          reject(new Error("Failed to create blob from canvas"));
        }
      },
      "image/png",
      1.0
    );
  });
}

/**
 * Create a File object from a Blob with a given filename
 */
export function blobToFile(blob: Blob, originalName: string): File {
  const extension = originalName.split(".").pop()?.toLowerCase();
  const baseName = originalName.replace(/\.[^/.]+$/, "");
  const newName = `${baseName}_cropped.${extension === "png" ? "png" : "png"}`;

  return new File([blob], newName, { type: "image/png" });
}

/**
 * Clamp a value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Calculate initial crop area (centered, 80% of image)
 */
export function getInitialCropArea(
  imageWidth: number,
  imageHeight: number
): CropArea {
  const cropWidth = Math.round(imageWidth * 0.8);
  const cropHeight = Math.round(imageHeight * 0.8);
  const x = Math.round((imageWidth - cropWidth) / 2);
  const y = Math.round((imageHeight - cropHeight) / 2);

  return { x, y, width: cropWidth, height: cropHeight };
}

/**
 * Get ImageData from an image File via offscreen canvas
 */
export async function getImageDataFromFile(file: File): Promise<ImageData> {
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, img.width, img.height);
}

/**
 * Scan pixel alpha channel to find bounding box of non-transparent content,
 * then return a CropArea with optional padding.
 * Returns null if the image is fully transparent.
 */
export function getTrimTransparentArea(
  imageData: ImageData,
  padding: number = 0
): CropArea | null {
  const { width, height, data } = imageData;
  const safePadding = Math.max(0, Math.round(padding));

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const alpha = data[(y * width + x) * 4 + 3];
      if (alpha > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fully transparent image
  if (maxX < 0) {
    return null;
  }

  // Apply padding and clamp to image bounds
  const cropX = clamp(minX - safePadding, 0, width - 1);
  const cropY = clamp(minY - safePadding, 0, height - 1);
  const cropRight = clamp(maxX + safePadding, 0, width - 1);
  const cropBottom = clamp(maxY + safePadding, 0, height - 1);

  return {
    x: cropX,
    y: cropY,
    width: cropRight - cropX + 1,
    height: cropBottom - cropY + 1,
  };
}
