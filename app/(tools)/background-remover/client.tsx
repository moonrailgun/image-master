"use client";

import { useState } from "react";
import { BackgroundRemover } from "../../components/BackgroundRemover";
import { ToolPageWrapper } from "../../components/ToolPageWrapper";

export function BackgroundRemoverClient({
  description,
}: {
  description: string;
}) {
  const [hasFiles, setHasFiles] = useState(false);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      {!hasFiles && (
        <div className="mb-8">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
            <h2 className="mb-2 text-xl font-semibold text-white">
              背景扣除工具
            </h2>
            <p className="text-zinc-400">{description}</p>
          </div>
        </div>
      )}

      <ToolPageWrapper toolKey="background">
        {(transferProps) => (
          <BackgroundRemover
            {...transferProps}
            onHasFilesChange={setHasFiles}
            isActive={true}
          />
        )}
      </ToolPageWrapper>
    </main>
  );
}
