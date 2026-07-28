"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { ImageCompare } from "./ImageCompare";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  vectorizeImages,
  VectorizeOptions,
  VectorizeResult,
  VectorizePreset,
  PRESET_LABELS,
} from "../lib/image-vectorizer";
import { downloadAsZip, downloadSingle } from "../lib/download";
import type { TransferData } from "../types";

type SvgViewMode = "compare" | "sideBySide" | "svgOnly";
type SvgBackground = "white" | "dark" | "checkerboard";

interface FilePreview {
  file: File;
  url: string;
}

interface ImageVectorizerProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onSendToTransform?: (files: File[]) => void;
  onSendToInpaint?: (files: File[]) => void;
  onSendToCrop?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

function svgToBlob(svgString: string): Blob {
  return new Blob([svgString], { type: "image/svg+xml" });
}

function formatSvg(raw: string): string {
  // Normalize to single line first, then re-indent
  let s = raw.replace(/>\s+</g, "><").trim();
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    const open = s.indexOf("<", i);
    if (open === -1) {
      tokens.push(s.slice(i));
      break;
    }
    if (open > i) tokens.push(s.slice(i, open)); // text node
    const close = s.indexOf(">", open);
    if (close === -1) {
      tokens.push(s.slice(i));
      break;
    }
    tokens.push(s.slice(open, close + 1));
    i = close + 1;
  }

  const lines: string[] = [];
  let depth = 0;
  for (const tok of tokens) {
    const trimmed = tok.trim();
    if (!trimmed) continue;
    if (!trimmed.startsWith("<")) {
      // text content
      lines.push("  ".repeat(depth) + trimmed);
      continue;
    }
    const isSelfClosing = trimmed.endsWith("/>") || trimmed.startsWith("<?") || trimmed.startsWith("<!");
    const isClosing = trimmed.startsWith("</");
    if (isClosing) depth = Math.max(0, depth - 1);
    lines.push("  ".repeat(depth) + trimmed);
    if (!isClosing && !isSelfClosing) depth++;
  }
  return lines.join("\n");
}

async function svgToPngBlob(
  svgString: string,
  width: number,
  height: number
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([svgString], { type: "image/svg+xml" });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("Failed to get canvas context"));
      }
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create PNG blob"));
        },
        "image/png"
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load SVG for PNG conversion"));
    };
    img.src = url;
  });
}

