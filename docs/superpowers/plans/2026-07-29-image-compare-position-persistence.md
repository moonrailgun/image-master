# ImageCompare Position Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve the user's slider position when the images in the same comparison slot are regenerated.

**Architecture:** `ImageCompare` accepts an optional stable `persistKey` and remains the sole owner of slider position. A component-private position store restores state across React unmounts; callers only identify stable slots and never read or update the position.

**Tech Stack:** React 19, TypeScript, Bun test, Next.js 16, ESLint

## Global Constraints

- A new comparison slot starts at 50%.
- Persistence lasts only for the current JavaScript runtime and does not use browser storage.
- Existing callers without `persistKey` retain non-persistent behavior.
- Existing background-removal working-tree changes must not be edited or committed.

---

### Task 1: Component-private position persistence

**Files:**
- Create: `app/components/image-compare-position.ts`
- Create: `app/components/image-compare-position.test.ts`
- Modify: `app/components/ImageCompare.tsx`

**Interfaces:**
- Produces: `readImageComparePosition(persistKey?: string): number`
- Produces: `writeImageComparePosition(persistKey: string | undefined, position: number): void`
- Produces: optional `ImageCompareProps.persistKey?: string`

- [ ] **Step 1: Write the failing store tests**

```ts
import { beforeEach, describe, expect, test } from "bun:test";
import {
  clearImageComparePositions,
  readImageComparePosition,
  writeImageComparePosition,
} from "./image-compare-position";

describe("image comparison position persistence", () => {
  beforeEach(() => clearImageComparePositions());

  test("restores the last position for the same slot", () => {
    writeImageComparePosition("inpainting", 27);
    expect(readImageComparePosition("inpainting")).toBe(27);
  });

  test("starts a different slot at the midpoint", () => {
    writeImageComparePosition("upscale-0", 72);
    expect(readImageComparePosition("upscale-1")).toBe(50);
  });

  test("does not persist a component without a key", () => {
    writeImageComparePosition(undefined, 34);
    expect(readImageComparePosition(undefined)).toBe(50);
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run: `bun test app/components/image-compare-position.test.ts`

Expected: FAIL because `./image-compare-position` does not exist.

- [ ] **Step 3: Implement the minimal private store**

```ts
const DEFAULT_POSITION = 50;
const positions = new Map<string, number>();

export function readImageComparePosition(persistKey?: string): number {
  return persistKey ? positions.get(persistKey) ?? DEFAULT_POSITION : DEFAULT_POSITION;
}

export function writeImageComparePosition(
  persistKey: string | undefined,
  position: number
): void {
  if (persistKey) positions.set(persistKey, position);
}

export function clearImageComparePositions(): void {
  positions.clear();
}
```

- [ ] **Step 4: Run the store tests and verify GREEN**

Run: `bun test app/components/image-compare-position.test.ts`

Expected: 3 tests pass.

- [ ] **Step 5: Wire persistence into `ImageCompare`**

Add `persistKey?: string` to `ImageCompareProps`. Initialize `position` with
`readImageComparePosition(persistKey)`. Replace direct position writes with a
callback that updates local state and calls
`writeImageComparePosition(persistKey, nextPosition)`. Add an effect that
restores `readImageComparePosition(persistKey)` when `persistKey` changes.

- [ ] **Step 6: Verify component integration**

Run: `bun test app/components/image-compare-position.test.ts && bunx eslint app/components/ImageCompare.tsx app/components/image-compare-position.ts app/components/image-compare-position.test.ts`

Expected: tests pass and ESLint exits successfully without warnings.

- [ ] **Step 7: Commit the isolated component behavior**

```bash
git add app/components/ImageCompare.tsx app/components/image-compare-position.ts app/components/image-compare-position.test.ts
git commit -m "feat(compare): persist slider position by slot"
```

### Task 2: Stable comparison-slot identities

**Files:**
- Modify: `app/components/ImageInpainting.tsx`
- Modify: `app/components/SuperResolution.tsx`
- Modify: `app/components/ImageVectorizer.tsx`

**Interfaces:**
- Consumes: optional `ImageCompareProps.persistKey?: string`
- Produces: stable keys `image-inpainting`, `super-resolution-${i}`, and `image-vectorizer-${i}`

- [ ] **Step 1: Add stable keys to all current call sites**

Pass `persistKey="image-inpainting"` to the inpainting comparison. Pass
`persistKey={`super-resolution-${i}`}` to each super-resolution comparison.
Pass `persistKey={`image-vectorizer-${i}`}` through `SvgResultPreview` to each
vectorizer comparison slot.

- [ ] **Step 2: Run focused static verification**

Run: `bunx eslint app/components/ImageCompare.tsx app/components/ImageInpainting.tsx app/components/SuperResolution.tsx app/components/ImageVectorizer.tsx app/components/image-compare-position.ts app/components/image-compare-position.test.ts`

Expected: ESLint exits successfully without warnings.

- [ ] **Step 3: Run the complete available test suite**

Run: `bun test`

Expected: all repository tests pass.

- [ ] **Step 4: Run the production build**

Run: `bun run build`

Expected: Next.js production build and TypeScript checks complete successfully.

- [ ] **Step 5: Commit call-site integration**

```bash
git add app/components/ImageInpainting.tsx app/components/SuperResolution.tsx app/components/ImageVectorizer.tsx
git commit -m "feat(compare): identify persistent image slots"
```
