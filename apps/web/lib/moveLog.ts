import type { MapId, RaftOutWhy, RideGear, RideOffWhy } from "@tomb/protocol";

// 11/27 운영 기록 「자리 옮김」: 무슨 버튼으로 어디서 어디로 갔는지 (회원 상세 접속 기록에 함께 보인다 — lib/store/opsLog의 conn 목록, 계정 목록에만).
//  - 집 들어감·못 들어감은 서버가 판단한 그대로 적는다 (POST /api/housing/houses/[id]/visit — src "s")
//  - 맵 옮기기·집에서 나옴·채널 옮기기는 화면이 알려 준 것 (POST /api/me/moves — src "c"). 버튼 이름(via)은 화면 말만 믿고, 권한 판단에는 쓰지 않는다
//  - 버튼 이름이 없거나 모르는 값이면 「알 수 없음(옛 화면)」

/**
 * map = 맵 옮기기(버스 등), houseIn = 집 들어감, houseNo = 집 못 들어감, houseOut = 집에서 나옴, channel = 채널 옮기기, fishStop = 자동 낚시 해제(까닭 via),
 * 11/27 tab = 다시 접속·다른 탭 (실시간 서버가 적는다 — 서버 맵을 지킴, 화면이 다른 맵을 보냄)
 * 11/28 fishStart = 자동 낚시 시작, raftBuy·raftRenew = 좌대 입장권 구매·연장 (서버만 적는다)
 * 11/28 rideOn·rideOff = 탈것 탐·내림, raftOut = 좌대에서 내려보내짐 (실시간 서버 "r" 줄 — lib/opsLog recordConnRows)
 * 관리자 화면 문구는 전부 lib/logText 한 곳 (여기는 코드 목록만 — 화면 묶음이 문구·카탈로그를 끌어오지 않게)
 */
export const MOVE_KINDS = ["map", "houseIn", "houseNo", "houseOut", "channel", "fishStop", "tab", "fishStart", "raftBuy", "raftRenew", "rideOn", "rideOff", "raftOut"] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];
/** 서버만 적는 종류 (화면 묶음에 섞여 오면 버린다) */
export const SERVER_ONLY_KINDS: readonly MoveKind[] = ["houseIn", "fishStop", "tab", "fishStart", "raftBuy", "raftRenew", "rideOn", "rideOff", "raftOut"];

/** 누른 버튼·계기 (문구는 lib/logText VIA_LABEL) */
export const MOVE_VIAS = [
  "bus",
  // 11/27 실시간 서버가 맵을 옮긴 까닭 (src "s")
  "mapReq",
  "permLost",
  // 11/27 화면이 서버 맵으로 따라감 (다른 탭에서 다시 접속 등)
  "follow",
  "friend",
  "staffTp",
  "bail",
  "houseExit",
  "mine",
  "friendWin",
  "list",
  "door",
  "exitDoor",
  "panel",
  "reload",
  "channelWin",
  // 11/27 자동 낚시를 서버가 끈 까닭 (fishStop — 서버만 적는다)
  "fishHouse",
  "fishRoom",
  "fishChannel",
  "fishMap",
  "fishAway",
  "fishQuit",
  // 11/28 직접 끔·직접 던짐·새로 다시 켬·물때·좌대 입장권 끝
  "fishSelf",
  "fishCast",
  "fishRestart",
  "fishTide",
  "fishRaftEnd",
] as const;
export type MoveVia = (typeof MOVE_VIAS)[number];
export const isMoveVia = (v: unknown): v is MoveVia => typeof v === "string" && (MOVE_VIAS as readonly string[]).includes(v);

/** 집 못 들어간 까닭 */
export const MOVE_NOS = ["offline", "big"] as const;
export type MoveNo = (typeof MOVE_NOS)[number];

