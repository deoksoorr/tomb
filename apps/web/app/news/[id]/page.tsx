import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NoteArticle from "@/components/site/NoteArticle";
import SiteShell from "@/components/site/SiteShell";
import styles from "@/components/site/site.module.css";
import { absoluteUrl, jsonLd, SITE_TITLE } from "@/app/seo";
import { firstSentence } from "@/lib/devNotes/format";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";
import { getDevNote, listDevNotes, withDevNoteBody } from "@/lib/devNotes/notes";
import { STATIC_NOTES } from "@/lib/devNotes/posts";


// 게임에서 새로 쓴 공지도 이 주소로 열린다 (정적 목록에 없는 id는 요청 때 공지 저장소에서 찾는다)
export const revalidate = 60;
export const viewport = SITE_VIEWPORT;

export function generateStaticParams() {
  return STATIC_NOTES.map((n) => ({ id: n.id }));
}

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const note = await getDevNote((await params).id);
  if (!note) return { title: `개발자 노트 | ${SITE_TITLE}` };
  return siteMetadata({ title: note.title, description: (note.summary ? `${note.summary}. ` : "") + firstSentence(note.intro), path: `/news/${note.id}`, image: note.hero });
}

export default async function NewsPostPage({ params }: Params) {
  const { id } = await params;
  const all = await listDevNotes();
  const i = all.findIndex((n) => n.id === id);
  if (i < 0) notFound();
  // 편집기로 쓴 글은 꼭지·맺음말을 따로 읽는다 (목록에는 싣지 않는 무거운 쪽)
  const p = await withDevNoteBody(all[i]);
  const newer = all[i - 1];
  const older = all[i + 1];
  const ld = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    datePublished: new Date(p.createdAt).toISOString(),
    inLanguage: "ko",
    url: absoluteUrl(`/news/${p.id}`),
    ...(p.hero ? { image: absoluteUrl(p.hero) } : {}),
    publisher: { "@type": "Organization", name: SITE_TITLE },
  };
  const near = (q: typeof p | undefined, label: string) =>
    q ? (
      <Link href={`/news/${q.id}`}>
        <span>{label}</span>
        <b>{q.title}</b>
        <em>{q.date.split("-").join(". ")}</em>
      </Link>
    ) : (
      <div className={styles.none}>
        <span>{label}</span>
        <b>{label}이 없어요</b>
        <em />
      </div>
    );

  return (
    <SiteShell current="news">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(ld) }} />
      <article className={styles.post}>
        <div className={styles.crumb}>
          <Link href="/news">개발자 노트</Link>
        </div>
        <NoteArticle note={p} letterExtras={!!p.fromStore} />
        <div className={styles.postFoot}>
          <nav className={styles.near} aria-label="다음 글과 이전 글">
            {near(newer, "다음 글")}
            {near(older, "이전 글")}
          </nav>
          <div className={styles.tolist}>
            <Link className={styles.btn} href="/news">
              목록으로
            </Link>
          </div>
        </div>
      </article>
    </SiteShell>
  );
}
