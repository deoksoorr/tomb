import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import SiteShell from "@/components/site/SiteShell";
import { cx } from "@/components/ui/cx";
import styles from "@/components/site/site.module.css";
import { absoluteUrl, jsonLd, SITE_TITLE } from "@/app/seo";
import { bigDate, firstSentence, paragraphs } from "@/lib/devNotes/format";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";
import { getDevNote, listDevNotes } from "@/lib/devNotes/notes";
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
  const p = all[i];
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
        <div className={styles.bigdate}>{bigDate(p.date)}</div>
        <h1 className={cx(styles.postTitle, styles.display)}>{p.title}</h1>
        {p.summary && <p className={styles.postSum}>{p.summary}</p>}
        <div className={styles.postInfo}>
          <span>At one time... 개발자 노트</span>
          <Link className={cx(styles.btn, styles.btnPrimary)} href="/" prefetch={false}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 게임 촛불 도트 */}
            <img className={cx(styles.candle, styles.px)} src="/devnotes/brand/candle.png" alt="" width={12} height={16} />
            게임 바로 시작
          </Link>
        </div>
        {p.hero && (
          <figure className={styles.postHero}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
            <img src={p.hero} alt="" width={1600} height={900} />
          </figure>
        )}
        {p.intro && <p className={styles.intro}>{p.intro}</p>}
        {p.callout && (
          <div className={styles.callout}>
            <b>먼저 알려 드릴 것</b>
            {p.callout}
          </div>
        )}
        {p.sections.map((s, k) => (
          <section key={k} className={styles.sec}>
            {s.img && (
              <figure>
                {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
                <img src={s.img} alt={s.heading || p.title} loading="lazy" width={1280} height={720} />
              </figure>
            )}
            {s.heading && <h2>{s.heading}</h2>}
            {paragraphs(s.text).map((t, j) => (
              <p key={j}>{t}</p>
            ))}
          </section>
        ))}
        {p.outro && <p className={styles.outro}>{p.outro}</p>}
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
