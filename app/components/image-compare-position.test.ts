import { describe, expect, test } from "bun:test";
import {
  readImageComparePosition,
  writeImageComparePosition,
} from "./image-compare-position";

describe("image comparison position persistence", () => {
  test("restores the last position for the same slot", () => {
    writeImageComparePosition("test-inpainting", 27);

    expect(readImageComparePosition("test-inpainting")).toBe(27);
  });

  test("starts a different slot at the midpoint", () => {
    writeImageComparePosition("test-upscale-0", 72);

    expect(readImageComparePosition("test-upscale-1")).toBe(50);
  });

  test("does not persist a component without a key", () => {
    writeImageComparePosition(undefined, 34);

    expect(readImageComparePosition(undefined)).toBe(50);
  });
});
