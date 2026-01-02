"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";

interface ColorPickerProps {
  file: File | null;
  onColorPicked: (color: { r: number; g: number; b: number } | null) => void;
  selectedColor: { r: number; g: number; b: number } | null;
}

export function ColorPicker({ file, onColorPicked, selectedColor }: ColorPickerProps) {
  const [isPickerMode, setIsPickerMode] = useState(false);
  const [hoverColor, setHoverColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageDataRef = useRef<ImageData | null>(null);

  // Use useMemo for imageUrl (derived state from file)
  const imageUrl = useMemo(() => {
    if (file) {
      return URL.createObjectURL(file);
    }
    return null;
  }, [file]);

  // Cleanup old object URLs and reset canvas state
  const prevImageUrlRef = useRef<string | null>(null);
  useEffect(() => {
    const prevUrl = prevImageUrlRef.current;
    prevImageUrlRef.current = imageUrl;

    // Reset canvas state when file changes (use queueMicrotask to avoid cascading renders)
    queueMicrotask(() => {
      setIsCanvasReady(false);
    });
    imageDataRef.current = null;

    return () => {
      if (prevUrl) {
        URL.revokeObjectURL(prevUrl);
      }
    };
  }, [imageUrl]);

  // Load image into canvas when picker mode is enabled and canvas is mounted
  useEffect(() => {
    if (!isPickerMode || !imageUrl) return;

    // Need to wait for canvas to be in DOM
    const loadImage = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        // Canvas not yet in DOM, retry
        requestAnimationFrame(loadImage);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = new Image();
      img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        // Store the image data for faster access
        imageDataRef.current = ctx.getImageData(0, 0, img.width, img.height);
        setIsCanvasReady(true);
      };
      img.src = imageUrl;
    };

    loadImage();
  }, [isPickerMode, imageUrl]);

  const getColorAtPosition = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      const imageData = imageDataRef.current;
      if (!canvas || !isCanvasReady || !imageData) {
        return null;
      }

      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return null;
      }

      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = Math.floor((e.clientX - rect.left) * scaleX);
      const y = Math.floor((e.clientY - rect.top) * scaleY);

      // Bounds check
      if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) {
        return null;
      }

      // Get color from stored imageData
      const idx = (y * canvas.width + x) * 4;
      const r = imageData.data[idx];
      const g = imageData.data[idx + 1];
      const b = imageData.data[idx + 2];

      return { r, g, b };
    },
    [isCanvasReady]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPickerMode && isCanvasReady) {
        setHoverColor(getColorAtPosition(e));
      }
    },
    [isPickerMode, isCanvasReady, getColorAtPosition]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isPickerMode && isCanvasReady) {
        const color = getColorAtPosition(e);
        if (color) {
          onColorPicked(color);
          setIsPickerMode(false);
          setHoverColor(null);
        }
      }
    },
    [isPickerMode, isCanvasReady, getColorAtPosition, onColorPicked]
  );

  const handleClear = useCallback(() => {
    onColorPicked(null);
    setIsPickerMode(false);
    setHoverColor(null);
  }, [onColorPicked]);

  const colorToHex = (color: { r: number; g: number; b: number }) => {
    return `#${[color.r, color.g, color.b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };

  const colorToRgb = (color: { r: number; g: number; b: number }) => {
    return `rgb(${color.r}, ${color.g}, ${color.b})`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => setIsPickerMode(!isPickerMode)}
          disabled={!file}
          className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isPickerMode
              ? "bg-amber-600 text-white"
              : file
                ? "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                : "cursor-not-allowed bg-zinc-800 text-zinc-600"
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
          {isPickerMode ? "点击图片拾取颜色" : "手动拾取颜色"}
        </button>

        {selectedColor && (
          <div className="flex items-center gap-2">
            <div
              className="h-8 w-8 rounded-lg border border-zinc-600"
              style={{ backgroundColor: colorToRgb(selectedColor) }}
            />
            <span className="text-sm text-zinc-400">{colorToHex(selectedColor)}</span>
            <button
              onClick={handleClear}
              className="text-sm text-zinc-500 hover:text-zinc-300"
            >
              清除
            </button>
          </div>
        )}

        {hoverColor && isPickerMode && (
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded border border-zinc-600"
              style={{ backgroundColor: colorToRgb(hoverColor) }}
            />
            <span className="text-xs text-zinc-500">{colorToHex(hoverColor)}</span>
          </div>
        )}
      </div>

      {isPickerMode && imageUrl && (
        <div className="relative overflow-auto rounded-lg border border-amber-600/50 bg-zinc-900 p-2">
          {!isCanvasReady && (
            <div className="flex h-32 items-center justify-center text-sm text-zinc-500">
              加载中...
            </div>
          )}
          <canvas
            ref={canvasRef}
            onMouseMove={handleMouseMove}
            onClick={handleClick}
            className={`max-h-64 w-auto cursor-crosshair ${!isCanvasReady ? "hidden" : ""}`}
            style={{ imageRendering: "pixelated" }}
          />
          {isCanvasReady && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              点击图片上的颜色进行拾取
            </p>
          )}
        </div>
      )}
    </div>
  );
}
