"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  transformImages,
  TransformOptions,
  TransformResult,
} from "../lib/image-transform";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import type { TransferData } from "../page";

interface FilePreview {
  file: File;
  url: string;
}

interface ImageTransformProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onSendToInpaint?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function ImageTransform({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onSendToUpscale,
  onSendToResize,
  onSendToCompress,
  onSendToInpaint,
  onHasFilesChange,
  isActive = true,
}: ImageTransformProps) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<TransformResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // 自定义旋转角度
  const [customAngle, setCustomAngle] = useState(0);

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

  // 执行变换操作
  const executeTransform = useCallback(async (options: TransformOptions) => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress({ current: 0, total: files.length });

    try {
      const newResults = await transformImages(files, options, (current, total) => {
        setProgress({ current, total });
      });

      setResults(newResults);
      setResultsVersion((v) => v + 1);
      showToast(`成功处理 ${newResults.length} 张图片`, "success");
    } catch (error) {
      console.error("Transform failed:", error);
      showToast(
        `处理失败: ${error instanceof Error ? error.message : "未知错误"}`,
        "error"
      );
    } finally {
      setProcessing(false);
    }
  }, [files, showToast]);

  // 快捷旋转
  const handleRotate = useCallback((angle: number) => {
    executeTransform({ rotateAngle: angle });
  }, [executeTransform]);

  // 自定义角度旋转
  const handleCustomRotate = useCallback(() => {
    if (customAngle === 0) {
      showToast("请输入旋转角度", "error");
      return;
    }
    executeTransform({ rotateAngle: customAngle });
  }, [customAngle, executeTransform, showToast]);

  // 翻转
  const handleFlip = useCallback((direction: "horizontal" | "vertical") => {
    executeTransform({ flip: direction });
  }, [executeTransform]);

  // 使用结果作为新输入
  const handleUseResults = useCallback(() => {
    if (results.length === 0) return;

    const newFiles = results.map(
      (r) => new File([r.blob], r.name, { type: r.blob.type })
    );
    setFiles(newFiles);
    setResults([]);
    showToast("已将结果设为新输入", "success");
  }, [results, showToast]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadSingle(results[0].blob, results[0].name);
    } else {
      const items: DownloadItem[] = results.map((result) => ({
        name: result.name,
        blob: result.blob,
      }));
      await downloadAsZip(items, "transformed-images.zip");
    }
  }, [results]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
    setCustomAngle(0);
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
                </div>
              ))}
            </div>
          </div>

          {/* Transform Controls */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <span className="mb-4 block text-sm font-medium text-zinc-300">变换操作</span>

            {/* Quick Rotation */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-zinc-500">快捷旋转</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  onClick={() => handleRotate(-90)}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  -90°
                </button>
                <button
                  onClick={() => handleRotate(180)}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                  </svg>
                  180°
                </button>
                <button
                  onClick={() => handleRotate(90)}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-5 w-5 -scale-x-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                    />
                  </svg>
                  +90°
                </button>
              </div>
            </div>

            {/* Custom Angle Rotation */}
            <div className="mb-4">
              <label className="mb-2 block text-xs text-zinc-500">自定义角度</label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="number"
                    value={customAngle}
                    onChange={(e) => setCustomAngle(Number(e.target.value))}
                    placeholder="输入角度"
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2.5 pr-8 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-500">°</span>
                </div>
                <button
                  onClick={handleCustomRotate}
                  disabled={processing}
                  className="rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  旋转
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">正数顺时针，负数逆时针</p>
            </div>

            {/* Flip Controls */}
            <div>
              <label className="mb-2 block text-xs text-zinc-500">翻转</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => handleFlip("horizontal")}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                  水平翻转
                </button>
                <button
                  onClick={() => handleFlip("vertical")}
                  disabled={processing}
                  className="flex items-center justify-center gap-2 rounded-lg bg-zinc-700 px-3 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <svg className="h-5 w-5 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                  垂直翻转
                </button>
              </div>
            </div>

            {/* Processing indicator */}
            {processing && (
              <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-zinc-900/50 p-3">
                <svg className="h-4 w-4 animate-spin text-emerald-400" viewBox="0 0 24 24" fill="none">
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
                <span className="text-sm text-zinc-400">
                  处理中 {progress.current}/{progress.total}...
                </span>
              </div>
            )}
          </div>
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
                    onClick={handleUseResults}
                    className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                    title="将结果设为新的输入继续处理"
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
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    继续处理
                  </button>
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
                    {results.length === 1 ? "下载" : "下载 ZIP"}
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
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToCompress(files);
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
                                  (r) => new File([r.blob], r.name, { type: r.blob.type })
                                );
                                onSendToInpaint(files);
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
                <p>点击左侧操作按钮处理图片</p>
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
  result: TransformResult;
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
      <div className="mt-1 text-center">
        <p className="text-xs text-zinc-400">
          {result.width}×{result.height}
        </p>
      </div>
    </div>
  );
}
