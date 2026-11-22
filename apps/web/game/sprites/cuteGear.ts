import type { AvatarBody } from "@tomb/protocol";
import type { GearM, GearView } from "./avatarGear";
import { Grid, type Color } from "./pixel";

// 11/15: 말랑 꾸미기 묶음 중 "아바타 시트에 같이 그려지는 것" (avatarGear.ts의 머리·목·손·등 그리기가 여기로 넘긴다).
//  작고 말랑한 동물 친구 느낌: 파스텔 · 동그란 귀 · 볼터치 · 점 눈. 그림 규칙은 avatarGear와 같다
//  (몸 기준점 GearM에 맞춰 6가지 몸 모두에 맞고, 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다).

export const CUTE_HEAD = ["hat_bearband", "hat_mochibun", "hat_hamhood", "hat_chicknest"] as const;
export const CUTE_NECK = ["neck_bib", "neck_mochi"] as const;
export const CUTE_HAND = ["hand_bungeo", "hand_plush", "hand_dango"] as const;
export const CUTE_BACK = ["back_bunnybag", "back_milkcape"] as const;
/** 두건 꼭지·새싹을 덮는 모자 */
export const CUTE_COVERING = ["hat_mochibun", "hat_hamhood"] as const;

/** 11/22 찹쌀떡 토끼 모자 떡 네 톤 (윤기 · 바탕 · 그늘 · 짙은 그늘) — 염색 때 함께 옮겨 간다 */
export const MOCHI_TONES = [0xfffdf9, 0xfbf5ec, 0xeae0d2, 0xd8ccbc] as const;
const BLUSH = 0xf6a0b4;
const EYE = 0x3a2a2e;

// ── 머리 ──

