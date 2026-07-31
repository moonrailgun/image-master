import { afterEach, describe, expect, it } from "bun:test";

import {
  calculateDurationMs,
  classifyAnalyticsError,
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "./analytics";

type TianjiWindow = Window & {
  tianji?: {
    track: (name: string, data: Record<string, unknown>) => void;
  };
};

const originalWindow = globalThis.window;

function installTracker(
  track: (name: string, data: Record<string, unknown>) => void
) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { tianji: { track } } as TianjiWindow,
  });
}

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});

describe("tool analytics", () => {
  it("forwards the stable event contract to Tianji", () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    installTracker((name, data) => calls.push([name, data]));

    trackToolImport("background", "drop", 2);
    const startedAt = trackToolProcessStart("background", 2, 100.2);
    trackToolProcessSuccess("background", 2, 1, startedAt, 135.8);
    trackToolDownload("background", 1, "single");

    expect(calls).toEqual([
      ["tool_import", { tool: "background", source: "drop", file_count: 2 }],
      ["tool_process_start", { tool: "background", file_count: 2 }],
      [
        "tool_process_success",
        {
          tool: "background",
          file_count: 2,
          processed_count: 1,
          duration_ms: 36,
        },
      ],
      [
        "tool_download",
        { tool: "background", output_count: 1, format: "single" },
      ],
    ]);
  });

  it("does not throw without a browser or loaded tracker", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(() => trackToolImport("crop", "picker", 1)).not.toThrow();

    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });
    expect(() => trackToolDownload("crop", 1, "single")).not.toThrow();
  });

  it("swallows tracker exceptions", () => {
    installTracker(() => {
      throw new Error("blocked");
    });

    expect(() => trackToolImport("resize", "paste", 1)).not.toThrow();
  });

  it("rounds non-negative wall-clock durations", () => {
    expect(calculateDurationMs(100.2, 135.8)).toBe(36);
    expect(calculateDurationMs(200, 150)).toBe(0);
  });

  it.each([
    [new Error("invalid crop area"), "validation"],
    [new Error("failed to fetch model"), "model_download"],
    [new Error("HTTP 503"), "model_download"],
    [new Error("No response body"), "model_download"],
    [new Error("模型文件无效"), "model_download"],
    [new Error("OutOfMemory OOM"), "memory"],
    [new Error("canvas processing failed"), "processing"],
    [new Error("Failed to load image: private.png"), "processing"],
    [new Error("Failed to create blob"), "processing"],
    ["processing", "processing"],
    ["not-an-error", "unknown"],
  ] as const)("classifies failures without returning raw text", (error, expected) => {
    expect(classifyAnalyticsError(error)).toBe(expected);
  });

  it("reports only the controlled failure category", () => {
    const calls: Array<[string, Record<string, unknown>]> = [];
    installTracker((name, data) => calls.push([name, data]));

    trackToolProcessFailure(
      "upscale",
      3,
      10,
      new Error("fetch secret-file-name.png failed"),
      25
    );

    expect(calls).toEqual([
      [
        "tool_process_failure",
        {
          tool: "upscale",
          file_count: 3,
          duration_ms: 15,
          error_type: "model_download",
        },
      ],
    ]);
    expect(JSON.stringify(calls)).not.toContain("secret-file-name.png");
  });
});
