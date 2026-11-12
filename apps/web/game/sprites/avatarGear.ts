import type { AvatarBody } from "@tomb/protocol";
import { darken, Grid } from "./pixel";

// F8 캐릭터 꾸미기 추가분 중 "아바타 시트에 같이 그려지는 것" (avatar.ts drawFrame이 부른다):
//  머리 9종(비니·헤드폰·왕관·리본·고깔·안경·마법사 모자·체육대회 모자·새싹), 목 5종(넥타이·사원증·나비넥타이·방울·꽃 목걸이),
//  손 4종(아이스 아메리카노·서류 가방·스마트폰·도깨비 등롱), 등 2종(출근 배낭·퇴근 망토).
// 모두 몸 기준점(GearM: avatar.ts metrics와 같은 모양)에 맞춰 그려서 6가지 몸(round·sheet·tall·cat·bun·hood)에 다 맞는다.
// 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다 (여기서는 칠만 한다).

export type GearView = "down" | "side" | "up";

/** avatar.ts metrics()와 같은 모양 (머리 중심·반지름·윗면·목·어깨·손 자리) */
export type GearM = {
  cx: number;
  hy: number;
  rx: number;
  ry: number;
  top: number;
  crown: number;
  neck: number;
  shY: number;
  shL: number;
  shR: number;
  hx: number;
  hY: number;
};

export const GEAR_HEAD = ["hat_beanie", "hat_headphones", "hat_crown", "hat_ribbon", "hat_party", "hat_glasses", "hat_wizard", "hat_cap", "hat_sprout"] as const;
export const GEAR_NECK = ["neck_tie", "neck_badge", "neck_bowtie", "neck_bell", "neck_lei"] as const;
export const GEAR_HAND = ["hand_coffee", "hand_briefcase", "hand_phone", "hand_lantern_blue"] as const;
export const GEAR_BACK = ["back_backpack", "back_cape"] as const;
/** 시트에 그려지는 추가 꾸미기 전부 (시트 키에 들어간다) */
export const GEAR_SHEET_IDS: readonly string[] = [...GEAR_HEAD, ...GEAR_NECK, ...GEAR_HAND, ...GEAR_BACK];

/** 두건·키다리 끝·동글이 새싹을 덮는 모자 (그 위에 꼭지를 그리지 않는다) */
export const COVERING_HATS: ReadonlySet<string> = new Set(["hat_straw", "hat_cat", "hat_beanie", "hat_crown", "hat_party", "hat_wizard", "hat_cap"]);

export type ExtraGear = { head: string | null; neck: string | null; hand: string | null; back: string | null };

export function extraGearOf(look: readonly string[]): ExtraGear {
  const pick = (ids: readonly string[]) => look.find((id) => ids.includes(id)) ?? null;
  return { head: pick(GEAR_HEAD), neck: pick(GEAR_NECK), hand: pick(GEAR_HAND), back: pick(GEAR_BACK) };
}

/** 머리 한 줄의 반폭 (타원 공식, 머리 밖이면 0) */
function halfAt(m: GearM, y: number): number {
  const d = (y + 0.5 - m.hy) / m.ry;
  return d * d >= 1 ? 0 : m.rx * Math.sqrt(1 - d * d);
}

/** 몸마다 눈 자리 (drawFace와 같은 값) */
function eyes(body: AvatarBody, view: GearView, m: GearM): { xs: number[]; y: number } {
  const { cx, hy } = m;
  const side = view === "side";
  switch (body) {
    case "tall":
      return side ? { xs: [cx + 2], y: hy } : { xs: [cx - 2, cx + 1], y: hy };
    case "round":
      return side ? { xs: [cx + 4], y: Math.round(hy - 2) } : { xs: [cx - 2, cx + 1], y: Math.round(hy - 2) };
    case "cat":
    case "bun":
      return side ? { xs: [cx + 2], y: hy } : { xs: [cx - 3, cx + 2], y: hy };
    case "sheet":
      return side ? { xs: [cx + 3], y: hy } : { xs: [cx - 3, cx + 2], y: hy };
    default:
      return side ? { xs: [cx + 3], y: hy + 1 } : { xs: [cx - 2, cx + 1], y: hy + 1 };
  }
}

