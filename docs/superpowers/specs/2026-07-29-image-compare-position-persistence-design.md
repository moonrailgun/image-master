# ImageCompare Position Persistence

## Goal

Preserve the user's last comparison-slider position when images in the same
comparison slot are regenerated. A new comparison slot starts at 50%.

Persistence is limited to the current client runtime. It does not survive a
page refresh and is not stored in browser storage.

## Component API

`ImageCompare` gains one optional prop:

```ts
persistKey?: string;
```

Callers use a stable, namespaced key to identify a comparison slot. They do not
read or control the slider position.

When `persistKey` is absent, `ImageCompare` keeps its existing behavior and
starts each new component instance at 50%.

## State Flow

`ImageCompare` owns a module-local map from `persistKey` to slider position.

- On mount, the component restores the cached position for `persistKey`, or
  starts at 50% when no cached value exists.
- Whenever the user moves the slider, the component updates both its local
  state and the cached value for the current `persistKey`.
- When the component is temporarily unmounted while processing and later
  remounted with the same `persistKey`, it restores the previous position.
- Different keys never share positions.
- If a mounted component receives a different `persistKey`, it restores that
  key's cached position or resets to 50%.

The cache is intentionally in memory. The small, stable set of namespaced slot
keys avoids input-dependent cache growth.

## Call Sites

The current comparison tools provide stable slot identities:

- Image inpainting uses one namespaced key.
- Super resolution uses a namespaced key plus the result slot index.
- Image vectorization uses a namespaced key plus the result slot index.

Changing image URLs, blobs, result versions, or processing state does not
change these keys.

## Verification

Regression coverage verifies:

1. A remounted comparison with the same `persistKey` restores the user's last
   position.
2. A different `persistKey` starts at 50%.
3. Omitting `persistKey` preserves the existing non-persistent behavior.
4. Changing `persistKey` on a mounted component restores the corresponding
   position.

Static checks cover TypeScript and lint integration at all call sites.
