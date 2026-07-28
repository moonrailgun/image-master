# Vectorize Next Preset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a button beside the vectorization preset selector that advances to the next preset, wraps after the last preset, and immediately generates with the newly selected preset.

**Architecture:** Keep preset ordering and next-preset calculation in `app/lib/image-vectorizer.ts` as exported, testable domain logic. Reuse the existing component generation pipeline by allowing it to receive an explicit preset for one run, preventing React's asynchronous state update from causing generation with the previous preset.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Bun test

## Global Constraints

- Preserve the existing `PRESET_LABELS` display order as the cycle order.
- Wrap from the final preset to the first preset, `default`.
- A normal select change must not generate automatically.
- Existing custom parameters remain active during a cycle-triggered generation.
- Disable the cycle button while vectorization is processing.
- Keep the newly selected preset if generation fails.
- Do not introduce task queues, cancellation, result history, or new dependencies.

---

### Task 1: Cycle to the next preset and generate

**Files:**
- Modify: `app/lib/image-vectorizer.ts`
- Create: `app/lib/image-vectorizer.test.ts`
- Modify: `app/components/ImageVectorizer.tsx`

**Interfaces:**
- Produces: `PRESET_ORDER: readonly VectorizePreset[]`
- Produces: `getNextVectorizePreset(currentPreset: string): VectorizePreset`
- Consumes: existing `vectorizeImages(files, options, onProgress)` generation pipeline

- [ ] **Step 1: Write failing tests for preset advancement and wraparound**

Create `app/lib/image-vectorizer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
bun test app/lib/image-vectorizer.test.ts
```

Expected: FAIL because `getNextVectorizePreset` and `PRESET_ORDER` are not exported.

- [ ] **Step 3: Add the minimal preset-order implementation**

In `app/lib/image-vectorizer.ts`, directly after `PRESET_LABELS`, add:

```ts
export const PRESET_ORDER = Object.keys(
  PRESET_LABELS
) as readonly VectorizePreset[];

export function getNextVectorizePreset(
  currentPreset: string
): VectorizePreset {
  const currentIndex = PRESET_ORDER.indexOf(
    currentPreset as VectorizePreset
  );

  if (currentIndex === -1) {
    return PRESET_ORDER[0];
  }

  return PRESET_ORDER[(currentIndex + 1) % PRESET_ORDER.length];
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
bun test app/lib/image-vectorizer.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Reuse the generation pipeline with an explicit run preset**

In `app/components/ImageVectorizer.tsx`, import the helper:

```ts
import {
  getNextVectorizePreset,
  vectorizeImages,
  VectorizeOptions,
  VectorizeResult,
  VectorizePreset,
  PRESET_LABELS,
} from "../lib/image-vectorizer";
```

Change the generation callback signature from:

```ts
const handleVectorize = useCallback(async () => {
```

to:

```ts
const handleVectorize = useCallback(async (
  runPreset: VectorizePreset = preset
) => {
```

Within that callback, replace:

```ts
const options: VectorizeOptions = {
  preset,
};
```

with:

```ts
const options: VectorizeOptions = {
  preset: runPreset,
};
```

Add a cycle handler beside it:

```ts
const handleNextPreset = useCallback(() => {
  const nextPreset = getNextVectorizePreset(preset);
  setPreset(nextPreset);
  void handleVectorize(nextPreset);
}, [preset, handleVectorize]);
```

Wrap the existing execute-button callback so React does not pass its click event as `runPreset`:

```tsx
onClick={() => void handleVectorize()}
```

- [ ] **Step 6: Add the cycle button beside the preset selector**

Replace the preset selector's standalone layout with a flex row. Keep the existing select options and styling, add `min-w-0 flex-1` to the select, and add:

```tsx
<div className="flex gap-2">
  <select
    value={preset}
    onChange={(e) => setPreset(e.target.value as VectorizePreset)}
    className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
  >
    {Object.entries(PRESET_LABELS).map(([key, label]) => (
      <option key={key} value={key}>
        {label}
      </option>
    ))}
  </select>
  <button
    type="button"
    onClick={handleNextPreset}
    disabled={processing}
    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-400 transition-colors hover:border-emerald-500/50 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
    title="下一个预设并生成"
    aria-label="下一个预设并生成"
  >
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
      />
    </svg>
  </button>
</div>
```

- [ ] **Step 7: Run focused and full verification**

Run:

```bash
bun test app/lib/image-vectorizer.test.ts
bun test
bun run lint
bun run build
git diff --check
```

Expected:

- Focused test: 3 tests pass.
- Full test suite: all tests pass.
- ESLint exits with code 0.
- Next.js production build exits with code 0.
- `git diff --check` prints no errors.

- [ ] **Step 8: Review the final diff and commit**

Run:

```bash
git diff -- app/lib/image-vectorizer.ts app/lib/image-vectorizer.test.ts app/components/ImageVectorizer.tsx
git status --short
git add app/lib/image-vectorizer.ts app/lib/image-vectorizer.test.ts app/components/ImageVectorizer.tsx
git diff --cached --name-only
git diff --cached --check
git commit -m "feat(vectorize): cycle presets and generate"
```

Expected: only the three named implementation files are committed.
