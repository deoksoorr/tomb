"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./site.module.css";

type Item = { cat: string; q: string; a: string };

/** 찾은 글자를 표시 (대소문자 무시) */
function mark(text: string, q: string): ReactNode {
  if (!q) return text;
  const low = text.toLowerCase();
  const key = q.toLowerCase();
  const out: ReactNode[] = [];
  let at = 0;
  for (let i = low.indexOf(key); i >= 0; i = low.indexOf(key, at)) {
    if (i > at) out.push(text.slice(at, i));
    out.push(<mark key={i}>{text.slice(i, i + key.length)}</mark>);
    at = i + key.length;
  }
  out.push(text.slice(at));
  return out;
}

/**
 * 자주 묻는 질문: 분류 탭 + 찾기 + 펼치는 답.
 * 검색어·분류는 이 화면 안 상태로만 둔다 (주소·저장소에 남기지 않는다). 다른 화면에 갔다가 돌아오면(뒤로 가기·bfcache 포함) 빈 칸에서 다시 시작한다
 */
export default function FaqBrowser({ cats, items }: { cats: readonly string[]; items: readonly Item[] }) {
  const [cat, setCat] = useState("전체");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const base = useId();

  useEffect(() => {
    // 다른 화면에 갔다 오면 이 화면은 새로 그려져 빈 칸에서 시작한다. 브라우저가 페이지째 되살린 경우(bfcache)만 여기서 비운다
    const onShow = (e: PageTransitionEvent) => {
      if (!e.persisted) return;
      setCat("전체");
      setQuery("");
      setOpen(new Set());
    };
    window.addEventListener("pageshow", onShow);
    return () => window.removeEventListener("pageshow", onShow);
  }, []);

  const q = query.trim();
  const low = q.toLowerCase();
  const shown = items.map((it, i) => ({ it, i })).filter(({ it }) => (cat === "전체" || it.cat === cat) && (!low || `${it.q} ${it.a}`.toLowerCase().includes(low)));
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (!next.delete(i)) next.add(i);
      return next;
    });

  return (
    <>
      <div className={styles.search}>
        <label className={styles.sr} htmlFor={`${base}-q`}>
          질문 찾기
        </label>
        <input id={`${base}-q`} type="search" placeholder="예) 포인트, 코드, 낚시" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
        <span aria-hidden="true">찾기</span>
      </div>
      <div className={styles.tabs} role="tablist" aria-label="분류">
        {["전체", ...cats].map((c) => (
          <button key={c} type="button" role="tab" aria-selected={c === cat} onClick={() => setCat(c)}>
            {c}
          </button>
        ))}
      </div>
      <p className={styles.count} aria-live="polite">
        {q ? `「${q}」 ` : ""}
        {shown.length}개
      </p>
      <div className={styles.acc}>
        {shown.map(({ it, i }) => {
          const expanded = open.has(i);
          return (
            <div key={i} className={styles.accItem}>
              <button className={styles.accQ} type="button" aria-expanded={expanded} aria-controls={`${base}-a${i}`} id={`${base}-q${i}`} onClick={() => toggle(i)}>
                <span className={styles.q}>Q.</span>
                <span className={styles.txt}>
                  <span className={styles.cat}>{it.cat}</span>
                  {mark(it.q, q)}
                </span>
                <span className={styles.pm} aria-hidden="true">
                  {expanded ? "−" : "+"}
                </span>
              </button>
              <div className={cx(styles.accA, expanded && styles.open)} id={`${base}-a${i}`} role="region" aria-labelledby={`${base}-q${i}`}>
                {mark(it.a, q)}
              </div>
            </div>
          );
        })}
        {!shown.length && (
          <div className={styles.empty}>
            <span className={styles.ghost} aria-hidden="true" />
            맞는 질문을 찾지 못했어요. 다른 낱말로 찾아봐 주세요.
          </div>
        )}
      </div>
    </>
  );
}
