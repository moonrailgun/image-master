# Tool Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a privacy-safe Tianji funnel for import, processing, failure, success, and download across all nine image tools.

**Architecture:** A typed client-side module in `app/lib/analytics.ts` is the only code that accesses `window.tianji`. `ImageDropzone` reports picker, drop, and paste imports through a tested selection helper; each tool reports transfers and its real processing/download boundaries through the shared analytics API.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Bun test, ESLint, Tianji tracker JavaScript API

## Global Constraints

- Instrument background, sprite, upscale, resize, compress, transform, inpaint, crop, and vectorize.
- Emit only `tool_import`, `tool_process_start`, `tool_process_success`, `tool_process_failure`, and `tool_download`.
- Never report filenames, paths, MIME types, image dimensions, image bytes, prompts, masks, raw errors, stack traces, or stable user identifiers.
- A processing success reports `processed_count`, the number of input files that produced usable output.
- A processing failure is emitted only when no usable output is produced.
- A single download is recorded after `downloadSingle` is invoked; a ZIP download is recorded after `downloadAsZip` resolves.
- Missing, blocked, disabled, or throwing Tianji tracking must never affect visible application behavior.
- Do not add analytics for homepage navigation, parameter changes, previews, or secondary actions.

---

### Task 1: Typed Tianji Analytics Module

**Files:**
- Create: `app/lib/analytics.ts`
- Create: `app/lib/analytics.test.ts`

**Interfaces:**
- Consumes: Tianji's existing global `window.tianji.track(name, data)` API.
- Produces:
  - `ToolKey`
  - `ImportSource`
  - `DownloadFormat`
  - `AnalyticsErrorType`
  - `trackToolImport(tool, source, fileCount): void`
  - `trackToolProcessStart(tool, fileCount, startedAt?): number`
  - `trackToolProcessSuccess(tool, fileCount, processedCount, startedAt, endedAt?): void`
  - `trackToolProcessFailure(tool, fileCount, startedAt, error, endedAt?): void`
  - `trackToolDownload(tool, outputCount, format): void`
  - `classifyAnalyticsError(error): AnalyticsErrorType`
  - `calculateDurationMs(startedAt, endedAt): number`

- [ ] **Step 1: Write failing forwarding and timing tests**

Create `app/lib/analytics.test.ts`:

```ts
import { afterEach, describe, expect, it } from "bun:test";

import {
  calculateDurationMs,
  trackToolDownload,
  trackToolImport,
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
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
bun test app/lib/analytics.test.ts
```

Expected: FAIL because `./analytics` does not exist.

- [ ] **Step 3: Implement the event facade**

Create `app/lib/analytics.ts`:

```ts
export type ToolKey =
  | "background"
  | "sprite"
  | "upscale"
  | "resize"
  | "compress"
  | "transform"
  | "inpaint"
  | "crop"
  | "vectorize";

export type ImportSource = "picker" | "drop" | "paste" | "transfer";
export type DownloadFormat = "single" | "zip";
export type AnalyticsErrorType =
  | "validation"
  | "model_download"
  | "processing"
  | "memory"
  | "unknown";

declare global {
  interface Window {
    tianji?: {
      track: (name: string, data: Record<string, unknown>) => void;
    };
  }
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function track(name: string, data: Record<string, unknown>): void {
  try {
    if (typeof window === "undefined") return;
    window.tianji?.track(name, data);
  } catch {
    // Analytics is best effort and must never interrupt image processing.
  }
}

export function calculateDurationMs(
  startedAt: number,
  endedAt: number
): number {
  return Math.max(0, Math.round(endedAt - startedAt));
}

export function trackToolImport(
  tool: ToolKey,
  source: ImportSource,
  fileCount: number
): void {
  track("tool_import", {
    tool,
    source,
    file_count: fileCount,
  });
}

export function trackToolProcessStart(
  tool: ToolKey,
  fileCount: number,
  startedAt: number = now()
): number {
  track("tool_process_start", {
    tool,
    file_count: fileCount,
  });
  return startedAt;
}

export function trackToolProcessSuccess(
  tool: ToolKey,
  fileCount: number,
  processedCount: number,
  startedAt: number,
  endedAt: number = now()
): void {
  track("tool_process_success", {
    tool,
    file_count: fileCount,
    processed_count: processedCount,
    duration_ms: calculateDurationMs(startedAt, endedAt),
  });
}

export function trackToolDownload(
  tool: ToolKey,
  outputCount: number,
  format: DownloadFormat
): void {
  track("tool_download", {
    tool,
    output_count: outputCount,
    format,
  });
}
```

