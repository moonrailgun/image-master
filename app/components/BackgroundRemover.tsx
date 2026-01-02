"use client";

import { useState, useCallback, useEffect } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { ColorPicker } from "./ColorPicker";
import { DropdownMenu } from "./DropdownMenu";
import {
  removeBackground,
  RemoveResult,
  RemoveBackgroundOptions,
} from "../lib/background-remover";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import type { TransferData } from "../page";

interface FilePreview {
  file: File;
  url: string;
}

interface BackgroundRemoverProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function BackgroundRemover({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToUpscale,
  onSendToResize,
  onSendToCompress,
  onHasFilesChange,
  isActive = true,
}: BackgroundRemoverProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<FilePreview[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RemoveResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0); // Force re-render on reprocess
  const [progress, setProgress] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<{ src?: string; blob?: Blob; alt: string } | null>(null);

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  // Options
  const [tolerance, setTolerance] = useState(10);
  const [contiguousOnly, setContiguousOnly] = useState(true);
  const [targetColor, setTargetColor] = useState<{
    r: number;
    g: number;
    b: number;
  } | null>(null);
  const [feather, setFeather] = useState(0);

  // Handle incoming transfer from other module
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0) {
      setFiles(pendingTransfer.files);
      setResults([]);
      setTargetColor(null);
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
    setTargetColor(null);
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress(0);
    const processed: RemoveResult[] = [];

    const options: RemoveBackgroundOptions = {
      tolerance,
      contiguousOnly,
      targetColor: targetColor ?? undefined,
      feather,
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const result = await removeBackground(file, options);
        processed.push(result);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
      }
      setProgress(((i + 1) / files.length) * 100);
    }

    setResults(processed);
    setResultsVersion((v) => v + 1); // Force re-render of result previews
    setProcessing(false);
  }, [files, tolerance, contiguousOnly, targetColor, feather]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadSingle(results[0].blob, results[0].name);
    } else {
      const items: DownloadItem[] = results.map((result) => ({
        name: result.name,
        blob: result.blob,
      }));
      await downloadAsZip(items, "transparent-images.zip");
    }
  }, [results]);

  const handleClear = useCallback(() => {
    setFiles([]);
    setResults([]);
    setProgress(0);
    setTargetColor(null);
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

          {/* Options */}
          <div className="space-y-4 rounded-xl bg-zinc-800/50 p-4">
            <h3 className="font-medium text-zinc-300">处理选项</h3>

            {/* Tolerance slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400">颜色容差</label>
                <span className="text-sm font-medium text-emerald-400">
                  {tolerance}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={tolerance}
                onChange={(e) => setTolerance(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="text-xs text-zinc-500">
                容差越高，越多相近的颜色会被处理为透明
              </p>
            </div>

            {/* Feather slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm text-zinc-400">边缘羽化</label>
                <span className="text-sm font-medium text-emerald-400">
                  {feather}px
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={feather}
                onChange={(e) => setFeather(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
              <p className="text-xs text-zinc-500">
                羽化可柔化边缘，减少锯齿感
              </p>
            </div>

            {/* Contiguous toggle */}
            <div className="flex items-center justify-between">
              <div>
                <label className="text-sm text-zinc-400">仅处理连续像素</label>
                <p className="text-xs text-zinc-500">
                  开启后仅从图片四角开始填充连续的背景色
                </p>
              </div>
              <button
                onClick={() => setContiguousOnly(!contiguousOnly)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  contiguousOnly ? "bg-emerald-600" : "bg-zinc-600"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    contiguousOnly ? "left-5" : "left-0.5"
                  }`}
                />
              </button>
            </div>

            {/* Color picker */}
            <div className="space-y-2">
              <label className="text-sm text-zinc-400">目标颜色</label>
              <p className="text-xs text-zinc-500">
                默认使用左上角像素颜色，或手动拾取
              </p>
              <ColorPicker
                file={files[0] || null}
                onColorPicked={(color) => {
                  setTargetColor(color);
                  // Auto disable contiguousOnly when manually picking color
                  // since the target color might be in the middle of the image
                  if (color && contiguousOnly) {
                    setContiguousOnly(false);
                  }
                }}
                selectedColor={targetColor}
              />
              {targetColor && !contiguousOnly && (
                <p className="text-xs text-amber-500">
                  已自动关闭"仅处理连续像素"，将移除图片中所有匹配的颜色
                </p>
              )}
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
              {processing ? `处理中 ${Math.round(progress)}%` : results.length > 0 ? "重新处理" : "开始处理"}
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
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
                                onSendToSprite(files);
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
                                onSendToCompress(files);
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
                <p>点击"开始处理"处理图片</p>
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
  result: RemoveResult;
  onZoom: (blob: Blob, alt: string) => void;
}) {
  // Use useState with lazy init to avoid Strict Mode double-create issues
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
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
        </svg>
      </div>
      <div className="absolute inset-x-0 bottom-0 translate-y-full opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
        <div className="mt-1 truncate rounded bg-zinc-900 px-2 py-1 text-center text-xs text-zinc-400">
          {result.name}
        </div>
      </div>
    </div>
  );
}
