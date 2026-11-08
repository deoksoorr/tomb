import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import { SITE_DESCRIPTION, SITE_TITLE, shareMetadata } from "./seo";
import "./globals.css";

function siteUrl(): URL {
  const host =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (!host) return new URL("http://localhost:3000");
  return new URL(/^https?:\/\//.test(host) ? host : `https://${host}`);
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  ...shareMetadata("/api/og"),
};

// 입력칸 글자를 16px 이상으로 둬서 iOS 확대를 막으므로 maximumScale로 확대를 막지 않는다 (접근성).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e1f1b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // 게임 캔버스가 이름표를 Galmuri11로 그리므로 첫 화면부터 미리 받아 둔다
  preload("/fonts/Galmuri11.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  preload("/fonts/Galmuri11-Bold.woff2", { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