- [ ] **Step 4: Run the tests and verify the implemented cases are GREEN**

Run:

```bash
bun test app/lib/analytics.test.ts
```

Expected: forwarding, unavailable-tracker, exception, and duration tests PASS.

- [ ] **Step 5: Write failing privacy-safe error classification tests**

Append inside the `describe` block:

```ts
  it.each([
    [new Error("invalid crop area"), "validation"],
    [new Error("failed to fetch model"), "model_download"],
    [new Error("OutOfMemory OOM"), "memory"],
    [new Error("canvas processing failed"), "processing"],
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
```

Add `classifyAnalyticsError` and `trackToolProcessFailure` to the existing
import from `./analytics`.

- [ ] **Step 6: Run the new tests and verify RED**

Run:

```bash
bun test app/lib/analytics.test.ts
```

Expected: FAIL because `classifyAnalyticsError` and
`trackToolProcessFailure` are not exported.

- [ ] **Step 7: Implement controlled error classification**

Append to `app/lib/analytics.ts`:

```ts
export function classifyAnalyticsError(error: unknown): AnalyticsErrorType {
  if (!(error instanceof Error)) return "unknown";

  const message = error.message.toLowerCase();
  if (
    message.includes("invalid") ||
    message.includes("required") ||
    message.includes("validation")
  ) {
    return "validation";
  }
  if (
    message.includes("download") ||
    message.includes("fetch") ||
    message.includes("model")
  ) {
    return "model_download";
  }
  if (
    message.includes("memory") ||
    message.includes("outofmemory") ||
    message.includes("oom")
  ) {
    return "memory";
  }
  if (
    message.includes("process") ||
    message.includes("canvas") ||
    message.includes("decode")
  ) {
    return "processing";
  }
  return "unknown";
}

export function trackToolProcessFailure(
  tool: ToolKey,
  fileCount: number,
  startedAt: number,
  error: unknown,
  endedAt: number = now()
): void {
  track("tool_process_failure", {
    tool,
    file_count: fileCount,
    duration_ms: calculateDurationMs(startedAt, endedAt),
    error_type: classifyAnalyticsError(error),
  });
}
```

- [ ] **Step 8: Verify GREEN and commit**

Run:

```bash
bun test app/lib/analytics.test.ts
bunx eslint app/lib/analytics.ts app/lib/analytics.test.ts
git diff --check
git add app/lib/analytics.ts app/lib/analytics.test.ts
git commit -m "feat(analytics): add typed tool event facade"
```

Expected: tests and focused ESLint PASS; commit contains only the two analytics
files.

---

### Task 2: Import Source Tracking

**Files:**
- Modify: `app/components/ImageDropzone.tsx`
- Create: `app/components/ImageDropzone.test.ts`
- Modify: all nine tool components listed in Tasks 3-5

**Interfaces:**
- Consumes: `ToolKey`, `ImportSource`, and `trackToolImport` from Task 1.
- Produces:
  - Required `tool: ToolKey` prop on `ImageDropzone`.
  - Exported `completeFileSelection(files, multiple, source, tool, callback)`.
  - Transfer imports emitted directly by receiving tool components.

- [ ] **Step 1: Write the failing shared selection test**

Create `app/components/ImageDropzone.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
bun test app/components/ImageDropzone.test.ts
```

Expected: FAIL because `completeFileSelection` is not exported.

- [ ] **Step 3: Implement source propagation**

