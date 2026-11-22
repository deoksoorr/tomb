import { itemById, type AvatarBody } from "@tomb/protocol";
import { CUTE_BACK, CUTE_COVERING, CUTE_HAND, CUTE_HEAD, CUTE_NECK, drawCuteBack, drawCuteHead, drawCuteNeck } from "./cuteGear";
import { Grid } from "./pixel";
import { drawGhostHead, drawGhostHeadGlow, GHOST_HEAD } from "./ghostGear";
import { CHAIR_HEAD, drawChairHead, drawChairHeadGlow } from "./chairGear";
import { drawThemeBack, drawThemeNeck, THEME_BACK, THEME_HAND, THEME_NECK } from "./themeGear";
import { drawXmasBack, drawXmasGlow, drawXmasHead, drawXmasNeck, XMAS_BACK, XMAS_COVERING, XMAS_HAND, XMAS_HEAD, XMAS_NECK } from "./xmasGear";

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

// 추가분 2(11/12): 머리 5·목 5·손 5·등 3 + 31번 운영자 전용(왕관·완장·명부·등불·도포)
// 주간 랭킹 1위 전용 머리 3종 (금화 왕관·붉은 깃털 투구·황금 물고기 모자 — protocol CHAMP_HAT)
export const GEAR_HEAD = ["hat_beanie", "hat_headphones", "hat_crown", "hat_ribbon", "hat_party", "hat_glasses", "hat_wizard", "hat_cap", "hat_sprout", "hat_beret", "hat_hardhat", "hat_chef", "hat_horns", "hat_santa", "staff_crown", "champ_crown", "champ_plume", "champ_fishhat", "champ_duo_ph", "champ_duo_pf", "champ_duo_hf", "champ_triple", "q_hat_angler", "q_hat_miner", "q_hat_snow", "u_hat_siren", ...CUTE_HEAD, ...GHOST_HEAD, ...XMAS_HEAD, ...CHAIR_HEAD] as const;
export const GEAR_NECK = ["neck_tie", "neck_badge", "neck_bowtie", "neck_bell", "neck_lei", "neck_collar", "neck_whistle", "neck_camera", "neck_pearl", "neck_medal", "staff_armband", ...CUTE_NECK, ...XMAS_NECK, ...THEME_NECK] as const;
export const GEAR_HAND = ["hand_coffee", "hand_briefcase", "hand_phone", "hand_lantern_blue", "hand_donut", "hand_clipboard", "hand_mic", "hand_bouquet", "hand_wand", "staff_ledger", "staff_lamp", "q_hand_net", "q_hand_brush", "q_hand_wishlamp", "inv_hand_lantern", ...CUTE_HAND, ...XMAS_HAND, ...THEME_HAND] as const;
export const GEAR_BACK = ["back_backpack", "back_cape", "back_shell", "back_guitar", "back_jetpack", "staff_robe", "q_back_cape", ...CUTE_BACK, ...XMAS_BACK, ...THEME_BACK] as const;
/** 시트에 그려지는 추가 꾸미기 전부 (시트 키에 들어간다) */
export const GEAR_SHEET_IDS: readonly string[] = [...GEAR_HEAD, ...GEAR_NECK, ...GEAR_HAND, ...GEAR_BACK];

/** 두건·키다리 끝·동글이 새싹을 덮는 모자 (그 위에 꼭지를 그리지 않는다) */
export const COVERING_HATS: ReadonlySet<string> = new Set(["hat_straw", "hat_cat", "hat_beanie", "hat_crown", "hat_party", "hat_wizard", "hat_cap", "hat_beret", "hat_hardhat", "hat_chef", "hat_santa", "staff_crown", "champ_crown", "champ_plume", "champ_fishhat", "champ_duo_ph", "champ_duo_pf", "champ_duo_hf", "champ_triple", "q_hat_angler", "q_hat_miner", "q_hat_snow", "u_hat_siren", ...CUTE_COVERING, ...GHOST_HEAD, ...XMAS_COVERING, ...CHAIR_HEAD]);

/** back = 몸에 입는 옷(코트·패딩·니트·후드티·도포), pack = 11/22 등에 메거나 걸치는 것(배낭·기타·제트팩·서핑보드·날개·망토 5종·어깨 걸친 재킷·체크 담요 숄 — 옷과 같이 입는다) */
export type ExtraGear = { head: string | null; neck: string | null; hand: string | null; back: string | null; pack: string | null };

export function extraGearOf(look: readonly string[]): ExtraGear {
  const pick = (ids: readonly string[]) => look.find((id) => ids.includes(id)) ?? null;
  const backs = GEAR_BACK.filter((id) => itemById(id)?.slot !== "pack");
  const packs = GEAR_BACK.filter((id) => itemById(id)?.slot === "pack");
  return { head: pick(GEAR_HEAD), neck: pick(GEAR_NECK), hand: pick(GEAR_HAND), back: pick(backs), pack: pick(packs) };
}

/** 머리 한 줄의 반폭 (타원 공식, 머리 밖이면 0) */
function halfAt(m: GearM, y: number): number {
  const d = (y + 0.5 - m.hy) / m.ry;
  return d * d >= 1 ? 0 : m.rx * Math.sqrt(1 - d * d);
}

