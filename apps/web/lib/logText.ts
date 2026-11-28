import { BOAT_FISHING_SPOTS, CAMP_FISHING_SPOTS, CONN_ABNORMAL, CONN_WHY_LABEL, FISHING_SPOTS, SEA_FISHING_SPOTS, anyFishingWaterOf, campRaftOfSpot, isMapId, type ConnWhy, type MapId, type RaftOutWhy, type RideGear, type RideOffWhy } from "@tomb/protocol";
import { WATER_LABEL } from "./forage/catalog";
import type { MoveKind, MoveLogEntry, MoveNo, MoveVia } from "./moveLog";
import { DIFFS, dropInfo, HUNT_ZONES, isZoneId, type DropKind } from "./rpg/catalog";
import { decodeSg, isSgCode, itemOfSpec, SG_GRADE_NAMES, SG_LEGENDS, SG_SET_INFO, SG_SETS } from "./rpg/setGear";
import type { ConnLogEntry, HuntDrop, HuntLogEntry, HuntLogKind, LogEntry, LogList } from "./store/opsLog";

// 11/28 운영자 「유저 로그에서 어떤 동작 시작, 어떤 동작 해제, 다른 동작 ○○함, 이렇게 써 주는 게 낫지 않나?」
// 관리자 접속 기록·사냥터 기록 한 줄 → 한 문장. 코드 → 말은 이 파일의 표에만 둔다 (기록 줄 모양은 lib/moveLog·lib/store/opsLog).
// 문장 모양: 「동작 (자리·대상 · 세부)」 — 시작/해제, 탐/내림, 들어감/나옴을 짝으로. 옛 줄(필드가 빠진 것)도 깨지지 않고 읽히게.
// 서버(lib/adminLogs)가 문장을 만들어 보낸다 — 관리 화면이 아이템 카탈로그를 받지 않게

export type LogTone = "ok" | "info" | "warn" | "bad" | "plain";
/** tag = 종류 칸(짧게), text = 한 문장, more = 둘째 줄(사냥 보상·드롭), note = 흐린 덧말(기기·화면 보고·탭) */
export type LogLine = { tag: string; tone: LogTone; text: string; more?: string; note?: string };

// ── 표 ──

export const MAP_NAME: Record<MapId, string> = { village: "마을", camp: "캠핑장", sea: "바닷가" };

const DEVICE: Record<string, string> = { pc: "PC", phone: "폰", tablet: "패드" };

/** 접속 기록 줄 종류 → 종류 칸 */
export const CONN_TAG: Record<"in" | "out" | "err", { tag: string; tone: LogTone }> = {
  in: { tag: "접속", tone: "ok" },
  out: { tag: "나감", tone: "plain" },
  err: { tag: "오류", tone: "bad" },
};

/** 자리 옮김·동작 줄(k: "mv")의 종류 → 종류 칸 */
export const MOVE_TAG: Record<MoveKind, { tag: string; tone: LogTone }> = {
  map: { tag: "맵 이동", tone: "info" },
  houseIn: { tag: "집", tone: "info" },
  houseNo: { tag: "집", tone: "warn" },
  houseOut: { tag: "집", tone: "plain" },
  channel: { tag: "채널", tone: "info" },
  tab: { tag: "다시 접속", tone: "info" },
  fishStart: { tag: "자동 낚시", tone: "ok" },
  fishStop: { tag: "자동 낚시", tone: "plain" },
  raftBuy: { tag: "좌대", tone: "ok" },
  raftRenew: { tag: "좌대", tone: "ok" },
  rideOn: { tag: "탈것", tone: "info" },
  rideOff: { tag: "탈것", tone: "plain" },
  raftOut: { tag: "좌대", tone: "plain" },
};