In `app/components/ImageDropzone.tsx`, import the analytics types/functions and
add the required prop:

```ts
import {
  trackToolImport,
  type ImportSource,
  type ToolKey,
} from "../lib/analytics";

interface ImageDropzoneProps {
  tool: ToolKey;
  onFilesSelected: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  pasteEnabled?: boolean;
}

export function completeFileSelection(
  files: File[],
  multiple: boolean,
  source: ImportSource,
  tool: ToolKey,
  onFilesSelected: (files: File[]) => void
): void {
  const accepted = multiple ? files : files.slice(0, 1);
  if (accepted.length === 0) return;

  trackToolImport(tool, source, accepted.length);
  onFilesSelected(accepted);
}
```

Destructure `tool` in the component. Replace the three callback sites with:

```ts
completeFileSelection(imageFiles, multiple, "paste", tool, onFilesSelected);
completeFileSelection(files, multiple, "drop", tool, onFilesSelected);
completeFileSelection(files, multiple, "picker", tool, onFilesSelected);
```

For file input, preserve the existing `e.target.value = ""` after the call.

- [ ] **Step 4: Add the required tool key to every dropzone**

Use these exact mappings:

```tsx
<ImageDropzone
  tool="background"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="sprite"
  onFilesSelected={handleFilesSelected}
  accept="image/png"
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="upscale"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="resize"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="compress"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="transform"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="inpaint"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
  multiple={false}
/>
<ImageDropzone
  tool="crop"
  onFilesSelected={handleFilesSelected}
  multiple={false}
  pasteEnabled={isActive}
/>
<ImageDropzone
  tool="vectorize"
  onFilesSelected={handleFilesSelected}
  pasteEnabled={isActive}
/>
```

- [ ] **Step 5: Record incoming transfers once at each receiving effect**

Import `trackToolImport` in every tool component. Immediately before applying
`pendingTransfer.files` to state, add the matching call:

```ts
trackToolImport("background", "transfer", pendingTransfer.files.length);
trackToolImport("sprite", "transfer", pendingTransfer.files.length);
trackToolImport("upscale", "transfer", pendingTransfer.files.length);
trackToolImport("resize", "transfer", pendingTransfer.files.length);
trackToolImport("compress", "transfer", pendingTransfer.files.length);
trackToolImport("transform", "transfer", pendingTransfer.files.length);
trackToolImport("inpaint", "transfer", 1);
trackToolImport("crop", "transfer", 1);
trackToolImport("vectorize", "transfer", pendingTransfer.files.length);
```

For inpaint and crop, emit `1` because each component accepts only the first
transferred file. Keep each existing transfer deduplication mechanism intact.

- [ ] **Step 6: Verify GREEN and commit**

Run:

```bash
bun test app/components/ImageDropzone.test.ts app/lib/analytics.test.ts
bunx eslint app/components/ImageDropzone.tsx app/components/ImageDropzone.test.ts
bun run build
git diff --check
git add app/components/ImageDropzone.tsx app/components/ImageDropzone.test.ts app/components/BackgroundRemover.tsx app/components/SpriteSplitter.tsx app/components/SuperResolution.tsx app/components/ImageResizer.tsx app/components/ImageCompressor.tsx app/components/ImageTransform.tsx app/components/ImageInpainting.tsx app/components/ImageCropper.tsx app/components/ImageVectorizer.tsx
git commit -m "feat(analytics): track image import sources"
```

Expected: focused tests, focused ESLint, and production build PASS.

---

### Task 3: Partial-Success Batch Processing

**Files:**
- Modify: `app/components/BackgroundRemover.tsx`
- Modify: `app/components/SpriteSplitter.tsx`
- Modify: `app/components/SuperResolution.tsx`

**Interfaces:**
- Consumes: process and download functions from `app/lib/analytics.ts`.
- Produces: correct start/success/failure/download events for tools that catch
  individual file failures and may return partial results.

Extend the analytics import in each of the three files to include:

```ts
import {
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "../lib/analytics";
```

