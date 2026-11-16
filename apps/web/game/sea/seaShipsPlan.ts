import { SEA_HEIGHT, SEA_WIDTH } from "@tomb/protocol";

// 11/16 r15 사용자: 먼바다 풍경 (그림·소리만 — 서버·저장 없음). 순수 계산이라 시험(seaShipsPlan.test)으로 봐요.
//  - 먼 배: 몇 분마다 큰 유조선·컨테이너선·고깃배가 먼바다 띠를 천천히 가로질러요. 시각 칸(SHIP_SLOT_MS)마다
//    해시로 정해서 같은 채널 사람들은 거의 같은 배를 봐요 (각자 벽시계라 몇 초 어긋날 수 있어요). 가끔 뱃고동
//  - 오징어잡이배: 해 진 뒤 먼바다에 3~4척, 줄줄이 매단 등불. 10분마다 조금씩 자리를 옮겨요 (밤마다 다른 자리)

export type ShipKind = "tanker" | "cargo" | "fishing";
export type ShipPass = {
  /** 시각 칸 번호 */
  slot: number;
  kind: ShipKind;
  /** 1 = 서→동, -1 = 동→서 */
  dir: 1 | -1;
  /** 지나가는 줄 (지도 y — 먼바다 띠) */
  y: number;
  /** 출발 시각 (ms) */
  t0: number;
  /** px/s */
  speed: number;
  /** 뱃고동 울리는 때 (t0부터 ms, 없으면 -1) */
  horn: number;
};

/** 시각 칸 (4분). 칸마다 배가 한 척 지나가거나 (70%) 없어요 */
export const SHIP_SLOT_MS = 240_000;
/** 먼바다 띠 (지도 맨 아래 — 놀거리·헤엄 자리보다 바깥) */
export const SHIP_LANE_Y0 = SEA_HEIGHT - 96;
export const SHIP_LANE_Y1 = SEA_HEIGHT - 28;
/** 배 길이 반 (화면 밖에서 들어와 화면 밖으로 나가요) */
export const SHIP_HALF = 80;

function hash(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function shipPassOf(slot: number): ShipPass | null {
  if (hash(slot, 1) >= 0.7) return null;
  const k = hash(slot, 2);
  const kind: ShipKind = k < 0.38 ? "tanker" : k < 0.76 ? "cargo" : "fishing";
  const dir: 1 | -1 = hash(slot, 3) < 0.5 ? 1 : -1;
  const y = Math.round(SHIP_LANE_Y0 + hash(slot, 4) * (SHIP_LANE_Y1 - SHIP_LANE_Y0));
  // 큰 배는 느리게 (지도 폭 + 앞뒤를 3~4분에), 고깃배는 조금 빨리
  const speed = kind === "fishing" ? 14 + hash(slot, 5) * 4 : 9 + hash(slot, 5) * 2.5;
  const t0 = slot * SHIP_SLOT_MS + Math.floor(hash(slot, 6) * 30_000);
  const span = ((SEA_WIDTH + SHIP_HALF * 2) / speed) * 1000;
  const horn = hash(slot, 7) < 0.6 ? Math.floor(span * (0.3 + hash(slot, 8) * 0.4)) : -1;
  return { slot, kind, dir, y, t0, speed, horn };
}

/** 지도 x (배 가운데). 아직 안 왔거나 지나갔으면 null */
export function shipX(p: ShipPass, now: number): number | null {
  const s = (now - p.t0) / 1000;
  if (s < 0) return null;
  const d = s * p.speed;
  const x = p.dir > 0 ? -SHIP_HALF + d : SEA_WIDTH + SHIP_HALF - d;
  if (x < -SHIP_HALF || x > SEA_WIDTH + SHIP_HALF) return null;
  return x;
}

/** 지금 먼바다를 지나가는 배들 (앞 칸들에서 출발해 아직 지나는 배 포함) */
export function shipsAt(now: number): { pass: ShipPass; x: number }[] {
  const out: { pass: ShipPass; x: number }[] = [];
  const cur = Math.floor(now / SHIP_SLOT_MS);
  for (let s = cur - 2; s <= cur; s++) {
    const p = shipPassOf(s);
    if (!p) continue;
    const x = shipX(p, now);
    if (x !== null) out.push({ pass: p, x });
  }
  return out;
}

// ── 오징어잡이배 ──
/** 자리를 옮기는 간격 (10분) · 옮기는 데 걸리는 시간 */
export const SQUID_SEG_MS = 600_000;
const SQUID_MOVE_MS = 90_000;
/** 한국 날짜 (밤마다 다른 배 수·자리 — 자정을 넘겨도 같은 밤이게 정오 기준) */
function nightOf(now: number): number {
  return Math.floor((now + 9 * 3600_000 - 12 * 3600_000) / 86_400_000);
}
export function squidCount(now: number): number {
  return 3 + (hash(nightOf(now), 11) < 0.5 ? 1 : 0);
}
function squidAnchor(night: number, i: number, seg: number): { x: number; y: number } {
  // 배마다 맡은 폭 안에서 (서로 겹치지 않게)
  const n = 4;
  const band = SEA_WIDTH / n;
  return {
    x: Math.round(band * i + band * 0.2 + hash(night * 31 + i, seg) * band * 0.6),
    y: Math.round(SHIP_LANE_Y0 - 20 + hash(night * 17 + i, seg + 7) * (SHIP_LANE_Y1 - SHIP_LANE_Y0 + 10)),
  };
}
/** 오징어잡이배 자리들 (밤이 아니어도 계산은 해요 — 보일지는 그리는 쪽이 어둠으로 정해요) */
export function squidBoatsAt(now: number): { x: number; y: number; i: number }[] {
  const night = nightOf(now);
  const seg = Math.floor(now / SQUID_SEG_MS);
  const into = now - seg * SQUID_SEG_MS;
  const k = Math.min(1, into / SQUID_MOVE_MS);
  const e = k * k * (3 - 2 * k);
  const out: { x: number; y: number; i: number }[] = [];
  const order = [0, 2, 1, 3];
  for (let j = 0; j < squidCount(now); j++) {
    const i = order[j];
    const a = squidAnchor(night, i, seg - 1);
    const b = squidAnchor(night, i, seg);
    out.push({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, i });
  }
  return out;
}
