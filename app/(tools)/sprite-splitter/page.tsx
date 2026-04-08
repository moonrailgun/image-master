import type { Metadata } from "next";
import { TOOLS, SITE_NAME, SITE_URL } from "../../types";
import { SpriteSplitterClient } from "./client";

const tool = TOOLS.find((t) => t.key === "sprite")!;

export const metadata: Metadata = {
  title: `${tool.seoTitle} | ${SITE_NAME}`,
  description: tool.seoDescription,
  keywords: [
    "精灵图拆分",
    "sprite sheet",
    "切图工具",
    "雪碧图",
    "游戏UI",
    "图集拆分",
    "自动切图",
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

export default function SpriteSplitterPage() {
  return <SpriteSplitterClient description={tool.description} />;
}
