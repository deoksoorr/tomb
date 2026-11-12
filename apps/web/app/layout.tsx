import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { preload } from "react-dom";
import VisitTracker from "@/components/VisitTracker";
import { IS_PRODUCTION, SITE_DESCRIPTION, SITE_TITLE, shareMetadata, siteUrl } from "./seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  ...shareMetadata("/api/og"),
  // 운영이 아닌 배포(미리보기·테스트 서버)는 검색에 올리지 않는다
  ...(IS_PRODUCTION ? {} : { robots: { index: false, follow: false } }),
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
      <body>
        {children}
        {/* 47번 방문 분석 (방문·체류 신호만, 화면에는 그리지 않는다) */}
        <VisitTracker />
        {/* 테스트 서버(staging 갈래 배포)에서만: 실제 서버와 헷갈리지 않게 왼쪽 위 작은 표시 */}
        {process.env.VERCEL_GIT_COMMIT_REF === "staging" && (
          <div
            style={{ position: "fixed", left: 0, top: 0, zIndex: 9999, padding: "2px 8px", background: "#c2453f", color: "#fff", font: "700 12px/1.4 system-ui, sans-serif", pointerEvents: "none" }}
          >
            테스트 서버
          </div>
        )}
      </body>
    </html>
  );
}
