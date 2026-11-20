import Link from "next/link";
import NewsFeature from "@/components/site/NewsFeature";
import SiteShell from "@/components/site/SiteShell";
import styles from "@/components/site/site.module.css";
import { bigDate, dateParts, DEFAULT_HERO, isFresh, noteExcerpt } from "@/lib/devNotes/format";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";
import { listDevNotes } from "@/lib/devNotes/notes";
import type { DevNote } from "@/lib/devNotes/types";

export const viewport = SITE_VIEWPORT;
export const metadata = siteMetadata({
  title: "개발자 노트",
  description: "At one time...을 혼자 만들고 있는 개발자의 노트예요. 업데이트 소식과 고친 점, 접속 장애가 있었던 날의 안내를 날짜순으로 적어 둬요.",
  path: "/news",
  image: "/devnotes/hero-1119.webp",
});

const PER = 10;

export default async function NewsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const all = await listDevNotes();
  const pinned = all.filter((n) => n.pinned);
  const notes = all.filter((n) => !n.pinned);
  const pages = Math.max(1, Math.ceil(notes.length / PER));
  const raw = Number((await searchParams).page);
  const page = Number.isInteger(raw) && raw >= 1 && raw <= pages ? raw : 1;
  const rows = notes.slice((page - 1) * PER, page * PER);
  const newest = notes[0]?.createdAt ?? 0;
  const feats = notes.slice(0, 4).map((n) => ({ id: n.id, title: n.title, dateText: bigDate(n.date), hero: n.hero ?? DEFAULT_HERO, intro: n.intro }));

  const row = (n: DevNote, pin: boolean) => {
    // 11/20 고정 글은 날짜·그림 없이 「공지」 딱지와 제목 한 줄만 가운데로
    if (pin)
      return (
        <Link key={n.id} className={styles.pinRow} href={`/news/${n.id}`}>
          <span className={styles.pinTag}>공지</span>
          <span className={styles.pinTitle}>{n.title}</span>
        </Link>
      );
    const [y, m, d] = dateParts(n.date);
    return (
      <Link key={n.id} className={styles.row} href={`/news/${n.id}`}>
        <div className={styles.d}>
          {m}.{d}
          <small>{y}</small>
        </div>
        <div>
          <h3>
            {n.title}
            {isFresh(n.createdAt, newest) && <span className={styles.n}>새 글</span>}
          </h3>
          <p>{noteExcerpt(n)}</p>
        </div>
        <div className={styles.th}>
          {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
          <img src={n.hero ?? DEFAULT_HERO} alt="" loading="lazy" width={1600} height={900} />
        </div>
      </Link>
    );
  };

  return (
    <SiteShell current="news">
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1 className={styles.display}>개발자 노트</h1>
          <p>마을에 생긴 일들을 적어 두는 곳이에요.</p>
        </header>
        <NewsFeature items={feats} />
        <div className={styles.listHead}>
          <h2 className={styles.display}>모든 글</h2>
          <span>{all.length}개</span>
        </div>
        <div className={styles.rows}>
          {page === 1 && pinned.map((n) => row(n, true))}
          {rows.map((n) => row(n, false))}
        </div>
        {pages > 1 && (
          <nav className={styles.pager} aria-label="쪽 넘기기">
            {page > 1 ? (
              <Link className={styles.sq} href={page === 2 ? "/news" : `/news?page=${page - 1}`} aria-label="이전 쪽">
                ←
              </Link>
            ) : (
              <span className={styles.sq} aria-hidden="true" style={{ opacity: 0.3 }}>
                ←
              </span>
            )}
            {Array.from({ length: pages }, (_, i) => (
              <Link key={i} className={styles.sq} href={i === 0 ? "/news" : `/news?page=${i + 1}`} aria-current={i + 1 === page ? "page" : undefined}>
                {i + 1}
              </Link>
            ))}
            {page < pages ? (
              <Link className={styles.sq} href={`/news?page=${page + 1}`} aria-label="다음 쪽">
                →
              </Link>
            ) : (
              <span className={styles.sq} aria-hidden="true" style={{ opacity: 0.3 }}>
                →
              </span>
            )}
          </nav>
        )}
      </div>
    </SiteShell>
  );
}
