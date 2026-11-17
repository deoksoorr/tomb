import type { AvatarBody } from "@tomb/protocol";
import type { GearM, GearView } from "./avatarGear";
import { Grid, type Color } from "./pixel";

// 11/17 테마 꾸미기 묶음 중 "아바타 시트에 같이 그려지는 것" (avatarGear.ts의 목·손·등 그리기가 여기로 넘긴다).
//  겨울 니트(꽈배기 목도리 · 체크 담요 숄) · 회사원(어깨 걸친 재킷) · 캠핑(반다나 · 머그 · 배낭) · 바닷가(조개 목걸이 · 아이스크림 · 서핑보드).
//  그림 규칙은 avatarGear와 같다 (몸 기준점 GearM에 맞춰 여섯 몸 모두에, 외곽선은 avatar.ts가 프레임 전체에 한 번 두른다).

export const THEME_NECK = ["neck_knit", "neck_bandana", "neck_shell"] as const;
export const THEME_HAND = ["hand_mug", "hand_icecream"] as const;
export const THEME_BACK = ["back_shawl", "back_jacket", "back_camppack", "back_surf"] as const;

const neckHalf = (body: AvatarBody) => (body === "round" || body === "sheet" ? 5 : body === "tall" ? 3 : 4);

// ── 목 ──

export function drawThemeNeck(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody): void {
  const { cx, neck } = m;
  const side = view === "side";
  const half = neckHalf(body);
  switch (id) {
    case "neck_knit": {
      // 꽈배기 니트 목도리: 겨자색 털실 두 줄 (꽈배기 = 밝은·어두운 비스듬 무늬) + 늘어진 끝과 술
      const c = 0xe0a83a;
      const hi = 0xf6d27a;
      const lo = 0xa8761e;
      for (let x = cx - half; x < cx + half; x++) {
        g.set(x, neck, (x + neck) % 3 === 0 ? hi : c);
        g.set(x, neck + 1, (x + neck) % 3 === 1 ? lo : c);
      }
      if (view === "up") {
        g.rect(cx, neck + 2, 2, 3, c);
        g.set(cx, neck + 3, hi);
        g.set(cx + 1, neck + 4, lo);
        g.set(cx, neck + 5, hi);
        g.set(cx + 1, neck + 5, c);
        break;
      }
      const tx = side ? cx - half - 1 : cx + 1;
      g.rect(tx, neck + 2, 2, 3, c);
      g.set(tx, neck + 2, hi);
      g.set(tx + 1, neck + 3, hi);
      g.set(tx, neck + 4, lo);
      // 술 (아래로 가는 실)
      g.set(tx, neck + 5, hi);
      g.set(tx + 1, neck + 5, c);
      break;
    }
    case "neck_bandana": {
      // 등산 반다나: 주황 바탕 흰 점무늬, 앞으로 삼각형 (뒤에서는 매듭)
      const c = 0xf07a2a;
      const lo = 0xc0561a;
      const dot = 0xfff4e0;
      for (let x = cx - half; x < cx + half; x++) g.set(x, neck, (x + 1) % 3 === 0 ? dot : c);
      if (view === "up") {
        g.set(cx - 1, neck + 1, lo);
        g.set(cx, neck + 1, c);
        g.set(cx - 2, neck + 2, c);
        g.set(cx + 1, neck + 2, lo);
        break;
      }
      if (side) {
        g.rect(cx + 1, neck + 1, 2, 1, c);
        g.set(cx + 2, neck + 2, lo);
        g.set(cx + 1, neck + 1, dot);
        g.set(cx - half, neck + 1, lo);
        break;
      }
      g.hline(cx - 3, cx + 2, neck + 1, c);
      g.hline(cx - 2, cx + 1, neck + 2, c);
      g.hline(cx - 1, cx, neck + 3, lo);
      g.set(cx - 2, neck + 1, dot);
      g.set(cx + 1, neck + 1, dot);
      g.set(cx, neck + 2, dot);
      g.set(cx + 2, neck + 1, lo);
      break;
    }
    case "neck_shell": {
      // 조개 목걸이: 갈색 끈에 작은 조개·소라가 번갈아, 가운데 분홍 부채 조개
      const cord = 0x8a5a32;
      const shells = [0xfff0e0, 0xf6c8a8, 0xffe0f0];
      for (let x = cx - half; x < cx + half; x++) g.set(x, neck, (x + neck) % 2 ? shells[(x + 9) % 3] : cord);
      if (view === "up") break;
      if (side) {
        g.set(cx + 2, neck + 1, 0xffb8c8);
        g.set(cx + 2, neck + 2, 0xf090a8);
        break;
      }
      // 가운데 부채 조개 (위로 펼친 3칸 + 아래 1칸)
      g.set(cx - 2, neck + 1, cord);
      g.set(cx + 1, neck + 1, cord);
      g.hline(cx - 1, cx, neck + 1, 0xffc0d0);
      g.hline(cx - 2, cx + 1, neck + 2, 0xffb0c4);
      g.set(cx - 1, neck + 2, 0xfff0f4);
      g.hline(cx - 1, cx, neck + 3, 0xe088a0);
      break;
    }
  }
}

