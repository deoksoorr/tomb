import { Grid, type Color } from "./pixel";

// 5번 이모티콘 그림 (웃음·눈물·놀람 … + 얼굴·회사·반응·자연·묘역 묶음). 하트·커피·음표는 집 안 이모티콘(houseIcons.ts), 꽃은 헌화 그림(emotes.ts)을 같이 쓴다.
// 모두 13×13, 외곽선은 emotes.ts와 같은 색. 말풍선(SpeechBubble.showIcon) 안에 화면 픽셀 3배로 크게 그린다.

const LINE = 0x2a2420;
const FACE = 0xffd65a;
const FACE_HI = 0xfff0a8;
const FACE_LO = 0xe8a92e;
const INK = 0x3a2a1e;

/** draw로 칠하고 외곽선을 두른 뒤, after가 있으면 외곽선 없이 덧그린다 (반짝임·빛줄기·색종이) */
const make = (draw: (g: Grid) => void, after?: (g: Grid) => void) => () => {
  const g = new Grid(13, 13);
  draw(g);
  g.outline(LINE);
  after?.(g);
  return g;
};

/** 동그란 노란 얼굴 (가운데 6,6 반지름 5.5) + 왼쪽 위 반짝 + 아래쪽 그늘. cy·r로 조금 내려 작게 그릴 수 있다 (머리 위 장식 자리) */
function face(g: Grid, base: Color = FACE, hi: Color = FACE_HI, lo: Color = FACE_LO, cy = 6.5, r = 5.6): void {
  const dy = Math.round(cy - 6.5);
  g.ellipse(6.5, cy, r, r, base);
  g.recolor((x, y) => (x - 6) ** 2 + (y - (cy - 0.5)) ** 2 > (r - 1.6) ** 2 && y > cy + 0.5, lo);
  g.set(3, 3 + dy, hi);
  g.set(4, 2 + dy, hi);
}

/** 칠한 픽셀을 지운다 (투명) */
function clearEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number): void {
  for (let y = 0; y < g.h; y++)
    for (let x = 0; x < g.w; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) g.set(x, y, 0, 0);
    }
}

/** 작은 반짝임 (외곽선 없이 — after에서) */
function sparkle(g: Grid, x: number, y: number, c: Color = 0xfff0a8): void {
  g.set(x, y, 0xffffff);
  g.set(x - 1, y, c);
  g.set(x + 1, y, c);
  g.set(x, y - 1, c);
  g.set(x, y + 1, c);
}

/** 볼 홍조 */
function blush(g: Grid, y = 7, c: Color = 0xff9aa8): void {
  g.hline(2, 3, y, c);
  g.hline(9, 10, y, c);
}

