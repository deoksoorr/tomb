"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { cx } from "../ui/cx";
import { Logo } from "./Logo";
import styles from "./site.module.css";

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
            <button className={styles.mode} type="button" onClick={toggleTheme}>
              {themeLabel}
            </button>
            <Link className={cx(styles.btn, styles.btnPrimary)} href="/" prefetch={false}>
              {/* eslint-disable-next-line @next/next/no-img-element -- 게임 촛불 도트 */}
              <img className={cx(styles.candle, styles.px)} src="/devnotes/brand/candle.png" alt="" width={12} height={16} />
              게임 시작
            </Link>
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
        <button type="button" onClick={toggleTheme}>
          {themeLabel}
        </button>
      </nav>
    </>
  );
}
