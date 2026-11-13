"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { addChatLine, CHAT_LOG_MOBILE_LINES, chatLineOpacity, chatLineTone, liveChatLines, mergeChatLines, visibleChatLines, type ChatLine } from "@/game/logic/chatLog";
import { cx } from "../ui/cx";
import ChatInput from "./ChatInput";
import styles from "./ChatLog.module.css";

// 채팅 기록창: 같은 채널(방)에서 오간 자유 채팅을 5분 동안 보여 준다 (말풍선과 함께). 화면 메모리에만 두고 기기에 저장하지 않는다.
// 방에 들어올 때(입장·새로고침·재접속·실내에서 복귀) 서버가 그 방의 최근 5분(chat:log)을 보내 주면 서버 줄 id로 겹치지 않게 합친다.
//  - 데스크톱: 왼쪽 아래 바로 가기 줄 바로 위 반투명 상자. 상자 안에서 스크롤(하단 고정), 아래에 입력칸 (Enter 포커스 → Enter 전송 → Esc·빈 Enter 해제)
//  - 모바일: 상자 없이 글씨만 최근 몇 줄, 터치는 통과. 입력은 기존 [채팅] 버튼

/** 데스크톱 채팅창 입력칸 id (GameShell의 Enter가 찾아 포커스한다) */
const INPUT_ID = "chat-log-input";
/** 흐려짐·만료를 다시 그리는 간격 */
const TICK_MS = 1000;

let lines: ChatLine[] = [];
let seq = 0;
/** 지금 줄들이 속한 채널 번호 (모르면 null) */
let channelOf: string | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const store = {
  push(name: string, text: string, mine: boolean, key?: string, staff?: true) {
    if (key && lines.some((l) => l.key === key)) return; // chatLog로 이미 받은 줄
    lines = addChatLine(lines, { id: ++seq, name, text, mine, at: Date.now(), ...(key ? { key } : {}), ...(staff ? { staff } : {}) });
    notify();
  },
  /** 서버 최근 5분 합치기 */
  merge(incoming: Parameters<typeof mergeChatLines>[1]) {
    if (!incoming.length) return;
    lines = mergeChatLines(lines, incoming, Date.now(), () => ++seq);
    notify();
  },
  /** 채널이 바뀌면 비운다 (처음 알게 된 채널이면 그대로 둔다) */
  setChannel(ch: string) {
    if (channelOf !== null && channelOf !== ch && lines.length) {
      lines = [];
      notify();
    }
    channelOf = ch;
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

// 화면이 아직 안 떴어도(입장 직후 welcome·chatLog가 먼저 올 수 있다) 받은 줄을 모은다 — 모듈에서 한 번만 구독
if (typeof window !== "undefined") {
  bridge.on("chat:line", ({ name, text, mine, key, staff }) => store.push(name, text, mine, key, staff));
  bridge.on("chat:log", ({ lines: incoming, ch }) => {
    // 월드 채널 기록이면 그 채널로 맞춘 뒤 합친다 (화면의 채널 표시가 늦게 바뀌어도 새 채널 기록을 지우지 않게)
    if (ch !== undefined) store.setChannel(String(ch));
    store.merge(incoming);
  });
}

/** 데스크톱 Enter: 채팅창 입력칸에 포커스. 입력칸이 없으면 false */
export function focusChatLog(): boolean {
  const el = document.getElementById(INPUT_ID);
  if (!(el instanceof HTMLInputElement)) return false;
  el.focus({ preventScroll: true });
  return true;
}

type Props = {
  mobile: boolean;
  /** 지금 공간 (예: "world:3", "house:3"). 채널 번호가 바뀔 때만 비운다 */
  room: string;
  /** 지금 채팅을 쓸 수 없는 장면(상점·사냥 등)이면 숨긴다 (받은 줄은 계속 모은다) */
  hidden?: boolean;
};

export default function ChatLog({ mobile, room, hidden = false }: Props) {
  const all = useSyncExternalStore(store.subscribe, store.get, () => EMPTY);
  const [now, setNow] = useState(() => Date.now());

  // 채널을 옮길 때만 비운다 (같은 채널 안에서 집에 들어갔다 나와도 5분 안의 글은 남는다)
  const channel = room.split(":")[1] ?? room;
  useEffect(() => store.setChannel(channel), [channel]);
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
      <b className={cx(styles.name, line.staff && styles.staff)}>{line.name}</b>
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
