import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { ResizeClient } from "./client";

const tool = TOOLS.find((t) => t.key === "resize")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图片缩放",
    "尺寸调整",
    "修改分辨率",
    "批量缩放",
    "图片大小",
    "调整尺寸",
    "像素修改",
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

export default function ResizePage() {
  return <ResizeClient description={tool.description} />;
}
