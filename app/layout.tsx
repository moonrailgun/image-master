import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./components/Providers";
import { SITE_NAME, SITE_URL } from "./types";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} - 免费在线图片处理工具箱 | 抠图压缩放大裁剪矢量化`,
    template: `%s | ${SITE_NAME}`,
  },
  description:
    "Image Master 提供9款免费在线图片处理工具：背景扣除、精灵图拆分、AI超分放大、尺寸调整、图片压缩、旋转翻转、AI修复、裁剪、矢量化。所有处理在浏览器本地完成，保护隐私安全。",
  keywords: [
    "图片处理",
    "在线工具",
    "图片编辑",
    "抠图",
    "图片压缩",
    "图片放大",
    "图片裁剪",
    "矢量化",
    "去背景",
    "AI图片处理",
    "免费图片工具",
  ],
  authors: [{ name: "moonrailgun" }],
  creator: "moonrailgun",
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} - 免费在线图片处理工具箱`,
    description:
      "9款免费在线图片处理工具，涵盖抠图、压缩、放大、裁剪、矢量化。纯前端处理，保护隐私。",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} - 免费在线图片处理工具箱`,
    description:
      "9款免费在线图片处理工具，涵盖抠图、压缩、放大、裁剪、矢量化。纯前端处理，保护隐私。",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: SITE_URL,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <script
          async
          defer
          src="https://app.tianji.dev/tracker.js"
          data-website-id="cms4xl5oyfdt0m0fvq9s1tnmn"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