/** 11/28 탈것 이름 */
export const RIDE_LABEL: Record<RideGear, string> = { tube: "튜브", jetski: "제트스키", kayak: "카약", rowboat: "나룻배", boat: "조각배", duck: "오리배" };
/** 2인승 자리 (오리배는 나란히 앉는다) */
const RIDE_SEAT: Record<0 | 1, string> = { 0: "2인 중 앞자리", 1: "2인 중 뒷자리" };
const DUCK_SEAT: Record<0 | 1, string> = { 0: "2인 중 조종석", 1: "2인 중 옆자리" };
/** 서버가 내리게 한 까닭 */
export const RIDE_OFF_LABEL: Record<RideOffWhy, string> = { quit: "게임을 나감·접속 끊김", map: "맵을 옮김", big: "몸이 커짐" };
/** 좌대에서 내려보낸 까닭 → 문장 머리·괄호 말 */
export const RAFT_OUT_LABEL: Record<RaftOutWhy, { head: string; why: string; tone: LogTone }> = {
  end: { head: "좌대에서 내려옴", why: "입장권 시간 끝남", tone: "plain" },
  sold: { head: "좌대에서 내려옴", why: "다른 사람이 그 좌대 입장권을 삼", tone: "info" },
  ticket: { head: "좌대에서 내려보내짐", why: "입장권 없이 올라가려 함", tone: "warn" },
};

/**
 * 버튼·계기 → 말. label = 괄호 안에 붙는 말, map = 맵 이동 줄의 동작(「{to}」 = 간 맵), house = 집 들어감 줄의 동작, fish = 자동 낚시 해제 까닭
 */
export const VIA_LABEL: Record<MoveVia, { label: string; map?: string; house?: string; fish?: string }> = {
  bus: { label: "버스", map: "{to}행 버스 탐" },
  mapReq: { label: "맵 옮기기 요청(버스·친구·집 문)", map: "서버가 맵 옮김" },
  permLost: { label: "허락이 없어짐", map: "허락이 없어져 마을로 보내짐" },
  follow: { label: "다시 접속", map: "다시 접속해 서버 맵으로 따라감" },
  friend: { label: "친구한테 가기", map: "친구한테 감", house: "친구한테 가기로 집 방문" },
  staffTp: { label: "운영자 순간이동", map: "운영자 순간이동" },
  bail: { label: "맵을 못 열어 마을 정류장으로", map: "맵을 못 열어 마을 정류장으로 돌아감" },
  houseExit: { label: "집 문 앞으로", map: "집 문 앞으로 감" },
  mine: { label: "내 집 가기", house: "내 집 들어감" },
  friendWin: { label: "친구 창 집 버튼", house: "친구 집 방문" },
  list: { label: "분양 사무소 둘러보기·랭킹", house: "분양 사무소에서 집 구경" },
  door: { label: "집 문(E)", house: "집 문으로 들어감" },
  exitDoor: { label: "집 문으로" },
  panel: { label: "창 닫힘·채널 옮기기" },
  reload: { label: "새로고침·다시 접속" },
  channelWin: { label: "채널 창" },
  fishHouse: { label: "집 들어감", fish: "자리 떠남 · 집 들어감" },
  fishRoom: { label: "사냥터·분양 마을 들어감", fish: "자리 떠남 · 사냥터·분양 마을 들어감" },
  fishChannel: { label: "다른 채널로 감", fish: "자리 떠남 · 다른 채널로 감" },
  fishMap: { label: "다른 맵으로 감", fish: "자리 떠남 · 다른 맵으로 감" },
  fishAway: { label: "실내·버스·사냥터에 있음", fish: "자리 떠남 · 실내·버스·사냥터에 있음" },
  fishQuit: { label: "끊겼다 다시 들어옴", fish: "접속이 끊겼다가 다시 들어옴" },
  fishSelf: { label: "직접 끔", fish: "직접 끔 · 움직이거나 일어남" },
  fishCast: { label: "직접 낚시", fish: "직접 낚시를 던짐" },
  fishRestart: { label: "다시 켬", fish: "새로 다시 켬" },
  fishTide: { label: "물때", fish: "물이 빠져 끝남" },
  fishRaftEnd: { label: "좌대 입장권 끝", fish: "좌대 입장권 시간 끝남" },
};
export const UNKNOWN_VIA = "옛 화면이라 버튼 모름";