// ── 손 (뒷모습은 몸에 가려 그리지 않는다) ──

export function drawThemeHand(g: Grid, view: GearView, id: string, m: GearM): void {
  if (view === "up") return;
  const x = m.hx;
  const y = m.hY;
  switch (id) {
    case "hand_mug": {
      // 캠핑 머그: 하늘빛 법랑 컵 (테두리 남색 · 하얀 점) + 손잡이, 코코아 위로 김 한 줄
      const c = 0x7ab8e0;
      const lo = 0x4a88b8;
      const rim = 0x2a4a7a;
      g.hline(x - 1, x + 1, y - 1, rim);
      g.rect(x - 1, y, 3, 3, c);
      g.vline(x + 1, y, y + 2, lo);
      g.set(x - 1, y + 1, 0xf4fbff);
      g.set(x + 2, y, rim);
      g.set(x + 2, y + 1, rim);
      g.set(x, y - 1, 0x6a3a1e); // 코코아
      g.set(x - 1, y - 3, 0xf0f0f0, 170);
      g.set(x, y - 4, 0xf0f0f0, 130);
      break;
    }
    case "hand_icecream": {
      // 아이스크림 콘: 와플 콘 위에 딸기 한 스쿱 + 바닐라 한 스쿱, 꼭대기 체리
      const cone = 0xe0a860;
      const coneLo = 0xb07a3a;
      g.hline(x - 1, x + 1, y, cone);
      g.set(x, y, coneLo);
      g.set(x, y + 1, cone);
      g.set(x, y + 2, coneLo);
      g.hline(x - 1, x + 1, y - 1, 0xfff4dc);
      g.set(x + 1, y - 1, 0xf0dcb8);
      g.hline(x - 1, x + 1, y - 2, 0xff9ab8);
      g.set(x - 1, y - 2, 0xffc8d8);
      g.set(x, y - 3, 0xff9ab8);
      g.set(x, y - 4, 0xe02a3a);
      break;
    }
  }
}

// ── 등 (layer "back" = 몸보다 먼저, "front" = 몸 다음) ──

