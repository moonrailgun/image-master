import { expect, test } from "bun:test";

import { claimPendingTransfer } from "./transfer";
import type { TransferData } from "../types";

test("claims the same transfer identity only once during effect replay", () => {
  const transfer: TransferData = {
    files: [new File(["image"], "image.png", { type: "image/png" })],
    fromModule: "compress",
  };
  const lastTransferRef: { current: TransferData | null } = { current: null };

  expect(claimPendingTransfer(transfer, lastTransferRef)).toBe(true);
  expect(claimPendingTransfer(transfer, lastTransferRef)).toBe(false);
  expect(lastTransferRef.current).toBe(transfer);
});
