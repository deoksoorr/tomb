import { Fragment } from "react";
import { paragraphs } from "@/lib/devNotes/format";
import type { DevNote } from "@/lib/devNotes/types";
import { cx } from "../ui/cx";
import styles from "./site.module.css";

// 개발자 노트 글 본문 (제목·날짜 줄부터 맺음말까지). 사이트 글 보기(/news/[id])와 관리자 편집기 미리보기가 같이 쓴다.
// 글은 글자 그대로 그린다: 빈 줄 = 문단, 줄바꿈 = <br> (HTML·마크다운 해석 없음).

/** 문단 안 줄바꿈 */
function Lines({ text }: { text: string }) {
  return text.split("\n").map((l, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {l}
    </Fragment>
  ));
}

/**
 * letterExtras: 고정 글(편지 모양)에도 꼭지 소제목·이미지를 그린다. 편집기로 쓴 글만 켠다
 * (지난 고정 글 「처음 오신 분께」는 글만 보이던 모양 그대로).
 */
export default function NoteArticle({ note: p, letterExtras = false }: { note: DevNote; letterExtras?: boolean }) {
  // 소제목 있는 꼭지만 번호를 매겨 목차로 (01, 02, ...)
  const toc = p.sections
    .flatMap((s, k) => (s.heading ? [{ k, heading: s.heading }] : []))
    .map((t, n) => ({ ...t, no: String(n + 1).padStart(2, "0"), anchor: `s${n + 1}` }));
  const tocOf = new Map(toc.map((t) => [t.k, t]));

  return (
    <>
      {/* 11/20 패치노트형: 제목·날짜 한 줄 → 한눈에 보기 → 왼쪽 목차 + 오른쪽 번호 붙은 꼭지 */}
      <header className={styles.pnHead}>
        <div>
          <h1 className={cx(styles.postTitle, styles.display)}>{p.title}</h1>
          {p.summary && <p className={styles.postSum}>{p.summary}</p>}
        </div>
        <div className={styles.pnMeta}>
          <time dateTime={p.date}>{p.date.split("-").join(". ")}</time>
        </div>
      </header>
      {p.pinned ? (
        <div className={styles.letter}>
          {p.hero && (
            <figure className={styles.letterFig}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
              <img src={p.hero} alt="" width={1600} height={900} />
            </figure>
          )}
          <div className={styles.letterBody}>
            {paragraphs(p.intro).map((t, j) => (
              <p key={`i${j}`}>
                <Lines text={t} />
              </p>
            ))}
            {p.sections.map((s, k) => (
              <Fragment key={k}>
                {/* 편집기로 쓴 고정 글: 꼭지 소제목·이미지도 편지 안에 그대로 */}
                {letterExtras && s.heading && <h2 className={styles.letterHead}>{s.heading}</h2>}
                {letterExtras && s.img && (
                  <figure className={styles.letterFig}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
                    <img src={s.img} alt={s.heading || p.title} loading="lazy" width={1280} height={720} />
                  </figure>
                )}
                {paragraphs(s.text).map((t, j) => (
                  <p key={j}>
                    <Lines text={t} />
                  </p>
                ))}
              </Fragment>
            ))}
            {p.outro && (
              <p className={styles.letterSign}>
                <Lines text={p.outro} />
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          {p.hero && (
            <figure className={styles.pnHero}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
              <img src={p.hero} alt="" width={1600} height={900} />
            </figure>
          )}
          {paragraphs(p.intro).map((t, j) => (
            <p key={j} className={styles.intro}>
              <Lines text={t} />
            </p>
          ))}
          {p.callout && (
            <div className={styles.callout}>
              <b>먼저 알려 드릴 것</b>
              {p.callout}
            </div>
          )}
          {toc.length > 0 && (
            <nav className={styles.pnBox} aria-label="이번 업데이트 주요 내용">
              <b>이번 업데이트 주요 내용</b>
              <ol>
                {toc.map((t) => (
                  <li key={t.anchor}>
                    <a href={`#${t.anchor}`}>{t.heading}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className={cx(styles.pnGrid, toc.length === 0 && styles.pnSolo)}>
            {toc.length > 0 && (
              <aside className={styles.pnToc} aria-label="목차">
                <span>목차</span>
                <ol>
                  {toc.map((t) => (
                    <li key={t.anchor}>
                      <a href={`#${t.anchor}`}>
                        <em>{t.no}</em>
                        {t.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </aside>
            )}
            <div className={styles.pnBody}>
              {p.sections.map((s, k) => {
                const t = tocOf.get(k);
                return (
                  <section key={k} id={t?.anchor} className={styles.pnSec}>
                    {t && (
                      <h2>
                        <em>{t.no}</em>
                        {s.heading}
                      </h2>
                    )}
                    {s.img && (
                      <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 */}
                        <img src={s.img} alt={s.heading || p.title} loading="lazy" width={1280} height={720} />
                      </figure>
                    )}
                    {paragraphs(s.text).map((x, j) => (
                      <p key={j}>
                        <Lines text={x} />
                      </p>
                    ))}
                  </section>
                );
              })}
              {p.outro && (
                <p className={styles.outro}>
                  <Lines text={p.outro} />
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
