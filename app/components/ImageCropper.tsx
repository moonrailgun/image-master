"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { ImageDropzone } from "./ImageDropzone";
import { ImageLightbox } from "./ImageLightbox";
import { DropdownMenu } from "./DropdownMenu";
import { useToast } from "./Toast";
import {
  cropImage,
  blobToFile,
  CropArea,
  getInitialCropArea,
  clamp,
  getImageDataFromFile,
  getTrimTransparentArea,
} from "../lib/image-cropper";
import { downloadSingle } from "../lib/download";
import {
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "../lib/analytics";
import type { TransferData } from "../types";

interface ImageCropperProps {
  pendingTransfer?: TransferData | null;
  onTransferConsumed?: () => void;
  onSendToSprite?: (files: File[]) => void;
  onSendToBackground?: (files: File[]) => void;
  onSendToUpscale?: (files: File[]) => void;
  onSendToResize?: (files: File[]) => void;
  onSendToCompress?: (files: File[]) => void;
  onSendToTransform?: (files: File[]) => void;
  onSendToInpaint?: (files: File[]) => void;
  onSendToVectorize?: (files: File[]) => void;
  onHasFilesChange?: (hasFiles: boolean) => void;
  isActive?: boolean;
}

type DragHandle =
  | "move"
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "e"
  | "w"
  | null;

export function ImageCropper({
  pendingTransfer,
  onTransferConsumed,
  onSendToSprite,
  onSendToBackground,
  onSendToUpscale,
  onSendToResize,
  onSendToCompress,
  onSendToTransform,
  onSendToInpaint,
  onSendToVectorize,
  onHasFilesChange,
  isActive = true,
}: ImageCropperProps) {
  const { showToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [cropArea, setCropArea] = useState<CropArea>({
    x: 0,
    y: 0,
    width: 100,
    height: 100,
  });
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{
    blob: Blob;
    width: number;
    height: number;
  } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{
    src?: string;
    blob?: Blob;
    alt: string;
  } | null>(null);

  // Fullscreen mode
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto trim transparent pixels
  const [trimPadding, setTrimPadding] = useState(0);

  // Drag state
  const [dragging, setDragging] = useState<DragHandle>(null);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    cropArea: CropArea;
  } | null>(null);

  // Container refs
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Display metrics (scale and offset for proper alignment)
  const [displayMetrics, setDisplayMetrics] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    displayWidth: 0,
    displayHeight: 0,
  });

  useEffect(() => {
    onHasFilesChange?.(file !== null);
  }, [file, onHasFilesChange]);

  // Handle incoming transfer from other module
  const lastTransferRef = useRef<TransferData | null>(null);
  useEffect(() => {
    if (
      pendingTransfer &&
      pendingTransfer.files.length > 0 &&
      pendingTransfer !== lastTransferRef.current
    ) {
      lastTransferRef.current = pendingTransfer;
      queueMicrotask(() => {
        trackToolImport("crop", "transfer", 1);
        handleFilesSelected(pendingTransfer.files);
        onTransferConsumed?.();
      });
    }
  }, [pendingTransfer, onTransferConsumed]);

  // Cleanup image URL
  useEffect(() => {
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [imageUrl]);

  const handleFilesSelected = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const selectedFile = files[0];
    setFile(selectedFile);
    setResult(null);

    // Create preview URL
    const url = URL.createObjectURL(selectedFile);
    setImageUrl(url);

    // Load image to get dimensions
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      setCropArea(getInitialCropArea(img.width, img.height));
    };
    img.src = url;
  }, []);

  // Calculate display metrics when image loads or container resizes
  const updateDisplayMetrics = useCallback(() => {
    if (!imageRef.current || !containerRef.current || !imageSize) return;

    const container = containerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;

    // Calculate the scale to fit image in container
    const scaleX = containerWidth / imageSize.width;
    const scaleY = containerHeight / imageSize.height;
    const scale = Math.min(scaleX, scaleY);

    // Calculate actual displayed size
    const displayWidth = imageSize.width * scale;
    const displayHeight = imageSize.height * scale;

    // Calculate offset (centering)
    const offsetX = (containerWidth - displayWidth) / 2;
    const offsetY = (containerHeight - displayHeight) / 2;

    setDisplayMetrics({
      scale,
      offsetX,
      offsetY,
      displayWidth,
      displayHeight,
    });
  }, [imageSize]);

  // Update display metrics when image loads
  const handleImageLoad = useCallback(() => {
    updateDisplayMetrics();
  }, [updateDisplayMetrics]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      updateDisplayMetrics();
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [updateDisplayMetrics]);

  // Update metrics when fullscreen changes
  useEffect(() => {
    // Delay to allow DOM to update
    const timer = setTimeout(() => {
      updateDisplayMetrics();
    }, 50);
    return () => clearTimeout(timer);
  }, [isFullscreen, updateDisplayMetrics]);

  // Mouse/Touch handlers for crop box
  const handleMouseDown = useCallback(
    (e: React.MouseEvent, handle: DragHandle) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(handle);
      setDragStart({
        x: e.clientX,
        y: e.clientY,
        cropArea: { ...cropArea },
      });
    },
    [cropArea]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging || !dragStart || !imageSize) return;

      const { scale } = displayMetrics;
      const dx = (e.clientX - dragStart.x) / scale;
      const dy = (e.clientY - dragStart.y) / scale;

      let newCrop = { ...dragStart.cropArea };

      switch (dragging) {
        case "move":
          newCrop.x = clamp(
            dragStart.cropArea.x + dx,
            0,
            imageSize.width - newCrop.width
          );
          newCrop.y = clamp(
            dragStart.cropArea.y + dy,
            0,
            imageSize.height - newCrop.height
          );
          break;
        case "nw":
          newCrop.x = clamp(
            dragStart.cropArea.x + dx,
            0,
            dragStart.cropArea.x + dragStart.cropArea.width - 20
          );
          newCrop.y = clamp(
            dragStart.cropArea.y + dy,
            0,
            dragStart.cropArea.y + dragStart.cropArea.height - 20
          );
          newCrop.width =
            dragStart.cropArea.width - (newCrop.x - dragStart.cropArea.x);
          newCrop.height =
            dragStart.cropArea.height - (newCrop.y - dragStart.cropArea.y);
          break;
        case "ne":
          newCrop.y = clamp(
            dragStart.cropArea.y + dy,
            0,
            dragStart.cropArea.y + dragStart.cropArea.height - 20
          );
          newCrop.width = clamp(
            dragStart.cropArea.width + dx,
            20,
            imageSize.width - dragStart.cropArea.x
          );
          newCrop.height =
            dragStart.cropArea.height - (newCrop.y - dragStart.cropArea.y);
          break;
        case "sw":
          newCrop.x = clamp(
            dragStart.cropArea.x + dx,
            0,
            dragStart.cropArea.x + dragStart.cropArea.width - 20
          );
          newCrop.width =
            dragStart.cropArea.width - (newCrop.x - dragStart.cropArea.x);
          newCrop.height = clamp(
            dragStart.cropArea.height + dy,
            20,
            imageSize.height - dragStart.cropArea.y
          );
          break;
        case "se":
          newCrop.width = clamp(
            dragStart.cropArea.width + dx,
            20,
            imageSize.width - dragStart.cropArea.x
          );
          newCrop.height = clamp(
            dragStart.cropArea.height + dy,
            20,
            imageSize.height - dragStart.cropArea.y
          );
          break;
        case "n":
          newCrop.y = clamp(
            dragStart.cropArea.y + dy,
            0,
            dragStart.cropArea.y + dragStart.cropArea.height - 20
          );
          newCrop.height =
            dragStart.cropArea.height - (newCrop.y - dragStart.cropArea.y);
          break;
        case "s":
          newCrop.height = clamp(
            dragStart.cropArea.height + dy,
            20,
            imageSize.height - dragStart.cropArea.y
          );
          break;
        case "e":
          newCrop.width = clamp(
            dragStart.cropArea.width + dx,
            20,
            imageSize.width - dragStart.cropArea.x
          );
          break;
        case "w":
          newCrop.x = clamp(
            dragStart.cropArea.x + dx,
            0,
            dragStart.cropArea.x + dragStart.cropArea.width - 20
          );
          newCrop.width =
            dragStart.cropArea.width - (newCrop.x - dragStart.cropArea.x);
          break;
      }

      setCropArea({
        x: Math.round(newCrop.x),
        y: Math.round(newCrop.y),
        width: Math.round(newCrop.width),
        height: Math.round(newCrop.height),
      });
    },
    [dragging, dragStart, displayMetrics, imageSize]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    setDragStart(null);
  }, []);

  // Global mouse events for dragging
  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Handle crop area input changes
  const handleCropInputChange = useCallback(
    (field: keyof CropArea, value: number) => {
      if (!imageSize) return;

      const newCrop = { ...cropArea };
      const val = Math.max(0, value);

      switch (field) {
        case "x":
          newCrop.x = clamp(val, 0, imageSize.width - newCrop.width);
          break;
        case "y":
          newCrop.y = clamp(val, 0, imageSize.height - newCrop.height);
          break;
        case "width":
          newCrop.width = clamp(val, 1, imageSize.width - newCrop.x);
          break;
        case "height":
          newCrop.height = clamp(val, 1, imageSize.height - newCrop.y);
          break;
      }

      setCropArea(newCrop);
    },
    [cropArea, imageSize]
  );

  // Execute crop
  const handleCrop = useCallback(async () => {
    if (!file) return;

    const startedAt = trackToolProcessStart("crop", 1);
    setProcessing(true);
    try {
      const cropResult = await cropImage(file, cropArea);
      trackToolProcessSuccess("crop", 1, 1, startedAt);
      setResult(cropResult);
      showToast("裁剪成功", "success");
    } catch (error) {
      trackToolProcessFailure("crop", 1, startedAt, error);
      console.error("Crop failed:", error);
      showToast(
        `裁剪失败: ${error instanceof Error ? error.message : "未知错误"}`,
        "error"
      );
    } finally {
      setProcessing(false);
    }
  }, [file, cropArea, showToast]);

  // Reset crop area
  const handleReset = useCallback(() => {
    if (imageSize) {
      setCropArea(getInitialCropArea(imageSize.width, imageSize.height));
    }
  }, [imageSize]);

  // Auto trim transparent pixels
  const handleTrimTransparent = useCallback(async () => {
    if (!file || !imageSize) return;

    try {
      const imageData = await getImageDataFromFile(file);
      const trimArea = getTrimTransparentArea(imageData, trimPadding);

      if (!trimArea) {
        showToast("图片完全透明，无法自动裁切", "error");
        return;
      }

      if (
        trimArea.x === 0 &&
        trimArea.y === 0 &&
        trimArea.width === imageSize.width &&
        trimArea.height === imageSize.height
      ) {
        showToast("图片没有透明像素，裁剪区域已设为整张图片", "info");
      }

      setCropArea(trimArea);
    } catch (error) {
      console.error("Trim transparent failed:", error);
      showToast("自动裁切失败", "error");
    }
  }, [file, imageSize, trimPadding, showToast]);

  // Download result
  const handleDownload = useCallback(() => {
    if (!result || !file) return;
    const resultFile = blobToFile(result.blob, file.name);
    downloadSingle(result.blob, resultFile.name);
    trackToolDownload("crop", 1, "single");
  }, [result, file]);

  // Clear all
  const handleClear = useCallback(() => {
    if (imageUrl) {
      URL.revokeObjectURL(imageUrl);
    }
    setFile(null);
    setImageUrl(null);
    setImageSize(null);
    setResult(null);
    setCropArea({ x: 0, y: 0, width: 100, height: 100 });
    setIsFullscreen(false);
  }, [imageUrl]);

  // Create result file for sending to other modules
  const getResultFile = useCallback(() => {
    if (!result || !file) return null;
    return blobToFile(result.blob, file.name);
  }, [result, file]);

  // Preview URL for result
  const resultPreviewUrl = useMemo(() => {
    if (!result) return null;
    return URL.createObjectURL(result.blob);
  }, [result]);

  // Cleanup result preview URL
  useEffect(() => {
    return () => {
      if (resultPreviewUrl) {
        URL.revokeObjectURL(resultPreviewUrl);
      }
    };
  }, [resultPreviewUrl]);

  // Close fullscreen on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // No file - show dropzone only
  if (!file) {
    return (
      <div className="flex flex-col gap-6">
        <ImageDropzone
          tool="crop"
          onFilesSelected={handleFilesSelected}
          multiple={false}
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

  const { scale, offsetX, offsetY, displayWidth, displayHeight } = displayMetrics;

  // Crop canvas component (reused in both normal and fullscreen mode)
  const cropCanvas = (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px] ${
        isFullscreen ? "h-full" : "h-[400px]"
      }`}
    >
      {imageUrl && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Source"
            className="absolute"
            style={{
              left: offsetX,
              top: offsetY,
              width: displayWidth,
              height: displayHeight,
            }}
            onLoad={handleImageLoad}
            draggable={false}
          />

          {/* Dark overlay - covers entire container except crop area */}
          <div
            className="pointer-events-none absolute bg-black/60"
            style={{
              left: offsetX,
              top: offsetY,
              width: displayWidth,
              height: displayHeight,
              clipPath: `polygon(
                0% 0%, 0% 100%,
                ${(cropArea.x / (imageSize?.width || 1)) * 100}% 100%,
                ${(cropArea.x / (imageSize?.width || 1)) * 100}% ${(cropArea.y / (imageSize?.height || 1)) * 100}%,
                ${((cropArea.x + cropArea.width) / (imageSize?.width || 1)) * 100}% ${(cropArea.y / (imageSize?.height || 1)) * 100}%,
                ${((cropArea.x + cropArea.width) / (imageSize?.width || 1)) * 100}% ${((cropArea.y + cropArea.height) / (imageSize?.height || 1)) * 100}%,
                ${(cropArea.x / (imageSize?.width || 1)) * 100}% ${((cropArea.y + cropArea.height) / (imageSize?.height || 1)) * 100}%,
                ${(cropArea.x / (imageSize?.width || 1)) * 100}% 100%,
                100% 100%, 100% 0%
              )`,
            }}
          />

          {/* Crop Box */}
          <div
            className="absolute border-2 border-emerald-400"
            style={{
              left: offsetX + cropArea.x * scale,
              top: offsetY + cropArea.y * scale,
              width: cropArea.width * scale,
              height: cropArea.height * scale,
              cursor: dragging === "move" ? "grabbing" : "grab",
            }}
            onMouseDown={(e) => handleMouseDown(e, "move")}
          >
            {/* Corner handles */}
            <div
              className="absolute -left-1.5 -top-1.5 h-3 w-3 rounded-sm bg-emerald-400"
              style={{ cursor: "nw-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "nw")}
            />
            <div
              className="absolute -right-1.5 -top-1.5 h-3 w-3 rounded-sm bg-emerald-400"
              style={{ cursor: "ne-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "ne")}
            />
            <div
              className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-sm bg-emerald-400"
              style={{ cursor: "sw-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "sw")}
            />
            <div
              className="absolute -bottom-1.5 -right-1.5 h-3 w-3 rounded-sm bg-emerald-400"
              style={{ cursor: "se-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "se")}
            />

            {/* Edge handles */}
            <div
              className="absolute -top-1 left-1/2 h-2 w-6 -translate-x-1/2 rounded-sm bg-emerald-400"
              style={{ cursor: "n-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "n")}
            />
            <div
              className="absolute -bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 rounded-sm bg-emerald-400"
              style={{ cursor: "s-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "s")}
            />
            <div
              className="absolute -right-1 top-1/2 h-6 w-2 -translate-y-1/2 rounded-sm bg-emerald-400"
              style={{ cursor: "e-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "e")}
            />
            <div
              className="absolute -left-1 top-1/2 h-6 w-2 -translate-y-1/2 rounded-sm bg-emerald-400"
              style={{ cursor: "w-resize" }}
              onMouseDown={(e) => handleMouseDown(e, "w")}
            />
          </div>
        </>
      )}
    </div>
  );

  // Fullscreen mode
  if (isFullscreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950">
        {/* Fullscreen header */}
        <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-zinc-300">
              裁剪区域
              {imageSize && (
                <span className="ml-2 text-zinc-500">
                  原图: {imageSize.width}×{imageSize.height}
                </span>
              )}
            </span>
            <span className="text-sm text-emerald-400">
              选中: {cropArea.width}×{cropArea.height}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleReset}
              className="rounded-lg bg-zinc-700 px-3 py-1.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              重置
            </button>
            <button
              onClick={handleCrop}
              disabled={processing}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {processing ? "处理中..." : "应用裁剪"}
            </button>
            <button
              onClick={() => setIsFullscreen(false)}
              className="ml-2 rounded-lg bg-zinc-800 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
              title="退出全屏 (ESC)"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Fullscreen canvas */}
        <div className="flex-1 p-4">
          {cropCanvas}
        </div>

        {/* Fullscreen footer - precise input */}
        <div className="border-t border-zinc-800 bg-zinc-900 px-4 py-3">
          <div className="flex flex-wrap items-center justify-center gap-4">
            {/* Auto trim */}
            <button
              onClick={handleTrimTransparent}
              className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-1 text-sm text-zinc-300 transition-colors hover:bg-zinc-600"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m0 0a8.001 8.001 0 0115.356 2M4.582 9H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              自动裁切透明
            </button>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-zinc-500">保留边界:</label>
              <input
                type="number"
                min={0}
                value={trimPadding}
                onChange={(e) => setTrimPadding(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-16 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
              <span className="text-xs text-zinc-500">px</span>
            </div>
            <div className="mx-1 h-4 w-px bg-zinc-700" />
            <label className="text-xs text-zinc-500">精确输入:</label>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600">X</label>
              <input
                type="number"
                value={cropArea.x}
                onChange={(e) => handleCropInputChange("x", parseInt(e.target.value) || 0)}
                className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600">Y</label>
              <input
                type="number"
                value={cropArea.y}
                onChange={(e) => handleCropInputChange("y", parseInt(e.target.value) || 0)}
                className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600">宽</label>
              <input
                type="number"
                value={cropArea.width}
                onChange={(e) => handleCropInputChange("width", parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-zinc-600">高</label>
              <input
                type="number"
                value={cropArea.height}
                onChange={(e) => handleCropInputChange("height", parseInt(e.target.value) || 1)}
                className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Two-column layout */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left column - Crop Canvas */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                裁剪区域
                {imageSize && (
                  <span className="ml-2 text-zinc-500">
                    原图: {imageSize.width}×{imageSize.height}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-300"
                  title="全屏编辑"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                  展开
                </button>
                <button
                  onClick={handleClear}
                  className="text-sm text-zinc-500 hover:text-zinc-300"
                >
                  清除
                </button>
              </div>
            </div>

            {/* Crop Canvas */}
            {cropCanvas}

            {/* Auto Trim Transparent */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleTrimTransparent}
                className="flex items-center gap-1.5 rounded-lg bg-zinc-700 px-3 py-2 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m0 0a8.001 8.001 0 0115.356 2M4.582 9H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                自动裁切透明
              </button>
              <div className="flex items-center gap-2">
                <label className="text-xs text-zinc-500 whitespace-nowrap">保留边界:</label>
                <input
                  type="number"
                  min={0}
                  value={trimPadding}
                  onChange={(e) => setTrimPadding(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-20 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
                <span className="text-xs text-zinc-500">px</span>
              </div>
            </div>

            {/* Precise Input Controls */}
            <div className="mt-4">
              <label className="mb-2 block text-xs text-zinc-500">
                精确输入（像素）
              </label>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-zinc-600">X</label>
                  <input
                    type="number"
                    value={cropArea.x}
                    onChange={(e) =>
                      handleCropInputChange("x", parseInt(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-600">Y</label>
                  <input
                    type="number"
                    value={cropArea.y}
                    onChange={(e) =>
                      handleCropInputChange("y", parseInt(e.target.value) || 0)
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-600">宽度</label>
                  <input
                    type="number"
                    value={cropArea.width}
                    onChange={(e) =>
                      handleCropInputChange(
                        "width",
                        parseInt(e.target.value) || 1
                      )
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-zinc-600">高度</label>
                  <input
                    type="number"
                    value={cropArea.height}
                    onChange={(e) =>
                      handleCropInputChange(
                        "height",
                        parseInt(e.target.value) || 1
                      )
                    }
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="mt-4 flex gap-2">
              <button
                onClick={handleReset}
                className="flex-1 rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-300 transition-colors hover:bg-zinc-600"
              >
                重置
              </button>
              <button
                onClick={handleCrop}
                disabled={processing}
                className="flex-1 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {processing ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
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
                    处理中
                  </span>
                ) : (
                  "应用裁剪"
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right column - Preview & Result */}
        <div className="flex flex-col gap-4">
          <div className="rounded-xl bg-zinc-800/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-300">
                裁剪预览
                {result && (
                  <span className="ml-2 text-emerald-400">
                    {result.width}×{result.height}
                  </span>
                )}
              </span>
              {result && (
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
                    下载
                  </button>
                  <DropdownMenu
                    onSendToCurrent={() => {
                      const resultFile = getResultFile();
                      if (resultFile) handleFilesSelected([resultFile]);
                    }}
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToSprite([f]);
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToBackground([f]);
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToUpscale([f]);
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToResize([f]);
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToCompress([f]);
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToTransform([f]);
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
                              onClick: () => {
                                const f = getResultFile();
                                if (f) onSendToInpaint([f]);
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
                                const f = getResultFile();
                                if (f) onSendToVectorize([f]);
                              },
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              )}
            </div>

            {result && resultPreviewUrl ? (
              <div
                className="group relative cursor-pointer overflow-hidden rounded-lg border border-zinc-700 bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[16px_16px]"
                onClick={() =>
                  setLightboxImage({
                    blob: result.blob,
                    alt: "Cropped result",
                  })
                }
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultPreviewUrl}
                  alt="Cropped result"
                  className="block max-h-[300px] w-full object-contain"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                  <svg
                    className="h-8 w-8 text-white"
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
            ) : (
              <div className="flex min-h-[200px] items-center justify-center rounded-lg border border-dashed border-zinc-700 text-zinc-600">
                <p>调整裁剪区域后点击"应用裁剪"预览结果</p>
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
