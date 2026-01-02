export type FlipDirection = "horizontal" | "vertical";

export interface TransformOptions {
  rotateAngle?: number;  // 自定义旋转角度（度数）
  flip?: FlipDirection;  // 翻转方向
}

export interface TransformResult {
  blob: Blob;
  name: string;
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

function getTransformSuffix(options: TransformOptions): string {
  const parts: string[] = [];

  if (options.rotateAngle !== undefined && options.rotateAngle !== 0) {
    parts.push(`r${options.rotateAngle}`);
  }

  if (options.flip === "horizontal") {
    parts.push("fh");
  } else if (options.flip === "vertical") {
    parts.push("fv");
  }

  return parts.length > 0 ? "_" + parts.join("_") : "";
}

/**
 * 计算旋转后的画布尺寸
 */
function calculateRotatedDimensions(
  width: number,
  height: number,
  angleDegrees: number
): { width: number; height: number } {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angleRadians));
  const sin = Math.abs(Math.sin(angleRadians));

  const newWidth = Math.ceil(width * cos + height * sin);
  const newHeight = Math.ceil(width * sin + height * cos);

  return { width: newWidth, height: newHeight };
}

export async function transformImage(
  file: File,
  options: TransformOptions
): Promise<TransformResult> {
  const img = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;

  const rotateAngle = options.rotateAngle ?? 0;
  const angleRadians = (rotateAngle * Math.PI) / 180;

  // 计算旋转后的尺寸
  const rotatedDims = calculateRotatedDimensions(width, height, rotateAngle);
  const finalWidth = rotatedDims.width;
  const finalHeight = rotatedDims.height;

  // 创建画布
  const canvas = document.createElement("canvas");
  canvas.width = finalWidth;
  canvas.height = finalHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  // 启用高质量渲染
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // 移动到画布中心
  ctx.translate(finalWidth / 2, finalHeight / 2);

  // 应用旋转
  if (rotateAngle !== 0) {
    ctx.rotate(angleRadians);
  }

  // 应用翻转
  if (options.flip === "horizontal") {
    ctx.scale(-1, 1);
  } else if (options.flip === "vertical") {
    ctx.scale(1, -1);
  }

  // 绘制图像（居中）
  ctx.drawImage(img, -width / 2, -height / 2, width, height);

  // 清理 object URL
  URL.revokeObjectURL(img.src);

  // 转换为 blob
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

  // 生成输出文件名
  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const ext = getOutputExtension(mimeType);
  const suffix = getTransformSuffix(options);
  const name = `${baseName}${suffix}${ext}`;

  return {
    blob,
    name,
    width: finalWidth,
    height: finalHeight,
  };
}

export async function transformImages(
  files: File[],
  options: TransformOptions,
  onProgress?: (current: number, total: number) => void
): Promise<TransformResult[]> {
  const results: TransformResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await transformImage(files[i], options);
    results.push(result);
    onProgress?.(i + 1, files.length);
  }

  return results;
}
