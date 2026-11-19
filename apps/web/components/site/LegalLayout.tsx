import Link from "next/link";
import type { ReactNode } from "react";
import SiteShell from "./SiteShell";
import LegalToc from "./LegalToc";
import styles from "./site.module.css";

/** 이용약관·개인정보처리방침 틀. 본문(children)은 원래 문서 그대로 넣는다 — 문구는 여기서 바꾸지 않는다 */
export default function LegalLayout({ kind, title, effective, children }: { kind: "terms" | "privacy"; title: string; effective: ReactNode; children: ReactNode }) {
  const docId = `${kind}-doc`;
  return (
    <SiteShell current={null}>
      <div className={styles.wrap}>
        <header className={styles.head}>
          <h1 className={styles.display}>{title}</h1>
          <nav className={styles.ltabs} aria-label="문서">
            <Link href="/terms" aria-current={kind === "terms" ? "page" : undefined}>
              이용약관
            </Link>
            <Link href="/privacy" aria-current={kind === "privacy" ? "page" : undefined}>
              개인정보처리방침
            </Link>
          </nav>
          <div className={styles.rule} />
        </header>
        <div className={styles.legal}>
          <LegalToc kind={kind} docId={docId} />
          <div>
            <div className={styles.doc} id={docId}>
              <p className={styles.eff}>{effective}</p>
              {children}
            </div>
          </div>
        </div>
      </div>
    </SiteShell>
  );
}
