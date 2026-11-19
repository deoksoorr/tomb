import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import SiteShell from "@/components/site/SiteShell";
import { cx } from "@/components/ui/cx";
import styles from "@/components/site/site.module.css";
import { GUIDE_PAGES } from "@/app/seo";
import { GUIDE_PARTS } from "@/lib/devNotes/guide";
import { siteMetadata, SITE_VIEWPORT } from "@/lib/devNotes/meta";
import type { GuideBlock, GuidePart } from "@/lib/devNotes/types";

// 게임 가이드: 파트 8개를 왼쪽 메뉴로 고르고(?part=), 파트 안 꼭지는 같은 화면 안에서 이동한다.
// /guide 아래 검색용 안내 페이지(work-music 등)는 따로 두고 맨 아래에서 이어 준다.
export const viewport = SITE_VIEWPORT;

type Search = { searchParams: Promise<{ part?: string }> };
const partOf = (id: string | undefined): GuidePart => GUIDE_PARTS.find((g) => g.id === id) ?? GUIDE_PARTS[0];
const href = (g: GuidePart) => (g === GUIDE_PARTS[0] ? "/guide" : `/guide?part=${g.id}`);
const nn = (i: number) => String(i + 1).padStart(2, "0");

export async function generateMetadata({ searchParams }: Search): Promise<Metadata> {
  const part = partOf((await searchParams).part);
  const first = part === GUIDE_PARTS[0];
  return siteMetadata({
    title: first ? "게임 가이드" : `${part.title} | 게임 가이드`,
    description: `At one time... 게임 가이드. ${part.desc}`,
    path: href(part),
    image: part.images[0]?.[0],
  });
}

function Block({ b }: { b: GuideBlock }): ReactNode {
  if ("p" in b) return b.p.map((t, i) => <p key={i}>{t}</p>);
  if ("list" in b)
    return (
      <ul>
        {b.list.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    );
  return (
    <table className={styles.dt}>
      <thead>
        <tr>
          {b.table.head.map((h) => (
            <th key={h} scope="col">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {b.table.rows.map(([f, ...r], i) => (
          <tr key={i}>
            <th scope="row">{f}</th>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default async function GuideIndexPage({ searchParams }: Search) {
  const part = partOf((await searchParams).part);
  const i = GUIDE_PARTS.indexOf(part);
  const prev = GUIDE_PARTS[i - 1];
  const next = GUIDE_PARTS[i + 1];
  const sid = (k: number) => `${part.id}-${k}`;
  const landing = GUIDE_PAGES.filter((p) => p.path.startsWith("/guide/"));
  return (
    <SiteShell current="guide">
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1 className={styles.display}>게임 가이드</h1>
          <p>마을에서 헷갈리기 쉬운 것들을 모아 뒀어요.</p>
          <div className={styles.rule} />
        </header>
        <div className={styles.guide}>
          <nav className={styles.gnav} aria-label="가이드 파트">
            <ol>
              {GUIDE_PARTS.map((g, k) => (
                <li key={g.id}>
                  <Link className={styles.part} href={href(g)} aria-current={g === part ? "page" : undefined}>
                    <i>{nn(k)}</i>
                    {g.title}
                  </Link>
                  {g === part && (
                    <ul>
                      {g.sections.map((s, j) => (
                        <li key={j}>
                          <a href={`#${sid(j)}`}>{s.h}</a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </nav>
          <div className={styles.gbody}>
            <nav className={styles.gsel} aria-label="가이드 파트">
              {GUIDE_PARTS.map((g) => (
                <Link key={g.id} href={href(g)} aria-current={g === part ? "page" : undefined}>
                  {g.title}
                </Link>
              ))}
            </nav>
            <div className={styles.no}>
              {nn(i)} / {nn(GUIDE_PARTS.length - 1)}
            </div>
            <h2 className={cx(styles.ptitle, styles.display)}>{part.title}</h2>
            <p className={styles.lead}>{part.desc}</p>
            <div className={cx(styles.gshots, part.images.length === 1 && styles.one)}>
              {part.images.map(([src, cap]) => (
                <figure key={src}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
                  <img src={src} alt={cap} loading="lazy" width={1280} height={720} />
                  <figcaption>{cap}</figcaption>
                </figure>
              ))}
            </div>
            {part.sections.map((s, k) => (
              <section key={k} className={styles.gsec} id={sid(k)}>
                <h2>{s.h}</h2>
                {s.blocks.map((b, j) => (
                  <Block key={j} b={b} />
                ))}
              </section>
            ))}
            <nav className={styles.gpager} aria-label="이전 파트와 다음 파트">
              {prev ? (
                <Link href={href(prev)}>
                  <span>← 이전</span>
                  <b>{prev.title}</b>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link className={styles.next} href={href(next)}>
                  <span>다음 →</span>
                  <b>{next.title}</b>
                </Link>
              )}
            </nav>
            <section className={styles.gsec}>
              <h2>이런 글도 있어요</h2>
              <ul>
                {landing.map((p) => (
                  <li key={p.path}>
                    <Link href={p.path}>{p.h1}</Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
