import type { BusLeg, BusRoute } from "./busTypes";

// 버스 창밖 연출(BusRideScene)의 순수 계산 — 시간 → 달린 거리·구간·섞기·흔들림·자막. Phaser 없음 (busRide.test.ts).
// 거리는 0..1 비율. 출발할 때 천천히 붙는 속도, 끝에 정류장 앞에서 멈춘다 (속도 = 사다리꼴, 가속·감속은 부드럽게).

/** 11/16 coast = 해송 숲·모래 언덕 사이로 바다가 언뜻 보이는 길, sea = 탁 트인 바닷길 (방파제·등대·고깃배·갈매기) */
export type RideSegment = "village" | "highway" | "maple" | "forest" | "coast" | "sea";

/** 가는 길 순서 (돌아오는 길은 반대) — 캠핑장 노선 */
export const RIDE_ORDER: readonly RideSegment[] = ["village", "highway", "maple", "forest"];
/** 11/16 바닷가 노선 가는 길 순서 */
export const SEA_RIDE_ORDER: readonly RideSegment[] = ["village", "highway", "coast", "sea"];

/** 노선의 가는 길 순서 (그림은 늘 이 순서로 구워요) */
export function rideOrder(route: BusRoute = "camp"): readonly RideSegment[] {
  return route === "sea" ? SEA_RIDE_ORDER : RIDE_ORDER;
}

/**
 * 11/16 그림을 굽는 순서 (파노라마 왼쪽 끝 → 오른쪽 끝). 캠핑장은 가는 길 순서 그대로, 바닷가는 거꾸로 (바다가 왼쪽 끝).
 * 마을 바닷가행 정류장은 버스가 왼쪽에서 들어와 오른쪽으로, 포구 정류장은 오른쪽에서 들어와요 → 창밖은 캠핑장 노선과 반대로 흘러야 해서
 * 바닷가 그림은 반대로 굽고 반대로 훑어요 (글씨가 든 그림을 뒤집지 않고 흐르는 쪽만 바꿔요)
 */
export function bakeOrder(route: BusRoute = "camp"): readonly RideSegment[] {
  return route === "sea" ? [...SEA_RIDE_ORDER].reverse() : RIDE_ORDER;
}

/** 11/16 파노라마를 오른쪽 끝에서 왼쪽으로 훑는지 (= 창밖 풍경이 오른쪽으로 흘러요). 캠핑장은 돌아오는 길, 바닷가는 가는 길 */
export function rideReversed(leg: BusLeg, route: BusRoute = "camp"): boolean {
  return (leg === "toVillage") !== (route === "sea");
}

export function segmentsFor(leg: BusLeg, route: BusRoute = "camp"): readonly RideSegment[] {
  const order = rideOrder(route);
  return leg === "toCamp" ? order : [...order].reverse();
}

/** 출발 가속 시간 비율 · 도착 감속 시간 비율 (전체 시간에 대해) */
export const ACCEL_FRAC = 0.1;
export const DECEL_FRAC = 0.22;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * 속도 0..1 (최고 속도 = 1). 가속·감속 구간은 smoothstep으로 부드럽게.
 * f = 경과 비율 0..1
 */
export function speedAt(f: number): number {
  const t = clamp01(f);
  if (t < ACCEL_FRAC) {
    const u = t / ACCEL_FRAC;
    return u * u * (3 - 2 * u);
  }
  if (t > 1 - DECEL_FRAC) {
    const u = (1 - t) / DECEL_FRAC;
    return u * u * (3 - 2 * u);
  }
  return 1;
}

/** 수치 적분용 칸 수 (작은 표를 한 번만 만든다) */
const STEPS = 400;
const TABLE: Float64Array = (() => {
  const out = new Float64Array(STEPS + 1);
  let acc = 0;
  for (let i = 1; i <= STEPS; i++) {
    const a = speedAt((i - 1) / STEPS);
    const b = speedAt(i / STEPS);
    acc += (a + b) / 2;
    out[i] = acc;
  }
  for (let i = 0; i <= STEPS; i++) out[i] /= acc;
  return out;
})();

/** 달린 거리 비율 0..1 (f = 경과 비율). 단조 증가, f=1이면 1 */
export function distanceAt(f: number): number {
  const t = clamp01(f) * STEPS;
  const i = Math.floor(t);
  if (i >= STEPS) return 1;
  const k = t - i;
  return TABLE[i] + (TABLE[i + 1] - TABLE[i]) * k;
}

/** 구간 사이를 섞는 폭 (거리 비율, 경계 앞뒤 절반씩) */
export const BLEND = 0.08;

/**
 * 거리 비율 → 지금 구간(0..3)과 다음 구간으로 넘어가는 섞기 비율.
 * 경계 근처(BLEND)에서만 0→1로 바뀌고, 그 밖에서는 0 (마지막 구간은 섞지 않는다)
 */