- [ ] **Step 1: Instrument background removal boundaries**

At the start of `handleProcess`, add:

```ts
const startedAt = trackToolProcessStart("background", files.length);
let lastError: unknown;
```

Inside the existing per-file `catch`, assign:

```ts
lastError = error;
```

After processing and before resetting `processing`, add:

```ts
if (processed.length > 0) {
  trackToolProcessSuccess(
    "background",
    files.length,
    processed.length,
    startedAt
  );
} else {
  trackToolProcessFailure(
    "background",
    files.length,
    startedAt,
    lastError
  );
}
```

After each download is initiated:

```ts
downloadSingle(results[0].blob, results[0].name);
trackToolDownload("background", 1, "single");
await downloadAsZip(items, "transparent-images.zip");
trackToolDownload("background", results.length, "zip");
```

- [ ] **Step 2: Instrument sprite splitting boundaries**

At processing start:

```ts
const startedAt = trackToolProcessStart("sprite", files.length);
let lastError: unknown;
```

Assign `lastError = error` in the per-file catch. After the loop:

```ts
if (processed.length > 0) {
  trackToolProcessSuccess("sprite", files.length, processed.length, startedAt);
} else {
  trackToolProcessFailure("sprite", files.length, startedAt, lastError);
}
```

Use the flattened `items.length` for downloads:

```ts
downloadSingle(items[0].blob, items[0].name);
trackToolDownload("sprite", 1, "single");
await downloadAsZip(items, "sprites.zip");
trackToolDownload("sprite", items.length, "zip");
```

- [ ] **Step 3: Instrument super-resolution boundaries**

At the start:

```ts
const startedAt = trackToolProcessStart("upscale", files.length);
let lastError: unknown;
```

Inside the per-file promise catch:

```ts
lastError = error;
```

Immediately after `processed` is calculated:

```ts
if (processed.length > 0) {
  trackToolProcessSuccess(
    "upscale",
    files.length,
    processed.length,
    startedAt
  );
} else {
  trackToolProcessFailure("upscale", files.length, startedAt, lastError);
}
```

Add downloads:

```ts
downloadSingle(results[0].blob, results[0].name);
trackToolDownload("upscale", 1, "single");
await downloadAsZip(items, `upscaled-x${scale}.zip`);
trackToolDownload("upscale", results.length, "zip");
```

- [ ] **Step 4: Verify and commit**

Run:

```bash
bun test app/lib/analytics.test.ts
bunx eslint app/components/BackgroundRemover.tsx app/components/SpriteSplitter.tsx app/components/SuperResolution.tsx
bun run build
git diff --check
git add app/components/BackgroundRemover.tsx app/components/SpriteSplitter.tsx app/components/SuperResolution.tsx
git commit -m "feat(analytics): track batch tool funnels"
```

Expected: analytics tests and build PASS. Focused ESLint still reports the
existing `react/no-unescaped-entities` error in `SpriteSplitter.tsx`; confirm
this task adds no additional diagnostic.

---

### Task 4: All-or-Nothing Multi-File Processing

**Files:**
- Modify: `app/components/ImageResizer.tsx`
- Modify: `app/components/ImageCompressor.tsx`
- Modify: `app/components/ImageTransform.tsx`
- Modify: `app/components/ImageVectorizer.tsx`

**Interfaces:**
- Consumes: process and download functions from `app/lib/analytics.ts`.
- Produces: one complete funnel per processing invocation for tools whose core
  library call either returns a result array or throws.

Extend the analytics import in each of the four files to include:

```ts
import {
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "../lib/analytics";
```

- [ ] **Step 1: Instrument image resizing**

At the beginning of the `try`-based processing run:

```ts
const startedAt = trackToolProcessStart("resize", files.length);
```

After results are returned:

```ts
if (results.length > 0) {
  trackToolProcessSuccess(
    "resize",
    files.length,
    results.length,
    startedAt
  );
} else {
  trackToolProcessFailure(
    "resize",
    files.length,
    startedAt,
    new Error("processing produced no output")
  );
}
```

