import { darken, Grid, lighten, type Color } from "../sprites/pixel";

// 16번 전투 이펙트 그림 (Phaser 없이 Grid만 쓴다). 게임(combatFx)은 텍스처로 올리고,
// 사냥 안내서 시연(components/rpg/huntDemo)은 같은 그림을 캔버스에 바로 그린다.

/** 각 시트의 한 프레임 크기 (streak만 세로로 3프레임이 쌓여 있다) */
export const FX_FRAME = {
  impact: 24,
  shard: 3,
  coin: 7,
  orb: 7,
  arc: 40,
  crack: 32,
  streak: { w: 56, h: 8 },
  cross: 16,
  puff: 12,
  band: { w: 7, h: 5 },
  card: { w: 8, h: 6 },
  ink: 40,
  inkBolt: 6,
} as const;

/** 휘두르기(가는 호)·내려찍기(두꺼운 호) 시트 */
export const swingArcSheet = () => arcSheet(4, 0xd9e8f2, 0xffffff);
export const heavyArcSheet = () => arcSheet(7, 0xffd9a0, 0xffffff);

/** 별 모양 충격: 4프레임 (작은 십자 → 큰 별 + 빛줄기 → 깨진 고리 → 흩어진 점) */
export function impactSheet(): Grid {
  const S = 24;
  const sheet = new Grid(S * 4, S);
  const c = S / 2;
  for (let f = 0; f < 4; f++) {
    const g = new Grid(S, S);
    if (f === 0) {
      for (let i = -4; i <= 4; i++) {
        g.set(c + i, c, 0xffffff);
        g.set(c, c + i, 0xffffff);
      }
      g.ellipse(c + 0.5, c + 0.5, 2, 2, 0xffffff);
    } else if (f === 1) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const len = k % 2 ? 6 : 10;
        for (let r = 2; r < len; r++) g.set(c + Math.cos(a) * r, c + Math.sin(a) * r, r < len - 3 ? 0xffffff : 0xffe39a);
      }
      g.ellipse(c + 0.5, c + 0.5, 3.2, 3.2, 0xffffff);
    } else if (f === 2) {
      for (let t = 0; t < 48; t++) {
        if (t % 6 < 2) continue;
        const a = (t / 48) * Math.PI * 2;
        g.set(c + Math.cos(a) * 8, c + Math.sin(a) * 8, 0xfff3c8);
      }
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        g.set(c + Math.cos(a) * 10, c + Math.sin(a) * 10, 0xffffff);
      }
    } else {
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI * 2 + 0.2;
        g.set(c + Math.cos(a) * 10, c + Math.sin(a) * 10, 0xfff3c8, 200);
      }
    }
    sheet.draw(g, f * S, 0);
  }
  return sheet;
}

export function shardTex(): Grid {
  const g = new Grid(3, 3);
  g.rect(0, 1, 3, 1, 0xffffff);
  g.set(1, 0, 0xffffff);
  g.set(1, 2, 0xffffff);
  return g;
}

/** 동전: 2프레임 (앞면, 옆면) */
export function coinSheet(): Grid {
  const sheet = new Grid(14, 7);
  const a = new Grid(7, 7);
  a.ellipse(3.5, 3.5, 3, 3, 0xe8b830);
  a.ellipse(3.2, 3.2, 1.6, 1.6, 0xffe39a);
  a.set(4, 4, 0xa87a20);
  a.outline(0x5a3e10);
  const b = new Grid(7, 7);
  b.rect(3, 1, 2, 5, 0xe8b830);
  b.set(3, 2, 0xffe39a);
  b.outline(0x5a3e10);
  sheet.draw(a, 0, 0);
  sheet.draw(b, 7, 0);
  return sheet;
}

/** 경험치 구슬: 연두빛 + 반짝임 */
export function orbTex(): Grid {
  const g = new Grid(7, 7);
  g.ellipse(3.5, 3.5, 2.6, 2.6, 0x8ae07a);
  g.ellipse(3, 3, 1.2, 1.2, 0xeaffd8);
  g.outline(0x2e6a3a);
  return g;
}

/** 휘두르기 초승달: 4프레임 (호가 앞에서 뒤로 쓸고 지나간다). 오른쪽(0rad)을 보는 그림 */
export function arcSheet(thick: number, key: Color, edge: Color): Grid {
  const S = 40;
  const sheet = new Grid(S * 4, S);
  const c = S / 2;
  const R = 16;
  for (let f = 0; f < 4; f++) {
    const g = new Grid(S, S);
    const from = -1.25 + f * 0.25;
    const to = Math.min(1.25, -0.35 + f * 0.75);
    const steps = 70;
    for (let t = 0; t <= steps; t++) {
      const a = from + ((to - from) * t) / steps;
      const lead = t / steps;
      const w = Math.max(1, Math.round(thick * (0.35 + lead * 0.65)));
      for (let r = R - w; r <= R; r++) g.set(c + Math.cos(a) * r, c + Math.sin(a) * r, r === R ? edge : key, f === 3 ? 140 : 235);
    }
    sheet.draw(g, f * S, 0);
  }
  return sheet;
}

