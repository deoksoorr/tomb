import { CAMP_PIER, CAMP_RAFTS, CAMP_RAFT_SEAT_DY, campRaftDeck, campRaftSeatDx, campRaftWalks } from "./camp";

// 11/27 좌대 입장권 (캠핑장 윤슬 낚시터 좌대 1~6). 웹(판매·자동 낚시)·실시간 서버(마루 막기)·화면이 같이 쓰는 규칙.
//  - 입장권 = 그 채널의 좌대 번호 하나, 2시간. 한 사람 한 장. 값 270P
//  - 하루(KST) 좌대 시간은 계정마다 4시간까지 (산 시간 전체를 센다 — 일찍 나가도 돌려주지 않는다). 남은 시간이 2시간보다 짧으면 그만큼만 팔고 값도 분 단위로 줄인다
//  - 연장: 끝나기 1분 전부터만, 한 장에 두 번까지. 놓치면 끝날 때 좌대에서 내려지고, 끝난 뒤 10분은 그 채널 좌대를 다시 못 산다
//  - 입장권이 없으면 좌대 마루에 못 올라간다 (판자 다리·잔교·헤엄은 그대로). 남의 좌대도 마찬가지
//  - 내 좌대에서 켠 자동 낚시는 15초마다 찌를 올린다 (걸릴 확률 25%는 그대로)

export const RAFT_NUMS = [1, 2, 3, 4, 5, 6] as const;
/** 입장권 한 장 길이 */
export const RAFT_TICKET_MIN = 120;
export const RAFT_TICKET_MS = RAFT_TICKET_MIN * 60_000;
/** 2시간 한 장 값 */
export const RAFT_PRICE = 270;
/** 2시간보다 짧게 팔 때 가장 싼 값 */
export const RAFT_PRICE_MIN = 30;
/** 연장 버튼이 뜨는 때 (끝나기 전) */
export const RAFT_RENEW_WINDOW_MS = 60_000;
/** 한 장에 연장할 수 있는 횟수 (11/28 하루 4시간 = 한 장 + 연장 한 번. 2번이면 자정을 넘겨 6시간 이어 앉을 수 있었다) */
export const RAFT_RENEW_MAX = 1;
/** 끝난 뒤 같은 채널 좌대를 다시 못 사는 시간 */
export const RAFT_REBUY_WAIT_MS = 10 * 60_000;
/** 하루(KST) 계정마다 쓸 수 있는 좌대 시간 (분) */
export const RAFT_DAILY_MIN = 240;
/** 내 좌대 자동 낚시 간격 (web lib/forage/auto AUTO_FISH_EVERY_MS 30초의 절반 — 실시간 서버는 web을 못 읽어 숫자로 둔다) */
export const RAFT_AUTO_EVERY_MS = 15_000;
/** 끝나는 시각에서 이만큼 뒤에 내려보낸다 (연장 증서가 오가는 사이) */
export const RAFT_EJECT_GRACE_MS = 2_000;

export const isRaftNum = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 6;

/** 오늘 남은 좌대 시간(분)으로 이번에 살 수 있는 길이(분). 0이면 못 산다 */
export const raftGrantMin = (leftMin: number): number => Math.max(0, Math.min(RAFT_TICKET_MIN, Math.floor(leftMin)));

/** 그 길이(분)의 값: 2시간이면 270P, 짧으면 분 비례(10P 단위 반올림, 최소 30P) */
export function raftPriceFor(min: number): number {
  if (min >= RAFT_TICKET_MIN) return RAFT_PRICE;
  if (min <= 0) return 0;
  return Math.max(RAFT_PRICE_MIN, Math.round((RAFT_PRICE * min) / RAFT_TICKET_MIN / 10) * 10);
}

