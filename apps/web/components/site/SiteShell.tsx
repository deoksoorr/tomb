import type { ReactNode } from "react";
import Link from "next/link";
import { cx } from "../ui/cx";
import { Logo } from "./Logo";
import SiteHeader, { type SiteNav } from "./SiteHeader";
import styles from "./site.module.css";

export type { SiteNav };

// 개발자 노트 사이트 공용 틀: 헤더(메뉴·어둡게 보기·게임 시작) + 본문 + 유령이 걷는 띠 + 푸터.
// 화면은 처음엔 늘 밝게 (11/20 시스템 설정을 따르지 않는다), 단추로 고른 값은 localStorage(site.theme)에 둔다 — 그림이 깜빡이지 않게 첫 그림 전에 읽는다
const THEME_INIT = `try{var t=localStorage.getItem("site.theme");if(t==="dark"||t==="light")document.documentElement.dataset.siteTheme=t}catch(e){}`;

export default function SiteShell({ current, children }: { current: SiteNav; children: ReactNode }) {
  return (
    <div className={styles.root}>
      <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      <SiteHeader current={current} />
      <main className={styles.main}>{children}</main>
      <div className={styles.strip} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element -- 도트 그림은 원본 크기 그대로 */}
        <img className={cx(styles.g, styles.grave)} src="/devnotes/brand/grave.png" alt="" width={36} height={44} />
        <span className={cx(styles.g, styles.cdl)} />
        <span className={cx(styles.g, styles.gw)} />
      </div>
      <footer className={styles.ft}>
        <div className={styles.wrap}>
          <div>
            <div className={styles.brand}>
              <Logo height={16} />
            </div>
            <p>게임을 처음 만들어 보는 한 사람의 비영리 개인 프로젝트예요.</p>
            <p className={styles.copy}>ⓒ 2026 At one time...</p>
          </div>
          <div className={styles.ftLinks}>
            <Link href="/terms">이용약관</Link>
            <Link href="/privacy">개인정보처리방침</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
