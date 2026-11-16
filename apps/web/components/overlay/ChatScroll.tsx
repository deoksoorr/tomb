"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { mapOf, type MapId } from "@tomb/protocol";
import { chatAtBottom, chatLineAgo, chatLineDim, chatLineTone, chatPlaceTag, chatScrollAction, type ChatLine } from "@/game/logic/chatLog";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import StyledName from "../ui/StyledName";
import styles from "./ChatLog.module.css";

// 채팅 기록 한 줄 + 스크롤 기록 (데스크톱 상자 · 폰 [기록] 창 · 폰 채팅 입력 줄이 같이 쓴다)
// 맨 아래에 붙어 새 줄을 따라가고, 위로 올려 읽는 중에 새 글이 오면 끌어내리지 않고 [새 메시지 ↓]만 띄운다.
// 5분 지난 줄(입장 때 받은 지난 대화 등)은 흐리게 + "N분 전".

/** 기록창이 스스로 시각을 다시 보는 간격 (지난 줄 흐림·"N분 전" — now를 받지 않을 때) */
const SELF_TICK_MS = 15_000;

/**
 * 한 줄. opacity = 불투명도(폰 화면 글씨의 흐려짐·기록창의 지난 줄), ago = 지난 줄 옆 작은 시각, here = 지금 내가 있는 맵 (맵이 아닌 곳이면 null).
 * 11/16 memo: 새 줄이 올 때 이미 있던 줄은 다시 그리지 않는다 (사람이 많은 채널에서 채팅이 잦으면 줄 전체 재렌더가 무거웠다).
 * 그래서 줄마다 브리지를 구독하지 않고, 지금 맵(here)은 부모(ChatScroll)가 한 번 구해 넘긴다
 */
export const ChatLineItem = memo(function ChatLineItem({ line, opacity, ago, here }: { line: ChatLine; opacity?: number; ago?: string | null; here: MapId | null }) {
  // 11/16 다른 맵에서 쓴 줄 앞에 [캠핑장]·[바닷가]·[마을] (집 안·사냥터처럼 맵이 아닌 곳에서는 붙이지 않는다)
  const place = line.w ? null : chatPlaceTag(line, here);
  const name = (
    <b className={cx(styles.name, line.staff && styles.staff)}>
      {/* 운영자 이름은 금색 그대로 (닉네임 꾸미기를 입혀 헷갈리지 않게) + 11/15 "운영자" 딱지 (이름은 닉네임 그대로라) */}
      {line.staff && <span className={styles.staffTag}>운영자</span>}
      {/* 11/16 매니저 딱지 (운영자가 아닐 때만 — 실시간 서버가 붙인 mgr 표시) */}
      {line.mgr && !line.staff && <span className={styles.mgrTag}>매니저</span>}
      {line.staff ? line.name : <StyledName name={line.name} look={line.ns} />}
    </b>
  );
  // 11/16 귓속말: "[귓속말] 나 → 진순: …" / "[귓속말] 진순 → 나: …" (name = 상대). 못 보냄·쓰는 법 안내는 글만
  const me = <b className={styles.name}>나</b>;
  const arrow = <span className={styles.sep}> → </span>;
  return (
    <li className={cx(styles.line, styles[chatLineTone(line)])} style={opacity === undefined ? undefined : { opacity }}>
      {place && <span className={styles.place}>{place} </span>}
      {line.w && <span className={styles.whisperTag}>[귓속말] </span>}
      {line.w === "out" ? (
        <>
          {me}
          {arrow}
          {name}
        </>
      ) : line.w === "in" ? (
        <>
          {name}
          {arrow}
          {me}
        </>
      ) : line.w ? null : (
        name
      )}
      {line.w !== "fail" && line.w !== "note" && <span className={styles.sep}>: </span>}
      <span className={styles.text}>{line.text}</span>
      {ago && <span className={styles.ago}> · {ago}</span>}
    </li>
  );
});

type Props = {
  lines: ChatLine[];
  /** 지난 줄 판정 기준 시각 (없으면 스스로 SELF_TICK_MS마다 본다) */
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
  const [selfNow, setSelfNow] = useState(() => Date.now());
  useEffect(() => {
    if (now !== undefined) return;
    const t = setInterval(() => setSelfNow(Date.now()), SELF_TICK_MS);
    return () => clearInterval(t);
  }, [now]);
  // 다른 맵에서 쓴 줄 표시([캠핑장]·[바닷가]·[마을])의 기준 = 지금 내가 있는 맵 (줄마다 구독하지 않고 여기서 한 번)
  const status = useBridgeValue("net:status");
  const scene = useBridgeValue("scene:changed")?.scene;
  const here = !scene || scene === "world" ? mapOf(status?.map) : null;
  // 막 받은 줄이 렌더 시각보다 늦을 수 있다 → 둘 중 늦은 쪽
  const at = now ?? Math.max(selfNow, shown.at(-1)?.at ?? 0);

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
          <ChatLineItem key={l.id} line={l} opacity={chatLineDim(l, at)} ago={chatLineAgo(l, at)} here={here} />
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
