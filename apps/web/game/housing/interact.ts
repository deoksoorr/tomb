import { DIR, spotSeatId, type DirId, type SpotKind } from "@tomb/protocol";
import { furnitureById, type FurnitureDef } from "@/lib/housing/catalog";
import { buildOccupancy, footprint, SPIN_R0, spinDir, type TierShape } from "@/lib/housing/layout";
import type { RoomPlan } from "@/lib/housing/rooms";
import type { Placed } from "@/lib/housing/types";

// 3번 집 안 가구 상호작용 규칙 (Phaser 없이 테스트한다).
//  - 1인 자리(HouseSpot): 의자·소파·책상·피아노에 앉기, 침대에 눕기, 책장 앞에서 읽기, 욕조에 들어가기.
//    id = protocol spotSeatId(종류, 앵커 x, y) — 서버가 의자처럼 "한 자리 한 명"을 판정한다 (방 좌석, SPOT_KINDS indoor).
//    앵커 = 그 자리를 차지한 캐릭터의 발 위치 (집 씬 월드 좌표). 같은 배치면 모두의 화면에서 같은 id가 나온다.
//  - 쓰기(HouseUsable): 서서 E 한 번 — 라디오·벽난로·스탠드·냉장고·고양이·커피·자판기·풍경·시계·화분·창문.
//    결과는 방 사람들에게 use 이벤트(u = 배치 id 또는 창문 "w0"…, a = 값)로 알린다.

export const T = 16;

export type UseKind =
  | "sit"
  | "type"
  | "piano"
  | "lie"
  | "read"
  | "bath"
  | "radio"
  | "fire"
  | "lamp"
  | "fridge"
  | "pet"
  | "coffee"
  | "vend"
  | "chime"
  | "clock"
  | "water"
  | "window"
  // ── 모든 가구 상호작용 (자리 없이 서서 E: 바닥 앉기·연출만. 포인트·아이템은 주지 않는다) ──
  | "dip"
  | "lean"
  | "rug"
  | "smell"
  | "tea"
  | "scribble"
  | "memo"
  | "squeak"
  | "straighten"
  | "rummage"
  | "spore"
  | "light"
  | "firefly"
  | "pray";

/** 집 씬에서 칸 (0,0)의 왼쪽 위 월드 좌표 */
export type Frame = { ox: number; oy: number };
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export type HouseSpot = {
  id: string;
  kind: SpotKind;
  use: UseKind;
  /** 가구 배치 id */
  u: string;
  x: number;
  y: number;
  facing: DirId;
  /** 앵커가 가구 차지 칸 안이면 true (소파·침대·욕조). 밖이면 가구 앞 (책상·피아노·책장) */
  inside: boolean;
  /** 누운 자세 그림을 이만큼(도) 기울인다: 돌린 침대에서 머리가 베개 쪽으로 (발 = 앵커 기준) */
  tilt?: number;
  /** 가구 그림이 사람 앞에 그려진다 (뒤돌아 앉은 의자: 등받이가 앞) */
  behind?: boolean;
};

export type HouseTarget = {
  /** 고유 키 (자리 id 또는 "u:{배치 id}"·"w:{창 번호}") */
  key: string;
  use: UseKind;
  /** use 이벤트 대상 (배치 id 또는 "w0"…) */
  u: string;
  item: string;
  /** 다가가야 하는 범위 (발 위치가 이 사각형에서 NEAR 안이면 쓸 수 있다) */
  rect: Rect;
  spot?: HouseSpot;
  /** 바닥 물건: 같은 거리면 다른 가구를 먼저 */
  low?: boolean;
};

/** 서서 E로 쓰는 가구 */
const USE_OF: Readonly<Record<string, UseKind>> = {
  radio: "radio",
  fireplace: "fire",
  floor_lamp: "lamp",
  fridge: "fridge",
  cat_cushion: "pet",
  ghost_cat: "pet",
  coffee_machine: "coffee",
  server_rack: "vend",
  wind_chime: "chime",
  grand_clock: "clock",
  pot: "water",
  pond: "dip",
  tree: "lean",
  rug: "rug",
  flowerbed: "smell",
  table: "tea",
  whiteboard: "scribble",
  postit_wall: "memo",
  duck_shelf: "squeak",
  frame_404: "straighten",
  bush: "rummage",
  mushrooms: "spore",
  stone_lantern: "light",
  candles: "light",
  firefly_jar: "firefly",
  memorial: "pray",
};