export function drawCuteHead(g: Grid, view: GearView, id: string, m: GearM, top: number): void {
  const { cx } = m;
  const side = view === "side";
  const rx = Math.round(m.rx);
  switch (id) {
    case "hat_bearband": {
      // 말랑 곰 귀 머리띠: 머리 위를 지나는 갈색 띠 + 동그란 곰 귀 둘 (앞에서는 분홍 귀 속)
      const fur = 0xd49a62;
      const lo = 0xa8703e;
      const inner = 0xf6b8b8;
      const band = 0x8a5a36;
      const ear = (x0: number, pink: boolean) => {
        g.hline(x0 + 1, x0 + 2, top - 3, fur);
        g.hline(x0, x0 + 3, top - 2, fur);
        g.hline(x0, x0 + 3, top - 1, lo);
        if (pink) g.hline(x0 + 1, x0 + 2, top - 2, inner);
      };
      if (side) {
        ear(cx - 3, false);
        g.hline(cx - 3, cx + 1, top, band);
      } else {
        ear(cx - rx, view === "down");
        ear(cx + rx - 4, view === "down");
        g.hline(cx - rx + 1, cx + rx - 2, top, band);
      }
      break;
    }
    case "hat_mochibun": {
      // 찹쌀떡 토끼 모자: 하얀 말랑 모자 + 양옆으로 처진 토끼 귀 + 모자에 그린 점 눈·볼터치
      // 11/22 염색 티: 떡 네 톤(윤기 · 바탕 · 그늘 · 아래 짙은 그늘) — 왼쪽 위 윤기, 오른쪽으로 갈수록 그늘, 아랫단은 짙게 (gearDye GEAR_DYE_REGIONS.hat_mochibun)
      const [shine, c, mid, lo] = MOCHI_TONES;
      const pink = 0xf6c0cc;
      const rows: [number, number][] = [
        [top - 2, Math.max(2, Math.round(rx * 0.55))],
        [top - 1, Math.round(rx * 0.85)],
        [top, rx],
        [top + 1, rx],
      ];
      for (const [y, h] of rows)
        for (let x = cx - h; x < cx + h; x++) {
          const bottom = y === top + 1;
          const col = x === cx + h - 1 || (bottom && x >= cx + h - 3) ? lo : x === cx + h - 2 || bottom ? mid : (y === top - 2 || y === top - 1) && x <= cx - h + 2 ? shine : c;
          g.set(x, y, col);
        }
      // 처진 귀 (앞·뒤 = 양옆, 옆 = 뒤쪽 하나)
      const ear = (x: number, inner: boolean) => {
        g.rect(x, top, 2, 4, c);
        g.vline(x + (x < cx ? 0 : 1), top + 1, top + 2, mid);
        g.set(x, top + 3, lo);
        g.set(x + 1, top + 3, lo);
        if (inner) g.vline(x + (x < cx ? 1 : 0), top + 1, top + 2, pink);
      };
      if (side) ear(cx - rx - 1, true);
      else {
        ear(cx - rx - 2, view === "down");
        ear(cx + rx, view === "down");
      }
      if (view === "down") {
        g.set(cx - 2, top - 1, EYE);
        g.set(cx + 1, top - 1, EYE);
        g.set(cx - 3, top, BLUSH);
        g.set(cx + 2, top, BLUSH);
        g.set(cx - 1, top, 0xd8a0a8);
      } else if (side) {
        g.set(cx + 2, top - 1, EYE);
        g.set(cx + 3, top, BLUSH);
      }
      break;
    }
    case "hat_hamhood": {
      // 햄찌 털모자: 주황 털 두건이 얼굴 둘레를 감싸고, 작고 동그란 귀 + 이마의 크림 줄무늬 + 볼 아래 크림 털
      const c = 0xf0a85e;
      const lo = 0xc8803a;
      const cream = 0xfff0d8;
      const ear = 0xf6b8b8;
      const rows: [number, number][] = [
        [top - 1, Math.max(2, rx - 1)],
        [top, rx],
        [top + 1, rx],
      ];
      for (const [y, h] of rows) for (let x = cx - h; x < cx + h; x++) g.set(x, y, x >= cx + h - 2 ? lo : c);
      // 귀
      const ears = side ? [cx - 3] : [cx - rx + 1, cx + rx - 3];
      for (const ex of ears) {
        g.hline(ex, ex + 1, top - 2, c);
        if (view === "down") g.set(ex + (ex < cx ? 1 : 0), top - 2, ear);
      }
      const bottom = Math.round(m.hy) + 1;
      if (view === "up") {
        // 뒷모습: 머리 뒤를 다 덮는다 (가운데 크림 줄)
        for (let y = top + 2; y <= bottom; y++) for (let x = cx - rx; x < cx + rx; x++) g.set(x, y, x >= cx + rx - 2 ? lo : c);
        g.vline(cx - 1, top - 1, top + 2, cream);
      } else if (side) {
        // 옆: 뒤통수 쪽을 덮는다
        for (let y = top + 2; y <= bottom; y++) for (let x = cx - rx; x < cx; x++) g.set(x, y, x === cx - 1 ? lo : c);
        g.set(cx - 1, bottom, cream);
        g.set(cx - 2, bottom, cream);
      } else {
        // 앞: 얼굴 양옆 테두리 + 아래 볼 털
        for (let y = top + 2; y <= bottom; y++) {
          g.set(cx - rx, y, c);
          g.set(cx + rx - 1, y, lo);
        }
        g.set(cx - rx, bottom, cream);
        g.set(cx - rx + 1, bottom, cream);
        g.set(cx + rx - 1, bottom, cream);
        g.set(cx + rx - 2, bottom, cream);
        g.hline(cx - 1, cx, top - 1, cream);
        g.hline(cx - 1, cx, top, cream);
      }
      break;
    }
    case "hat_chicknest": {
      // 병아리 둥지: 머리 위 작은 지푸라기 둥지에 앉은 노란 병아리 (앞 = 점 눈·주황 부리·볼터치)
      const y0 = 0xffe066;
      const y1 = 0xf0c040;
      const beak = 0xff9a3a;
      const nest = 0xb08850;
      const nestHi = 0xd8b478;
      // 둥지
      for (let x = cx - 3; x <= cx + 2; x++) g.set(x, top, x % 2 ? nest : nestHi);
      g.set(cx - 4, top, nest);
      g.set(cx + 3, top, nest);
      g.set(cx - 3, top - 1, nestHi);
      g.set(cx + 2, top - 1, nest);
      // 병아리 (동글한 몸 5칸 + 머리 위 깃털 하나)
      g.hline(cx - 2, cx + 2, top - 1, y0);
      g.hline(cx - 2, cx + 2, top - 2, y0);
      g.hline(cx - 1, cx + 1, top - 3, y0);
      g.set(cx + 2, top - 1, y1);
      if (view === "down") {
        g.set(cx - 1, top - 2, EYE);
        g.set(cx + 1, top - 2, EYE);
        g.set(cx, top - 2, beak);
        g.set(cx - 2, top - 1, BLUSH);
        g.set(cx + 2, top - 1, BLUSH);
        g.set(cx, top - 4, y1);
      } else if (side) {
        g.set(cx + 1, top - 2, EYE);
        g.set(cx + 3, top - 2, beak);
        g.set(cx + 2, top - 2, y0);
        g.set(cx - 2, top - 2, y1);
        g.set(cx - 3, top - 2, y1);
        g.set(cx, top - 4, y1);
      } else {
        g.set(cx, top - 4, y1);
        g.hline(cx - 2, cx + 2, top - 1, y1);
      }
      break;
    }
  }
}