/** 몸마다 눈 자리 (drawFace와 같은 값) */
export function eyes(body: AvatarBody, view: GearView, m: GearM): { xs: number[]; y: number } {
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

/** hem = 걷기 단계 0·1·2 (11/20 회장님 독대 왕관 사원증·머리띠 끈이 흔들린다) */
export function drawHeadGear(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, top: number, hem = 0): void {
  // 11/15: 말랑 꾸미기 묶음은 cuteGear.ts
  if ((CUTE_HEAD as readonly string[]).includes(id)) return drawCuteHead(g, view, id, m, top);
  // 11/17 유령선 한정은 ghostGear.ts
  if ((GHOST_HEAD as readonly string[]).includes(id)) return drawGhostHead(g, view, id, m, top);
  // 12월 크리스마스 이벤트 한정은 xmasGear.ts
  if ((XMAS_HEAD as readonly string[]).includes(id)) return drawXmasHead(g, view, id, m, top);
  // 11/20 회장님 독대 1위 보상은 chairGear.ts
  if ((CHAIR_HEAD as readonly string[]).includes(id)) return drawChairHead(g, view, id, m, top, hem);
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
    case "hat_beret": {
      // 한쪽으로 기운 납작한 베레모 + 꼭지
      const c = 0xc8404e;
      const lo = 0x8e2a36;
      const sh = side ? -1 : view === "up" ? 1 : -1;
      g.hline(cx - 3 + sh, cx + 2 + sh, top - 2, c);
      g.hline(cx - rx + sh, cx + rx - 1 + sh, top - 1, c);
      g.hline(cx - rx + 1, cx + rx - 2, top, lo);
      g.set(cx - 2 + sh, top - 2, 0xe06a74);
      g.set(cx + sh, top - 3, lo);
      break;
    }
    case "hat_hardhat": {
      // 노란 안전모: 둥근 머리 + 가운데 줄 + 앞챙
      const c = 0xf2c43a;
      const lo = 0xc8961a;
      const rows: [number, number][] = [
        [top - 2, Math.max(2, rx - 2)],
        [top - 1, rx - 1],
        [top, rx],
      ];
      for (const [y, h] of rows) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : c);
      g.vline(side ? cx - 1 : cx - 1, top - 2, top, 0xfff09a);
      if (side) g.hline(cx + 1, cx + rx + 1, top + 1, lo);
      else g.hline(cx - rx - 1, cx + rx, top + 1, lo);
      if (view === "down") g.set(cx + 2, top - 1, 0x3aa86a);
      break;
    }
    case "hat_chef": {
      // 하얀 요리사 모자: 띠 + 뭉게뭉게 윗부분 (프레임 위에 붙은 몸은 한 칸 낮게)
      // 11/22 염색 티: 흰 천 네 톤(빛 · 바탕 · 그늘 · 주름) — 띠는 세로 주름, 윗부분은 왼쪽 위가 밝고 오른쪽·뭉치 사이 골이 어둡다 (gearDye GEAR_DYE_REGIONS.hat_chef)
      const [hi, w, sh, deep] = CHEF_TONES;
      const lift = top >= 8 ? 0 : 1;
      const bl = cx - rx + 1;
      const br = cx + rx - 2;
      // 띠: 세로 주름 (두 칸마다 그늘) · 오른쪽 끝 주름 그늘
      for (let x = bl; x <= br; x++) g.set(x, top, x >= br - 1 ? sh : (x - bl) % 2 ? sh : w);
      // 띠 윗줄 = 부푼 윗부분 그림자
      for (let x = bl; x <= br; x++) g.set(x, top - 1, x === bl ? w : x >= br - 1 ? deep : sh);
      for (const [y, h, k] of [
        [top - 2, rx, 0],
        [top - 3, rx, 1],
        [top - 4 + lift, rx - 1, 2],
      ] as [number, number, number][])
        for (let x = cx - h; x < cx + h; x++) {
          const right = x >= cx + h - 2;
          // 뭉치 사이 골 (윗줄은 짙게, 가운데 줄은 그늘)
          const crease = (x === cx - 2 || x === cx + 1) && k > 0;
          g.set(x, y, right ? (k === 0 ? deep : sh) : crease ? (k === 2 ? deep : sh) : k > 0 && x < cx - 2 ? hi : w);
        }
      break;
    }
    case "hat_horns": {
      // 작은 도깨비 뿔 두 개 (끝이 밝다)
      const c = 0xe8603a;
      const tip = 0xfff0c0;
      const horn = (x: number, d: 1 | -1) => {
        g.set(x, top - 1, c);
        g.set(x + d, top - 1, c);
        g.set(x, top - 2, c);
        g.set(x - d, top - 3, tip);
      };
      if (side) horn(cx - 1, 1);
      else {
        horn(cx - 3, 1);
        horn(cx + 2, -1);
      }
      break;
    }
    case "hat_santa": {
      // 빨간 고깔이 옆으로 접히고 흰 털 테두리·방울
      // 11/22 염색 티: 빨간 천 네 톤(빛 · 바탕 · 그늘 · 접힌 골) — 왼쪽 위 빛, 오른쪽 그늘, 접혀 넘어가는 자리 짙게 (흰 털은 그대로)
      const [hi, r, lo, deep] = SANTA_TONES;
      const fur = 0xf8f6f0;
      const d = side ? -1 : 1;
      g.hline(cx - rx, cx + rx - 1, top, fur);
      const l1 = cx - rx + 1;
      const r1 = cx + rx - 2;
      for (let x = l1; x <= r1; x++) g.set(x, top - 1, x <= l1 + 1 ? hi : x >= r1 - 1 ? lo : r);
      for (let x = cx - 3; x <= cx + 2; x++) g.set(x, top - 2, x === cx - 3 ? hi : x >= cx + 1 ? lo : r);
      g.hline(cx - 2 + d, cx + 1 + d, top - 3, lo);
      g.set(cx + (d > 0 ? 1 : -2) + d, top - 3, deep);
      g.set(cx + 3 * d, top - 3, r);
      g.set(cx + 3 * d, top - 2, deep);
      g.rect(d > 0 ? cx + 4 : cx - 5, top - 3, 2, 2, fur);
      break;
    }
    case "staff_crown": {
      // 31번 운영자 왕관: 검은 왕관 + 은빛 끝 + 혼불색 보석
      const c = 0x2a2838;
      const hi = 0xc8d0e0;
      const x0 = cx - 3;
      const w = side ? 5 : 6;
      g.rect(x0, top - 1, w, 2, c);
      g.hline(x0, x0 + w - 1, top, 0x4a4660);
      const spikes = side ? [x0, x0 + 2, x0 + 4] : [x0, x0 + 2, x0 + 3, x0 + 5];
      for (const x of spikes) g.set(x, top - 2, c);
      for (const x of side ? [x0, x0 + 4] : [x0, x0 + 5]) g.set(x, top - 3, hi);
      g.set(side ? x0 + 2 : x0 + 2, top - 3, 0x6ae0ff);
      if (!side) g.set(x0 + 3, top - 3, 0x6ae0ff);
      if (view !== "up") g.set(side ? x0 + 3 : x0 + 2, top - 1, 0x6ae0ff);
      break;
    }
    case "champ_crown": {
      // 주간 포인트 1위: 보통 왕관보다 한 뼘 크고, 띠에 금화가 박힌 금관 + 큰 루비 + 끝마다 진주
      const gold = 0xf6c83a;
      const lo = 0xb8841a;
      const hi = 0xfff4b0;
      const w = side ? 7 : 9;
      const x0 = cx - (side ? 4 : 4) - (side ? 0 : 0);
      g.rect(x0, top - 1, w, 2, gold);
      g.hline(x0, x0 + w - 1, top, lo);
      // 뾰족 끝 (가운데가 가장 높다)
      const tips = side ? [x0, x0 + 3, x0 + 6] : [x0, x0 + 2, x0 + 4, x0 + 6, x0 + 8];
      for (const x of tips) {
        const mid = x === x0 + (side ? 3 : 4);
        // 프레임 위쪽에 붙은 몸(키다리)은 진주가 잘리지 않게 낮춘다 (외곽선 자리까지 맨 위 두 줄은 비워 둔다)
        const tip = Math.max(2, top - (mid ? 5 : 4));
        g.vline(x, tip + 1, top - 2, gold);
        g.set(x, tip, 0xfffaf0); // 진주
      }
      if (!side) for (const x of [x0 + 1, x0 + 3, x0 + 5, x0 + 7]) g.set(x, top - 2, gold);
      // 띠의 금화 (밝은 테 + 가운데 점)
      if (view !== "up")
        for (const x of side ? [x0 + 1, x0 + 4] : [x0 + 1, x0 + 6]) {
          g.set(x, top - 1, hi);
          g.set(x + 1, top - 1, hi);
          g.set(x, top, 0xe0a828);
        }
      // 가운데 큰 루비 (앞모습), 옆모습은 사파이어
      if (view === "down") {
        g.set(x0 + 4, top - 1, 0xe0304a);
        g.set(x0 + 4, top, 0xa01830);
        g.set(x0 + 4, top - 2, 0xff8098);
      } else if (side) g.set(x0 + 3, top - 1, 0x3a7ae8);
      g.set(x0, top - 1, hi);
      break;
    }
    case "champ_plume": {
      // 주간 사냥 처치 1위: 은빛 투구(머리 윗부분) + 꼭대기에서 뒤로 휘날리는 붉은 깃털
      const steel = 0xb8c0cc;
      const shade = 0x7a8496;
      const shine = 0xeef2f8;
      const red = 0xe0283a;
      const redLo = 0x9a1424;
      const redHi = 0xff7a6a;
      for (const [y, h] of [
        [top - 1, Math.max(2, rx - 2)],
        [top, rx - 1],
        [top + 1, rx],
      ] as [number, number][])
        for (let x = cx - h; x < cx + h; x++) g.set(x, y, x < cx - h + 2 ? shine : x >= cx + h - 2 ? shade : steel);
      // 이마 띠 (금 테)
      g.hline(cx - rx, cx + rx - 1, top + 2, 0xd8a838);
      if (view === "down") g.set(cx - 1, top + 2, 0xff5060);
      // 깃털: 앞·뒷모습은 위로 솟아 양쪽으로 갈라지고, 옆모습은 뒤(-x)로 휘날린다
      const h = Math.max(1, Math.min(6, top - 3));
      if (side) {
        for (let i = 0; i < h; i++) {
          const y = top - 2 - i;
          const x = cx - Math.floor((i * i) / 3);
          g.set(x, y, i % 2 ? redLo : red);
          g.set(x - 1, y, red);
          if (i > 1) g.set(x - 2, y + 1, redLo);
        }
        g.set(cx, top - 2, redHi);
      } else {
        for (let i = 0; i < h; i++) {
          const y = top - 2 - i;
          const spread = Math.floor(i / 2);
          g.set(cx - 1 - spread, y, red);
          g.set(cx + spread, y, i % 2 ? redLo : red);
          if (i < h - 1) g.set(cx - 1 + (i % 2), y, view === "up" ? redLo : redHi);
        }
      }
      break;
    }
    case "champ_duo_ph":
    case "champ_duo_pf":
    case "champ_duo_hf": {
      // 다관왕(2관왕) 쌍둥이 왕관: 왼쪽 반은 첫 랭킹 색, 오른쪽 반은 둘째 랭킹 색. 끝마다 그 색 보석, 가운데 두 끝은 맞닿아 높다
      const [a, b] = DUO_COLORS[id];
      const w = side ? 7 : 9;
      const x0 = cx - 4;
      const mid = x0 + Math.floor(w / 2);
      for (let x = x0; x < x0 + w; x++) {
        const c = x < mid || (x === mid && w % 2 === 0) ? a : b;
        g.set(x, top - 1, c.c);
        g.set(x, top, c.lo);
      }
      const tips = side ? [x0, x0 + 3, x0 + 6] : [x0, x0 + 3, x0 + 5, x0 + 8];
      tips.forEach((x, i) => {
        const c = x < mid ? a : b;
        const tall = !side && (i === 1 || i === 2);
        const tip = Math.max(2, top - (tall ? 5 : 4));
        g.vline(x, tip + 1, top - 2, c.c);
        g.set(x, tip, c.gem);
      });
      if (!side) {
        g.set(x0 + 1, top - 2, a.c);
        g.set(x0 + 7, top - 2, b.c);
      }
      // 띠의 두 보석 (앞모습) — 두 랭킹 색
      if (view === "down") {
        g.set(x0 + 2, top - 1, a.gem);
        g.set(x0 + 6, top - 1, b.gem);
      }
      g.set(x0, top - 1, a.hi);
      g.set(x0 + w - 1, top - 1, b.hi);
      break;
    }
    case "champ_triple": {
      // 3관왕 대관: 가장 크고 화려하게 — 넓은 금 띠 위로 다섯 끝이 솟고(가운데가 가장 높다), 끝마다 무지개 보석, 띠에도 무지개 보석이 줄지어 박힌다
      const gold = 0xf6c83a;
      const lo = 0xb8841a;
      const hi = 0xfff4b0;
      const w = side ? 9 : 11;
      const x0 = cx - 5;
      g.rect(x0, top - 2, w, 3, gold);
      g.hline(x0, x0 + w - 1, top, lo);
      g.hline(x0, x0 + w - 1, top - 2, hi);
      const tips = side ? [x0, x0 + 4, x0 + 8] : [x0, x0 + 3, x0 + 5, x0 + 7, x0 + 10];
      tips.forEach((x, i) => {
        const center = side ? i === 1 : i === 2;
        const tip = Math.max(2, top - (center ? 6 : i === 1 || i === 3 ? 5 : 4));
        g.vline(x, tip + 1, top - 3, gold);
        g.set(x, tip, RAINBOW_GEMS[i % RAINBOW_GEMS.length]);
      });
      if (!side) for (const x of [x0 + 2, x0 + 4, x0 + 6, x0 + 8]) g.set(x, top - 3, gold);
      if (view !== "up") {
        // 띠의 무지개 보석
        const gems = side ? [x0 + 2, x0 + 4, x0 + 6] : [x0 + 1, x0 + 3, x0 + 5, x0 + 7, x0 + 9];
        gems.forEach((x, i) => g.set(x, top - 1, RAINBOW_GEMS[(i + 2) % RAINBOW_GEMS.length]));
      }
      break;
    }
    case "q_hat_angler": {
      // 11/15 수집 의뢰: 낚시꾼 벙거지 — 올리브 천 + 짙은 띠 + 띠에 꽂은 빨강·흰 찌와 깃털 루어, 사방으로 처진 챙
      const c = 0x76904e;
      const lo = 0x55703a;
      const hi = 0x9ab46e;
      const band = 0x3c4e2a;
      const brim = 0x627c40;
      const sh = side ? -1 : 0;
      g.hline(cx - 3 + sh, cx + 2 + sh, top - 3, hi);
      for (let x = cx - rx + 1 + sh; x <= cx + rx - 2 + sh; x++) g.set(x, top - 2, x >= cx + rx - 3 + sh ? lo : x <= cx - rx + 2 + sh ? hi : c);
      g.hline(cx - rx + 1 + sh, cx + rx - 2 + sh, top - 1, band);
      // 챙: 옆모습은 앞(+x)으로 길게, 앞·뒷모습은 양쪽으로 처진다
      if (side) {
        g.hline(cx - rx - 1, cx + rx + 1, top, brim);
        g.set(cx + rx + 2, top + 1, lo);
        g.set(cx - rx - 2, top + 1, lo);
      } else {
        g.hline(cx - rx - 1, cx + rx, top, brim);
        g.set(cx - rx - 2, top + 1, lo);
        g.set(cx + rx + 1, top + 1, lo);
        g.hline(cx - rx + 1, cx + rx - 2, top, view === "down" ? lo : brim);
      }
      // 찌 (띠에 꽂아 위로): 흰 안테나 · 빨강 머리 · 흰 몸
      const fx = side ? cx - 3 : view === "up" ? cx + 2 : cx - 3;
      g.set(fx, top - 4, 0xfff4e0);
      g.set(fx, top - 3, 0xe8403a);
      g.set(fx, top - 2, 0xf4f0e6);
      // 깃털 루어 (앞·옆): 노랑 몸 + 파랑 깃털 + 은빛 바늘
      if (view !== "up") {
        const lx = side ? cx + 1 : cx + 2;
        g.set(lx, top - 1, 0xffd04a);
        g.set(lx + 1, top - 2, 0x3ab0e0);
        g.set(lx + 1, top - 1, 0xc8d0dc);
      }
      break;
    }
    case "q_hat_snow": {
      // 11/15 수집 의뢰 눈 털모자: 남색 털실 + 흰 눈꽃 무늬 두 송이 + 흰 골지 단 + 동그란 흰 방울 (떨어지는 눈송이는 cosmeticFx)
      const c = 0x2e4a8e;
      const lo = 0x1e3270;
      const hi = 0x4a6ab8;
      const snow = 0xf4f8ff;
      const rows: [number, number][] = [
        [top - 2, Math.max(2, Math.round(rx * 0.6))],
        [top - 1, Math.round(rx * 0.9)],
        [top, rx],
        [top + 1, rx],
      ];
      for (const [y, h] of rows) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : x === cx - h ? hi : c);
      // 눈꽃 두 송이 (흰 점 + 하늘색 가지)
      for (const x of side ? [cx - 3, cx + 1] : [cx - 3, cx + 2]) {
        g.set(x, top, snow);
        g.set(x - 1, top, 0x9ab8f0);
        g.set(x + 1, top, 0x9ab8f0);
        g.set(x, top + 1, 0x9ab8f0);
      }
      // 골지 단 (흰·하늘 번갈아)
      for (let x = cx - rx; x < cx + rx; x++) g.set(x, top + 2, (x + cx) % 2 ? snow : 0xc8d8f0);
      // 동그란 방울
      const px = side ? cx - 2 : cx - 1;
      g.set(px, top - 4, snow);
      g.hline(px - 1, px + 1, top - 3, snow);
      g.hline(px - 1, px + 1, top - 2, snow);
      g.set(px + 1, top - 2, 0xb8cce8);
      g.set(px - 1, top - 3, 0xffffff);
      break;
    }
    case "q_hat_miner": {
      // 11/15 수집 의뢰: 광부 헬멧 — 구릿빛 둥근 헬멧 + 가운데 등줄 + 챙, 이마에 둥근 등불 (불빛은 drawHeadGlow · 밤 빛은 AvatarView lantern)
      const c = 0xd98a2e;
      const lo = 0xa2581a;
      const hi = 0xf6c070;
      const rows: [number, number][] = [
        [top - 2, Math.max(2, rx - 2)],
        [top - 1, rx - 1],
        [top, rx],
      ];
      for (const [y, h] of rows) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : x <= cx - h ? hi : c);
      g.vline(cx - 1, top - 2, top, hi);
      if (side) g.hline(cx - rx, cx + rx + 1, top + 1, lo);
      else g.hline(cx - rx - 1, cx + rx, top + 1, lo);
      if (view === "down") {
        // 등불 테 (렌즈는 외곽선 다음 drawHeadGlow)
        g.rect(cx - 2, top - 2, 3, 3, 0x4a4a58);
      } else if (side) {
        g.rect(cx + rx - 2, top - 2, 2, 3, 0x4a4a58);
      } else {
        // 뒷모습: 배터리 상자 + 고무줄
        g.hline(cx - rx, cx + rx - 1, top + 2, 0x2e2e36);
        g.rect(cx - 2, top + 2, 3, 2, 0x4a4a58);
        g.set(cx - 1, top + 2, 0x7ae07a);
      }
      break;
    }
    case "u_hat_siren": {
      // 11/15 긴급 의뢰 가장 많이 낸 사람: 남색 배달 모자 + 정수리 은색 받침 위 빨간 경광등 (도는 불빛은 cosmeticFx uSiren)
      const c = 0x2e3f74;
      const lo = 0x1d2850;
      const hi = 0x4a5e9e;
      const rows: [number, number][] = [
        [top - 1, Math.max(2, rx - 1)],
        [top, rx],
      ];
      for (const [y, h] of rows) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : x <= cx - h ? hi : c);
      // 노란 띠 (배달 모자)
      for (let x = cx - rx; x < cx + rx; x++) g.set(x, top + 1, x % 2 ? 0xf2c43a : 0xd8a62a);
      // 챙: 앞모습은 아래로, 옆모습은 앞(+x)으로
      if (view === "down") g.hline(cx - rx + 1, cx + rx - 2, top + 2, lo);
      else if (side) g.hline(cx + rx - 2, cx + rx + 1, top + 1, lo);
      // 경광등 받침 (은색) + 빨간 돔
      g.hline(cx - 2, cx + 1, top - 2, 0xb8c0cc);
      g.set(cx + 1, top - 2, 0x8a92a0);
      g.hline(cx - 2, cx + 1, top - 3, 0xe8392a);
      g.set(cx + 1, top - 3, 0xb02218);
      g.hline(cx - 1, cx, top - 4, 0xff5a44);
      g.set(cx - 1, top - 4, 0xffb0a0);
      break;
    }
    case "champ_fishhat": {
      // 주간 낚시 1위: 머리 위에 통통한 황금 물고기 (머리 쪽에 큰 눈, 반대쪽에 위로 갈라진 꼬리, 등에 지느러미)
      // 옆모습은 앞(+x)을 보고, 앞·뒷모습은 머리가 왼쪽
      const gold = 0xf4c030;
      const lo = 0xb07a14;
      const hi = 0xfff0a0;
      const fin = 0xff8a2a;
      const d = side ? 1 : -1; // 머리 쪽 방향
      const len = 9;
      const head = side ? cx + 4 : cx - 5; // 머리 끝 x
      const xAt = (i: number) => head - d * i; // i = 머리에서 꼬리 쪽으로
      // 몸통 3줄 (가운데 줄이 가장 길다), 아랫줄은 그늘
      for (let i = 0; i < len; i++) {
        const x = xAt(i);
        if (i > 0 && i < len - 1) g.set(x, top - 2, i === 3 || i === 5 ? hi : gold);
        g.set(x, top - 1, gold);
        if (i > 0 && i < len - 1) g.set(x, top, i > 2 && i < 6 ? hi : lo);
      }
      // 꼬리: 위아래로 갈라져 솟는다
      const tx = xAt(len);
      g.set(tx, top - 1, fin);
      g.set(tx - d, top - 2, fin);
      g.set(tx - d, top - 3, fin);
      g.set(tx - d, top, fin);
      g.set(tx - d * 2, top - 4 < 2 ? 2 : top - 4, fin);
      // 등지느러미
      g.set(xAt(4), top - 3, fin);
      g.set(xAt(5), top - 3, fin);
      // 눈 (흰자 + 검은 눈동자) — 뒷모습은 없음
      if (view !== "up") {
        g.set(xAt(1), top - 2, 0xffffff);
        g.set(xAt(1), top - 1, 0x1a1a24);
        g.set(head + d, top - 1, lo); // 입
      }
      break;
    }
  }
}

