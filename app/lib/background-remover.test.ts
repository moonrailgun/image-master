import { describe, expect, it } from "bun:test";

import {
  applyChromaKeyRefinement,
  detectChromaKeyChannel,
  getChromaKeyAlpha,
} from "./background-remover";

describe("detectChromaKeyChannel", () => {
  it.each([
    ["red", { r: 220, g: 36, b: 18 }],
    ["green", { r: 18, g: 220, b: 36 }],
    ["blue", { r: 18, g: 36, b: 220 }],
  ] as const)("detects a %s-dominant background", (channel, color) => {
    expect(detectChromaKeyChannel(color)).toBe(channel);
  });

  it("returns null for a neutral background", () => {
    expect(detectChromaKeyChannel({ r: 140, g: 142, b: 138 })).toBeNull();
  });
});

describe("applyChromaKeyRefinement", () => {
  it("refines only pixels near the removed background mask", () => {
    const data = new Uint8ClampedArray([
      18, 220, 36, 0,
      82, 156, 74, 255,
      210, 48, 62, 255,
      210, 48, 62, 255,
      82, 156, 74, 255,
    ]);
    const removedMask = new Uint8Array([1, 0, 0, 0, 0]);

    applyChromaKeyRefinement(
      data,
      5,
      1,
      { r: 18, g: 220, b: 36 },
      140,
      removedMask
    );

    expect(data[7]).toBeGreaterThan(0);
    expect(data[7]).toBeLessThan(255);
    expect(data[5]).toBeLessThan(156);
    expect(Array.from(data.slice(16, 20))).toEqual([82, 156, 74, 255]);
  });

  it("does not override tolerance when no background pixel was removed", () => {
    const data = new Uint8ClampedArray([82, 156, 74, 255]);

    applyChromaKeyRefinement(
      data,
      1,
      1,
      { r: 18, g: 220, b: 36 },
      140,
      new Uint8Array([0])
    );

    expect(Array.from(data)).toEqual([82, 156, 74, 255]);
  });
});

describe("getChromaKeyAlpha", () => {
  const bgColor = { r: 18, g: 220, b: 36 };

  it("makes strong green background pixels transparent", () => {
    expect(
      getChromaKeyAlpha({
        pixel: { r: 22, g: 224, b: 40 },
        bgColor,
        toleranceDistance: 100,
        originalAlpha: 255,
      })
    ).toBe(0);
  });

  it("softens green spill on edge pixels", () => {
    const alpha = getChromaKeyAlpha({
      pixel: { r: 82, g: 156, b: 74 },
      bgColor,
      toleranceDistance: 140,
      originalAlpha: 255,
    });

    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThan(255);
  });

  it("keeps obvious foreground pixels opaque", () => {
    expect(
      getChromaKeyAlpha({
        pixel: { r: 210, g: 48, b: 62 },
        bgColor,
        toleranceDistance: 140,
        originalAlpha: 255,
      })
    ).toBe(255);
  });
});