// ── 목 ──

export function drawCuteNeck(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody): void {
  const { cx, neck } = m;
  const side = view === "side";
  const wide = body === "round" || body === "sheet";
  const half = wide ? 5 : body === "tall" ? 3 : 4;
  switch (id) {
    case "neck_bib": {
      // 딸기우유 턱받이: 분홍 턱받이 + 가운데 딸기 + 흰 레이스 단 (뒤에선 끈 리본)
      const pink = 0xf8b8c8;
      const lo = 0xe090a8;
      if (view === "up") {
        for (let x = cx - half; x < cx + half; x++) g.set(x, neck, pink);
        g.set(cx - 2, neck + 1, pink);
        g.set(cx + 1, neck + 1, pink);
        g.set(cx - 1, neck, lo);
        g.set(cx, neck, lo);
        break;
      }
      if (side) {
        g.rect(cx + 1, neck, 3, 2, pink);
        g.hline(cx + 1, cx + 3, neck + 2, 0xffffff);
        g.set(cx + 2, neck + 1, 0xe8485a);
        g.hline(cx - 2, cx, neck, lo);
        break;
      }
      g.hline(cx - 3, cx + 2, neck, pink);
      g.hline(cx - 3, cx + 2, neck + 1, pink);
      g.hline(cx - 2, cx + 1, neck + 2, pink);
      g.set(cx - 3, neck + 1, lo);
      g.set(cx + 2, neck + 1, lo);
      for (let x = cx - 2; x <= cx + 1; x++) g.set(x, neck + 3, (x + 20) % 2 ? 0xffffff : 0xf4eef0);
      // 딸기
      g.set(cx - 1, neck + 1, 0xe8485a);
      g.set(cx, neck + 1, 0xe8485a);
      g.set(cx - 1, neck + 2, 0xd03a4a);
      g.set(cx, neck, 0x5ab05a);
      break;
    }
    case "neck_mochi": {
      // 찹쌀 목도리: 크림색 털실 목도리 + 분홍 줄무늬 + 늘어진 끝자락
      const c = 0xfaf2e2;
      const lo = 0xe0d4bc;
      const pink = 0xf6a8bc;
      for (let x = cx - half; x < cx + half; x++) {
        g.set(x, neck, c);
        g.set(x, neck + 1, (x + 20) % 3 === 0 ? pink : lo);
      }
      if (view === "up") {
        g.vline(cx + 1, neck + 2, neck + 4, c);
        g.set(cx + 1, neck + 4, pink);
        break;
      }
      const tx = side ? cx - 2 : cx + 1;
      g.rect(tx, neck + 2, 2, 3, c);
      g.hline(tx, tx + 1, neck + 3, pink);
      g.set(tx, neck + 5, lo);
      g.set(tx + 1, neck + 5, lo);
      break;
    }
  }
}

// ── 등 (layer "back" = 몸보다 먼저, "front" = 몸 다음) ──