export function ImageVectorizer({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onSendToUpscale,
  onSendToResize,
  onSendToCompress,
  onSendToTransform,
  onSendToInpaint,
  onSendToCrop,
  onHasFilesChange,
  isActive = true,
}: ImageVectorizerProps) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<VectorizeResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // Vectorize options
  const [preset, setPreset] = useState<VectorizePreset>("posterized2");
  const [numberOfColors, setNumberOfColors] = useState(16);
  const [ltres, setLtres] = useState(1);
  const [qtres, setQtres] = useState(1);
  const [scale, setScale] = useState(1);
  const [strokeWidth, setStrokeWidth] = useState(1);
  const [useCustomOptions, setUseCustomOptions] = useState(false);

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  // Handle incoming transfer
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (
      pendingTransfer &&
      pendingTransfer.files.length > 0 &&
      pendingTransfer !== lastTransferRef.current
    ) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        setFiles(pendingTransfer.files);
        setResults([]);
        onTransferConsumed?.();
      });
    }
  }, [pendingTransfer, onTransferConsumed]);

  const previews = useMemo(() => {
    return files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }, [files]);

  const prevPreviewsRef = useRef<FilePreview[]>([]);
  useEffect(() => {
    const prevPreviews = prevPreviewsRef.current;
    prevPreviewsRef.current = previews;
    return () => {
      prevPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [previews]);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults([]);
  }, []);

  const handleVectorize = useCallback(async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress({ current: 0, total: files.length });

    try {
      const options: VectorizeOptions = {
        preset,
      };

      if (useCustomOptions) {
        options.numberofcolors = numberOfColors;
        options.ltres = ltres;
        options.qtres = qtres;
        options.scale = scale;
        options.strokewidth = strokeWidth;
      }

      const newResults = await vectorizeImages(
        files,
        options,
        (current, total) => {
          setProgress({ current, total });
        }
      );

      setResults(newResults);
      setResultsVersion((v) => v + 1);
      showToast(`成功矢量化 ${newResults.length} 张图片`, "success");
    } catch (error) {
      console.error("Vectorize failed:", error);
      showToast(
        `矢量化失败: ${error instanceof Error ? error.message : "未知错误"}`,
        "error"
      );
    } finally {
      setProcessing(false);
    }
  }, [
    files,
    preset,
    useCustomOptions,
    numberOfColors,
    ltres,
    qtres,
    scale,
    strokeWidth,
    showToast,
  ]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      const blob = svgToBlob(results[0].svgString);
      downloadSingle(blob, results[0].name);
    } else {
      const items = results.map((r) => ({
        name: r.name,
        blob: svgToBlob(r.svgString),
      }));
      await downloadAsZip(items, "vectorized-images.zip");
    }
  }, [results]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
  }, []);

  const makeSendToHandler = useCallback(
    (sendFn: ((files: File[]) => void) | undefined) => {
      if (!sendFn) return undefined;
      return async () => {
        const pngFiles = await Promise.all(
          results.map(async (r) => {
            const pngBlob = await svgToPngBlob(r.svgString, r.width, r.height);
            const pngName = r.name.replace(/\.svg$/, ".png");
            return new File([pngBlob], pngName, { type: "image/png" });
          })
        );
        sendFn(pngFiles);
      };
    },
    [results]
  );

  // View mode & background for SVG results
  const [viewMode, setViewMode] = useState<SvgViewMode>("compare");
  const [svgBackground, setSvgBackground] = useState<SvgBackground>("white");

  const hasFiles = files.length > 0;

  if (!hasFiles) {
    return (
      <div className="flex flex-col gap-6">
        <ImageDropzone
          onFilesSelected={handleFilesSelected}
          pasteEnabled={isActive}
        />
        {lightboxImage && (
          <ImageLightbox
            src={lightboxImage.src}
            blob={lightboxImage.blob}
            alt={lightboxImage.alt}
            onClose={() => setLightboxImage(null)}
          />
        )}
      </div>
    );
  }

  const progressPercent =
    progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  const sendToItems = [
    onSendToSprite && {
      label: "发送到精灵图拆分",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToSprite)!,
    },
    onSendToBackground && {
      label: "发送到背景扣除",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToBackground)!,
    },
    onSendToUpscale && {
      label: "发送到超分放大",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToUpscale)!,
    },
    onSendToResize && {
      label: "发送到尺寸调整",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToResize)!,
    },
    onSendToCompress && {
      label: "发送到图片压缩",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToCompress)!,
    },
    onSendToTransform && {
      label: "发送到旋转翻转",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToTransform)!,
    },
    onSendToInpaint && {
      label: "发送到图片修复",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToInpaint)!,
    },
    onSendToCrop && {
      label: "发送到图片裁剪",
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4v16h16M7 20V8m0 0h12" />
        </svg>
      ),
      onClick: makeSendToHandler(onSendToCrop)!,
    },
  ].filter(Boolean) as { label: string; icon: React.ReactNode; onClick: () => void }[];

  return (
    <div className="flex flex-col gap-6">
      {/* Top row: source preview + settings (side by side) */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        {/* Source preview */}
        <div className="rounded-xl bg-zinc-800/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-300">
              原图预览 ({files.length} 张)
            </span>
            <button
              onClick={handleClear}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              清除
            </button>
          </div>
          <div className="flex flex-wrap gap-3">
            {previews.map((preview, i) => (
              <div
                key={i}
                className="group relative cursor-pointer overflow-hidden"
                onClick={() =>
                  setLightboxImage({
                    src: preview.url,
                    alt: preview.file.name,
                  })
                }
              >
                <div className="overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] transition-all hover:border-emerald-500/50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.url}
                    alt={preview.file.name}
                    className="h-20 w-20 object-contain"
                  />
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg
                    className="h-6 w-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
                    />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Compact settings panel */}
        <div className="rounded-xl bg-zinc-800/50 p-4 lg:w-72">
          <span className="mb-3 block text-sm font-medium text-zinc-300">
            矢量化设置
          </span>

          {/* Preset */}
          <div className="mb-3">
            <label className="mb-1.5 block text-xs text-zinc-500">预设风格</label>
            <select
              value={preset}
              onChange={(e) => setPreset(e.target.value as VectorizePreset)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              {Object.entries(PRESET_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Custom options toggle */}
          <div className="mb-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={useCustomOptions}
                onChange={(e) => setUseCustomOptions(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-xs text-zinc-500">自定义参数</span>
            </label>
          </div>

          {useCustomOptions && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>颜色数量</span>
                  <span className="text-emerald-400">{numberOfColors}</span>
                </label>
                <input type="range" min={2} max={32} step={1} value={numberOfColors} onChange={(e) => setNumberOfColors(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>线条阈值</span>
                  <span className="text-emerald-400">{ltres}</span>
                </label>
                <input type="range" min={0.1} max={10} step={0.1} value={ltres} onChange={(e) => setLtres(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>曲线阈值</span>
                  <span className="text-emerald-400">{qtres}</span>
                </label>
                <input type="range" min={0.1} max={10} step={0.1} value={qtres} onChange={(e) => setQtres(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>缩放倍数</span>
                  <span className="text-emerald-400">{scale}x</span>
                </label>
                <input type="range" min={1} max={10} step={1} value={scale} onChange={(e) => setScale(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <label className="mb-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>描边宽度</span>
                  <span className="text-emerald-400">{strokeWidth}</span>
                </label>
                <input type="range" min={0} max={5} step={0.5} value={strokeWidth} onChange={(e) => setStrokeWidth(Number(e.target.value))} className="w-full" />
              </div>
            </div>
          )}

          {/* Execute button */}
          <button
            onClick={handleVectorize}
            disabled={processing}
            className="mt-3 w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {processing ? "矢量化中..." : "开始矢量化"}
          </button>

          {processing && (
            <div className="mt-3 flex items-center justify-center gap-2 rounded-lg bg-zinc-900/50 p-2">
              <svg className="h-4 w-4 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span className="text-xs text-zinc-400">
                {progress.current}/{progress.total}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Full-width results section */}
      <div className="rounded-xl bg-zinc-800/50 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium text-zinc-300">
            矢量化结果
            {results.length > 0 && (
              <span className="ml-2 text-emerald-400">
                ({results.length} 张)
              </span>
            )}
          </span>

          {results.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              {/* View mode toggle */}
              <div className="flex rounded-lg border border-zinc-700 p-0.5">
                <button
                  onClick={() => setViewMode("compare")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === "compare"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="对比滑块"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
                  </svg>
                  对比
                </button>
                <button
                  onClick={() => setViewMode("sideBySide")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === "sideBySide"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="并排对比"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
                  </svg>
                  并排
                </button>
                <button
                  onClick={() => setViewMode("svgOnly")}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                    viewMode === "svgOnly"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="仅矢量图"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  矢量
                </button>
              </div>

              {/* Background toggle */}
              <div className="flex rounded-lg border border-zinc-700 p-0.5">
                <button
                  onClick={() => setSvgBackground("white")}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    svgBackground === "white"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="白色背景"
                >
                  <span className="inline-block h-3 w-3 rounded-sm border border-zinc-500 bg-white" />
                </button>
                <button
                  onClick={() => setSvgBackground("dark")}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    svgBackground === "dark"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="深色背景"
                >
                  <span className="inline-block h-3 w-3 rounded-sm border border-zinc-500 bg-zinc-900" />
                </button>
                <button
                  onClick={() => setSvgBackground("checkerboard")}
                  className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                    svgBackground === "checkerboard"
                      ? "bg-zinc-600 text-white"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                  title="棋盘格背景"
                >
                  <span className="inline-block h-3 w-3 rounded-sm border border-zinc-500 bg-[repeating-conic-gradient(#ccc_0%_25%,#fff_0%_50%)] bg-size-[6px_6px]" />
                </button>
              </div>

              {/* Download & send-to */}
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                {results.length === 1 ? "下载 SVG" : "下载 ZIP"}
              </button>
              {sendToItems.length > 0 && (
                <DropdownMenu items={sendToItems} />
              )}
            </div>
          )}
        </div>

        {processing ? (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-4">
            <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-zinc-700">
              <div
                className="h-full bg-emerald-500 transition-all duration-200"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-sm text-zinc-400">
              正在矢量化 {progress.current}/{progress.total}...
            </p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[200px] items-center justify-center text-zinc-600">
            <p>调整参数后点击「开始矢量化」</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {results.map((result, i) => (
              <SvgResultPreview
                key={`${resultsVersion}-${i}`}
                result={result}
                originalFile={files[i]}
                originalPreview={previews[i]?.url}
                persistKey={`image-vectorizer-${i}`}
                viewMode={viewMode}
                background={svgBackground}
                onZoom={(info, alt) => setLightboxImage({ ...info, alt })}
              />
            ))}
          </div>
        )}
      </div>

      {lightboxImage && (
        <ImageLightbox
          src={lightboxImage.src}
          blob={lightboxImage.blob}
          alt={lightboxImage.alt}
          onClose={() => setLightboxImage(null)}
        />
      )}
    </div>
  );
}

// ─── SVG Result Preview ───

const BG_CLASS: Record<SvgBackground, string> = {
  white: "bg-white",
  dark: "bg-zinc-900",
  checkerboard:
    "bg-[repeating-conic-gradient(#e5e5e5_0%_25%,#fff_0%_50%)] bg-size-[16px_16px]",
};

function SvgResultPreview({
  result,
  originalFile,
  originalPreview,
  persistKey,
  viewMode,
  background,
  onZoom,
}: {
  result: VectorizeResult;
  originalFile?: File;
  originalPreview?: string;
  persistKey: string;
  viewMode: SvgViewMode;
  background: SvgBackground;
  onZoom: (info: { blob?: Blob; src?: string }, alt: string) => void;
}) {
  const svgBlob = useMemo(() => svgToBlob(result.svgString), [result.svgString]);
  const svgDataUrl = useMemo(
    () => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(result.svgString)}`,
    [result.svgString]
  );
  const [showCode, setShowCode] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const svgSizeKb = (result.svgString.length / 1024).toFixed(1);
  const originalSizeKb = originalFile
    ? (originalFile.size / 1024).toFixed(1)
    : null;

  const formattedSvg = useMemo(() => formatSvg(result.svgString), [result.svgString]);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formattedSvg);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = formattedSvg;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }, [formattedSvg]);

  const bgClass = BG_CLASS[background];

  return (
    <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-3">
      {/* Header: filename, size info */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-zinc-400">
          {result.name}
        </span>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <span>{result.width}&times;{result.height}</span>
          {originalSizeKb && (
            <span className="flex items-center gap-1">
              <span className="text-zinc-500">{originalSizeKb} KB</span>
              <svg className="h-3 w-3 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="font-medium text-emerald-400">{svgSizeKb} KB</span>
            </span>
          )}
          {!originalSizeKb && <span>{svgSizeKb} KB</span>}
        </div>
      </div>

      {/* Image display area — full width, no height cap */}
      {viewMode === "compare" && originalPreview ? (
        <div className={`overflow-hidden rounded-lg border border-zinc-700 ${bgClass}`}>
          <ImageCompare
            persistKey={persistKey}
            beforeSrc={originalPreview}
            afterBlob={svgBlob}
            beforeAlt="原图"
            afterAlt="矢量图"
          />
        </div>
      ) : viewMode === "sideBySide" ? (
        <div className="grid grid-cols-2 gap-4">
          {originalPreview && (
            <div>
              <p className="mb-1.5 text-center text-xs text-zinc-500">原图</p>
              <div
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] transition-all hover:border-emerald-500/50"
                onClick={() => onZoom({ src: originalPreview }, result.name.replace(/_vector\.svg$/, ""))}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={originalPreview}
                  alt="original"
                  className="w-full object-contain"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                  </svg>
                </div>
              </div>
            </div>
          )}
          <div>
            <p className="mb-1.5 text-center text-xs text-zinc-500">矢量图</p>
            <div
              className={`group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-700 transition-all hover:border-emerald-500/50 ${bgClass}`}
              onClick={() => onZoom({ blob: svgBlob }, result.name)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={svgDataUrl}
                alt={result.name}
                className="w-full object-contain"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* svgOnly — inline SVG rendering for true vector display */
        <div
          className={`group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-700 transition-all hover:border-emerald-500/50 ${bgClass}`}
          onClick={() => onZoom({ blob: svgBlob }, result.name)}
        >
          <div
            className="svg-inline-container flex items-center justify-center p-4"
            dangerouslySetInnerHTML={{ __html: result.svgString }}
          />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
            </svg>
          </div>
        </div>
      )}

      {/* SVG code toggle */}
      <div className="mt-2">
        <button
          onClick={() => setShowCode(!showCode)}
          className="flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-300"
        >
          <svg
            className={`h-3 w-3 transition-transform ${showCode ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {showCode ? "收起 SVG 代码" : "查看 SVG 代码"}
        </button>

        {showCode && (
          <div className="relative mt-2">
            <button
              onClick={handleCopyCode}
              className="absolute right-2 top-2 z-10 rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              {codeCopied ? "已复制" : "复制"}
            </button>
            <pre className="max-h-72 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs leading-relaxed text-zinc-400">
              <code>{formattedSvg}</code>
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
