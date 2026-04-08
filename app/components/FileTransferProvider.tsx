"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { TransferData } from "../types";
import { TOOLS } from "../types";

interface FileTransferContextType {
  pendingTransfer: TransferData | null;
  sendTo: (targetKey: string, files: File[], fromModule: string) => void;
  consumeTransfer: () => void;
}

const FileTransferContext = createContext<FileTransferContextType>({
  pendingTransfer: null,
  sendTo: () => {},
  consumeTransfer: () => {},
});

export function useFileTransfer() {
  return useContext(FileTransferContext);
}

export function FileTransferProvider({ children }: { children: ReactNode }) {
  const [pendingTransfer, setPendingTransfer] = useState<TransferData | null>(
    null
  );
  const router = useRouter();

  const sendTo = useCallback(
    (targetKey: string, files: File[], fromModule: string) => {
      const tool = TOOLS.find((t) => t.key === targetKey);
      if (!tool) return;
      setPendingTransfer({ files, fromModule });
      router.push(tool.path);
    },
    [router]
  );

  const consumeTransfer = useCallback(() => {
    setPendingTransfer(null);
  }, []);

  return (
    <FileTransferContext.Provider
      value={{ pendingTransfer, sendTo, consumeTransfer }}
    >
      {children}
    </FileTransferContext.Provider>
  );
}
