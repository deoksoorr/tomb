import { Grid } from "./pixel";

// 3번 집 안 가구를 쓸 때 머리 위에 뜨는 이모티콘 (냉장고 간식·자판기 음료·커피·하트·음표·물방울).
// emotes.ts의 EmoteIcon에 합쳐져 말풍선(SpeechBubble.showIcon) 안에 크게 그린다. 모두 13×13, 외곽선은 emotes.ts가 같은 색으로.

const LINE = 0x2a2420;

const make = (draw: (g: Grid) => void) => () => {
  const g = new Grid(13, 13);
  draw(g);
  g.outline(LINE);
  return g;
};

export const HOUSE_ICON_ART = {
  heart: make((g) => {
    g.ellipse(4, 4.5, 2.6, 2.6, 0xff6f91);
    g.ellipse(8.5, 4.5, 2.6, 2.6, 0xff6f91);
    for (let y = 5; y <= 10; y++) g.hline(2 + (y - 5), 10 - (y - 5), y, 0xff6f91);
    g.set(3, 3, 0xffc0d0);
  }),
  note: make((g) => {
    g.vline(8, 1, 8, 0x3a3a48);
    g.hline(8, 11, 1, 0x3a3a48);
    g.hline(9, 11, 2, 0x3a3a48);
    g.ellipse(6, 9, 2.4, 1.8, 0x3a3a48);
    g.set(5, 8, 0x8a8aa0);
  }),
  drop: make((g) => {
    g.vline(6, 1, 2, 0x6ab8f0);
    g.hline(5, 7, 3, 0x6ab8f0);
    g.ellipse(6, 7.5, 3.6, 3.6, 0x6ab8f0);
    g.set(5, 6, 0xd8f0ff);
    g.set(4, 7, 0xd8f0ff);
  }),
  coffee: make((g) => {
    g.rect(2, 5, 7, 6, 0xf2ead8);
    g.rect(3, 5, 5, 2, 0x6a4026);
    g.rect(9, 6, 2, 3, 0xf2ead8);
    g.set(10, 7, 0x000000, 0);
    g.vline(4, 1, 3, 0xd8d0c8);
    g.vline(6, 2, 3, 0xd8d0c8);
  }),
  onigiri: make((g) => {
    for (let y = 1; y <= 10; y++) g.hline(6 - Math.floor(y / 2), 6 + Math.floor(y / 2), y, 0xf8f8f0);
    g.rect(4, 7, 5, 4, 0x2a3a30);
    g.set(5, 4, 0xe86040);
  }),
  apple: make((g) => {
    g.ellipse(6, 7, 4.2, 4, 0xe04848);
    g.vline(6, 1, 3, 0x6a4026);
    g.rect(7, 1, 3, 2, 0x6fae4c);
    g.set(4, 5, 0xffa0a0);
  }),
  milk: make((g) => {
    g.rect(3, 4, 7, 8, 0xf4f4f4);
    g.rect(3, 4, 7, 2, 0x6ab0e8);
    g.hline(4, 8, 2, 0xf4f4f4);
    g.hline(5, 7, 1, 0xf4f4f4);
    g.rect(5, 7, 3, 3, 0x6ab0e8);
  }),
  cake: make((g) => {
    g.rect(2, 6, 9, 5, 0xf8e0b0);
    g.rect(2, 5, 9, 2, 0xfff4f4);
    g.hline(2, 10, 8, 0xff8fb0);
    g.ellipse(6, 3.5, 1.5, 1.5, 0xe04848);
  }),
  icecream: make((g) => {
    g.ellipse(6, 4, 3.6, 3.2, 0xffc8e0);
    for (let y = 7; y <= 11; y++) g.hline(4 + Math.floor((y - 7) / 2), 8 - Math.floor((y - 7) / 2), y, 0xd8a050);
    g.set(5, 3, 0xffffff);
  }),
  soda: make((g) => {
    g.rect(4, 2, 5, 10, 0x4a90d8);
    g.rect(4, 5, 5, 3, 0xf0f0f0);
    g.hline(5, 7, 1, 0xb0b8c0);
    g.set(5, 9, 0x8ac0f0);
  }),
  clock: make((g) => {
    g.ellipse(6, 6.5, 5, 5, 0xf2ead8);
    g.vline(6, 3, 7, 0x3a3a48);
    g.hline(6, 9, 7, 0x3a3a48);
    g.set(6, 2, 0xc05a4a);
  }),
} as const;

export type HouseIcon = keyof typeof HOUSE_ICON_ART;
export const HOUSE_ICONS = Object.keys(HOUSE_ICON_ART) as HouseIcon[];
