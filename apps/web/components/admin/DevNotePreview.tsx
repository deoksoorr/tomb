"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import NoteArticle from "@/components/site/NoteArticle";
import site from "@/components/site/site.module.css";
import type { DevNote } from "@/lib/devNotes/types";
import styles from "./DevNotes.module.css";

// 개발자 노트 미리보기: 실제 사이트 글 보기와 같은 부품(NoteArticle·site.module.css)을 iframe 안에 그린다.
// iframe이라 사이트 CSS의 화면 폭 규칙(@media)이 미리보기 폭(넓은 화면 1280 / 폰 390)을 따른다. 좁은 칸에는 비율대로 줄여 보인다.

export type PreviewDevice = "desktop" | "phone";
const WIDTH: Record<PreviewDevice, number> = { desktop: 1280, phone: 390 };
const BLANK = '<!doctype html><html lang="ko"><head><meta charset="utf-8"></head><body style="margin:0"></body></html>';

/** 이 문서의 스타일(Next가 넣은 CSS 파일·style 태그)을 iframe에 복사하고, 나중에 붙는 것도 따라 붙인다 */
function mirrorStyles(target: Document): () => void {
  const copy = (n: Node) => {
    if (n instanceof HTMLStyleElement || (n instanceof HTMLLinkElement && n.rel === "stylesheet")) target.head.appendChild(n.cloneNode(true));
  };
  document.head.querySelectorAll('style, link[rel="stylesheet"]').forEach(copy);
  const mo = new MutationObserver((list) => list.forEach((m) => m.addedNodes.forEach(copy)));
  mo.observe(document.head, { childList: true });
  return () => mo.disconnect();
}

export default function DevNotePreview({ note, device }: { note: DevNote; device: PreviewDevice }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [mount, setMount] = useState<HTMLElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // 칸 크기를 따라 축소 비율을 다시 잡는다
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const f = frame.current;
    if (!f) return;
    let stop = () => {};
    const ready = () => {
      const doc = f.contentDocument;
      if (!doc?.body) return;
      stop();
      stop = mirrorStyles(doc);
      setMount(doc.body);
    };
    f.addEventListener("load", ready);
    if (f.contentDocument?.readyState === "complete" && f.contentDocument.body?.childElementCount === 0) ready();
    return () => {
      f.removeEventListener("load", ready);
      stop();
    };
  }, []);

  const width = WIDTH[device];
  const scale = size.w ? Math.min(1, size.w / width) : 1;

  return (
    <div ref={box} className={styles.previewBox}>
      <iframe
        ref={frame}
        title="개발자 노트 미리보기"
        className={styles.previewFrame}
        srcDoc={BLANK}
        style={{ width, height: size.h ? size.h / scale : 600, transform: `scale(${scale})` }}
      />
      {mount &&
        createPortal(
          <div className={site.root} style={{ minHeight: 0 }}>
            <article className={site.post}>
              <div className={site.crumb}>
                <a href="#" onClick={(e) => e.preventDefault()}>
                  개발자 노트
                </a>
              </div>
              <NoteArticle note={note} letterExtras />
            </article>
          </div>,
          mount,
        )}
    </div>
  );
}
