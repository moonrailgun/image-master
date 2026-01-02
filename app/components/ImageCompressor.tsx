"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  compressImages,
  formatFileSize,
  OutputFormat,
  CompressOptions,
  CompressResult,
} from "../lib/image-compressor";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import type { TransferData } from "../page";

interface FilePreview {
  file: File;
  url: string;
}

interface ImageCompressorProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToTransform?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function ImageCompressor({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onSendToUpscale,
  onSendToResize,
  onSendToTransform,
  onHasFilesChange,
  isActive = true,
}: ImageCompressorProps) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<CompressResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // Compress options
  const [format, setFormat] = useState<OutputFormat>("original");
  const [quality, setQuality] = useState(80);

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  // Handle incoming transfer from other module
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0 && pendingTransfer !== lastTransferRef.current) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        setFiles(pendingTransfer.files);
        setResults([]);
        onTransferConsumed?.();
      });
    }
  }, [pendingTransfer, onTransferConsumed]);

  // Use useMemo for previews (derived state) and handle cleanup separately
  const previews = useMemo(() => {
    return files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
  }, [files]);

  // Cleanup old object URLs
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

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress({ current: 0, total: files.length });

    const options: Partial<CompressOptions> = {
      format,
      quality,
    };

    try {
      const results = await compressImages(files, options, (current, total) => {
        setProgress({ current, total });
      });

      setResults(results);
      setResultsVersion((v) => v + 1);

      // Calculate total savings
      const totalOriginal = results.reduce((sum, r) => sum + r.originalSize, 0);
      const totalCompressed = results.reduce((sum, r) => sum + r.compressedSize, 0);
      const totalSavings = totalOriginal - totalCompressed;
      const savingsPercent =
        totalOriginal > 0 ? ((totalSavings / totalOriginal) * 100).toFixed(1) : 0;

      showToast(
        `成功压缩 ${results.length} 张图片，节省 ${formatFileSize(totalSavings)} (${savingsPercent}%)`,
        "success"
      );
    } catch (error) {
      console.error("Compress failed:", error);
      showToast(
        `压缩失败: ${error instanceof Error ? error.message : "未知错误"}`,
        "error"
      );
    } finally {
      setProcessing(false);
    }
  }, [files, format, quality, showToast]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadSingle(results[0].blob, results[0].name);
    } else {
      const items: DownloadItem[] = results.map((result) => ({
        name: result.name,
        blob: result.blob,
      }));
      await downloadAsZip(items, "compressed-images.zip");
    }
  }, [results]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
  }, []);

  const hasFiles = files.length > 0;
  const showQualitySlider = true; // Quality affects all formats

  // No files - show dropzone only
  if (!hasFiles) {
    return (
      <div className="flex flex-col gap-6">
        <ImageDropzone onFilesSelected={handleFilesSelected} pasteEnabled={isActive} />
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

  const progressPercent = progress.total > 0 ? (progress.current / progress.total) * 100 : 0;

  // Calculate totals for display
  const totalOriginalSize = files.reduce((sum, f) => sum + f.size, 0);
  const totalCompressedSize = results.reduce((sum, r) => sum + r.compressedSize, 0);
  const totalSavings = totalOriginalSize - totalCompressedSize;
  const savingsPercent =
    results.length > 0 && totalOriginalSize > 0
      ? ((totalSavings / totalOriginalSize) * 100).toFixed(1)
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column - Source & Controls */}
        <div className="flex flex-col gap-4">
          {/* Preview */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                原图 ({files.length} 张，共 {formatFileSize(totalOriginalSize)})
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
                    setLightboxImage({ src: preview.url, alt: preview.file.name })
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
                  <p className="mt-1 max-w-20 truncate text-center text-xs text-zinc-500">
                    {formatFileSize(preview.file.size)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Compress Controls */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <span className="mb-4 block text-sm font-medium text-zinc-300">压缩设置</span>

            {/* Format Selection */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-zinc-500">输出格式</label>
              <div className="grid grid-cols-4 gap-2">
                {(["original", "jpeg", "webp", "png"] as OutputFormat[]).map((fmt) => (
                  <button
                    key={fmt}
                    onClick={() => setFormat(fmt)}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      format === fmt
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    {fmt === "original" ? "原格式" : fmt.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Quality Slider */}
            <div className="mb-4 space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs text-zinc-500">压缩质量</label>
                <span className="text-sm font-medium text-emerald-400">{quality}%</span>
              </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="flex-1"
                  />
                </div>
                <div className="flex justify-center gap-2">
                  {[60, 70, 80, 90, 100].map((v) => (
                    <button
                      key={v}
                      onClick={() => setQuality(v)}
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        quality === v
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
            </div>

            {/* Info */}
            <div className="rounded-lg bg-zinc-900/50 p-3 text-center text-xs text-zinc-500">
              {format === "original" && "保持原图格式，自动优化压缩"}
              {format === "jpeg" && "JPEG 格式，适合照片类图片"}
              {format === "webp" && "WebP 格式，兼顾质量和压缩率"}
              {format === "png" && "PNG 格式，保持透明通道"}
            </div>
          </div>

          {/* Process button */}
          <button
            onClick={handleProcess}
            disabled={processing}
            className="relative w-full overflow-hidden rounded-xl bg-emerald-600 py-3 font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed"
          >
            {processing && (
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {processing && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {processing
                ? `压缩中 ${progress.current}/${progress.total}...`
                : results.length > 0
                  ? "重新压缩"
                  : "开始压缩"}
            </span>
          </button>
        </div>

        {/* Right column - Results */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                压缩结果
                {results.length > 0 && (
                  <span className="ml-2 text-emerald-400">
                    ({formatFileSize(totalCompressedSize)})
                  </span>
                )}
              </span>
              {results.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    {results.length === 1 ? "下载图片" : "下载 ZIP"}
                  </button>
                  <DropdownMenu
                    items={[
                      ...(onSendToSprite
                        ? [
                            {
                              label: "发送到精灵图拆分",
                              icon: (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToSprite(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToBackground
                        ? [
                            {
                              label: "发送到背景扣除",
                              icon: (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToBackground(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToUpscale
                        ? [
                            {
                              label: "发送到超分放大",
                              icon: (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToUpscale(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToResize
                        ? [
                            {
                              label: "发送到尺寸调整",
                              icon: (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToResize(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToTransform
                        ? [
                            {
                              label: "发送到旋转翻转",
                              icon: (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToTransform(files);
                              },
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )}
            </div>

            {processing ? (
              <div className="flex min-h-[200px] flex-col items-center justify-center gap-4">
                <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-zinc-700">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                <p className="text-sm text-zinc-400">
                  正在压缩 {progress.current}/{progress.total}...
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-zinc-600">
                <p>调整参数后点击「开始压缩」处理图片</p>
              </div>
            ) : (
              <>
                {/* Savings Summary */}
                {savingsPercent && (
                  <div className="mb-4 rounded-lg bg-emerald-500/10 p-3 text-center">
                    <span className="text-sm text-emerald-400">
                      总计节省 {formatFileSize(totalSavings)} ({savingsPercent}%)
                    </span>
                  </div>
                )}
                <div className="max-h-[400px] overflow-y-auto">
                  <div className="flex flex-wrap gap-3">
                    {results.map((result, i) => (
                      <ResultPreview
                        key={`${resultsVersion}-${i}`}
                        result={result}
                        originalSize={files[i]?.size || 0}
                        onZoom={(blob, alt) => setLightboxImage({ blob, alt })}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
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

function ResultPreview({
  result,
  originalSize,
  onZoom,
}: {
  result: CompressResult;
  originalSize: number;
  onZoom: (blob: Blob, alt: string) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(result.blob));
  const savings = originalSize - result.compressedSize;
  const savingsPercent = originalSize > 0 ? ((savings / originalSize) * 100).toFixed(0) : 0;
  const isSmaller = savings > 0;

  return (
    <div
      className="group relative cursor-pointer overflow-hidden"
      onClick={() => onZoom(result.blob, result.name)}
    >
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] transition-all hover:border-emerald-500/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={result.name}
          className="max-h-32 max-w-32 object-contain"
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        <svg
          className="h-5 w-5 text-white"
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
      <div className="mt-1 text-center">
        <p className="text-xs text-zinc-400">{formatFileSize(result.compressedSize)}</p>
        <p
          className={`text-xs ${isSmaller ? "text-emerald-400" : "text-amber-400"}`}
        >
          {isSmaller ? `-${savingsPercent}%` : `+${Math.abs(Number(savingsPercent))}%`}
        </p>
      </div>
    </div>
  );
}
