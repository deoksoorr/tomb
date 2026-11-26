"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { CHAT_MAX, CHAT_STORE_MAX, maskChat, MEGAPHONE_MAX, nameKey, newChatBucket, normalizeChat, takeChatToken } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { isBareWhisper, isWhisperCommand, parseWhisper, whisperChips, whisperPrefill } from "@/game/logic/whisper";
import { errorMessage } from "@/lib/api";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { isShoutCommand, shoutCommandText, SHOUT_COMMAND } from "@/lib/opShout";
import { socialApi } from "@/lib/socialApi";
import { useWhisperPartners } from "@/lib/whisperPartners";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { chatStore, useChatLines } from "./chatLines";
import ChatScroll from "./ChatScroll";
import styles from "./ChatInput.module.css";
import logStyles from "./ChatLog.module.css";

// 말풍선 자유 채팅 입력칸: 데스크톱은 왼쪽 아래 채팅창(ChatLog) 안, 폰은 [채팅] 버튼으로 여는 키보드 위 줄(ChatSheet, 위에 채팅 기록)과 표현 창 위쪽.
// 쓴 글은 머리 위 말풍선 + 같은 채널의 채팅창에 뜬다 (서버는 늦게 온 사람용으로 맵별 최근 CHAT_STORE_MAX줄을 하루까지 남긴다, 기기에는 저장 안 함). 도배 제한은 서버와 같은 토큰 버킷을 화면에서도 미리 지킨다.

/** 화면 쪽 토큰 버킷 (입력칸이 여럿이어도 하나를 같이 쓴다) */
const bucket = newChatBucket();
/** 지금 한 번 보내도 되면 토큰을 쓰고 true */
const takeToken = () => takeChatToken(bucket, performance.now());
/** "천천히" 표시 시간 */
const SLOW_MS = 1500;
/** 11/16 귓속말 입력칸 글자 수: "/w " + 이름(공백 포함) + 할 말 CHAT_MAX자 */
const WHISPER_INPUT_MAX = CHAT_MAX + 30;
/** 11/26 운영자 외치기 입력칸 글자 수: "/외치기 " + 외칠 말 MEGAPHONE_MAX자 (넘치면 서버가 안내) */
const SHOUT_INPUT_MAX = MEGAPHONE_MAX + 10;
/** 캐릭터 메뉴 [귓속말]이 채운 글을 막 열린 입력칸(폰 한 줄 입력칸)이 가져갈 수 있는 시간 */
const PREFILL_MS = 2_000;

// 11/16 캐릭터 메뉴 [귓속말] → "/w 닉네임 ". 이미 떠 있는 입력칸은 이벤트로 바로 받고, 이어서 열리는 입력칸은 처음 값으로 가져간다
let prefill: { text: string; at: number } | null = null;
if (typeof window !== "undefined") bridge.on("chat:prefill", ({ text }) => void (prefill = { text, at: Date.now() }));
const takePrefill = (): string => {
  const p = prefill;
  prefill = null;
  return p && Date.now() - p.at < PREFILL_MS ? p.text : "";
};

/** 귓속말 이름 맞추기용: 최근 귓속말 상대와 채팅창에 보인 다른 사람 이름들 (서버가 접속자 이름으로 다시 맞춘다) */
const knownNames = (partners: readonly string[]): string[] => [
  ...new Set([...partners, ...chatStore.get().flatMap((l) => (l.w === "fail" || l.w === "note" || (l.mine && !l.w) || !l.name ? [] : [l.name]))]),
];
/** 이름 칩을 띄울 때 접속 여부를 다시 묻는 최소 간격 (서버는 2초에 한 번만 답한다) */
const WHO_ON_ASK_MS = 5_000;
let whoOnAskedAt = -Infinity;
const askWhoOn = (names: readonly string[]) => {
  if (performance.now() - whoOnAskedAt < WHO_ON_ASK_MS) return;
  whoOnAskedAt = performance.now();
  bridge.emit("input:whoOn", { names: [...names] });
};

