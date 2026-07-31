import { afterEach, describe, expect, it } from "bun:test";

import { completeFileSelection } from "./ImageDropzone";

const originalWindow = globalThis.window;

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

describe("completeFileSelection", () => {
  it("forwards the accepted files and import source", () => {
    const events: Array<[string, Record<string, unknown>]> = [];
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        tianji: {
          track: (name: string, data: Record<string, unknown>) =>
            events.push([name, data]),
        },
      },
    });
    const first = new File(["first"], "first.png", { type: "image/png" });
    const second = new File(["second"], "second.png", { type: "image/png" });
    let selected: File[] = [];

    completeFileSelection(
      [first, second],
      false,
      "paste",
      "crop",
      (files) => {
        selected = files;
      }
    );

    expect(selected).toEqual([first]);
    expect(events).toEqual([
      [
        "tool_import",
        { tool: "crop", source: "paste", file_count: 1 },
      ],
    ]);
  });
});
