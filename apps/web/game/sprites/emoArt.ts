import { Grid, type Color } from "./pixel";

// 5번 이모티콘 그림 (웃음·눈물·놀람·물음표·느낌표·박수·화남·졸려요·불꽃·진땀·번뜩). 하트·커피·음표는 집 안 이모티콘(houseIcons.ts)을 같이 쓴다.
// 모두 13×13, 외곽선은 emotes.ts와 같은 색. 말풍선(SpeechBubble.showIcon) 안에 화면 픽셀 3배로 크게 그린다.

const LINE = 0x2a2420;
const FACE = 0xffd65a;
const FACE_HI = 0xfff0a8;
const FACE_LO = 0xe8a92e;
const INK = 0x3a2a1e;

const make = (draw: (g: Grid) => void, outline = true) => () => {
  const g = new Grid(13, 13);
  draw(g);
  if (outline) g.outline(LINE);
  return g;
};

/** 동그란 노란 얼굴 (가운데 6,6 반지름 5.5) + 왼쪽 위 반짝 + 아래쪽 그늘 */
function face(g: Grid, base: Color = FACE, hi: Color = FACE_HI, lo: Color = FACE_LO): void {
  g.ellipse(6.5, 6.5, 5.6, 5.6, base);
  g.recolor((x, y) => (x - 6) ** 2 + (y - 6) ** 2 > 16 && y > 7, lo);
  g.set(3, 3, hi);
  g.set(4, 2, hi);
}