/** 다관왕 쌍둥이 왕관 색 (랭킹 색: 포인트 금 · 사냥 빨강 · 낚시 파랑) */
type CrownColor = { c: number; lo: number; hi: number; gem: number };
const CROWN_GOLD: CrownColor = { c: 0xf6c83a, lo: 0xb8841a, hi: 0xfff4b0, gem: 0xfffaf0 };
const CROWN_RED: CrownColor = { c: 0xe0384a, lo: 0x98202e, hi: 0xff9a8a, gem: 0xffd0c8 };
const CROWN_BLUE: CrownColor = { c: 0x3aa8f0, lo: 0x1a5aa8, hi: 0xbfeaff, gem: 0xe8faff };
const DUO_COLORS: Record<string, [CrownColor, CrownColor]> = {
  champ_duo_ph: [CROWN_GOLD, CROWN_RED],
  champ_duo_pf: [CROWN_GOLD, CROWN_BLUE],
  champ_duo_hf: [CROWN_RED, CROWN_BLUE],
};
/** 11/22 요리사 모자 흰 천 네 톤 (빛 · 바탕 · 그늘 · 주름) — 염색 때 함께 옮겨 간다 (gearDye GEAR_DYE_REGIONS.hat_chef) */
export const CHEF_TONES = [0xfefefb, 0xf2f2ea, 0xdcdcd2, 0xc4c4b8] as const;
/** 11/22 출근 배낭 국방색 천 네 톤 (빛 · 바탕 · 그늘 · 짙은 그늘) */
export const BACKPACK_TONES = [0x9aaa6a, 0x7a8a4a, 0x5c6838, 0x444e28] as const;
/** 11/22 산타 모자 빨간 천 네 톤 (빛 · 바탕 · 그늘 · 접힌 골) */
export const SANTA_TONES = [0xf0505a, 0xd8323c, 0xa02430, 0x74121e] as const;
/** 3관왕 대관 무지개 보석 */
const RAINBOW_GEMS = [0xff4a5a, 0xffa030, 0xfff06a, 0x5ae08a, 0x4ab0ff, 0xb87aff];