/** 집 못 들어간 까닭 */
export const NO_LABEL: Record<MoveNo, string> = { offline: "주인이 접속 안 함", big: "몸이 커진 동안" };

/** 사냥터 기록 종류 → 종류 칸 */
export const HUNT_TAG: Record<HuntLogKind, { tag: string; tone: LogTone }> = {
  start: { tag: "입장", tone: "info" },
  leave: { tag: "나옴", tone: "plain" },
  drop: { tag: "튕김", tone: "warn" },
  die: { tag: "쓰러짐", tone: "warn" },
  reward: { tag: "보상", tone: "ok" },
  reject: { tag: "판정 거절", tone: "bad" },
};

// ── 작은 말 ──

const num = (n: number) => n.toLocaleString("ko-KR");
const hhmm = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(11, 16);
const paren = (parts: (string | false | null | undefined)[]) => {
  const p = parts.filter(Boolean);
  return p.length ? ` (${p.join(" · ")})` : "";
};
/** 맵 id·채널 번호 문자열 → 말 */
const spotText = (s: string | undefined): string => (s === undefined ? "?" : isMapId(s) ? MAP_NAME[s] : /^\d+$/.test(s) ? `${s}채널` : s);
const viaOf = (v: MoveVia | undefined) => (v && Object.prototype.hasOwnProperty.call(VIA_LABEL, v) ? VIA_LABEL[v] : null);

/** "phone·카카오톡" → "폰 · 카카오톡" */
export function deviceText(dev: string | undefined): string {
  if (!dev) return "";
  const [kind, app] = dev.split("·");
  return [DEVICE[kind] ?? kind, app].filter(Boolean).join(" · ");
}

const SPOT_LISTS: [MapId, readonly { id: string }[]][] = [
  ["village", FISHING_SPOTS],
  ["camp", CAMP_FISHING_SPOTS],
  ["sea", SEA_FISHING_SPOTS],
];

/** 낚시 자리 id → 「캠핑장 윤슬 낚시터 좌대 4번」·「마을 호수 2번 자리」·「마을 강 배 위」 (모르면 id 그대로) */
export function fishSpotText(spot: string | undefined, raftN?: number): string {
  if (!spot) return "자리 모름";
  const water = anyFishingWaterOf(spot);
  const waterName = water ? WATER_LABEL[water] : null;
  if (Object.prototype.hasOwnProperty.call(BOAT_FISHING_SPOTS, spot)) {
    const boat = waterName?.endsWith("배") ? waterName : `${waterName ?? ""} 배`.trim();
    return `${spot === "boat:reservoir" ? "캠핑장" : "마을"} ${boat} 위`;
  }
  const raft = raftN ?? campRaftOfSpot(spot);
  for (const [map, list] of SPOT_LISTS) {
    const i = list.findIndex((s) => s.id === spot);
    if (i < 0) continue;
    if (raft) return `${MAP_NAME[map]} ${waterName ?? ""} 좌대 ${raft}번`;
    // 같은 맵·같은 물 안에서 몇 번째 자리
    const same = list.filter((s) => anyFishingWaterOf(s.id) === water);
    return `${MAP_NAME[map]} ${waterName ?? ""} ${same.findIndex((s) => s.id === spot) + 1}번 자리`;
  }
  return spot;
}

// ── 사냥 드롭 ──