export function drawThemeBack(g: Grid, view: GearView, id: string, m: GearM, body: AvatarBody, layer: "back" | "front", hem: number, sit: number): void {
  const { cx, shY, shL, shR } = m;
  const side = view === "side";
  const up = view === "up";
  switch (id) {
    case "back_shawl": {
      // 체크 담요 숄: 빨강·남색 타탄 무늬 담요를 어깨에 둘렀다 (뒤는 등 절반을 덮고 끝에 술)
      const red = 0xc0392b;
      const navy = 0x2a3a6a;
      const line = 0xf2d27a;
      const tartan = (x: number, y: number): Color => ((x - cx + 40) % 4 === 0 ? navy : (y + 40) % 4 === 0 ? navy : (x + y) % 8 === 0 ? line : red);
      const bottom = Math.min(sit ? 25 : 24, shY + 6);
      if (up && layer === "front") {
        for (let y = shY - 1; y <= bottom; y++) {
          const spread = Math.round((y - shY) * 0.35);
          for (let x = shL - spread; x <= shR + spread; x++) g.set(x, y, tartan(x, y));
        }
        // 술 (아래로 늘어진 실)
        const sp = Math.round((bottom - shY) * 0.35);
        for (let x = shL - sp; x <= shR + sp; x += 2) g.set(x + ((hem + x) % 2), bottom + 1, line);
      } else if (side && layer === "back") {
        for (let y = shY - 1; y <= bottom; y++) for (let x = cx - 4 - Math.round((y - shY) * 0.3); x <= cx - 1; x++) g.set(x, y, tartan(x, y));
        g.set(cx - 5, bottom + 1, line);
      } else if (side && layer === "front") {
        // 어깨 위로 넘어온 자락
        g.hline(cx - 2, cx + 1, shY - 1, red);
        g.set(cx, shY - 1, navy);
      } else if (view === "down" && layer === "front") {
        // 앞: 어깨에 걸친 두 자락이 가슴 앞으로 내려온다
        for (let y = shY - 1; y <= shY + 3; y++) {
          g.set(shL, y, tartan(shL, y));
          g.set(shL + 1, y, tartan(shL + 1, y));
          g.set(shR, y, tartan(shR, y));
          g.set(shR - 1, y, tartan(shR - 1, y));
        }
        g.set(shL, shY + 4, line);
        g.set(shR, shY + 4, line);
      }
      return;
    }
    case "back_jacket": {
      // 어깨 걸친 재킷: 짙은 회색 정장 재킷을 두 어깨에 걸쳤다 (빈 소매가 양옆으로 달랑, 뒤는 가운데 트임 · 앞은 깃)
      const c = 0x4a4e5a;
      const hi = 0x6a6e7c;
      const lo = 0x2e3038;
      const lining = 0x8a2a3a;
      const bottom = Math.min(sit ? 25 : 24, shY + 5);
      if (up && layer === "front") {
        for (let y = shY - 1; y <= bottom; y++) for (let x = shL - 1; x <= shR + 1; x++) g.set(x, y, x === shL - 1 ? hi : x === shR + 1 ? lo : c);
        g.hline(shL, shR, shY - 1, hi);
        g.vline(Math.round(cx - 0.5), shY + 2, bottom, lo);
        // 빈 소매 (몸 옆으로 조금 더 길게)
        g.vline(shL - 2, shY, bottom + 1, c);
        g.vline(shR + 2, shY, bottom + 1, lo);
      } else if (side && layer === "back") {
        // 옆모습: 등 뒤로 늘어진 재킷 자락 (아래로 갈수록 뒤로 벌어진다)
        for (let y = shY - 1; y <= bottom; y++) {
          const back = 6 + Math.round((y - shY) * 0.4);
          for (let x = cx - back; x <= cx - 2; x++) g.set(x, y, x === cx - back ? lo : y === shY - 1 ? hi : c);
        }
        g.vline(cx - 2, shY, bottom, lining);
      } else if (side && layer === "front") {
        // 어깨 위로 걸친 깃
        g.hline(cx - 3, cx + 1, shY - 1, c);
        g.set(cx + 1, shY - 1, hi);
      } else if (view === "down" && layer === "back") {
        // 앞모습: 몸 옆으로 늘어진 빈 소매 둘
        for (const x of [shL - 1, shR + 1]) for (let y = shY; y <= bottom + 1; y++) g.set(x, y, y === bottom + 1 ? lo : x < cx ? hi : c);
      } else if (view === "down" && layer === "front") {
        // 어깨 위의 깃 (얼굴이 몸통에 있는 동글이·이불 유령은 어깨 끝만) + 빨간 안감이 살짝
        if (body === "round" || body === "sheet") {
          for (const x of [shL, shR]) g.set(x, shY - 1, c);
        } else {
          g.hline(shL - 1, shR + 1, shY - 1, c);
          g.set(shL - 1, shY - 1, hi);
          g.set(Math.round(cx - 0.5) - 1, shY - 1, lining);
          g.set(Math.round(cx - 0.5) + 1, shY - 1, lining);
        }
      }
      return;
    }
    case "back_camppack": {
      // 캠핑 배낭: 큰 국방색 배낭 + 위에 돌돌 만 빨간 침낭 + 옆에 매단 작은 머그
      const c = 0x5a7040;
      const hi = 0x7a9058;
      const lo = 0x3e5028;
      const roll = 0xc84a3a;
      const rollHi = 0xe87a5a;
      const strap = 0x3a2a1a;
      if (up && layer === "front") {
        const w = body === "tall" ? 6 : 8;
        const x0 = Math.round(cx - w / 2);
        g.rect(x0, shY, w, 6, c);
        g.vline(x0, shY, shY + 5, hi);
        g.vline(x0 + w - 1, shY, shY + 5, lo);
        g.rect(x0 + 1, shY + 3, w - 2, 2, lo);
        g.hline(x0 + 2, x0 + w - 3, shY + 3, hi);
        // 침낭 (위)
        g.rect(x0 - 1, shY - 3, w + 2, 2, roll);
        g.hline(x0 - 1, x0 + w, shY - 3, rollHi);
        g.vline(x0 + 1, shY - 3, shY - 2, strap);
        g.vline(x0 + w - 2, shY - 3, shY - 2, strap);
        g.set(x0 - 1, shY - 2, 0x8a2a20);
      } else if (side && layer === "back") {
        g.rect(cx - 8, shY - 1, 5, 7, c);
        g.vline(cx - 8, shY, shY + 5, lo);
        g.rect(cx - 8, shY - 3, 5, 2, roll);
        g.hline(cx - 8, cx - 4, shY - 3, rollHi);
        g.set(cx - 9, shY + 3, 0x7ab8e0); // 매단 머그
      } else if (view === "down" && layer === "back") {
        // 어깨 너머로 보이는 침낭 양 끝
        g.rect(shL - 1, shY - 3, 2, 2, roll);
        g.rect(shR, shY - 3, 2, 2, roll);
        g.set(shL - 1, shY - 3, rollHi);
        g.set(shR + 1, shY - 3, 0x8a2a20);
      } else if (view === "down" && layer === "front") {
        g.vline(shL + 2, shY, shY + 3, strap);
        g.vline(shR - 2, shY, shY + 3, strap);
        g.hline(shL + 2, shR - 2, shY + 2, strap);
      }
      return;
    }
    case "back_surf": {
      // 서핑보드: 등에 비스듬히 멘 긴 보드 (하양 바탕 + 하늘·주황 줄무늬). 머리 옆으로 끝이 솟는다
      const c = 0xf8f4e8;
      const lo = 0xd8d0bc;
      const s1 = 0x4ab8e8;
      const s2 = 0xf08a3a;
      const top = Math.max(2, shY - 11);
      const bottom = Math.min(26, shY + 5);
      const rx = Math.round(m.rx);
      /** 보드 한 줄: 아래(bx0) → 위(bx1)로 비스듬히 */
      const board = (bx0: number, bx1: number) => {
        for (let y = top; y <= bottom; y++) {
          const u = (bottom - y) / Math.max(1, bottom - top);
          const x = Math.round(bx0 + (bx1 - bx0) * u);
          const tip = y === top || y === bottom;
          g.set(x, y, tip ? lo : c);
          if (!tip) g.set(x + 1, y, (y - top) % 6 === 3 ? s1 : (y - top) % 6 === 4 ? s2 : lo);
        }
      };
      if (up && layer === "front") board(cx - 4, cx + rx + 1);
      else if (view === "down" && layer === "back") board(cx + 3, cx - rx - 3);
      else if (side && layer === "back") {
        for (let y = top; y <= bottom; y++) {
          const tip = y === top || y === bottom;
          g.set(cx - 5, y, tip ? lo : c);
          if (!tip) g.set(cx - 6, y, (y - top) % 6 === 3 ? s1 : (y - top) % 6 === 4 ? s2 : c);
          if (!tip && y > top + 1 && y < bottom - 1) g.set(cx - 7, y, lo);
        }
      } else if (view === "down" && layer === "front") g.vline(shR - 1, shY, shY + 2, 0x3a3a46);
      return;
    }
  }
}

