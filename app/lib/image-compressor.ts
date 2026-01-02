import imageCompression from "browser-image-compression";

export type OutputFormat = "original" | "jpeg" | "webp" | "png";

export interface CompressOptions {
  format: OutputFormat;
  quality: number; // 1-100
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
}

export interface CompressResult {
  blob: Blob;
  name: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  width: number;
  height: number;
}

const DEFAULT_OPTIONS: CompressOptions = {
  format: "original",
  quality: 80,
};

function getOriginalFormat(file: File): "jpeg" | "webp" | "png" {
  const type = file.type.toLowerCase();
  if (type === "image/jpeg" || type === "image/jpg") return "jpeg";
  if (type === "image/webp") return "webp";
  return "png";
}

function getMimeType(format: "jpeg" | "webp" | "png"): string {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    default:
      return "image/png";
  }
}

function getExtension(format: "jpeg" | "webp" | "png"): string {
  switch (format) {
    case "jpeg":
      return ".jpg";
    case "webp":
      return ".webp";
    default:
      return ".png";
  }
}

async function getImageDimensions(
  file: File | Blob
): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };
    img.src = URL.createObjectURL(file);
  });
}

export async function compressImage(
  file: File,
  options: Partial<CompressOptions> = {}
): Promise<CompressResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const originalFormat = getOriginalFormat(file);
  const targetFormat = opts.format === "original" ? originalFormat : opts.format;
  const mimeType = getMimeType(targetFormat);

  // Get original dimensions
  const originalDimensions = await getImageDimensions(file);

  // Compress using browser-image-compression
  const compressedFile = await imageCompression(file, {
    maxSizeMB: opts.maxSizeMB ?? 10,
    maxWidthOrHeight: opts.maxWidthOrHeight,
    initialQuality: opts.quality / 100,
    useWebWorker: true,
    fileType: mimeType,
    preserveExif: false,
  });

  // Get compressed dimensions
  const compressedDimensions = await getImageDimensions(compressedFile);

  const originalSize = file.size;
  const compressedSize = compressedFile.size;
  const compressionRatio =
    originalSize > 0 ? ((originalSize - compressedSize) / originalSize) * 100 : 0;

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const ext = getExtension(targetFormat);
  const name = `${baseName}_compressed${ext}`;

  return {
    blob: compressedFile,
    name,
    originalSize,
    compressedSize,
    compressionRatio,
    width: compressedDimensions.width,
    height: compressedDimensions.height,
  };
}

export async function compressImages(
  files: File[],
  options: Partial<CompressOptions> = {},
  onProgress?: (current: number, total: number) => void
): Promise<CompressResult[]> {
  const results: CompressResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await compressImage(files[i], options);
    results.push(result);
    onProgress?.(i + 1, files.length);
  }

  return results;
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const isNegative = bytes < 0;
  const absBytes = Math.abs(bytes);
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(absBytes) / Math.log(k));
  const formattedSize = `${parseFloat((absBytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  return isNegative ? `-${formattedSize}` : formattedSize;
}