const SKIN = 0xffe7c2;
const SKIN_LO = 0xe9c497;
const TEAR = 0x6ab8f0;
const PINK = 0xff6f91;

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

  // ── 얼굴 ──
  /** 씨익: 이를 드러낸 넓은 웃음 */
  grin: make((g) => {
    face(g);
    g.hline(3, 4, 4, INK);
    g.hline(8, 9, 4, INK);
    g.set(4, 5, INK);
    g.set(8, 5, INK);
    g.set(2, 7, INK);
    g.set(10, 7, INK);
    g.hline(3, 9, 8, 0xffffff);
    g.set(3, 8, INK);
    g.set(9, 8, INK);
    g.hline(4, 8, 9, INK);
    g.vline(6, 8, 8, 0xd8d0c0);
  }),
  /** 윙크: 한쪽 눈 감고(>) 웃음 + 반짝 */
  wink: make(
    (g) => {
      face(g);
      g.set(3, 3, INK);
      g.set(4, 4, INK);
      g.set(3, 5, INK);
      g.vline(8, 3, 5, INK);
      g.set(9, 3, 0xffffff);
      g.set(3, 8, INK);
      g.hline(4, 8, 9, INK);
      g.set(9, 8, INK);
      g.set(9, 7, 0xff9aa8);
      g.set(10, 7, 0xff9aa8);
    },
    (g) => sparkle(g, 11, 1),
  ),
  /** 멍: ㅇ_ㅇ 동그란 빈 눈 + 일자 입 */
  blank: make((g) => {
    face(g);
    for (const x of [2, 7]) {
      g.hline(x + 1, x + 2, 3, INK);
      g.hline(x + 1, x + 2, 6, INK);
      g.vline(x, 4, 5, INK);
      g.vline(x + 3, 4, 5, INK);
    }
    g.hline(5, 7, 9, INK);
  }),
  /** 당황: 파랗게 질린 이마 + 흰 눈 + 물결 입 */
  panic: make((g) => {
    face(g);
    g.recolor((_, y) => y <= 3, 0x9ec8f0);
    g.vline(4, 1, 2, 0x5a88c8);
    g.vline(6, 1, 2, 0x5a88c8);
    g.vline(8, 1, 2, 0x5a88c8);
    for (const x of [3, 8]) {
      g.rect(x, 4, 2, 3, 0xffffff);
      g.set(x === 3 ? 4 : 8, 5, INK);
    }
    g.set(3, 9, INK);
    g.set(4, 8, INK);
    g.set(5, 9, INK);
    g.set(6, 8, INK);
    g.set(7, 9, INK);
    g.set(8, 8, INK);
    g.set(9, 9, INK);
    // 땀방울 (오른쪽)
    g.set(11, 4, TEAR);
    g.vline(11, 4, 6, TEAR);
    g.set(12, 6, TEAR);
  }),
  /** 부끄: > < 눈 + 빨간 볼 + 작은 입 */
  shy: make((g) => {
    face(g);
    g.set(3, 4, INK);
    g.set(4, 5, INK);
    g.set(3, 6, INK);
    g.set(9, 4, INK);
    g.set(8, 5, INK);
    g.set(9, 6, INK);
    g.rect(1, 7, 3, 2, 0xff8a9a);
    g.rect(9, 7, 3, 2, 0xff8a9a);
    g.set(2, 7, 0xffc0c8);
    g.set(10, 7, 0xffc0c8);
    g.set(5, 9, INK);
    g.set(6, 8, INK);
    g.set(7, 9, INK);
  }),
  /** 감동: 반짝이며 그렁그렁한 큰 눈 + 떨리는 입 */
  moved: make((g) => {
    face(g);
    for (const x of [2, 8]) {
      g.rect(x, 3, 3, 4, INK);
      g.set(x, 3, 0xffffff);
      g.set(x + 1, 4, 0xffffff);
      g.hline(x, x + 2, 6, 0x8fd0ff);
    }
    g.set(2, 7, TEAR);
    g.set(10, 7, TEAR);
    g.set(4, 9, INK);
    g.set(5, 8, INK);
    g.set(6, 9, INK);
    g.set(7, 8, INK);
    g.set(8, 9, INK);
  }),
  /** 메롱: 한쪽 눈 감고 혀 내밀기 */
  tongue: make((g) => {
    face(g);
    g.set(3, 3, INK);
    g.set(4, 4, INK);
    g.set(3, 5, INK);
    g.vline(8, 3, 5, INK);
    g.hline(3, 9, 8, INK);
    g.rect(6, 9, 3, 3, 0xff6f80);
    g.vline(7, 9, 10, 0xc8404f);
    g.set(8, 9, 0xffa0aa);
  }),
  /** 짜증: 귤빛 얼굴 + 치켜뜬 눈썹·반쯤 감은 눈 + 찌푸린 입 */
  annoyed: make((g) => {
    face(g, 0xffc860, 0xffe8a0, 0xe0982a);
    g.set(2, 3, INK);
    g.set(3, 4, INK);
    g.set(10, 3, INK);
    g.set(9, 4, INK);
    g.hline(3, 5, 6, INK);
    g.hline(7, 9, 6, INK);
    g.set(4, 5, 0xffffff);
    g.set(8, 5, 0xffffff);
    g.set(4, 10, INK);
    g.hline(5, 7, 9, INK);
    g.set(8, 10, INK);
  }),
  /** 의심: 흘겨보는 눈 + 한쪽 눈썹 + 비뚠 입 */
  doubt: make((g) => {
    face(g);
    g.hline(2, 4, 4, INK);
    g.hline(8, 10, 4, INK);
    g.hline(2, 4, 5, 0xffffff);
    g.hline(8, 10, 5, 0xffffff);
    g.set(4, 5, INK);
    g.set(10, 5, INK);
    g.hline(8, 10, 2, INK);
    g.set(7, 3, INK);
    g.hline(5, 7, 9, INK);
    g.set(8, 8, INK);
  }),
  /** 해탈: 지그시 감은 눈 + 잔잔한 미소 + 머리 위 고리 */
  zen: make(
    (g) => {
      face(g, 0xfff0b0, 0xffffff, 0xe8c870, 7.5, 5);
      g.hline(3, 5, 7, INK);
      g.hline(7, 9, 7, INK);
      g.set(5, 10, INK);
      g.set(6, 10, INK);
      g.set(7, 10, INK);
      g.set(4, 9, INK);
      g.set(8, 9, INK);
    },
    (g) => {
      const halo = 0xfff07a;
      g.hline(4, 8, 0, halo);
      g.set(3, 1, halo);
      g.set(9, 1, halo);
    },
  ),
  /** 기절: X X 눈 + 벌린 입 */
  faint: make(
    (g) => {
      face(g, 0xf0e0a8, 0xfffbe0, 0xd0b878);
      for (const x of [2, 8]) {
        g.set(x, 3, INK);
        g.set(x + 2, 3, INK);
        g.set(x + 1, 4, INK);
        g.set(x, 5, INK);
        g.set(x + 2, 5, INK);
      }
      g.rect(5, 8, 3, 2, INK);
      g.set(6, 9, 0xc8402a);
    },
    (g) => {
      g.set(1, 0, 0xfff0a8);
      g.set(11, 0, 0xfff0a8);
      g.set(12, 2, 0xffffff);
    },
  ),
  /** 하품: 감은 눈 + 크게 벌린 입 + 눈물 한 방울 */
  yawn: make((g) => {
    face(g);
    g.hline(2, 4, 4, INK);
    g.hline(8, 10, 4, INK);
    g.set(4, 5, INK);
    g.set(8, 5, INK);
    g.ellipse(6.5, 9, 2.1, 2.2, INK);
    g.rect(5, 8, 3, 2, 0xc8402a);
    g.hline(5, 7, 10, 0xff8a7a);
    g.set(10, 6, TEAR);
    g.set(11, 7, TEAR);
  }),
  /** 뿌듯: 감은 웃는 눈 + 발그레 + 반짝 */
  proud: make(
    (g) => {
      face(g);
      for (const x of [3, 8]) {
        g.set(x, 5, INK);
        g.set(x + 1, 4, INK);
        g.set(x + 2, 5, INK);
      }
      blush(g);
      g.set(4, 8, INK);
      g.hline(5, 7, 9, INK);
      g.set(8, 8, INK);
    },
    (g) => {
      sparkle(g, 11, 1);
      g.set(1, 0, 0xfff0a8);
    },
  ),
  /** 현타: 파리한 얼굴 + 이마의 그늘 줄 + 텅 빈 눈 */
  gloom: make((g) => {
    face(g, 0xb8c4d8, 0xdde4ee, 0x8f9cb4);
    g.vline(3, 2, 4, 0x6a6a9a);
    g.vline(5, 1, 4, 0x6a6a9a);
    g.vline(7, 1, 4, 0x6a6a9a);
    g.vline(9, 2, 4, 0x6a6a9a);
    g.set(4, 6, INK);
    g.set(8, 6, INK);
    g.hline(5, 7, 9, INK);
  }),

  // ── 회사 ──
  /** 퇴근: 문 + 밖으로 나가는 초록 화살표 */
  leave: make((g) => {
    g.rect(1, 1, 6, 11, 0xa0683a);
    g.rect(2, 2, 4, 9, 0xc8884a);
    g.set(5, 7, 0xffd65a);
    g.rect(6, 5, 3, 3, 0x6fd86f);
    g.vline(9, 3, 9, 0x6fd86f);
    g.vline(10, 4, 8, 0x6fd86f);
    g.vline(11, 5, 7, 0x6fd86f);
    g.set(12, 6, 0x6fd86f);
    g.hline(6, 9, 5, 0xb0f0b0);
  }),
  /** 야근: 밤의 모니터 (초승달) */
  overtime: make((g) => {
    g.ellipse(9.5, 3.5, 3, 3, 0xffe066);
    clearEllipse(g, 11.2, 2.6, 2.2, 2.2);
    g.set(9, 1, 0xfff4c0);
    g.rect(1, 5, 8, 5, 0x9a9aa8);
    g.rect(2, 6, 6, 3, 0x9fd8ff);
    g.hline(3, 5, 7, 0x4a6a9a);
    g.hline(3, 6, 8, 0x4a6a9a);
    g.rect(4, 10, 2, 1, 0x7a7a88);
    g.hline(2, 7, 11, 0x7a7a88);
  }),
  /** 월급날: 지폐 두 장 + 동전 */
  payday: make(
    (g) => {
      g.rect(2, 1, 10, 6, 0x5aa85a);
      g.rect(1, 3, 10, 6, 0x7ed07a);
      g.rect(2, 4, 8, 4, 0x9ee09a);
      g.ellipse(6, 6, 1.6, 1.6, 0x3f8a46);
      g.ellipse(9.5, 9.5, 2.6, 2.6, 0xffd65a);
      g.vline(9, 8, 10, 0xe8a92e);
      g.set(8, 8, 0xfff0a8);
    },
    (g) => sparkle(g, 12, 1),
  ),
  /** 회의: 막대그래프가 그려진 화이트보드 */
  meeting: make((g) => {
    g.vline(3, 8, 11, 0x9a9aa8);
    g.vline(9, 8, 11, 0x9a9aa8);
    g.rect(1, 1, 11, 8, 0xf4f4ee);
    g.vline(3, 5, 7, 0xe8503a);
    g.vline(4, 5, 7, 0xe8503a);
    g.vline(6, 4, 7, 0x4a90d8);
    g.vline(7, 4, 7, 0x4a90d8);
    g.vline(9, 2, 7, 0x3fa05a);
    g.vline(10, 2, 7, 0x3fa05a);
  }),
  /** 결재: 서류 + 빨간 도장 */
  approve: make((g) => {
    g.rect(2, 1, 9, 11, 0xf4f0e0);
    g.hline(3, 9, 3, 0xa8a090);
    g.hline(3, 8, 5, 0xa8a090);
    g.hline(3, 6, 7, 0xa8a090);
    g.ellipse(8.5, 9, 2.6, 2.6, 0xe03a2a);
    g.ellipse(8.5, 9, 1.4, 1.4, 0xf4f0e0);
    g.set(8, 9, 0xe03a2a);
  }),
  /** 노트북 */
  laptop: make((g) => {
    g.rect(2, 2, 9, 7, 0xa8a8b8);
    g.rect(3, 3, 7, 5, 0x9fd8ff);
    g.hline(4, 7, 4, 0xffffff);
    g.hline(4, 8, 6, 0x6aa8e0);
    g.hline(1, 11, 9, 0xd0d0d8);
    g.hline(1, 11, 10, 0x8a8a98);
    g.hline(5, 7, 9, 0x8a8a98);
  }),
  /** 엑셀: 초록 머리줄 칸 표 */
  excel: make((g) => {
    g.rect(1, 1, 11, 11, 0xffffff);
    g.rect(1, 1, 11, 2, 0x3fa05a);
    for (const x of [4, 8]) g.vline(x, 3, 11, 0xa8c0a8);
    for (const y of [5, 8]) g.hline(1, 11, y, 0xa8c0a8);
    g.rect(5, 6, 3, 2, 0xb8e8c0);
    g.rect(9, 9, 3, 3, 0xb8e8c0);
  }),
  /** 지옥철: 사람 머리로 꽉 찬 지하철 앞모습 */
  subway: make((g) => {
    g.rect(1, 1, 11, 10, 0xc8ccd4);
    g.rect(2, 2, 9, 5, 0x3a4a6a);
    for (const [x, y] of [
      [2, 4],
      [4, 3],
      [6, 4],
      [8, 3],
      [10, 4],
      [3, 6],
      [5, 5],
      [7, 6],
      [9, 5],
    ])
      g.set(x, y, 0xffd65a);
    g.hline(1, 11, 8, 0x3fb05a);
    g.set(2, 9, 0xfff07a);
    g.set(10, 9, 0xfff07a);
    g.hline(2, 3, 11, 0x5a5a66);
    g.hline(9, 10, 11, 0x5a5a66);
  }),
  /** 연차: 바닷가 파라솔 */
  vacation: make(
    (g) => {
      g.ellipse(6.5, 5, 5.6, 3.6, 0xff6a5a);
      clearEllipse(g, 6.5, 8.2, 8, 2.6);
      for (let y = 0; y < 13; y++) for (const x of [3, 4, 8, 9]) if (g.filled(x, y)) g.set(x, y, 0xfff8f0);
      g.vline(6, 4, 10, 0xa0683a);
      g.hline(1, 11, 11, 0xf0d890);
      g.set(2, 10, 0xf0d890);
      g.set(10, 10, 0xf0d890);
    },
    (g) => sparkle(g, 11, 0),
  ),
  /** 칼퇴: 6시 정각 자명종 + 달려 나가는 선 */
  clockout: make(
    (g) => {
      g.set(3, 1, 0xe8503a);
      g.set(9, 1, 0xe8503a);
      g.hline(2, 3, 2, 0xe8503a);
      g.hline(9, 10, 2, 0xe8503a);
      g.ellipse(6.5, 7, 5, 4.8, 0xe8503a);
      g.ellipse(6.5, 7, 3.8, 3.6, 0xffffff);
      // 6시 정각: 분침은 위, 시침은 아래 + 3·9시 눈금
      g.vline(6, 4, 7, INK);
      g.vline(6, 8, 9, 0x6a6a78);
      g.set(3, 7, 0x8a8290);
      g.set(9, 7, 0x8a8290);
      g.set(5, 7, 0x6a6a78);
      g.set(7, 7, 0x6a6a78);
      g.set(3, 12, 0xe8503a);
      g.set(9, 12, 0xe8503a);
    },
    (g) => {
      g.set(0, 5, 0xfff0a8);
      g.set(0, 8, 0xfff0a8);
      g.set(12, 6, 0xfff0a8);
    },
  ),
  /** 회식: 거품 가득한 맥주잔 */
  beer: make((g) => {
    g.rect(2, 4, 7, 8, 0xf0b030);
    g.rect(3, 5, 1, 6, 0xffd870);
    g.rect(2, 2, 7, 3, 0xfff8e8);
    g.set(3, 1, 0xfff8e8);
    g.hline(6, 7, 1, 0xfff8e8);
    g.vline(10, 5, 9, 0xf0e0b0);
    g.hline(9, 10, 5, 0xf0e0b0);
    g.hline(9, 10, 9, 0xf0e0b0);
    g.set(6, 8, 0xffe0a0);
    g.set(5, 10, 0xffe0a0);
  }),
  /** 소주: 초록 병 + 작은 잔 */
  soju: make((g) => {
    g.rect(3, 1, 2, 1, 0x3f8a46);
    g.rect(3, 2, 2, 2, 0x58c878);
    g.rect(2, 4, 4, 8, 0x58c878);
    g.vline(2, 4, 11, 0xa8f0c0);
    g.rect(2, 7, 4, 2, 0xf4f4f4);
    g.hline(8, 11, 8, 0xe8f4f8);
    g.rect(8, 9, 4, 2, 0xc8e8f0);
    g.hline(9, 10, 11, 0xe8f4f8);
  }),

  // ── 반응 ──
  /** 엄지척 */
  thumbs: make((g) => {
    g.rect(4, 1, 3, 5, SKIN);
    g.set(6, 1, 0, 0);
    g.rect(4, 5, 7, 6, SKIN);
    g.set(10, 10, 0, 0);
    g.hline(7, 10, 7, SKIN_LO);
    g.hline(7, 10, 9, SKIN_LO);
    g.set(5, 2, 0xfff6e4);
    g.rect(1, 6, 3, 5, 0x6a9ae8);
    g.vline(1, 6, 10, 0x4a7ac8);
  }),
  /** OK: 초록 판에 O K 글자 */
  ok: make((g) => {
    g.rect(0, 3, 13, 7, 0x58c06a);
    for (const [x, y] of [
      [0, 3],
      [12, 3],
      [0, 9],
      [12, 9],
    ])
      g.set(x, y, 0, 0);
    const w = 0xffffff;
    g.vline(2, 5, 7, w);
    g.vline(5, 5, 7, w);
    g.hline(3, 4, 4, w);
    g.hline(3, 4, 8, w);
    g.vline(7, 4, 8, w);
    g.set(8, 6, w);
    g.set(9, 5, w);
    g.set(10, 4, w);
    g.set(9, 7, w);
    g.set(10, 8, w);
  }),
  /** 감사: 두 손으로 받친 하트 */
  thanks: make((g) => {
    g.ellipse(4.6, 3, 2, 2, PINK);
    g.ellipse(8.4, 3, 2, 2, PINK);
    for (let y = 4; y <= 7; y++) g.hline(3 + (y - 4), 9 - (y - 4), y, PINK);
    g.set(4, 2, 0xffc0d0);
    g.rect(1, 8, 3, 4, SKIN);
    g.rect(9, 8, 3, 4, SKIN);
    g.hline(3, 9, 10, SKIN);
    g.hline(3, 9, 11, SKIN_LO);
    g.set(1, 7, SKIN);
    g.set(11, 7, SKIN);
  }),
  /** 빠직: 이마 핏줄 표시 */
  vein: make((g) => {
    const c = 0xff4a4a;
    const hi = 0xff9a8a;
    for (const [sx, sy] of [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      const X = (x: number) => (sx > 0 ? x : 12 - x);
      const Y = (y: number) => (sy > 0 ? y : 12 - y);
      for (let y = 1; y <= 5; y++) for (const x of [4, 5]) g.set(X(x), Y(y), c);
      for (let x = 1; x <= 5; x++) for (const y of [4, 5]) g.set(X(x), Y(y), c);
      g.set(X(4), Y(1), hi);
      g.set(X(1), Y(4), hi);
    }
  }),
  /** ㅋㅋ */
  lol: make((g) => {
    const c = 0xffe066;
    for (const x of [1, 7]) {
      g.hline(x, x + 4, 3, c);
      g.vline(x + 4, 3, 10, c);
      g.hline(x + 1, x + 4, 6, c);
      g.set(x, 3, 0xfff8c8);
    }
  }),
  /** ㅠㅠ (다리가 흐르는 눈물) */
  sob: make((g) => {
    for (const x of [1, 7]) {
      g.hline(x, x + 4, 3, 0xffffff);
      g.hline(x, x + 4, 4, 0xffffff);
      g.vline(x + 1, 5, 9, TEAR);
      g.vline(x + 3, 5, 10, TEAR);
      g.set(x + 1, 10, 0xd8f0ff);
      g.set(x + 3, 11, 0xd8f0ff);
    }
  }),
  /** GG */
  gg: make((g) => {
    const c = 0xffd84a;
    for (const x of [1, 7]) {
      g.hline(x + 1, x + 4, 3, c);
      g.vline(x, 4, 8, c);
      g.hline(x + 1, x + 4, 9, c);
      g.vline(x + 4, 6, 8, c);
      g.set(x + 3, 6, c);
      g.set(x + 1, 3, 0xfff4b0);
    }
  }),
  /** 축하: 폭죽(파티 고깔) + 색종이 */
  party: make(
    (g) => {
      for (let y = 0; y < 13; y++)
        for (let x = 0; x < 13; x++) {
          const u = (x - 1 + (11 - y)) / 2;
          const v = Math.abs(x - 1 - (11 - y));
          if (u <= 5.5 && v <= u * 0.9 + 0.5) g.set(x, y, Math.floor(u) % 2 ? 0x8a6ae8 : 0xffd65a);
        }
      g.set(1, 11, 0xffd65a);
    },
    (g) => {
      for (const [x, y, c] of [
        [8, 1, 0xff6f91],
        [11, 2, 0x8fe0ff],
        [10, 5, 0xffd65a],
        [12, 8, 0x8fe08a],
        [6, 0, 0x8fe08a],
        [12, 4, 0xff6f91],
        [9, 3, 0xffffff],
      ])
        g.set(x, y, c);
    },
  ),
  /** 선물: 리본 묶은 상자 */
  gift: make((g) => {
    g.rect(2, 5, 9, 7, 0xe8503a);
    g.rect(1, 4, 11, 2, 0xff6a5a);
    g.vline(6, 4, 11, 0xffd65a);
    g.ellipse(4.5, 2.5, 1.8, 1.4, 0xffd65a);
    g.ellipse(8.5, 2.5, 1.8, 1.4, 0xffd65a);
    g.set(6, 3, 0xe8a92e);
    g.set(4, 2, 0xe8a92e);
    g.set(8, 2, 0xe8a92e);
  }),
  /** 확인: 초록 체크 */
  check: make((g) => {
    const c = 0x58d06a;
    const pts = [
      [1, 6],
      [2, 7],
      [3, 8],
      [4, 9],
      [5, 8],
      [6, 7],
      [7, 6],
      [8, 5],
      [9, 4],
      [10, 3],
      [11, 2],
    ];
    for (const [x, y] of pts) {
      g.set(x, y, c);
      g.set(x, y + 1, c);
    }
    g.set(4, 10, 0x3fa04a);
    g.set(11, 2, 0xa8f0b0);
  }),

  // ── 자연·묘역 ──
  /** 맑음: 해 */
  sun: make(
    (g) => {
      g.ellipse(6.5, 6.5, 3.4, 3.4, 0xffc83a);
      g.set(5, 5, 0xfff0a8);
      g.set(5, 4, 0xfff0a8);
    },
    (g) => {
      const r = 0xfff07a;
      g.vline(6, 0, 1, r);
      g.vline(6, 11, 12, r);
      g.hline(0, 1, 6, r);
      g.hline(11, 12, 6, r);
      for (const [x, y] of [
        [2, 2],
        [10, 2],
        [2, 10],
        [10, 10],
      ])
        g.set(x, y, r);
    },
  ),
  /** 비: 구름 + 빗방울 */
  rain: make((g) => {
    const c = 0xdfe6ee;
    g.ellipse(4.5, 4.5, 2.6, 2.6, c);
    g.ellipse(8, 3.8, 3, 3, c);
    g.rect(2, 5, 10, 2, c);
    g.hline(2, 11, 6, 0xb8c4d0);
    g.set(7, 2, 0xffffff);
    g.vline(3, 9, 10, TEAR);
    g.vline(6, 10, 11, TEAR);
    g.vline(9, 9, 10, TEAR);
  }),
  /** 달: 초승달 + 별 */
  moon: make(
    (g) => {
      g.ellipse(6, 6.5, 5, 5, 0xffe69a);
      clearEllipse(g, 8.6, 5.2, 4, 4);
      g.set(3, 4, 0xfff8d8);
    },
    (g) => {
      sparkle(g, 10, 6);
      g.set(11, 2, 0xffffff);
    },
  ),
  /** 무지개 + 양끝 구름 */
  rainbow: make((g) => {
    const bands = [0xff5a4a, 0xffa83a, 0xffe066, 0x6fd86f, 0x5aa8f0, 0x9a6ae8];
    for (let y = 0; y < 12; y++)
      for (let x = 0; x < 13; x++) {
        const d = Math.hypot(x + 0.5 - 6.5, (y + 0.5 - 11.5) * 0.72);
        const i = Math.floor(6.4 - d);
        if (i >= 0 && i < bands.length) g.set(x, y, bands[i]);
      }
    g.ellipse(2, 10.5, 1.9, 1.4, 0xffffff);
    g.ellipse(11, 10.5, 1.9, 1.4, 0xffffff);
  }),
  /** 고양이 얼굴 */
  cat: make(
    (g) => {
      const fur = 0xf0a860;
      g.ellipse(6.5, 7.3, 5.4, 4.6, fur);
      for (const [x0, d] of [
        [1, 1],
        [11, -1],
      ]) {
        g.vline(x0, 1, 4, fur);
        g.vline(x0 + d, 2, 4, fur);
        g.vline(x0 + 2 * d, 3, 4, fur);
        g.set(x0 + d, 3, 0xff9aa8);
      }
      g.vline(4, 6, 7, INK);
      g.vline(8, 6, 7, INK);
      g.set(6, 8, 0xff6f80);
      g.set(5, 9, INK);
      g.set(7, 9, INK);
      g.set(6, 9, 0xd88a48);
      g.hline(2, 3, 9, 0xffd0a0);
      g.hline(9, 10, 9, 0xffd0a0);
    },
    (g) => {
      g.set(0, 8, 0xfff8f0);
      g.set(12, 8, 0xfff8f0);
      g.set(0, 10, 0xfff8f0);
      g.set(12, 10, 0xfff8f0);
    },
  ),
  /** 강아지 얼굴 (처진 귀) */
  dog: make((g) => {
    g.ellipse(6.5, 6.8, 4.4, 5, 0xf4e4c4);
    g.rect(1, 2, 2, 6, 0xa0683a);
    g.rect(10, 2, 2, 6, 0xa0683a);
    g.set(3, 2, 0xa0683a);
    g.set(9, 2, 0xa0683a);
    g.ellipse(6.5, 9.2, 2.4, 1.8, 0xfff8ec);
    g.vline(4, 5, 6, INK);
    g.vline(8, 5, 6, INK);
    g.hline(6, 6, 8, INK);
    g.rect(5, 7, 3, 2, INK);
    g.set(5, 7, 0x6a5a50);
    g.set(6, 10, 0xff6f80);
  }),
  /** 유령 */
  ghost: make((g) => {
    const c = 0xeef4ff;
    g.ellipse(6.5, 5.5, 4.6, 4.6, c);
    g.rect(2, 6, 9, 5, c);
    g.hline(2, 10, 11, c);
    g.set(4, 11, 0, 0);
    g.set(5, 11, 0, 0);
    g.set(8, 11, 0, 0);
    g.set(7, 11, 0, 0);
    g.recolor((_, y) => y >= 9, 0xc8d8f0);
    g.vline(4, 5, 6, INK);
    g.vline(8, 5, 6, INK);
    g.rect(6, 7, 1, 2, INK);
    g.set(4, 3, 0xffffff);
  }),
  /** 묘비 + 풀 */
  tomb: make((g) => {
    g.ellipse(6.5, 4.5, 4, 3.6, 0xb8b8c4);
    g.rect(3, 4, 7, 7, 0xb8b8c4);
    g.vline(3, 4, 10, 0xd8d8e0);
    g.vline(6, 3, 8, 0x6a6a78);
    g.hline(5, 7, 4, 0x6a6a78);
    g.hline(1, 11, 11, 0x6fae4c);
    g.set(2, 10, 0x6fae4c);
    g.set(10, 10, 0x6fae4c);
    g.set(1, 10, 0x8fd06a);
  }),
  /** 촛불 */
  candle: make(
    (g) => {
      g.ellipse(6.5, 3.2, 1.6, 2.4, 0xffa83a);
      g.vline(6, 2, 4, 0xfff07a);
      g.set(6, 5, INK);
      g.rect(5, 6, 3, 5, 0xfff4dc);
      g.set(7, 6, 0xffffff);
      g.vline(5, 7, 10, 0xe8dcc0);
      g.hline(3, 9, 11, 0xd8a84a);
    },
    (g) => {
      g.set(3, 2, 0xffe0a0);
      g.set(10, 2, 0xffe0a0);
      g.set(6, 0, 0xffe0a0);
    },
  ),

  // ── 11/15 수집 의뢰 이모티콘 묶음 (qe_pack — 가진 계정만 보낸다). 보상답게 금빛 반짝임을 하나씩 얹는다 ──
  /** 월척 자랑: 통통한 푸른 물고기 + 금빛 반짝 */
  bigfish: make(
    (g) => {
      g.ellipse(5.5, 6.5, 4.6, 3.2, 0x4f9ad8);
      g.recolor((_, y) => y <= 4, 0x2f6fae);
      g.recolor((_, y) => y >= 8, 0xc8ecff);
      for (let i = 0; i < 3; i++) g.vline(10 + i, 5 - i, 8 + i, i === 2 ? 0x2f6fae : 0x4f9ad8);
      g.set(5, 3, 0x2f6fae);
      g.set(6, 2, 0x2f6fae);
      g.set(7, 3, 0x2f6fae);
      g.rect(2, 5, 2, 2, 0xffffff);
      g.set(3, 6, INK);
      g.set(1, 7, 0xe86a5a);
      g.vline(6, 5, 7, 0x8fc8f0);
    },
    (g) => {
      sparkle(g, 11, 1);
      g.set(8, 11, 0xfff0a8);
    },
  ),
  /** 빈 바구니: 위에서 들여다본 엮은 바구니 — 속이 텅 비어 어둡다 + 식은땀 */
  nobasket: make(
    (g) => {
      // 손잡이 (반원 고리)
      for (const [x, y] of [[3, 4], [3, 3], [4, 2], [5, 1], [6, 1], [7, 1], [8, 2], [9, 3], [9, 4]] as const) g.set(x, y, 0x9a6430);
      for (let y = 5; y <= 11; y++) {
        const inset = y >= 9 ? y - 8 : 0;
        for (let x = 1 + inset; x <= 11 - inset; x++) g.set(x, y, (x + (y >> 1)) % 2 === 0 ? 0xc8904a : 0xa8743a);
      }
      // 텅 빈 속 (어두운 안쪽) + 테두리
      g.ellipse(6.5, 6, 4.6, 1.6, 0x4a2c16);
      g.hline(2, 10, 5, 0x6a4020);
      g.hline(1, 11, 7, 0xe8b870);
      g.hline(3, 9, 11, 0x8a5a2a);
    },
    (g) => {
      g.set(11, 0, TEAR);
      g.set(11, 1, TEAR);
      g.set(12, 2, 0x9fd8ff);
      g.set(10, 2, 0x9fd8ff);
      g.set(11, 2, 0xd8f0ff);
    },
  ),
  /** 금빛 곤충: 번쩍이는 금 딱정벌레 (위에서 본 모습) */
  goldbug: make(
    (g) => {
      g.ellipse(6.5, 7.4, 3.6, 4.1, 0xf2c43a);
      g.recolor((x) => x >= 8, 0xd4a020);
      g.vline(6, 4, 11, 0x8a6414);
      g.ellipse(6.5, 2.8, 1.8, 1.4, 0x8a6414);
      g.set(5, 1, 0x6a4a10);
      g.set(8, 1, 0x6a4a10);
      g.vline(4, 5, 7, 0xfff0a0);
      g.set(5, 5, 0xfff8d0);
      g.set(8, 8, 0xfff0a0);
    },
    (g) => {
      // 가는 다리 (외곽선 없이 — 몸 옆으로 비스듬히)
      for (const [x, y] of [[1, 5], [1, 8], [1, 10], [11, 5], [11, 8], [11, 10]] as const) g.set(x, y, 0x7a5418);
      for (const [x, y] of [[0, 4], [0, 9], [12, 4], [12, 9]] as const) g.set(x, y, 0x7a5418);
      sparkle(g, 11, 1);
    },
  ),
  /** 광맥 발견: 바위를 뚫고 솟은 수정 + 금 알갱이 */
  orevein: make(
    (g) => {
      g.ellipse(6.5, 9.2, 5.4, 2.9, 0x7a7a8a);
      g.recolor((_, y) => y <= 8, 0x9a9aaa);
      g.vline(5, 3, 8, 0xb070ff);
      g.vline(6, 2, 8, 0xd8b0ff);
      g.vline(7, 4, 8, 0x8a4ae0);
      g.vline(9, 5, 8, 0x4ad0e0);
      g.vline(10, 6, 8, 0x2aa0b8);
      g.vline(3, 6, 8, 0x4ad0e0);
      g.set(3, 10, 0xf2c43a);
      g.set(8, 10, 0xf2c43a);
      g.set(10, 9, 0xffe27a);
    },
    (g) => {
      sparkle(g, 11, 2);
      g.set(2, 2, 0xd8b0ff);
    },
  ),
  /** 발굴 성공: 손잡이 달린 옛 항아리 + 띠무늬 */
  digfind: make(
    (g) => {
      g.ellipse(6.5, 7.6, 3.8, 3.7, 0xd8743a);
      g.rect(5, 2, 3, 3, 0xd8743a);
      g.hline(4, 8, 1, 0xe89a5a);
      g.vline(2, 4, 6, 0xb8582a);
      g.vline(10, 4, 6, 0xb8582a);
      g.hline(3, 10, 7, 0x5a3020);
      for (let x = 3; x <= 10; x += 2) g.set(x, 8, 0xf2c43a);
      g.recolor((x, y) => x >= 9 && y >= 5, 0xb8582a);
      g.vline(4, 5, 6, 0xf0a070);
      g.hline(5, 8, 11, 0xb8582a);
    },
    (g) => {
      sparkle(g, 11, 1);
      sparkle(g, 1, 2, 0xffe27a);
    },
  ),
  /** 도감 완성: 초록 도감 표지에 금별 + 책갈피 */
  dexdone: make(
    (g) => {
      g.rect(2, 1, 9, 10, 0x3f8a5a);
      g.vline(2, 1, 10, 0x2a6040);
      g.vline(10, 2, 10, 0xf4ecd8);
      g.hline(3, 9, 2, 0x5aa874);
      const star: [number, number][] = [[6, 3], [6, 4], [5, 5], [6, 5], [7, 5], [3, 6], [4, 6], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [4, 7], [5, 7], [6, 7], [7, 7], [8, 7], [5, 8], [6, 8], [7, 8], [4, 9], [5, 9], [7, 9], [8, 9]];
      for (const [x, y] of star) g.set(x, y, 0xf2c43a);
      g.set(6, 5, 0xfff0a0);
      g.set(5, 6, 0xfff0a0);
      g.vline(8, 11, 12, 0xe03a3a);
      g.set(9, 11, 0xe03a3a);
    },
    (g) => {
      sparkle(g, 11, 1);
    },
  ),
  /** 낚싯대 휘청: 활처럼 휜 낚싯대 + 팽팽한 줄 + 물보라 */
  rodbend: make(
    (g) => {
      const rod: [number, number][] = [[2, 10], [3, 9], [3, 8], [4, 7], [4, 6], [5, 5], [6, 4], [7, 3], [8, 3], [9, 3], [10, 4], [10, 5]];
      for (const [x, y] of rod) g.set(x, y, 0xc8402a);
      g.set(1, 11, 0xd8b080);
      g.set(2, 11, 0xd8b080);
      g.set(1, 10, 0xd8b080);
      g.rect(3, 10, 2, 1, 0x9a9aaa);
      g.set(10, 6, 0xe8e8f0);
      g.set(10, 7, 0xe8e8f0);
      g.set(10, 8, 0xe8e8f0);
      g.hline(8, 11, 10, 0x6ab8f0);
      g.set(7, 9, 0x9fd8ff);
      g.set(11, 9, 0x9fd8ff);
      g.set(10, 9, 0x4f9ad8);
    },
    (g) => {
      g.set(12, 2, 0xfff0a8);
      g.set(12, 3, 0xfff0a8);
      g.set(11, 1, 0xfff0a8);
      g.set(6, 1, 0xffffff);
    },
  ),
  /** 의뢰 완료 도장: 붉은 원 인장 안에 굵은 체크 + 금테 */
  qstamp: make(
    (g) => {
      g.ellipse(6.5, 6.5, 5.6, 5.6, 0xd8302a);
      g.ellipse(6.5, 6.5, 4.3, 4.3, 0xfff1dc);
      g.ellipse(6.5, 6.5, 3.4, 3.4, 0xfff8ec);
      const tick: [number, number][] = [[4, 6], [5, 7], [6, 8], [7, 7], [8, 6], [9, 5]];
      for (const [x, y] of tick) {
        g.set(x, y, 0xd8302a);
        g.set(x, y + 1, 0xd8302a);
      }
      g.recolor((x, y) => (x - 6) ** 2 + (y - 6) ** 2 >= 4.8 ** 2, 0xa81e1a);
      g.set(3, 2, 0xff8a7a);
      g.set(2, 3, 0xff8a7a);
    },
    (g) => {
      sparkle(g, 11, 1);
    },
  ),
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
