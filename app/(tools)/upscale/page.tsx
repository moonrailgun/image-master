import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { UpscaleClient } from "./client";

const tool = TOOLS.find((t) => t.key === "upscale")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图片放大",
    "超分辨率",
    "Real-ESRGAN",
    "AI放大",
    "无损放大",
    "图片增强",
    "4倍放大",
    "图片清晰化",
  ],
  alternates: {
    canonical: `${SITE_URL}${tool.path}`,
  },
  openGraph: {
    title: tool.seoTitle,
    description: tool.seoDescription,
    url: `${SITE_URL}${tool.path}`,
    siteName: SITE_NAME,
    type: "website",
    locale: "zh_CN",
  },
  twitter: {
    card: "summary_large_image",
    title: tool.seoTitle,
    description: tool.seoDescription,
  },
};

export default function UpscalePage() {
  return <UpscaleClient description={tool.description} />;
}
