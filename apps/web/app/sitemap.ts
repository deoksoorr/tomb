import type { MetadataRoute } from "next";
import { absoluteUrl, FACTS_DATE, GUIDE_PAGES } from "./seo";

// 공개 페이지만 싣는다 (묘비 개별 주소는 넣지 않는다). 주소 기준은 metadataBase와 같은 siteUrl()
export default function sitemap(): MetadataRoute.Sitemap {
  const modified = new Date(FACTS_DATE);
  return [
    {
      url: absoluteUrl("/"),
      lastModified: modified,
      changeFrequency: "daily",
      priority: 1,
    },
    ...GUIDE_PAGES.map((p) => ({
      url: absoluteUrl(p.path),
      lastModified: modified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