Inside `catch`:

```ts
trackToolProcessFailure("resize", files.length, startedAt, error);
```

After download initiation:

```ts
trackToolDownload("resize", 1, "single");
trackToolDownload("resize", results.length, "zip");
```

The ZIP tracking call must immediately follow the awaited ZIP generation call.

- [ ] **Step 2: Instrument image compression**

Use these exact calls at the equivalent boundaries:

```ts
const startedAt = trackToolProcessStart("compress", files.length);
if (results.length > 0) {
  trackToolProcessSuccess(
    "compress",
    files.length,
    results.length,
    startedAt
  );
} else {
  trackToolProcessFailure(
    "compress",
    files.length,
    startedAt,
    new Error("processing produced no output")
  );
}
trackToolProcessFailure("compress", files.length, startedAt, error);
trackToolDownload("compress", 1, "single");
trackToolDownload("compress", results.length, "zip");
```

- [ ] **Step 3: Instrument image transform**

Instrument the shared `executeTransform` function so rotate, custom rotate, and
flip all use the same funnel:

```ts
const startedAt = trackToolProcessStart("transform", files.length);
if (newResults.length > 0) {
  trackToolProcessSuccess(
    "transform",
    files.length,
    newResults.length,
    startedAt
  );
} else {
  trackToolProcessFailure(
    "transform",
    files.length,
    startedAt,
    new Error("processing produced no output")
  );
}
trackToolProcessFailure("transform", files.length, startedAt, error);
trackToolDownload("transform", 1, "single");
trackToolDownload("transform", results.length, "zip");
```

Do not emit an import event for “use results as new input”; it is a secondary
action outside the agreed scope.

- [ ] **Step 4: Instrument vectorization**

Instrument `handleVectorize` and `handleDownload`:

```ts
const startedAt = trackToolProcessStart("vectorize", files.length);
if (newResults.length > 0) {
  trackToolProcessSuccess(
    "vectorize",
    files.length,
    newResults.length,
    startedAt
  );
} else {
  trackToolProcessFailure(
    "vectorize",
    files.length,
    startedAt,
    new Error("processing produced no output")
  );
}
trackToolProcessFailure("vectorize", files.length, startedAt, error);
trackToolDownload("vectorize", 1, "single");
trackToolDownload("vectorize", results.length, "zip");
```

- [ ] **Step 5: Verify and commit**

Run:

```bash
bun test app/lib/analytics.test.ts
bunx eslint app/components/ImageResizer.tsx app/components/ImageCompressor.tsx app/components/ImageTransform.tsx app/components/ImageVectorizer.tsx
bun run build
git diff --check
git add app/components/ImageResizer.tsx app/components/ImageCompressor.tsx app/components/ImageTransform.tsx app/components/ImageVectorizer.tsx
git commit -m "feat(analytics): track multi-file tool funnels"
```

Expected: analytics tests and build PASS. The existing `prefer-const` error in
`ImageVectorizer.tsx` is a known baseline diagnostic; confirm this task adds no
additional diagnostic.

---

### Task 5: Single-File Processing

**Files:**
- Modify: `app/components/ImageInpainting.tsx`
- Modify: `app/components/ImageCropper.tsx`

**Interfaces:**
- Consumes: process and download functions from `app/lib/analytics.ts`.
- Produces: one complete funnel per valid inpaint or crop operation.

Extend the analytics import in both files to include:

```ts
import {
  trackToolDownload,
  trackToolImport,
  trackToolProcessFailure,
  trackToolProcessStart,
  trackToolProcessSuccess,
} from "../lib/analytics";
```

- [ ] **Step 1: Instrument image inpainting**

Do not emit a start or failure event when no mask exists; that is client-side
validation before processing begins. After the mask guard:

```ts
const startedAt = trackToolProcessStart("inpaint", 1);
```

After `inpaintImage` returns:

```ts
trackToolProcessSuccess("inpaint", 1, 1, startedAt);
```

Inside `catch`:

