import { describe, expect, test } from "bun:test";
import {
  getNextVectorizePreset,
  PRESET_ORDER,
} from "./image-vectorizer";

describe("getNextVectorizePreset", () => {
  test("returns the preset after the current preset", () => {
    expect(getNextVectorizePreset("posterized1")).toBe("posterized2");
  });

  test("wraps from the final preset to the first preset", () => {
    expect(getNextVectorizePreset(PRESET_ORDER.at(-1)!)).toBe(
      PRESET_ORDER[0]
    );
  });

  test("falls back to the first preset for an unknown value", () => {
    expect(getNextVectorizePreset("unknown")).toBe(PRESET_ORDER[0]);
  });
});
