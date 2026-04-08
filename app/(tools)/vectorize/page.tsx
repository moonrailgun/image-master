import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { VectorizeClient } from "./client";

const tool = TOOLS.find((t) => t.key === "vectorize")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "图片矢量化",
    "PNG转SVG",
    "JPG转SVG",
    "位图转矢量",
    "SVG转换",
    "矢量图生成",
    "图片描摹",
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

export default function VectorizePage() {
  return <VectorizeClient description={tool.description} />;
}