/** 바닥에 깔린 물건(러그·꽃밭)은 위에 다른 가구가 있으면 그 가구를 먼저 고르게 조금 멀게 친다 */
const LOW_PRIORITY: ReadonlySet<UseKind> = new Set(["rug", "smell"]);

/** 앞에 앉아서 쓰는 가구 (의자가 바로 앞에 있으면 그 의자가 이 일을 한다) */
const SIT_AT: Readonly<Record<string, UseKind>> = { desk: "type", monitor_desk: "type", piano: "piano" };

/** E 안내 문구 */
export const USE_LABEL: Readonly<Record<UseKind, string>> = {
  sit: "앉기",
  type: "앉아서 일하기",
  piano: "피아노 앞에 앉기",
  lie: "눕기",
  read: "책 꺼내 읽기",
  bath: "욕조에 들어가기",
  radio: "라디오 채널 돌리기",
  fire: "벽난로 불 켜기",
  lamp: "스탠드 켜기",
  fridge: "냉장고 열기",
  pet: "쓰다듬기",
  coffee: "커피 내리기",
  vend: "음료 뽑기",
  chime: "풍경 흔들기",
  clock: "시간 보기",
  water: "물 주기",
  window: "창문 열기",
  dip: "연못가에 앉아 발 담그기",
  lean: "나무에 기대어 앉기",
  rug: "러그에 앉기",
  smell: "꽃밭에 앉아 향기 맡기",
  tea: "차 한 잔 마시기",
  scribble: "화이트보드에 끄적이기",
  memo: "메모 붙이기",
  squeak: "오리 꾹 누르기",
  straighten: "액자 바로잡기",
  rummage: "덤불 뒤지기",
  spore: "버섯 톡 건드리기",
  light: "불 끄기",
  firefly: "병뚜껑 열기",
  pray: "꽃 놓고 묵념하기",
};

/** 가까이 있다고 보는 거리 (발 위치 ↔ 대상 사각형, px) */
export const NEAR = 14;

/** turn 가구의 r → 앉은 사람이 보는 방향 (그림의 등받이가 위 → 오른쪽 → 아래 → 왼쪽으로 돈다) */
const FACE_BY_R: readonly DirId[] = [DIR.down, DIR.left, DIR.up, DIR.right];

const spot = (kind: SpotKind, use: UseKind, u: string, x: number, y: number, facing: DirId, inside: boolean, extra: Pick<HouseSpot, "tilt" | "behind"> = {}): HouseSpot => {
  const ax = Math.round(x);
  const ay = Math.round(y);
  return { id: spotSeatId(kind, ax, ay), kind, use, u, x: ax, y: ay, facing, inside, ...extra };
};

/** 방향 d로 한 칸 앞 (0 아래 · 1 왼쪽 · 2 위 · 3 오른쪽) */
const AHEAD: readonly [number, number][] = [
  [0, 1],
  [-1, 0],
  [0, -1],
  [1, 0],
];

type Box = { L: number; Tp: number; R: number; B: number; cx: number; cy: number; fw: number; fh: number };

function boxOf(p: Placed, def: FurnitureDef, f: Frame): Box {
  const fp = footprint(def, p.r);
  const L = f.ox + p.x * T;
  const Tp = f.oy + p.y * T;
  return { L, Tp, R: L + fp.w * T, B: Tp + fp.h * T, cx: L + (fp.w * T) / 2, cy: Tp + (fp.h * T) / 2, fw: fp.w, fh: fp.h };
}

