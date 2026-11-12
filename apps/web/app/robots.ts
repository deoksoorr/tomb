import type { MetadataRoute } from "next";
import { absoluteUrl, IS_PRODUCTION } from "./seo";

// 운영 배포만 검색을 허용한다. 미리보기·테스트 서버는 전부 막아 운영 주소와 겹쳐 색인되지 않게 한다.
export default function robots(): MetadataRoute.Robots {
  if (!IS_PRODUCTION) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