export function drawCuteBack(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, layer: "back" | "front", hem: number, sit: number): void {
  const { cx, shY, shL, shR } = m;
  const side = view === "side";
  const up = view === "up";
  if (id === "back_bunnybag") {
    // 토끼 백팩: 하얀 말랑 토끼 얼굴 가방 (뒷모습에 점 눈·볼터치가 보인다) + 쫑긋 귀 + 분홍 멜빵
    const c = 0xfbf7f0;
    const lo = 0xe0d6ca;
    const pink = 0xf6b8c4;
    const strap = 0xf090a8;
    if (up && layer === "front") {
      const w = body === "tall" ? 6 : 7;
      const x0 = Math.round(cx - w / 2);
      g.rect(x0, shY - 1, w, 6, c);
      g.hline(x0, x0 + w - 1, shY + 4, lo);
      g.vline(x0 + w - 1, shY, shY + 4, lo);
      // 귀
      for (const ex of [x0 + 1, x0 + w - 3]) {
        g.vline(ex, shY - 4, shY - 2, c);
        g.vline(ex + 1, shY - 4, shY - 2, lo);
        g.vline(ex, shY - 3, shY - 2, pink);
      }
      // 얼굴
      g.set(x0 + 2, shY + 1, EYE);
      g.set(x0 + w - 3, shY + 1, EYE);
      g.set(x0 + 1, shY + 2, BLUSH);
      g.set(x0 + w - 2, shY + 2, BLUSH);
      g.set(Math.round(cx - 0.5), shY + 2, 0xd88a9a);
    } else if (side && layer === "back") {
      g.rect(cx - 7, shY - 1, 4, 6, c);
      g.vline(cx - 7, shY + 1, shY + 4, lo);
      g.vline(cx - 6, shY - 4, shY - 2, c);
      g.vline(cx - 5, shY - 3, shY - 2, pink);
    } else if (view === "down" && layer === "back") {
      // 어깨 너머로 귀 끝만
      for (const ex of [shL - 1, shR + 1]) g.vline(ex, shY - 3, shY - 1, c);
      g.set(shL - 1, shY - 2, pink);
      g.set(shR + 1, shY - 2, pink);
    } else if (view === "down" && layer === "front") {
      g.vline(shL + 2, shY, shY + 2, strap);
      g.vline(shR - 2, shY, shY + 2, strap);
    }
    return;
  }
  if (id === "back_milkcape") {
    // 딸기우유 망토: 분홍 망토 + 흰 물방울 무늬 + 흰 레이스 밑단, 걸쇠는 딸기
    const c = 0xf6a8bc;
    const lo = 0xd8849c;
    const hi = 0xffcad6;
    const dot = 0xfff6f8;
    const bottom = sit ? 26 : 25;
    const strawberry = (x: number, y: number) => {
      g.set(x, y, 0xe8485a);
      g.set(x, y - 1, 0x5ab05a);
    };
    if (up && layer === "front") {
      for (let y = shY - 1; y <= bottom; y++) {
        const spread = Math.round((y - shY) * 0.45);
        const x0 = shL - spread;
        const x1 = shR + spread;
        for (let x = x0; x <= x1; x++) {
          if (y === bottom && (x + hem) % 2 === 1) continue;
          const polka = (x + y * 2) % 5 === 0 && y > shY && y < bottom - 1;
          // 11/22 세로 주름 (네 칸마다 그늘) — 물방울 사이로 자락 결이 보인다
          const fold = y > shY && (x - cx + 40) % 4 === 0;
          g.set(x, y, y === bottom ? 0xffffff : polka ? dot : x <= x0 + 1 ? hi : x >= x1 - 1 ? lo : fold ? lo : c);
        }
      }
      g.hline(shL, shR, shY - 1, hi);
      strawberry(Math.round(cx - 0.5), shY + 1);
    } else if (side && layer === "back") {
      for (let y = shY; y <= bottom; y++) {
        const t = (y - shY) / Math.max(1, bottom - shY);
        const back = Math.round(2 + t * 4 + (y === bottom ? hem % 2 : 0));
        for (let x = cx - back - 2; x <= cx; x++) g.set(x, y, y === bottom ? 0xffffff : x === cx - back - 2 ? lo : (x + y * 2) % 5 === 0 ? dot : c);
      }
    } else if (view === "down" && layer === "back") {
      for (let y = shY; y <= bottom; y++) {
        const spread = 1 + Math.round((y - shY) * 0.5);
        for (let x = shL - spread; x <= shR + spread; x++) {
          if (y === bottom && (x + hem) % 2 === 1) continue;
          g.set(x, y, y === bottom ? 0xffffff : x < cx ? lo : c);
        }
      }
    } else if (view === "down" && layer === "front") {
      strawberry(shL + 1, shY);
      strawberry(shR - 1, shY);
    }
  }
}

// ── 아이콘 (16×16) ──

