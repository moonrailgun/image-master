"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

export interface SeedPoint {
  x: number;
  y: number;
}

interface PointSelectorProps {
  file: File | null;
  points: SeedPoint[];
  onPointsChange: (points: SeedPoint[]) => void;
}

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.25;

export function PointSelector({
  file,
  points,
  onPointsChange,
}: PointSelectorProps) {
  const [isActive, setIsActive] = useState(false);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [imageDims, setImageDims] = useState<{
    w: number;
    h: number;
  } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const imageUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    return null;
  }, [file]);

  const prevImageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const prevUrl = prevImageUrlRef.current;
    prevImageUrlRef.current = imageUrl;
    queueMicrotask(() => setIsCanvasReady(false));
    imageRef.current = null;
    setImageDims(null);
    setZoom(1);
    return () => {
      if (prevUrl) URL.revokeObjectURL(prevUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!isActive) {
      setIsCanvasReady(false);
      imageRef.current = null;
    }
  }, [isActive]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;

    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0);

    const markerRadius = Math.max(6, Math.min(12, canvas.width / 80));

    for (const pt of points) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, markerRadius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(239, 68, 68, 0.4)";
      ctx.fill();
      ctx.strokeStyle = "#ef4444";
      ctx.lineWidth = 2;
      ctx.stroke();

      const cross = markerRadius * 0.5;
      ctx.beginPath();
      ctx.moveTo(pt.x - cross, pt.y);
      ctx.lineTo(pt.x + cross, pt.y);
      ctx.moveTo(pt.x, pt.y - cross);
      ctx.lineTo(pt.x, pt.y + cross);
      ctx.strokeStyle = "white";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [points]);

  useEffect(() => {
    if (!isActive || !imageUrl) return;

    const loadImg = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        requestAnimationFrame(loadImg);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        imageRef.current = img;
        setImageDims({ w: img.width, h: img.height });
        setIsCanvasReady(true);
      };
      img.src = imageUrl;
    };

    loadImg();
  }, [isActive, imageUrl]);

  useEffect(() => {
    if (isActive && isCanvasReady) drawCanvas();
  }, [isActive, isCanvasReady, drawCanvas]);

  const displayStyle = useMemo(() => {
    if (!imageDims) return {};
    const maxH = 280;
    const maxW = 600;
    const fitScale = Math.min(1, maxW / imageDims.w, maxH / imageDims.h);
    return {
      width: imageDims.w * fitScale * zoom,
      height: imageDims.h * fitScale * zoom,
    };
  }, [imageDims, zoom]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !isCanvasReady) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);

      if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;

      const hitRadius = Math.max(8, canvas.width / 80) / Math.max(1, zoom * 0.5);
      const nearIdx = points.findIndex((pt) => {
        const dx = pt.x - x;
        const dy = pt.y - y;
        return Math.sqrt(dx * dx + dy * dy) < hitRadius;
      });

      if (nearIdx >= 0) {
        onPointsChange(points.filter((_, i) => i !== nearIdx));
      } else {
        onPointsChange([...points, { x, y }]);
      }
    },
    [isCanvasReady, points, onPointsChange, zoom]
  );

  // Native wheel listener for non-passive preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !isActive) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      setZoom((prev) => {
        const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prev + delta));
      });
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [isActive]);

  const zoomIn = useCallback(() => {
    setZoom((prev) => Math.min(MAX_ZOOM, prev + ZOOM_STEP));
  }, []);

  const zoomOut = useCallback(() => {
    setZoom((prev) => Math.max(MIN_ZOOM, prev - ZOOM_STEP));
  }, []);

  const resetZoom = useCallback(() => {
    setZoom(1);
  }, []);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setIsActive(!isActive)}
          disabled={!file}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive
              ? "bg-rose-600 text-white"
              : file
                ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                : "cursor-not-allowed bg-zinc-800 text-zinc-600"
          }`}
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <circle cx="12" cy="12" r="3" strokeWidth={2} />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 2v4m0 12v4M2 12h4m12 0h4"
            />
          </svg>
          {isActive ? "点击图片标记区域" : "点选封闭区域"}
        </button>

        {points.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-400">
              已标记 {points.length} 个点
            </span>
            <button
              onClick={() => onPointsChange([])}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              清除全部
            </button>
          </div>
        )}
      </div>

      {isActive && imageUrl && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              className="flex h-7 w-7 items-center justify-center rounded bg-zinc-700 text-sm text-zinc-300 hover:bg-zinc-600 disabled:opacity-40"
            >
              −
            </button>
            <button
              onClick={resetZoom}
              className="min-w-14 rounded bg-zinc-700 px-2 py-1 text-center text-xs text-zinc-300 hover:bg-zinc-600"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              className="flex h-7 w-7 items-center justify-center rounded bg-zinc-700 text-sm text-zinc-300 hover:bg-zinc-600 disabled:opacity-40"
            >
              +
            </button>
            <span className="text-xs text-zinc-600">Ctrl + 滚轮缩放</span>
          </div>

          <div
            ref={containerRef}
            className="relative max-h-80 overflow-auto rounded-lg border border-rose-600/50 bg-zinc-900 p-2"
          >
            {!isCanvasReady && (
              <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
                加载中...
              </div>
            )}
            <canvas
              ref={canvasRef}
              onClick={handleClick}
              className={`cursor-crosshair ${!isCanvasReady ? "hidden" : ""}`}
              style={isCanvasReady ? displayStyle : undefined}
            />
          </div>

          {isCanvasReady && (
            <p className="text-center text-xs text-zinc-500">
              点击图片标记要移除的封闭背景区域，再次点击标记点可取消
            </p>
          )}
        </div>
      )}
    </div>
  );
}
