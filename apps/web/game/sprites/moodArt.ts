import type { SeatMood } from "@tomb/protocol";
import { Grid } from "./pixel";

// 24번 벤치 상태 그림: 머리 위 작은 아이콘(9×9)과 손에 든 소품(책·노트북·도시락·담요·헤드폰·휴대폰·머그잔).
// 아바타와 같은 월드 픽셀 크기로 그린다 (MoodView가 앉은 자세 기준점 — avatar.ts seatedAnchors — 에 맞춰 놓는다).

const LINE = 0x2a2420;

/** 머리 위 아이콘 크기 (정사각형) */
export const MOOD_ICON = 9;

const icon = (draw: (g: Grid) => void) => () => {
  const g = new Grid(MOOD_ICON, MOOD_ICON);
  draw(g);
  g.outline(LINE);
  return g;
};

const ICON_ART: Record<SeatMood, () => Grid> = {
  // 펼친 책
  study: icon((g) => {
    g.rect(1, 2, 3, 5, 0xf6efd8);
    g.rect(5, 2, 3, 5, 0xf6efd8);
    g.vline(4, 3, 7, 0x8a5a3a);
    g.hline(1, 3, 7, 0x6a8ad8);
    g.hline(5, 7, 7, 0x6a8ad8);
    g.hline(2, 3, 3, 0xa8a090);
    g.hline(5, 6, 3, 0xa8a090);
    g.hline(2, 3, 5, 0xa8a090);
    g.hline(5, 6, 5, 0xa8a090);
  }),
  // 노트북 (빛나는 화면)
  work: icon((g) => {
    g.rect(1, 1, 7, 5, 0x5a6270);
    g.rect(2, 2, 5, 3, 0x8fe0ff);
    g.set(2, 2, 0xe0f8ff);
    g.rect(0, 6, 9, 2, 0xb8bcc4);
    g.hline(3, 5, 7, 0x8a8e98);
  }),
  // 김이 나는 밥그릇
  meal: icon((g) => {
    g.ellipse(4.5, 4.4, 3.2, 1.8, 0xfaf6ec);
    g.rect(1, 5, 7, 2, 0xd8503a);
    g.rect(2, 7, 5, 1, 0xa8382a);
    g.hline(2, 6, 5, 0xe86a50);
    g.set(3, 3, 0xffffff);
    // 젓가락
    g.set(6, 1, 0xc89a5a);
    g.set(7, 2, 0xc89a5a);
    g.set(5, 1, 0xc89a5a);
  }),
  // 초승달
  rest: icon((g) => {
    g.ellipse(4.5, 4.5, 3.6, 3.6, 0xffe27a);
    for (let y = 0; y < MOOD_ICON; y++) for (let x = 0; x < MOOD_ICON; x++) if ((x - 6.2) ** 2 + (y - 3.4) ** 2 < 8.5) g.set(x, y, 0, 0);
    g.set(2, 4, 0xfff4c0);
  }),
  // 음표 두 개
  music: icon((g) => {
    const c = 0xd8c0ff;
    g.vline(3, 1, 6, c);
    g.vline(7, 1, 5, c);
    g.hline(3, 7, 1, c);
    g.hline(3, 7, 2, c);
    g.rect(1, 6, 3, 2, c);
    g.rect(5, 5, 3, 2, c);
  }),
  // 휴대폰 + 울림
  call: icon((g) => {
    g.rect(3, 1, 4, 7, 0x3a3a48);
    g.rect(4, 2, 2, 4, 0x8fe0ff);
    g.set(4, 7, 0x8a8aa0);
    g.set(1, 3, 0xfff0a8);
    g.set(1, 5, 0xfff0a8);
    g.set(8, 4, 0xfff0a8);
  }),
  // 머그잔 + 김
  coffee: icon((g) => {
    g.rect(1, 3, 5, 5, 0xf2ead8);
    g.rect(2, 3, 3, 1, 0x6a4026);
    g.rect(6, 4, 2, 3, 0xf2ead8);
    g.set(6, 5, 0, 0);
    g.set(2, 1, 0xd8d0c0);
    g.set(4, 0, 0xd8d0c0);
    g.set(3, 2, 0xd8d0c0);
  }),
};

export function moodIconGrid(m: SeatMood): Grid {
  return ICON_ART[m]();
}
export const moodIconKey = (m: SeatMood) => `mood-icon-${m}`;

// ── 손에 든 소품 ──

/** 소품이 놓이는 곳: lap = 무릎·손(배 앞), head = 머리에 씀, ear = 귀에 댐 */
export type PropPlace = "lap" | "head" | "ear";
export const MOOD_PROP_PLACE: Record<SeatMood, PropPlace> = {
  study: "lap",
  work: "lap",
  meal: "lap",
  rest: "lap",
  music: "head",
  call: "ear",
  coffee: "lap",
};

