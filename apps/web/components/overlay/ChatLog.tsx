"use client";

import { useEffect, useState } from "react";
import { useBackground } from "@/lib/hooks/useBackground";
import { CHAT_LOG_TTL_MS, chatChannelOf, visibleChatLines, type ChatLine } from "@/game/logic/chatLog";
import { cx } from "../ui/cx";
import ChatInput from "./ChatInput";
import { chatStore, setChatShown, useChatLines } from "./chatLines";
import { readChatSize, saveChatSize, stepChatSize, type ChatSize } from "./chatSize";
import ChatScroll from "./ChatScroll";
import styles from "./ChatLog.module.css";

// 채팅 기록창: 같은 채널(방)에서 오간 자유 채팅 (말풍선과 함께). 화면 메모리에만 두고 기기에 저장하지 않는다 (chatLines).
// 방에 들어올 때(입장·새로고침·재접속·실내에서 복귀) 서버가 그 방의 최근 기록(chat:log — 하루 안, 서버가 잠들었다 깨도
// 맵별 최근 50줄)을 보내 주면 서버 줄 id로 겹치지 않게 합친다. 5분 지난 줄은 흐리게 + "N분 전".
//  - 데스크톱: 왼쪽 아래 바로 가기 줄 바로 위 반투명 상자. 상자 안에서 스크롤(하단 고정), 아래에 입력칸 (Enter 포커스 → Enter 전송 → Esc·빈 Enter 해제)
//    11/17 상자 오른쪽 위 [−][+]로 크기 세 단계 (작게 = 최근 세 줄). 이 브라우저에 기억한다 (chatSize)
//  - 모바일: 조이스틱 바로 위 반투명 상자에 기록이 늘 보인다 (손가락 스크롤). 입력은 행동 버튼 [채팅] 하나로 (11/16 [기록] 버튼·기록 창은 없앴다).
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
  /** 지금 채팅을 쓸 수 없는 장면(상점·미니게임 등)이면 숨긴다 (받은 줄은 계속 모은다) */
  hidden?: boolean;
  /** 11/17 사냥 중: 데스크톱 상자를 사냥 HUD 위·맨 아래로 (손가락 기기는 사냥 중 채팅을 꺼서 GameShell이 hidden으로 넘긴다) */
  hunt?: boolean;
};

export default function ChatLog({ mobile, room, hidden = false, hunt = false }: Props) {
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
    <MobileChat all={visibleChatLines(all, at)} now={at} />
  ) : (
    <DesktopBox lines={visibleChatLines(all, at)} now={at} hunt={hunt} />
  );
}

/**
 * 모바일 (11/16): 조이스틱 바로 위 반투명 상자에 채팅 기록이 늘 보인다 (예전엔 최근 몇 줄 + [기록] 버튼을 눌러야 창이 열렸다).
 * 손가락으로 위로 올려 지난 줄을 읽는다. 입력은 행동 버튼 [채팅] 하나로 (채팅 입력 줄 ChatSheet)
 */
function MobileChat({ all, now }: { all: ChatLine[]; now: number }) {
  if (all.length === 0) return null;
  return (
    <section className={styles.mobileBox} aria-label="채팅">
      <ChatScroll lines={all} now={now} className={styles.mobileLog} />
    </section>
  );
}

/** 데스크톱: 반투명 상자 + 스크롤 기록(하단 고정) + 입력칸. 11/17 오른쪽 위 탭 [−][+]로 크기 단계 */
function DesktopBox({ lines: shown, now, hunt }: { lines: ChatLine[]; now: number; hunt: boolean }) {
  // 게임이 뜬 뒤에만 그려지므로(ready) 처음 값을 바로 저장소에서 읽어도 서버 렌더와 어긋나지 않는다
  const [size, setSize] = useState<ChatSize>(readChatSize);
  const step = (dir: 1 | -1) => {
    const next = stepChatSize(size, dir);
    setSize(next);
    saveChatSize(next);
  };
  return (
    <section className={cx(styles.box, hunt && styles.huntBox)} data-size={size} aria-label="채팅">
      <div className={styles.sizeTab}>
        <button type="button" className={styles.sizeBtn} onClick={() => step(-1)} disabled={size === "small"} aria-label="채팅창 줄이기" title="채팅창 줄이기">
          −
        </button>
        <button type="button" className={styles.sizeBtn} onClick={() => step(1)} disabled={size === "large"} aria-label="채팅창 키우기" title="채팅창 키우기">
          +
        </button>
      </div>
      {shown.length > 0 && <ChatScroll lines={shown} now={now} />}
      <ChatInput id={INPUT_ID} className={styles.input} placeholder="Enter로 채팅" onCancel={() => document.getElementById(INPUT_ID)?.blur()} />
    </section>
  );
}
