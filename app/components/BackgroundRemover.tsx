"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { ColorPicker } from "./ColorPicker";
import { PointSelector, SeedPoint } from "./PointSelector";
import { DropdownMenu } from "./DropdownMenu";
import {
  removeBackground,
  aiRemoveBackground,
  RemoveResult,
  RemoveBackgroundOptions,
  AIModel,
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
  onSendToTransform?: (files: File[]) => void;
  onSendToInpaint?: (files: File[]) => void;
  onSendToCrop?: (files: File[]) => void;
  onSendToVectorize?: (files: File[]) => void;
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
  onSendToTransform,
  onSendToInpaint,
  onSendToCrop,
  onSendToVectorize,
  onHasFilesChange,
  isActive = true,
}: BackgroundRemoverProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<RemoveResult[]>([]);
  const [resultsVersion, setResultsVersion] = useState(0); // Force re-render on reprocess
  const [progress, setProgress] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<{ src?: string; blob?: Blob; alt: string } | null>(null);

  // Mode: "color" for color-based, "ai" for AI-powered
  const [mode, setMode] = useState<"color" | "ai">("color");

  // AI options
  const [aiModel, setAiModel] = useState<AIModel>("isnet");
  const [aiPhase, setAiPhase] = useState("");

  useEffect(() => {
    onHasFilesChange?.(files.length > 0);
  }, [files.length, onHasFilesChange]);

  // Color-based options
  const [tolerance, setTolerance] = useState(10);
  const [contiguousOnly, setContiguousOnly] = useState(true);
  const [targetColor, setTargetColor] = useState<{
    r: number;
    g: number;
    b: number;
  } | null>(null);
  const [feather, setFeather] = useState(0);
  const [antiAlias, setAntiAlias] = useState(true);
  const [seedPoints, setSeedPoints] = useState<SeedPoint[]>([]);

  // Handle incoming transfer from other module
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0 && pendingTransfer !== lastTransferRef.current) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        setFiles(pendingTransfer.files);
        setResults([]);
        setTargetColor(null);
        setSeedPoints([]);
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
    setTargetColor(null);
    setSeedPoints([]);
  }, []);

  const handleProcess = useCallback(async () => {
    if (files.length === 0) return;

    setProcessing(true);
    setProgress(0);
    setAiPhase("");
    const processed: RemoveResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        let result: RemoveResult;
        if (mode === "ai") {
          result = await aiRemoveBackground(file, {
            model: aiModel,
            onProgress: (phase, ratio) => {
              setAiPhase(phase);
              // Per-file progress blended with overall file progress
              const fileBase = i / files.length;
              const fileShare = 1 / files.length;
              setProgress((fileBase + fileShare * ratio) * 100);
            },
          });
        } else {
          const options: RemoveBackgroundOptions = {
            tolerance,
            contiguousOnly,
            targetColor: targetColor ?? undefined,
            feather,
            antiAlias,
            seedPoints: seedPoints.length > 0 ? seedPoints : undefined,
          };
          result = await removeBackground(file, options);
        }
        processed.push(result);
      } catch (error) {
        console.error(`Failed to process ${file.name}:`, error);
      }
      if (mode !== "ai") {
        setProgress(((i + 1) / files.length) * 100);
      }
    }

    setResults(processed);
    setResultsVersion((v) => v + 1);
    setProcessing(false);
    setAiPhase("");
  }, [
    files,
    mode,
    aiModel,
    tolerance,
    contiguousOnly,
    targetColor,
    feather,
    antiAlias,
    seedPoints,
  ]);

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
    setSeedPoints([]);
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

          {/* Mode Toggle */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="flex gap-1 rounded-lg bg-zinc-900/60 p-1">
              <button
                onClick={() => setMode("color")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  mode === "color"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                </svg>
                按颜色移除
              </button>
              <button
                onClick={() => setMode("ai")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  mode === "ai"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                AI 智能移除
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4 rounded-xl bg-zinc-800/50 p-4">
            <h3 className="font-medium text-zinc-300">处理选项</h3>

            {mode === "ai" ? (
              <>
                {/* AI Model selector */}
                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">AI 模型</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "isnet" as AIModel, label: "标准", desc: "平衡精度与速度" },
                      { value: "isnet_fp16" as AIModel, label: "高性能", desc: "更快速，需较好设备" },
                      { value: "isnet_quint8" as AIModel, label: "轻量", desc: "适合低配设备" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setAiModel(opt.value)}
                        className={`rounded-lg border p-2 text-left transition-all ${
                          aiModel === opt.value
                            ? "border-emerald-500 bg-emerald-500/10"
                            : "border-zinc-700 hover:border-zinc-500"
                        }`}
                      >
                        <div className={`text-sm font-medium ${aiModel === opt.value ? "text-emerald-400" : "text-zinc-300"}`}>
                          {opt.label}
                        </div>
                        <div className="text-xs text-zinc-500">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-3">
                  <div className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-zinc-400">
                      AI 模式使用深度学习模型自动识别前景主体并移除背景，无需手动选择颜色。首次使用需下载模型（约 40MB），之后会缓存在浏览器中。所有处理均在本地浏览器完成。
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <>
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

                {/* Anti-alias toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-zinc-400">边缘抗锯齿</label>
                    <p className="text-xs text-zinc-500">
                      平滑边缘曲线，减少颗粒感和锯齿
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAntiAlias(!antiAlias)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      antiAlias ? "bg-emerald-600" : "bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        antiAlias ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
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
                    type="button"
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

                {/* Seed point selector for enclosed regions */}
                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">封闭区域移除</label>
                  <p className="text-xs text-zinc-500">
                    点选被前景包围的封闭背景区域，自动以点击处颜色进行洪水填充
                  </p>
                  <PointSelector
                    file={files[0] || null}
                    points={seedPoints}
                    onPointsChange={setSeedPoints}
                  />
                </div>
              </>
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
            <span className="relative flex flex-col items-center justify-center gap-1">
              <span className="flex items-center gap-2">
                {processing && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {processing
                  ? `处理中 ${Math.round(progress)}%`
                  : results.length > 0
                    ? "重新处理"
                    : mode === "ai"
                      ? "AI 一键移除背景"
                      : "开始处理"}
              </span>
              {processing && mode === "ai" && aiPhase && (
                <span className="text-xs text-emerald-200/70">
                  {aiPhase === "download" && "正在下载 AI 模型..."}
                  {aiPhase === "inference" && "AI 推理中..."}
                  {aiPhase === "init" && "初始化..."}
                  {aiPhase === "processing" && "处理中..."}
                </span>
              )}
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
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
                                const files = results.map((r) => new File([r.blob], r.name, { type: "image/png" }));
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
