import * as ort from "onnxruntime-web";
import { createTrimap, prepareMattingInput, readMattingAlpha } from "./matting-data";

// ViTMatte (Apache-2.0), quantized ONNX export. Pin weights and preprocessing together.
const MODEL_URL = "https://huggingface.co/Xenova/vitmatte-small-composition-1k/resolve/6bc1297f6140f055a227b6d2cfe8c093281f35d2/onnx/model_quantized.onnx";
const CACHE_NAME = "image-master-matting-v1";

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.21.0/dist/";

self.onmessage = async ({ data: { image, mask } }: MessageEvent<{ image: ImageData; mask: ImageData }>) => {
  let session: ort.InferenceSession | undefined;
  let input: ort.Tensor | undefined;
  let outputs: ort.InferenceSession.ReturnType | undefined;
  try {
    self.postMessage({ phase: "matting-download", progress: 0.65 });
    // Cache failure (private browsing / storage quota) must not prevent inference.
    const cache = typeof caches === "undefined" ? undefined : await caches.open(CACHE_NAME).catch(() => undefined);
    const cached = await cache?.match(MODEL_URL).catch(() => undefined);
    const response = cached ?? await fetch(MODEL_URL);
    if (!response.ok) throw new Error(`Matting model download failed: ${response.status}`);
    const bytes = await response.arrayBuffer();
    self.postMessage({ phase: "matting-inference", progress: 0.8 });
    try {
      session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    } catch (error) {
      await cache?.delete(MODEL_URL).catch(() => {});
      throw error;
    }
    if (!cached) await cache?.put(MODEL_URL, new Response(bytes)).catch(() => {});

    const { width, height } = image;
    const trimap = createTrimap(mask.data, width, height);
    const prepared = prepareMattingInput(image.data, trimap, width, height);
    input = new ort.Tensor("float32", prepared.data, [1, 4, prepared.height, prepared.width]);
    outputs = await session.run({ pixel_values: input });
    const alpha = outputs.alphas;
    if (!alpha || alpha.type !== "float32" || alpha.dims.length !== 4 || alpha.dims[0] !== 1 || alpha.dims[1] !== 1 || alpha.dims[2] < height) {
      throw new Error("Unexpected matting output");
    }
    const result = readMattingAlpha(alpha.data as Float32Array, trimap, width, height, alpha.dims[3]);
    self.postMessage({ result }, { transfer: [result.buffer] });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : String(error) });
  } finally {
    input?.dispose();
    if (outputs) Object.values(outputs).forEach((tensor) => tensor.dispose());
    await session?.release();
  }
};
