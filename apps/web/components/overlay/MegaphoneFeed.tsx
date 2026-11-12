"use client";

import { useEffect, useRef } from "react";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { megaphoneStore, openMegaphone, useMegaphone } from "@/lib/hooks/useMegaphone";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./MegaphoneFeed.module.css";

/** 기록을 다시 받는 간격 (관리자 숨김 반영·놓친 방송 보충) */
const RELOAD_MS = 2 * 60_000;

/**
 * 23번 확성기 창 (화면 왼쪽 위). 새 한마디는 몇 초간 크게 뜨고, 최근 20개는 펼쳐 볼 수 있다(접기 가능).
 * floating = 터치 화면: 위쪽 바 아래에 따로 띄운다
 */
export default function MegaphoneFeed({ channel, floating = false }: { channel: number; floating?: boolean }) {
  const { entries, flash, collapsed } = useMegaphone();
  const logRef = useRef<HTMLOListElement>(null);

  useBridgeEvent("megaphone:heard", (m) => megaphoneStore.push(m));
  useEffect(() => {
    void megaphoneStore.load(channel);
    const t = setInterval(() => void megaphoneStore.load(channel), RELOAD_MS);
    return () => clearInterval(t);
  }, [channel]);
  // 펼쳐 둔 기록은 새 줄이 오면 맨 아래로
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries, collapsed]);

  const toggle = () => {
    megaphoneStore.setCollapsed(!collapsed);
    if (collapsed) void megaphoneStore.load(channel);
  };

  return (
    <section className={cx(styles.feed, floating && styles.floating)} aria-label="확성기">
      <div className={styles.bar}>
        <button type="button" className={cx(ui.button, styles.toggle)} onClick={toggle} aria-expanded={!collapsed}>
          <PixelIcon name="megaphone" />
          확성기
          <span className={styles.caret} aria-hidden="true">
            {collapsed ? "▸" : "▾"}
          </span>
          <span className="visually-hidden">{collapsed ? " 기록 펼치기" : " 기록 접기"}</span>
        </button>
        <button type="button" className={cx(ui.button, styles.shout)} onClick={openMegaphone}>
          외치기
        </button>
      </div>
      {!collapsed && (
        <ol ref={logRef} className={styles.log} aria-label="최근 확성기 20개">
          {entries.length === 0 && <li className={styles.empty}>아직 아무도 외치지 않았어요.</li>}
          {entries.map((e) => (
            <li key={e.id} className={cx(styles.line, flash?.id === e.id && styles.newLine)}>
              {e.scope === "all" && <span className={styles.all}>전체</span>}
              <b className={styles.name}>{e.name}</b>
              <span className={styles.text}>{e.text}</span>
            </li>
          ))}
        </ol>
      )}
      {flash && (
        <p key={flash.id} className={cx(styles.flash, flash.scope === "all" && styles.flashAll)} role="status">
          <PixelIcon name="megaphone" />
          <b className={styles.name}>{flash.name}</b>
          <span className={styles.text}>{flash.text}</span>
        </p>
      )}
    </section>
  );
}
