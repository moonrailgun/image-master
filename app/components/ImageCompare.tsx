"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface ImageCompareProps {
  beforeSrc?: string;
  afterSrc?: string;
  beforeBlob?: Blob;
  afterBlob?: Blob;
  beforeAlt?: string;
  afterAlt?: string;
  className?: string;
}

export function ImageCompare({
  beforeSrc,
  afterSrc,
  beforeBlob,
  afterBlob,
  beforeAlt = "Before",
  afterAlt = "After",
  className = "",
}: ImageCompareProps) {
  const [position, setPosition] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);

  // Create object URLs for blobs
  useEffect(() => {
    if (beforeBlob) {
      const url = URL.createObjectURL(beforeBlob);
      setBeforeUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setBeforeUrl(beforeSrc || null);
    }
  }, [beforeBlob, beforeSrc]);

  useEffect(() => {
    if (afterBlob) {
      const url = URL.createObjectURL(afterBlob);
      setAfterUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setAfterUrl(afterSrc || null);
    }
  }, [afterBlob, afterSrc]);

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setPosition(percentage);
    },
    []
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    },
    [isDragging, handleMove]
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsDragging(true);
  }, []);

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    },
    [isDragging, handleMove]
  );

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Click anywhere to move slider
  const handleContainerClick = useCallback(
    (e: React.MouseEvent) => {
      handleMove(e.clientX);
    },
    [handleMove]
  );

  // Global mouse events for dragging
  useEffect(() => {
    if (isDragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!beforeUrl || !afterUrl) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      className={`relative select-none overflow-hidden ${className}`}
      onClick={handleContainerClick}
      style={{ cursor: "ew-resize" }}
    >
      {/* After image (full width, shown on right) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterUrl}
        alt={afterAlt}
        className="block h-auto w-full"
        draggable={false}
      />

      {/* Before image (clipped, shown on left) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={beforeUrl}
          alt={beforeAlt}
          className="block h-auto w-full"
          draggable={false}
        />
      </div>

      {/* Slider line */}
      <div
        className="absolute bottom-0 top-0 z-10 w-1 -translate-x-1/2 bg-white shadow-[0_0_8px_rgba(0,0,0,0.5)]"
        style={{ left: `${position}%` }}
      >
        {/* Slider handle */}
        <div
          className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full bg-white shadow-lg transition-transform hover:scale-110"
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <svg
            className="h-5 w-5 text-zinc-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 9l4-4 4 4m0 6l-4 4-4-4"
            />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        原图
      </div>
      <div className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
        修复后
      </div>
    </div>
  );
}
