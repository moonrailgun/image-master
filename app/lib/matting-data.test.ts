import { expect, test } from "bun:test";
import { createTrimap, prepareMattingInput, readMattingAlpha } from "./matting-data";

test("trimap expands the uncertain edge in both directions and retains known regions", () => {
  const rgba = new Uint8ClampedArray(7 * 4);
  [0, 0, 0, 255, 255, 255, 255].forEach((alpha, i) => { rgba[i * 4 + 3] = alpha; });
  expect([...createTrimap(rgba, 7, 1, 1)]).toEqual([0, 0, 128, 128, 255, 255, 255]);
  rgba[3 * 4 + 3] = 100;
  expect([...createTrimap(rgba, 7, 1, 1)]).toEqual([0, 0, 128, 128, 128, 255, 255]);
  expect([...createTrimap(new Uint8ClampedArray([0, 0, 0, 255]), 1, 1, 8)]).toEqual([255]);
});

test("ViTMatte normalizes RGB to [-1, 1], rescales trimap, and pads on the right and bottom", () => {
  const { data, width, height } = prepareMattingInput(
    new Uint8ClampedArray([255, 0, 128, 255, 0, 255, 0, 255]),
    new Uint8Array([128, 255]), 1, 2,
  );
  expect([width, height]).toEqual([32, 32]);
  expect(data[0]).toBe(1);
  expect(data[32]).toBe(-1);
  expect(data[1024]).toBe(-1);
  expect(data[2048]).toBeCloseTo(128 / 127.5 - 1);
  expect(data[3072]).toBeCloseTo(128 / 255);
  expect(data[3072 + 32]).toBe(1);
  expect(data[1]).toBe(0);
  expect(data[64]).toBe(0);
});

test("alpha output crops padding, clamps predictions and preserves trimap constraints", () => {
  const alpha = new Float32Array([0.8, 0.25, 99, 99, -1, 2, 99, 99]);
  const rgba = readMattingAlpha(alpha, new Uint8Array([0, 128, 255, 128]), 2, 2, 4);
  expect([rgba[3], rgba[7], rgba[11], rgba[15]]).toEqual([0, 64, 255, 255]);
  expect(() => readMattingAlpha(new Float32Array([NaN]), new Uint8Array([128]), 1, 1, 1)).toThrow();
});
