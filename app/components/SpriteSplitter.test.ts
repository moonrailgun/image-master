import { expect, test } from "bun:test";
import {
  countProcessedSpriteFiles,
  getSpriteFailureCause,
} from "./SpriteSplitter";
import { classifyAnalyticsError } from "../lib/analytics";

test("counts only files that yield at least one sprite", () => {
  expect(
    countProcessedSpriteFiles([
      { sprites: [] },
      { sprites: [{ name: "sprite.png" }] },
      { sprites: [] },
    ])
  ).toBe(1);
});

test("reports zero processed files when no input yields a sprite", () => {
  expect(countProcessedSpriteFiles([{ sprites: [] }, { sprites: [] }])).toBe(0);
});

test("uses a controlled processing cause when all sprite outputs are empty", () => {
  expect(classifyAnalyticsError(getSpriteFailureCause(undefined))).toBe(
    "processing"
  );
});
