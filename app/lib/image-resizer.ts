export type ResizeMode = "scale" | "dimensions";

export interface ResizeOptions {
  mode: ResizeMode;
  scale?: number; // percentage, e.g. 50 means 50%
  width?: number;
  height?: number;
  lockAspectRatio?: boolean;
}

export interface ResizeResult {
  blob: Blob;
  name: string;
  originalWidth: number;
  originalHeight: number;
  width: number;
  height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${file.name}`));
    img.src = URL.createObjectURL(file);
  });
}

function getOutputMimeType(file: File): string {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "image/jpeg";
  if (type === "image/webp") return "image/webp";
  return "image/png";
}

function getOutputExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  return ".png";
}

export function calculateDimensions(
  originalWidth: number,
  originalHeight: number,
  options: ResizeOptions
): { width: number; height: number } {
  const aspectRatio = originalWidth / originalHeight;

  if (options.mode === "scale") {
    const scale = (options.scale ?? 100) / 100;
    return {
      width: Math.round(originalWidth * scale),
      height: Math.round(originalHeight * scale),
    };
  }

  // dimensions mode
  let width = options.width;
  let height = options.height;

  if (options.lockAspectRatio !== false) {
    if (width && !height) {
      height = Math.round(width / aspectRatio);
    } else if (height && !width) {
      width = Math.round(height * aspectRatio);
    } else if (width && height) {
      // Use width as primary, calculate height
      height = Math.round(width / aspectRatio);
    }
  }

  return {
    width: width || originalWidth,
    height: height || originalHeight,
  };
}

export async function resizeImage(
  file: File,
  options: ResizeOptions
): Promise<ResizeResult> {
  const img = await loadImage(file);
  const originalWidth = img.naturalWidth;
  const originalHeight = img.naturalHeight;

  const { width, height } = calculateDimensions(
    originalWidth,
    originalHeight,
    options
  );

  // Create canvas and draw resized image
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // Use high quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(img, 0, 0, width, height);

  // Clean up object URL
  URL.revokeObjectURL(img.src);

  // Convert to blob
  const mimeType = getOutputMimeType(file);
  const quality = mimeType === "image/jpeg" ? 0.92 : undefined;

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error("Failed to create blob"));
      },
      mimeType,
      quality
    );
  });

  // Generate output filename
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const ext = getOutputExtension(mimeType);
  const name = `${baseName}_${width}x${height}${ext}`;

  return {
    blob,
    name,
    originalWidth,
    originalHeight,
    width,
    height,
  };
}

export async function resizeImages(
  files: File[],
  options: ResizeOptions,
  onProgress?: (current: number, total: number) => void
): Promise<ResizeResult[]> {
  const results: ResizeResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await resizeImage(files[i], options);
    results.push(result);
    onProgress?.(i + 1, files.length);
  }

  return results;
}

export async function getImageDimensions(
  file: File
): Promise<{ width: number; height: number }> {
  const img = await loadImage(file);
  const result = { width: img.naturalWidth, height: img.naturalHeight };
  URL.revokeObjectURL(img.src);
  return result;
}
