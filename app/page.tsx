"use client";

import { useState, useCallback } from "react";
import { SpriteSplitter } from "./components/SpriteSplitter";
import { BackgroundRemover } from "./components/BackgroundRemover";

type Tab = "sprite" | "background";

export interface TransferData {
  files: File[];
  fromModule: string;
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("sprite");
  const [pendingTransfer, setPendingTransfer] = useState<TransferData | null>(null);
  const [spriteHasFiles, setSpriteHasFiles] = useState(false);
  const [backgroundHasFiles, setBackgroundHasFiles] = useState(false);

  const handleSendToSprite = useCallback((files: File[]) => {
    setPendingTransfer({ files, fromModule: "background" });
    setActiveTab("sprite");
  }, []);

  const handleSendToBackground = useCallback((files: File[]) => {
    setPendingTransfer({ files, fromModule: "sprite" });
    setActiveTab("background");
  }, []);

  const handleTransferConsumed = useCallback(() => {
    setPendingTransfer(null);
  }, []);

  const showDescription =
    (activeTab === "sprite" && !spriteHasFiles) ||
    (activeTab === "background" && !backgroundHasFiles);

  return (
    <div className="min-h-screen bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
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
        <div className="mx-auto max-w-4xl px-6">
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
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-6 py-8">
        {/* Tool Description */}
        {showDescription && (
          <div className="mb-8">
            {activeTab === "sprite" ? (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  精灵图拆分工具
                </h2>
                <p className="text-zinc-400">
                  上传带透明通道的 PNG 图片（如游戏 UI
                  精灵图集），自动按照透明区域间隙识别并拆分成独立的小图片。
                </p>
              </div>
            ) : (
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
                <h2 className="mb-2 text-xl font-semibold text-white">
                  背景扣除工具
                </h2>
                <p className="text-zinc-400">
                  上传带纯色背景的图片，自动将背景色处理为透明。支持自动检测、手动拾取颜色、调整容差范围。
                </p>
              </div>
            )}
          </div>
        )}

        {/* Tool Content */}
        <div className={activeTab === "sprite" ? "block" : "hidden"}>
          <SpriteSplitter
            pendingTransfer={pendingTransfer?.fromModule === "background" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToBackground={handleSendToBackground}
            onHasFilesChange={setSpriteHasFiles}
          />
        </div>
        <div className={activeTab === "background" ? "block" : "hidden"}>
          <BackgroundRemover
            pendingTransfer={pendingTransfer?.fromModule === "sprite" ? pendingTransfer : null}
            onTransferConsumed={handleTransferConsumed}
            onSendToSprite={handleSendToSprite}
            onHasFilesChange={setBackgroundHasFiles}
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