/** 이 배치의 1인 자리 전부 */
export function houseSpots(items: readonly Placed[], tier: TierShape, f: Frame): HouseSpot[] {
  const occ = buildOccupancy(items, tier);
  const byU = new Map(items.map((p) => [p.u, p]));
  /** 칸이 집 안이고 서 있는 물건이 없다 */
  const free = (x: number, y: number) => x >= 0 && y >= 0 && x < tier.w && y < tier.h && !occ.stand.has(y * 1000 + x);
  const standAt = (x: number, y: number) => {
    const u = occ.stand.get(y * 1000 + x);
    return u ? byU.get(u) : undefined;
  };
  const out: HouseSpot[] = [];
  for (const p of items) {
    const def = furnitureById(p.i);
    if (!def || def.floor || def.skin || def.ext) continue;
    const b = boxOf(p, def, f);
    // 4방향 가구(spin)는 방향 값(4~7)이 있을 때만 돌린 자리. 예전 값(0~3)은 앞모습 그대로
    const sd = def.spin && p.r >= SPIN_R0 ? spinDir(p.r) : -1;
    const r = def.turn ? p.r % 4 : Math.max(0, sd);
    switch (p.i) {
      case "chair": {
        if (sd <= 0) {
          // 앞을 보는 의자: 바로 위 칸이 책상·피아노면 그쪽을 보고 앉아 그 일을 한다 (예전 규칙)
          const above = standAt(p.x, p.y - 1);
          const at = above ? SIT_AT[above.i] : undefined;
          out.push(spot("chair", at ?? "sit", p.u, b.cx, b.B - 5, at ? DIR.up : DIR.down, true));
        } else {
          // 돌린 의자: 보는 쪽 바로 앞 칸이 책상·피아노면 그 일을 한다. 뒤돌아 앉으면 등받이가 사람 앞에 온다
          const [dx, dy] = AHEAD[sd];
          const front = standAt(p.x + dx, p.y + dy);
          const at = front ? SIT_AT[front.i] : undefined;
          out.push(spot("chair", at ?? "sit", p.u, b.cx, b.B - 5, FACE_BY_R[sd], true, { behind: sd === 2 }));
        }
        break;
      }
      case "sofa": {
        const face = FACE_BY_R[r];
        if (r % 2 === 0) {
          const y = r === 0 ? b.B - 4 : b.Tp + 7;
          out.push(spot("chair", "sit", p.u, b.L + 8, y, face, true), spot("chair", "sit", p.u, b.L + 24, y, face, true));
        } else {
          out.push(spot("chair", "sit", p.u, b.cx, b.Tp + 12, face, true), spot("chair", "sit", p.u, b.cx, b.Tp + 28, face, true));
        }
        break;
      }
      case "desk":
      case "monitor_desk":
      case "piano": {
        const use = SIT_AT[p.i];
        // 앞(그림 아래쪽)에 앉는다. 책상은 돌리면 앞이 왼쪽 → 위 → 오른쪽으로 돈다
        if (r === 0) {
          if (b.fw >= 1 && [...Array(b.fw).keys()].every((i) => free(p.x + i, p.y + b.fh)))
            out.push(spot("chair", use, p.u, b.cx, b.B + 4, DIR.up, false));
        } else if (r === 1) {
          if ([...Array(b.fh).keys()].every((j) => free(p.x - 1, p.y + j))) out.push(spot("chair", use, p.u, b.L - 6, b.cy + 4, DIR.right, false));
        } else if (r === 2) {
          if ([...Array(b.fw).keys()].every((i) => free(p.x + i, p.y - 1))) out.push(spot("chair", use, p.u, b.cx, b.Tp - 2, DIR.down, false));
        } else if ([...Array(b.fh).keys()].every((j) => free(p.x + b.fw, p.y + j))) out.push(spot("chair", use, p.u, b.R + 6, b.cy + 4, DIR.left, false));
        break;
      }
      case "bed":
        // 머리가 베개 위에 오도록 (침대 그림의 베개 = 칸 위쪽 3~8px). 돌린 침대는 발을 발판 쪽에 두고 자세를 기울인다
        if (sd === 1) out.push(spot("bed", "lie", p.u, b.L + 8, b.Tp + 17, DIR.down, true, { tilt: 90 }));
        else if (sd === 2) out.push(spot("bed", "lie", p.u, b.cx, b.Tp + 2, DIR.down, true, { tilt: 180 }));
        else if (sd === 3) out.push(spot("bed", "lie", p.u, b.R - 8, b.Tp + 17, DIR.down, true, { tilt: -90 }));
        else out.push(spot("bed", "lie", p.u, b.cx, b.Tp + 20, DIR.down, true));
        break;
      case "bookshelf":
        if ([...Array(b.fw).keys()].every((i) => free(p.x + i, p.y + b.fh))) out.push(spot("book", "read", p.u, b.cx, b.B + 5, DIR.down, false));
        break;
      case "bathtub":
        out.push(spot("tub", "bath", p.u, b.cx, b.B - 5, DIR.down, true));
        break;
    }
  }
  return out;
}

