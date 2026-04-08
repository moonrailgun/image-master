import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { CompressClient } from "./client";

const tool = TOOLS.find((t) => t.key === "compress")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图片压缩",
    "在线压缩",
    "图片优化",
    "JPEG压缩",
    "WebP转换",
    "PNG压缩",
    "减小文件大小",
    "图片瘦身",
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

export default function CompressPage() {
  return <CompressClient description={tool.description} />;
}
