import { darken, Grid, lighten, type Color } from "../sprites/pixel";
import type { IconArt } from "@/lib/rpg/catalog";

// 사냥터 장비·포션·스킬 아이콘 (16×16 픽셀아트, 코드로 그린다). UI는 dataURL로, 게임은 캔버스로 쓴다.
// 그림 종류(shape)만 고르고 색은 카탈로그의 main/accent를 쓴다 → 새 장비는 카탈로그 한 줄로 추가된다.

const OUT = 0x16151a;

type Painter = (g: Grid, m: Color, a: Color) => void;

const P: Record<string, Painter> = {
  // ── 무기 ──
  ruler(g, m, a) {
    for (let i = 0; i < 12; i++) {
      g.rect(2 + i, 12 - i, 2, 2, m);
      if (i % 2 === 0) g.set(2 + i, 12 - i, a);
    }
  },
  keyboard(g, m, a) {
    g.rect(1, 6, 14, 6, m);
    for (let y = 7; y < 11; y += 2) for (let x = 2; x < 14; x += 2) g.set(x, y, a);
    g.rect(4, 10, 8, 1, a);
  },
  duck(g, m, a) {
    g.rect(7, 8, 2, 7, 0x8a6a40);
    g.ellipse(8, 6, 5, 3.5, m);
    g.ellipse(11, 3.5, 2.5, 2.5, m);
    g.rect(13, 3, 2, 2, a);
    g.set(11, 3, OUT);
  },
  spear(g, m, a) {
    for (let i = 0; i < 11; i++) g.set(2 + i, 14 - i, a);
    for (let i = 0; i < 10; i++) g.set(3 + i, 14 - i, darken(a, 0.2));
    g.rect(11, 1, 4, 4, m);
    g.rect(12, 2, 2, 2, lighten(m, 0.3));
  },
  sword(g, m, a) {
    for (let i = 0; i < 9; i++) g.rect(5 + i, 9 - i, 2, 2, m);
    for (let i = 0; i < 9; i++) g.set(6 + i, 9 - i, lighten(m, 0.4));
    g.rect(2, 10, 6, 2, a);
    g.rect(4, 8, 2, 6, a);
    g.rect(1, 13, 3, 2, 0x5a3e22);
  },
  axe(g, m, a) {
    for (let i = 0; i < 12; i++) g.set(3 + i * 0.5, 14 - i, m);
    for (let i = 0; i < 12; i++) g.set(4 + i * 0.5, 14 - i, m);
    g.ellipse(10, 4, 4, 3.5, a);
    g.rect(7, 2, 3, 5, a);
  },
  chip(g, m, a) {
    g.rect(3, 3, 10, 10, m);
    for (let i = 4; i < 13; i += 2) {
      g.set(i, 1, a);
      g.set(i, 2, a);
      g.set(i, 13, a);
      g.set(i, 14, a);
      g.set(1, i, a);
      g.set(2, i, a);
      g.set(13, i, a);
      g.set(14, i, a);
    }
    g.rect(6, 6, 4, 4, a);
  },
  /** 고무줄 총: 나무젓가락 Y자 + 팽팽한 고무줄 */
  slingshot(g, m, a) {
    for (let i = 0; i < 6; i++) g.rect(7, 9 + i, 2, 1, darken(m, 0.15));
    for (let i = 0; i < 6; i++) {
      g.set(7 - i * 0.7, 9 - i, m);
      g.set(8 - i * 0.7, 9 - i, m);
      g.set(8 + i * 0.7, 9 - i, m);
      g.set(9 + i * 0.7, 9 - i, m);
    }
    g.hline(3, 12, 3, a);
    g.hline(4, 11, 4, darken(a, 0.25));
    g.rect(7, 4, 2, 2, lighten(a, 0.3));
  },
  /** 보드마커 지팡이: 비스듬한 마커 + 뚜껑 + 잉크 방울 */
  marker(g, m, a) {
    for (let i = 0; i < 9; i++) g.rect(3 + i, 12 - i, 3, 2, a);
    for (let i = 0; i < 9; i++) g.set(4 + i, 12 - i, darken(a, 0.12));
    for (let i = 0; i < 3; i++) g.rect(10 + i, 5 - i, 3, 2, m);
    g.rect(12, 2, 2, 2, lighten(m, 0.25));
    g.rect(2, 13, 2, 2, m);
    g.set(13, 8, m);
    g.set(14, 10, lighten(m, 0.3));
  },
  // ── 갑옷 ──
  hoodie(g, m, a) {
    g.rect(3, 5, 10, 9, m);
    g.rect(1, 6, 2, 7, m);
    g.rect(13, 6, 2, 7, m);
    g.ellipse(8, 4, 4, 3, a);
    g.rect(5, 10, 6, 3, a);
    g.set(7, 6, 0xe8d9b0);
    g.set(8, 7, 0xe8d9b0);
  },
  shirt(g, m, a) {
    g.rect(3, 4, 10, 10, m);
    g.rect(1, 5, 2, 6, m);
    g.rect(13, 5, 2, 6, m);
    for (let y = 4; y < 14; y += 3) g.hline(1, 14, y, a);
    for (let x = 4; x < 13; x += 3) g.vline(x, 4, 13, a);
    g.vline(8, 4, 13, 0xe8d9b0);
  },
  bag(g, m, a) {
    g.rect(2, 5, 12, 9, m);
    g.rect(5, 2, 6, 2, a);
    g.rect(5, 3, 1, 3, a);
    g.rect(10, 3, 1, 3, a);
    g.rect(4, 8, 8, 1, a);
    g.rect(7, 9, 2, 2, lighten(a, 0.4));
  },
  plate(g, m, a) {
    g.rect(3, 3, 10, 11, m);
    g.rect(1, 3, 2, 4, a);
    g.rect(13, 3, 2, 4, a);
    g.rect(6, 5, 4, 6, a);
    g.hline(3, 12, 10, darken(m, 0.3));
  },
  rack(g, m, a) {
    g.rect(3, 1, 10, 14, m);
    for (let y = 3; y < 14; y += 3) {
      g.hline(4, 11, y, darken(m, 0.5));
      g.set(5, y + 1, a);
      g.set(7, y + 1, a);
    }
  },
  // ── 머리 ──
  cap(g, m, a) {
    g.ellipse(8, 8, 6, 4.5, m);
    g.rect(2, 8, 12, 4, 0);
    g.rect(8, 10, 7, 2, darken(m, 0.2));
    g.rect(2, 9, 12, 1, m);
    g.set(8, 4, a);
  },
  headset(g, m, a) {
    for (let x = 3; x <= 12; x++) g.set(x, 3 + Math.round(Math.abs(x - 7.5) ** 1.6 / 6), m);
    g.rect(1, 7, 4, 6, m);
    g.rect(11, 7, 4, 6, m);
    g.rect(2, 8, 2, 4, a);
    g.rect(12, 8, 2, 4, a);
    g.rect(4, 12, 4, 1, a);
  },
  goggles(g, m, a) {
    g.rect(1, 5, 14, 7, m);
    g.rect(3, 6, 4, 4, a);
    g.rect(9, 6, 4, 4, a);
    g.set(4, 7, lighten(a, 0.6));
    g.set(10, 7, lighten(a, 0.6));
  },
  crown(g, m, a) {
    g.rect(2, 7, 12, 6, m);
    for (const x of [2, 7, 12]) g.rect(x, 3, 2, 4, m);
    g.set(8, 9, a);
    g.set(4, 10, a);
    g.set(11, 10, a);
  },
  // ── 장신구 ──
  earphones(g, m, a) {
    g.ellipse(4, 4, 2.5, 2.5, m);
    g.ellipse(12, 4, 2.5, 2.5, m);
    for (let y = 6; y < 12; y++) {
      g.set(4 + (y - 6) * 0.6, y, a);
      g.set(12 - (y - 6) * 0.6, y, a);
    }
    g.vline(8, 11, 15, a);
  },
  sticker(g, m, a) {
    g.ellipse(8, 9, 6, 5, m);
    g.rect(3, 3, 3, 4, m);
    g.rect(10, 3, 3, 4, m);
    g.set(6, 9, a);
    g.set(10, 9, a);
    g.set(8, 11, a);
  },
  watch(g, m, a) {
    g.rect(5, 0, 6, 16, darken(m, 0.2));
    g.rect(3, 4, 10, 8, m);
    g.rect(4, 5, 8, 6, a);
    g.set(8, 7, OUT);
    g.set(9, 8, OUT);
  },
  ring(g, m, a) {
    g.ellipse(8, 10, 5, 4.5, m);
    g.ellipse(8, 10, 2.8, 2.5, 0);
    for (let y = 7; y < 13; y++) for (let x = 5; x < 12; x++) if ((x - 8) ** 2 / 7.8 + (y - 10) ** 2 / 6.2 < 1) g.set(x, y, 0, 0);
    g.ellipse(8, 4, 2.5, 2.5, a);
  },
  mug(g, m, a) {
    g.rect(3, 4, 8, 10, m);
    g.rect(11, 6, 3, 1, m);
    g.rect(13, 6, 1, 5, m);
    g.rect(11, 10, 3, 1, m);
    g.rect(4, 5, 6, 2, a);
    g.set(5, 2, 0xd9dccf);
    g.set(7, 1, 0xd9dccf);
  },
  badge(g, m, a) {
    g.ellipse(8, 8, 6, 6, a);
    for (let y = 4; y < 12; y += 2) for (let x = 4; x < 12; x += 2) g.set(x, y, (x + y) % 4 === 0 ? m : lighten(m, 0.3));
  },
  // ── 포션 ──
  cup(g, m, a) {
    g.rect(4, 6, 8, 8, a);
    g.rect(4, 6, 8, 2, m);
    g.rect(3, 5, 10, 1, 0xf2f2f2);
    g.rect(5, 9, 6, 2, darken(a, 0.25));
    g.set(6, 3, 0xd9dccf);
    g.set(9, 2, 0xd9dccf);
  },
  can(g, m, a) {
    g.rect(4, 2, 8, 13, m);
    g.rect(4, 2, 8, 1, 0xb0b8c0);
    g.rect(5, 6, 6, 4, a);
    g.set(7, 7, m);
    g.set(8, 8, m);
  },
  box(g, m, a) {
    g.rect(2, 5, 12, 9, m);
    g.rect(3, 6, 10, 7, a);
    g.rect(4, 7, 3, 3, 0xe8d9b0);
    g.rect(8, 7, 4, 2, 0x6ad07a);
    g.rect(8, 10, 4, 2, 0xc83c3c);
  },
  cookie(g, m, a) {
    g.ellipse(8, 8, 6, 6, m);
    for (const [x, y] of [[6, 6], [10, 7], [7, 10], [10, 11], [5, 9]]) g.set(x, y, a);
  },
  // ── 스킬 ──
  sk_slash(g, m, a) {
    for (let i = 0; i < 11; i++) {
      g.set(3 + i, 13 - i, m);
      g.set(4 + i, 13 - i, a);
    }
    for (let i = 0; i < 6; i++) g.set(9 + i * 0.6, 12 - i * 0.2, lighten(m, 0.3));
  },
  sk_cross(g, m, a) {
    g.rect(6, 2, 4, 12, m);
    g.rect(2, 6, 12, 4, m);
    g.rect(7, 3, 2, 10, lighten(m, 0.3));
    g.set(3, 7, a);
  },
  sk_undo(g, m, a) {
    for (let t = 0; t < 26; t++) {
      const ang = Math.PI * 0.2 + (t / 26) * Math.PI * 1.5;
      g.set(8 + Math.cos(ang) * 5, 8 + Math.sin(ang) * 5, m);
      g.set(8 + Math.cos(ang) * 4, 8 + Math.sin(ang) * 4, a);
    }
    g.rect(10, 1, 4, 2, m);
    g.rect(12, 1, 2, 4, m);
  },
  sk_bolt(g, m, a) {
    const pts = [[9, 1], [8, 2], [7, 3], [6, 4], [5, 5], [5, 6], [6, 7], [7, 7], [8, 7], [7, 8], [6, 9], [5, 10], [4, 11], [3, 12]];
    for (const [x, y] of pts) g.rect(x, y, 3, 1, m);
    g.rect(8, 7, 3, 1, a);
  },
  sk_bug(g, m, a) {
    g.ellipse(8, 9, 4, 5, m);
    g.ellipse(8, 4, 2.5, 2, a);
    for (const y of [7, 9, 11]) {
      g.set(3, y, a);
      g.set(13, y, a);
    }
    g.vline(8, 5, 13, a);
  },
  sk_pair(g, m, a) {
    g.ellipse(5, 8, 3.5, 5, m);
    g.ellipse(11, 8, 3.5, 5, lighten(a, 0.4));
    g.set(4, 7, OUT);
    g.set(6, 7, OUT);
    g.set(10, 7, OUT);
    g.set(12, 7, OUT);
  },
  sk_eye(g, m, a) {
    g.ellipse(8, 8, 7, 4, m);
    g.ellipse(8, 8, 3, 3, a);
    g.set(8, 8, OUT);
  },
  sk_moon(g, m, a) {
    g.rect(1, 1, 14, 14, a);
    g.ellipse(8, 8, 5, 5, m);
    g.ellipse(10, 6, 4, 4, a);
    g.set(3, 3, 0xffffff);
    g.set(12, 12, 0xffffff);
  },
  sk_rocket(g, m, a) {
    g.ellipse(8, 7, 3, 6, a);
    g.rect(5, 10, 6, 2, m);
    g.rect(7, 13, 2, 2, 0xffe39a);
    g.set(8, 5, 0x3c8ac8);
  },
  sk_cup(g, m, a) {
    P.cup(g, m, a);
  },
  // ── 11/12 장비 추가분 ──
  namecard(g, m, a) {
    g.rect(2, 4, 11, 7, darken(m, 0.15));
    g.rect(4, 6, 11, 7, m);
    g.rect(6, 8, 5, 1, a);
    g.rect(6, 10, 7, 1, darken(a, 0.2));
  },
  pen(g, m, a) {
    for (let i = 0; i < 11; i++) g.rect(2 + i, 13 - i, 2, 2, m);
    g.rect(11, 2, 3, 3, a);
    g.set(2, 14, OUT);
    for (let i = 0; i < 3; i++) g.set(5 + i, 11 - i, a);
  },
  mouse(g, m, a) {
    g.ellipse(8, 9, 5, 6, m);
    g.vline(8, 3, 8, a);
    g.rect(7, 5, 3, 2, lighten(a, 0.2));
    g.hline(4, 12, 8, darken(m, 0.3));
  },
  tie(g, m, a) {
    g.rect(6, 1, 4, 3, a);
    for (let y = 4; y < 12; y++) g.hline(7 - Math.floor((y - 4) / 3), 8 + Math.floor((y - 4) / 3), y, m);
    g.rect(7, 12, 2, 2, m);
    for (let y = 5; y < 12; y += 3) g.set(8, y, lighten(m, 0.3));
  },
  stapler(g, m, a) {
    g.rect(1, 9, 14, 4, m);
    g.rect(2, 6, 12, 3, a);
    g.rect(2, 5, 11, 1, lighten(a, 0.3));
    g.rect(13, 10, 2, 2, darken(m, 0.3));
  },
  book(g, m, a) {
    g.rect(3, 2, 10, 12, m);
    g.rect(4, 3, 8, 10, a);
    g.vline(3, 2, 13, darken(m, 0.3));
    g.rect(6, 5, 4, 2, m);
    g.hline(6, 10, 9, darken(a, 0.3));
  },
  calculator(g, m, a) {
    g.rect(3, 1, 10, 14, m);
    g.rect(4, 2, 8, 3, 0x9ad07a);
    for (let y = 7; y < 14; y += 2) for (let x = 4; x < 12; x += 2) g.set(x, y, y === 13 && x === 10 ? a : lighten(m, 0.4));
  },
  tumbler(g, m, a) {
    g.rect(5, 3, 6, 12, m);
    g.rect(4, 1, 8, 2, a);
    g.rect(6, 6, 4, 3, lighten(m, 0.3));
  },
  stamp(g, m, a) {
    g.rect(6, 1, 4, 6, a);
    g.ellipse(8, 2, 3, 1.5, lighten(a, 0.2));
    g.rect(3, 7, 10, 3, darken(a, 0.2));
    g.rect(2, 10, 12, 4, m);
    g.hline(3, 12, 13, lighten(m, 0.3));
  },
  vest(g, m, a) {
    g.rect(3, 3, 10, 11, m);
    g.rect(7, 3, 2, 11, darken(m, 0.25));
    for (const [x, y] of [[4, 6], [10, 6], [4, 10], [10, 10]]) g.rect(x, y, 2, 2, a);
  },
  padding(g, m, a) {
    g.rect(3, 1, 10, 14, m);
    g.rect(1, 3, 2, 9, m);
    g.rect(13, 3, 2, 9, m);
    for (let y = 3; y < 15; y += 3) g.hline(3, 12, y, a);
    g.vline(8, 1, 14, darken(m, 0.3));
  },
  suit(g, m, a) {
    g.rect(3, 3, 10, 11, m);
    g.rect(1, 4, 2, 8, m);
    g.rect(13, 4, 2, 8, m);
    g.rect(6, 3, 4, 6, a);
    g.vline(8, 4, 9, 0xa83c3c);
    g.set(8, 11, a);
  },
  glasses(g, m, a) {
    g.ellipse(4.5, 8, 3, 2.5, a);
    g.ellipse(11.5, 8, 3, 2.5, a);
    g.hline(7, 9, 7, m);
    g.hline(0, 1, 7, m);
    g.hline(14, 15, 7, m);
    g.set(4, 7, 0xffffff);
    g.set(11, 7, 0xffffff);
  },
  helmet(g, m, a) {
    g.ellipse(8, 8, 7, 5, m);
    g.rect(1, 8, 14, 3, m);
    for (let x = 4; x < 13; x += 3) g.vline(x, 4, 7, a);
    g.rect(2, 11, 3, 3, darken(m, 0.3));
  },
  halo(g, m, a) {
    for (let t = 0; t < 32; t++) {
      const ang = (t / 32) * Math.PI * 2;
      g.set(8 + Math.cos(ang) * 6, 6 + Math.sin(ang) * 2.5, m);
      g.set(8 + Math.cos(ang) * 5, 6 + Math.sin(ang) * 2, a);
    }
    g.set(8, 11, m);
    g.set(5, 13, a);
    g.set(11, 13, a);
  },
  lanyard(g, m, a) {
    for (let i = 0; i < 6; i++) {
      g.set(3 + i * 0.6, 1 + i, m);
      g.set(12 - i * 0.6, 1 + i, m);
    }
    g.rect(4, 7, 8, 8, a);
    g.rect(5, 8, 3, 3, m);
    g.hline(5, 10, 12, darken(a, 0.3));
  },
  envelope(g, m, a) {
    g.rect(1, 4, 14, 9, m);
    for (let i = 0; i < 7; i++) g.set(1 + i, 4 + i * 0.6, darken(m, 0.25));
    for (let i = 0; i < 7; i++) g.set(14 - i, 4 + i * 0.6, darken(m, 0.25));
    g.rect(7, 8, 3, 3, a);
  },
  /** 기간제 코디 드롭: 리본 선물 상자 */
  gift(g, m, a) {
    g.rect(2, 6, 12, 9, m);
    g.rect(1, 4, 14, 3, lighten(m, 0.15));
    g.rect(7, 4, 2, 11, a);
    g.ellipse(5.5, 2.5, 2, 1.5, a);
    g.ellipse(10.5, 2.5, 2, 1.5, a);
  },
  // ── 11/12 스킬 추가분 ──
  sk_dash(g, m, a) {
    for (let i = 0; i < 3; i++) g.hline(1, 6 + i, 5 + i * 3, a);
    g.ellipse(11, 8, 3.5, 3.5, m);
    g.rect(13, 7, 2, 2, lighten(m, 0.3));
  },
  sk_blink(g, m, a) {
    g.ellipse(5, 9, 3, 4, a);
    g.ellipse(11, 7, 3, 4, m);
    g.set(10, 6, OUT);
    g.set(12, 6, OUT);
    for (let i = 0; i < 3; i++) g.set(7 + i, 12 - i * 2, lighten(m, 0.3));
  },
  sk_staple(g, m, a) {
    for (let i = 0; i < 3; i++) {
      const y = 3 + i * 4;
      g.hline(4 + i, 12 - i, y, m);
      g.set(4 + i, y + 1, m);
      g.set(12 - i, y + 1, m);
    }
    g.rect(1, 14, 3, 1, a);
  },
  sk_pull(g, m, a) {
    g.ellipse(8, 8, 2.5, 2.5, m);
    for (const [x, y] of [[2, 2], [14, 2], [2, 14], [14, 14]]) {
      g.set(x, y, a);
      g.set(x + (x < 8 ? 1 : -1), y + (y < 8 ? 1 : -1), a);
      g.set(x + (x < 8 ? 2 : -2), y + (y < 8 ? 2 : -2), lighten(a, 0.3));
    }
  },
  sk_printer(g, m, a) {
    g.rect(2, 6, 12, 7, m);
    g.rect(4, 2, 8, 4, 0xf2f2f2);
    g.rect(4, 11, 8, 4, 0xf2f2f2);
    g.hline(3, 12, 8, a);
    g.set(12, 7, 0x6ad07a);
  },
  sk_cheers(g, m, a) {
    g.rect(2, 4, 5, 9, m);
    g.rect(9, 4, 5, 9, m);
    g.rect(2, 3, 5, 2, a);
    g.rect(9, 3, 5, 2, a);
    g.set(8, 1, lighten(m, 0.4));
    g.set(7, 2, lighten(m, 0.4));
    g.set(9, 2, lighten(m, 0.4));
  },
  sk_bomb(g, m, a) {
    g.rect(3, 5, 10, 10, m);
    g.hline(5, 11, 8, darken(m, 0.3));
    g.hline(5, 11, 10, darken(m, 0.3));
    g.hline(5, 9, 12, darken(m, 0.3));
    g.vline(8, 2, 4, 0x6a4a30);
    g.set(9, 1, a);
    g.set(8, 1, 0xffe39a);
  },
  sk_shield(g, m, a) {
    g.rect(3, 2, 10, 7, m);
    for (let i = 0; i < 6; i++) g.hline(3 + i, 12 - i, 9 + i, m);
    g.rect(6, 4, 4, 1, a);
    g.rect(6, 6, 4, 1, a);
  },

  // ── 스킬 트리 (모닥불 · 서리 · 넋) ──
  /** 불씨: 작은 불꽃 + 튀는 점 */
  sk_ember(g, m, a) {
    g.ellipse(7, 10, 4, 4, m);
    for (let i = 0; i < 4; i++) g.hline(7 - Math.floor((4 - i) / 2), 7 + Math.floor((4 - i) / 3), 3 + i, m);
    g.ellipse(7, 11, 2, 2, a);
    g.set(12, 4, a);
    g.set(13, 3, m);
    g.set(11, 7, a);
  },
  /** 화로: 둥근 화로 위 불꽃 */
  sk_hearth(g, m, a) {
    g.rect(2, 10, 12, 4, a);
    g.hline(3, 12, 14, darken(a, 0.3));
    g.ellipse(8, 7, 3.5, 3, m);
    g.vline(8, 2, 6, m);
    g.set(7, 4, m);
    g.set(9, 3, lighten(m, 0.4));
  },
  /** 불꽃 부채: 펼친 부채꼴 */
  sk_fan(g, m, a) {
    for (let t = -4; t <= 4; t++) {
      const ang = -Math.PI / 2 + t * 0.22;
      for (let r = 2; r < 13; r++) g.set(8 + Math.cos(ang) * r, 14 + Math.sin(ang) * r, r > 9 ? a : m);
    }
    g.rect(7, 13, 2, 2, darken(m, 0.3));
  },
  /** 장작: 엇갈린 통나무 두 개 + 불씨 */
  sk_logs(g, m, a) {
    for (let i = 0; i < 10; i++) {
      g.rect(3 + i, 12 - Math.floor(i / 2), 2, 2, m);
      g.rect(11 - i, 12 - Math.floor(i / 2), 2, 2, darken(m, 0.2));
    }
    g.ellipse(8, 4, 2.5, 2.5, a);
    g.set(8, 1, lighten(a, 0.3));
  },
  /** 튀는 불티: 흩어진 별점 */
  sk_sparks(g, m, a) {
    for (const [x, y] of [[4, 4], [11, 3], [8, 8], [3, 11], [12, 12], [7, 13]]) {
      g.rect(x - 1, y, 3, 1, m);
      g.rect(x, y - 1, 1, 3, m);
      g.set(x, y, a);
    }
  },
  /** 불의 고리 */
  sk_firering(g, m, a) {
    for (let t = 0; t < 40; t++) {
      const ang = (t / 40) * Math.PI * 2;
      g.set(8 + Math.cos(ang) * 6, 9 + Math.sin(ang) * 4.5, m);
      g.set(8 + Math.cos(ang) * 5, 9 + Math.sin(ang) * 3.6, a);
      if (t % 5 === 0) g.set(8 + Math.cos(ang) * 6, 8 + Math.sin(ang) * 4.5 - 1, lighten(a, 0.3));
    }
  },
  /** 별똥 장작: 꼬리 달린 불덩이 */
  sk_meteor(g, m, a) {
    for (let i = 0; i < 8; i++) g.set(2 + i, 2 + i, i % 2 ? a : m);
    for (let i = 0; i < 6; i++) g.set(3 + i, 1 + i, lighten(m, 0.2));
    g.ellipse(11, 11, 3.5, 3.5, m);
    g.ellipse(11, 11, 1.8, 1.8, a);
  },
  /** 화톳불: 다리 셋 달린 쇠 바구니 + 불 */
  sk_brazier(g, m, a) {
    g.rect(3, 7, 10, 3, m);
    g.set(4, 11, m);
    g.set(3, 12, m);
    g.set(11, 11, m);
    g.set(12, 12, m);
    g.vline(8, 10, 14, m);
    g.ellipse(8, 5, 3.5, 2.5, a);
    g.vline(8, 1, 4, a);
  },
  /** 큰 모닥불: 쌓은 장작 위 큰 불길 */
  sk_bonfire(g, m, a) {
    g.rect(2, 13, 12, 2, 0x6a4a30);
    for (let i = 0; i < 6; i++) g.hline(8 - (6 - i), 8 + (6 - i) - 1, 7 + i, m);
    g.vline(8, 2, 7, m);
    g.vline(5, 5, 7, m);
    g.vline(11, 4, 7, m);
    g.ellipse(8, 10, 2.5, 2, a);
  },
  /** 재의 심장 */
  sk_heart(g, m, a) {
    g.ellipse(5.5, 6, 3, 3, m);
    g.ellipse(10.5, 6, 3, 3, m);
    for (let i = 0; i < 6; i++) g.hline(2 + i, 13 - i, 8 + i, m);
    g.ellipse(8, 8, 2, 2, a);
  },
  /** 서리 입김: 바람 세 줄 */
  sk_breath(g, m, a) {
    for (let i = 0; i < 3; i++) {
      g.hline(2, 10 - i * 2, 4 + i * 4, m);
      g.set(11 - i * 2, 3 + i * 4, a);
      g.set(12 - i * 2, 4 + i * 4, a);
    }
    g.set(13, 13, a);
  },
  /** 서리 옷깃: 세운 깃 */
  sk_collar(g, m, a) {
    for (let i = 0; i < 6; i++) {
      g.vline(2 + i, 4 + i, 14, m);
      g.vline(13 - i, 4 + i, 14, m);
    }
    g.hline(2, 13, 4, a);
    g.set(8, 12, a);
  },
  /** 고드름 */
  sk_icicle(g, m, a) {
    for (const x of [3, 8, 13]) for (let i = 0; i < (x === 8 ? 12 : 9); i++) g.hline(x - Math.max(0, 1 - Math.floor(i / 4)), x + Math.max(0, 1 - Math.floor(i / 4)), 2 + i, i < 2 ? a : m);
  },
  /** 살얼음: 금 간 얼음판 */
  sk_crack(g, m, a) {
    g.rect(2, 3, 12, 10, m);
    for (const [x, y] of [[8, 3], [7, 5], [8, 7], [6, 8], [5, 10], [9, 8], [11, 10], [12, 12]]) g.set(x, y, a);
  },
  /** 얼음 방패 */
  sk_iceshield(g, m, a) {
    g.rect(3, 2, 10, 7, m);
    for (let i = 0; i < 6; i++) g.hline(3 + i, 12 - i, 9 + i, m);
    g.vline(8, 3, 12, a);
    g.hline(5, 11, 6, a);
  },
  /** 서리꽃: 눈 결정 */
  sk_snow(g, m, a) {
    P.st_freeze(g, m, a);
  },
  /** 안개 걸음: 흐린 발자국 */
  sk_mist(g, m, a) {
    for (let i = 0; i < 4; i++) g.hline(1 + i, 9 + i, 4 + i * 3, i % 2 ? a : m);
    g.ellipse(12, 7, 2.5, 3, m);
  },
  /** 얼음 무덤: 솟은 결정 */
  sk_crystal(g, m, a) {
    for (let i = 0; i < 12; i++) g.hline(8 - Math.floor(i / 3), 8 + Math.floor(i / 3), 2 + i, m);
    for (let i = 0; i < 7; i++) g.hline(3 - Math.floor(i / 4), 3 + Math.floor(i / 4), 7 + i, a);
    for (let i = 0; i < 7; i++) g.hline(13 - Math.floor(i / 4), 13 + Math.floor(i / 4), 7 + i, a);
    g.vline(8, 3, 10, lighten(m, 0.4));
  },
  /** 서리밭: 바닥 타원 + 결정 */
  sk_frostfield(g, m, a) {
    g.ellipse(8, 11, 7, 3.5, a);
    g.ellipse(8, 11, 5, 2.2, m);
    g.vline(8, 2, 8, m);
    g.hline(5, 11, 5, m);
  },
  /** 눈보라: 휘도는 선 + 눈송이 */
  sk_blizzard(g, m, a) {
    for (let t = 0; t < 30; t++) {
      const ang = t * 0.35;
      g.set(8 + Math.cos(ang) * t * 0.2, 8 + Math.sin(ang) * t * 0.2, m);
    }
    for (const [x, y] of [[2, 3], [13, 4], [3, 13], [12, 12]]) g.set(x, y, a);
  },
  /** 동지의 맹세: 서리 낀 초승달 */
  sk_moonfrost(g, m, a) {
    g.ellipse(8, 8, 6, 6, m);
    // 오른쪽 위를 지워 초승달로
    g.ellipse(10.5, 6, 5, 5, 0x000000, 0);
    g.set(4, 11, a);
    g.set(6, 13, a);
  },
  /** 도깨비불: 꼬리 달린 넋불 */
  sk_wisp(g, m, a) {
    g.ellipse(9, 6, 4, 4, m);
    g.ellipse(9, 6, 2, 2, a);
    for (let i = 0; i < 6; i++) g.set(5 - i * 0.6, 9 + i, i % 2 ? m : a);
  },
  /** 등불 */
  sk_lamp(g, m, a) {
    g.hline(6, 9, 1, a);
    g.vline(8, 1, 3, a);
    g.rect(4, 4, 8, 9, a);
    g.rect(5, 5, 6, 7, m);
    g.rect(7, 7, 2, 3, 0xffffff);
    g.hline(4, 11, 13, a);
  },
  /** 넋 거두기: 빨려 드는 방울 */
  sk_drain(g, m, a) {
    g.ellipse(8, 8, 3, 3, a);
    for (const [x, y] of [[2, 2], [14, 3], [2, 13], [13, 13]]) {
      g.set(x, y, m);
      g.set(x + (x < 8 ? 2 : -2), y + (y < 8 ? 2 : -2), m);
    }
  },
  /** 바람 넋: 감기는 바람 */
  sk_gust(g, m, a) {
    for (let t = 0; t < 24; t++) g.set(2 + t * 0.5, 8 + Math.sin(t * 0.5) * 4, t % 3 ? m : a);
    g.hline(4, 12, 13, a);
  },
  /** 길동무 넋: 유령 */
  sk_ghost(g, m, a) {
    g.ellipse(8, 6, 5, 4.5, m);
    g.rect(3, 6, 10, 7, m);
    for (const x of [3, 7, 11]) g.rect(x, 13, 2, 2, m);
    g.set(6, 6, a);
    g.set(10, 6, a);
  },
  /** 넋 사슬 */
  sk_chain(g, m, a) {
    for (let i = 0; i < 4; i++) {
      const x = 2 + i * 3;
      const y = 12 - i * 3;
      g.rect(x, y, 3, 2, i % 2 ? a : m);
    }
    g.ellipse(13, 3, 2, 2, a);
  },
  /** 저승 너울: 드리운 천 */
  sk_veil(g, m, a) {
    for (let i = 0; i < 12; i++) g.hline(8 - Math.floor(i / 2), 8 + Math.floor(i / 2), 2 + i, m);
    for (const x of [3, 6, 9, 12]) g.vline(x, 10, 14, a);
  },
  /** 넋 소용돌이 */
  sk_vortex(g, m, a) {
    for (let t = 0; t < 50; t++) {
      const ang = t * 0.28;
      const r = 0.5 + t * 0.12;
      g.set(8 + Math.cos(ang) * r, 8 + Math.sin(ang) * r * 0.8, t > 35 ? a : m);
    }
  },
  /** 망자의 초롱: 매단 둥근 초롱 */
  sk_lantern(g, m, a) {
    g.vline(8, 0, 2, a);
    g.ellipse(8, 8, 5, 5, m);
    g.hline(4, 12, 3, a);
    g.hline(4, 12, 13, a);
    g.vline(8, 4, 12, a);
    g.ellipse(8, 8, 1.5, 2, 0xffffff);
  },
  /** 별빛 행렬: 큰 별 + 따르는 작은 별 */
  sk_starlight(g, m, a) {
    g.vline(10, 1, 9, m);
    g.hline(6, 14, 5, m);
    g.rect(9, 4, 3, 3, lighten(m, 0.3));
    for (const [x, y] of [[3, 10], [5, 13], [1, 13]]) {
      g.set(x, y, a);
      g.set(x + 1, y, a);
    }
  },
  /** 넋의 인연: 이어진 두 고리 */
  sk_bond(g, m, a) {
    for (let t = 0; t < 30; t++) {
      const ang = (t / 30) * Math.PI * 2;
      g.set(5.5 + Math.cos(ang) * 3.5, 8 + Math.sin(ang) * 3.5, m);
      g.set(10.5 + Math.cos(ang) * 3.5, 8 + Math.sin(ang) * 3.5, a);
    }
  },

  // ── 몬스터가 거는 상태 이상 (lib/rpg/status) ──
  /** 독: 거품 이는 물방울 */
  st_poison(g, m, a) {
    g.ellipse(8, 10, 4.5, 4.5, m);
    for (let i = 0; i < 4; i++) g.hline(8 - Math.floor(i / 2), 8 + Math.floor(i / 2), 3 + i, m);
    g.rect(6, 9, 2, 2, a);
    g.set(10, 12, a);
    g.set(12, 3, lighten(m, 0.3));
    g.set(13, 1, lighten(m, 0.3));
  },
  /** 화상: 불꽃 */
  st_burn(g, m, a) {
    g.ellipse(8, 11, 5, 4, m);
    for (let i = 0; i < 6; i++) g.hline(8 - Math.floor((6 - i) / 2), 8 + Math.floor((6 - i) / 3), 2 + i, m);
    g.ellipse(8, 12, 2.5, 2.5, a);
    g.vline(8, 8, 10, a);
  },
  /** 출혈: 두 방울 */
  st_bleed(g, m, a) {
    g.ellipse(6, 10, 3.5, 3.5, m);
    for (let i = 0; i < 3; i++) g.hline(6 - Math.floor(i / 2), 6 + Math.floor(i / 2), 4 + i, m);
    g.ellipse(11, 6, 2.5, 2.5, m);
    g.set(11, 2, m);
    g.vline(11, 2, 4, m);
    g.set(5, 9, lighten(m, 0.35));
    g.rect(4, 13, 5, 1, a);
  },
  /** 둔화: 달팽이 */
  st_slow(g, m, a) {
    g.ellipse(9, 8, 4.5, 4.5, m);
    g.ellipse(9, 8, 2, 2, a);
    g.set(9, 8, m);
    g.rect(2, 12, 12, 2, darken(m, 0.2));
    g.vline(3, 8, 11, darken(m, 0.2));
    g.set(2, 7, a);
  },
  /** 빙결: 눈 결정 */
  st_freeze(g, m, a) {
    g.vline(8, 1, 15, m);
    g.hline(1, 15, 8, m);
    for (let i = -4; i <= 4; i++) {
      g.set(8 + i, 8 + i, m);
      g.set(8 + i, 8 - i, m);
    }
    g.rect(7, 7, 3, 3, a);
    g.set(8, 8, 0xffffff);
  },
  /** 혼란: 소용돌이 */
  st_confuse(g, m, a) {
    g.ellipse(8, 8, 6, 6, m);
    g.ellipse(8, 8, 4, 4, a);
    g.ellipse(9, 8, 2.5, 2.5, m);
    g.rect(9, 7, 2, 2, a);
    g.set(13, 2, lighten(m, 0.3));
  },
  /** 침묵: 엑스 친 말풍선 */
  st_silence(g, m, a) {
    g.rect(2, 3, 12, 8, m);
    g.rect(4, 11, 3, 2, m);
    g.set(4, 13, m);
    for (let i = 0; i < 5; i++) {
      g.set(5 + i, 4 + i, a);
      g.set(10 - i, 4 + i, a);
    }
  },
};

/** 아이콘 그림 (16×16 캔버스) */
export function iconCanvas(art: IconArt): HTMLCanvasElement {
  const g = new Grid(16, 16);
  (P[art.shape] ?? P.chip)(g, art.main, art.accent);
  g.outline(OUT);
  return g.toCanvas();
}

const cache = new Map<string, string>();

/** dataURL (정수 배율, 캐시) */
export function iconUrl(art: IconArt, scale = 2): string {
  const k = `${art.shape}|${art.main}|${art.accent}|${scale}`;
  const hit = cache.get(k);
  if (hit) return hit;
  const src = iconCanvas(art);
  const c = document.createElement("canvas");
  c.width = c.height = 16 * scale;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/png");
  cache.set(k, url);
  return url;
}
