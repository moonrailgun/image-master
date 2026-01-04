"use client";

import { useState, useCallback } from "react";
import { SpriteSplitter } from "./components/SpriteSplitter";
import { BackgroundRemover } from "./components/BackgroundRemover";
import { SuperResolution } from "./components/SuperResolution";
import { ImageResizer } from "./components/ImageResizer";
import { ImageCompressor } from "./components/ImageCompressor";
import { ImageTransform } from "./components/ImageTransform";
import { ImageInpainting } from "./components/ImageInpainting";
import { ImageCropper } from "./components/ImageCropper";

type Tab = "sprite" | "background" | "upscale" | "resize" | "compress" | "transform" | "inpaint" | "crop";

export interface TransferData {
  files: File[];
  fromModule: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("sprite");
  const [pendingTransfer, setPendingTransfer] = useState<TransferData | null>(null);
  const [spriteHasFiles, setSpriteHasFiles] = useState(false);
  const [backgroundHasFiles, setBackgroundHasFiles] = useState(false);
  const [upscaleHasFiles, setUpscaleHasFiles] = useState(false);
  const [resizeHasFiles, setResizeHasFiles] = useState(false);
  const [compressHasFiles, setCompressHasFiles] = useState(false);
  const [transformHasFiles, setTransformHasFiles] = useState(false);
  const [inpaintHasFiles, setInpaintHasFiles] = useState(false);
  const [cropHasFiles, setCropHasFiles] = useState(false);