/** 드롭 한 칸 → 이름 (세트 장비는 부위 이름(세트 · 직급 · 전설), 모르는 id는 그대로) */
export function dropName(kind: string, id: string, days?: number): string {
  if (kind === "set") {
    const it = isSgCode(id) ? (decodeSg(id) ?? itemOfSpec(id, 0)) : null;
    const info = it ? dropInfo({ kind: "set", id }) : null;
    if (it && info) return `${info.name}(${[SG_SET_INFO[SG_SETS[it.s]]?.name, SG_GRADE_NAMES[it.g], it.L ? SG_LEGENDS[it.L]?.name : null].filter(Boolean).join(" · ")})`;
    return id;
  }
  const info = (["gear", "potion", "cosmetic", "mat"] as string[]).includes(kind) ? dropInfo({ kind: kind as DropKind, id }) : null;
  if (!info) return id;
  return kind === "cosmetic" ? `코디 ${info.name}${days ? `(${days}일)` : ""}` : info.name;
}

/** 「아이템 드롭: 막차 놓친 도끼(야근 세트 · 대리급) 1, 결재 서류 14, 물약 2 외 3가지」. 옛 줄(수만 있음)은 「아이템 드롭 N개」 */
export function dropListText(dl: readonly HuntDrop[] | undefined, count: number | undefined, more?: number): string {
  const shown = Array.isArray(dl) ? dl.filter((d) => Array.isArray(d) && typeof d[1] === "string") : [];
  if (!shown.length) return count ? `아이템 드롭 ${num(count)}개` : "아이템 드롭 없음";
  const list = shown.map(([k, id, q, days]) => `${dropName(String(k), id, typeof days === "number" ? days : undefined)} ${num(typeof q === "number" ? q : 1)}`);
  return `아이템 드롭: ${list.join(", ")}${more && more > 0 ? ` 외 ${num(more)}가지` : ""}`;
}

// ── 줄마다 ──

function huntWhere(e: HuntLogEntry): string | undefined {
  if (e.tw) return `${e.tw}층부터`;
  const diff = e.d && e.d in DIFFS ? DIFFS[e.d as keyof typeof DIFFS].name : null;
  const zone = e.zone && isZoneId(e.zone) ? HUNT_ZONES[e.zone].name : (e.zone ?? null);
  return [zone, diff].filter(Boolean).join(" · ") || undefined;
}
const dur = (sec: number | undefined) => (sec ? (sec >= 60 ? `${Math.floor(sec / 60)}분 ${sec % 60}초` : `${sec}초`) : null);

export function huntLine(e: HuntLogEntry): LogLine {
  const t = HUNT_TAG[e.k] ?? { tag: String(e.k), tone: "plain" as const };
  const where = huntWhere(e);
  const base = { tag: t.tag, tone: t.tone };
  switch (e.k) {
    case "start":
      return { ...base, text: e.tw ? `야근 빌딩 입장 (${e.tw}층부터)` : `사냥터 입장${paren([where])}` };
    case "drop":
      return { ...base, text: `사냥 판이 끊김${paren([e.msg ?? "까닭 모름"])}` };
    case "reject":
      return { ...base, text: `서버가 사냥 결과를 거절함: ${e.msg ?? "까닭 모름"}${paren([e.tw ? `야근 빌딩 ${where}` : where, e.code])}` };
    case "reward":
    case "die":
    case "leave": {
      const floors = e.floors ? `${e.floors}층 깸` : null;
      const head = e.k === "reward" ? (e.tw ? "야근 빌딩 마치고 보상 받음" : "사냥 마치고 보상 받음") : e.k === "die" ? (e.tw ? "야근 빌딩에서 쓰러짐" : "사냥 중 쓰러짐") : e.tw ? "야근 빌딩에서 그만두고 나옴" : "사냥터에서 그만두고 나옴";
      const more = [`EXP ${num(e.exp ?? 0)}`, `${num(e.pts ?? 0)}P`, dropListText(e.dl, e.drops, e.dlx)].join(" · ");
      return { ...base, text: `${head}${paren([where, floors, dur(e.sec)])}`, more };
    }
    default:
      return { ...base, text: [where, e.msg].filter(Boolean).join(" · ") || "알 수 없는 사냥터 기록" };
  }
}

