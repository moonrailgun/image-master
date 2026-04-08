import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { BackgroundRemoverClient } from "./client";

const tool = TOOLS.find((t) => t.key === "background")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图片去背景",
    "背景扣除",
    "透明背景",
    "抠图",
    "AI抠图",
    "去除背景",
    "在线抠图",
    "免费抠图工具",
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

export default function BackgroundRemoverPage() {
  return <BackgroundRemoverClient description={tool.description} />;
}
