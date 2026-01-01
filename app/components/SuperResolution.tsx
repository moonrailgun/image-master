"use client";

import { useState, useCallback, useEffect } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  upscaleImage,
  isModelCached,
  getWorkerPoolInfo,
  ScaleFactor,
  UpscaleResult,
  UpscaleProgress,
} from "../lib/super-resolution";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import type { TransferData } from "../page";

interface FilePreview {
  file: File;
  url: string;
}

interface SuperResolutionProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function SuperResolution({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onHasFilesChange,
  isActive = true,
}: SuperResolutionProps) {
  const { showToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<UpscaleResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progressInfo, setProgressInfo] = useState<UpscaleProgress | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // Options
  const scale: ScaleFactor = 4;
  const [modelCached, setModelCached] = useState(false);

  // Check if model is cached
  useEffect(() => {
    const checkCache = async () => {
      const cached = await isModelCached(4);
      setModelCached(cached);
    };
    checkCache();
  }, []);

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

  useEffect(() => {
    const newPreviews = files.map((file) => ({
      file,
      url: URL.createObjectURL(file),
    }));
    setPreviews(newPreviews);

    return () => {
      newPreviews.forEach((p) => URL.revokeObjectURL(p.url));
    };
  }, [files]);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    setFiles(selectedFiles);
    setResults([]);
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setProcessing(true);
    const { maxWorkers } = getWorkerPoolInfo();

    // Track progress and message for each file
    const progressData: Map<number, UpscaleProgress> = new Map();

    const updateOverallProgress = () => {
      const total = files.length;
      const entries = Array.from(progressData.values());
      const sum = entries.reduce((a, b) => a + b.progress, 0);
      const overall = sum / total;
      const completed = entries.filter((p) => p.progress >= 100).length;

      // Find the latest non-complete message to show
      const activeEntry = entries.find((p) => p.progress < 100 && p.progress > 0);
      const message = activeEntry
        ? `[${completed}/${total}] ${activeEntry.message}`
        : `并发处理中 (${maxWorkers}线程)... ${completed}/${total} 完成`;

      setProgressInfo({
        stage: activeEntry?.stage || "processing",
        progress: overall,
        message,
      });
    };

    setProgressInfo({
      stage: "processing",
      progress: 0,
      message: `准备并发处理 ${files.length} 张图片 (${maxWorkers}线程)...`,
    });

    // Process all files concurrently
    const promises = files.map((file, index) =>
      upscaleImage(file, scale, (progress) => {
        progressData.set(index, progress);
        updateOverallProgress();
      }).catch((error) => {
        console.error(`Failed to process ${file.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : "未知错误";

        if (errorMessage.includes("download") || errorMessage.includes("fetch")) {
          showToast(`模型下载失败: ${errorMessage}`, "error");
        } else if (errorMessage.includes("memory") || errorMessage.includes("OOM")) {
          showToast(`内存不足，请尝试使用更小的图片`, "error");
        } else {
          showToast(`处理 ${file.name} 失败: ${errorMessage}`, "error");
        }
        // Mark as complete even on error
        progressData.set(index, { stage: "processing", progress: 100, message: "失败" });
        return null;
      })
    );

    const results = await Promise.all(promises);
    const processed = results.filter((r): r is UpscaleResult => r !== null);

    setResults(processed);
    setResultsVersion((v) => v + 1);
    setProcessing(false);
    setProgressInfo(null);

    // Update cache status
    const cached = await isModelCached(scale);
    setModelCached(cached);

    // Show success message
    if (processed.length === files.length) {
      showToast(`成功处理 ${processed.length} 张图片`, "success");
    } else if (processed.length > 0) {
      showToast(`部分处理成功: ${processed.length}/${files.length} 张`, "info");
    }
  }, [files, scale, showToast]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadSingle(results[0].blob, results[0].name);
    } else {
      const items: DownloadItem[] = results.map((result) => ({
        name: result.name,
        blob: result.blob,
      }));
      await downloadAsZip(items, `upscaled-x${scale}.zip`);
    }
  }, [results, scale]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
    setProgressInfo(null);
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

  // Calculate progress percentage
  const progressPercent = progressInfo?.progress ?? 0;

  // Has files - show split layout
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
                    {preview.file.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Model status */}
          {!modelCached && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-400">
              <svg
                className="h-4 w-4 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>首次使用需下载模型（~64MB），之后会自动缓存</span>
            </div>
          )}

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
                ? progressInfo?.message || "处理中..."
                : results.length > 0
                  ? "重新处理"
                  : `开始 ${scale}x 放大`}
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
                  {progressInfo?.message || "处理中..."}
                </p>
                <p className="text-xs text-zinc-600">
                  {Math.round(progressPercent)}%
                </p>
              </div>
            ) : results.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-zinc-600">
                <p>点击「开始 4x 放大」处理图片</p>
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
  result: UpscaleResult;
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