/** E로 쓸 수 있는 것 전부 (1인 자리 + 서서 쓰는 가구 + 창문) */
export function houseTargets(items: readonly Placed[], tier: TierShape, plan: RoomPlan, f: Frame): HouseTarget[] {
  const spots = houseSpots(items, tier, f);
  const out: HouseTarget[] = [];
  const byU = new Map(items.map((p) => [p.u, p]));
  for (const s of spots) {
    const p = byU.get(s.u)!;
    const def = furnitureById(p.i)!;
    const b = boxOf(p, def, f);
    // 차지 칸 안의 자리(소파·침대)는 가구 둘레에서, 가구 앞자리는 그 앵커 둘레에서
    const rect = s.inside ? { x0: b.L, y0: b.Tp, x1: b.R, y1: b.B } : { x0: s.x - 7, y0: s.y - 6, x1: s.x + 7, y1: s.y + 4 };
    out.push({ key: s.id, use: s.use, u: s.u, item: p.i, rect, spot: s });
  }
  for (const p of items) {
    const use = USE_OF[p.i];
    const def = furnitureById(p.i);
    if (!use || !def) continue;
    const b = boxOf(p, def, f);
    out.push({ key: `u:${p.u}`, use, u: p.u, item: p.i, rect: { x0: b.L, y0: b.Tp, x1: b.R, y1: b.B }, ...(LOW_PRIORITY.has(use) ? { low: true } : {}) });
  }
  plan.windows.forEach((w, i) => {
    const x0 = f.ox + w.x * T;
    out.push({ key: `w:${i}`, use: "window", u: `w${i}`, item: "window", rect: { x0, y0: f.oy - 6, x1: x0 + w.w * T, y1: f.oy } });
  });
  return out;
}

export function rectDist(r: Rect, x: number, y: number): number {
  const dx = x < r.x0 ? r.x0 - x : x > r.x1 ? x - r.x1 : 0;
  const dy = y < r.y0 ? r.y0 - y : y > r.y1 ? y - r.y1 : 0;
  return Math.hypot(dx, dy);
}

/**
 * 발 위치 (x,y)에서 쓸 대상: NEAR 안에서 가장 가까운 것. 같은 가구에 자리가 여럿이면(소파) 빈자리 중 가까운 쪽.
 * taken(id) = 다른 사람이 차지한 자리. 모두 차 있으면 그 자리를 돌려준다(안내용)
 */
export function pickTarget(targets: readonly HouseTarget[], x: number, y: number, taken: (id: string) => boolean = () => false): HouseTarget | null {
  let best: HouseTarget | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = rectDist(t.rect, x, y);
    if (d > NEAR) continue;
    // 빈자리를 먼저 고른다: 차 있으면 조금 멀게 친다. 같은 거리(소파 둘레)면 앵커가 가까운 자리
    const score = d + (t.spot && taken(t.spot.id) ? NEAR : 0) + (t.spot ? Math.hypot(t.spot.x - x, t.spot.y - y) * 0.01 : 0) + (t.low ? 6 : 0);
    if (score < bestD) {
      bestD = score;
      best = t;
    }
  }
  return best;
}

/**
 * 가구 그림 depth (y 정렬). 기본은 차지 칸 밑변 − 1이고, 앉거나 누운 사람이 가구 위에 그려져야 하는 자리
 * (차지 칸 안의 자리)가 있으면 그 앵커 − 1로 내린다.
 */
export function itemDepthY(p: Placed, def: FurnitureDef, spots: readonly HouseSpot[], f: Frame): number {
  const b = boxOf(p, def, f);
  let d = b.B - 1;
  // 위를 보고 앉는 소파 자리(돌린 소파)는 등받이가 앞에 와야 하므로 그대로 둔다. 의자는 위를 봐도(책상 앞) 사람이 앞에
  for (const s of spots) if (s.u === p.u && s.inside && !s.behind && !(s.facing === DIR.up && p.i === "sofa")) d = Math.min(d, s.y - 1);
  return d;
}

