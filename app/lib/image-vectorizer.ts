// @ts-expect-error no type definitions for imagetracerjs
import ImageTracer from "imagetracerjs";

export type VectorizePreset =
  | "default"
  | "posterized1"
  | "posterized2"
  | "posterized3"
  | "curvy"
  | "sharp"
  | "detailed"
  | "smoothed"
  | "grayscale"
  | "fixedpalette"
  | "randomsampling1"
  | "randomsampling2"
  | "artistic1"
  | "artistic2"
  | "artistic3"
  | "artistic4";

export const PRESET_LABELS: Record<VectorizePreset, string> = {
  default: "默认",
  posterized1: "色块化 1",
  posterized2: "色块化 2",
  posterized3: "色块化 3",
  curvy: "曲线",
  sharp: "锐利",
  detailed: "精细",
  smoothed: "平滑",
  grayscale: "灰度",
  fixedpalette: "固定调色板",
  randomsampling1: "随机采样 1",
  randomsampling2: "随机采样 2",
  artistic1: "艺术风格 1",
  artistic2: "艺术风格 2",
  artistic3: "艺术风格 3",
  artistic4: "艺术风格 4",
};

export const PRESET_ORDER = Object.keys(
  PRESET_LABELS
) as readonly VectorizePreset[];

export function getNextVectorizePreset(
  currentPreset: string
): VectorizePreset {
  const currentIndex = PRESET_ORDER.indexOf(
    currentPreset as VectorizePreset
  );

  if (currentIndex === -1) {
    return PRESET_ORDER[0];
  }

  return PRESET_ORDER[(currentIndex + 1) % PRESET_ORDER.length];
}

export interface VectorizeOptions {
  preset?: VectorizePreset;
  numberofcolors?: number;
  ltres?: number;
  qtres?: number;
  scale?: number;
  strokewidth?: number;
}

export interface VectorizeResult {
  svgString: string;
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

function getImageData(img: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function buildOptions(opts: VectorizeOptions): Record<string, unknown> | string {
  if (
    opts.preset &&
    opts.numberofcolors === undefined &&
    opts.ltres === undefined &&
    opts.qtres === undefined &&
    opts.scale === undefined &&
    opts.strokewidth === undefined
  ) {
    return opts.preset;
  }

  const options: Record<string, unknown> = {};

  if (opts.preset) {
    const presetObj = ImageTracer.optionpresets[opts.preset];
    if (presetObj) Object.assign(options, presetObj);
  }

  if (opts.numberofcolors !== undefined) options.numberofcolors = opts.numberofcolors;
  if (opts.ltres !== undefined) options.ltres = opts.ltres;
  if (opts.qtres !== undefined) options.qtres = opts.qtres;
  if (opts.scale !== undefined) options.scale = opts.scale;
  if (opts.strokewidth !== undefined) options.strokewidth = opts.strokewidth;

  return options;
}

export async function vectorizeImage(
  file: File,
  options: VectorizeOptions
): Promise<VectorizeResult> {
  const img = await loadImage(file);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  const imageData = getImageData(img);

  URL.revokeObjectURL(img.src);

  const tracerOptions = buildOptions(options);
  const svgString: string = ImageTracer.imagedataToSVG(imageData, tracerOptions);

  const baseName = file.name.replace(/\.[^/.]+$/, "");
  const name = `${baseName}_vector.svg`;

  return { svgString, name, width, height };
}

export async function vectorizeImages(
  files: File[],
  options: VectorizeOptions,
  onProgress?: (current: number, total: number) => void
): Promise<VectorizeResult[]> {
  const results: VectorizeResult[] = [];

  for (let i = 0; i < files.length; i++) {
    const result = await vectorizeImage(files[i], options);
    results.push(result);
    onProgress?.(i + 1, files.length);
  }

  return results;
}
