import { COSMETIC_DROP_ART, dropInfo, gearById, type IconArt } from "@/lib/rpg/catalog";
import type { Drop } from "@/lib/rpg/types";
import { gearGrade } from "@/components/rpg/gear";

// 사냥터 바닥 드롭 연출의 등급별 모양 (Phaser 없이 — 테스트가 쉽다). 그리기는 loot.ts.
// 등급과 이름 색은 상점·가방·결과 화면과 같은 장비 등급표(components/rpg/gear.ts gearGrade)를 그대로 쓴다.
//  - 단계 0 (물약·일반 장비): 작은 반짝임만
//  - 단계 1 (고급): 바닥 빛 고리 + 가는 빛기둥
//  - 단계 2 (희귀 · 꾸미기 선물): 더 굵고 높은 기둥, 떠오르는 빛 알갱이, 맥동, 떨어지는 순간 섬광
//  - 단계 3 (전설): 가장 굵고 높고 짙은 기둥 + 화면 가장자리 빛 + 짧은 알림 글자
// 색은 단계가 오를수록 짙게(기둥 알파·고리 겹), 기둥은 굵고 높게.

export type LootTier = 0 | 1 | 2 | 3;

export type LootLook = {
  tier: LootTier;
  /** 등급 이름 (일반·고급·희귀·전설·물약·꾸미기) */
  grade: string;
  /** 바닥에 놓일 이름표 글자 */
  name: string;
  /** 이름표 색 (등급 색, CSS) */
  text: string;
  /** 기둥·고리 색 (등급 색을 조금 짙게) */
  beam: number;
  /** 빛 알갱이·섬광 색 (밝게) */
  light: number;
  /** 기둥 높이·폭 (월드 px). 0이면 기둥 없음 */
  beamH: number;
  beamW: number;
  /** 기둥 진하기 0..1 */
  beamA: number;
  /** 바닥 고리 반지름 (0이면 없음) · 겹 수 */
  ringR: number;
  rings: number;
  /** 초당 떠오르는 빛 알갱이 */
  motes: number;
  /** 맥동 세기 0..1 */
  pulse: number;
  /** 떨어지는 순간 알림 글자 (없으면 없음) */
  notice?: string;
  /** 화면 가장자리 빛 */
  edge: boolean;
  art: IconArt;
  /** 아이콘 텍스처 이름 (같은 그림은 한 번만 만든다) */
  tex: string;
  /** 소리 결 (lootSound) */
  sound: "plain" | "fine" | "rare" | "legend" | "gift";
};

/** 단계별 기본값 (색만 바꿔 쓴다) */
const TIER: Record<LootTier, Pick<LootLook, "beamH" | "beamW" | "beamA" | "ringR" | "rings" | "motes" | "pulse">> = {
  0: { beamH: 0, beamW: 0, beamA: 0, ringR: 0, rings: 0, motes: 0, pulse: 0 },
  1: { beamH: 38, beamW: 7, beamA: 0.55, ringR: 8, rings: 1, motes: 1.5, pulse: 0.2 },
  2: { beamH: 66, beamW: 11, beamA: 0.75, ringR: 10, rings: 2, motes: 4, pulse: 0.45 },
  3: { beamH: 112, beamW: 16, beamA: 0.92, ringR: 13, rings: 3, motes: 8, pulse: 0.7 },
};

/** 등급 → [단계, 기둥 색, 밝은 색] (이름표 색은 등급표 그대로) */
const GRADE_FX = {
  common: [0, 0xd9d4c3, 0xfff3c8],
  fine: [1, 0x4f96e6, 0xd2e8ff],
  rare: [2, 0x9a5ee6, 0xecdcff],
  legend: [3, 0xf0a224, 0xfff0c2],
} as const;

const SOUND: Record<LootTier, LootLook["sound"]> = { 0: "plain", 1: "fine", 2: "rare", 3: "legend" };

