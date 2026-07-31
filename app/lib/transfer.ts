import type { TransferData } from "../types";

interface TransferIdentityRef {
  current: TransferData | null;
}

export function claimPendingTransfer(
  pendingTransfer: TransferData | null | undefined,
  lastTransferRef: TransferIdentityRef
): pendingTransfer is TransferData {
  if (
    !pendingTransfer ||
    pendingTransfer.files.length === 0 ||
    pendingTransfer === lastTransferRef.current
  ) {
    return false;
  }

  lastTransferRef.current = pendingTransfer;
  return true;
}
