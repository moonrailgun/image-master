import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Enable Turbopack (Next.js 16 default)
  turbopack: {},
  // Required for @imgly/background-removal ONNX/WASM support
  serverExternalPackages: ["onnxruntime-node"],
};

export default nextConfig;