// ── 머리 ──

export function drawHeadGear(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, top: number): void {
  const { cx, hy } = m;
  const side = view === "side";
  const rx = Math.round(m.rx);
  switch (id) {
    case "hat_beanie": {
      const c = 0xd8743a;
      const lo = 0xa8522a;
      const rib = 0xf0a060;
      const rows: [number, number][] = [
        [top - 2, Math.max(2, Math.round(rx * 0.45))],
        [top - 1, Math.round(rx * 0.8)],
        [top, rx],
        [top + 1, rx],
      ];
      for (const [y, h] of rows) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : c);
      // 접은 단 (골지)
      for (let x = cx - rx; x < cx + rx; x++) g.set(x, top + 2, (x + cx) % 2 ? rib : c);
      // 방울
      const px = side ? cx - 2 : cx - 1;
      g.rect(px, top - 4, 2, 2, 0xf6efe0);
      break;
    }
    case "hat_headphones": {
      const band = 0x2e2e38;
      const cup = 0x55556a;
      const accent = 0xff7aa0;
      if (side) {
        g.vline(cx - 1, top - 1, hy - 2, band);
        g.rect(cx - 2, hy - 1, 3, 3, cup);
        g.set(cx - 1, hy, accent);
        break;
      }
      const L = cx - Math.ceil(m.rx);
      const R = cx + Math.ceil(m.rx) - 1;
      g.vline(L, top + 1, hy - 2, band);
      g.vline(R, top + 1, hy - 2, band);
      g.set(L + 1, top, band);
      g.set(R - 1, top, band);
      g.hline(L + 2, R - 2, top - 1, band);
      g.rect(L - 1, hy - 1, 2, 3, cup);
      g.rect(R, hy - 1, 2, 3, cup);
      if (view === "down") {
        g.set(L - 1, hy, accent);
        g.set(R + 1, hy, accent);
      }
      break;
    }
    case "hat_crown": {
      const gold = 0xf2c43a;
      const lo = 0xb88a1a;
      const hi = 0xfff0a0;
      const x0 = side ? cx - 3 : cx - 3;
      const w = side ? 5 : 6;
      g.rect(x0, top - 1, w, 2, gold);
      g.hline(x0, x0 + w - 1, top, lo);
      const spikes = side ? [x0, x0 + 2, x0 + 4] : [x0, x0 + 2, x0 + 3, x0 + 5];
      for (const x of spikes) g.set(x, top - 2, gold);
      g.set(side ? x0 + 2 : x0 + 2, top - 3, hi);
      if (!side) g.set(x0 + 3, top - 3, hi);
      if (view !== "up") g.set(side ? x0 + 3 : x0 + 2, top - 1, 0xe0405a);
      if (view === "down") g.set(x0 + 3, top - 1, 0x4a8ae8);
      g.set(x0, top - 1, hi);
      break;
    }
    case "hat_ribbon": {
      const c = 0xff7aa8;
      const lo = 0xd04a7a;
      // 머리띠: 머리 윗곡선을 따라
      for (let y = top; y <= top + 2; y++) {
        const h = Math.round(halfAt(m, y));
        if (h <= 0) continue;
        if (y === top + 2 || y === top) {
          g.set(cx - h, y, lo);
          g.set(cx + h - 1, y, lo);
        }
        if (y === top) for (let x = cx - h; x < cx + h; x++) g.set(x, y, lo);
      }
      const bx = side ? cx - 2 : view === "up" ? cx - 3 : cx + 2;
      const by = top - 1;
      g.rect(bx - 2, by - 1, 2, 3, c);
      g.rect(bx + 1, by - 1, 2, 3, c);
      g.set(bx, by, 0xffc8dc);
      g.set(bx - 2, by + 1, lo);
      g.set(bx + 2, by + 1, lo);
      break;
    }
    case "hat_party": {
      const a = 0x5ab8e8;
      const b = 0xffd04a;
      // 키다리처럼 머리가 프레임 위쪽에 붙은 몸은 고깔을 낮춘다 (방울이 잘리지 않게)
      const widths = top >= 9 ? [6, 6, 4, 4, 2, 2] : [6, 4, 2];
      const x0c = side ? cx - 0.5 : cx;
      widths.forEach((w, i) => {
        const y = top - i;
        const xs = Math.round(x0c - w / 2);
        for (let x = xs; x < xs + w; x++) g.set(x, y, Math.floor((x - y + 40) / 2) % 2 ? a : b);
      });
      g.rect(Math.round(x0c) - 1, top - widths.length - 1, 2, 2, 0xff6a9a);
      break;
    }
    case "hat_glasses": {
      if (view === "up") break;
      const frame = 0xc8904a;
      const { xs, y } = eyes(body, view, m);
      for (const ex of xs) {
        g.hline(ex - 1, ex + 1, y - 1, frame);
        g.set(ex - 1, y, frame);
        g.set(ex + 1, y, frame);
        g.hline(ex - 1, ex + 1, y + 1, 0x8a6030);
      }
      if (side) g.hline(cx - 2, xs[0] - 2, y - 1, frame);
      break;
    }
    case "hat_wizard": {
      const c = 0x6a3aa8;
      const hi = 0x8a5ac8;
      const brim = 0x4a2a7a;
      const h = Math.max(3, Math.min(7, top - 1));
      for (let i = 0; i < h; i++) {
        const y = top - i;
        const half = Math.max(0.5, 3.5 - i * 0.5);
        const shift = -Math.floor((i * i) / 14) - (side ? 1 : 0);
        const x0 = Math.round(cx - half) + shift;
        const x1 = Math.round(cx + half) - 1 + shift;
        for (let x = x0; x <= Math.max(x0, x1); x++) g.set(x, y, x === x0 ? hi : c);
      }
      for (let x = cx - 3 - (side ? 1 : 0); x < cx + 3 - (side ? 1 : 0); x++) g.set(x, top, 0xffd04a);
      g.hline(cx - 6, cx + 5, top + 1, brim);
      if (view !== "up") g.set(cx, top - 2, 0xfff07a);
      break;
    }
    case "hat_cap": {
      const c = 0x3a6ac8;
      const hi = 0x6a9ae8;
      const lo = 0x2a4a98;
      for (const [y, h] of [
        [top - 1, Math.max(2, rx - 2)],
        [top, rx - 1],
        [top + 1, rx],
      ] as [number, number][])
        for (let x = cx - h; x < cx + h; x++) g.set(x, y, x < cx - h + 2 ? hi : c);
      g.set(cx - 1, top - 2, lo);
      if (side) g.hline(cx + 1, cx + rx + 2, top + 2, lo);
      else if (view === "down") {
        g.hline(cx - rx + 1, cx + rx - 2, top + 2, lo);
        g.set(cx - 1, top, 0xffffff);
      } else g.set(cx - 1, top + 1, 0xd8d8e0);
      break;
    }
    case "hat_sprout": {
      const stem = 0x5a8a3c;
      const leafA = 0x9cd46a;
      const leafB = 0x7ab84a;
      const sx = side ? cx - 1 : cx;
      // 프레임 위쪽에 붙은 몸(키다리)은 한 칸 낮게
      const ty = top + (top >= 8 ? 0 : 1);
      g.vline(sx, ty - 3, top - 1, stem);
      for (const [x, y] of [[-3, -4], [-2, -4], [-2, -3], [-1, -3]]) g.set(sx + x, ty + y, leafA);
      for (const [x, y] of [[1, -4], [2, -5], [3, -5], [2, -4]]) g.set(sx + x, ty + y, leafB);
      break;
    }
  }
}