// ── 목 ──

export function drawNeckGear(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody): void {
  if ((CUTE_NECK as readonly string[]).includes(id)) return drawCuteNeck(g, view, id, m, body);
  if ((XMAS_NECK as readonly string[]).includes(id)) return drawXmasNeck(g, view, id, m, body);
  // 11/17 테마 꾸미기 묶음은 themeGear.ts
  if ((THEME_NECK as readonly string[]).includes(id)) return drawThemeNeck(g, view, id, m, body);
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
    case "neck_collar": {
      // 흰 셔츠 깃 두 장
      const w = 0xf8f8f4;
      const lo = 0xc8c8c0;
      if (view === "up") {
        g.hline(cx - 2, cx + 1, neck, w);
        break;
      }
      if (side) {
        g.hline(cx + 1, cx + 2, neck, w);
        g.set(cx + 2, neck + 1, lo);
        break;
      }
      g.hline(cx - 3, cx - 2, neck, w);
      g.hline(cx + 1, cx + 2, neck, w);
      g.set(cx - 2, neck + 1, lo);
      g.set(cx + 1, neck + 1, lo);
      break;
    }
    case "neck_whistle": {
      const cord = 0xe84a5a;
      const metal = 0xc8ccd8;
      if (view === "up") {
        g.hline(cx - 2, cx + 1, neck, cord);
        break;
      }
      if (side) {
        g.set(cx + 1, neck, cord);
        g.set(cx + 2, neck + 1, cord);
        g.hline(cx + 2, cx + 3, neck + 2, metal);
        break;
      }
      g.set(cx - 2, neck, cord);
      g.set(cx + 1, neck, cord);
      g.set(cx - 1, neck + 1, cord);
      g.set(cx, neck + 1, cord);
      g.hline(cx - 1, cx + 1, neck + 2, metal);
      g.set(cx + 1, neck + 2, 0x8a90a0);
      break;
    }
    case "neck_camera": {
      const strap = 0x2a2a34;
      const body = 0x3a3a46;
      if (view === "up") {
        g.hline(cx - half, cx + half - 1, neck, strap);
        break;
      }
      if (side) {
        g.set(cx + 1, neck, strap);
        g.rect(cx + 1, neck + 1, 3, 3, body);
        g.set(cx + 3, neck + 2, 0x8ad0f0);
        break;
      }
      g.set(cx - 3, neck, strap);
      g.set(cx + 2, neck, strap);
      g.rect(cx - 2, neck + 1, 4, 3, body);
      g.hline(cx - 2, cx + 1, neck + 1, 0x5a5a68);
      g.set(cx - 1, neck + 2, 0x8ad0f0);
      g.set(cx, neck + 2, 0x4a7aa8);
      g.set(cx + 1, neck + 1, 0xf4f4f4);
      break;
    }
    case "neck_pearl": {
      const pearl = 0xf8f4ec;
      const shade = 0xc8c0b4;
      for (let x = cx - half; x < cx + half; x++) g.set(x, neck, (x + 8) % 2 ? pearl : shade);
      if (view === "down") {
        g.hline(cx - 2, cx + 1, neck + 1, pearl);
        g.set(cx - 1, neck + 2, 0xf0a8bc);
        g.set(cx, neck + 2, 0xf0a8bc);
      } else if (side) g.set(cx + 2, neck + 1, pearl);
      break;
    }
    case "neck_medal": {
      const red = 0xd8404a;
      const blue = 0x3a6ac8;
      const gold = 0xf2c43a;
      if (view === "up") {
        g.hline(cx - 2, cx - 1, neck, red);
        g.hline(cx, cx + 1, neck, blue);
        break;
      }
      if (side) {
        g.set(cx + 1, neck, red);
        g.set(cx + 2, neck + 1, blue);
        g.rect(cx + 2, neck + 2, 2, 2, gold);
        g.set(cx + 2, neck + 2, 0xfff0a0);
        break;
      }
      g.set(cx - 2, neck, red);
      g.set(cx - 1, neck + 1, red);
      g.set(cx + 1, neck, blue);
      g.set(cx, neck + 1, blue);
      g.rect(cx - 1, neck + 2, 2, 2, gold);
      g.set(cx - 1, neck + 2, 0xfff0a0);
      g.set(cx, neck + 3, 0xb88a1a);
      break;
    }
    case "staff_armband": {
      // 31번 관리자 완장: 팔(어깨 아래)에 빨간 띠 + 노란 글자 자리
      const red = 0xd8323c;
      const mark = 0xf2d04a;
      const y = m.shY;
      if (side) {
        g.rect(cx - 1, y, 3, 2, red);
        g.set(cx, y, mark);
      } else {
        const x = view === "down" ? m.shL : m.shR - 1;
        g.rect(x, y, 2, 2, red);
        g.set(view === "down" ? x : x + 1, y, mark);
      }
      break;
    }
  }
}