/** 앞모습(down)·옆모습(side) 소품 그림. 뒷모습은 몸에 가려지므로 앞모습 그림을 몸 뒤에 둔다 */
export function moodPropGrid(m: SeatMood, view: "down" | "side", headW = 10): Grid {
  switch (m) {
    case "study": {
      // 빨간 표지 책 (아래쪽에 종이 단면)
      const g = new Grid(view === "side" ? 4 : 7, 5);
      g.rect(0, 0, g.w, 4, 0xc84a3a);
      g.hline(0, g.w - 1, 0, 0xe86a50);
      g.hline(0, g.w - 1, 4, 0xf6efd8);
      if (view !== "side") g.vline(1, 1, 3, 0x9a3428);
      g.outline(LINE);
      return g;
    }
    case "work": {
      if (view === "side") {
        // 옆에서 본 노트북: 세운 화면 + 무릎 위 본체
        const g = new Grid(7, 6);
        g.vline(0, 0, 4, 0x5a6270);
        g.vline(1, 1, 4, 0x8fe0ff);
        g.hline(0, 6, 5, 0xb8bcc4);
        g.outline(LINE);
        return g;
      }
      // 앞에서 보면 화면 뒷면(덮개)이 보인다 + 덮개 가운데 작은 로고 빛
      const g = new Grid(10, 7);
      g.rect(0, 0, 10, 6, 0x6a7280);
      g.hline(0, 9, 0, 0x8a92a0);
      g.set(5, 3, 0xd8f0ff);
      g.set(4, 3, 0xa8c8e0);
      g.hline(0, 9, 6, 0xb8bcc4);
      g.outline(LINE);
      return g;
    }
    case "meal": {
      // 도시락 (빨간 뚜껑을 열어 반찬이 보인다) + 젓가락
      const g = new Grid(view === "side" ? 6 : 8, 5);
      g.rect(0, 2, g.w, 3, 0xd8503a);
      g.hline(0, g.w - 1, 2, 0xfaf6ec);
      g.set(2, 2, 0x8fc060);
      g.set(Math.min(g.w - 2, 4), 2, 0xffd050);
      g.set(g.w - 2, 1, 0xc89a5a);
      g.set(g.w - 1, 0, 0xc89a5a);
      g.set(g.w - 3, 1, 0xc89a5a);
      g.outline(LINE);
      return g;
    }
    case "rest": {
      // 무릎 담요 (체크무늬)
      const g = new Grid(view === "side" ? 8 : 12, 5);
      for (let y = 0; y < 5; y++)
        for (let x = 0; x < g.w; x++) g.set(x, y, (x >> 1) % 2 === 0 || y % 3 === 0 ? 0x8a6ad8 : 0xb8a0f0);
      g.set(0, 4, 0, 0);
      g.set(g.w - 1, 4, 0, 0);
      g.outline(LINE);
      return g;
    }
    case "music": {
      // 헤드폰: 머리 위 띠 + 양쪽 귀 덮개 (옆모습은 덮개 하나)
      const w = Math.max(9, headW + 3);
      const g = new Grid(w, 7);
      const band = 0x3a3a48;
      const cup = 0xe86a8a;
      g.hline(2, w - 3, 0, band);
      g.set(1, 1, band);
      g.set(w - 2, 1, band);
      g.vline(0, 2, 3, band);
      g.vline(w - 1, 2, 3, band);
      if (view === "side") {
        const c = Math.floor(w / 2);
        g.rect(c - 1, 3, 3, 4, cup);
        g.set(c, 4, 0xffb0c0);
        // 옆에서는 띠가 귀 덮개까지 내려온다
        g.vline(c, 1, 2, band);
      } else {
        g.rect(0, 3, 2, 4, cup);
        g.rect(w - 2, 3, 2, 4, cup);
        g.set(0, 4, 0xffb0c0);
        g.set(w - 1, 4, 0xffb0c0);
      }
      g.outline(LINE);
      return g;
    }
    case "call": {
      // 귀에 댄 휴대폰
      const g = new Grid(3, 5);
      g.rect(0, 0, 3, 5, 0x3a3a48);
      g.set(1, 1, 0x8fe0ff);
      g.set(1, 2, 0x8fe0ff);
      g.outline(LINE);
      return g;
    }
    case "coffee": {
      // 두 손으로 든 머그잔 + 김 (김은 외곽선 없이)
      // 몸 색과 섞이지 않게 푸른 머그잔 (흰 띠 하나)
      const mug = 0x4f8ab8;
      const g = new Grid(6, 7);
      g.rect(0, 2, 4, 5, mug);
      g.hline(0, 3, 2, 0x6a4026);
      g.hline(0, 3, 4, 0xe8f0f8);
      g.vline(4, 3, 5, mug);
      g.vline(5, 3, 5, mug);
      g.set(4, 4, 0, 0);
      g.outline(LINE);
      g.set(1, 0, 0xe8e0d0, 180);
      g.set(2, 1, 0xe8e0d0, 140);
      return g;
    }
  }
}

export const moodPropKey = (m: SeatMood, view: "down" | "side", headW: number) => `mood-prop-${m}-${view}${m === "music" ? `-${headW}` : ""}`;

const urlCache = new Map<string, string>();

/** UI(벤치 상태 고르기)용 아이콘 dataURL — 게임과 같은 그림을 정수 배율로 (브라우저 전용, 캐시) */
export function moodIconDataUrl(m: SeatMood, scale = 3): string {
  const key = `${m}|${scale}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const src = moodIconGrid(m).toCanvas();
  const c = document.createElement("canvas");
  c.width = src.width * scale;
  c.height = src.height * scale;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/png");
  urlCache.set(key, url);
  return url;
}
