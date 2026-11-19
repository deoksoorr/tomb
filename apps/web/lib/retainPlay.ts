import { b64urlDecode, b64urlEncode, hmacSign, hmacVerify } from "@tomb/protocol";
import { distances, HAUNT_TILE, makeMaze } from "@/game/haunt/maze";
import { env } from "./env";
import { HttpError } from "./http";
import { PLAY_KINDS, PLAY_MIN_MS, type PlayKind, type TodoTick } from "./retain";
import { bumpQuest, questHook, todoTickOf } from "./retainQuest";
import { kstDay } from "./store/accounts";

// 11/19 오늘 미션 「놀이」 판 기록: 귀신의 집·범퍼카·관람차/열기구·불멍은 화면(게임)에서만 끝나는 놀이라 서버 기록이 없다.
// 보상이 포인트·재료라 화면 신호만 믿지 않고, 가벼운 판 기록으로 센다 (저장소 명령은 진행 +1 하나뿐 — 그날 미션이고 다 채우기 전일 때만):
//  - 시작: 그날 그 계정 미션에 든 놀이일 때만 서버가 시작 표를 서명해 준다 (서버 시계 · 계정 · 놀이 · 게임 날짜, 귀신의 집은 서버가 고른 미로 시드).
//    미션이 아니면 표가 없다 → 화면은 끝을 알리지 않는다 (요청·명령 모두 없음)
//  - 끝: 표 서명·계정·놀이·날짜가 맞고, 서버 시계로 최소 시간이 지났고(귀신의 집은 그 시드 미로의 입구→출구 최단 길을 달려도 걸리는 시간), 너무 오래되지 않았고,
//    귀신의 집은 「끝까지 돌파」(출구 도착 — 중간에 나오면 done=false라 세지 않는다)일 때만 진행 +1
//  - 같은 표를 다시 보내도 미션은 칸마다 하루 한 번만 받는다 (필요 수 1, 받기는 계정 저장소 Lua가 비트로 한 번)

/** 표가 이보다 오래되면 끝을 받지 않는다 */
export const PLAY_MAX_MS = 40 * 60_000;
/** 귀신의 집 플레이어 최고 속도 (game/haunt/HauntScene RUN_SPEED px/s) · 넉넉한 몫 (대각선·모서리 자르기) */
const HAUNT_RUN_SPEED = 80;
const HAUNT_SLACK = 0.6;

export { PLAY_KINDS, type PlayKind };

/** 그 시드 미로를 입구에서 출구까지 쉬지 않고 달려도 걸리는 시간의 넉넉한 하한 (ms) */
export function hauntMinMs(seed: number): number {
  const m = makeMaze(seed);
  const d = distances(m, m.start)[m.exitIn.ty * m.cols + m.exitIn.tx];
  const run = d > 0 ? ((d * HAUNT_TILE) / HAUNT_RUN_SPEED) * 1000 * HAUNT_SLACK : 0;
  return Math.max(PLAY_MIN_MS.haunt, Math.round(run));
}

type PlayTicket = { a: string; k: PlayKind; t: number; d: string; s?: number };
const DOMAIN = "play:";
const enc = new TextEncoder();
const dec = new TextDecoder();

async function sign(c: PlayTicket): Promise<string> {
  const payload = b64urlEncode(enc.encode(JSON.stringify(c)));
  return `${payload}.${await hmacSign(env.sessionSecret(), DOMAIN + payload)}`;
}

async function verify(token: string): Promise<PlayTicket | null> {
  const dot = token.indexOf(".");
  if (dot <= 0 || token.length > 600) return null;
  const payload = token.slice(0, dot);
  if (!(await hmacVerify(env.sessionSecret(), DOMAIN + payload, token.slice(dot + 1)))) return null;
  const bytes = b64urlDecode(payload);
  if (!bytes) return null;
  try {
    const c = JSON.parse(dec.decode(bytes)) as PlayTicket;
    const ok =
      typeof c.a === "string" &&
      (PLAY_KINDS as readonly string[]).includes(c.k) &&
      Number.isFinite(c.t) &&
      typeof c.d === "string" &&
      (c.s === undefined || Number.isInteger(c.s));
    return ok ? c : null;
  } catch {
    return null;
  }
}

/** ticket = 시작 표 (그날 미션이 아니면 null), seed = 귀신의 집 미로 시드 (서버가 고른다 — 이 시드로 들어가야 센다) */
export type PlayStartResponse = { ticket: string | null; seed?: number };
export type PlayEndResponse = { counted: boolean; todo?: TodoTick };

export async function startPlay(acct: string, kind: PlayKind, now = Date.now()): Promise<PlayStartResponse> {
  const day = kstDay(now);
  // 미션이 아니면(운영자 포함) 표를 주지 않는다 — 저장소를 묻지 않는다
  if (!questHook(acct, day, kind)) return { ticket: null };
  const seed = kind === "haunt" ? (Math.random() * 0x7fffffff) >>> 0 : undefined;
  return { ticket: await sign({ a: acct, k: kind, t: now, d: day, ...(seed !== undefined ? { s: seed } : {}) }), ...(seed !== undefined ? { seed } : {}) };
}

/** done = 끝까지 했는지 (귀신의 집: 출구 도착). ms = 화면이 잰 판 시간 (귀신의 집만 — 서버 시계보다 길 수 없다) */
export async function endPlay(acct: string, token: string, done: boolean, ms: number | undefined, now = Date.now()): Promise<PlayEndResponse> {
  const t = await verify(token);
  if (!t || t.a !== acct) throw new HttpError(400, "BAD_TICKET", "놀이 기록이 올바르지 않아요.");
  const day = kstDay(now);
  // 날이 바뀌었거나(새벽 5시) 너무 오래된 표는 세지 않는다
  if (t.d !== day || now - t.t > PLAY_MAX_MS) return { counted: false };
  // 중간에 나왔으면 세지 않는다 (귀신의 집은 출구까지 · 다른 놀이도 화면이 끝까지 탔을 때만 done)
  if (!done) return { counted: false };
  const elapsed = now - t.t;
  const min = t.k === "haunt" && t.s !== undefined ? hauntMinMs(t.s) : PLAY_MIN_MS[t.k];
  if (elapsed < min) throw new HttpError(422, "TOO_FAST", t.k === "haunt" ? "너무 빨리 빠져나왔어요. 이번 판은 미션에 세지 않아요." : "조금 더 즐겨야 미션에 세요.");
  if (t.k === "haunt" && (ms === undefined || ms < min * 0.9 || ms > elapsed + 2_000)) throw new HttpError(422, "RESULT_REJECTED", "판 기록이 맞지 않아요. 이번 판은 미션에 세지 않아요.");
  const quest = questHook(acct, day, t.k);
  await bumpQuest(quest);
  return { counted: !!quest, ...todoTickOf(quest, day) };
}
