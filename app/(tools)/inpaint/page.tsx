import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { InpaintClient } from "./client";

const tool = TOOLS.find((t) => t.key === "inpaint")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图片修复",
    "去水印",
    "AI修复",
    "消除物体",
    "修复划痕",
    "图片修补",
    "inpainting",
    "图像修复",
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

export default function InpaintPage() {
  return <InpaintClient description={tool.description} />;
}