export const EMO_ART = {
  /** 웃음: 눈을 감고(^ ^) 입을 크게 벌림 */
  laugh: make((g) => {
    face(g);
    for (const x of [3, 8]) {
      g.set(x, 5, INK);
      g.set(x + 1, 4, INK);
      g.set(x + 2, 5, INK);
    }
    g.hline(3, 9, 7, INK);
    g.hline(4, 8, 8, 0xc8402a);
    g.hline(5, 7, 9, 0xc8402a);
    g.hline(5, 7, 8, 0xff8a7a);
  }),
  /** 눈물: 처진 눈썹·눈 아래로 흐르는 눈물 줄기 */
  cry: make((g) => {
    face(g);
    g.set(3, 4, INK);
    g.set(4, 3, INK);
    g.set(9, 4, INK);
    g.set(8, 3, INK);
    g.hline(3, 4, 5, INK);
    g.hline(8, 9, 5, INK);
    g.vline(3, 6, 10, 0x6ab8f0);
    g.vline(9, 6, 10, 0x6ab8f0);
    g.set(3, 7, 0xd8f0ff);
    g.set(9, 7, 0xd8f0ff);
    g.hline(5, 7, 9, INK);
    g.set(4, 10, INK);
    g.set(8, 10, INK);
  }),
  /** 놀람: 동그란 눈 + 오 입 */
  wow: make((g) => {
    face(g);
    for (const x of [3, 8]) {
      g.rect(x, 3, 2, 3, 0xffffff);
      g.set(x + (x < 6 ? 1 : 0), 4, INK);
    }
    g.ellipse(6.5, 9, 1.6, 1.8, INK);
    g.set(6, 9, 0xc8402a);
  }),
  /** 물음표 (밝은 하늘색) */
  what: make((g) => {
    const c = 0x8fd0ff;
    const lo = 0x4f98d8;
    g.hline(4, 8, 1, c);
    g.rect(3, 2, 2, 2, c);
    g.rect(8, 2, 2, 3, c);
    g.rect(7, 5, 2, 1, c);
    g.rect(6, 6, 2, 2, c);
    g.rect(6, 10, 2, 2, c);
    g.set(9, 4, lo);
    g.set(7, 7, lo);
    g.set(7, 11, lo);
    g.set(4, 1, 0xe8f6ff);
  }),
  /** 느낌표 (빨강) */
  bang: make((g) => {
    const c = 0xff5a4a;
    const lo = 0xc8302a;
    g.rect(5, 1, 3, 2, c);
    g.rect(5, 3, 3, 5, c);
    g.vline(7, 3, 7, lo);
    g.rect(5, 10, 3, 2, c);
    g.set(7, 11, lo);
    g.set(5, 1, 0xffb0a0);
  }),
  /** 박수: 맞닿은 두 손바닥 + 양옆 반짝 */
  clap: make((g) => {
    const skin = 0xffe7c2;
    const shade = 0xe9c497;
    // 손끝이 맞닿고 손목은 벌어진 두 손바닥 (ㅅ 모양)
    for (let y = 1; y <= 10; y++) {
      const spread = Math.max(0, y - 4) >> 1;
      g.hline(4 - spread, 5 - spread, y, skin);
      g.hline(7 + spread, 8 + spread, y, skin);
    }
    g.set(6, 2, skin);
    g.set(6, 3, shade);
    g.hline(1, 3, 11, shade);
    g.hline(9, 11, 11, shade);
    g.vline(5, 3, 5, shade);
    g.vline(7, 3, 5, shade);
  }),
  /** 음표 (말풍선의 어두운 바탕에서도 잘 보이게 밝은 색 — 집 안 음표와 따로) */
  tune: make((g) => {
    const c = 0xffd0e8;
    const lo = 0xe890b8;
    g.vline(4, 2, 9, c);
    g.vline(10, 1, 8, c);
    g.hline(4, 10, 1, c);
    g.hline(4, 10, 2, c);
    g.ellipse(2.8, 9.6, 2, 1.6, c);
    g.ellipse(8.8, 8.6, 2, 1.6, c);
    g.set(2, 10, lo);
    g.set(8, 9, lo);
    g.hline(5, 9, 2, lo);
  }),
  /** 화남: 붉은 얼굴·치켜뜬 눈썹·이마 핏줄 */
  angry: make((g) => {
    face(g, 0xff8a5a, 0xffc0a0, 0xd8502a);
    g.set(3, 3, INK);
    g.set(4, 4, INK);
    g.set(9, 3, INK);
    g.set(8, 4, INK);
    g.set(4, 5, INK);
    g.set(8, 5, INK);
    g.hline(5, 7, 9, INK);
    g.set(4, 10, INK);
    g.set(8, 10, INK);
    // 핏줄 (오른쪽 위)
    g.set(10, 1, 0xc8202a);
    g.set(12, 1, 0xc8202a);
    g.set(11, 2, 0xc8202a);
    g.set(10, 3, 0xc8202a);
    g.set(12, 3, 0xc8202a);
  }),
  /** 졸려요: 커지며 올라가는 Z 세 개 */
  zzz: make((g) => {
    const z = (x: number, y: number, s: number, c: Color) => {
      g.hline(x, x + s, y, c);
      for (let i = 1; i < s; i++) g.set(x + s - i, y + i, c);
      g.hline(x, x + s, y + s, c);
    };
    z(0, 8, 3, 0xb8d8ff);
    z(4, 4, 3, 0xd8e8ff);
    z(8, 0, 4, 0xffffff);
  }),
  /** 불꽃 (뜨겁다·열정) */
  fire: make((g) => {
    const rows: [number, number, number][] = [
      [1, 6, 6],
      [2, 5, 7],
      [3, 5, 8],
      [4, 4, 8],
      [5, 3, 9],
      [6, 2, 9],
      [7, 2, 10],
      [8, 2, 10],
      [9, 2, 10],
      [10, 3, 9],
      [11, 4, 8],
    ];
    for (const [y, a, b] of rows) g.hline(a, b, y, 0xe8502a);
    g.set(3, 4, 0xe8502a);
    g.set(9, 3, 0xe8502a);
    for (const [y, a, b] of [
      [5, 6, 7],
      [6, 5, 8],
      [7, 4, 8],
      [8, 4, 8],
      [9, 4, 8],
      [10, 5, 7],
    ] as const)
      g.hline(a, b, y, 0xffa83a);
    g.hline(6, 7, 8, 0xfff0a0);
    g.hline(5, 7, 9, 0xfff0a0);
    g.set(6, 10, 0xfff0a0);
  }),
  /** 진땀: 난처한 얼굴 + 이마의 큰 땀방울 */
  sweat: make((g) => {
    face(g);
    g.hline(3, 4, 5, INK);
    g.hline(8, 9, 5, INK);
    g.hline(4, 8, 9, INK);
    g.set(9, 8, INK);
    // 땀방울 (오른쪽 위, 얼굴 밖으로)
    g.set(11, 1, 0x6ab8f0);
    g.rect(10, 2, 3, 2, 0x6ab8f0);
    g.hline(10, 12, 4, 0x6ab8f0);
    g.set(11, 2, 0xd8f0ff);
  }),
  /** 번뜩: 빛나는 전구 */
  idea: make((g) => {
    const glass = 0xfff07a;
    g.ellipse(6.5, 5, 3.6, 3.6, glass);
    g.rect(5, 7, 3, 2, glass);
    g.set(5, 3, 0xffffff);
    g.set(4, 4, 0xfffbd8);
    g.rect(5, 9, 3, 1, 0xb0a890);
    g.rect(5, 10, 3, 1, 0x8a8270);
    g.set(6, 11, 0x8a8270);
    // 빛줄기 (외곽선 위에 덧그린다 — 아래 rays)
  }),
} as const;

export type EmoArtId = keyof typeof EMO_ART;
export const EMO_ART_IDS = Object.keys(EMO_ART) as EmoArtId[];

/** 외곽선 뒤에 덧그리는 장식 (전구 빛줄기처럼 외곽선 없이 밝게) */
export function emoArtGrid(id: EmoArtId): Grid {
  const g = EMO_ART[id]();
  if (id === "idea") {
    const ray = 0xfff0a8;
    g.set(0, 5, ray);
    g.set(1, 5, ray);
    g.set(11, 5, ray);
    g.set(12, 5, ray);
    g.set(1, 1, ray);
    g.set(11, 1, ray);
    g.set(6, 0, ray);
  }
  if (id === "clap") {
    const spark = 0xfff0a8;
    g.set(0, 3, spark);
    g.set(1, 2, spark);
    g.set(12, 3, spark);
    g.set(11, 2, spark);
    g.set(0, 7, spark);
    g.set(12, 7, spark);
  }
  return g;
}