/** 다시 접속 줄: 「다른 탭에서 다시 접속, 이전 탭 끊음 (1채널 바닷가 · 서버 맵 유지 · 화면이 보낸 맵: 마을)」 */
function tabLine(e: MoveLogEntry): LogLine {
  const head = e.pch ? "다른 채널 탭에서 들어옴" : e.live ? "다른 탭에서 다시 접속, 이전 탭 끊음" : e.ptab ? "다른 탭에서 다시 접속" : "다시 접속";
  const text = `${head}${paren([e.pch ? `${e.pch}채널에서` : null, `${e.ch ? `${e.ch}채널 ` : ""}${spotText(e.to)}`, "서버 맵 유지", e.ask ? `화면이 보낸 맵: ${spotText(e.ask)}` : null])}`;
  return {
    tag: e.live || e.pch || e.ptab ? "다른 탭" : MOVE_TAG.tab.tag,
    tone: e.live || e.pch || e.ask ? "warn" : "info",
    text,
    ...(e.tab ? { note: `탭 ${e.tab}${e.ptab ? ` ← ${e.ptab}` : ""}` } : {}),
  };
}

/** 11/28 탈것 줄: 「카약 탐 (바닷가 · 2번 카약 · 2인 중 뒷자리)」·「카약에서 내림 (바닷가 · 2번 카약 · 3분 12초 탐)」·「카약 탔다가 바로 내림 (바닷가 · 2번 카약 · 2초)」 */
function rideText(e: MoveLogEntry): string {
  const name = e.ride && Object.prototype.hasOwnProperty.call(RIDE_LABEL, e.ride) ? RIDE_LABEL[e.ride] : "탈것";
  const where = e.map ? spotText(e.map) : null;
  const which = e.n ? `${e.n}번 ${name}` : null;
  const seat = e.seat === 0 || e.seat === 1 ? (e.ride === "duck" ? DUCK_SEAT : RIDE_SEAT)[e.seat] : null;
  const off = e.off ? (RIDE_OFF_LABEL[e.off] ?? e.off) : null;
  if (e.m === "rideOn") return `${name} 탐${paren([where, which, seat])}`;
  if (e.brief) return `${name} 탔다가 바로 내림${paren([where, which, `${num(e.sec ?? 0)}초`, off])}`;
  return `${name}에서 내림${paren([where, which, typeof e.sec === "number" ? `${dur(e.sec) ?? "0초"} 탐` : null, off])}`;
}

function fishCount(e: MoveLogEntry): string | null {
  if (typeof e.fish === "number") return e.fish > 0 ? `${num(e.fish)}마리 정산` : "잡은 것 없음";
  return e.tgt ?? null; // 11/27 옛 줄 「3마리 정산」
}