type Ascii = { rows: readonly string[]; pal: Record<string, Color> };
const CUTE_ICONS: Record<string, Ascii> = {
  hat_bearband: {
    rows: ["..cc......cc....", ".cppc....cppc...", ".cppc....cppc...", "..cbbbbbbbbc....", "..b........b....", ".b..........b..."],
    pal: { c: 0xd49a62, p: 0xf6b8b8, b: 0x8a5a36 },
  },
  hat_mochibun: {
    // 11/22 염색 티: 떡 네 톤 (MOCHI_TONES와 같은 색)
    rows: [".....sswww......", "...sswwwwwmm....", "..swwkwwwkwmm...", "..wwbwwwwwbmm...", "wwwmmmmmmmmmwwl.", "wp.l.......l.pl.", "wp...........pl.", "ml...........ml."],
    pal: { s: 0xfffdf9, w: 0xfbf5ec, m: 0xeae0d2, l: 0xd8ccbc, k: 0x3a2a2e, b: 0xf6a0b4, p: 0xf6c0cc },
  },
  hat_hamhood: {
    rows: ["...pc.....cp....", "...cccccccccc...", "..ccccwwccccc...", "..cccccccccccl..", "..cc.......ccl..", "..cc.......ccl..", "..cc.......ccl..", "..ww.......ww..."],
    pal: { c: 0xf0a85e, l: 0xc8803a, w: 0xfff0d8, p: 0xf6b8b8 },
  },
  hat_chicknest: {
    rows: [".......y........", "......yyy.......", ".....kyyyk......", ".....yoooy......", ".....byyyb......", "...nhnyyynhn....", "..nhnhnhnhnhn...", "...nnnnnnnnn...."],
    pal: { y: 0xffe066, k: 0x3a2a2e, o: 0xff9a3a, b: 0xf6a0b4, n: 0xb08850, h: 0xd8b478 },
  },
  neck_bib: {
    rows: ["..pppppppppp....", "..ppppgppppp....", "..lpppsrpppl....", "...ppprrppp.....", "....pppppp......", "....wfwfwf......"],
    pal: { p: 0xf8b8c8, l: 0xe090a8, g: 0x5ab05a, s: 0xe8485a, r: 0xd03a4a, w: 0xffffff, f: 0xf4eef0 },
  },
  neck_mochi: {
    rows: ["cccccccccccccc..", "plplplplplplpl..", ".........cc.....", ".........pp.....", ".........cc.....", ".........ll....."],
    pal: { c: 0xfaf2e2, l: 0xe0d4bc, p: 0xf6a8bc },
  },
  hand_bungeo: {
    rows: ["....hhhhh...cc..", "..cccchhccccc...", ".ckcchcchcccl...", ".ccchcchccccc...", "..llcclccllll...", "...lllllll..ll..", "............l..."],
    pal: { c: 0xdc9c48, l: 0xb87430, h: 0xf4c878, k: 0x4a2a14 },
  },
  hand_plush: {
    rows: ["..ll....ll......", ".lccl..lccl.....", "..cccccccc......", ".cckccccckc.....", ".ccccmmmccc.....", "..cccmkmccc.....", "...pppppp.......", "..cccccccc......", ".cc.cccc.cc.....", "..ll....ll......"],
    pal: { c: 0xc8905a, l: 0xa06a3a, k: 0x3a2a2e, m: 0xf6e4c4, p: 0xff7aa0 },
  },
  hand_dango: {
    rows: ["......s.........", ".....ppp........", "....wpppp.......", "....ppppr.......", ".....www........", "....wwwww.......", "....wwwwl.......", ".....ggg........", "....wgggg.......", "....ggggd.......", "......s.........", "......s.........", "......s........."],
    pal: { s: 0xc8a060, p: 0xf8a8c0, r: 0xe080a0, w: 0xfbf6ee, l: 0xe2d8cc, g: 0xb8e08a, d: 0x8ac060 },
  },
  back_bunnybag: {
    rows: ["....wp..pw......", "....wp..pw......", "....wl..lw......", "..wwwwwwwwww....", "..wwkwwwwkwl....", "..wbwwwwwwbl....", "..wwwwddwwwl....", "..wwwwwwwwwl....", "..llllllllll....", "..s........s...."],
    pal: { w: 0xfbf7f0, l: 0xe0d6ca, p: 0xf6b8c4, k: 0x3a2a2e, b: 0xf6a0b4, d: 0xd88a9a, s: 0xf090a8 },
  },
  back_milkcape: {
    rows: ["....hhhhhhh.....", "...hccgcccl.....", "...hccscccl.....", "..hcccccdccl....", "..hcdccccccl....", ".hcccccdccccl...", ".hccdcccccdcl...", "hcccccccdccccl..", "wwwwwwwwwwwwww..", "w.w.w.w.w.w.w..."],
    pal: { h: 0xffcad6, c: 0xf6a8bc, l: 0xd8849c, d: 0xfff6f8, w: 0xffffff, s: 0xe8485a, g: 0x5ab05a },
  },
};

/** 시트에 그려지는 말랑 꾸미기 아이콘 (해당 없으면 null) */
export function cuteGearIcon(id: string): Grid | null {
  const a = CUTE_ICONS[id];
  if (!a) return null;
  const g = new Grid(16, 16);
  const oy = Math.max(0, Math.floor((16 - a.rows.length) / 2) + 1);
  const ox = 1;
  a.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && a.pal[ch] !== undefined && g.set(x + ox, y + oy, a.pal[ch])));
  g.outline(0x1e1c1a, false, 170);
  return g;
}
