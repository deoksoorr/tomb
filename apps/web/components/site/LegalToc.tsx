"use client";

import { useEffect, useState, type ReactNode } from "react";
import { cx } from "../ui/cx";
import styles from "./site.module.css";

type Entry = { id: string; text: string };

/** 조항 목차: 본문의 조항 제목(h2)에서 뽑는다 (문구를 따로 적지 않아 본문과 어긋나지 않는다). 데스크톱은 따라오는 목차, 폰은 위 접이식 */
export default function LegalToc({ kind, docId }: { kind: string; docId: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [on, setOn] = useState(0);

  useEffect(() => {
    const doc = document.getElementById(docId);
    if (!doc) return;
    const hs = [...doc.querySelectorAll("h2")];
    hs.forEach((h, i) => (h.id ||= `${kind}-${i}`));
    const spy = () => {
      let k = 0;
      hs.forEach((h, i) => {
        if (h.getBoundingClientRect().top < 140) k = i;
      });
      setOn(k);
    };
    // 본문 조항 제목을 읽어 목차를 채운다 (다음 그림에서 — 본문이 다 그려진 뒤)
    const raf = requestAnimationFrame(() => {
      setEntries(hs.map((h) => ({ id: h.id, text: h.textContent ?? "" })));
      spy();
    });
    window.addEventListener("scroll", spy, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", spy);
    };
  }, [kind, docId]);

  const list = (
    <ol>
      {entries.map((e, i) => (
        <li key={e.id}>
          <a href={`#${e.id}`} className={cx(i === on && styles.on)}>
            {e.text}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <>
      <nav className={styles.toc} aria-label="조항 목차">
        <p className={styles.tl}>목차</p>
        {list}
      </nav>
      <MobileToc>{list}</MobileToc>
    </>
  );
}

function MobileToc({ children }: { children: ReactNode }) {
  return (
    <details className={styles.tocM}>
      <summary>목차</summary>
      {children}
    </details>
  );
}