// ── 목 ──

export function drawNeckGear(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody): void {
  const { cx, neck } = m;
  const side = view === "side";
  const wide = body === "round" || body === "sheet";
  const half = wide ? 5 : body === "tall" ? 3 : 4;
  switch (id) {
    case "neck_tie": {
      const tie = 0x2a4a9a;
      const stripe = 0x6a8ad8;
      if (view === "up") {
        g.hline(cx - 2, cx + 1, neck, 0xf0f0f0);
        break;
      }
      if (side) {
        g.set(cx + 1, neck, 0xf0f0f0);
        g.vline(cx + 2, neck, neck + 3, tie);
        g.set(cx + 2, neck + 1, stripe);
        break;
      }
      g.set(cx - 2, neck, 0xf0f0f0);
      g.set(cx + 1, neck, 0xf0f0f0);
      g.rect(cx - 1, neck, 2, 1, tie);
      g.rect(cx - 1, neck + 1, 2, 3, tie);
      g.set(cx - 1, neck + 2, stripe);
      g.set(cx, neck + 1, stripe);
      g.set(cx - 1, neck + 4, tie);
      break;
    }
    case "neck_badge": {
      const cord = 0x3a8ae8;
      if (view === "up") {
        g.hline(cx - 2, cx + 1, neck, cord);
        break;
      }
      if (side) {
        g.set(cx, neck, cord);
        g.set(cx + 1, neck + 1, cord);
        g.rect(cx + 1, neck + 2, 2, 3, 0xf4f4f4);
        g.set(cx + 1, neck + 2, cord);
        break;
      }
      g.set(cx - 3, neck, cord);
      g.set(cx + 2, neck, cord);
      g.set(cx - 2, neck + 1, cord);
      g.set(cx + 1, neck + 1, cord);
      g.rect(cx - 2, neck + 2, 4, 3, 0xf4f4f4);
      g.hline(cx - 2, cx + 1, neck + 2, cord);
      g.set(cx - 1, neck + 3, 0x8a7a6a);
      g.set(cx, neck + 4, 0x9a9aa8);
      break;
    }
    case "neck_bowtie": {
      const c = 0xd8405a;
      const knot = 0xa02a40;
      if (view === "up") break;
      if (side) {
        g.rect(cx + 1, neck, 2, 2, c);
        g.set(cx + 1, neck, knot);
        break;
      }
      g.rect(cx - 3, neck, 2, 2, c);
      g.rect(cx + 1, neck, 2, 2, c);
      g.rect(cx - 1, neck, 2, 1, knot);
      break;
    }
    case "neck_bell": {
      const collar = 0xc8463c;
      for (let x = cx - half; x < cx + half; x++) g.set(x, neck, collar);
      if (view === "up") break;
      const bx = side ? cx + 2 : cx - 1;
      g.rect(bx, neck + 1, 2, 2, 0xf2c43a);
      g.set(bx, neck + 1, 0xfff0a0);
      g.set(bx + (side ? 0 : 1), neck + 2, 0x7a5a1a);
      break;
    }
    case "neck_lei": {
      const cols = [0xff8ab0, 0xffe066, 0xffffff, 0xff9a5a];
      for (let x = cx - half; x < cx + half; x++) g.set(x, neck, cols[(x + 8) % cols.length]);
      if (view === "down") for (let x = cx - half + 2; x < cx + half - 2; x++) g.set(x, neck + 1, cols[(x + 9) % cols.length]);
      else if (side) g.set(cx + 2, neck + 1, cols[0]);
      break;
    }
  }
}

