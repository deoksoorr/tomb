import type { MetadataRoute } from "next";
import { listDevNotes } from "@/lib/devNotes/notes";
import { absoluteUrl, FACTS_DATE, GUIDE_PAGES } from "./seo";

// 공개 페이지만 싣는다 (묘비 개별 주소는 넣지 않는다). 주소 기준은 metadataBase와 같은 siteUrl()
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const modified = new Date(FACTS_DATE);
  // 개발자 노트: 지난 공지를 다시 쓴 글 + 게임에서 새로 쓴 공지 (공지 저장소는 1분 캐시)
  const notes = await listDevNotes();
  const newest = notes[0] ? new Date(notes[0].createdAt) : modified;
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
    { url: absoluteUrl("/news"), lastModified: newest, changeFrequency: "daily", priority: 0.8 },
    ...notes.map((n) => ({ url: absoluteUrl(`/news/${n.id}`), lastModified: new Date(n.createdAt), changeFrequency: "monthly" as const, priority: 0.6 })),
    { url: absoluteUrl("/guide"), lastModified: modified, changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl("/story"), lastModified: modified, changeFrequency: "monthly", priority: 0.5 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
