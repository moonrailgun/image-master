"use client";

import { useEffect, useCallback, useState } from "react";
import { downloadSingle } from "../lib/download";

interface ImageInfo {
  width: number;
  height: number;
  size: number;
  type: string;
  aspectRatio: string;
  hasAlpha: boolean;
  colorSpace: string;
  bitDepth: number;
  memoryUsage: number;
}

interface ImageLightboxProps {
  src?: string;
  blob?: Blob;
  alt: string;
  onClose: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function calculateAspectRatio(width: number, height: number): string {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}:${height / divisor}`;
}

function detectImageProperties(img: HTMLImageElement): { hasAlpha: boolean; colorSpace: string; bitDepth: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  if (!ctx) {
    return { hasAlpha: false, colorSpace: "sRGB", bitDepth: 8 };
  }

  // Use a smaller sample size for large images to improve performance
  const maxSampleSize = 500;
  const scale = Math.min(1, maxSampleSize / Math.max(img.naturalWidth, img.naturalHeight));
  const sampleWidth = Math.floor(img.naturalWidth * scale);
  const sampleHeight = Math.floor(img.naturalHeight * scale);

  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  ctx.drawImage(img, 0, 0, sampleWidth, sampleHeight);

  const imageData = ctx.getImageData(0, 0, sampleWidth, sampleHeight);
  const data = imageData.data;

  // Check for alpha channel (any pixel with alpha < 255)
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) {
      hasAlpha = true;
      break;
    }
  }

  // Get color space from canvas context if available
  const attributes = ctx.getContextAttributes?.();
  const colorSpace = attributes?.colorSpace || "sRGB";

  // Bit depth is typically 8 for standard web images
  // 16-bit images are converted to 8-bit when drawn to canvas
  const bitDepth = 8;

  return { hasAlpha, colorSpace, bitDepth };
}

const INFO_PINNED_KEY = "imageLightbox.infoPinned";

export function ImageLightbox({ src, blob, alt, onClose }: ImageLightboxProps) {
  // Initialize infoPinned from localStorage
  const [infoPinned, setInfoPinned] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(INFO_PINNED_KEY) === "true";
    }
    return false;
  });
  const [showInfo, setShowInfo] = useState(infoPinned);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);

  // Persist infoPinned state to localStorage
  useEffect(() => {
    localStorage.setItem(INFO_PINNED_KEY, String(infoPinned));
    if (infoPinned) {
      setShowInfo(true);
    }
  }, [infoPinned]);

  // Create URL from blob using lazy initialization
  const [imageUrl] = useState(() => {
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return src || "";
  });

  // Note: We intentionally don't revoke the blob URL here
  // because React Strict Mode can cause double-mount issues
  // where the URL gets revoked before the image loads.
  // The URL will be cleaned up when the page is closed.

  // Load image info
  useEffect(() => {
    if (!imageUrl) return;

    const img = new Image();
    img.crossOrigin = "anonymous"; // Enable CORS for canvas operations
    img.onload = async () => {
      let size = 0;
      let type = "unknown";

      if (blob) {
        size = blob.size;
        type = blob.type || "unknown";
      } else if (src) {
        try {
          const response = await fetch(src);
          const fetchedBlob = await response.blob();
          size = fetchedBlob.size;
          type = fetchedBlob.type || "unknown";
        } catch {
          // Ignore fetch errors
        }
      }

      // Detect alpha channel and color space
      let properties = { hasAlpha: false, colorSpace: "sRGB", bitDepth: 8 };
      try {
        properties = detectImageProperties(img);
      } catch {
        // Fallback if canvas operations fail (e.g., CORS issues)
      }

      // Calculate memory usage: width × height × bytes per pixel
      // RGBA = 4 bytes, RGB = 3 bytes per pixel
      const bytesPerPixel = properties.hasAlpha ? 4 : 3;
      const memoryUsage = img.naturalWidth * img.naturalHeight * bytesPerPixel;

      setImageInfo({
        width: img.naturalWidth,
        height: img.naturalHeight,
        size,
        type,
        aspectRatio: calculateAspectRatio(img.naturalWidth, img.naturalHeight),
        hasAlpha: properties.hasAlpha,
        colorSpace: properties.colorSpace,
        bitDepth: properties.bitDepth,
        memoryUsage,
      });
    };
    img.src = imageUrl;
  }, [imageUrl, blob, src]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleDownload = useCallback(async () => {
    if (blob) {
      downloadSingle(blob, alt);
    } else if (src) {
      const response = await fetch(src);
      const imgBlob = await response.blob();
      downloadSingle(imgBlob, alt);
    }
  }, [blob, src, alt]);

  const handleShowInfo = useCallback(() => {
    setShowInfo(true);
  }, []);

  const handleHideInfo = useCallback(() => {
    if (!infoPinned) {
      setShowInfo(false);
    }
  }, [infoPinned]);

  const handleTogglePin = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (infoPinned) {
      setInfoPinned(false);
      setShowInfo(false);
    } else {
      setInfoPinned(true);
      setShowInfo(true);
    }
  }, [infoPinned]);

  if (!imageUrl) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Action buttons */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <div
          className="relative"
          onMouseEnter={handleShowInfo}
          onMouseLeave={handleHideInfo}
        >
          <button
            onClick={handleTogglePin}
            className={`rounded-full p-2 transition-colors ${
              infoPinned
                ? "bg-sky-600 text-white ring-2 ring-sky-400"
                : showInfo
                ? "bg-sky-600 text-white"
                : "bg-zinc-800/80 text-zinc-400 hover:bg-sky-600 hover:text-white"
            }`}
            title={infoPinned ? "点击关闭信息" : "点击固定信息"}
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>

          {/* Info panel */}
          {showInfo && imageInfo && (
            <div
              className="absolute right-0 top-10 w-64 pt-2 z-30"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="rounded-lg bg-zinc-900/95 p-4 text-sm shadow-xl backdrop-blur-sm">
              <h3 className="mb-3 flex items-center gap-2 font-semibold text-white">
                <svg className="h-4 w-4 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                图片信息
              </h3>
              <div className="space-y-2 text-zinc-300">
                <div className="flex items-center justify-between gap-8">
                  <span className="text-zinc-500">文件名</span>
                  <span className="max-w-[140px] truncate font-mono text-xs" title={alt}>
                    {alt}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-8">
                  <span className="text-zinc-500">尺寸</span>
                  <span className="font-mono text-xs">
                    {imageInfo.width} × {imageInfo.height} px
                  </span>
                </div>
                <div className="flex items-center justify-between gap-8">
                  <span className="text-zinc-500">宽高比</span>
                  <span className="font-mono text-xs">{imageInfo.aspectRatio}</span>
                </div>
                <div className="flex items-center justify-between gap-8">
                  <span className="text-zinc-500">文件大小</span>
                  <span className="font-mono text-xs">
                    {imageInfo.size > 0 ? formatFileSize(imageInfo.size) : "未知"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-8">
                  <span className="text-zinc-500">类型</span>
                  <span className="font-mono text-xs uppercase">
                    {imageInfo.type.replace("image/", "")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-8">
                  <span className="text-zinc-500">总像素</span>
                  <span className="font-mono text-xs">
                    {(imageInfo.width * imageInfo.height / 1000000).toFixed(2)} MP
                  </span>
                </div>
                <div className="group/tip relative flex items-center justify-between gap-8 cursor-help">
                  <span className="text-zinc-500">色彩空间</span>
                  <span className="font-mono text-xs">{imageInfo.colorSpace}</span>
                  <div className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
                    图片使用的颜色模型，sRGB 是网页标准色彩空间
                  </div>
                </div>
                <div className="group/tip relative flex items-center justify-between gap-8 cursor-help">
                  <span className="text-zinc-500">位深度</span>
                  <span className="font-mono text-xs">{imageInfo.bitDepth} bit</span>
                  <div className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
                    每个颜色通道使用的位数，位数越高颜色过渡越细腻
                  </div>
                </div>
                <div className="group/tip relative flex items-center justify-between gap-8 cursor-help">
                  <span className="text-zinc-500">透明通道</span>
                  <span className={`font-mono text-xs ${imageInfo.hasAlpha ? "text-emerald-400" : "text-zinc-500"}`}>
                    {imageInfo.hasAlpha ? "有" : "无"}
                  </span>
                  <div className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
                    是否包含 Alpha 通道，用于表示像素的透明度
                  </div>
                </div>
                <div className="group/tip relative flex items-center justify-between gap-8 cursor-help">
                  <span className="text-zinc-500">运行时内存</span>
                  <span className="font-mono text-xs text-amber-400">
                    {formatFileSize(imageInfo.memoryUsage)}
                  </span>
                  <div className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 w-48 rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300 opacity-0 shadow-lg transition-opacity group-hover/tip:opacity-100">
                    图片解码后在内存中占用的空间，计算方式：{imageInfo.width} × {imageInfo.height} × {imageInfo.hasAlpha ? 4 : 3} 字节
                  </div>
                </div>
              </div>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleDownload}
          className="rounded-full bg-zinc-800/80 p-2 text-zinc-400 transition-colors hover:bg-emerald-600 hover:text-white"
          title="下载图片"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="rounded-full bg-zinc-800/80 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
          title="关闭"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image container */}
      <div
        className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[20px_20px]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-[85vh] max-w-[85vw] object-contain"
        />
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm text-zinc-400">
        点击下载按钮保存图片 · 按 ESC 或点击背景关闭
      </div>
    </div>
  );
}