// ── 손 (앞·옆모습에서만 보인다. 뒷모습은 몸에 가려진다) ──

/** 손에 든 것. 외곽선 전에 칠한다 */
export function drawHandGear(g: Grid, view: GearView, id: string, m: GearM): void {
  if (view === "up") return;
  const x = m.hx;
  const y = m.hY;
  switch (id) {
    case "hand_coffee":
      g.vline(x + 1, y - 3, y - 2, 0x3aa86a);
      g.hline(x - 1, x + 1, y - 1, 0xf4f4f4);
      g.rect(x - 1, y, 3, 3, 0x5a3420);
      g.vline(x - 1, y, y + 2, 0xc89a6a);
      g.hline(x - 1, x + 1, y + 1, 0x2a6a4a);
      break;
    case "hand_briefcase":
      g.hline(x, x + 1, y, 0x3a2414);
      g.rect(x - 1, y + 1, 4, 3, 0x7a4a2a);
      g.hline(x - 1, x + 2, y + 1, 0x9a6a3a);
      g.set(x, y + 2, 0xf2c43a);
      break;
    case "hand_phone":
      g.rect(x - 1, y, 2, 3, 0x2a2a34);
      g.set(x - 1, y + 2, 0x4a4a58);
      break;
    case "hand_lantern_blue":
      g.set(x, y - 1, 0x2a3a4a);
      g.rect(x - 1, y, 3, 3, 0x2a4a5a);
      g.set(x, y + 1, 0x8ae8ff);
      break;
  }
}

