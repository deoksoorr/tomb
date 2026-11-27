import { isMapId, type MapId } from "@tomb/protocol";

// 11/27 운영 기록 「자리 옮김」: 무슨 버튼으로 어디서 어디로 갔는지 (회원 상세 접속 기록에 함께 보인다 — lib/store/opsLog의 conn 목록, 계정 목록에만).
//  - 집 들어감·못 들어감은 서버가 판단한 그대로 적는다 (POST /api/housing/houses/[id]/visit — src "s")
//  - 맵 옮기기·집에서 나옴·채널 옮기기는 화면이 알려 준 것 (POST /api/me/moves — src "c"). 버튼 이름(via)은 화면 말만 믿고, 권한 판단에는 쓰지 않는다
//  - 버튼 이름이 없거나 모르는 값이면 「알 수 없음(옛 화면)」

/** map = 맵 옮기기(버스 등), houseIn = 집 들어감, houseNo = 집 못 들어감, houseOut = 집에서 나옴, channel = 채널 옮기기, fishStop = 자리를 떠나 서버가 자동 낚시를 끔 */
export const MOVE_KINDS = ["map", "houseIn", "houseNo", "houseOut", "channel", "fishStop"] as const;
export type MoveKind = (typeof MOVE_KINDS)[number];

/** 누른 버튼·계기 */
export const MOVE_VIA_LABEL = {
  bus: "버스",
  friend: "친구한테 가기",
  staffTp: "운영자 순간이동",
  bail: "맵을 못 열어 마을 정류장으로",
  houseExit: "내 집에서 나와 그 집 맵으로",
  mine: "내 집 가기",
  friendWin: "친구 창 집 버튼",
  list: "분양 사무소 둘러보기·랭킹",
  door: "집 문(E)",
  exitDoor: "집 문으로 나옴",
  panel: "창 닫힘·채널 옮기기",
  reload: "새로고침·다시 접속",
  channelWin: "채널 창",
  // 11/27 자동 낚시를 서버가 끈 까닭 (fishStop — 서버만 적는다)
  fishHouse: "집 들어감",
  fishRoom: "사냥터·분양 마을 들어감",
  fishChannel: "채널 옮김",
  fishMap: "다른 맵으로 감",
  fishAway: "실내·버스·사냥터에 있음",
  fishQuit: "접속이 끊겼다가 다시 들어옴",
} as const;
export type MoveVia = keyof typeof MOVE_VIA_LABEL;
export const isMoveVia = (v: unknown): v is MoveVia => typeof v === "string" && Object.prototype.hasOwnProperty.call(MOVE_VIA_LABEL, v);

/** 집 못 들어간 까닭 */
export const MOVE_NO_LABEL = { offline: "주인이 접속 안 함", big: "몸이 커진 동안" } as const;
export type MoveNo = keyof typeof MOVE_NO_LABEL;

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
  /** 대상 (집: 「GBT의 카라반 · 1채널 캠핑장 7번」) */
  tgt?: string;
  no?: MoveNo;
  /** s = 서버가 판단, c = 화면이 알려 줌 */
  src: "s" | "c";
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
    if (!(MOVE_KINDS as readonly unknown[]).includes(o.m) || o.m === "houseIn" || o.m === "fishStop") continue; // 집 들어감·자동 낚시 멈춤은 서버만 적는다
    const at = typeof o.at === "number" && Number.isFinite(o.at) ? Math.min(now, Math.max(now - MOVE_AT_SKEW_MS, Math.round(o.at))) : now;
    const from = typeof o.from === "string" && SPOT_RE.test(o.from) ? o.from : undefined;
    const to = typeof o.to === "string" && SPOT_RE.test(o.to) ? o.to : undefined;
    const no = o.no === "offline" || o.no === "big" ? o.no : undefined;
    const tgt = clean(o.tgt, 40);
    out.push({ a: accountId, k: "mv", at, m: o.m as MoveKind, ...(from ? { from } : {}), ...(to ? { to } : {}), ...(isMoveVia(o.via) ? { via: o.via } : {}), ...(tgt ? { tgt } : {}), ...(no ? { no } : {}), src: "c" });
  }
  return out.sort((x, y) => x.at - y.at);
}

const MAP_LABEL: Record<MapId, string> = { village: "마을", camp: "캠핑장", sea: "바닷가" };
const spotText = (s: string | undefined): string => (s === undefined ? "?" : isMapId(s) ? MAP_LABEL[s] : /^\d+$/.test(s) ? `${s}채널` : s);
export const UNKNOWN_VIA = "알 수 없음(옛 화면)";

/** 관리자 화면 한 줄 설명 */
export function moveText(e: Pick<MoveLogEntry, "m" | "from" | "to" | "via" | "tgt" | "no" | "src">): string {
  const via = e.via ? MOVE_VIA_LABEL[e.via] ?? UNKNOWN_VIA : UNKNOWN_VIA;
  const tgt = e.tgt ? ` · ${e.tgt}` : "";
  const by = e.src === "c" ? " (화면 보고)" : "";
  switch (e.m) {
    case "map":
      return `맵 ${spotText(e.from)} → ${spotText(e.to)} · ${via}${by}`;
    case "houseIn":
      return `${via} → 집 들어감${tgt}`;
    case "houseNo":
      return `${via} → 못 들어감(${e.no ? MOVE_NO_LABEL[e.no] : "?"})${tgt}${by}`;
    case "houseOut":
      return `집에서 나옴(${e.from === "mine" ? "내 집" : "남의 집"}) → ${spotText(e.to)}${e.from === "mine" ? "" : "(원래 맵)"} · ${via}${tgt}${by}`;
    case "fishStop":
      return `자동 낚시 멈춤: ${via}`;
    case "channel":
      // 채널 창·집 채널로 옮기기 모두 같은 길이라 버튼 이름이 없다
      return `채널 ${spotText(e.from)} → ${spotText(e.to)}${e.via ? ` · ${via}` : ""}${by}`;
    default:
      return via;
  }
}
