"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cx } from "../ui/cx";
import GameStartLink from "./GameStartLink";
import { Logo } from "./Logo";
import styles from "./site.module.css";

/* eslint-disable-next-line @next/next/no-img-element -- 게임 촛불 도트 */
const CANDLE = <img className={cx(styles.candle, styles.px)} src="/devnotes/brand/candle.png" alt="" width={12} height={16} />;

/** 도트 달 (8×8 칸, 2배) */
const MOON = (
  <svg viewBox="0 0 8 8" width="16" height="16" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M2 0h3v1H2zM1 1h2v1H1zM0 2h2v4H0zM7 5h1v1H7zM1 6h6v1H1zM2 7h4v1H2z" />
  </svg>
);
/** 도트 해 */
const SUN = (
  <svg viewBox="0 0 9 9" width="18" height="18" shapeRendering="crispEdges" aria-hidden="true">
    <path fill="currentColor" d="M4 0h1v1H4zM4 8h1v1H4zM0 4h1v1H0zM8 4h1v1H8zM1 1h1v1H1zM7 1h1v1H7zM1 7h1v1H1zM7 7h1v1H7zM3 2h3v1H3zM2 3h5v3H2zM3 6h3v1H3z" />
  </svg>
);

export type SiteNav = "news" | "guide" | "faq" | "story" | null;

const NAV: readonly { key: Exclude<SiteNav, null>; href: string; label: string }[] = [
  { key: "news", href: "/news", label: "개발자 노트" },
  { key: "guide", href: "/guide", label: "가이드" },
  { key: "faq", href: "/faq", label: "자주 묻는 질문" },
  { key: "story", href: "/story", label: "만든 이야기" },
];

const THEME_KEY = "site.theme";

const THEME_EVENT = "site-theme";

function subscribeTheme(fn: () => void): () => void {
  window.addEventListener(THEME_EVENT, fn);
  return () => window.removeEventListener(THEME_EVENT, fn);
}

function isDark(): boolean {
  const t = document.documentElement.dataset.siteTheme;
  // 11/20 처음엔 늘 밝게 (시스템 설정을 따르지 않는다). 단추로 어둡게를 고른 때만 어둡게
  return t === "dark";
}

export default function SiteHeader({ current }: { current: SiteNav }) {
  const [slim, setSlim] = useState(false);
  const [open, setOpen] = useState(false);
  const dark = useSyncExternalStore(subscribeTheme, isDark, () => null);

  useEffect(() => {
    const onScroll = () => setSlim(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const toggleTheme = () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.siteTheme = next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // 저장이 막혀 있어도 지금 화면에는 적용된다
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  };
  const themeLabel = dark ? "밝게 보기" : "어둡게 보기";
  // 11/20 글자 대신 도트 그림 (밝을 때 달 = 어둡게, 어두울 때 해 = 밝게)
  const themeIcon = dark ? SUN : MOON;

  return (
    <>
      <header className={cx(styles.hd, slim && styles.slim)}>
        <div className={styles.wrap}>
          <Link className={styles.brand} href="/news" aria-label="At one time... 개발자 노트 첫 화면">
            <Logo height={21} />
            <span className={styles.walker} aria-hidden="true" />
          </Link>
          <nav className={styles.nav} aria-label="주 메뉴">
            {NAV.map((n) => (
              <Link key={n.key} href={n.href} aria-current={current === n.key ? "page" : undefined}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className={styles.right}>
            <button className={styles.mode} type="button" onClick={toggleTheme} aria-label={themeLabel} title={themeLabel}>
              {themeIcon}
            </button>
            <GameStartLink className={cx(styles.btn, styles.btnPrimary)} backLabel={<>{CANDLE}게임으로 돌아가기</>}>
              {CANDLE}
              게임 시작
            </GameStartLink>
            <button className={cx(styles.btn, styles.menuBtn)} type="button" aria-expanded={open} aria-controls="site-mnav" onClick={() => setOpen((o) => !o)}>
              {open ? "닫기" : "메뉴"}
            </button>
          </div>
        </div>
      </header>
      <nav id="site-mnav" className={cx(styles.mnav, open && styles.open)} aria-label="모바일 메뉴">
        {NAV.map((n) => (
          <Link key={n.key} href={n.href} aria-current={current === n.key ? "page" : undefined} onClick={() => setOpen(false)}>
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