```ts
trackToolProcessFailure("inpaint", 1, startedAt, error);
```

After `downloadSingle`:

```ts
trackToolDownload("inpaint", 1, "single");
```

- [ ] **Step 2: Instrument manual image crop**

Instrument `handleCrop`, which is the operation that produces downloadable
output:

```ts
const startedAt = trackToolProcessStart("crop", 1);
trackToolProcessSuccess("crop", 1, 1, startedAt);
trackToolProcessFailure("crop", 1, startedAt, error);
trackToolDownload("crop", 1, "single");
```

Do not instrument `handleTrimTransparent`; it only adjusts the crop selection
and does not create output.

- [ ] **Step 3: Verify and commit**

Run:

```bash
bun test app/lib/analytics.test.ts
bunx eslint app/components/ImageInpainting.tsx app/components/ImageCropper.tsx
bun run build
git diff --check
git add app/components/ImageInpainting.tsx app/components/ImageCropper.tsx
git commit -m "feat(analytics): track single-file tool funnels"
```

Expected: analytics tests and build PASS. If focused ESLint reports an existing
error in `ImageCropper.tsx`, verify that the changed lines introduce no new
diagnostic and report the baseline error separately rather than modifying
unrelated crop code.

---

### Task 6: Contract Audit and Final Verification

**Files:**
- Verify: `app/lib/analytics.ts`
- Verify: `app/components/ImageDropzone.tsx`
- Verify: all nine tool components

**Interfaces:**
- Consumes: all prior tasks.
- Produces: evidence that the event contract is complete, privacy-safe, and
  buildable.

- [ ] **Step 1: Audit event coverage**

Run:

```bash
rg -n "trackTool(Import|ProcessStart|ProcessSuccess|ProcessFailure|Download)" app/components app/lib/analytics.ts
```

Confirm each tool key has:

- Picker/drop/paste through its `ImageDropzone` with the matching tool key.
- A transfer import at the receiving effect.
- A process start.
- Either process success or process failure at the real result boundary.
- A download event after single or ZIP initiation.

- [ ] **Step 2: Audit privacy fields**

Run:

```bash
rg -n "track\\(|trackTool" app/lib/analytics.ts app/components
```

Confirm no analytics payload includes `file.name`, MIME type, dimensions, raw
errors, messages, stack traces, prompt data, masks, or image content.

- [ ] **Step 3: Run focused and full tests**

Run:

```bash
bun test app/lib/analytics.test.ts app/components/ImageDropzone.test.ts
bun test
```

Expected: new tests PASS and the existing suite has no new failures.

- [ ] **Step 4: Run lint and build checks**

Run:

```bash
bunx eslint app/lib/analytics.ts app/lib/analytics.test.ts app/components/ImageDropzone.tsx app/components/ImageDropzone.test.ts app/components/BackgroundRemover.tsx app/components/SpriteSplitter.tsx app/components/SuperResolution.tsx app/components/ImageResizer.tsx app/components/ImageCompressor.tsx app/components/ImageTransform.tsx app/components/ImageInpainting.tsx app/components/ImageCropper.tsx app/components/ImageVectorizer.tsx
bun run lint
bun run build
git diff --check
git status --short
```

Expected: production build and diff check PASS. Report any unchanged
full-project ESLint baseline failures separately with their file paths; do not
claim the full lint passes unless it exits successfully.

- [ ] **Step 5: Commit any verification-only adjustments**

If verification required a scoped adjustment, run:

```bash
git add app/lib/analytics.ts app/lib/analytics.test.ts app/components/ImageDropzone.tsx app/components/ImageDropzone.test.ts app/components/BackgroundRemover.tsx app/components/SpriteSplitter.tsx app/components/SuperResolution.tsx app/components/ImageResizer.tsx app/components/ImageCompressor.tsx app/components/ImageTransform.tsx app/components/ImageInpainting.tsx app/components/ImageCropper.tsx app/components/ImageVectorizer.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "fix(analytics): align tool event tracking"
```

If no files changed, do not create an empty commit.
