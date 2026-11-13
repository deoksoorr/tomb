"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { addChatLine, CHAT_LOG_MOBILE_LINES, chatLineOpacity, chatLineTone, liveChatLines, visibleChatLines, type ChatLine } from "@/game/logic/chatLog";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import ChatInput from "./ChatInput";
import styles from "./ChatLog.module.css";

// 채팅 기록창: 같은 채널(방)에서 오간 자유 채팅을 1분 동안 보여 준다 (말풍선과 함께). 화면 메모리에만 두고 저장하지 않는다.
//  - 데스크톱: 왼쪽 아래 바로 가기 줄 바로 위 반투명 상자. 상자 안에서 스크롤(하단 고정), 아래에 입력칸 (Enter 포커스 → Enter 전송 → Esc·빈 Enter 해제)
//  - 모바일: 상자 없이 글씨만 최근 몇 줄, 터치는 통과. 입력은 기존 [채팅] 버튼

/** 데스크톱 채팅창 입력칸 id (GameShell의 Enter가 찾아 포커스한다) */
const INPUT_ID = "chat-log-input";
/** 흐려짐·만료를 다시 그리는 간격 */
const TICK_MS = 1000;

let lines: ChatLine[] = [];
let seq = 0;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const store = {
  push(name: string, text: string, mine: boolean) {
    lines = addChatLine(lines, { id: ++seq, name, text, mine, at: Date.now() });
    notify();
  },
  clear() {
    if (!lines.length) return;
    lines = [];
    notify();
  },
  /** 지난 줄 정리 (바뀐 게 있을 때만 알린다) */
  prune(now: number) {
    const live = liveChatLines(lines, now);
    if (live.length === lines.length) return;
    lines = live;
    notify();
  },
  subscribe(f: () => void) {
    subs.add(f);
    return () => void subs.delete(f);
  },
  get: () => lines,
};
const EMPTY: ChatLine[] = [];

/** 데스크톱 Enter: 채팅창 입력칸에 포커스. 입력칸이 없으면 false */
export function focusChatLog(): boolean {
  const el = document.getElementById(INPUT_ID);
  if (!(el instanceof HTMLInputElement)) return false;
  el.focus({ preventScroll: true });
  return true;
}

type Props = {
  mobile: boolean;
  /** 채널·방이 바뀌면 비운다 (예: "world:3", "house:3") */
  room: string;
  /** 지금 채팅을 쓸 수 없는 장면(상점·사냥 등)이면 숨긴다 (받은 줄은 계속 모은다) */
  hidden?: boolean;
};

export default function ChatLog({ mobile, room, hidden = false }: Props) {
  const all = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  const [now, setNow] = useState(() => Date.now());

  useBridgeEvent("chat:line", ({ name, text, mine }) => store.push(name, text, mine));
  // 채널 이동·집 드나들기: 다른 공간의 글은 비운다
  useEffect(() => store.clear(), [room]);
  // 줄이 있는 동안만 1초마다 흐려짐·만료 갱신
  const any = all.length > 0;
  useEffect(() => {
    if (!any) return;
    const t = setInterval(() => {
      const n = Date.now();
      store.prune(n);
      setNow(n);
    }, TICK_MS);
    return () => clearInterval(t);
  }, [any]);

  if (hidden) return null;
  // 막 추가된 줄은 렌더 시각이 받은 시각보다 앞설 수 있다 → 둘 중 늦은 쪽으로 (1초 안 흐려짐 없음)
  const at = Math.max(now, all.at(-1)?.at ?? 0);
  return mobile ? <MobileLines lines={visibleChatLines(all, at, CHAT_LOG_MOBILE_LINES)} now={at} /> : <DesktopBox lines={visibleChatLines(all, at)} now={at} />;
}

function Line({ line, now }: { line: ChatLine; now: number }) {
  return (
    <li className={cx(styles.line, styles[chatLineTone(line)])} style={{ opacity: chatLineOpacity(line, now) }}>
      <b className={styles.name}>{line.name}</b>
      <span className={styles.sep}>: </span>
      <span className={styles.text}>{line.text}</span>
    </li>
  );
}

/** 모바일: 게임 화면 위에 글씨만 (그림자 외곽선), 터치 통과 */
function MobileLines({ lines: shown, now }: { lines: ChatLine[]; now: number }) {
  if (!shown.length) return null;
  return (
    <ol className={styles.mobile} aria-label="채팅" aria-live="polite">
      {shown.map((l) => (
        <Line key={l.id} line={l} now={now} />
      ))}
    </ol>
  );
}

/** 데스크톱: 반투명 상자 + 스크롤 기록(하단 고정) + 입력칸 */
function DesktopBox({ lines: shown, now }: { lines: ChatLine[]; now: number }) {
  const logRef = useRef<HTMLOListElement>(null);
  /** 사용자가 맨 아래를 보고 있는지 (위로 올려 읽는 중이면 끌어내리지 않는다) */
  const stick = useRef(true);
  const [unread, setUnread] = useState(false);
  const lastId = shown.at(-1)?.id ?? 0;
  const prevLast = useRef(lastId);

  // 새 줄: 맨 아래를 보고 있으면 따라 내려가고, 위를 읽는 중이면 [새 메시지 ↓]만 띄운다
  useLayoutEffect(() => {
    const el = logRef.current;
    const added = lastId !== prevLast.current;
    prevLast.current = lastId;
    // 줄이 다 사라졌거나 스크롤할 만큼 없으면 다시 하단 고정
    if (!el || el.scrollHeight <= el.clientHeight) {
      stick.current = true;
      setUnread(false);
      return;
    }
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (added) setUnread(true);
  }, [lastId, shown.length]);

  const toBottom = () => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
    stick.current = true;
    setUnread(false);
  };

  return (
    <section className={styles.box} aria-label="채팅">
      {shown.length > 0 && (
        <div className={styles.logWrap}>
          <ol
            ref={logRef}
            className={styles.log}
            aria-live="polite"
            onScroll={(e) => {
              const el = e.currentTarget;
              stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 4;
              if (stick.current) setUnread(false);
            }}
          >
            {shown.map((l) => (
              <Line key={l.id} line={l} now={now} />
            ))}
          </ol>
          {unread && (
            <button type="button" className={styles.newMsg} onClick={toBottom}>
              새 메시지 ↓
            </button>
          )}
        </div>
      )}
      <ChatInput id={INPUT_ID} className={styles.input} placeholder="Enter로 채팅" onCancel={() => document.getElementById(INPUT_ID)?.blur()} />
    </section>
  );
}
