"use client";

import { useState } from "react";
import { ImageInpainting } from "../../components/ImageInpainting";
import { ToolPageWrapper } from "../../components/ToolPageWrapper";

export function InpaintClient({ description }: { description: string }) {
  const [hasFiles, setHasFiles] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {!hasFiles && (
        <div className="mb-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-white">
              AI 图片修复工具
            </h2>
            <p className="text-zinc-400">{description}</p>
          </div>
        </div>
      )}

      <ToolPageWrapper toolKey="inpaint">
        {(transferProps) => (
          <ImageInpainting
            {...transferProps}
            onHasFilesChange={setHasFiles}
            isActive={true}
          />
        )}
      </ToolPageWrapper>
    </main>
  );
}