/** 저장되는 한 줄 (접속 기록 conn 목록의 k: "mv") */
export type MoveLogEntry = {
  a: string;
  k: "mv";
  at: number;
  m: MoveKind;
  /** 맵 id, 채널 번호(문자열), 집 나옴은 "mine"·"other" */
  from?: string;
  to?: string;
  via?: MoveVia;
  /** 대상 (집: 「GBT의 카라반 · 1채널 캠핑장 7번」). 11/27 자동 낚시 멈춤 옛 줄은 「3마리 정산」 */
  tgt?: string;
  no?: MoveNo;
  /** s = 서버가 판단, c = 화면이 알려 줌 */
  src: "s" | "c";
  /** 11/27 실시간 서버 줄: 채널·기기. 11/28 자동 낚시·좌대 줄: 그 채널 */
  ch?: number;
  dev?: string;
  /** 11/27 다시 접속(tab): 이번·이전 탭 id, 화면이 보낸 다른 맵, 이전 채널(다른 채널 탭), 이전 연결을 끊음 */
  tab?: string;
  ptab?: string;
  ask?: MapId;
  pch?: number;
  live?: true;
  /** 11/28 집 들어감: 내 집 */
  mine?: true;
  /** 11/28 자동 낚시: 낚시 자리 id, 해제 때 정산한 물고기 수 */
  spot?: string;
  fish?: number;
  /** 11/28 좌대: 좌대 번호(자동 낚시 시작에도), 산·늘린 분, 낸 포인트, 끝나는 시각 */
  n?: number;
  min?: number;
  pts?: number;
  until?: number;
  /** 11/28 탈것 (rideOn·rideOff): 무엇·어느 맵·2인승 자리(0 앞·1 뒤)·탄 시간(초)·내린 까닭, brief = 탔다가 바로 내림 (한 줄로 접음 — 시각은 탄 때). 번호는 n */
  ride?: RideGear;
  map?: MapId;
  seat?: 0 | 1;
  sec?: number;
  off?: RideOffWhy;
  brief?: true;
  /** 11/28 좌대에서 내려보낸 까닭 (raftOut — 좌대 번호는 n, 채널은 ch) */
  out?: RaftOutWhy;
  /** 11/28 한 계정이 짧은 사이 너무 많이 적어 이 줄 앞에서 건너뛴 줄 수 (lib/opsLog logMoves · 실시간 서버 "r" 줄의 s도 더한다) */
  skip?: number;
};

/** 화면 → 서버 한 줄 */
export type MoveWire = { m: MoveKind; at: number; from?: string; to?: string; via?: MoveVia; tgt?: string; no?: MoveNo };
export const MOVE_BATCH_MAX = 10;
/** 화면이 알려 준 시각은 이 안쪽만 (늦게 보낸 묶음) */
const MOVE_AT_SKEW_MS = 10 * 60_000;

const SPOT_RE = /^(village|camp|sea|mine|other|\d{1,3})$/;
const clean = (s: unknown, max: number): string | undefined => {
  if (typeof s !== "string") return undefined;
  const t = s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return t || undefined;
};

/** 화면이 보낸 묶음 → 저장할 줄 (형식이 틀린 줄은 버린다) */
export function parseMoveWire(raw: unknown, accountId: string, now: number): MoveLogEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MoveLogEntry[] = [];
  for (const r of raw.slice(0, MOVE_BATCH_MAX)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    if (!(MOVE_KINDS as readonly unknown[]).includes(o.m) || SERVER_ONLY_KINDS.includes(o.m as MoveKind)) continue; // 집 들어감·자동 낚시·좌대·다시 접속은 서버만 적는다
    const at = typeof o.at === "number" && Number.isFinite(o.at) ? Math.min(now, Math.max(now - MOVE_AT_SKEW_MS, Math.round(o.at))) : now;
    const from = typeof o.from === "string" && SPOT_RE.test(o.from) ? o.from : undefined;
    const to = typeof o.to === "string" && SPOT_RE.test(o.to) ? o.to : undefined;
    const no = (MOVE_NOS as readonly unknown[]).includes(o.no) ? (o.no as MoveNo) : undefined;
    const tgt = clean(o.tgt, 40);
    out.push({ a: accountId, k: "mv", at, m: o.m as MoveKind, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(isMoveVia(o.via) ? { via: o.via } : {}), ...(tgt ? { tgt } : {}), ...(no ? { no } : {}), src: "c" });
  }
  return out.sort((x, y) => x.at - y.at);
}