/** 「3:12」 (분 → 시:분) */
export function raftHm(min: number): string {
  const m = Math.max(0, Math.floor(min));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

const inRect = (r: { x: number; y: number; w: number; h: number }, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

/** (x,y)가 몇 번 좌대 마루 위인지 (판자 다리·사다리 칸은 아님). 아니면 null */
export function campRaftAt(x: number, y: number): number | null {
  for (const r of CAMP_RAFTS) if (inRect(campRaftDeck(r), x, y)) return r.n;
  return null;
}

// 처음 쓸 때 만든다 (모듈을 읽는 순간 camp.ts를 쓰면 grants → raft → camp 순환 import에서 camp가 아직 비어 있다 — 11/27 로컬 서버가 이걸로 멈췄다)
let spotRaft: Map<string, number> | null = null;
const spotMap = (): Map<string, number> =>
  (spotRaft ??= new Map<string, number>(CAMP_RAFTS.map((r) => [`f_${r.x + campRaftSeatDx(r)}_${r.y + CAMP_RAFT_SEAT_DY}`, r.n] as [string, number])));
/** 좌대 낚시 자리 id → 좌대 번호 (좌대 자리가 아니면 null) */
export const campRaftOfSpot = (spotId: string): number | null => spotMap().get(spotId) ?? null;
/** 그 좌대의 낚시 자리 id (11/27 의자 하나) */
export const campRaftSpots = (n: number): string[] => [...spotMap()].filter(([, k]) => k === n).map(([id]) => id);

/**
 * 좌대에서 내려보낼 자리: 1~3(잔교에 붙은 줄) = 가까운 판자 다리 가운데, 4~6 = 사다리 밑 물속 (헤엄).
 * from이 있으면 그쪽에 가까운 다리로
 */
export function campRaftExit(n: number, from?: { x: number; y: number }): { x: number; y: number; swim: boolean } {
  const r = CAMP_RAFTS.find((q) => q.n === n) ?? CAMP_RAFTS[0];
  if (!r.link) return { x: r.x, y: r.y + 9, swim: true };
  const walks = campRaftWalks(r);
  if (!walks.length) return { x: r.x, y: CAMP_PIER.y, swim: false };
  const fx = from?.x ?? r.x;
  const w = walks.reduce((a, b) => (Math.abs(b.x + b.w / 2 - fx) < Math.abs(a.x + a.w / 2 - fx) ? b : a));
  return { x: Math.round(w.x + w.w / 2), y: Math.round(w.y + w.h / 2), swim: false };
}

/** 실시간 서버가 캠핑장 사람에게 보내는 좌대 주인 표 한 줄 (이름표·낚싯대 그림용). u = 끝나는 시각 */
export type RaftBoardEntry = { n: number; name: string; u: number };

export function isRaftBoard(v: unknown): v is RaftBoardEntry[] {
  return Array.isArray(v) && v.length <= 6 && v.every((e) => e && typeof e === "object" && isRaftNum((e as RaftBoardEntry).n) && typeof (e as RaftBoardEntry).name === "string" && (e as RaftBoardEntry).name.length <= 40 && typeof (e as RaftBoardEntry).u === "number" && Number.isFinite((e as RaftBoardEntry).u));
}

/** 서버가 좌대에서 내려보낸 까닭: ticket = 입장권 없이 올라가려 함, end = 시간이 끝남, sold = 그 좌대가 막 팔림 */
export type RaftOutWhy = "ticket" | "end" | "sold";

/** 내려보낸 까닭 → 한 줄 안내 */
export function raftOutText(n: number, why: RaftOutWhy): string {
  if (why === "end") return "입장권 시간이 끝나 좌대에서 내려왔어요.";
  if (why === "sold") return `${n}번 좌대 입장권을 산 사람이 있어 내려왔어요.`;
  return `입장권이 있어야 ${n}번 좌대에 올라갈 수 있어요.`;
}

// ── 좌대 전용 코디 (11/27 그림 확정 — web game/sprites/raftGear.ts, 카탈로그 items.ts raft: true) ──
/** 11/27 좌대 전용 코디가 나오는지 (false면 굴려도 늘 없음) */
export const RAFT_GEAR_ON = true;
/** 내 좌대 자동 낚시로 한 마리 걸릴 때마다 단계별 확률 (웹 서버가 정산 때 굴린다 — lib/raft/gear) */
export const RAFT_GEAR_ODDS = { d7: 1 / 7_000, d30: 1 / 35_000, perm: 1 / 200_000 } as const;
export type RaftGearTier = "d7" | "d30" | "perm";
export const RAFT_GEAR_TIER_DAYS: Record<Exclude<RaftGearTier, "perm">, number> = { d7: 7, d30: 30 };
export const RAFT_GEAR_TIER_NAME: Record<RaftGearTier, string> = { d7: "7일", d30: "30일", perm: "영구" };
/**
 * 좌대 전용 코디 (11/27 시안 확정 — ~/Desktop/목요일작업/좌대시안, 그림 web game/sprites/raftGear.ts). 단계마다 나오는 것이 다르다:
 * 7일 = 붕어 털모자 · 30일 = 좌대 낚시 조끼·월척 뜰채 · 영구 = 물빛 삿갓·금방울 찌 목걸이·물빛 가슴장화·황금 월척 망토 (넷이 한 벌).
 * 카탈로그는 items.ts (raft: true — 상점에 없다). 카탈로그에 없는 id는 나와도 주지 않는다 (lib/raft/gear)
 * slot = items.ts CosmeticSlot (back = 옷, pack = 등)
 */
export const RAFT_GEAR = [
  { id: "jw_carphat", name: "붕어 털모자", slot: "head", tier: "d7" },
  { id: "jw_vest", name: "좌대 낚시 조끼", slot: "back", tier: "d30" },
  { id: "jw_net", name: "월척 뜰채", slot: "pack", tier: "d30" },
  { id: "jw_sedge", name: "물빛 삿갓", slot: "head", tier: "perm" },
  { id: "jw_bell", name: "금방울 찌 목걸이", slot: "neck", tier: "perm" },
  { id: "jw_waders", name: "물빛 가슴장화", slot: "back", tier: "perm" },
  { id: "jw_cape", name: "황금 월척 망토", slot: "pack", tier: "perm" },
] as const satisfies readonly { id: string; name: string; slot: string; tier: RaftGearTier }[];
export type RaftGearId = (typeof RAFT_GEAR)[number]["id"];
export const RAFT_GEAR_IDS: readonly RaftGearId[] = RAFT_GEAR.map((g) => g.id);
/** 영구 한 벌 (넷을 함께 입으면 세트 연출 「금빛 월척」 + 칭호 「좌대의 전설」) */
export const RAFT_SET_IDS: readonly RaftGearId[] = RAFT_GEAR.filter((g) => g.tier === "perm").map((g) => g.id);
export const RAFT_SET_NAME = "금빛 월척";
/** 그 단계에서 나올 수 있는 코디 */
export const raftGearOfTier = (tier: RaftGearTier): RaftGearId[] => RAFT_GEAR.filter((g) => g.tier === tier).map((g) => g.id);
export const RAFT_SLOT_NAME: Readonly<Record<string, string>> = { head: "머리", neck: "목", back: "옷", pack: "등" };
export const isRaftGearId = (id: string): id is RaftGearId => (RAFT_GEAR_IDS as readonly string[]).includes(id);

/** 한 번 굴린 값 x(0~1)로 단계: 영구 → 30일 → 7일 순으로 아래부터. on = 그림 확정 여부 */
export function raftGearTier(x: number, on: boolean = RAFT_GEAR_ON): RaftGearTier | null {
  if (!on) return null;
  const o = RAFT_GEAR_ODDS;
  if (x < o.perm) return "perm";
  if (x < o.perm + o.d30) return "d30";
  if (x < o.perm + o.d30 + o.d7) return "d7";
  return null;
}

/** 좌대 영구 한 벌 넷을 함께 입었다 (착용 목록만 본다 — 영구 한 벌은 영구로만 나와서 입었으면 영구) — 세트 연출 「금빛 월척」 */
export function raftSetWorn(look: readonly string[]): boolean {
  return RAFT_SET_IDS.every((id) => look.includes(id));
}