// ── 가구 쓰기 값(use 이벤트 a) ──

/** 피아노 음 (C4부터 다장조 두 옥타브) */
export const PIANO_NOTES = 15;
export function pianoFreq(i: number): number {
  const steps = [0, 2, 4, 5, 7, 9, 11];
  const n = Math.max(0, Math.min(PIANO_NOTES - 1, i));
  const semi = steps[n % 7] + 12 * Math.floor(n / 7);
  return 261.63 * Math.pow(2, semi / 12);
}

/** E만 눌러도 연주가 되게: "작은 별" 가락 (음 번호) */
export const TWINKLE = [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0, 4, 4, 3, 3, 2, 2, 1, 4, 4, 3, 3, 2, 2, 1];

/** 냉장고 간식 (a = 번호) */
export const SNACKS = ["onigiri", "apple", "milk", "cake", "icecream"] as const;
export const SNACK_NAMES: Record<(typeof SNACKS)[number], string> = { onigiri: "삼각김밥", apple: "사과", milk: "우유", cake: "조각 케이크", icecream: "아이스크림" };
/** 자판기 음료 (a = 번호) */
export const DRINKS = ["soda", "milk", "coffee"] as const;

/** 책장에서 꺼낸 책의 한 줄 (a = 번호) */
export const BOOK_LINES = [
  "‘오늘 할 일을 내일로 미루지 말자’… 라고 3년 전에 밑줄을 그었다.",
  "‘하루 5분 습관의 기적’ 1장만 다섯 번째 읽는 중.",
  "책 사이에서 옛날 영화표가 나왔다.",
  "‘퇴근 후 2시간’… 퇴근을 해야 읽을 수 있다.",
  "요리책: 라면 맛있게 끓이는 법 37가지.",
  "‘미니멀 라이프’ 책이 열두 권 있다.",
  "시집 한 줄: 별 헤는 밤, 오늘은 몇 개나 셀까.",
  "만화책 3권이 없다. 누가 빌려 갔더라.",
  "‘영어 회화 30일 완성’ 첫 장에 내 이름만 적혀 있다.",
  "추리 소설의 마지막 장을 먼저 읽어 버렸다.",
];

/** 덤불을 뒤지면 튀어나오는 것 (a = 번호. 연출만 — 포인트·아이템은 주지 않는다) */
export const BUSH_FINDS = [
  { emote: "wow", line: "도토리 하나가 데굴데굴 굴러 나왔다." },
  { emote: "what", line: "작은 고양이가 휙 달아났다!" },
  { emote: "laugh", line: "잃어버린 양말 한 짝이 여기 있었네." },
  { emote: "sweat", line: "아무것도 없다… 손만 긁혔다." },
  { emote: "flower", line: "덤불 속에 작은 꽃이 숨어 있었다." },
  { emote: "bang", line: "참새가 푸드득 날아올랐다!" },
] as const;

/** 사훈 액자를 바로잡을 때 한 줄 (a = 번호) */
export const FRAME_LINES = [
  "사훈 \"404\"… 오늘도 뜻을 찾지 못했다.",
  "액자를 바로 세웠다. 3초 뒤 다시 기울었다.",
  "액자 뒤에 \"뜻은 나중에 정함\"이라고 적혀 있다.",
  "바르게 걸린 404. 마음이 조금 편해졌다.",
] as const;

/** 추억 비석 앞 한 줄 */
export const PRAY_LINES = ["잠시 고개를 숙였다.", "작은 꽃을 놓았다. 바람이 살랑.", "고마웠다고, 조용히 말했다."] as const;

/** 라디오 채널 (0 = 꺼짐). 켜면 BGM 플레이리스트를 차례로 돌린다. 서버 저장 범위와 같은 값 (lib/housing/states.ts) */
export { RADIO_CHANNELS } from "@/lib/housing/states";

/** KST 시각 안내 (괘종시계) */
export function clockText(now: number): string {
  const d = new Date(now + 9 * 3600_000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const ampm = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `지금은 ${ampm} ${h12}시 ${m}분이에요.`;
}