/** 바닥 금 + 먼지: 3프레임 */
export function crackSheet(): Grid {
  const S = 32;
  const sheet = new Grid(S * 3, S);
  const c = S / 2;
  for (let f = 0; f < 3; f++) {
    const g = new Grid(S, S);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      const len = 5 + f * 4 + (k % 2) * 3;
      for (let r = 2; r < len; r++) g.set(c + Math.cos(a + Math.sin(r) * 0.15) * r, c + Math.sin(a) * r * 0.55, 0x1a1612, 200 - f * 40);
    }
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const r = 6 + f * 4;
      g.ellipse(c + Math.cos(a) * r, c + Math.sin(a) * r * 0.55, 1.3, 1, 0xd9cdb0, 180 - f * 50);
    }
    sheet.draw(g, f * S, 0);
  }
  return sheet;
}

/** 찌르기 줄: 3프레임 (늘어나는 긴 빛줄기 + 밝은 끝) */
export function streakSheet(): Grid {
  const W = 56;
  const H = 8;
  const sheet = new Grid(W, H * 3);
  for (let f = 0; f < 3; f++) {
    const g = new Grid(W, H);
    const len = [24, 52, 52][f];
    for (let x = 0; x < len; x++) {
      const u = x / len;
      const a = f === 2 ? 110 : 230;
      g.set(x, 4, 0xd9e8f2, a);
      if (u > 0.3) g.set(x, 3, 0xffffff, a);
      if (u > 0.6) g.set(x, 5, 0xbcd8e8, a);
    }
    g.rect(len - 3, 2, 3, 5, 0xffffff, f === 2 ? 120 : 255);
    g.set(len, 4, 0xffffff);
    sheet.draw(g, 0, f * H);
  }
  return sheet;
}

/** 연타 X자: 2프레임 */
export function crossSheet(): Grid {
  const S = 16;
  const sheet = new Grid(S * 2, S);
  for (let f = 0; f < 2; f++) {
    const g = new Grid(S, S);
    for (let i = 2; i < 14; i++) {
      g.set(i, f ? 15 - i : i, 0xffffff);
      g.set(i + 1, f ? 15 - i : i, 0xd9e8f2, 200);
    }
    sheet.draw(g, f * S, 0);
  }
  return sheet;
}

/** 총구 연기: 3프레임 */
export function puffSheet(): Grid {
  const S = 12;
  const sheet = new Grid(S * 3, S);
  for (let f = 0; f < 3; f++) {
    const g = new Grid(S, S);
    const r = 2 + f * 1.6;
    g.ellipse(6, 6, r, r, 0xf2ead3, 220 - f * 70);
    if (f === 0) g.ellipse(6, 6, 1.2, 1.2, 0xffffff);
    sheet.draw(g, f * S, 0);
  }
  return sheet;
}

/** 고무줄: 작은 고리 */
export function bandTex(): Grid {
  const g = new Grid(7, 5);
  g.ellipse(3.5, 2.5, 3.2, 2.2, 0xe07a6a);
  g.ellipse(3.5, 2.5, 1.6, 0.8, 0x000000, 0);
  for (let x = 2; x < 5; x++) g.set(x, 2, 0x000000, 0);
  return g;
}

/** 법인카드: 2프레임 (앞면, 옆면) */
export function cardSheet(): Grid {
  const sheet = new Grid(16, 6);
  const a = new Grid(8, 6);
  a.rect(0, 0, 8, 6, 0x55704f);
  a.rect(1, 1, 2, 2, 0xffe39a);
  a.rect(0, 4, 8, 1, 0x2e3e2a);
  const b = new Grid(8, 6);
  b.rect(3, 0, 2, 6, 0xffe39a);
  sheet.draw(a, 0, 0);
  sheet.draw(b, 8, 0);
  return sheet;
}

/** 잉크 터짐: 4프레임 */
export function inkSheet(): Grid {
  const S = 40;
  const sheet = new Grid(S * 4, S);
  const c = S / 2;
  const ink: Color = 0x2a5ac8;
  for (let f = 0; f < 4; f++) {
    const g = new Grid(S, S);
    const r = [5, 11, 15, 16][f];
    const a = [255, 235, 170, 90][f];
    g.ellipse(c, c, r, r * 0.7, ink, a);
    g.ellipse(c - r * 0.25, c - r * 0.2, r * 0.45, r * 0.3, lighten(ink, 0.35), a);
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2 + f * 0.2;
      const d = r + 2 + (k % 3) * 2;
      g.ellipse(c + Math.cos(ang) * d, c + Math.sin(ang) * d * 0.7, 1.4, 1.2, darken(ink, 0.1), a);
    }
    sheet.draw(g, f * S, 0);
  }
  return sheet;
}

export function inkBoltTex(): Grid {
  const g = new Grid(6, 6);
  g.ellipse(3, 3, 2.5, 2.5, 0x2a5ac8);
  g.ellipse(2.5, 2.5, 1, 1, 0xbcd8ff);
  return g;
}
