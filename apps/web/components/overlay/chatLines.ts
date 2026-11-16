"use client";

import { useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { isTouchUi } from "@/game/input/keyHint";
import { chatChime, chimeForChat } from "@/lib/chatChime";
import { addChatLine, liveChatLines, mergeChatLines, type ChatLine } from "@/game/logic/chatLog";
import { takeReplyHint, whisperPartners } from "@/lib/whisperPartners";

// 채팅 기록 줄 모음 (화면 메모리에만, 기기에 저장하지 않는다). 데스크톱 상자·폰 글씨·폰 기록 창·폰 채팅 입력 줄이 같이 본다.
// 최근 5분·최대 CHAT_LOG_KEEP줄. 채널이 바뀌면 비운다 (ChatLog가 setChannel).

let lines: ChatLine[] = [];
let seq = 0;
/** 지금 줄들이 속한 채널 번호 (모르면 null) */
let channelOf: string | null = null;
/** 채팅창이 지금 화면에 보이는지 (숨은 장면·화면이 아직 없으면 알림음을 내지 않는다) */
let shownNow = false;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const EMPTY: ChatLine[] = [];

export const chatStore = {
  /** 새 줄이면 true */
  push(name: string, text: string, mine: boolean, key?: string, staff?: true, ns?: string[], mgr?: true, m?: ChatLine["m"], w?: ChatLine["w"]): boolean {
    if (key && lines.some((l) => l.key === key)) return false; // chatLog로 이미 받은 줄
    lines = addChatLine(lines, { id: ++seq, name, text, mine, at: Date.now(), ...(key ? { key } : {}), ...(staff ? { staff } : {}), ...(mgr ? { mgr } : {}), ...(ns ? { ns } : {}), ...(m ? { m } : {}), ...(w ? { w } : {}) });
    notify();
    return true;
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

/** 채팅창이 화면에 보이는지 (알림음 조건) */
export function setChatShown(shown: boolean) {
  shownNow = shown;
}

/** 지금 기록 줄 (5분 지난 줄은 ChatLog가 1초마다 정리한다) */
export function useChatLines(): ChatLine[] {
  return useSyncExternalStore(chatStore.subscribe, chatStore.get, () => EMPTY);
}

// 화면이 아직 안 떴어도(입장 직후 welcome·chatLog가 먼저 올 수 있다) 받은 줄을 모은다 — 모듈에서 한 번만 구독
if (typeof window !== "undefined") {
  bridge.on("chat:line", ({ name, text, mine, key, staff, ns, mgr, m, w }) => {
    const added = chatStore.push(name, text, mine, key, staff, ns, mgr, m, w);
    // 실시간으로 새로 온 다른 사람 채팅에만 작은 알림음 (지난 기록 chat:log에는 울리지 않는다)
    chimeForChat({ mine, added, shown: shownNow, enabled: chatChime.getSnapshot() }, Date.now());
    // 11/16 귓속말 상대는 최근 목록 맨 앞으로 (입력칸 이름 칩·/w + Enter). 처음 받은 귓속말 뒤에는 답장하는 법을 한 번 알려 준다
    if (added && name && (w === "in" || w === "out")) {
      whisperPartners.note(name, w);
      if (w === "in" && takeReplyHint()) chatStore.push("", isTouchUi() ? "/w 하고 보내면 바로 답장할 수 있어요" : "/w 하고 Enter를 누르면 바로 답장할 수 있어요", true, undefined, undefined, undefined, undefined, undefined, "note");
    }
  });
  bridge.on("chat:log", ({ lines: incoming, ch }) => {
    // 월드 채널 기록이면 그 채널로 맞춘 뒤 합친다 (화면의 채널 표시가 늦게 바뀌어도 새 채널 기록을 지우지 않게)
    if (ch !== undefined) chatStore.setChannel(String(ch));
    chatStore.merge(incoming);
  });
}
