import { EMO_ART_IDS, emoArtGrid, type EmoArtId } from "./emoArt";
import { HOUSE_ICON_ART, HOUSE_ICONS, type HouseIcon } from "./houseIcons";
import { Grid } from "./pixel";

// 머리 위 이모티콘 (손 흔들기·환호·헌화). 말풍선 안에 화면 픽셀 3배로 크게 그린다 (SpeechBubble.showIcon).
// 순수 그리드라 테스트에서 크기·외곽선을 확인한다.

/** 3번: 집 안 가구 이모티콘(간식·하트·음표 …, houseIcons.ts)도 같은 말풍선에 뜬다. 5번: 이모티콘 판 그림(emoArt.ts) */
export type EmoteIcon = "wave" | "cheer" | "flower" | HouseIcon | EmoArtId;
export const EMOTE_ICONS: readonly EmoteIcon[] = ["wave", "cheer", "flower", ...HOUSE_ICONS, ...EMO_ART_IDS];

const LINE = 0x2a2420;

/** 펼친 손 (손가락 사이는 외곽선이 갈라 준다) + 흔드는 표시 */
function wave(): Grid {
  const g = new Grid(13, 13);
  const skin = 0xffe7c2;
  const shade = 0xe9c497;
  for (const [x, y0] of [
    [4, 2],
    [6, 1],
    [8, 2],
    [10, 4],
  ])
    g.vline(x, y0, 7, skin);
  g.rect(4, 6, 7, 4, skin);
  g.hline(5, 9, 10, skin);
  g.set(3, 7, skin);
  g.set(2, 6, skin);
  g.set(2, 5, skin);
  g.hline(5, 10, 9, shade);
  g.hline(5, 9, 10, shade);
  g.set(6, 1, 0xfff6e4);
  g.outline(LINE);
  // 흔드는 선 (외곽선 없이 밝게)
  g.set(0, 2, 0xfff0a8);
  g.set(1, 1, 0xfff0a8);
  g.set(12, 9, 0xfff0a8);
  g.set(12, 10, 0xfff0a8);
  return g;
}

/** 큰 별 + 작은 반짝임 두 개 */
function cheer(): Grid {
  const g = new Grid(13, 13);
  const y = 0xffd84a;
  const hi = 0xfff4b0;
  const lo = 0xe8a92e;
  g.vline(5, 1, 3, y);
  g.hline(4, 6, 3, y);
  g.hline(1, 9, 4, y);
  g.hline(2, 8, 5, y);
  g.hline(3, 7, 6, y);
  g.hline(3, 7, 7, y);
  g.set(2, 8, y);
  g.set(3, 8, y);
  g.set(7, 8, y);
  g.set(8, 8, y);
  g.set(2, 9, lo);
  g.set(8, 9, lo);
  g.set(5, 2, hi);
  g.set(4, 4, hi);
  g.set(5, 4, hi);
  g.hline(6, 7, 7, lo);
  g.outline(LINE);
  // 작은 반짝임 (분홍·하늘)
  const spark = (x: number, yy: number, c: number) => {
    g.set(x, yy, 0xffffff);
    g.set(x - 1, yy, c);
    g.set(x + 1, yy, c);
    g.set(x, yy - 1, c);
    g.set(x, yy + 1, c);
  };
  spark(11, 2, 0xff8fb8);
  spark(11, 10, 0x8fe0ff);
  return g;
}

/** 다섯 잎 꽃 + 줄기 */
function flower(): Grid {
  const g = new Grid(13, 13);
  const petal = 0xffa8c8;
  const hi = 0xffd9e6;
  const leaf = 0x6fae4c;
  g.vline(6, 8, 11, leaf);
  g.set(7, 10, leaf);
  g.set(8, 9, leaf);
  for (const [x, y] of [
    [6, 2.2],
    [3.4, 4.6],
    [8.6, 4.6],
    [4.4, 7.6],
    [7.6, 7.6],
  ])
    g.ellipse(x + 0.5, y + 0.5, 1.7, 1.7, petal);
  g.set(5, 2, hi);
  g.set(3, 4, hi);
  g.ellipse(6.5, 5.6, 1.3, 1.3, 0xffe066);
  g.outline(LINE);
  return g;
}

const ART: Record<Exclude<EmoteIcon, EmoArtId>, () => Grid> = { wave, cheer, flower, ...HOUSE_ICON_ART };

export function emoteGrid(kind: EmoteIcon): Grid {
  return kind in ART ? ART[kind as keyof typeof ART]() : emoArtGrid(kind as EmoArtId);
}

const urlCache = new Map<string, string>();

/** UI(이모티콘 판)용 그림 dataURL — 게임과 같은 그림을 정수 배율로 (브라우저 전용, 같은 인자면 캐시) */
export function emoteDataUrl(kind: EmoteIcon, scale = 3): string {
  const key = `${kind}|${scale}`;
  const hit = urlCache.get(key);
  if (hit) return hit;
  const src = emoteGrid(kind).toCanvas();
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

export const emoteTexKey = (kind: EmoteIcon) => `emote-${kind}`;
