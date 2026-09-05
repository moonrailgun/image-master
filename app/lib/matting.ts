export async function refineMatting(
  original: Blob,
  coarseMask: Blob,
  onProgress?: (phase: string, progress: number) => void,
): Promise<Blob> {
  const image = await createImageBitmap(original);
  let mask: ImageBitmap | undefined;
  let worker: Worker | undefined;
  try {
    mask = await createImageBitmap(coarseMask);
    if (image.width !== mask.width || image.height !== mask.height) throw new Error("Matting image dimensions differ");
    // ponytail: cap CPU inference at 768px; use a GPU path if larger working images are needed.
    const scale = Math.min(1, 768 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(mask, 0, 0, width, height);
    const maskData = ctx.getImageData(0, 0, width, height);
    worker = new Worker(new URL("./matting.worker.ts", import.meta.url));
    const activeWorker = worker;
    const alpha = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Matting timed out")), 180_000);
      const fail = (message: string) => { clearTimeout(timer); reject(new Error(message)); };
      activeWorker.onerror = (event) => fail(event.message || "Matting worker failed");
      activeWorker.onmessageerror = () => fail("Invalid matting worker message");
      activeWorker.onmessage = ({ data }) => {
        if (data.error) fail(data.error);
        else if (data.result) { clearTimeout(timer); resolve(data.result); }
        else if (data.phase) onProgress?.(data.phase, data.progress);
      };
      activeWorker.postMessage({ image: imageData, mask: maskData }, [imageData.data.buffer, maskData.data.buffer]);
    });
    const alphaCanvas = document.createElement("canvas");
    alphaCanvas.width = width;
    alphaCanvas.height = height;
    alphaCanvas.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(alpha), width, height), 0, 0);
    canvas.width = image.width;
    canvas.height = image.height;
    ctx.drawImage(alphaCanvas, 0, 0, image.width, image.height);
    const fullAlpha = ctx.getImageData(0, 0, image.width, image.height).data;
    ctx.clearRect(0, 0, image.width, image.height);
    ctx.drawImage(image, 0, 0);
    const result = ctx.getImageData(0, 0, image.width, image.height);
    for (let i = 3; i < result.data.length; i += 4) result.data[i] = Math.min(result.data[i], fullAlpha[i]);
    ctx.putImageData(result, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Failed to encode matting result")), "image/png");
    });
  } finally {
    worker?.terminate();
    image.close();
    mask?.close();
  }
}
