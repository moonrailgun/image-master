"use client";

import { useCallback, useState, useEffect } from "react";

interface ImageDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  pasteEnabled?: boolean;
}

export function ImageDropzone({
  onFilesSelected,
  accept = "image/png,image/jpeg,image/webp",
  multiple = true,
  pasteEnabled = true,
}: ImageDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isPasting, setIsPasting] = useState(false);

  // Handle paste from clipboard
  useEffect(() => {
    if (!pasteEnabled) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        e.stopPropagation();
        setIsPasting(true);
        onFilesSelected(multiple ? imageFiles : [imageFiles[0]]);
        setTimeout(() => setIsPasting(false), 300);
      }
    };

    // Use capture phase to ensure we get the event before any input elements
    window.addEventListener("paste", handlePaste, { capture: true });
    return () => window.removeEventListener("paste", handlePaste, { capture: true });
  }, [onFilesSelected, multiple, pasteEnabled]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragIn = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragOut = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = Array.from(e.dataTransfer.files).filter((file) =>
        file.type.startsWith("image/")
      );
      if (files.length > 0) {
        onFilesSelected(multiple ? files : [files[0]]);
      }
    },
    [onFilesSelected, multiple]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFilesSelected(files);
      }
      e.target.value = "";
    },
    [onFilesSelected]
  );

  const isActive = isDragging || isPasting;

  return (
    <div
      onDragEnter={handleDragIn}
      onDragLeave={handleDragOut}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`
        relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center
        rounded-2xl border-2 border-dashed transition-all duration-200
        ${
          isActive
            ? "border-emerald-400 bg-emerald-500/10"
            : "border-zinc-600 bg-zinc-800/50 hover:border-zinc-500 hover:bg-zinc-800"
        }
      `}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileInput}
        tabIndex={-1}
        className="absolute inset-0 cursor-pointer opacity-0"
      />
      <div className="pointer-events-none flex flex-col items-center gap-3 p-8">
        <svg
          className={`h-12 w-12 ${isActive ? "text-emerald-400" : "text-zinc-500"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <div className="text-center">
          <p className={`text-lg font-medium ${isActive ? "text-emerald-400" : "text-zinc-300"}`}>
            {isDragging ? "松开以上传图片" : isPasting ? "正在粘贴..." : "拖拽图片到此处"}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            或点击选择文件 • ⌘V/Ctrl+V 粘贴 {multiple && "• 支持批量上传"}
          </p>
        </div>
      </div>
    </div>
  );
}