export function moveLine(e: MoveLogEntry): LogLine {
  const t = MOVE_TAG[e.m] ?? { tag: "동작", tone: "plain" as const };
  const via = viaOf(e.via);
  const viaLabel = via?.label ?? (e.via ? `${e.via}` : null);
  const by = e.src === "c" ? "화면 보고" : null;
  const notes = [by, e.src === "s" ? deviceText(e.dev) : "", e.skip ? `앞서 ${num(e.skip)}줄 건너뜀(너무 잦음)` : ""].filter(Boolean);
  const note = notes.length ? { note: notes.join(" · ") } : {};
  const base = { tag: t.tag, tone: t.tone, ...note };
  switch (e.m) {
    case "map": {
      const from = `${spotText(e.from)}에서`;
      const head = via?.map ? via.map.replace("{to}", spotText(e.to)) : "맵 이동";
      return { ...base, text: `${head} → ${spotText(e.to)}${paren([from, via?.map ? null : (viaLabel ?? UNKNOWN_VIA)])}` };
    }
    case "houseIn": {
      const head = e.mine ? "내 집 들어감" : (via?.house ?? "집 들어감");
      return { ...base, text: `${head}${paren([e.tgt, e.mine || !via?.house ? viaLabel : null])}` };
    }
    case "houseNo":
      return { ...base, text: `집 못 들어감: ${e.no ? (NO_LABEL[e.no] ?? e.no) : "까닭 모름"}${paren([e.tgt, viaLabel])}` };
    case "houseOut": {
      const mine = e.from === "mine";
      return { ...base, text: `${mine ? "내 집" : e.from === "other" ? "남의 집" : "집"}에서 나옴 → ${spotText(e.to)}${paren([mine ? null : "원래 맵으로", e.tgt, viaLabel ?? UNKNOWN_VIA])}` };
    }
    case "channel":
      // 채널 창·집 채널로 옮기기 모두 같은 길이라 버튼 이름이 없을 수 있다
      return { ...base, text: `채널 옮김 ${spotText(e.from)} → ${spotText(e.to)}${paren([viaLabel])}` };
    case "tab": {
      const l = tabLine(e);
      return notes.length ? { ...l, note: [l.note, ...notes].filter(Boolean).join(" · ") } : l;
    }
    case "fishStart":
      return { ...base, text: `자동 낚시 시작${paren([fishSpotText(e.spot, e.n), e.ch ? `${e.ch}채널` : null, e.until ? `입장권 ${hhmm(e.until)}까지` : null])}` };
    case "fishStop":
      return { ...base, text: `자동 낚시 해제${paren([via?.fish ?? viaLabel ?? "까닭 모름", e.spot ? fishSpotText(e.spot, e.n) : null, fishCount(e)])}` };
    case "raftBuy":
    case "raftRenew": {
      const buy = e.m === "raftBuy";
      return {
        ...base,
        text: `좌대 입장권 ${buy ? "구매" : "연장"}${paren([`${e.ch ?? "?"}채널 ${e.n ?? "?"}번 좌대`, e.min ? `${buy ? "" : "+"}${num(e.min)}분` : null, typeof e.pts === "number" ? `${num(e.pts)}P` : null, e.until ? `${hhmm(e.until)}까지` : null])}`,
      };
    }
    case "rideOn":
    case "rideOff":
      return { ...base, text: rideText(e) };
    case "raftOut": {
      const r = e.out && Object.prototype.hasOwnProperty.call(RAFT_OUT_LABEL, e.out) ? RAFT_OUT_LABEL[e.out] : null;
      return { ...base, tone: r?.tone ?? base.tone, text: `${r?.head ?? "좌대에서 내려옴"}${paren([`${e.ch ?? "?"}채널 ${e.n ?? "?"}번 좌대`, r?.why ?? e.out])}` };
    }
    default:
      return { ...base, text: `${String(e.m)}${paren([viaLabel])}` };
  }
}

export function connLine(e: ConnLogEntry): LogLine {
  const t = CONN_TAG[e.k] ?? { tag: String(e.k), tone: "plain" as const };
  const where = [e.ch ? `${e.ch}채널` : "", deviceText(e.dev)].filter(Boolean);
  if (e.k === "in") return { ...t, text: `게임 접속${paren(where)}` };
  if (e.k === "err") return { ...t, text: e.msg ?? "오류 (내용 없음)" };
  const why = (e.why ?? "drop") as ConnWhy;
  return { tag: t.tag, tone: CONN_ABNORMAL.includes(why) ? "warn" : "plain", text: `게임 나감: ${CONN_WHY_LABEL[why] ?? why}${paren(where)}` };
}

/** 기록 한 줄 → 문장 (어떤 모양이 와도 던지지 않는다 — 깨진 옛 줄은 「알 수 없는 기록」) */
export function describeLog(list: LogList, e: LogEntry): LogLine {
  try {
    if (list === "hunt") return huntLine(e as HuntLogEntry);
    if (e.k === "mv") return moveLine(e as MoveLogEntry);
    return connLine(e as ConnLogEntry);
  } catch {
    return { tag: "?", tone: "plain", text: "알 수 없는 기록" };
  }
}
