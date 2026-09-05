"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { DropdownMenu } from "./DropdownMenu";
import { splitSprites, splitSpritesGrid, SplitResult, SplitMode } from "../lib/sprite-splitter";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import {
  PROCESSING_ERROR_TYPE,
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "../lib/analytics";
import { settleProcessOutcome } from "../lib/process-outcome";
import type { TransferData } from "../types";

interface ProcessedFile {
  originalName: string;
  sprites: SplitResult[];
}

export function countProcessedSpriteFiles(
  processed: Array<{ sprites: unknown[] }>
): number {
  return processed.filter(({ sprites }) => sprites.length > 0).length;
}

export function getSpriteFailureCause(lastError: unknown): unknown {
  return lastError ?? PROCESSING_ERROR_TYPE;
}

interface FilePreview {
  file: File;
  url: string;
}

interface SpriteSplitterProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onSendToTransform?: (files: File[]) => void;
  onSendToInpaint?: (files: File[]) => void;
  onSendToCrop?: (files: File[]) => void;
  onSendToVectorize?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function SpriteSplitter({
  pendingTransfer,
  onTransferConsumed,
  onSendToBackground,
  onSendToUpscale,
  onSendToResize,
  onSendToCompress,
  onSendToTransform,
  onSendToInpaint,
  onSendToCrop,
  onSendToVectorize,
  onHasFilesChange,
  isActive = true,
}: SpriteSplitterProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<ProcessedFile[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0);
  const [progress, setProgress] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<{ src?: string; blob?: Blob; alt: string } | null>(null);
  const [splitMode, setSplitMode] = useState<SplitMode>("transparent");
  const [gridColumns, setGridColumns] = useState(4);
  const [gridRows, setGridRows] = useState(4);

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  // Handle incoming transfer from other module
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0 && pendingTransfer !== lastTransferRef.current) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        trackToolImport("sprite", "transfer", pendingTransfer.files.length);
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

    const startedAt = trackToolProcessStart("sprite", files.length);
    let lastError: unknown;
    setProcessing(true);
    setProgress(0);
    const processed: ProcessedFile[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const sprites =
          splitMode === "grid"
            ? await splitSpritesGrid(file, { columns: gridColumns, rows: gridRows })
            : await splitSprites(file);
        processed.push({ originalName: file.name, sprites });
      } catch (error) {
        lastError = error;
        console.error(`Failed to process ${file.name}:`, error);
      }
      setProgress(((i + 1) / files.length) * 100);
    }

    setResults(processed);
    setResultsVersion((v) => v + 1);
    const processedCount = countProcessedSpriteFiles(processed);
    settleProcessOutcome(processedCount, {
      onSuccess: () =>
        trackToolProcessSuccess(
          "sprite",
          files.length,
          processedCount,
          startedAt
        ),
      onFailure: () =>
        trackToolProcessFailure(
          "sprite",
          files.length,
          startedAt,
          getSpriteFailureCause(lastError)
        ),
    });
    setProcessing(false);
  }, [files, splitMode, gridColumns, gridRows]);

  const handleDownload = useCallback(async () => {
    const items: DownloadItem[] = [];

    for (const result of results) {
      const folder = result.originalName.replace(/\.[^/.]+$/, "");
      for (const sprite of result.sprites) {
        items.push({
          name: sprite.name,
          blob: sprite.blob,
          folder: results.length > 1 ? folder : undefined,
        });
      }
    }

    if (items.length === 0) return;

    if (items.length === 1) {
      downloadSingle(items[0].blob, items[0].name);
      trackToolDownload("sprite", 1, "single");
    } else {
      await downloadAsZip(items, "sprites.zip");
      trackToolDownload("sprite", items.length, "zip");
    }
  }, [results]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
    setProgress(0);
  }, []);

  const totalSprites = results.reduce((sum, r) => sum + r.sprites.length, 0);
  const hasFiles = files.length > 0;

  // No files - show dropzone only
  if (!hasFiles) {
    return (
      <div className="flex flex-col gap-6">
        <ImageDropzone tool="sprite" onFilesSelected={handleFilesSelected} accept="image/png" pasteEnabled={isActive} />
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

  // Has files - show split layout
  return (
    <div className="flex flex-col gap-6">
      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column - Source & Controls */}
        <div className="flex flex-col gap-4">
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
                  onClick={() => setLightboxImage({ src: preview.url, alt: preview.file.name })}
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
                    <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                  <p className="mt-1 max-w-20 truncate text-center text-xs text-zinc-500">
                    {preview.file.name}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Split mode options */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <span className="mb-3 block text-sm font-medium text-zinc-300">拆分模式</span>
            <div className="flex gap-2">
              <button
                onClick={() => setSplitMode("transparent")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  splitMode === "transparent"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                透明边界
              </button>
              <button
                onClick={() => setSplitMode("grid")}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  splitMode === "grid"
                    ? "bg-emerald-600 text-white"
                    : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                宫格拆分
              </button>
            </div>

            {splitMode === "grid" && (
              <div className="mt-3 flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  列
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={gridColumns}
                    onChange={(e) => setGridColumns(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-center text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <svg className="h-4 w-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <label className="flex items-center gap-2 text-sm text-zinc-400">
                  行
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={gridRows}
                    onChange={(e) => setGridRows(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 rounded-lg border border-zinc-600 bg-zinc-700 px-2 py-1 text-center text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </label>
                <span className="ml-auto text-xs text-zinc-500">
                  共 {gridColumns * gridRows} 块
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
                style={{ width: `${progress}%` }}
              />
            )}
            <span className="relative flex items-center justify-center gap-2">
              {processing && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {processing ? `处理中 ${Math.round(progress)}%` : results.length > 0 ? "重新拆分" : "开始拆分"}
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
                  <span className="ml-2 text-emerald-400">({totalSprites} 个)</span>
                )}
              </span>
              {results.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleDownload}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    {totalSprites === 1 ? "下载图片" : "下载 ZIP"}
                  </button>
                  <DropdownMenu
                    onSendToCurrent={() => handleFilesSelected(
                      results.flatMap((r) => r.sprites.map(
                        (sprite) => new File([sprite.blob], sprite.name, { type: sprite.blob.type })
                      ))
                    )}
                    items={[
                      ...(onSendToBackground
                        ? [
                            {
                              label: "发送到背景扣除",
                              icon: (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4v16h16M7 20V8m0 0h12" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
                                onSendToCrop(files);
                              },
                            },
                          ]
                        : []),
                      ...(onSendToVectorize
                        ? [
                            {
                              label: "发送到矢量化",
                              icon: (
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files: File[] = [];
                                for (const result of results) {
                                  for (const sprite of result.sprites) {
                                    files.push(new File([sprite.blob], sprite.name, { type: "image/png" }));
                                  }
                                }
                                onSendToVectorize(files);
                              },
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )}
            </div>

            {results.length === 0 ? (
              <div className="flex min-h-[200px] items-center justify-center text-zinc-600">
                <p>点击"开始拆分"处理图片</p>
              </div>
            ) : (
              <div className="max-h-[400px] space-y-4 overflow-y-auto">
                {results.map((result, i) => (
                  <div key={`${resultsVersion}-${i}`}>
                    <p className="mb-2 text-sm text-zinc-500">{result.originalName}</p>
                    <div className="flex flex-wrap gap-3">
                      {result.sprites.map((sprite, j) => (
                        <SpritePreview
                          key={`${resultsVersion}-${i}-${j}`}
                          sprite={sprite}
                          onZoom={(blob, alt) => setLightboxImage({ blob, alt })}
                        />
                      ))}
                    </div>
                  </div>
                ))}
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

function SpritePreview({
  sprite,
  onZoom,
}: {
  sprite: SplitResult;
  onZoom: (blob: Blob, alt: string) => void;
}) {
  // Use useState with lazy init to avoid Strict Mode double-create issues
  const [url] = useState(() => URL.createObjectURL(sprite.blob));

  return (
    <div
      className="group relative cursor-pointer overflow-hidden"
      onClick={() => onZoom(sprite.blob, sprite.name)}
    >
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] transition-all hover:border-emerald-500/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={sprite.name}
          className="max-h-24 max-w-24 object-contain"
        />
      </div>
      <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 translate-y-full opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
        <div className="mt-1 rounded bg-zinc-900 px-2 py-1 text-center text-xs text-zinc-400">
          {sprite.width}×{sprite.height}
        </div>
      </div>
    </div>
  );
}
