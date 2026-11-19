"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cx } from "../ui/cx";
import styles from "./site.module.css";

export type FeatureItem = { id: string; title: string; dateText: string; hero: string; intro: string };

const AUTO_MS = 6000;

/** 최근 개발자 노트 몇 개를 큰 그림과 글로 나란히 돌려 보여 준다. 마우스·포커스·손가락이 닿으면 멈추고, 움직임 줄이기면 저절로 넘기지 않는다 */
export default function NewsFeature({ items }: { items: readonly FeatureItem[] }) {
  const [cur, setCur] = useState(0);
  const hold = useRef(false);
  const n = items.length;
  const show = (i: number) => setCur(((i % n) + n) % n);

  useEffect(() => {
    if (n < 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!hold.current && !document.hidden) setCur((c) => (c + 1) % n);
    }, AUTO_MS);
    return () => clearInterval(t);
  }, [n]);

  if (!n) return null;
  const pad = (i: number) => String(i).padStart(2, "0");
  return (
    <section
      className={styles.feature}
      aria-roledescription="carousel"
      aria-label="최근 개발자 노트"
      tabIndex={0}
      onMouseEnter={() => (hold.current = true)}
      onMouseLeave={() => (hold.current = false)}
      onFocus={() => (hold.current = true)}
      onBlur={() => (hold.current = false)}
      onTouchStart={() => (hold.current = true)}
      onTouchEnd={() => setTimeout(() => (hold.current = false), 4000)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") {
          show(cur - 1);
          e.preventDefault();
        } else if (e.key === "ArrowRight") {
          show(cur + 1);
          e.preventDefault();
        }
      }}
    >
      <div className={styles.pic}>
        {items.map((it, i) => (
          // eslint-disable-next-line @next/next/no-img-element -- 게임 화면 그대로 (도트가 뭉개지지 않게 원본)
          <img key={it.id} className={cx(i === cur && styles.on)} src={it.hero} alt="" width={1600} height={900} loading={i ? "lazy" : "eager"} />
        ))}
      </div>
      <div className={styles.txt}>
        {items.map((it, i) => (
          <div key={it.id} className={cx(styles.slideTxt, i === cur && styles.on)} role="group" aria-roledescription="slide" aria-label={`${i + 1} / ${n}`} hidden={i !== cur}>
            <div className={styles.kicker}>최근 개발자 노트</div>
            <div className={styles.bigdate}>{it.dateText}</div>
            <h2 className={styles.display}>{it.title}</h2>
            <p className={styles.ex}>{it.intro}</p>
            <Link className={cx(styles.textlink, styles.read)} href={`/news/${it.id}`}>
              읽기 →
            </Link>
          </div>
        ))}
        <div className={styles.ctl}>
          <button className={styles.sq} type="button" aria-label="이전 글" onClick={() => show(cur - 1)}>
            ←
          </button>
          <span className={styles.count} aria-live="polite">
            {pad(cur + 1)} / {pad(n)}
          </span>
          <button className={styles.sq} type="button" aria-label="다음 글" onClick={() => show(cur + 1)}>
            →
          </button>
          <div className={styles.pips} role="tablist" aria-label="글 고르기">
            {items.map((it, i) => (
              <button key={it.id} className={styles.pip} type="button" role="tab" aria-selected={i === cur} aria-label={it.title} onClick={() => show(i)} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
