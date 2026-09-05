/** Expand both sides of the coarse boundary into the trimap's unknown region. */
export function createTrimap(rgba: Uint8ClampedArray, width: number, height: number, radius = 8): Uint8Array {
  const stride = width + 1;
  // Summed-area table of background / unknown / foreground labels (0 / 1 / 2).
  const sums = new Uint32Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      const alpha = rgba[(y * width + x) * 4 + 3];
      row += alpha <= 5 ? 0 : alpha >= 250 ? 2 : 1;
      sums[(y + 1) * stride + x + 1] = sums[y * stride + x + 1] + row;
    }
  }
  const trimap = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
      const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
      const sum = sums[bottom * stride + right] - sums[top * stride + right]
        - sums[bottom * stride + left] + sums[top * stride + left];
      trimap[y * width + x] = sum === 0 ? 0 : sum === 2 * (right - left) * (bottom - top) ? 255 : 128;
    }
  }
  return trimap;
}

export function prepareMattingInput(rgba: Uint8ClampedArray, trimap: Uint8Array, width: number, height: number) {
  const paddedWidth = Math.ceil(width / 32) * 32;
  const paddedHeight = Math.ceil(height / 32) * 32;
  const plane = paddedWidth * paddedHeight;
  const data = new Float32Array(4 * plane);
  // Matches the pinned model's preprocessor_config.json: mean/std = 0.5.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = y * width + x, target = y * paddedWidth + x;
      for (let c = 0; c < 3; c++) data[c * plane + target] = rgba[source * 4 + c] / 127.5 - 1;
      data[3 * plane + target] = trimap[source] / 255;
    }
  }
  return { data, width: paddedWidth, height: paddedHeight };
}

export function readMattingAlpha(alpha: Float32Array, trimap: Uint8Array, width: number, height: number, outputWidth: number) {
  if (outputWidth < width || alpha.length < outputWidth * height) throw new Error("Invalid matting output size");
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x, value = alpha[y * outputWidth + x];
      if (!Number.isFinite(value)) throw new Error("Invalid matting alpha");
      rgba[i * 4 + 3] = trimap[i] === 128 ? Math.round(Math.max(0, Math.min(1, value)) * 255) : trimap[i];
    }
  }
  return rgba;
}
