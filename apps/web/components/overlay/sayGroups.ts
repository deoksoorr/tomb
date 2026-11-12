import type { PhraseId } from "@tomb/protocol";

// 말풍선 탭의 상황별 묶음. 모든 문장(PHRASES)이 어느 한 묶음에 들어간다 (sayGroups.test.ts로 확인).
// emos는 이모티콘판(EMO_BOARD)의 id — 몸짓(wave·cheer)과 이모티콘(EMOS)을 섞어 쓴다.

export type SayGroup = { title: string; desc: string; phrases: readonly PhraseId[]; emos: readonly string[] };

export const SAY_GROUPS: readonly SayGroup[] = [
  { title: "인사", desc: "들어오고 나갈 때, 고마울 때", phrases: ["hi", "bye", "thanks"], emos: ["wave", "heart"] },
  { title: "리액션", desc: "묘비를 읽고 마음이 갈 때", phrases: ["nice", "same", "cheer"], emos: ["clap", "laugh", "cry", "wow"] },
  { title: "모닥불·묘역", desc: "벤치·모닥불 앞에서 쉬어 갈 때", phrases: ["sit", "rip"], emos: ["fire", "zzz", "coffee", "note"] },
  { title: "함께 놀기", desc: "사냥·집 구경을 같이 갈 때", phrases: ["follow", "hunt", "house"], emos: ["cheer", "bang", "idea"] },
];

