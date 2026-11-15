"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { chatAtBottom, chatLineOpacity, chatLineTone, chatScrollAction, type ChatLine } from "@/game/logic/chatLog";
import { cx } from "../ui/cx";
import StyledName from "../ui/StyledName";
import styles from "./ChatLog.module.css";

// 채팅 기록 한 줄 + 스크롤 기록 (데스크톱 상자 · 폰 [기록] 창 · 폰 채팅 입력 줄이 같이 쓴다)
// 맨 아래에 붙어 새 줄을 따라가고, 위로 올려 읽는 중에 새 글이 오면 끌어내리지 않고 [새 메시지 ↓]만 띄운다.

/** now가 있으면 마지막 몇 초 동안 흐려진다 (없으면 또렷하게 — 기록 창) */
export function ChatLineItem({ line, now }: { line: ChatLine; now?: number }) {
  return (
    <li className={cx(styles.line, styles[chatLineTone(line)])} style={now === undefined ? undefined : { opacity: chatLineOpacity(line, now) }}>
      <b className={cx(styles.name, line.staff && styles.staff)}>
        {/* 운영자 이름은 금색 그대로 (닉네임 꾸미기를 입혀 헷갈리지 않게) + 11/15 "운영자" 딱지 (이름은 닉네임 그대로라) */}
        {line.staff && <span className={styles.staffTag}>운영자</span>}
        {line.staff ? line.name : <StyledName name={line.name} look={line.ns} />}
      </b>
      <span className={styles.sep}>: </span>
      <span className={styles.text}>{line.text}</span>
    </li>
  );
}

type Props = {
  lines: ChatLine[];
  /** 흐려짐 기준 시각 (없으면 흐려지지 않는다) */
  now?: number;
  /** 스크롤 칸에 더할 클래스 (높이 등) */
  className?: string;
  /** 새 줄을 읽어 주기 (같은 줄이 다른 곳에서 이미 읽히면 끈다) */
  live?: boolean;
};

export default function ChatScroll({ lines: shown, now, className, live = true }: Props) {
  const logRef = useRef<HTMLOListElement>(null);
  /** 사용자가 맨 아래를 보고 있는지 (위로 올려 읽는 중이면 끌어내리지 않는다) */
  const stick = useRef(true);
  const [unread, setUnread] = useState(false);
  const lastId = shown.at(-1)?.id ?? 0;
  const prevLast = useRef(lastId);

  useLayoutEffect(() => {
    const el = logRef.current;
    const added = lastId !== prevLast.current;
    prevLast.current = lastId;
    const act = chatScrollAction({ overflow: !!el && el.scrollHeight > el.clientHeight, stick: stick.current, added });
    if (act === "reset") {
      stick.current = true;
      setUnread(false);
    } else if (act === "follow" && el) el.scrollTop = el.scrollHeight;
    else if (act === "unread") setUnread(true);
  }, [lastId, shown.length]);

  const toBottom = () => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setUnread(false);
  };

  return (
    <div className={styles.logWrap}>
      <ol
        ref={logRef}
        className={cx(styles.log, className)}
        aria-live={live ? "polite" : undefined}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = chatAtBottom(el.scrollHeight, el.scrollTop, el.clientHeight);
          if (stick.current) setUnread(false);
        }}
      >
        {shown.map((l) => (
          <ChatLineItem key={l.id} line={l} now={now} />
        ))}
      </ol>
      {unread && (
        <button type="button" className={styles.newMsg} onClick={toBottom}>
          새 메시지 ↓
        </button>
      )}
    </div>
  );
}
