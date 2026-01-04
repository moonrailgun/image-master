"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  resizeImages,
  calculateDimensions,
  getImageDimensions,
  ResizeMode,
  ResizeOptions,
  ResizeResult,
} from "../lib/image-resizer";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import type { TransferData } from "../page";

interface FilePreview {
  file: File;
  url: string;
  width: number;
  height: number;
}

interface ImageResizerProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onSendToTransform?: (files: File[]) => void;
  onSendToInpaint?: (files: File[]) => void;
  onSendToCrop?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function ImageResizer({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onSendToUpscale,
  onSendToCompress,
  onSendToTransform,
  onSendToInpaint,
  onSendToCrop,
  onHasFilesChange,
  isActive = true,
}: ImageResizerProps) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ResizeResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // Resize options
  const [mode, setMode] = useState<ResizeMode>("scale");
  const [scale, setScale] = useState(100);
  const [targetWidth, setTargetWidth] = useState<number | undefined>();
  const [targetHeight, setTargetHeight] = useState<number | undefined>();
  const [lockAspectRatio, setLockAspectRatio] = useState(true);
  const [lastEditedDimension, setLastEditedDimension] = useState<"width" | "height">("width");

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  // Handle incoming transfer from other module
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0) {
      setFiles(pendingTransfer.files);
      setResults([]);
      onTransferConsumed?.();
    }
  }, [pendingTransfer, onTransferConsumed]);

  // Load previews with dimensions
  useEffect(() => {
    let cancelled = false;

    const loadPreviews = async () => {
      const newPreviews: FilePreview[] = [];
      for (const file of files) {
        if (cancelled) break;
        const url = URL.createObjectURL(file);
        try {
          const dims = await getImageDimensions(file);
          newPreviews.push({ file, url, width: dims.width, height: dims.height });
        } catch {
          newPreviews.push({ file, url, width: 0, height: 0 });
        }
      }
      if (!cancelled) {
        setPreviews(newPreviews);
        // Initialize target dimensions from first image
        if (newPreviews.length > 0 && newPreviews[0].width > 0) {
          setTargetWidth(newPreviews[0].width);
          setTargetHeight(newPreviews[0].height);
        }
      }
    };

    loadPreviews();

    return () => {
      cancelled = true;
      previews.forEach((p) => URL.revokeObjectURL(p.url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  // Calculate preview dimensions
  const previewDimensions = useMemo(() => {
    if (previews.length === 0) return null;
    const first = previews[0];
    if (first.width === 0) return null;

    const options: ResizeOptions = {
      mode,
      scale,
      width: targetWidth,
      height: targetHeight,
      lockAspectRatio,
    };

    return calculateDimensions(first.width, first.height, options);
  }, [previews, mode, scale, targetWidth, targetHeight, lockAspectRatio]);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults([]);
  }, []);

  const handleWidthChange = useCallback(
    (value: number | undefined) => {
      setTargetWidth(value);
      setLastEditedDimension("width");
      if (lockAspectRatio && value && previews.length > 0 && previews[0].width > 0) {
        const aspectRatio = previews[0].width / previews[0].height;
        setTargetHeight(Math.round(value / aspectRatio));
      }
    },
    [lockAspectRatio, previews]
  );

  const handleHeightChange = useCallback(
    (value: number | undefined) => {
      setTargetHeight(value);
      setLastEditedDimension("height");
      if (lockAspectRatio && value && previews.length > 0 && previews[0].height > 0) {
        const aspectRatio = previews[0].width / previews[0].height;
        setTargetWidth(Math.round(value * aspectRatio));
      }
    },
    [lockAspectRatio, previews]
  );

  const handleLockToggle = useCallback(() => {
    const newLocked = !lockAspectRatio;
    setLockAspectRatio(newLocked);
    if (newLocked && previews.length > 0 && previews[0].width > 0) {
      const aspectRatio = previews[0].width / previews[0].height;
      if (lastEditedDimension === "width" && targetWidth) {
        setTargetHeight(Math.round(targetWidth / aspectRatio));
      } else if (lastEditedDimension === "height" && targetHeight) {
        setTargetWidth(Math.round(targetHeight * aspectRatio));
      }
    }
  }, [lockAspectRatio, previews, lastEditedDimension, targetWidth, targetHeight]);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress({ current: 0, total: files.length });

    const options: ResizeOptions = {
      mode,
      scale,
      width: targetWidth,
      height: targetHeight,
      lockAspectRatio,
    };

    try {
      const results = await resizeImages(files, options, (current, total) => {
        setProgress({ current, total });
      });

      setResults(results);
      setResultsVersion((v) => v + 1);
      showToast(`成功处理 ${results.length} 张图片`, "success");
    } catch (error) {
      console.error("Resize failed:", error);
      showToast(
        `处理失败: ${error instanceof Error ? error.message : "未知错误"}`,
        "error"
      );
    } finally {
      setProcessing(false);
    }
  }, [files, mode, scale, targetWidth, targetHeight, lockAspectRatio, showToast]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadSingle(results[0].blob, results[0].name);
    } else {
      const items: DownloadItem[] = results.map((result) => ({
        name: result.name,
        blob: result.blob,
      }));
      await downloadAsZip(items, "resized-images.zip");
    }
  }, [results]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
    setScale(100);
    setTargetWidth(undefined);
    setTargetHeight(undefined);
  }, []);

  const hasFiles = files.length > 0;

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

  return (
    <div className="flex flex-col gap-6">
      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column - Source & Controls */}
        <div className="flex flex-col gap-4">
          {/* Preview */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">原图预览</span>
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
                    {preview.width}×{preview.height}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Resize Controls */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <span className="mb-4 block text-sm font-medium text-zinc-300">调整设置</span>

            {/* Mode Toggle */}
            <div className="mb-4 flex gap-2">
              <button
                onClick={() => setMode("scale")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "scale"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                按比例
              </button>
              <button
                onClick={() => setMode("dimensions")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  mode === "dimensions"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                按尺寸
              </button>
            </div>

            {mode === "scale" ? (
              /* Scale Mode */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="10"
                    max="500"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="flex-1"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="1000"
                      value={scale}
                      onChange={(e) => setScale(Math.max(1, Math.min(1000, Number(e.target.value) || 100)))}
                      className="w-16 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-center text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                    <span className="text-sm text-zinc-400">%</span>
                  </div>
                </div>
                <div className="flex justify-center gap-2">
                  {[25, 50, 75, 100, 150, 200].map((v) => (
                    <button
                      key={v}
                      onClick={() => setScale(v)}
                      className={`rounded px-2 py-1 text-xs transition-colors ${
                        scale === v
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                      }`}
                    >
                      {v}%
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Dimensions Mode */
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-zinc-500">宽度</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="宽度"
                      value={targetWidth ?? ""}
                      onChange={(e) => handleWidthChange(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={handleLockToggle}
                    className={`mt-5 rounded-lg p-2 transition-colors ${
                      lockAspectRatio
                        ? "bg-emerald-600 text-white"
                        : "bg-zinc-700 text-zinc-400 hover:bg-zinc-600"
                    }`}
                    title={lockAspectRatio ? "已锁定比例" : "未锁定比例"}
                  >
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      {lockAspectRatio ? (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                        />
                      ) : (
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                        />
                      )}
                    </svg>
                  </button>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs text-zinc-500">高度</label>
                    <input
                      type="number"
                      min="1"
                      placeholder="高度"
                      value={targetHeight ?? ""}
                      onChange={(e) => handleHeightChange(e.target.value ? Number(e.target.value) : undefined)}
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
                <p className="text-center text-xs text-zinc-500">
                  {lockAspectRatio ? "🔒 锁定比例 - 修改一个维度会自动计算另一个" : "🔓 自由调整 - 可独立设置宽高"}
                </p>
              </div>
            )}

            {/* Preview dimensions */}
            {previewDimensions && (
              <div className="mt-4 rounded-lg bg-zinc-900/50 p-3 text-center">
                <span className="text-xs text-zinc-500">预计输出尺寸: </span>
                <span className="text-sm font-medium text-emerald-400">
                  {previewDimensions.width} × {previewDimensions.height}
                </span>
              </div>
            )}
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
                ? `处理中 ${progress.current}/${progress.total}...`
                : results.length > 0
                  ? "重新处理"
                  : "开始调整"}
            </span>
          </button>
        </div>

        {/* Right column - Results */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                处理结果
                {results.length > 0 && (
                  <span className="ml-2 text-emerald-400">({results.length} 张)</span>
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
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
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
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
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
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
                                );
                                onSendToUpscale(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToCompress
                        ? [
                            {
                              label: "发送到图片压缩",
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
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
                                );
                                onSendToCompress(files);
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
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
                                );
                                onSendToTransform(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToInpaint
                        ? [
                            {
                              label: "发送到图片修复",
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
                                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
                                );
                                onSendToInpaint(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToCrop
                        ? [
                            {
                              label: "发送到图片裁剪",
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
                                    d="M3 4v16h16M7 20V8m0 0h12"
                                  />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map(
                                  (r) => new File([r.blob], r.name, { type: "image/png" })
                                );
                                onSendToCrop(files);
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
                  正在处理 {progress.current}/{progress.total}...
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-zinc-600">
                <p>调整参数后点击「开始调整」处理图片</p>
              </div>
            ) : (
              <div className="max-h-[400px] overflow-y-auto">
                <div className="flex flex-wrap gap-3">
                  {results.map((result, i) => (
                    <ResultPreview
                      key={`${resultsVersion}-${i}`}
                      result={result}
                      onZoom={(blob, alt) => setLightboxImage({ blob, alt })}
                    />
                  ))}
                </div>
              </div>
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
  onZoom,
}: {
  result: ResizeResult;
  onZoom: (blob: Blob, alt: string) => void;
}) {
  const [url] = useState(() => URL.createObjectURL(result.blob));

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
      <div className="absolute inset-x-0 bottom-0 translate-y-full opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
        <div className="mt-1 truncate rounded bg-zinc-900 px-2 py-1 text-center text-xs text-zinc-400">
          {result.width}×{result.height}
        </div>
      </div>
    </div>
  );
}
