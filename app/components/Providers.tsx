"use client";

import { ToastProvider } from "./Toast";
import { FileTransferProvider } from "./FileTransferProvider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <FileTransferProvider>{children}</FileTransferProvider>
    </ToastProvider>
  );
}
