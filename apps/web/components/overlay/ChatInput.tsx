"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { CHAT_MAX, maskChat, newChatBucket, normalizeChat, takeChatToken } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./ChatInput.module.css";

// 말풍선 자유 채팅 입력칸: 데스크톱은 Enter로 여는 아래쪽 막대(ChatBar), 폰은 [채팅] 버튼으로 여는 키보드 위 줄(ChatSheet)과 표현 창 위쪽.
// 쓴 글은 내 머리 위 말풍선으로만 잠깐 뜬다 (기록 창·저장 없음). 도배 제한은 서버와 같은 토큰 버킷을 화면에서도 미리 지킨다.

/** 화면 쪽 토큰 버킷 (입력칸이 여럿이어도 하나를 같이 쓴다) */
const bucket = newChatBucket();
/** "천천히" 표시 시간 */
const SLOW_MS = 1500;

type Props = {
  /** 보낸 뒤 (데스크톱 막대는 닫고, 표현 창도 닫는다) */
  onSent?: () => void;
  /** Esc·빈 글 Enter (데스크톱 막대 닫기) */
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
};

export default function ChatInput({ onSent, onCancel, autoFocus = false, className }: Props) {
  const [text, setText] = useState("");
  const [slow, setSlow] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 레이아웃 효과로 커밋 중에 바로 포커스: 폰 [채팅] 버튼이 flushSync로 열면 탭 처리 안이라 iOS도 키보드를 띄운다
  useLayoutEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);
  useEffect(
    () => () => {
      if (slowTimer.current) clearTimeout(slowTimer.current);
    },
    [],
  );

  const clean = normalizeChat(text);
  const masked = clean !== null && maskChat(clean) !== clean;

  function send() {
    if (!clean) {
      onCancel?.();
      return;
    }
    if (!takeChatToken(bucket, performance.now())) {
      // 너무 빨리 쳤다: 조용히 막고 작은 표시만 (글은 그대로 둔다)
      setSlow(true);
      if (slowTimer.current) clearTimeout(slowTimer.current);
      slowTimer.current = setTimeout(() => setSlow(false), SLOW_MS);
      return;
    }
    bridge.emit("input:chat", { text: clean });
    setText("");
    setSlow(false);
    onSent?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중 Enter는 글자 확정용이다
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      send();
    } else if (e.key === "Escape" && onCancel) {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  }

  return (
    <form
      className={cx(styles.chat, className)}
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <div className={styles.row}>
        <input
          ref={ref}
          className={cx(ui.input, styles.input)}
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={CHAT_MAX}
          value={text}
          placeholder="머리 위 말풍선으로 한마디"
          aria-label={`말풍선 채팅 (${CHAT_MAX}자까지, 기록 안 남음)`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className={cx(ui.button, styles.send)}
          disabled={!clean}
          // 눌러도 포커스를 입력칸에 둔다 (폰 키보드가 내려갔다 올라오지 않게)
          onMouseDown={(e) => e.preventDefault()}
        >
          보내기
        </button>
      </div>
      <p className={styles.meta} aria-live="polite">
        {slow ? (
          <span className={styles.slow}>천천히 — 너무 빨리 치면 잠깐 막혀요</span>
        ) : masked ? (
          <span>일부 낱말·주소는 ***로 가려져요</span>
        ) : (
          <span>5초쯤 머리 위에 떠요 · 기록은 남지 않아요</span>
        )}
        <span className={styles.count}>
          {[...text].length}/{CHAT_MAX}
        </span>
      </p>
    </form>
  );
}

/** 데스크톱 Enter 채팅 막대 (화면 아래 가운데). Enter 보내기·Esc 닫기, 보내면 닫힌다 */
export function ChatBar({ onClose }: { onClose: () => void }) {
  return (
    <div
      className={styles.bar}
      role="dialog"
      aria-label="말풍선 채팅"
      // 게임 화면 등 막대 밖을 누르면 닫는다 (보내기 버튼으로 옮겨 가는 포커스는 그대로)
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onClose();
      }}
    >
      <ChatInput autoFocus onSent={onClose} onCancel={onClose} />
    </div>
  );
}

/** 폰 [채팅] 버튼으로 여는 한 줄 입력칸: 키보드 바로 위에 붙고, 보내거나 바깥을 누르면 닫힌다 */
export function ChatSheet({ onClose }: { onClose: () => void }) {
  const kb = useKeyboardInset();
  return (
    <>
      {/* 바깥(게임 화면·조이스틱·행동 버튼)을 누르면 닫기 — iOS는 빈 곳을 눌러도 입력칸 포커스가 안 풀릴 때가 있어 막을 깐다 */}
      <div
        className={styles.sheetBackdrop}
        onPointerDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className={styles.sheet}
        role="dialog"
        aria-label="말풍선 채팅"
        // 키보드가 떠 있으면 홈 막대 여백(safe-area)은 필요 없다
        style={kb > 0 ? { bottom: kb, paddingBottom: 6 } : undefined}
      >
        <ChatInput autoFocus onSent={onClose} onCancel={onClose} />
      </div>
    </>
  );
}

/** 화면 키보드가 가린 아래쪽 높이(px). visualViewport가 줄어든 만큼 — iOS는 레이아웃 뷰포트가 그대로라 fixed bottom이 키보드 뒤로 숨는다 */
function useKeyboardInset() {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setInset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}