/** 외곽선 뒤에도 밝게 남는 점 (화면·불빛) */
export function drawHandGlow(g: Grid, view: GearView, id: string, m: GearM): void {
  if (view === "up") return;
  if (id === "hand_phone") {
    g.set(m.hx - 1, m.hY, 0x9ad8ff);
    g.set(m.hx, m.hY + 1, 0x9ad8ff);
  } else if (id === "hand_lantern_blue") g.set(m.hx, m.hY + 1, 0xd8fcff);
}

// ── 등 ──

/**
 * 등에 메는 것. layer "back" = 몸보다 먼저(앞·옆모습에서 몸 뒤로 삐져나온 부분), "front" = 몸 다음(뒷모습에서 등을 덮는다).
 * hem: 이불 유령 밑단 물결 위상 (망토 자락 흔들림에 같이 쓴다)
 */
export function drawBackGear(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, layer: "back" | "front", hem: number, sit: number): void {
  const { cx, shY, shL, shR } = m;
  const side = view === "side";
  const up = view === "up";
  if (id === "back_backpack") {
    const c = 0x7a8a4a;
    const lo = darken(c, 0.25);
    const strap = 0x5a4a32;
    if (up && layer === "front") {
      const w = body === "tall" ? 6 : 7;
      const x0 = Math.round(cx - w / 2);
      g.rect(x0, shY - 1, w, 6, c);
      g.hline(x0, x0 + w - 1, shY - 1, 0x9aaa6a);
      g.rect(x0 + 1, shY + 2, w - 2, 2, lo);
      g.set(cx - 1, shY + 2, 0xd8c8a0);
      g.hline(x0 + 1, x0 + w - 2, shY, strap);
    } else if (side && layer === "back") {
      g.rect(cx - 7, shY - 1, 4, 6, c);
      g.vline(cx - 7, shY + 1, shY + 4, lo);
      g.set(cx - 6, shY + 2, 0xd8c8a0);
    } else if (view === "down" && layer === "front") {
      // 앞에서는 어깨끈만
      g.vline(shL + 2, shY, shY + 2, strap);
      g.vline(shR - 2, shY, shY + 2, strap);
    } else if (view === "down" && layer === "back") {
      g.rect(cx - 4, shY - 1, 8, 5, c);
    }
    return;
  }
  if (id === "back_cape") {
    const c = 0xb83a4a;
    const lo = 0x8a2a38;
    const hi = 0xd85a68;
    const bottom = sit === 1 ? 26 : sit === 2 ? 25 : 25;
    if (up && layer === "front") {
      for (let y = shY - 1; y <= bottom; y++) {
        const spread = Math.round((y - shY) * 0.45);
        const x0 = shL - spread;
        const x1 = shR + spread;
        for (let x = x0; x <= x1; x++) {
          if (y === bottom && (x + hem) % 3 === 2) continue;
          g.set(x, y, x <= x0 + 1 ? hi : x >= x1 - 1 ? lo : c);
        }
      }
      g.hline(shL, shR, shY - 1, 0xf2c43a);
    } else if (side && layer === "back") {
      for (let y = shY; y <= bottom; y++) {
        const t = (y - shY) / Math.max(1, bottom - shY);
        const back = Math.round(2 + t * 4 + (y === bottom ? hem % 2 : 0));
        for (let x = cx - back - 2; x <= cx; x++) g.set(x, y, x === cx - back - 2 ? lo : c);
      }
    } else if (view === "down" && layer === "back") {
      for (let y = shY; y <= bottom; y++) {
        const spread = 1 + Math.round((y - shY) * 0.5);
        for (let x = shL - spread; x <= shR + spread; x++) {
          if (y === bottom && (x + hem) % 3 === 2) continue;
          g.set(x, y, x < cx ? lo : c);
        }
      }
    } else if (view === "down" && layer === "front") {
      g.set(shL + 1, shY - 1, 0xf2c43a);
      g.set(shR - 1, shY - 1, 0xf2c43a);
    }
  }
}