export function segmentAt(d: number): { index: number; local: number; blend: number } {
  const x = clamp01(d) * 4;
  const index = Math.min(3, Math.floor(x));
  const local = x - index;
  if (index >= 3) return { index, local, blend: 0 };
  const w = BLEND * 4; // 구간 하나 안에서의 폭
  const start = 1 - w / 2;
  const blend = local <= start ? 0 : clamp01((local - start) / w);
  return { index, local, blend };
}

/** 버스 흔들림 (화면 px). 달리는 속도에 비례, reduced면 0 */
export function shakeAt(ms: number, f: number, reduced: boolean): number {
  if (reduced) return 0;
  const v = speedAt(f);
  // 노면 요철: 두 주기를 섞어 규칙적이지 않게 (최대 약 2px)
  const s = Math.sin(ms * 0.031) * 0.7 + Math.sin(ms * 0.0113 + 1.3) * 0.5 + (Math.sin(ms * 0.0071) > 0.93 ? 0.8 : 0);
  return Math.round(s * v * 1.2);
}

/** 밤·노을처럼 창밖에 불빛(가로등·창문·차 불빛)이 켜지는 시각인지 */
export function lightsOn(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 17.5 || h < 6.5;
}

/** 밤하늘 별이 보이는지 */
export function starsOn(hour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  return h >= 19.5 || h < 5;
}

/** 자막 한 줄 (해요체, 짧게). 처음 2.4초는 출발 안내, 마지막 2.8초는 다음 정류장, 그 사이는 없다 */
export function captionAt(ms: number, total: number, leg: BusLeg, route: BusRoute = "camp"): string | null {
  const sea = route === "sea";
  if (ms < 2400) return leg === "toCamp" ? (sea ? "달물결 포구행 버스가 출발해요." : "언젠가 캠핑장행 버스가 출발해요.") : "기억숲 마을로 돌아가는 버스예요.";
  if (ms > total - 2800) return leg === "toCamp" ? (sea ? "다음 정류장은 달물결 포구예요." : "다음 정류장은 언젠가 캠핑장이에요.") : "다음 정류장은 기억숲 마을이에요.";
  return null;
}

/** 자막 투명도 (나타나고 사라질 때 0.3초씩 흐리게) */
export function captionAlpha(ms: number, total: number): number {
  const fade = 300;
  if (ms < 2400) return clamp01(Math.min(ms / fade, (2400 - ms) / fade));
  const s = total - 2800;
  if (ms > s) return clamp01(Math.min((ms - s) / fade, 1));
  return 0;
}

/** 손잡이 흔들림 각도 (도). 가속하면 뒤로, 감속하면 앞으로 쏠린다 */
export function strapAngle(ms: number, f: number, reduced: boolean): number {
  if (reduced) return 0;
  const accel = f < ACCEL_FRAC ? -1 : f > 1 - DECEL_FRAC ? 1 : 0;
  return accel * 9 * (1 - Math.abs(0.5 - speedAt(f)) * 0.6) + Math.sin(ms * 0.004) * 3 * speedAt(f);
}

// ── 창밖 하늘색 (한국 시각) ── 게임 배경 하늘(lib/ambience)은 유령 마을이라 낮에도 어둡다. 버스 창밖은 더 밝고 맑게 따로 둔다.
type SkyKey = { h: number; top: number; bottom: number };
const SKY_KEYS: readonly SkyKey[] = [
  { h: 0, top: 0x0e1222, bottom: 0x26304a },
  { h: 4.6, top: 0x10142a, bottom: 0x2a3050 },
  { h: 6, top: 0x5a5a8e, bottom: 0xe8b090 },
  { h: 8, top: 0x7aa8d8, bottom: 0xcadcea },
  { h: 16.4, top: 0x78a2d2, bottom: 0xd8dce0 },
  { h: 18.2, top: 0x4a3a6e, bottom: 0xec9a58 },
  { h: 19.8, top: 0x141830, bottom: 0x3a3450 },
  { h: 24, top: 0x0e1222, bottom: 0x26304a },
];

function mixRgb(a: number, b: number, t: number): number {
  const ch = (s: number) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * t)) << s;
  return (ch(16) | ch(8) | ch(0)) >>> 0;
}

/** 하늘 위·아래 색 (0xRRGGBB). overcast 0..1 = 흐림·비 (회색 쪽으로) */
export function skyColors(hour: number, overcast = 0): { top: number; bottom: number } {
  const h = ((hour % 24) + 24) % 24;
  let i = 1;
  while (i < SKY_KEYS.length - 1 && SKY_KEYS[i].h <= h) i++;
  const a = SKY_KEYS[i - 1];
  const b = SKY_KEYS[i];
  const t = (h - a.h) / (b.h - a.h);
  const top = mixRgb(a.top, b.top, t);
  const bottom = mixRgb(a.bottom, b.bottom, t);
  const k = Math.max(0, Math.min(1, overcast)) * 0.45;
  const gray = (c: number) => {
    const l = Math.round((((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) * 0.9);
    return mixRgb(c, (l << 16) | (l << 8) | l, k);
  };
  return { top: gray(top), bottom: gray(bottom) };
}
