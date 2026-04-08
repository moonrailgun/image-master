"use client";

import { useState } from "react";
import { ImageCropper } from "../../components/ImageCropper";
import { ToolPageWrapper } from "../../components/ToolPageWrapper";

export function CropClient({ description }: { description: string }) {
  const [hasFiles, setHasFiles] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {!hasFiles && (
        <div className="mb-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-white">
              图片裁剪工具
            </h2>
            <p className="text-zinc-400">{description}</p>
          </div>
        </div>
      )}

      <ToolPageWrapper toolKey="crop">
        {(transferProps) => (
          <ImageCropper
            {...transferProps}
            onHasFilesChange={setHasFiles}
            isActive={true}
          />
        )}
      </ToolPageWrapper>
    </main>
  );
}
