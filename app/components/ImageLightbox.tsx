"use client";

import { useEffect, useCallback, useState } from "react";
import { downloadSingle } from "../lib/download";

interface ImageLightboxProps {
  src?: string;
  blob?: Blob;
  alt: string;
  onClose: () => void;
}

export function ImageLightbox({ src, blob, alt, onClose }: ImageLightboxProps) {
  // Create URL from blob using lazy initialization
  const [imageUrl] = useState(() => {
    if (blob) {
      return URL.createObjectURL(blob);
    }
    return src || "";
  });

  // Note: We intentionally don't revoke the blob URL here
  // because React Strict Mode can cause double-mount issues
  // where the URL gets revoked before the image loads.
  // The URL will be cleaned up when the page is closed.

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [handleKeyDown]);

  const handleDownload = useCallback(async () => {
    if (blob) {
      downloadSingle(blob, alt);
    } else if (src) {
      const response = await fetch(src);
      const imgBlob = await response.blob();
      downloadSingle(imgBlob, alt);
    }
  }, [blob, src, alt]);

  if (!imageUrl) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Action buttons */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <button
          onClick={handleDownload}
          className="rounded-full bg-zinc-800/80 p-2 text-zinc-400 transition-colors hover:bg-emerald-600 hover:text-white"
          title="下载图片"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="rounded-full bg-zinc-800/80 p-2 text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-white"
          title="关闭"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Image container */}
      <div
        className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-[repeating-conic-gradient(#1a1a1a_0%_25%,#2a2a2a_0%_50%)] bg-size-[20px_20px] p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt={alt}
          className="max-h-[85vh] max-w-[85vw] object-contain"
        />
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-zinc-800/80 px-4 py-2 text-sm text-zinc-400">
        点击下载按钮保存图片 · 按 ESC 或点击背景关闭
      </div>
    </div>
  );
}