// ── 손: 11/22부터 손 꾸미기 그림·자리는 heldGear.ts (avatarCore drawHeld가 레이어에 그려 얹는다) ──

/** 외곽선 뒤에도 밝게 남는 점 (머리 꾸미기): 광부 헬멧 이마 등불 */
export function drawHeadGlow(g: Grid, view: GearView, id: string, m: GearM, top: number): void {
  if ((GHOST_HEAD as readonly string[]).includes(id)) return drawGhostHeadGlow(g, view, id, m, top);
  if ((XMAS_HEAD as readonly string[]).includes(id)) return drawXmasGlow(g, view, id, m, top);
  if ((CHAIR_HEAD as readonly string[]).includes(id)) return drawChairHeadGlow(g, view, id, m, top);
  if (id === "u_hat_siren") {
    // 경광등 돔은 외곽선 뒤에도 밝게
    g.set(m.cx - 1, top - 4, 0xffd0c4);
    g.set(m.cx, top - 4, 0xff6a50);
    g.set(m.cx - 1, top - 3, 0xff7a60);
    return;
  }
  if (id !== "q_hat_miner" || view === "up") return;
  if (view === "down") {
    g.set(m.cx - 1, top - 1, 0xfff8d8);
    g.set(m.cx - 2, top - 1, 0xffe48a);
    g.set(m.cx, top - 1, 0xffe48a);
    g.set(m.cx - 1, top - 2, 0xffe48a);
  } else {
    const lx = m.cx + Math.round(m.rx) - 1;
    g.set(lx, top - 1, 0xfff8d8);
    g.set(lx, top - 2, 0xffe48a);
    g.set(lx + 1, top - 1, 0xffd060, 200);
  }
}

