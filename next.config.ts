import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable Turbopack (Next.js 16 default)
  turbopack: {},
  // Required for @imgly/background-removal ONNX/WASM support
  serverExternalPackages: ["onnxruntime-node"],
  outputFileTracingIncludes: {
    "/**": ["./node_modules/@imgly/background-removal/dist/**/*"],
  },
};

export default nextConfig;
