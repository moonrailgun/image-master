"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { ImageCompare } from "./ImageCompare";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  inpaintImage,
  isModelCached,
  InpaintingResult,
  InpaintingProgress,
} from "../lib/image-inpainting";
import { downloadSingle } from "../lib/download";
import type { TransferData } from "../page";

interface ImageInpaintingProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onSendToTransform?: (files: File[]) => void;
  onSendToCrop?: (files: File[]) => void;
  onSendToVectorize?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

export function ImageInpainting({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onSendToUpscale,
  onSendToResize,
  onSendToCompress,
  onSendToTransform,
  onSendToCrop,
  onSendToVectorize,
  onHasFilesChange,
  isActive = true,
}: ImageInpaintingProps) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<InpaintingResult | null>(null);
  const [progressInfo, setProgressInfo] = useState<InpaintingProgress | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // Brush settings
  const [brushSize, setBrushSize] = useState(20);
  const [modelCached, setModelCached] = useState(false);

  // Fullscreen editor mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Cursor position for brush preview
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Canvas refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenImageCanvasRef = useRef<HTMLCanvasElement>(null);
  const fullscreenMaskCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);

  // Mask history for undo
  const maskHistoryRef = useRef<ImageData[]>([]);
  const [canUndo, setCanUndo] = useState(false);

  // Compare mode toggle
  const [showCompare, setShowCompare] = useState(false);

  // Check if model is cached
  useEffect(() => {
    const checkCache = async () => {
      const cached = await isModelCached();
      setModelCached(cached);
    };
    checkCache();
  }, []);

  useEffect(() => {
    onHasFilesChange?.(file !== null);
  }, [file, onHasFilesChange]);

  const handleFilesSelected = useCallback((selectedFiles: File[]) => {
    if (selectedFiles.length > 0) {
      setFile(selectedFiles[0]);
      setResult(null);
      maskHistoryRef.current = [];
      setCanUndo(false);
    }
  }, []);

  // Handle incoming transfer from other module
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (pendingTransfer && pendingTransfer.files.length > 0 && pendingTransfer !== lastTransferRef.current) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        handleFilesSelected(pendingTransfer.files);
        onTransferConsumed?.();
      });
    }
  }, [pendingTransfer, onTransferConsumed, handleFilesSelected]);

  // Load image and setup canvases
  useEffect(() => {
    if (!file) {
      setImageUrl(null);
      setImageDimensions(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setImageUrl(url);

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.width, height: img.height });

      // Setup image canvas
      const imageCanvas = imageCanvasRef.current;
      const maskCanvas = maskCanvasRef.current;
      if (imageCanvas && maskCanvas) {
        imageCanvas.width = img.width;
        imageCanvas.height = img.height;
        maskCanvas.width = img.width;
        maskCanvas.height = img.height;

        const imageCtx = imageCanvas.getContext("2d")!;
        imageCtx.drawImage(img, 0, 0);

        // Clear mask canvas
        const maskCtx = maskCanvas.getContext("2d")!;
        maskCtx.clearRect(0, 0, img.width, img.height);

        // Reset history
        maskHistoryRef.current = [];
        setCanUndo(false);
      }
    };
    img.src = url;

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  // Sync fullscreen canvases when opening fullscreen mode
  useEffect(() => {
    if (isFullscreen && imageDimensions && imageUrl) {
      const fullscreenImageCanvas = fullscreenImageCanvasRef.current;
      const fullscreenMaskCanvas = fullscreenMaskCanvasRef.current;
      const mainMaskCanvas = maskCanvasRef.current;

      if (fullscreenImageCanvas && fullscreenMaskCanvas && mainMaskCanvas) {
        fullscreenImageCanvas.width = imageDimensions.width;
        fullscreenImageCanvas.height = imageDimensions.height;
        fullscreenMaskCanvas.width = imageDimensions.width;
        fullscreenMaskCanvas.height = imageDimensions.height;

        // Draw image
        const img = new Image();
        img.onload = () => {
          const ctx = fullscreenImageCanvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0);
        };
        img.src = imageUrl;

        // Copy mask from main canvas
        const mainCtx = mainMaskCanvas.getContext("2d")!;
        const maskData = mainCtx.getImageData(0, 0, mainMaskCanvas.width, mainMaskCanvas.height);
        const fullscreenMaskCtx = fullscreenMaskCanvas.getContext("2d")!;
        fullscreenMaskCtx.putImageData(maskData, 0, 0);
      }
    }
  }, [isFullscreen, imageDimensions, imageUrl]);

  // Sync mask back to main canvas when closing fullscreen
  const syncMaskToMain = useCallback(() => {
    const fullscreenMaskCanvas = fullscreenMaskCanvasRef.current;
    const mainMaskCanvas = maskCanvasRef.current;

    if (fullscreenMaskCanvas && mainMaskCanvas) {
      const fullscreenCtx = fullscreenMaskCanvas.getContext("2d")!;
      const maskData = fullscreenCtx.getImageData(0, 0, fullscreenMaskCanvas.width, fullscreenMaskCanvas.height);
      const mainCtx = mainMaskCanvas.getContext("2d")!;
      mainCtx.putImageData(maskData, 0, 0);
    }
  }, []);

  // Get canvas coordinates from mouse/touch event
  const getCanvasCoords = useCallback((
    e: React.MouseEvent | React.TouchEvent,
    canvas: HTMLCanvasElement | null,
    dimensions: { width: number; height: number } | null
  ) => {
    if (!canvas || !dimensions) return null;

    const rect = canvas.getBoundingClientRect();
    const scaleX = dimensions.width / rect.width;
    const scaleY = dimensions.height / rect.height;

    let clientX: number, clientY: number;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
      screenX: clientX - rect.left,
      screenY: clientY - rect.top,
      scale: rect.width / dimensions.width,
    };
  }, []);

  // Save current mask state for undo
  const saveMaskState = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    maskHistoryRef.current.push(imageData);
    setCanUndo(true);

    // Limit history size
    if (maskHistoryRef.current.length > 20) {
      maskHistoryRef.current.shift();
    }
  }, []);

  // Draw on mask canvas with solid color (opacity handled via CSS)
  const drawBrush = useCallback((canvas: HTMLCanvasElement, x: number, y: number) => {
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgb(239, 68, 68)"; // Solid red, opacity via CSS
    ctx.beginPath();
    ctx.arc(x, y, brushSize / 2, 0, Math.PI * 2);
    ctx.fill();
  }, [brushSize]);

  // Draw line between two points
  const drawLine = useCallback((canvas: HTMLCanvasElement, x1: number, y1: number, x2: number, y2: number) => {
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "rgb(239, 68, 68)"; // Solid red, opacity via CSS
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }, [brushSize]);

  // Create pointer handlers for a specific canvas
  const createPointerHandlers = useCallback((
    getMaskCanvas: () => HTMLCanvasElement | null,
    getDimensions: () => { width: number; height: number } | null
  ) => {
    const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const canvas = getMaskCanvas();
      const coords = getCanvasCoords(e, canvas, getDimensions());
      if (!coords || !canvas) return;

      saveMaskState(canvas);
      isDrawingRef.current = true;
      lastPosRef.current = { x: coords.x, y: coords.y };
      drawBrush(canvas, coords.x, coords.y);
    };

    const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
      e.preventDefault();
      const canvas = getMaskCanvas();
      const coords = getCanvasCoords(e, canvas, getDimensions());

      if (coords) {
        setCursorPos({ x: coords.screenX, y: coords.screenY });
      }

      if (!isDrawingRef.current || !coords || !canvas) return;

      if (lastPosRef.current) {
        drawLine(canvas, lastPosRef.current.x, lastPosRef.current.y, coords.x, coords.y);
      }
      drawBrush(canvas, coords.x, coords.y);
      lastPosRef.current = { x: coords.x, y: coords.y };
    };

    const handlePointerUp = () => {
      isDrawingRef.current = false;
      lastPosRef.current = null;
    };

    const handlePointerLeave = () => {
      setCursorPos(null);
      handlePointerUp();
    };

    return { handlePointerDown, handlePointerMove, handlePointerUp, handlePointerLeave };
  }, [getCanvasCoords, saveMaskState, drawBrush, drawLine]);

  // Fullscreen canvas handlers
  const fullscreenHandlers = createPointerHandlers(
    () => fullscreenMaskCanvasRef.current,
    () => imageDimensions
  );

  const handleUndo = useCallback((canvas: HTMLCanvasElement) => {
    if (maskHistoryRef.current.length === 0) return;

    const ctx = canvas.getContext("2d")!;
    const previousState = maskHistoryRef.current.pop();
    if (previousState) {
      ctx.putImageData(previousState, 0, 0);
    }
    setCanUndo(maskHistoryRef.current.length > 0);
  }, []);

  const handleClearMask = useCallback((canvas: HTMLCanvasElement) => {
    saveMaskState(canvas);
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, [saveMaskState]);

  // Get mask as ImageData
  const getMaskImageData = useCallback((): ImageData | null => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return null;

    const ctx = maskCanvas.getContext("2d")!;
    const imageData = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);

    // Check if mask has any painted areas
    let hasMask = false;
    for (let i = 3; i < imageData.data.length; i += 4) {
      if (imageData.data[i] > 0) {
        hasMask = true;
        break;
      }
    }

    if (!hasMask) return null;

    return imageData;
  }, []);

  const handleProcess = useCallback(async () => {
    if (!file) return;

    const maskImageData = getMaskImageData();
    if (!maskImageData) {
      showToast("请先涂抹需要修复的区域", "error");
      return;
    }

    setProcessing(true);
    setIsFullscreen(false);
    setProgressInfo({ stage: "processing", progress: 0, message: "准备中..." });

    try {
      const result = await inpaintImage(file, maskImageData, (progress) => {
        setProgressInfo(progress);
      });

      setResult(result);
      showToast("图片修复完成", "success");

      // Update cache status
      const cached = await isModelCached();
      setModelCached(cached);
    } catch (error) {
      console.error("Inpainting failed:", error);
      const errorMessage = error instanceof Error ? error.message : "未知错误";
      showToast(`修复失败: ${errorMessage}`, "error");
    } finally {
      setProcessing(false);
      setProgressInfo(null);
    }
  }, [file, getMaskImageData, showToast]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    downloadSingle(result.blob, result.name);
  }, [result]);

  const handleClear = useCallback(() => {
    setFile(null);
    setResult(null);
    setProgressInfo(null);
    maskHistoryRef.current = [];
    setCanUndo(false);
  }, []);

  // Use result as new input for further inpainting
  const handleUseResultAsInput = useCallback(() => {
    if (!result) return;

    // Create a new File from the result blob
    const newFile = new File([result.blob], result.name, { type: "image/png" });
    setFile(newFile);
    setResult(null);
    maskHistoryRef.current = [];
    setCanUndo(false);
    showToast("已将修复结果设为新输入，可继续涂抹修复", "success");
  }, [result, showToast]);

  const handleCloseFullscreen = useCallback(() => {
    syncMaskToMain();
    setIsFullscreen(false);
    setCursorPos(null);
  }, [syncMaskToMain]);

  const progressPercent = progressInfo?.progress ?? 0;

  // Calculate brush preview size based on canvas scale
  const getBrushPreviewSize = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas || !imageDimensions) return brushSize;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / imageDimensions.width;
    return brushSize * scale;
  }, [brushSize, imageDimensions]);

  // Handle mouse wheel to adjust brush size
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -5 : 5;
    setBrushSize((prev) => Math.min(100, Math.max(5, prev + delta)));
  }, []);

  // No file - show dropzone only
  if (!file) {
    return (
      <div className="flex flex-col gap-6">
        <ImageDropzone
          onFilesSelected={handleFilesSelected}
          pasteEnabled={isActive}
          multiple={false}
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

  // Has file - show painting interface
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column - Canvas & Controls */}
        <div className="flex flex-col gap-4">
          {/* Canvas container */}
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">涂抹需要修复的区域</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClear}
                  className="text-sm text-zinc-500 hover:text-zinc-300"
                >
                  更换图片
                </button>
              </div>
            </div>

            {/* Canvas wrapper - clickable to open fullscreen */}
            <div
              ref={containerRef}
              className="group relative mx-auto cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] transition-all hover:border-emerald-500/50"
              style={{
                maxWidth: "100%",
                aspectRatio: imageDimensions ? `${imageDimensions.width} / ${imageDimensions.height}` : "auto",
              }}
              onClick={() => setIsFullscreen(true)}
            >
              <canvas
                ref={imageCanvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ imageRendering: "auto" }}
              />
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 h-full w-full"
                style={{ imageRendering: "auto", opacity: 0.5 }}
              />
              {/* Fullscreen hint overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                <div className="flex flex-col items-center gap-2 text-white">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  <span className="text-sm font-medium">点击放大编辑</span>
                </div>
              </div>
            </div>

            {/* Brush size info */}
            <p className="mt-2 text-center text-xs text-zinc-500">
              点击图片可在更大的窗口中进行涂抹编辑
            </p>
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
              <span>首次使用需下载模型（~27MB），之后会自动缓存</span>
            </div>
          )}
        </div>

        {/* Right column - Results */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-300">修复结果</span>
                {result && (
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm text-zinc-400 hover:text-zinc-300">
                    <input
                      type="checkbox"
                      checked={showCompare}
                      onChange={(e) => setShowCompare(e.target.checked)}
                      className="h-4 w-4 rounded border-zinc-600 bg-zinc-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
                    />
                    对比
                  </label>
                )}
              </div>
              {result && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleUseResultAsInput}
                    className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                    title="将修复结果作为新输入继续修复"
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
                    继续修复
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
                    下载图片
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                              ),
                              onClick: async () => {
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
                                onSendToTransform(files);
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                                const files = [new File([result.blob], result.name, { type: "image/png" })];
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
                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  <span>{Math.round(progressPercent)}%</span>
                </div>
              </div>
            ) : result ? (
              showCompare ? (
                <div className="overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px]">
                  <ImageCompare
                    beforeSrc={imageUrl || undefined}
                    afterBlob={result.blob}
                    beforeAlt="原图"
                    afterAlt={result.name}
                    className="max-h-[400px] w-full"
                  />
                </div>
              ) : (
                <div
                  className="group relative mx-auto cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] transition-all hover:border-emerald-500/50"
                  onClick={() => setLightboxImage({ blob: result.blob, alt: result.name })}
                >
                  <ResultPreview result={result} />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                    <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                    </svg>
                  </div>
                </div>
              )
            ) : (
              <div className="flex min-h-[200px] items-center justify-center text-zinc-600">
                <p>涂抹需要修复的区域后，点击「开始修复」</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Fullscreen Editor Modal */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
          {/* Header */}
          <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900/95 px-6 py-4 backdrop-blur">
            <div className="flex items-center gap-4">
              <h3 className="text-lg font-medium text-white">涂抹编辑</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fullscreenMaskCanvasRef.current && handleUndo(fullscreenMaskCanvasRef.current)}
                  disabled={!canUndo}
                  className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  撤销
                </button>
                <button
                  onClick={() => fullscreenMaskCanvasRef.current && handleClearMask(fullscreenMaskCanvasRef.current)}
                  className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-600"
                >
                  清除涂抹
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Brush size control */}
              <div className="flex items-center gap-3">
                <span className="text-sm text-zinc-400">画笔大小:</span>
                <input
                  type="range"
                  min="5"
                  max="100"
                  value={brushSize}
                  onChange={(e) => setBrushSize(Number(e.target.value))}
                  className="w-32 accent-emerald-500"
                />
                <div
                  className="flex shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-800"
                  style={{ width: 40, height: 40 }}
                >
                  <div
                    className="rounded-full"
                    style={{
                      width: Math.min(brushSize * 0.35, 30),
                      height: Math.min(brushSize * 0.35, 30),
                      backgroundColor: "rgba(239, 68, 68, 0.4)",
                      border: "1px solid rgba(239, 68, 68, 0.8)",
                    }}
                  />
                </div>
                <span className="w-12 text-sm font-medium text-emerald-400">{brushSize}px</span>
              </div>
              <button
                onClick={handleCloseFullscreen}
                className="rounded-lg bg-zinc-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-600"
              >
                取消
              </button>
              <button
                onClick={() => {
                  syncMaskToMain();
                  handleProcess();
                }}
                disabled={processing}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                修复
              </button>
            </div>
          </div>

          {/* Canvas area */}
          <div
            className="relative mt-20 max-h-[calc(100vh-160px)] max-w-[calc(100vw-80px)] overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px]"
            style={{
              aspectRatio: imageDimensions ? `${imageDimensions.width} / ${imageDimensions.height}` : "auto",
            }}
          >
            <canvas
              ref={fullscreenImageCanvasRef}
              className="h-full w-full"
              style={{ imageRendering: "auto" }}
            />
            <canvas
              ref={fullscreenMaskCanvasRef}
              className="absolute inset-0 h-full w-full"
              style={{ imageRendering: "auto", cursor: "none", opacity: 0.5 }}
              onMouseDown={fullscreenHandlers.handlePointerDown}
              onMouseMove={fullscreenHandlers.handlePointerMove}
              onMouseUp={fullscreenHandlers.handlePointerUp}
              onMouseLeave={fullscreenHandlers.handlePointerLeave}
              onTouchStart={fullscreenHandlers.handlePointerDown}
              onTouchMove={fullscreenHandlers.handlePointerMove}
              onTouchEnd={fullscreenHandlers.handlePointerUp}
              onWheel={handleWheel}
            />
            {/* Custom cursor */}
            {cursorPos && (
              <div
                className="pointer-events-none absolute rounded-full border-2 border-white/80"
                style={{
                  width: getBrushPreviewSize(fullscreenMaskCanvasRef.current),
                  height: getBrushPreviewSize(fullscreenMaskCanvasRef.current),
                  left: cursorPos.x - getBrushPreviewSize(fullscreenMaskCanvasRef.current) / 2,
                  top: cursorPos.y - getBrushPreviewSize(fullscreenMaskCanvasRef.current) / 2,
                  backgroundColor: "rgba(239, 68, 68, 0.3)",
                }}
              />
            )}
          </div>

          {/* Footer hint */}
          <div className="absolute bottom-4 left-0 right-0 text-center text-sm text-zinc-500">
            使用鼠标拖动涂抹需要修复的区域 · 滚动鼠标滚轮调整画笔大小
          </div>
        </div>
      )}

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

function ResultPreview({ result }: { result: InpaintingResult }) {
  const [url] = useState(() => URL.createObjectURL(result.blob));

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={result.name}
      className="max-h-[400px] w-full object-contain"
    />
  );
}