// ── 등 ──

/**
 * 등에 메는 것. layer "back" = 몸보다 먼저(앞·옆모습에서 몸 뒤로 삐져나온 부분), "front" = 몸 다음(뒷모습에서 등을 덮는다).
 * hem: 이불 유령 밑단 물결 위상 (망토 자락 흔들림에 같이 쓴다)
 */
export function drawBackGear(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, layer: "back" | "front", hem: number, sit: number): void {
  if ((CUTE_BACK as readonly string[]).includes(id)) return drawCuteBack(g, view, id, m, body, layer, hem, sit);
  if ((XMAS_BACK as readonly string[]).includes(id)) return drawXmasBack(g, view, id, m, body, layer, hem, sit);
  if ((THEME_BACK as readonly string[]).includes(id)) return drawThemeBack(g, view, id, m, body, layer, hem, sit);
  const { cx, shY, shL, shR } = m;
  const side = view === "side";
  const up = view === "up";
  if (id === "back_backpack") {
    // 11/22 염색 티: 국방색 천 네 톤 (빛 · 바탕 · 그늘 · 짙은 그늘) — 왼쪽 빛, 오른쪽·밑단 그늘, 앞주머니는 덮개 그림자로 한 단 깊게 (갈색 끈·버클은 그대로)
    const [hi, c, lo, deep] = BACKPACK_TONES;
    const strap = 0x5a4a32;
    if (up && layer === "front") {
      const w = body === "tall" ? 6 : 7;
      const x0 = Math.round(cx - w / 2);
      const x1 = x0 + w - 1;
      for (let y = shY - 1; y <= shY + 4; y++)
        for (let x = x0; x <= x1; x++) {
          const bottom = y === shY + 4;
          g.set(x, y, y === shY - 1 ? (x === x1 ? c : hi) : x === x0 ? hi : x === x1 ? (bottom ? deep : lo) : bottom ? lo : c);
        }
      // 앞주머니: 윗줄 = 덮개 그림자(짙게), 아랫줄 = 그늘
      g.hline(x0 + 1, x1 - 1, shY + 2, deep);
      g.hline(x0 + 1, x1 - 1, shY + 3, lo);
      g.set(cx - 1, shY + 2, 0xd8c8a0);
      g.hline(x0 + 1, x0 + w - 2, shY, strap);
    } else if (side && layer === "back") {
      g.rect(cx - 7, shY - 1, 4, 6, c);
      g.hline(cx - 6, cx - 4, shY - 1, hi);
      g.vline(cx - 7, shY + 1, shY + 4, lo);
      g.hline(cx - 6, cx - 4, shY + 4, deep);
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
  if (id === "back_shell") {
    // 거북 등껍질: 초록 등딱지 + 밝은 무늬 칸
    const c = 0x5a8a4a;
    const plate = 0x8aba6a;
    if (up && layer === "front") {
      g.ellipse(cx, shY + 2, 4.6, 3.8, c);
      g.rect(cx - 1, shY + 1, 2, 2, plate);
      g.set(cx - 3, shY + 2, plate);
      g.set(cx + 2, shY + 2, plate);
      g.set(cx - 2, shY + 4, plate);
      g.set(cx + 1, shY + 4, plate);
      g.hline(cx - 4, cx + 3, shY + 5, 0xd8c87a);
    } else if (side && layer === "back") {
      g.ellipse(cx - 5, shY + 2, 2.6, 3.6, c);
      g.set(cx - 6, shY + 1, plate);
      g.set(cx - 6, shY + 3, plate);
    } else if (view === "down" && layer === "back") g.ellipse(cx, shY + 2, 6, 3.6, c);
    else if (view === "down" && layer === "front") {
      // 앞에서는 어깨 위로 등딱지 테두리가 살짝
      g.hline(shL, shL + 1, shY - 1, c);
      g.hline(shR - 1, shR, shY - 1, c);
    }
    return;
  }
  if (id === "back_guitar") {
    // 통기타: 몸통 + 지판 (앞모습은 어깨 너머 머리 + 가슴을 가로지르는 끈)
    const wood = 0xc8803a;
    const neckC = 0x5a3a20;
    const strap = 0x3a2a1a;
    if (up && layer === "front") {
      line(g, cx - 1, shY + 1, cx - 5, shY - 5, neckC);
      g.ellipse(cx + 1, shY + 3, 2.8, 2.6, wood);
      g.set(cx + 1, shY + 3, 0x2a1a0a);
      g.rect(cx - 6, shY - 7, 2, 2, neckC);
    } else if (side && layer === "back") {
      line(g, cx - 4, shY + 2, cx - 6, shY - 6, neckC);
      g.ellipse(cx - 5, shY + 4, 2, 2.6, wood);
      g.rect(cx - 7, shY - 8, 2, 2, neckC);
    } else if (view === "down" && layer === "back") {
      line(g, cx - 5, shY, cx - 7, shY - 6, neckC);
      g.rect(cx - 8, shY - 8, 2, 2, neckC);
    } else if (view === "down" && layer === "front") line(g, shL + 1, shY, shR - 1, shY + 3, strap);
    return;
  }
  if (id === "back_jetpack") {
    // 제트팩: 은색 통 둘 + 빨간 뚜껑 + 아래 불꽃
    const metal = 0xb8c0cc;
    const lo = 0x7a8292;
    const tank = (x: number, y: number, h: number) => {
      g.rect(x, y, 2, h, metal);
      g.vline(x + 1, y + 1, y + h - 1, lo);
      g.hline(x, x + 1, y, 0xd8403a);
      g.set(x, y + h, 0xffb03a);
      g.set(x + 1, y + h, 0xfff07a);
      g.set(x, y + h + 1, 0xff7a2a, 200);
    };
    if (up && layer === "front") {
      tank(cx - 3, shY - 1, 5);
      tank(cx + 1, shY - 1, 5);
      g.hline(cx - 1, cx, shY + 1, 0x4a4a58);
    } else if (side && layer === "back") tank(body === "sheet" || body === "round" ? cx - 8 : cx - 6, shY - 1, 5);
    else if (view === "down" && layer === "back") {
      g.rect(cx - 6, shY - 2, 2, 3, metal);
      g.rect(cx + 4, shY - 2, 2, 3, metal);
      g.hline(cx - 6, cx - 5, shY - 2, 0xd8403a);
      g.hline(cx + 4, cx + 5, shY - 2, 0xd8403a);
    } else if (view === "down" && layer === "front") {
      g.vline(shL + 2, shY, shY + 2, 0x4a4a58);
      g.vline(shR - 2, shY, shY + 2, 0x4a4a58);
    }
    return;
  }
  if (id === "q_back_cape") {
    // 11/15 수집 의뢰 채집왕 망토 (희귀): 깊은 보랏빛 비단 + 금테 + 등에 금실 나비 문장, 걸쇠엔 청록 보석 (금가루는 cosmeticFx)
    const c = 0x5a3a9e;
    const lo = 0x3c2672;
    const hi = 0x7e5cc8;
    const gold = 0xf2c43a;
    const goldLo = 0xb8841a;
    const gem = 0x5ae8d0;
    const bottom = sit ? 26 : 25;
    if (up && layer === "front") {
      for (let y = shY - 1; y <= bottom; y++) {
        const spread = Math.round((y - shY) * 0.5);
        const x0 = shL - spread;
        const x1 = shR + spread;
        for (let x = x0; x <= x1; x++) {
          if (y === bottom && (x + hem) % 3 === 2) continue;
          const edge = x === x0 || x === x1;
          // 11/22 세로 주름 (네 칸마다 그늘 · 그 왼쪽 빛) — 펄럭이는 자락이 입체로, 염색해도 결이 남는다
          const fold = y > shY && (x - cx + 40) % 4;
          g.set(x, y, y >= bottom - 1 ? (y === bottom ? goldLo : gold) : edge ? gold : x <= x0 + 1 ? hi : x >= x1 - 1 ? lo : fold === 0 ? lo : fold === 3 ? hi : c);
        }
      }
      g.hline(shL, shR, shY - 1, gold);
      // 금실 나비 문장 (등 가운데)
      const ey = shY + 3;
      for (const [dx, dy] of [[-2, 0], [-1, 1], [1, 1], [2, 0], [-2, 1], [2, 1], [-1, 2], [1, 2]]) g.set(cx + dx, ey + dy, gold);
      g.vline(cx, ey, ey + 2, 0xfff0b0);
      g.set(cx - 1, ey - 1, goldLo);
      g.set(cx + 1, ey - 1, goldLo);
    } else if (side && layer === "back") {
      for (let y = shY; y <= bottom; y++) {
        const t = (y - shY) / Math.max(1, bottom - shY);
        const back = Math.round(2 + t * 5 + (y === bottom ? hem % 2 : 0));
        for (let x = cx - back - 2; x <= cx; x++) g.set(x, y, y === bottom ? gold : x === cx - back - 2 ? lo : c);
      }
      // 안감 (청록)
      g.vline(cx - 1, shY + 1, bottom - 2, 0x2a8a7a);
    } else if (view === "down" && layer === "back") {
      for (let y = shY; y <= bottom; y++) {
        const spread = 1 + Math.round((y - shY) * 0.55);
        for (let x = shL - spread; x <= shR + spread; x++) {
          if (y === bottom && (x + hem) % 3 === 2) continue;
          const edge = x === shL - spread || x === shR + spread;
          g.set(x, y, y === bottom ? gold : edge ? hi : x < cx ? lo : c);
        }
      }
    } else if (view === "down" && layer === "front") {
      g.set(shL + 1, shY - 1, gold);
      g.set(shR - 1, shY - 1, gold);
      g.set(shL + 1, shY, gem);
      g.set(shR - 1, shY, gem);
    }
    return;
  }
  if (id === "back_cape" || id === "staff_robe") {
    // 퇴근 망토 (빨강·금 걸쇠) / 31번 저승 도포 (검정·붉은 안감·푸른 걸쇠)
    const robe = id === "staff_robe";
    const c = robe ? 0x24222c : 0xb83a4a;
    const lo = robe ? 0x8a2430 : 0x8a2a38;
    const hi = robe ? 0x3a3846 : 0xd85a68;
    const clasp = robe ? 0x6ae0ff : 0xf2c43a;
    const bottom = sit === 1 ? 26 : sit === 2 ? 25 : 25;
    if (up && layer === "front") {
      for (let y = shY - 1; y <= bottom; y++) {
        const spread = Math.round((y - shY) * 0.45);
        const x0 = shL - spread;
        const x1 = shR + spread;
        for (let x = x0; x <= x1; x++) {
          if (y === bottom && (x + hem) % 3 === 2) continue;
          // 11/22 퇴근 망토: 세로 주름 (네 칸마다 그늘 · 그 왼쪽 빛) + 밑단 짙은 그늘 (도포는 예전 그대로)
          const fold = !robe && y > shY && (x - cx + 40) % 4;
          g.set(x, y, x <= x0 + 1 ? hi : x >= x1 - 1 ? lo : fold === 0 ? lo : fold === 3 ? hi : !robe && y === bottom ? lo : c);
        }
      }
      g.hline(shL, shR, shY - 1, clasp);
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
          g.set(x, y, robe ? (x === shL - spread || x === shR + spread ? lo : c) : x < cx ? lo : c);
        }
      }
    } else if (view === "down" && layer === "front") {
      g.set(shL + 1, shY - 1, clasp);
      g.set(shR - 1, shY - 1, clasp);
    }
  }
}

/** 두 점 사이 선 (avatar.ts line과 같다) */
function line(g: Grid, x0: number, y0: number, x1: number, y1: number, c: number): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    g.set(x0, y0, c);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}
