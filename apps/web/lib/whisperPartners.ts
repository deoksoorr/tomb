"use client";

import { useSyncExternalStore } from "react";
import { addPartner, readPartners } from "@/game/logic/whisper";
import { meStore } from "./hooks/useMe";
import { readItem, writeItem } from "./storage";

// 11/16 최근 귓속말 상대: 내가 보냈거나 나에게 보낸 사람, 최근 순 최대 WHISPER_PARTNERS_MAX명 (이름 키로 겹치지 않게, game/logic/whisper).
// 계정마다 이 기기(localStorage)에 남긴다. 마지막으로 나에게 보낸 사람(/답 대상)은 이 탭 메모리에만.

/** 계정별 저장 키 */
export const whisperPartnersKey = (accountId: string) => `tomb.ui.whisperPartners.${accountId}`;
/** "/답으로 바로 답장할 수 있어요" 안내를 이미 보여 줬는지 (이 기기) */
export const WHISPER_REPLY_HINT_KEY = "tomb.ui.whisperReplyHint";

// ── 이 탭의 저장소 (React는 useWhisperPartners로 본다) ──

const EMPTY: string[] = [];
let list: string[] = EMPTY;
/** list를 읽어 온 계정 (계정이 바뀌면 다시 읽는다) */
let loadedFor: string | null = null;
let lastFrom: string | null = null;
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

function current(): string[] {
  const acc = meStore.getSnapshot().me?.accountId ?? null;
  if (acc !== loadedFor) {
    loadedFor = acc;
    list = acc ? readPartners(readItem(whisperPartnersKey(acc))) : EMPTY;
    lastFrom = null;
  }
  return list;
}

export const whisperPartners = {
  get: current,
  /** 귓속말을 주고받았다: 맨 앞으로. in = 나에게 보냈다 (/답 대상이 된다) */
  note(name: string, dir: "in" | "out") {
    const next = addPartner(current(), name);
    if (dir === "in") lastFrom = name;
    list = next;
    if (loadedFor) writeItem(whisperPartnersKey(loadedFor), JSON.stringify(next));
    notify();
  },
  /** /답 대상: 이 탭에서 마지막으로 나에게 귓속말한 사람 */
  replyTo: () => (current(), lastFrom),
  subscribe(f: () => void) {
    subs.add(f);
    const off = meStore.subscribe(f);
    return () => {
      subs.delete(f);
      off();
    };
  },
};

export function useWhisperPartners(): string[] {
  return useSyncExternalStore(whisperPartners.subscribe, current, () => EMPTY);
}

let replyHintShown = false;
/** /답 안내를 처음 한 번만: 아직 안 보여 줬으면 true를 돌려주고 보여 준 것으로 적는다 */
export function takeReplyHint(): boolean {
  if (replyHintShown || readItem(WHISPER_REPLY_HINT_KEY)) return false;
  replyHintShown = true;
  writeItem(WHISPER_REPLY_HINT_KEY, "1");
  return true;
}