  const handleSendToSprite = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("sprite");
  }, []);

  const handleSendToBackground = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("background");
  }, []);

  const handleSendToUpscale = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("upscale");
  }, []);

  const handleSendToResize = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("resize");
  }, []);

  const handleSendToCompress = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("compress");
  }, []);

  const handleSendToTransform = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("transform");
  }, []);

  const handleSendToInpaint = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("inpaint");
  }, []);

  const handleSendToCrop = useCallback((files: File[], fromModule: string) => {
    setPendingTransfer({ files, fromModule });
    setActiveTab("crop");
  }, []);

  const handleTransferConsumed = useCallback(() => {
    setPendingTransfer(null);
  }, []);

  const showDescription =
    (activeTab === "sprite" && !spriteHasFiles) ||
    (activeTab === "background" && !backgroundHasFiles) ||
    (activeTab === "upscale" && !upscaleHasFiles) ||
    (activeTab === "resize" && !resizeHasFiles) ||
    (activeTab === "compress" && !compressHasFiles) ||
    (activeTab === "transform" && !transformHasFiles) ||
    (activeTab === "inpaint" && !inpaintHasFiles) ||
    (activeTab === "crop" && !cropHasFiles);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600">
              <svg
                className="h-6 w-6 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Image Master</h1>
              <p className="text-xs text-zinc-500">纯前端图片处理工具</p>
            </div>
          </div>
          <a
            href="https://github.com/moonrailgun/image-master"
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-500 transition-colors hover:text-zinc-300"
          >
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              />
            </svg>
          </a>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="border-b border-zinc-800">
        <div className="mx-auto max-w-6xl px-6">
          <nav className="flex gap-1">
            <TabButton
              active={activeTab === "sprite"}
              onClick={() => setActiveTab("sprite")}
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
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                />
              </svg>
              精灵图拆分
            </TabButton>
            <TabButton
              active={activeTab === "background"}
              onClick={() => setActiveTab("background")}
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
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
              背景扣除
            </TabButton>
            <TabButton
              active={activeTab === "upscale"}
              onClick={() => setActiveTab("upscale")}
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
                  d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                />
              </svg>
              超分放大
            </TabButton>
            <TabButton
              active={activeTab === "resize"}
              onClick={() => setActiveTab("resize")}
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
                  d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5"
                />
              </svg>
              尺寸调整
            </TabButton>
            <TabButton
              active={activeTab === "compress"}
              onClick={() => setActiveTab("compress")}
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
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              图片压缩
            </TabButton>
            <TabButton
              active={activeTab === "transform"}
              onClick={() => setActiveTab("transform")}
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
              旋转翻转
            </TabButton>
            <TabButton
              active={activeTab === "inpaint"}
              onClick={() => setActiveTab("inpaint")}
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
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              图片修复
            </TabButton>
            <TabButton
              active={activeTab === "crop"}
              onClick={() => setActiveTab("crop")}
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
                  d="M3 4v16h16M7 20V8m0 0h12"
                />
              </svg>
              图片裁剪
            </TabButton>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-6xl px-6 py-8">
        {/* Tool Description */}
        {showDescription && (
          <div className="mb-8">
            {activeTab === "sprite" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  精灵图拆分工具
                </h2>
                <p className="text-zinc-400">
                  上传带透明通道的 PNG 图片（如游戏 UI
                  精灵图集），自动按照透明区域间隙识别并拆分成独立的小图片。
                </p>
              </div>
            )}
            {activeTab === "background" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  背景扣除工具
                </h2>
                <p className="text-zinc-400">
                  上传带纯色背景的图片，自动将背景色处理为透明。支持自动检测、手动拾取颜色、调整容差范围。
                </p>
              </div>
            )}
            {activeTab === "upscale" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  AI 超分放大工具
                </h2>
                <p className="text-zinc-400">
                  使用 Real-ESRGAN 深度学习模型，将图片放大 4x，同时增强细节和清晰度。首次使用需下载模型。
                </p>
              </div>
            )}
            {activeTab === "resize" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  图片尺寸调整工具
                </h2>
                <p className="text-zinc-400">
                  批量调整图片尺寸，支持按比例缩放或指定目标尺寸，可锁定宽高比保持图片不变形。
                </p>
              </div>
            )}
            {activeTab === "compress" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  图片压缩工具
                </h2>
                <p className="text-zinc-400">
                  智能压缩图片文件大小，支持 JPEG、WebP、PNG 格式转换和质量调节，在保持画质的同时大幅减小文件体积。
                </p>
              </div>
            )}
            {activeTab === "transform" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  图片旋转翻转工具
                </h2>
                <p className="text-zinc-400">
                  对图片进行旋转和翻转操作，支持顺时针/逆时针旋转 90°、180°，以及水平/垂直翻转。可组合多个操作按顺序应用。
                </p>
              </div>
            )}
            {activeTab === "inpaint" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  AI 图片修复工具
                </h2>
                <p className="text-zinc-400">
                  使用 AI 自动修复图片中涂抹标记的区域，可用于移除水印、修复划痕、消除不需要的物体等。首次使用需下载模型。
                </p>
              </div>
            )}
            {activeTab === "crop" && (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  图片裁剪工具
                </h2>
                <p className="text-zinc-400">
                  自由裁剪图片区域，支持拖拽调整裁剪框大小和位置，也可精确输入像素值进行精准裁剪。
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tool Content */}
        <div className={activeTab === "sprite" ? "block" : "hidden"}>
          <SpriteSplitter
            pendingTransfer={pendingTransfer?.fromModule !== "sprite" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToBackground={(files) => handleSendToBackground(files, "sprite")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "sprite")}
            onSendToResize={(files) => handleSendToResize(files, "sprite")}
            onSendToCompress={(files) => handleSendToCompress(files, "sprite")}
            onSendToTransform={(files) => handleSendToTransform(files, "sprite")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "sprite")}
            onSendToCrop={(files) => handleSendToCrop(files, "sprite")}
            onHasFilesChange={setSpriteHasFiles}
            isActive={activeTab === "sprite"}
          />
        </div>
        <div className={activeTab === "background" ? "block" : "hidden"}>
          <BackgroundRemover
            pendingTransfer={pendingTransfer?.fromModule !== "background" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "background")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "background")}
            onSendToResize={(files) => handleSendToResize(files, "background")}
            onSendToCompress={(files) => handleSendToCompress(files, "background")}
            onSendToTransform={(files) => handleSendToTransform(files, "background")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "background")}
            onSendToCrop={(files) => handleSendToCrop(files, "background")}
            onHasFilesChange={setBackgroundHasFiles}
            isActive={activeTab === "background"}
          />
        </div>
        <div className={activeTab === "upscale" ? "block" : "hidden"}>
          <SuperResolution
            pendingTransfer={pendingTransfer?.fromModule !== "upscale" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "upscale")}
            onSendToBackground={(files) => handleSendToBackground(files, "upscale")}
            onSendToResize={(files) => handleSendToResize(files, "upscale")}
            onSendToCompress={(files) => handleSendToCompress(files, "upscale")}
            onSendToTransform={(files) => handleSendToTransform(files, "upscale")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "upscale")}
            onSendToCrop={(files) => handleSendToCrop(files, "upscale")}
            onHasFilesChange={setUpscaleHasFiles}
            isActive={activeTab === "upscale"}
          />
        </div>
        <div className={activeTab === "resize" ? "block" : "hidden"}>
          <ImageResizer
            pendingTransfer={pendingTransfer?.fromModule !== "resize" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "resize")}
            onSendToBackground={(files) => handleSendToBackground(files, "resize")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "resize")}
            onSendToCompress={(files) => handleSendToCompress(files, "resize")}
            onSendToTransform={(files) => handleSendToTransform(files, "resize")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "resize")}
            onSendToCrop={(files) => handleSendToCrop(files, "resize")}
            onHasFilesChange={setResizeHasFiles}
            isActive={activeTab === "resize"}
          />
        </div>
        <div className={activeTab === "compress" ? "block" : "hidden"}>
          <ImageCompressor
            pendingTransfer={pendingTransfer?.fromModule !== "compress" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "compress")}
            onSendToBackground={(files) => handleSendToBackground(files, "compress")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "compress")}
            onSendToResize={(files) => handleSendToResize(files, "compress")}
            onSendToTransform={(files) => handleSendToTransform(files, "compress")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "compress")}
            onSendToCrop={(files) => handleSendToCrop(files, "compress")}
            onHasFilesChange={setCompressHasFiles}
            isActive={activeTab === "compress"}
          />
        </div>
        <div className={activeTab === "transform" ? "block" : "hidden"}>
          <ImageTransform
            pendingTransfer={pendingTransfer?.fromModule !== "transform" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "transform")}
            onSendToBackground={(files) => handleSendToBackground(files, "transform")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "transform")}
            onSendToResize={(files) => handleSendToResize(files, "transform")}
            onSendToCompress={(files) => handleSendToCompress(files, "transform")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "transform")}
            onSendToCrop={(files) => handleSendToCrop(files, "transform")}
            onHasFilesChange={setTransformHasFiles}
            isActive={activeTab === "transform"}
          />
        </div>
        <div className={activeTab === "inpaint" ? "block" : "hidden"}>
          <ImageInpainting
            pendingTransfer={pendingTransfer?.fromModule !== "inpaint" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "inpaint")}
            onSendToBackground={(files) => handleSendToBackground(files, "inpaint")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "inpaint")}
            onSendToResize={(files) => handleSendToResize(files, "inpaint")}
            onSendToCompress={(files) => handleSendToCompress(files, "inpaint")}
            onSendToTransform={(files) => handleSendToTransform(files, "inpaint")}
            onSendToCrop={(files) => handleSendToCrop(files, "inpaint")}
            onHasFilesChange={setInpaintHasFiles}
            isActive={activeTab === "inpaint"}
          />
        </div>
        <div className={activeTab === "crop" ? "block" : "hidden"}>
          <ImageCropper
            pendingTransfer={pendingTransfer?.fromModule !== "crop" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={(files) => handleSendToSprite(files, "crop")}
            onSendToBackground={(files) => handleSendToBackground(files, "crop")}
            onSendToUpscale={(files) => handleSendToUpscale(files, "crop")}
            onSendToResize={(files) => handleSendToResize(files, "crop")}
            onSendToCompress={(files) => handleSendToCompress(files, "crop")}
            onSendToTransform={(files) => handleSendToTransform(files, "crop")}
            onSendToInpaint={(files) => handleSendToInpaint(files, "crop")}
            onHasFilesChange={setCropHasFiles}
            isActive={activeTab === "crop"}
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 py-6 text-center text-sm text-zinc-600">
        <p>所有图片处理均在浏览器本地完成，不会上传到服务器</p>
      </footer>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
        active
          ? "border-emerald-500 text-emerald-400"
          : "border-transparent text-zinc-500 hover:text-zinc-300"
      }`}
    >
      {children}
    </button>
  );
}