type Props = {
  /** 보낸 뒤 (데스크톱 막대는 닫고, 표현 창도 닫는다) */
  onSent?: () => void;
  /** Esc·빈 글 Enter (데스크톱 막대 닫기) */
  onCancel?: () => void;
  autoFocus?: boolean;
  className?: string;
  /** 입력칸 id (데스크톱 채팅창: Enter로 포커스할 때 찾는다) */
  id?: string;
  placeholder?: string;
};

export default function ChatInput({ onSent, onCancel, autoFocus = false, className, id, placeholder = "머리 위 말풍선으로 한마디" }: Props) {
  const [text, setText] = useState(takePrefill);
  const [slow, setSlow] = useState(false);
  // 터치 기기는 Enter 대신 [보내기]
  const coarse = useMediaQuery("(pointer: coarse)");
  /** 11/16 귓속말을 못 보낸 까닭 (이름·할 말이 없음 등). 글을 고치면 지운다 */
  const [whisperHint, setWhisperHint] = useState<string | null>(null);
  /** 11/16 방향키로 고른 이름 칩 */
  const [pick, setPick] = useState(-1);
  const partners = useWhisperPartners();
  const online = useBridgeValue("whisper:online");
  // 11/26 「/외치기 할 말」: 운영자 계정만 (일반 채팅으로는 절대 내보내지 않는다)
  const iAmStaff = useBridgeValue("me:staff")?.on === true;
  const [shouting, setShouting] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 레이아웃 효과로 커밋 중에 바로 포커스: 폰 [채팅] 버튼이 flushSync로 열면 탭 처리 안이라 iOS도 키보드를 띄운다
  useLayoutEffect(() => {
    const el = ref.current;
    if (!autoFocus || !el) return;
    el.focus({ preventScroll: true });
    // 채워진 글(귓속말 "/w 닉네임 ")이 있으면 커서를 끝으로
    el.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);
  // 이미 떠 있는 입력칸(데스크톱 채팅창 등)은 캐릭터 메뉴 [귓속말]을 바로 받는다 (포커스는 GameShell이 준다)
  useBridgeEvent("chat:prefill", ({ text: t }) => {
    prefill = null;
    setText(t);
    setWhisperHint(null);
    requestAnimationFrame(() => ref.current?.setSelectionRange(t.length, t.length));
  });
  // 닫힐 때(보내기·바깥 누르기) 포커스를 먼저 놓는다: iOS(WebKit)는 포커스된 입력칸이 그냥 사라지면 focusout을 안 보내
  // 게임 입력 잠금(ui:blockKeys)이 안 풀려 조이스틱·버튼이 전부 멈춘 채로 남는다
  useLayoutEffect(() => {
    const el = ref.current;
    return () => {
      if (el && document.activeElement === el) el.blur();
    };
  }, []);
  useEffect(
    () => () => {
      if (slowTimer.current) clearTimeout(slowTimer.current);
    },
    [],
  );

  // 11/16 "/w 닉네임 할 말": 글자 수·가림 안내는 할 말만 본다
  const whisper = isWhisperCommand(text);
  const shout = !whisper && isShoutCommand(text);
  const shoutText = shout ? (shoutCommandText(text) ?? "") : "";
  const draft = whisper ? parseWhisper(text, knownNames(partners)) : null;
  const clean = whisper || shout ? (text.trim() ? text : null) : normalizeChat(text);
  const said = draft?.kind === "send" ? draft.text : whisper || shout ? "" : (clean ?? "");
  const masked = said !== "" && maskChat(said) !== said;
  const count = draft?.kind === "long" ? draft.size : [...(shout ? shoutText : whisper ? said : text)].length;
  // 11/16 이름 칩: "/w " 뒤에 이름을 쓰는 중이면 그 앞부분에 맞는 상대 (방향키로 고른다). [귓] 버튼은 없앴다 (/w + Enter로 충분)
  const chips = whisperChips(text, partners);
  const picked = chips && pick >= 0 && pick < chips.length ? pick : -1;
  const offline = new Set((online?.off ?? []).map(nameKey));
  const chipsShown = chips !== null && chips.length > 0;
  // 칩이 뜨면 그 사람들이 지금 이 채널에 있는지 서버에 묻는다 (없는 사람은 흐리게. 그래도 보낼 수는 있다)
  useEffect(() => {
    if (chipsShown && partners.length > 0) askWhoOn(partners);
  }, [chipsShown, partners]);

  /** 칩 고르기: "/w 이름 "을 채우고 입력칸으로 */
  function choose(name: string) {
    const t = whisperPrefill(name);
    setText(t);
    setPick(-1);
    setWhisperHint(null);
    const el = ref.current;
    el?.focus({ preventScroll: true });
    requestAnimationFrame(() => el?.setSelectionRange(t.length, t.length));
  }

  /** 도배 제한: 너무 빨리 쳤으면 조용히 막고 작은 표시만 (글은 그대로 둔다). 보내도 되면 true */
  function allowSend(): boolean {
    if (takeToken()) return true;
    setSlow(true);
    if (slowTimer.current) clearTimeout(slowTimer.current);
    slowTimer.current = setTimeout(() => setSlow(false), SLOW_MS);
    return false;
  }

  /** 11/26 운영자 외치기 보내기 (모든 채널 가운데 알림, 기록에 남지 않는다). 운영자가 아니면 안내만 — 서버에도 채팅으로도 보내지 않는다 */
  async function sendShout() {
    if (!iAmStaff) {
      setWhisperHint("운영자만 쓸 수 있는 명령이에요");
      return;
    }
    if (!shoutText) {
      setWhisperHint(`${SHOUT_COMMAND} 뒤에 외칠 말을 적어 주세요`);
      return;
    }
    if (shouting) return;
    setShouting(true);
    try {
      await socialApi.opShout(shoutText);
      setText("");
      onSent?.();
    } catch (e) {
      setWhisperHint(errorMessage(e));
    } finally {
      setShouting(false);
    }
  }

  function send() {
    if (!clean) {
      onCancel?.();
      return;
    }
    if (shout) {
      void sendShout();
      return;
    }
    // 11/16 귓속말: 이름·할 말이 덜 됐으면 안내만 (글은 그대로). 채팅과 같은 도배 제한
    if (whisper && draft?.kind !== "send") {
      setWhisperHint(
        draft?.kind === "long" ? `할 말은 ${CHAT_MAX}자까지 보낼 수 있어요` : "닉네임 뒤에 할 말을 적어 주세요",
      );
      return;
    }
    if (!allowSend()) return;
    if (draft?.kind === "send") bridge.emit("input:whisper", { to: draft.to, text: draft.text });
    else bridge.emit("input:chat", { text: clean });
    setText("");
    setSlow(false);
    onSent?.();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // 한글 조합 중 Enter는 글자 확정용이다
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // 11/16 "/w " 뒤 이름 칩: ↑·↓로 고르고 Enter로 넣는다
    if (chips && chips.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      e.stopPropagation();
      const n = chips.length;
      setPick(picked < 0 ? (e.key === "ArrowDown" ? 0 : n - 1) : (picked + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
      return;
    }
    if (e.key === "Enter" && chips && picked >= 0) {
      e.preventDefault();
      e.stopPropagation();
      choose(chips[picked]);
      return;
    }
    // 11/16 "/w"만 치고 Enter → 가장 최근에 주고받은 사람으로 바로 채운다 (할 말만 치면 된다)
    if (e.key === "Enter" && isBareWhisper(text)) {
      e.preventDefault();
      e.stopPropagation();
      if (partners.length > 0) choose(partners[0]);
      else setWhisperHint("아직 귓속말한 사람이 없어요. 「/w 닉네임 할 말」로 보내 보세요");
      return;
    }
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
      {chipsShown && (
        <div className={styles.chips} data-chips role="group" aria-label="최근 귓속말 상대">
          {chips.length === 0 ? (
            <span className={styles.chipsEmpty}>아직 귓속말한 사람이 없어요</span>
          ) : (
            chips.map((n, i) => {
              const off = offline.has(nameKey(n));
              return (
                <button
                  key={n}
                  type="button"
                  aria-current={i === picked ? true : undefined}
                  className={cx(styles.chip, i === picked && styles.chipPicked, off && styles.chipOff)}
                  title={off ? "지금 이 채널에 없어요" : undefined}
                  // 눌러도 입력칸 포커스를 지킨다 (폰 키보드가 내려가지 않게)
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => choose(n)}
                >
                  {n}
                </button>
              );
            })
          )}
        </div>
      )}
      <div className={styles.row} data-row="">
        <input
          ref={ref}
          id={id}
          className={cx(ui.input, styles.input)}
          type="text"
          enterKeyHint="send"
          autoComplete="off"
          maxLength={whisper ? WHISPER_INPUT_MAX : shout ? SHOUT_INPUT_MAX : CHAT_MAX}
          value={text}
          placeholder={placeholder}
          aria-label={`채팅 (${CHAT_MAX}자까지, 같은 채널 최근 ${CHAT_STORE_MAX}줄은 하루 동안 남아요. /w 닉네임 할 말로 귓속말)`}
          onChange={(e) => {
            setText(e.target.value);
            setWhisperHint(null);
            setPick(-1);
          }}
          onKeyDown={onKeyDown}
        />
        <button
          type="submit"
          className={cx(ui.button, styles.send)}
          disabled={!clean || shouting}
          // 눌러도 포커스를 입력칸에 둔다 (폰 키보드가 내려갔다 올라오지 않게)
          onMouseDown={(e) => e.preventDefault()}
        >
          보내기
        </button>
      </div>
      <p className={styles.meta} aria-live="polite">
        {slow ? (
          <span className={styles.slow}>너무 빨리 치면 잠깐 막혀요</span>
        ) : whisperHint ? (
          <span className={styles.slow}>{whisperHint}</span>
        ) : shout ? (
          <span>{iAmStaff ? "모든 채널에 운영자 알림으로 떠요. 기록에는 남지 않아요" : "운영자만 쓸 수 있는 명령이에요"}</span>
        ) : masked ? (
          <span>일부 낱말·주소는 ***로 가려져요</span>
        ) : whisper && partners.length > 0 && isBareWhisper(text) ? (
          <span>
            {coarse ? "보내면" : "Enter를 누르면"} {partners[0]}님에게 귓속말해요
          </span>
        ) : whisper ? (
          <span>귓속말은 받는 사람에게만 보여요. /w 하고 {coarse ? "보내면" : "Enter면"} 최근 상대에게 바로 가요</span>
        ) : (
          <span>같은 채널에 보이고, 최근 {CHAT_STORE_MAX}줄은 하루 동안 남아요</span>
        )}
        <span className={styles.count}>
          {count}/{shout ? MEGAPHONE_MAX : CHAT_MAX}
        </span>
      </p>
    </form>
  );
}

/** 폰 [채팅] 버튼으로 여는 한 줄 입력칸: 키보드 바로 위에 붙고, 보내거나 바깥을 누르면 닫힌다. 위에 같은 채널 채팅 기록(손가락 스크롤) */
export function ChatSheet({ onClose, hunt = false }: { onClose: () => void; /** 11/17 사냥 중 (사냥 HUD 위로 띄운다) */ hunt?: boolean }) {
  const kb = useKeyboardInset();
  const lines = useChatLines();
  // 키보드가 내려가며 iOS가 페이지를 밀어 올린 채 남으면 게임 화면·터치 좌표가 어긋난다 → 닫을 때 원위치
  useEffect(
    () => () => {
      requestAnimationFrame(() => {
        if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
      });
    },
    [],
  );
  return (
    <>
      {/* 바깥(게임 화면·조이스틱·행동 버튼)을 누르면 닫기 — iOS는 빈 곳을 눌러도 입력칸 포커스가 안 풀릴 때가 있어 막을 깐다 */}
      <div
        className={cx(styles.sheetBackdrop, hunt && styles.huntBackdrop)}
        onPointerDown={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className={cx(styles.sheet, hunt && styles.huntSheet)}
        role="dialog"
        aria-label="말풍선 채팅"
        // 키보드가 떠 있으면 홈 막대 여백(safe-area)은 필요 없다
        style={kb > 0 ? { bottom: kb, paddingBottom: 6 } : undefined}
      >
        {/* 게임 화면 글씨(ChatLog)가 같은 줄을 이미 읽어 주니 여기선 읽지 않는다 */}
        {lines.length > 0 && <ChatScroll lines={lines} className={logStyles.sheetLog} live={false} />}
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