/** 드롭 한 줄 → 바닥 연출 모양. 모르는 id면 null */
export function lootLook(d: Pick<Drop, "kind" | "id">): LootLook | null {
  const info = dropInfo(d);
  if (!info) return null;
  if (d.kind === "gear") {
    const g = gearById(d.id)!;
    const grade = gearGrade(g);
    const [tier, beam, light] = GRADE_FX[grade.id];
    return { tier, grade: grade.label, name: g.name, text: grade.color, beam, light, ...TIER[tier], edge: tier === 3, notice: tier === 3 ? "전설 장비!" : undefined, art: g.art, tex: `rpg-loot-${d.kind}-${d.id}`, sound: SOUND[tier] };
  }
  if (d.kind === "potion") {
    return { tier: 0, grade: "물약", name: info.name, text: "#d9d4c3", beam: 0xd9d4c3, light: 0xfff3c8, ...TIER[0], edge: false, art: info.art, tex: `rpg-loot-${d.kind}-${d.id}`, sound: "plain" };
  }
  // 기간제 코디: 어떤 꾸미기인지는 서버가 정한다(이미 가진 것이면 다음 후보) → 바닥에는 선물 상자와 "꾸미기 선물"만
  return {
    tier: 2,
    grade: "꾸미기",
    name: "꾸미기 선물",
    text: "#ffb0c8",
    beam: 0xf06aa8,
    light: 0xffe2ee,
    ...TIER[2],
    edge: false,
    notice: "꾸미기 선물!",
    art: COSMETIC_DROP_ART,
    tex: "rpg-loot-cosmetic",
    sound: "gift",
  };
}

/** 한 화면 바닥 드롭 상한 (한 판 최대 4개 — 우두머리·굴림 둘·코디. 넘치면 가장 낮은 단계부터 바로 들어온다) */
export const LOOT_MAX = 6;

/**
 * 떨어질 자리: 출처(sx,sy) 둘레에 흩뿌리되 서로 minGap 이상 떨어지게 (바닥은 납작하게 0.7).
 * away(라디안)가 있으면 그쪽(캐릭터 반대편)으로 부채꼴로 → 몬스터를 바로 옆에서 잡아도 떨어지자마자 빨려 들지 않는다.
 * rnd는 0..1 난수 (테스트는 고정 난수)
 */
export function scatter(n: number, sx: number, sy: number, rnd: () => number, minGap = 16, away?: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const base = away ?? rnd() * Math.PI * 2;
  // 부채꼴 사이 각 (여럿이면 반원 안에서 고르게, 방향이 없으면 한 바퀴)
  const step = away === undefined ? (Math.PI * 2) / Math.max(1, n) : Math.min(0.9, (Math.PI * 0.8) / Math.max(1, n - 1));
  for (let i = 0; i < n; i++) {
    let best = { x: sx, y: sy };
    for (let tryN = 0; tryN < 8; tryN++) {
      // 겹치면 다시: 방향이 없으면 돌려 보고, 있으면 (반원을 벗어나지 않게) 더 멀리만
      const a = away === undefined ? base + i * step + (rnd() - 0.5) * 0.6 + tryN * 0.7 : base + (i - (n - 1) / 2) * step + (rnd() - 0.5) * 0.4;
      const r = (n === 1 ? 12 : 16) + rnd() * 6 + tryN * 4;
      const p = { x: sx + Math.cos(a) * r, y: sy + Math.sin(a) * r * 0.7 };
      best = p;
      if (out.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= minGap)) break;
    }
    out.push(best);
  }
  return out;
}

/**
 * 이름표 겹침 풀기: 아래(y가 큰 것)부터 자리를 잡고, 앞서 잡은 이름표와 겹치면 위로 한 줄씩 올린다.
 * 들어오는 것: 이름표 가운데 x, 아래 y, 너비·높이 (월드 px). 돌려주는 것: 각 이름표를 올릴 양 (0 이상)
 */
export function stackLabels(boxes: readonly { x: number; y: number; w: number; h: number }[]): number[] {
  const order = boxes.map((_, i) => i).sort((a, b) => boxes[b].y - boxes[a].y);
  const placed: { l: number; r: number; t: number; b: number }[] = [];
  const lift = boxes.map(() => 0);
  for (const i of order) {
    const bx = boxes[i];
    let up = 0;
    for (let guard = 0; guard < 12; guard++) {
      const me = { l: bx.x - bx.w / 2, r: bx.x + bx.w / 2, t: bx.y - up - bx.h, b: bx.y - up };
      const hit = placed.find((p) => me.l < p.r && me.r > p.l && me.t < p.b && me.b > p.t);
      if (!hit) break;
      up = bx.y - hit.t + 1;
    }
    lift[i] = up;
    placed.push({ l: bx.x - bx.w / 2, r: bx.x + bx.w / 2, t: bx.y - up - bx.h, b: bx.y - up });
  }
  return lift;
}