// ── 아이콘 (16×16) ──

type Ascii = { rows: readonly string[]; pal: Record<string, Color> };
const ICONS: Record<string, Ascii> = {
  neck_knit: {
    rows: ["...cchccchccc...", "..clcclcclccl...", "..cc........cc..", "..ch........hc..", "...ccchcchccc...", ".........cc.....", ".........hc.....", ".........cl.....", ".........hc.....", ".........c.c...."],
    pal: { c: 0xe0a83a, h: 0xf6d27a, l: 0xa8761e },
  },
  neck_bandana: {
    rows: ["..cdccdccdccdc..", "..ccccccccccccl.", "...cdcccccdcl...", "....ccccdccl....", ".....ccccl......", "......cl........"],
    pal: { c: 0xf07a2a, d: 0xfff4e0, l: 0xc0561a },
  },
  neck_shell: {
    rows: ["..k.k.k.k.k.k...", "..akbkckakbkck..", "...k.......k....", "....k.....k.....", ".....kpppk......", "......pPp.......", ".......q........"],
    pal: { k: 0x8a5a32, a: 0xfff0e0, b: 0xf6c8a8, c: 0xffe0f0, p: 0xffb0c4, P: 0xfff0f4, q: 0xe088a0 },
  },
  hand_mug: {
    rows: ["....s..s........", ".....s..s.......", "..rrrrrrrr......", "..rkkkkkkr......", "..cwccccclrr....", "..ccccccclr.r...", "..cwccccclr.r...", "..ccccccclrr....", "..ccccccll......", "...llllll......."],
    pal: { s: 0xe8e8e8, r: 0x2a4a7a, k: 0x6a3a1e, c: 0x7ab8e0, w: 0xf4fbff, l: 0x4a88b8 },
  },
  hand_icecream: {
    rows: [".......r........", "......ppp.......", ".....pPpppp.....", ".....ppppppp....", "....vvvvvvvv....", "....vVvvvvvv....", ".....ccCcCcc....", ".....CcCcCcC....", "......cCcCc.....", "......CcCc......", ".......cC.......", ".......C........"],
    pal: { r: 0xe02a3a, p: 0xff9ab8, P: 0xffc8d8, v: 0xfff4dc, V: 0xffffff, c: 0xe0a860, C: 0xb07a3a },
  },
  back_shawl: {
    rows: ["...rrnrrrnrrr...", "..rrrnrrrnrrrr..", "..nnnnnnnnnnnn..", "..rrrnrrrnrrrr..", "..rrrnryrnrrrr..", ".rrrrnrrrnrrrrr.", ".nnnnnnnnnnnnnn.", ".rrrrnrrrnrrrrr.", ".y.y.y.y.y.y.y.."],
    pal: { r: 0xc0392b, n: 0x2a3a6a, y: 0xf2d27a },
  },
  back_jacket: {
    rows: ["......hhhh......", ".....hcccccc....", "....hcc.r.ccl...", "....hcc.r.ccl...", "....hcccrcccl...", "....hcccrcccl...", "....hcccc.ccl...", "....hcccc.ccl...", "....llllllll...."],
    pal: { h: 0x6a6e7c, c: 0x4a4e5a, l: 0x2e3038, r: 0x8a2a3a },
  },
  back_camppack: {
    rows: ["...RrrrrrrrrR...", "...rrkrrrrkrr...", "....hccccccl....", "....hccccccl....", "....hccccccl....", "...mhlhhhhllm...", "....hlllllll....", "....hccccccl....", "....llllllll...."],
    pal: { R: 0xe87a5a, r: 0xc84a3a, k: 0x3a2a1a, h: 0x7a9058, c: 0x5a7040, l: 0x3e5028, m: 0x7ab8e0 },
  },
  back_surf: {
    rows: ["...........cc...", "..........ccl...", ".........ccl....", "........cbl.....", ".......cbl......", "......col.......", ".....ccl........", "....ccl.........", "...cbl..........", "..col...........", "..cl............", "..l............."],
    pal: { c: 0xf8f4e8, l: 0xd8d0bc, b: 0x4ab8e8, o: 0xf08a3a },
  },
};

/** 시트에 그려지는 테마 꾸미기 아이콘 (해당 없으면 null) */
export function themeGearIcon(id: string): Grid | null {
  const a = ICONS[id];
  if (!a) return null;
  const g = new Grid(16, 16);
  const oy = Math.max(0, Math.floor((16 - a.rows.length) / 2) + 1);
  a.rows.forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && a.pal[ch] !== undefined && g.set(x, y + oy, a.pal[ch])));
  g.outline(0x1e1c1a, false, 170);
  return g;
}
