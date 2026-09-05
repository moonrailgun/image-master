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
  channelMatting,
  getChannelValue,
  RemoveResult,
  RemoveBackgroundOptions,
  AIModel,
  ChannelSource,
} from "../lib/background-remover";
import { downloadAsZip, downloadSingle, DownloadItem } from "../lib/download";
import {
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "../lib/analytics";
import type { TransferData } from "../types";

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

  // Mode: "color" for color-based, "ai" for AI-powered, "channel" for channel matting
  const [mode, setMode] = useState<"color" | "ai" | "channel">("color");

  // AI options
  const [aiModel, setAiModel] = useState<AIModel>("isnet");
  const [refineEdges, setRefineEdges] = useState(false);
  const [aiPhase, setAiPhase] = useState("");

  // Channel matting options
  const [channelSource, setChannelSource] = useState<ChannelSource>("luminance");
  const [channelMin, setChannelMin] = useState(0);
  const [channelMax, setChannelMax] = useState(255);
  const [channelInvert, setChannelInvert] = useState(false);

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
  const [chromaKey, setChromaKey] = useState(true);
  const [seedPoints, setSeedPoints] = useState<SeedPoint[]>([]);
  const [edgeShrink, setEdgeShrink] = useState(0);

  // Handle incoming transfer from other module
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0 && pendingTransfer !== lastTransferRef.current) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        trackToolImport("background", "transfer", pendingTransfer.files.length);
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

    const startedAt = trackToolProcessStart("background", files.length);
    let lastError: unknown;
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
            refineEdges,
            edgeShrink,
            onProgress: (phase, ratio) => {
              setAiPhase(phase);
              const fileBase = i / files.length;
              const fileShare = 1 / files.length;
              setProgress((fileBase + fileShare * ratio) * 100);
            },
          });
        } else if (mode === "channel") {
          result = await channelMatting(file, {
            channel: channelSource,
            minThreshold: channelMin,
            maxThreshold: channelMax,
            invert: channelInvert,
            feather,
            edgeShrink,
          });
        } else {
          const options: RemoveBackgroundOptions = {
            tolerance,
            contiguousOnly,
            targetColor: targetColor ?? undefined,
            feather,
            antiAlias,
            chromaKey,
            edgeShrink,
            seedPoints: seedPoints.length > 0 ? seedPoints : undefined,
          };
          result = await removeBackground(file, options);
        }
        processed.push(result);
      } catch (error) {
        lastError = error;
        console.error(`Failed to process ${file.name}:`, error);
      }
      if (mode !== "ai") {
        setProgress(((i + 1) / files.length) * 100);
      }
    }

    setResults(processed);
    setResultsVersion((v) => v + 1);
    if (processed.length > 0) {
      trackToolProcessSuccess(
        "background",
        files.length,
        processed.length,
        startedAt
      );
    } else {
      trackToolProcessFailure(
        "background",
        files.length,
        startedAt,
        lastError
      );
    }
    setProcessing(false);
    setAiPhase("");
  }, [
    files,
    mode,
    aiModel,
    refineEdges,
    tolerance,
    contiguousOnly,
    targetColor,
    feather,
    antiAlias,
    chromaKey,
    edgeShrink,
    seedPoints,
    channelSource,
    channelMin,
    channelMax,
    channelInvert,
  ]);

  const handleDownload = useCallback(async () => {
    if (results.length === 0) return;

    if (results.length === 1) {
      downloadSingle(results[0].blob, results[0].name);
      trackToolDownload("background", 1, "single");
    } else {
      const items: DownloadItem[] = results.map((result) => ({
        name: result.name,
        blob: result.blob,
      }));
      await downloadAsZip(items, "transparent-images.zip");
      trackToolDownload("background", results.length, "zip");
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
        <ImageDropzone tool="background" onFilesSelected={handleFilesSelected} pasteEnabled={isActive} />
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
                按颜色
              </button>
              <button
                onClick={() => setMode("channel")}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all ${
                  mode === "channel"
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                按通道
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
                AI 智能
              </button>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-4 rounded-xl bg-zinc-800/50 p-4">
            <h3 className="font-medium text-zinc-300">处理选项</h3>

            {mode === "channel" ? (
              <>
                {/* Channel source selector */}
                <div className="space-y-2">
                  <label className="text-sm text-zinc-400">通道来源</label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { value: "red" as ChannelSource, label: "红色", color: "bg-red-500" },
                      { value: "green" as ChannelSource, label: "绿色", color: "bg-green-500" },
                      { value: "blue" as ChannelSource, label: "蓝色", color: "bg-blue-500" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setChannelSource(opt.value)}
                        className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-sm font-medium transition-all ${
                          channelSource === opt.value
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        <span className={`h-2.5 w-2.5 rounded-full ${opt.color}`} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: "luminance" as ChannelSource, label: "亮度" },
                      { value: "saturation" as ChannelSource, label: "饱和度" },
                    ]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setChannelSource(opt.value)}
                        className={`rounded-lg border p-2 text-sm font-medium transition-all ${
                          channelSource === opt.value
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                            : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Channel histogram + threshold controls */}
                {files.length > 0 && (
                  <ChannelHistogram
                    file={files[0]}
                    channel={channelSource}
                    min={channelMin}
                    max={channelMax}
                    onMinChange={setChannelMin}
                    onMaxChange={setChannelMax}
                  />
                )}

                {/* Invert toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm text-zinc-400">反转遮罩</label>
                    <p className="text-xs text-zinc-500">
                      反转透明/不透明区域
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChannelInvert(!channelInvert)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      channelInvert ? "bg-emerald-600" : "bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        channelInvert ? "left-5" : "left-0.5"
                      }`}
                    />
                  </button>
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
                </div>

                {/* Edge shrink slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-400">边缘收缩</label>
                    <span className="text-sm font-medium text-emerald-400">
                      {edgeShrink}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={edgeShrink}
                    onChange={(e) => setEdgeShrink(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                </div>

                {/* Alpha mask preview */}
                {files.length > 0 && (
                  <ChannelPreview
                    file={files[0]}
                    channel={channelSource}
                    min={channelMin}
                    max={channelMax}
                    invert={channelInvert}
                  />
                )}

                <div className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-3">
                  <div className="flex items-start gap-2">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-zinc-400">
                      通道抠图通过分析图片的颜色通道值来提取内容。在直方图中观察通道值分布，调整阈值范围选中目标区域即可抠出。适合绿幕/蓝幕、白纸黑字等前后景在某通道上有明显差异的场景。已有的半透明像素会被保留。
                    </p>
                  </div>
                </div>
              </>
            ) : mode === "ai" ? (
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

                {/* Edge shrink slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-400">边缘收缩</label>
                    <span className="text-sm font-medium text-emerald-400">
                      {edgeShrink}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={edgeShrink}
                    onChange={(e) => setEdgeShrink(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <p className="text-xs text-zinc-500">
                    向内收缩前景边缘，移除残留的背景像素
                  </p>
                </div>

                <details className="rounded-lg border border-zinc-700/50 bg-zinc-900/40 p-3">
                  <summary className="cursor-pointer text-sm text-zinc-300">进阶</summary>
                  <div className="mt-3 space-y-2">
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={refineEdges}
                        disabled={processing}
                        onChange={(event) => setRefineEdges(event.target.checked)}
                        aria-describedby="matting-description"
                        className="h-4 w-4 accent-emerald-500"
                      />
                      边缘精修
                      <span className="text-xs text-zinc-500">实验性</span>
                    </label>
                    <p id="matting-description" className="text-xs leading-relaxed text-zinc-500">
                      尝试改善发丝、毛发和半透明边缘。首次开启需额外下载约 28MB 模型，会增加处理时间；大图会缩小后精修，导出保持原尺寸。精修失败时保留初步抠图结果。
                    </p>
                  </div>
                </details>

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

                {/* Edge shrink slider */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm text-zinc-400">边缘收缩</label>
                    <span className="text-sm font-medium text-emerald-400">
                      {edgeShrink}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={edgeShrink}
                    onChange={(e) => setEdgeShrink(Number(e.target.value))}
                    className="w-full accent-emerald-500"
                  />
                  <p className="text-xs text-zinc-500">
                    向内收缩前景边缘，移除残留的背景像素
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

                {/* Chroma key toggle */}
                <div className="flex items-center justify-between">
                  <div>
                    <label
                      htmlFor="chroma-key-toggle"
                      className="text-sm text-zinc-400"
                    >
                      Chroma key
                    </label>
                    <p className="text-xs text-zinc-500">
                      适合绿幕或纯色背景，仅净化抠图边缘并减少溢色锯齿
                    </p>
                  </div>
                  <button
                    id="chroma-key-toggle"
                    type="button"
                    role="switch"
                    aria-checked={chromaKey}
                    onClick={() => setChromaKey(!chromaKey)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      chromaKey ? "bg-emerald-600" : "bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        chromaKey ? "left-5" : "left-0.5"
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
                      已自动关闭&quot;仅处理连续像素&quot;，将移除图片中所有匹配的颜色
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
                      : mode === "channel"
                        ? "通道抠图"
                        : "开始处理"}
              </span>
              {processing && mode === "ai" && aiPhase && (
                <span className="text-xs text-emerald-200/70">
                  {aiPhase === "download" && "正在下载 AI 模型..."}
                  {aiPhase === "inference" && "AI 推理中..."}
                  {aiPhase === "init" && "初始化..."}
                  {aiPhase === "processing" && "处理中..."}
                  {aiPhase === "matting-download" && "正在加载边缘精修模型..."}
                  {aiPhase === "matting-inference" && "正在精修边缘，可能需要较长时间..."}
                </span>
              )}
            </span>
          </button>
        </div>

        {/* Right column - Results */}
        <div className="flex flex-col gap-4">
          {results.some((result) => result.warning) && (
            <div role="status" className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              {results.filter((result) => result.warning).map((result, index) => (
                <p key={index} className="break-all">{result.name}：{result.warning}</p>
              ))}
            </div>
          )}
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
                    onSendToCurrent={() => handleFilesSelected(
                      results.map((r) => new File([r.blob], r.name, { type: r.blob.type }))
                    )}
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
                <p>点击&quot;开始处理&quot;处理图片</p>
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

/**
 * Histogram showing input image's channel value distribution
 * with two draggable threshold markers.
 */
function ChannelHistogram({
  file,
  channel,
  min,
  max,
  onMinChange,
  onMaxChange,
}: {
  file: File;
  channel: ChannelSource;
  min: number;
  max: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const histogramRef = useRef<number[]>(new Array(256).fill(0));
  const draggingRef = useRef<"min" | "max" | null>(null);

  const HIST_H = 110;
  const HANDLE_H = 18;
  const CANVAS_H = HIST_H + HANDLE_H;

  useEffect(() => {
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, img.width, img.height).data;

      const hist = new Array(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        // Weight by existing alpha for semi-transparent pixels
        const alpha = data[i + 3];
        if (alpha === 0) continue;
        const v = Math.round(
          Math.max(0, Math.min(255, getChannelValue(data[i], data[i + 1], data[i + 2], channel)))
        );
        hist[v] += alpha / 255;
      }
      histogramRef.current = hist;
      URL.revokeObjectURL(url);
      drawHistogram();
    };
    img.src = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, channel]);

  const drawHistogram = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const w = canvas.width;
    const hist = histogramRef.current;

    ctx.clearRect(0, 0, w, CANVAS_H);

    // Background
    ctx.fillStyle = "#18181b";
    ctx.fillRect(0, 0, w, HIST_H);

    // Bottom gradient bar (0→255 reference)
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#000");
    grad.addColorStop(1, "#fff");
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.12;
    ctx.fillRect(0, HIST_H - 3, w, 3);
    ctx.globalAlpha = 1;

    // Normalization: clip top 0.5% to avoid spike domination
    const sorted = [...hist].sort((a, b) => b - a);
    const maxVal = Math.max(1, sorted[Math.max(1, Math.floor(256 * 0.005))]);

    const minX = (min / 255) * w;
    const maxX = (max / 255) * w;

    // Highlight selected range
    ctx.fillStyle = "rgba(16, 185, 129, 0.06)";
    ctx.fillRect(minX, 0, maxX - minX, HIST_H);

    // Threshold lines
    ctx.strokeStyle = "rgba(16, 185, 129, 0.5)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(minX, 0);
    ctx.lineTo(minX, HIST_H);
    ctx.moveTo(maxX, 0);
    ctx.lineTo(maxX, HIST_H);
    ctx.stroke();
    ctx.setLineDash([]);

    // Histogram bars
    const barW = w / 256;
    for (let i = 0; i < 256; i++) {
      const h = Math.min(HIST_H - 8, (hist[i] / maxVal) * (HIST_H - 8));
      if (h < 0.5) continue;
      const x = (i / 255) * w;
      ctx.fillStyle = i >= min && i <= max
        ? "rgba(16, 185, 129, 0.65)"
        : "rgba(113, 113, 122, 0.25)";
      ctx.fillRect(x, HIST_H - 4 - h, Math.max(1, barW - 0.5), h);
    }

    // Handle track
    ctx.fillStyle = "#09090b";
    ctx.fillRect(0, HIST_H, w, HANDLE_H);
    const trackGrad = ctx.createLinearGradient(0, 0, w, 0);
    trackGrad.addColorStop(0, "#27272a");
    trackGrad.addColorStop(1, "#52525b");
    ctx.fillStyle = trackGrad;
    ctx.fillRect(0, HIST_H + 1, w, 2);

    // Selected range bar
    ctx.fillStyle = "rgba(16, 185, 129, 0.3)";
    ctx.fillRect(minX, HIST_H + 1, maxX - minX, 2);

    // Handles
    drawTriHandle(ctx, minX, HIST_H + 4, "#18181b", "#10b981");
    drawTriHandle(ctx, maxX, HIST_H + 4, "#fafafa", "#10b981");
  }, [min, max, HIST_H, CANVAS_H]);

  useEffect(() => {
    drawHistogram();
  }, [drawHistogram]);

  const getValueFromX = useCallback((clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return 0;
    const rect = canvas.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(255, ((clientX - rect.left) / rect.width) * 255)));
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;

    const w = rect.width;
    const minX = (min / 255) * w;
    const maxX = (max / 255) * w;

    const distMin = Math.abs(x - minX);
    const distMax = Math.abs(x - maxX);

    if (Math.min(distMin, distMax) > 24) return;

    draggingRef.current = distMin <= distMax ? "min" : "max";
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [min, max]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const v = getValueFromX(e.clientX);
    if (draggingRef.current === "min") {
      onMinChange(Math.min(v, max - 1));
    } else {
      onMaxChange(Math.max(v, min + 1));
    }
  }, [min, max, getValueFromX, onMinChange, onMaxChange]);

  const handlePointerUp = useCallback(() => {
    draggingRef.current = null;
  }, []);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-sm text-zinc-400">通道直方图</label>
        <div className="flex gap-3 text-xs text-zinc-500">
          <span>最小: <span className="text-emerald-400">{min}</span></span>
          <span>最大: <span className="text-emerald-400">{max}</span></span>
        </div>
      </div>
      <div className="overflow-hidden rounded-lg border border-zinc-700">
        <canvas
          ref={canvasRef}
          width={512}
          height={CANVAS_H}
          className="w-full cursor-pointer"
          style={{ height: CANVAS_H }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>
      <p className="text-xs text-zinc-500">
        绿色区域为选中的通道值范围，拖拽底部三角形调整阈值
      </p>
    </div>
  );
}

