"use client";

import { useCallback } from "react";
import { useFileTransfer } from "./FileTransferProvider";
import type { TransferData } from "../types";

interface ToolPageWrapperProps {
  toolKey: string;
  children: (props: {
    pendingTransfer: TransferData | null;
    onTransferConsumed: () => void;
    onSendToSprite: (files: File[]) => void;
    onSendToBackground: (files: File[]) => void;
    onSendToUpscale: (files: File[]) => void;
    onSendToResize: (files: File[]) => void;
    onSendToCompress: (files: File[]) => void;
    onSendToTransform: (files: File[]) => void;
    onSendToInpaint: (files: File[]) => void;
    onSendToCrop: (files: File[]) => void;
    onSendToVectorize: (files: File[]) => void;
  }) => React.ReactNode;
}

export function ToolPageWrapper({ toolKey, children }: ToolPageWrapperProps) {
  const { pendingTransfer, sendTo, consumeTransfer } = useFileTransfer();

  const transfer =
    pendingTransfer && pendingTransfer.fromModule !== toolKey
      ? pendingTransfer
      : null;

  const makeSender = useCallback(
    (targetKey: string) => (files: File[]) => {
      sendTo(targetKey, files, toolKey);
    },
    [sendTo, toolKey]
  );

  return (
    <>
      {children({
        pendingTransfer: transfer,
        onTransferConsumed: consumeTransfer,
        onSendToSprite: makeSender("sprite"),
        onSendToBackground: makeSender("background"),
        onSendToUpscale: makeSender("upscale"),
        onSendToResize: makeSender("resize"),
        onSendToCompress: makeSender("compress"),
        onSendToTransform: makeSender("transform"),
        onSendToInpaint: makeSender("inpaint"),
        onSendToCrop: makeSender("crop"),
        onSendToVectorize: makeSender("vectorize"),
      })}
    </>
  );
}
