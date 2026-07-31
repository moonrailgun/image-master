import { describe, expect, it } from "bun:test";

import { refreshModelCachedStatus } from "./image-inpainting";

describe("refreshModelCachedStatus", () => {
  it("does not reject after a successful inpaint when the cache refresh fails", async () => {
    let didUpdateCacheStatus = false;

    await expect(
      refreshModelCachedStatus(
        () => Promise.reject(new Error("IndexedDB unavailable")),
        () => {
          didUpdateCacheStatus = true;
        }
      )
    ).resolves.toBeUndefined();

    expect(didUpdateCacheStatus).toBe(false);
  });
});