function drawTriHandle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  fill: string,
  stroke: string
) {
  const size = 6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size, y + size * 1.5);
  ctx.lineTo(x + size, y + size * 1.5);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function ChannelPreview({
  file,
  channel,
  min,
  max,
  invert,
}: {
  file: File;
  channel: ChannelSource;
  min: number;
  max: number;
  invert: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !file) return;

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const { data } = imageData;

      const softEdge = Math.max(Math.min((max - min) * 0.08, 8), 1);

      // Build LUT
      const lut = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        let alpha: number;
        if (v < min - softEdge || v > max + softEdge) {
          alpha = 0;
        } else if (v < min) {
          const t = (v - (min - softEdge)) / softEdge;
          alpha = t * t * (3 - 2 * t) * 255;
        } else if (v > max) {
          const t = ((max + softEdge) - v) / softEdge;
          alpha = t * t * (3 - 2 * t) * 255;
        } else {
          alpha = 255;
        }
        if (invert) alpha = 255 - alpha;
        lut[v] = Math.round(alpha);
      }

      for (let i = 0; i < data.length; i += 4) {
        const origAlpha = data[i + 3];
        if (origAlpha === 0) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          continue;
        }
        const value = Math.round(
          Math.max(0, Math.min(255, getChannelValue(data[i], data[i + 1], data[i + 2], channel)))
        );
        const alpha = Math.round((origAlpha / 255) * lut[value]);
        data[i] = alpha;
        data[i + 1] = alpha;
        data[i + 2] = alpha;
        data[i + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [file, channel, min, max, invert]);

  return (
    <div className="space-y-1.5">
      <label className="text-sm text-zinc-400">Alpha 遮罩预览</label>
      <div className="overflow-hidden rounded-lg border border-zinc-700">
        <canvas
          ref={canvasRef}
          className="h-auto max-h-32 w-full object-contain"
        />
      </div>
      <p className="text-xs text-zinc-500">
        白色 = 保留，黑色 = 透明
      </p>
    </div>
  );
}
