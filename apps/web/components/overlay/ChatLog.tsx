"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useBackground } from "@/lib/hooks/useBackground";
import { CHAT_LOG_MOBILE_LINES, CHAT_LOG_TTL_MS, chatChannelOf, chatLineOpacity, recentChatLines, visibleChatLines, type ChatLine } from "@/game/logic/chatLog";
import PixelIcon from "../ui/PixelIcon";
import ChatInput from "./ChatInput";
import { chatStore, setChatShown, useChatLines } from "./chatLines";
import ChatScroll, { ChatLineItem } from "./ChatScroll";
import styles from "./ChatLog.module.css";

// 채팅 기록창: 같은 채널(방)에서 오간 자유 채팅 (말풍선과 함께). 화면 메모리에만 두고 기기에 저장하지 않는다 (chatLines).
// 방에 들어올 때(입장·새로고침·재접속·실내에서 복귀) 서버가 그 방의 최근 기록(chat:log — 하루 안, 서버가 잠들었다 깨도
// 맵별 최근 50줄)을 보내 주면 서버 줄 id로 겹치지 않게 합친다. 5분 지난 줄은 흐리게 + "N분 전".
//  - 데스크톱: 왼쪽 아래 바로 가기 줄 바로 위 반투명 상자. 상자 안에서 스크롤(하단 고정), 아래에 입력칸 (Enter 포커스 → Enter 전송 → Esc·빈 Enter 해제)
//  - 모바일: 평소엔 상자 없이 글씨만 최근 몇 줄(터치 통과) + 옆 작은 [기록] 버튼.
//    누르면 그 자리에 반투명 기록 창(손가락 스크롤, [말하기]로 채팅 입력 줄). 창 밖을 누르면 닫히고 그 터치는 게임(조이스틱)으로 그대로 간다.
//    채팅 입력 줄(ChatSheet)에도 같은 기록이 위에 붙는다.

/** 데스크톱 채팅창 입력칸 id (GameShell의 Enter가 찾아 포커스한다) */
const INPUT_ID = "chat-log-input";
/** 흐려짐·만료를 다시 그리는 간격 (방금 오간 줄이 있을 때) */
const TICK_MS = 1000;
/** 지난 줄만 있을 때 다시 그리는 간격 ("N분 전"·하루 지난 줄 정리) */
const TICK_IDLE_MS = 30_000;
/** 뒤로 간 동안(다른 창을 보는 중)은 흐려짐 갱신을 늦춘다 */
const TICK_BG_MS = 5000;

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
  /** 모바일 기록 창의 [말하기]: 채팅 입력 줄(ChatSheet) 열기. 없으면 버튼을 안 보인다 */
  onChat?: () => void;
};

export default function ChatLog({ mobile, room, hidden = false, onChat }: Props) {
  const all = useChatLines();
  const [now, setNow] = useState(() => Date.now());

  // 채널을 옮길 때만 비운다 (같은 채널 안에서 집에 들어갔다 나와도 5분 안의 글은 남는다. 캠핑장 "3c"는 마을 "3"과 따로)
  const channel = chatChannelOf(room);
  useEffect(() => chatStore.setChannel(channel), [channel]);
  // 알림음은 채팅창이 보일 때만
  useEffect(() => {
    setChatShown(!hidden);
    return () => setChatShown(false);
  }, [hidden]);
  // 줄이 있는 동안만 갱신: 방금 오간 줄이 있으면 1초마다(흐려짐), 지난 줄만 있으면 드물게("N분 전"·만료)
  const any = all.length > 0;
  const fresh = any && now - (all.at(-1)?.at ?? 0) < CHAT_LOG_TTL_MS;
  const background = useBackground();
  useEffect(() => {
    if (!any) return;
    const t = setInterval(
      () => {
        const n = Date.now();
        chatStore.prune(n);
        setNow(n);
      },
      Math.max(fresh ? TICK_MS : TICK_IDLE_MS, background ? TICK_BG_MS : 0),
    );
    return () => clearInterval(t);
  }, [any, fresh, background]);

  if (hidden) return null;
  // 막 추가된 줄은 렌더 시각이 받은 시각보다 앞설 수 있다 → 둘 중 늦은 쪽으로 (1초 안 흐려짐 없음)
  const at = Math.max(now, all.at(-1)?.at ?? 0);
  return mobile ? (
    <MobileChat all={visibleChatLines(all, at)} now={at} onChat={onChat} />
  ) : (
    <DesktopBox lines={visibleChatLines(all, at)} now={at} />
  );
}

/**
 * 모바일: 평소엔 글씨만(5분 안의 최근 몇 줄, 흐려짐, 터치 통과) + 옆 작은 [기록] 버튼.
 * [기록]을 누르면 같은 자리에 기록 창 — 손가락으로 위로 올려 읽고, 창 밖을 누르면 닫힌다 (그 터치는 막지 않아 조이스틱이 바로 잡힌다)
 */
function MobileChat({ all, now, onChat }: { all: ChatLine[]; now: number; onChat?: () => void }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);

  // 창 밖 누르기 → 닫기. 캡처 단계에서 보기만 하고 막지 않는다 (게임 화면·조이스틱·버튼이 그 터치를 그대로 받는다)
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target;
      if (t instanceof Node && panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  if (open) {
    return (
      <section ref={panelRef} className={styles.panel} aria-label="채팅 기록">
        <header className={styles.panelHead}>
          <span className={styles.panelTitle}>채팅 기록</span>
          <span className={styles.panelNote}>하루 동안 남아요</span>
          {onChat && (
            <button
              type="button"
              className={styles.panelBtn}
              // iOS는 탭 처리 안에서 포커스해야 키보드를 띄운다 → flushSync로 입력 줄을 바로 그린다 (MobileControls [채팅]과 같게)
              onClick={() =>
                flushSync(() => {
                  setOpen(false);
                  onChat();
                })
              }
            >
              <PixelIcon name="type" />
              말하기
            </button>
          )}
          <button type="button" className={styles.panelBtn} aria-label="채팅 기록 닫기" onClick={() => setOpen(false)}>
            <PixelIcon name="close" />
          </button>
        </header>
        {all.length > 0 ? <ChatScroll lines={all} now={now} className={styles.panelLog} /> : <p className={styles.empty}>아직 채팅이 없어요</p>}
      </section>
    );
  }
  const recent = recentChatLines(all, now, CHAT_LOG_MOBILE_LINES);
  return (
    <>
      <button type="button" className={styles.logBtn} aria-label="채팅 기록 보기" onClick={() => setOpen(true)}>
        <PixelIcon name="chat" />
      </button>
      {recent.length > 0 && (
        <ol className={styles.mobile} aria-label="채팅" aria-live="polite">
          {recent.map((l) => (
            <ChatLineItem key={l.id} line={l} opacity={chatLineOpacity(l, now)} />
          ))}
        </ol>
      )}
    </>
  );
}

/** 데스크톱: 반투명 상자 + 스크롤 기록(하단 고정) + 입력칸 */
function DesktopBox({ lines: shown, now }: { lines: ChatLine[]; now: number }) {
  return (
    <section className={styles.box} aria-label="채팅">
      {shown.length > 0 && <ChatScroll lines={shown} now={now} />}
      <ChatInput id={INPUT_ID} className={styles.input} placeholder="Enter로 채팅" onCancel={() => document.getElementById(INPUT_ID)?.blur()} />
    </section>
  );
}
