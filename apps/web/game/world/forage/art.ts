import type * as Phaser from "phaser";
import { MAP_CONCEPTS, type MapConcept } from "@/lib/mapConcept";
import { seasonHat, seasonHolly, seasonKey, seasonMitt, seasonScarf, seasonSnow } from "../../sprites/npcSeasonArt";
import { forageIconCanvas } from "../../sprites/forageIcons";
import { darken, Grid, lighten, type Color } from "../../sprites/pixel";
import { RAMP, toneOutline } from "../../sea/seaArt";
import { snowRoof } from "../../sprites/winterArt";

// 4·32번 낚시·채집 월드 그림 (코드로 그리는 픽셀아트): NPC 둘(어부 영감·수집가 유령)과 노점, 11/20 바닷가 해녀 할망과 파라솔 좌판, 채집 지점 4종, 찌, 느낌표.
// 처음 쓸 때 장면 텍스처에 한 번 올린다 (ensureForageTextures). 발 위치가 그림 맨 아래 줄 가운데다.

export const FTEX = {
  /** 11/17 판마다 따로 (기본판은 예전 키 그대로) */
  npc: (id: string, f: number, concept: MapConcept = "default") => seasonKey(`forage-npc-${id}-${f}`, concept),
  stall: (id: string) => `forage-stall-${id}`,
  /** 11/20 해녀 할망 좌판: 판마다·밤(파라솔 등 켬) 따로 */
  seaStall: (concept: MapConcept, lit: boolean) => seasonKey(`forage-stall-haenyeo${lit ? "-n" : ""}`, concept),
  /** 11/26 캠핑장 낚시터 사장님 미끼·대여 부스: 판마다·밤(창 불빛) 따로 */
  campStall: (concept: MapConcept, lit: boolean) => seasonKey(`forage-stall-trader${lit ? "-n" : ""}`, concept),
  /** 11/18 곤충 수풀은 밤 그림을 따로 키로 (예전엔 밤낮이 바뀔 때 같은 키를 지우고 다시 올려서, 다른 장면에 남은 그림이 지워진 텍스처를 가리켰다) */
  node: (kind: string, f: number, night = false) => (NIGHT_ART.has(kind) && night ? `forage-node-${kind}-n-${f}` : `forage-node-${kind}-${f}`),
  bobber: "forage-bobber",
  bang: "forage-bang",
  icon: (id: string) => `forage-icon-${id}`,
} as const;

const OUT = 0x16121a;

/** 11/26 낮·밤 그림이 다른 지점 그림 (곤충 수풀·모래 언덕 수풀·바위 웅덩이 곤충) */
const NIGHT_ART = new Set(["bug", "dunegrass", "pool-bug"]);
/**
 * 11/26 도감 확장: 지점 그림 갈래. 바닷가 새 지점 중 바위·물·모래에 맞는 그림이 따로 있다 —
 * 갯바위 약초 = 바위 위 해초, 바위 웅덩이 = 바위 웅덩이(종류마다 조금씩), 모래 언덕 곤충 = 갯그령 수풀, 백사장 광석 = 몽돌 무더기.
 * 나머지(예전 지점·캠핑장 계곡 둑·백사장 모래 파기)는 종류 그림 그대로
 */
export function nodeArtOf(n: { kind: string; where: string }): string {
  if (n.where === "tidepool") return `pool-${n.kind}`;
  if (n.where === "searock" && n.kind === "herb") return "seaweed";
  if (n.where === "dune" && n.kind === "bug") return "dunegrass";
  if (n.where === "beach" && n.kind === "ore") return "pebbles";
  return n.kind;
}

/** 유령 몸 (두건 없는 흰 천): 아래 물결 자락, 눈 두 개 (eyes = false면 눈은 그리는 쪽이 따로 — 11/20 해녀 할망 웃는 눈) */
function ghostBody(g: Grid, ox: number, oy: number, body: Color, frame: number, eyes = true): void {
  const shade = darken(body, 0.18);
  g.ellipse(ox + 8, oy + 8, 6, 6.2, body);
  g.rect(ox + 2, oy + 8, 13, 9, body);
  // 물결 자락 (프레임마다 살짝 다르게)
  for (let x = 2; x <= 14; x++) if ((x + frame) % 3 !== 0) g.set(ox + x, oy + 17, body);
  g.recolor((x, y) => x >= ox + 11 && y > oy + 6, shade);
  if (!eyes) return;
  g.set(ox + 6, oy + 8, 0x1a1620);
  g.set(ox + 10, oy + 8, 0x1a1620);
  g.set(ox + 6, oy + 7, 0x1a1620);
  g.set(ox + 10, oy + 7, 0x1a1620);
}

/** 어부 영감: 노란 우비 모자·회색 수염·멜빵, 손에 생선 한 마리. 24×26.
 *  11/17 겨울판 = 수염 밑 두툼한 목도리·모자 위 눈·벙어리장갑, 크리스마스판 = 산타 모자·멜빵에 호랑가시·빨강 초록 목도리 */
function fishmonger(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const g = new Grid(24, 26);
  const ox = 4;
  const oy = 7;
  ghostBody(g, ox, oy, 0xe8e4da, frame);
  // 멜빵 바지 (파랑)
  g.rect(ox + 3, oy + 12, 11, 5, 0x3a5a8a);
  g.vline(ox + 5, oy + 8, oy + 12, 0x3a5a8a);
  g.vline(ox + 11, oy + 8, oy + 12, 0x3a5a8a);
  // 목도리 (수염 밑으로 양옆·끝만 보인다)
  if (concept === "winter") seasonScarf(g, ox + 2, ox + 14, oy + 9, { c: 0xc8463c, thick: true, tail: ox + 3 });
  else if (concept === "christmas") seasonScarf(g, ox + 2, ox + 14, oy + 9, { c: 0xd23a44, c2: 0x2e8a4e, pat: "stripe", thick: true, tail: ox + 3 });
  // 수염
  g.ellipse(ox + 8, oy + 11, 3.4, 2, 0xb8b8b0);
  g.set(ox + 8, oy + 10, 0xd8a090);
  if (concept === "christmas") {
    // 산타 모자 + 멜빵 끝 호랑가시
    seasonHat(g, ox + 8, oy + 8, 6, oy + 2, { kind: "santa" });
    seasonHolly(g, ox + 11, oy + 13);
  } else {
    // 우비 모자 (사우웨스터): 넓은 챙
    const hat = 0xf0c030;
    g.rect(ox + 3, oy - 2, 11, 5, hat);
    g.hline(ox + 1, ox + 15, oy + 3, darken(hat, 0.15));
    g.hline(ox, ox + 16, oy + 4, darken(hat, 0.15));
    g.recolor((x, y) => y <= oy - 1 && x >= ox + 10, lighten(hat, 0.2));
    if (concept === "winter") seasonSnow(g, ox + 3, ox + 13, oy - 3);
  }
  // 손에 든 생선 (오른쪽)
  const fx = ox + 15;
  const fy = oy + 11 + (frame ? 1 : 0);
  g.ellipse(fx + 2.5, fy, 2.8, 1.4, 0x8aa0b0);
  g.set(fx + 5, fy - 1, 0x6a8090);
  g.set(fx + 5, fy + 1, 0x6a8090);
  g.set(fx + 1, fy - 1, 0x101014);
  // 생선 잡은 장갑 낀 손
  if (concept !== "default") seasonMitt(g, fx - 1, fy - 1, concept === "winter" ? 0x3a5a8a : 0x2e8a4e);
  g.outline(OUT);
  return g.toCanvas();
}

/** 수집가 유령: 보라 망토·둥근 안경·커다란 배낭(잡동사니가 삐죽), 허리춤 작은 등불. 24×26.
 *  11/17 겨울판 = 겨자색 털모자·초록 목도리·배낭에 눈, 크리스마스판 = 반투명 산타 모자·망토에 호랑가시·빨간 목도리 */
function collector(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const g = new Grid(24, 26);
  const ox = 5;
  const oy = 7;
  // 배낭 (왼쪽 뒤)
  const pack = 0x8a5a32;
  g.rect(ox - 4, oy + 1, 8, 12, pack);
  g.rect(ox - 4, oy + 1, 8, 2, darken(pack, 0.25));
  g.set(ox - 3, oy - 1, 0x9aa4ae); // 삐죽 나온 국자
  g.vline(ox - 3, oy - 1, oy + 1, 0x9aa4ae);
  g.set(ox, oy - 2, 0xe8c24a); // 두루마리
  g.vline(ox, oy - 2, oy + 1, 0xe8c24a);
  g.set(ox + 2, oy, 0x4ad0c0);
  ghostBody(g, ox, oy, 0xd8d0f0, frame);
  // 망토 (보라)
  g.rect(ox + 2, oy + 11, 13, 6, 0x6a4a9a);
  g.recolor((x, y) => y >= oy + 11 && y <= oy + 16 && x >= ox + 11, 0x5a3a88);
  if (concept === "winter") {
    seasonScarf(g, ox + 2, ox + 14, oy + 11, { c: 0x3a9a72, c2: 0xe8e0c8, pat: "stripe", tail: ox + 11 });
    seasonSnow(g, ox - 4, ox + 3, oy + 1);
  } else if (concept === "christmas") {
    seasonScarf(g, ox + 2, ox + 14, oy + 11, { c: 0xd23a44, c2: 0xf8f6f0, pat: "dots", tail: ox + 11 });
    seasonHolly(g, ox + 5, oy + 14);
  }
  // 둥근 안경
  for (const cx of [6, 10]) {
    g.set(ox + cx - 1, oy + 7, 0xe8c24a);
    g.set(ox + cx + 1, oy + 7, 0xe8c24a);
    g.set(ox + cx, oy + 6, 0xe8c24a);
    g.set(ox + cx, oy + 9, 0xe8c24a);
  }
  // 작은 등불
  const lx = ox + 15;
  const ly = oy + 12 + (frame ? 1 : 0);
  g.rect(lx, ly, 3, 3, 0xffd060);
  g.set(lx + 1, ly - 1, 0x5a5a64);
  if (concept === "winter") seasonHat(g, ox + 8, oy + 8, 6, oy + 2, { kind: "beanie", c: 0xd8a83a, c2: 0x6a4a9a });
  g.outline(OUT);
  // 유령이라 산타 모자도 비쳐 보이게 (외곽선 없이)
  if (concept === "christmas") seasonHat(g, ox + 8, oy + 8, 6, oy + 2, { kind: "ghostSanta", c: 0xf08a9a });
  return g.toCanvas();
}

/** 생선 노점: 얼음 위 생선이 놓인 나무 상자 + "생선" 팻말. 26×18 */
function fishStall(): HTMLCanvasElement {
  const g = new Grid(26, 18);
  const wood = 0x9a6a3a;
  g.rect(2, 8, 22, 9, wood);
  g.hline(2, 23, 12, darken(wood, 0.25));
  g.rect(3, 5, 20, 4, 0xd8eef8); // 얼음
  for (const [x, c] of [[5, 0x8aa0b0], [11, 0xb08a3a], [17, 0x6a8a4a]] as const) {
    g.ellipse(x + 2.5, 6, 3, 1.4, c);
    g.set(x + 5, 6, darken(c, 0.2));
    g.set(x + 1, 5, 0x101014);
  }
  // 팻말
  g.rect(20, 0, 6, 5, 0xf0e8d0);
  g.vline(22, 5, 8, darken(wood, 0.2));
  g.hline(21, 24, 2, 0xd84a3a);
  g.outline(OUT);
  return g.toCanvas();
}

/** 수집가 좌판: 돗자리 위 병·상자·반짝이. 26×12 */
function collectorMat(): HTMLCanvasElement {
  const g = new Grid(26, 12);
  g.rect(1, 6, 24, 5, 0xb84a4a);
  for (let x = 2; x < 25; x += 3) g.vline(x, 6, 10, 0xd86a5a);
  g.rect(3, 2, 3, 5, 0x6ad0c0); // 병
  g.set(4, 1, 0x9a6a3a);
  g.rect(9, 3, 5, 4, 0x8a5a32); // 상자
  g.hline(9, 13, 3, 0xe8c24a);
  g.ellipse(18, 5, 2, 2, 0xa86ae0); // 수정
  g.set(18, 4, 0xffffff);
  g.rect(21, 4, 3, 3, 0xe8c24a); // 동전 더미
  g.outline(OUT);
  return g.toCanvas();
}

/** 채집 지점 그림 (2프레임: 흔들림·반짝임) */
function nodeArt(kind: string, f: number, night: boolean): HTMLCanvasElement {
  switch (kind) {
    case "herb": {
      const g = new Grid(14, 12);
      const leaf = 0x5aa040;
      const sway = f ? 1 : 0;
      for (const [x, y, rx] of [[4, 8, 2.6], [10, 8, 2.6], [7, 6, 2.2]] as const) g.ellipse(x + (y < 7 ? sway : 0), y, rx, 1.6, y < 7 ? lighten(leaf, 0.15) : leaf);
      g.vline(7 + sway, 3, 9, darken(leaf, 0.3));
      g.set(7 + sway, 2, 0xf0e070);
      g.set(6 + sway, 2, 0xf8f0a0);
      g.ellipse(7, 11, 5, 1, 0x5a4028);
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    case "ore": {
      const g = new Grid(16, 12);
      g.ellipse(8, 7.5, 6.5, 4.2, 0x7a7c84);
      g.rect(3, 5, 4, 3, 0x8a8c94);
      g.recolor((x, y) => y >= 9, 0x5a5c64);
      g.recolor((x, y) => y <= 5 && x <= 8, 0xa0a2aa);
      g.vline(10, 2, 6, 0xa86ae0);
      g.vline(11, 3, 6, 0xc89af0);
      g.set(5, 7, 0x8ad0ff);
      if (f) {
        g.set(11, 2, 0xffffff);
        g.set(5, 6, 0xffffff);
      }
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    case "dig": {
      const g = new Grid(16, 10);
      g.ellipse(8, 7, 6.5, 2.6, 0x7a5232);
      g.recolor((x, y) => y <= 5, 0x9a6a42);
      // X 표시
      for (let i = 0; i < 4; i++) {
        g.set(6 + i, 5 + (i % 2), 0xe8d8b0);
        g.set(9 - i, 5 + (i % 2), 0xe8d8b0);
      }
      // 반짝
      const sx = f ? 12 : 4;
      g.set(sx, 2, 0xfff6c0);
      g.set(sx - 1, 3, 0xffe08a);
      g.set(sx + 1, 3, 0xffe08a);
      g.set(sx, 4, 0xfff6c0);
      g.set(sx, 3, 0xffffff);
      g.outline(OUT, false, 160);
      return g.toCanvas();
    }
    case "clam": {
      // 11/16 갯벌 구멍: 젖은 펄 둔덕에 숨구멍 둘·조개 끝·뽀글 거품
      const g = new Grid(16, 10);
      g.ellipse(8, 7, 6.5, 2.6, 0x5a4a3c);
      g.recolor((x, y) => y <= 5, 0x6e5c4a);
      g.set(5, 6, 0x261e18);
      g.set(10, 7, 0x261e18);
      g.set(11, 7, 0x261e18);
      g.ellipse(7.5, 5, 1.6, 1, 0xd8ccb4);
      g.set(7, 5, 0x9a8a72);
      // 거품 (프레임마다 오르내린다)
      const by = f ? 2 : 3;
      g.set(5, by, 0xdcecf4);
      g.set(11, by + 1, 0xdcecf4);
      g.set(12, by - 1, 0xf4fbff);
      g.outline(OUT, false, 160);
      return g.toCanvas();
    }
    case "seaweed": {
      // 11/26 갯바위 해초: 젖은 작은 바위 위로 미역·톳 줄기가 하늘거린다
      const g = new Grid(16, 14);
      g.ellipse(8, 10.5, 6.6, 3.1, 0x8e98a2);
      g.recolor((x, y) => y <= 9, 0xaeb8c0);
      g.recolor((x, y) => y >= 12, 0x6c7680);
      const sway = f ? 1 : 0;
      for (const [x, top, c] of [[5, 4, 0x6a7a2e], [8, 2, 0x4a9a4a], [11, 5, 0x5a6a26]] as const) {
        for (let y = top; y <= 9; y++) g.set(x + ((y + sway) % 3 === 0 ? 1 : 0), y, c);
        g.set(x, top - 1, lighten(c, 0.25));
      }
      g.set(4, 10, 0xe8f4fa);
      g.set(12, 11, 0xd0e4ee);
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    case "pool-herb":
    case "pool-bug":
    case "pool-ore": {
      // 11/26 바위 웅덩이: 바위 테두리 안 얕은 물. 약초 = 가장자리 해초, 곤충 = 물 위 바다소금쟁이(밤엔 푸른 빛), 광석 = 바닥의 진주 반짝임
      const g = new Grid(18, 11);
      // 맵의 바위 웅덩이 장식과 같은 색 (밝은 회색 테 · 옥빛 물)
      g.ellipse(9, 6, 8.2, 4.4, 0xa6b0b8);
      g.recolor((x, y) => y <= 3, 0xc4ccd2);
      g.recolor((x, y) => y >= 9, 0x86909a);
      g.ellipse(9, 6.2, 5.8, 2.6, 0x5cc0cc);
      g.recolor((x, y) => y <= 5 && g.get(x, y) === Grid.rgba(0x5cc0cc), 0x8edce2);
      g.hline(6, 8, 5, 0xe0fafc);
      if (kind === "pool-herb") {
        for (const [x, y] of [[4, 3], [4, 4], [5, 2], [14, 4], [13, 3], [14, 2]]) g.set(x + (f && y < 3 ? 1 : 0), y, 0x4a9a4a);
        g.set(5, 4, 0x6ad050);
        g.set(13, 4, 0x6ad050);
      } else if (kind === "pool-bug") {
        if (night) {
          for (const [x, y] of f ? [[6, 6], [12, 7]] : [[8, 7], [11, 5]]) g.set(x, y, 0x9af0ff);
          g.set(f ? 7 : 12, 6, 0x4ad8ff, 180);
        } else {
          // 소금쟁이: 몸 + 긴 다리, 프레임마다 물결
          g.hline(9, 10, 6, 0x2a3a5a);
          for (const [x, y] of [[8, 5], [11, 5], [8, 7], [11, 7]]) g.set(x, y, 0x2a3a5a);
          const r = f ? 3 : 2;
          g.set(9 - r, 6, 0xc8f0f8);
          g.set(10 + r, 6, 0xc8f0f8);
        }
      } else {
        g.ellipse(11, 7, 1.4, 1, 0xf8f2ea);
        g.set(11, 6, 0xffffff);
        g.set(12, 7, 0xe8c8d8);
        if (f) {
          g.set(11, 4, 0xffffff);
          g.set(10, 5, 0xfff6c0);
          g.set(12, 5, 0xfff6c0);
        }
      }
      if (f) g.set(13, 6, 0xffffff);
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    case "dunegrass": {
      // 11/26 모래 언덕 갯그령 수풀: 모래 둔덕에 가늘게 휜 풀잎 + 낮엔 나비, 밤엔 반딧불
      const g = new Grid(18, 16);
      g.ellipse(9, 13, 7.5, 2.4, 0xe2c88e);
      g.recolor((x, y) => y >= 14, 0xc8ac72);
      const sway = f ? 1 : 0;
      const blades: [number, number, number, number][] = [
        [4, 7, -1, 0x9aa858],
        [6, 4, -1, 0xb8c070],
        [8, 3, 0, 0x8a9a4a],
        [10, 3, 1, 0xb8c070],
        [12, 5, 1, 0x9aa858],
        [14, 8, 1, 0xa8b464],
      ];
      for (const [x, top, lean, c] of blades)
        for (let y = top; y <= 12; y++) {
          const dx = y < top + 3 ? lean + (y === top ? sway * lean : 0) : 0;
          g.set(x + dx, y, y >= 11 ? darken(c, 0.15) : c);
        }
      g.set(8, 2, 0xe8e0a0);
      g.set(10, 2, 0xe8e0a0);
      g.outline(OUT, false, 200);
      if (night) {
        for (const [x, y] of f ? [[3, 3], [15, 4], [11, 0]] : [[5, 1], [13, 1], [16, 6]]) {
          g.set(x, y, 0xfff080);
          g.set(x + 1, y, 0xffe050, 140);
        }
      } else {
        const bx = f ? 13 : 2;
        const by = f ? 1 : 2;
        g.set(bx, by, 0xf8e8a0);
        g.set(bx + 2, by, 0xf8e8a0);
        g.set(bx + 1, by + 1, 0x2a2420);
        g.set(bx, by + 1, f ? 0xf0c040 : 0xf8e8a0);
        g.set(bx + 2, by + 1, f ? 0xf0c040 : 0xf8e8a0);
      }
      return g.toCanvas();
    }
    case "pebbles": {
      // 11/26 몽돌 해변: 파도에 둥글어진 돌 무더기 + 반짝 (바다유리 한 조각)
      const g = new Grid(16, 10);
      for (const [x, y, rx, ry, c] of [
        [5, 6.5, 3.2, 2.2, 0x6a7280],
        [10.5, 6.8, 3.4, 2.3, 0x8a8478],
        [8, 4.4, 2.6, 1.8, 0x58606c],
        [12.6, 4.2, 1.8, 1.3, 0x9a9e9a],
      ] as const) {
        g.ellipse(x, y, rx, ry, c);
        g.set(Math.round(x - 1), Math.round(y - 1), lighten(c, 0.35));
      }
      g.set(3, 8, 0x6ad0a8);
      g.set(4, 8, 0x8ae0c0);
      if (f) {
        g.set(4, 7, 0xffffff);
        g.set(9, 2, 0xffffff);
      }
      g.outline(OUT, false, 200);
      return g.toCanvas();
    }
    default: {
      // 곤충 수풀: 동그란 덤불 + 낮엔 나비, 밤엔 반딧불
      const g = new Grid(18, 16);
      const leaf = 0x4a8a3a;
      g.ellipse(9, 10, 7.5, 5, leaf);
      g.ellipse(6, 8, 3.5, 3, lighten(leaf, 0.12));
      g.ellipse(12, 8.5, 3.5, 3, lighten(leaf, 0.06));
      g.recolor((x, y) => y >= 12, darken(leaf, 0.25));
      for (const [x, y] of [[4, 11], [9, 9], [13, 12], [7, 13]]) g.set(x, y, 0xe8a0c0);
      g.outline(OUT, false, 200);
      if (night) {
        for (const [x, y] of f ? [[3, 3], [14, 5], [9, 1]] : [[5, 2], [12, 2], [15, 7]]) {
          g.set(x, y, 0xfff080);
          g.set(x + 1, y, 0xffe050, 140);
        }
      } else {
        const bx = f ? 12 : 3;
        const by = f ? 2 : 3;
        g.set(bx, by, 0xf4f4ee);
        g.set(bx + 2, by, 0xf4f4ee);
        g.set(bx + 1, by + 1, 0x2a2420);
        g.set(bx, by + 1, f ? 0xf0d040 : 0xf4f4ee);
        g.set(bx + 2, by + 1, f ? 0xf0d040 : 0xf4f4ee);
      }
      return g.toCanvas();
    }
  }
}

function bobber(): HTMLCanvasElement {
  const g = new Grid(5, 6);
  g.rect(1, 0, 3, 3, 0xe03a2a);
  g.rect(1, 3, 3, 2, 0xf4f4ee);
  g.set(2, 0, 0xff8a7a);
  g.outline(OUT, false, 200);
  return g.toCanvas();
}

function bang(): HTMLCanvasElement {
  const g = new Grid(5, 11);
  g.rect(1, 0, 3, 6, 0xfff4a0);
  g.rect(1, 8, 3, 2, 0xfff4a0);
  g.rect(2, 1, 1, 4, 0xe03a2a);
  g.set(2, 8, 0xe03a2a);
  g.outline(OUT);
  return g.toCanvas();
}

// ── 11/20 달물결 포구 해녀 할망 좌판 (물고기·채집물을 다 사요 — 마을 어부 영감·수집가 유령과 같은 NPC 규칙, 좌판은 바닷가 소품 규칙: 파스텔 RAMP·제 색 테두리) ──

/**
 * 해녀 할망: 푸른 흰 유령 몸에 짙은 남색 고무 물옷(목은 둥글게 파이고 주황 테), 이마에 올린 왕눈 물안경,
 * 꽃분홍 땡땡이 머릿수건(오른쪽 위 매듭), 웃는 눈·발그레한 볼, 오른손에 주황 테왁과 그 아래 그물 망사리(소라·성게). 24×26
 * 겨울 = 털모자(물안경은 모자 위)·두툼한 목도리·벙어리장갑, 크리스마스 = 산타 모자·빨강 초록 목도리·테왁에 호랑가시
 */
function haenyeo(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const g = new Grid(24, 26);
  const ox = 3;
  const oy = 7;
  const body = 0xe6eeee;
  ghostBody(g, ox, oy, body, frame, false);
  // 고무 물옷 (어깨부터 자락 위까지 — 목은 둥글게 넓게 파여 흰 몸이 보여요). 빛은 왼쪽 위
  const suit = 0x34405a;
  const suitHi = 0x4c5c7a;
  const suitLo = 0x262e44;
  for (let y = oy + 11; y <= oy + 16; y++)
    for (let x = ox + 2; x <= ox + 14; x++) {
      if (!g.filled(x, y)) continue;
      if (y === oy + 11 && x >= ox + 4 && x <= ox + 12) continue; // 둥근 목
      if (y === oy + 12 && x >= ox + 6 && x <= ox + 10) continue;
      g.set(x, y, x <= ox + 3 ? suitHi : x >= ox + 12 ? suitLo : suit);
    }
  // 목둘레 주황 테
  for (const [x, y] of [[ox + 3, oy + 11], [ox + 4, oy + 12], [ox + 5, oy + 12], [ox + 6, oy + 13], [ox + 7, oy + 13], [ox + 8, oy + 13], [ox + 9, oy + 13], [ox + 10, oy + 13], [ox + 11, oy + 12], [ox + 12, oy + 12], [ox + 13, oy + 11]] as const) g.set(x, y, 0xf08a3c);
  // 허리 납벨트 (짙은 줄 + 은 고리)
  g.hline(ox + 2, ox + 14, oy + 15, 0x1c2232);
  g.set(ox + 8, oy + 15, 0xd8dce4);
  // 웃는 눈 (^ ^) · 볼
  for (const cx of [ox + 6, ox + 10]) {
    g.set(cx - 1, oy + 8, 0x1a1620);
    g.set(cx, oy + 7, 0x1a1620);
    g.set(cx + 1, oy + 8, 0x1a1620);
  }
  g.set(ox + 4, oy + 9, 0xf2b0b0);
  g.set(ox + 12, oy + 9, 0xe0a0a6);
  // 왕눈 물안경 (이마 위로 올려 쓴, 모서리 둥근 테 + 유리 + 머리 둘레 끈) — 겨울엔 털모자에 가려요
  const goggles = () => {
    const gy = oy + 4;
    g.hline(ox + 5, ox + 11, gy + 1, 0x2a2e3a);
    g.set(ox + 4, gy, 0x2a2e3a);
    g.set(ox + 12, gy, 0x2a2e3a);
    g.hline(ox + 5, ox + 11, gy, 0x8ed6e6);
    g.set(ox + 5, gy, 0xeafcff);
    g.set(ox + 6, gy, 0xc4eef6);
    g.set(ox + 11, gy, 0x68b4c8);
    g.set(ox + 3, gy, 0x3a3e4a);
    g.set(ox + 13, gy, 0x3a3e4a);
  };
  // 목도리
  if (concept === "winter") seasonScarf(g, ox + 3, ox + 13, oy + 10, { c: 0xe0a83a, c2: 0xf6ead0, pat: "stripe", thick: true, tail: ox + 4 });
  else if (concept === "christmas") seasonScarf(g, ox + 3, ox + 13, oy + 10, { c: 0xd23a44, c2: 0x2e8a4e, pat: "stripe", thick: true, tail: ox + 4 });
  // 머리: 기본 = 머릿수건 + 물안경, 겨울 = 털모자, 크리스마스 = 산타 모자
  if (concept === "christmas") {
    seasonHat(g, ox + 8, oy + 7, 6, oy + 1, { kind: "santa" });
  } else if (concept === "winter") {
    seasonHat(g, ox + 8, oy + 7, 6, oy + 1, { kind: "beanie", c: 0x3a8a9a, c2: 0xf6ead0 });
  } else {
    // 꽃분홍 땡땡이 머릿수건 (정수리 세 줄, 오른쪽 위에 묶은 매듭 + 꼬리 둘) + 이마 선에 올린 물안경
    const cloth = 0xf2a6a0;
    g.recolor((x, y) => y >= oy + 1 && y <= oy + 3, cloth);
    g.recolor((x, y) => y >= oy + 1 && y <= oy + 3 && x <= ox + 5, lighten(cloth, 0.18));
    g.recolor((x, y) => y >= oy + 1 && y <= oy + 3 && x >= ox + 11, darken(cloth, 0.12));
    for (let y = oy + 1; y <= oy + 3; y++) for (let x = ox; x <= ox + 16; x++) if (g.filled(x, y) && (x * 2 + y) % 4 === 0) g.set(x, y, 0xfde8e0);
    g.set(ox + 12, oy + 1, darken(cloth, 0.08));
    g.set(ox + 13, oy + 1, cloth);
    g.set(ox + 13, oy, darken(cloth, 0.05));
    g.set(ox + 14, oy + 2, darken(cloth, 0.15));
    goggles();
  }
  // 테왁 (주황 공) + 손
  const fy = oy + 10 + (frame ? 1 : 0);
  const fx = ox + 17;
  g.set(ox + 15, oy + 12, body);
  g.set(ox + 15, oy + 13, darken(body, 0.18));
  g.ellipse(fx, fy, 3, 2.8, 0xf08a3c);
  g.recolor((x, y) => Math.hypot(x + 0.5 - fx, y + 0.5 - fy) <= 3.2 && (x >= fx + 1 || y >= fy + 1) && (x - fx) + (y - fy) >= 1, 0xcc6a2c);
  g.set(fx - 1, fy - 1, 0xffc27a);
  g.set(fx - 2, fy, 0xffa858);
  g.hline(fx - 3, fx + 2, fy, darken(0xf08a3c, 0.08));
  g.set(fx - 1, fy - 1, 0xffd8a0);
  if (concept === "christmas") seasonHolly(g, fx, fy - 2);
  // 망사리 (테왁 아래 늘어진 그물 — 소라·성게가 비쳐요)
  const ny = fy + 3;
  const rope = 0x3f7a64;
  for (let y = 0; y < 5; y++)
    for (let x = -2 + (y > 2 ? 1 : 0); x <= 2 - (y > 3 ? 1 : 0); x++) {
      const px = fx + x;
      const py = ny + y;
      if ((x + y) % 2 === 0) g.set(px, py, rope);
    }
  g.set(fx - 1, ny + 2, 0xf2dcc0);
  g.set(fx, ny + 2, 0xd8b890);
  g.set(fx + 1, ny + 3, 0x7a4a8a);
  g.set(fx, ny + 4, 0x5a3a6a);
  if (concept !== "default") seasonMitt(g, ox + 14, oy + 11, concept === "winter" ? 0xe0a83a : 0x2e8a4e);
  g.outline(OUT);
  if (concept === "winter") seasonSnow(g, ox + 4, ox + 12, oy);
  return g.toCanvas();
}

// ── 11/26 캠핑장 낚시터 사장님 + 미끼·대여 부스 (물고기·채집물을 다 사요 — 해녀 할망과 같은 NPC 규칙) ──

/**
 * 낚시터 사장님: 크림색 유령 몸에 국방색 낚시 조끼(주머니 넷·가슴에 꽂은 루어 둘), 밀짚모자(빨간 띠), 콧수염,
 * 오른손에 뜰채(긴 자루 + 둥근 그물). 24×26.
 * 겨울 = 귀달이 털모자·두툼한 목도리·벙어리장갑(조끼는 그대로), 크리스마스 = 산타 모자·빨강 초록 목도리·조끼에 호랑가시
 */
function trader(frame: number, concept: MapConcept = "default"): HTMLCanvasElement {
  const g = new Grid(24, 26);
  const ox = 3;
  const oy = 7;
  const body = 0xeae4d6;
  ghostBody(g, ox, oy, body, frame);
  // 낚시 조끼 (어깨~자락 위, 가운데는 열려서 흰 몸이 보여요). 빛은 왼쪽 위
  const vest = 0x6e7c4a;
  const vestHi = 0x8a9860;
  const vestLo = 0x55613a;
  for (let y = oy + 10; y <= oy + 16; y++)
    for (let x = ox + 2; x <= ox + 14; x++) {
      if (!g.filled(x, y)) continue;
      if (x >= ox + 7 && x <= ox + 9) continue; // 앞섶
      g.set(x, y, x <= ox + 3 ? vestHi : x >= ox + 12 ? vestLo : vest);
    }
  // 주머니 넷 (밝은 덮개) + 단추
  for (const [px, py] of [[ox + 3, oy + 12], [ox + 10, oy + 12], [ox + 3, oy + 15], [ox + 10, oy + 15]] as const) {
    g.hline(px, px + 2, py, 0xa4b27a);
    g.hline(px, px + 2, py + 1, vestLo);
  }
  g.set(ox + 6, oy + 13, 0xd8c8a0);
  g.set(ox + 10, oy + 13, 0xd8c8a0);
  // 가슴에 꽂은 루어 둘 (빨강·노랑)
  g.set(ox + 4, oy + 10, 0xe0503c);
  g.set(ox + 5, oy + 11, 0xf0c040);
  // 콧수염
  g.hline(ox + 6, ox + 10, oy + 10, 0x6a5a48);
  g.set(ox + 8, oy + 10, 0x7a6a56);
  // 목도리
  if (concept === "winter") seasonScarf(g, ox + 2, ox + 14, oy + 9, { c: 0xd86a3a, c2: 0xf2e6cc, pat: "stripe", thick: true, tail: ox + 3 });
  else if (concept === "christmas") seasonScarf(g, ox + 2, ox + 14, oy + 9, { c: 0xd23a44, c2: 0x2e8a4e, pat: "stripe", thick: true, tail: ox + 3 });
  // 머리: 기본 = 밀짚모자, 겨울 = 귀달이 털모자, 크리스마스 = 산타 모자
  if (concept === "christmas") {
    seasonHat(g, ox + 8, oy + 7, 6, oy + 1, { kind: "santa" });
    seasonHolly(g, ox + 11, oy + 12);
  } else if (concept === "winter") {
    seasonHat(g, ox + 8, oy + 7, 6, oy + 1, { kind: "trapper", c: 0x8a5a3a, c2: 0xf2e6cc });
  } else {
    const straw = 0xe8c87a;
    const strawLo = 0xc8a45a;
    // 챙 (넓게, 오른쪽 끝은 그늘)
    g.hline(ox - 1, ox + 17, oy + 3, straw);
    g.hline(ox, ox + 16, oy + 4, strawLo);
    g.set(ox + 17, oy + 3, strawLo);
    // 위 (둥근 정수리) + 빨간 띠
    g.rect(ox + 4, oy - 1, 9, 4, straw);
    g.hline(ox + 5, ox + 11, oy - 2, straw);
    g.hline(ox + 4, ox + 12, oy + 2, 0xc8463c);
    g.recolor((x, y) => y >= oy - 2 && y <= oy + 1 && x >= ox + 10 && g.filled(x, y), strawLo);
    // 짚 결
    for (let x = ox; x <= ox + 16; x += 3) g.set(x, oy + 3, lighten(straw, 0.15));
    g.set(ox + 6, oy - 1, lighten(straw, 0.2));
  }
  // 뜰채 (오른손: 긴 자루가 위로, 둥근 그물 테)
  const fx = ox + 16;
  const fy = oy + 12 + (frame ? 1 : 0);
  if (concept !== "default") seasonMitt(g, fx - 2, fy - 1, concept === "winter" ? 0xd86a3a : 0x2e8a4e);
  else {
    g.set(fx - 2, fy - 1, body);
    g.set(fx - 2, fy, darken(body, 0.18));
  }
  for (let k = 0; k < 9; k++) g.set(fx - 1 + (k >= 5 ? 1 : 0), fy + 2 - k, 0x8a6a42);
  const nx = fx + 1;
  const ny = fy - 9;
  for (const [dx, dy] of [[-2, 0], [-2, -1], [-1, -2], [0, -2], [1, -2], [2, -1], [2, 0], [1, 1], [0, 1], [-1, 1]] as const) g.set(nx + dx, ny + dy, 0x5a6470);
  g.set(nx - 1, ny, 0xc8d0d8);
  g.set(nx + 1, ny - 1, 0xc8d0d8);
  g.set(nx, ny - 1, 0xa8b4be);
  g.outline(OUT);
  if (concept === "winter") seasonSnow(g, ox + 4, ox + 12, oy);
  return g.toCanvas();
}

/** 부스 그림 크기 (발 = 맨 아래 가운데) */
const BOOTH_W = 52;
const BOOTH_H = 48;

/**
 * 미끼·대여 부스: 푸른 함석 외지붕 아래 통나무 벽 작은 매점, 판매 창(안에 미끼 통·찌 상자, 밤엔 불빛), 창 위 크림색 간판 판(물고기 그림),
 * 오른쪽에 대여 낚싯대 걸이(세 대 + 찌), 앞에 미끼 통·아이스박스. 52×48, 받침 = 맨 아래 가운데.
 * 「미끼·대여」 글자는 장면이 그린다 (Foraging — 한글은 비트맵 글꼴로)
 */
function traderBooth(concept: MapConcept = "default", lit = false): HTMLCanvasElement {
  const W = BOOTH_W;
  const H = BOOTH_H;
  const g = new Grid(W, H);
  const base = H - 3;
  const roof = [0x6a86a6, 0x4e6a8a, 0x3e5a7a, 0x2c425c] as const;
  const log = { hi: 0xb07c4c, mid: 0x8e5e36, lo: 0x6c4426, ring: 0xd8b07a } as const;
  // ── 통나무 벽 (가로 통나무 다섯 단 — 단마다 윗줄 밝게, 오른쪽 끝 그늘)
  const wx0 = 5;
  const wx1 = 38;
  const wy0 = 17;
  for (let y = wy0; y <= base - 4; y++)
    for (let x = wx0; x <= wx1; x++) {
      const row = (y - wy0) % 4;
      let c: Color = row === 0 ? log.hi : row === 3 ? log.lo : log.mid;
      if (x >= wx1 - 2) c = darken(c, 0.14);
      g.set(x, y, c);
    }
  // 통나무 끝 단면 (왼쪽 모서리)
  for (let y = wy0 + 1; y <= base - 5; y += 4) {
    g.set(wx0 - 1, y, log.ring);
    g.set(wx0 - 1, y + 1, darken(log.ring, 0.15));
  }
  // 받침돌 (벽 아래)
  g.hline(wx0, wx1, base - 3, 0x6a6e74);
  g.hline(wx0, wx1, base - 2, 0x56595e);
  // ── 판매 창 (어두운 틀 + 안쪽 불빛 + 미끼 통·찌 상자)
  const winC = lit ? 0xffd98a : 0xe8c47a;
  g.rect(9, 22, 26, 10, 0x3a2a1e);
  g.rect(10, 23, 24, 8, winC);
  g.hline(10, 33, 23, lit ? 0xfff0c0 : 0xf2d898);
  g.rect(13, 26, 4, 5, 0x4f9a88); // 미끼 통 (청록)
  g.hline(13, 16, 26, 0x6fbaa8);
  g.rect(20, 28, 7, 3, 0xd84a3a); // 찌 상자 (빨강)
  g.hline(20, 26, 28, 0xf07a6a);
  for (const x of [21, 23, 25]) g.set(x, 27, x === 23 ? 0xf0c040 : 0xfaf2de); // 꽂힌 찌
  g.rect(29, 25, 3, 6, 0x8a9096); // 대여 장부
  g.hline(29, 31, 25, 0xc8ccd2);
  // 판매대 (창 아래 널빤지)
  g.rect(7, 32, 30, 2, 0xc89a62);
  g.hline(7, 36, 32, 0xe0b880);
  g.set(9, 34, 0x8a6a42);
  g.set(34, 34, 0x8a6a42);
  // ── 창 위 간판 판 (크림 판 + 작은 파란 물고기)
  g.rect(13, 18, 18, 4, 0xf2e6c8);
  g.hline(13, 30, 18, 0xfaf2de);
  g.hline(13, 30, 21, 0xc8b490);
  g.ellipse(21.5, 19.8, 3, 1.1, 0x3a7ab0);
  g.set(18, 19, 0x3a7ab0);
  g.set(18, 20, 0x3a7ab0);
  g.set(23, 19, 0xfaf2de);
  // ── 외지붕 (오른쪽이 높은 함석 — 골 무늬, 처마가 벽 앞으로 나와요)
  for (let y = 5; y <= 16; y++) {
    const x0 = 2 + Math.max(0, Math.round((16 - y) * 0.15));
    const x1 = 41 - Math.max(0, Math.round((y - 5) * 0.1));
    const lean = Math.round((16 - y) * 0.55); // 왼쪽이 낮게
    for (let x = x0 + (y < 10 ? lean - 3 : 0); x <= x1; x++) {
      if (x < 0) continue;
      const k = y <= 6 ? 0 : y >= 15 ? 3 : (x + 40) % 4 === 0 ? 3 : y < 10 ? 1 : 2;
      g.set(x, y, roof[k]);
    }
  }
  g.hline(2, 41, 16, darken(roof[3], 0.1));
  // ── 대여 낚싯대 걸이 (오른쪽 — 판자 받침에 세 대를 세워 두고 위로 끝·찌가 삐죽. 가는 대끼리 붙으면 외곽선에 묻혀 판자 위에 그려요)
  const rx = 40;
  g.rect(rx, 18, 10, base - 18 + 1, log.lo);
  g.vline(rx, 18, base, darken(log.lo, 0.15));
  g.hline(rx, rx + 9, 18, log.mid);
  g.hline(rx, rx + 9, base - 7, log.mid);
  g.hline(rx, rx + 9, base - 6, log.hi);
  const rods: [number, Color, number][] = [
    [rx + 2, 0xe0503c, 10],
    [rx + 5, 0xf0c040, 14],
    [rx + 8, 0x4f9a88, 10],
  ];
  for (const [x, c, tip] of rods) {
    for (let y = 19; y <= base - 8; y++) g.set(x, y, (y + x) % 5 === 0 ? 0x8a6a42 : 0xc8a060);
    // 판자 위로 삐죽 나온 끝 + 찌
    for (let y = tip + 2; y <= 17; y++) g.set(x, y, 0xc8a060);
    g.set(x, tip + 1, 0xfaf2de);
    g.set(x, tip, c);
  }
  // ── 앞: 미끼 통 둘 (파랑·회색 양동이) + 아이스박스
  g.rect(8, base - 6, 6, 6, 0x4a7ab0);
  g.hline(8, 13, base - 6, 0x7aa6d0);
  g.hline(9, 12, base - 7, 0x3a3e44);
  g.rect(15, base - 5, 5, 5, 0x8a9096);
  g.hline(15, 19, base - 5, 0xb4bac0);
  g.set(17, base - 6, 0x6a5a48); // 지렁이 통 손잡이
  g.rect(30, base - 6, 9, 6, 0xf4f6f8);
  g.rect(30, base - 7, 9, 2, 0x3a8ac8);
  g.hline(30, 38, base - 7, 0x6ab0e0);
  g.vline(38, base - 5, base - 1, 0xd0d8de);
  // ── 시즌
  if (concept === "christmas") {
    for (let x = 4; x <= 40; x += 3) g.set(x, 17, [0xe0303c, 0xf2c444, 0x2e8a4e, 0x6ab8f0][(x >> 1) % 4]);
    seasonHolly(g, 22, 17);
  }
  g.outline(OUT);
  stallShadow(g, W / 2 - 2, base + 1, W / 2 - 3, 2.2, 60);
  const c = g.toCanvas();
  if (concept !== "winter") return c;
  // 겨울: 지붕을 눈으로 덮고 처마 밑 고드름 (집·캠핑장 지붕과 같은 붓 — sprites/winterArt snowRoof)
  const roofSet = new Set<number>(roof);
  return snowRoof(c, (_x, y, col) => y <= 16 && roofSet.has(col), { seed: 191 });
}

function stallShadow(g: Grid, cx: number, cy: number, rx: number, ry: number, a = 64): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && !g.filled(x, y)) g.set(x, y, 0x3e4060, Math.min(150, Math.round(a * (1 - (dx * dx + dy * dy) * 0.5))));
    }
}

/** 좌판 그림 크기 (발 = 맨 아래 가운데). 파라솔 등은 그림 (36, 15) — 밤 불빛 자리는 game/sea/seaLayout SEA_BUYER_LAMP */
const STALL_W = 44;
const STALL_H = 46;
const STALL_LAMP = { x: 36, y: 15 } as const;

/**
 * 포구 좌판: 민트·흰 줄무늬 비치 파라솔 아래 나무 궤짝 판, 위에 빨간 고무 다라이 둘(물 담은 생선 · 조개·소라), 약초 한 단·광석 한 알,
 * 앞에 기대 놓은 손글씨 골판지(빨간 동그라미), 옆에 흰 스티로폼 생선 상자, 파라솔 살에 매단 작은 등. 44×46, 받침 = 맨 아래 가운데
 */
function haenyeoStall(concept: MapConcept = "default", lit = false): HTMLCanvasElement {
  const W = STALL_W;
  const H = STALL_H;
  const g = new Grid(W, H);
  const base = H - 3; // 땅에 닿는 줄
  // ── 파라솔 기둥 (궤짝 뒤 가운데)
  const poleX = 21;
  for (let y = 9; y <= base - 12; y++) {
    g.set(poleX, y, RAMP.wall[2]);
    g.set(poleX + 1, y, RAMP.wall[3]);
  }
  // ── 궤짝 판 (나무 사과 궤짝 둘을 붙인 판 + 위에 널빤지)
  const tx0 = 4;
  const tx1 = 35;
  const top = base - 13;
  for (let y = top + 3; y <= base; y++)
    for (let x = tx0; x <= tx1; x++) {
      const crate = x <= 19 ? 0 : 1;
      const lx = x - (crate ? 20 : tx0);
      const slat = (y - (top + 3)) % 4 === 3;
      let c = slat ? RAMP.wood[4] : (lx + crate) % 7 === 0 ? RAMP.wood[3] : RAMP.wood[2];
      if (x === 19 || x === 20) c = RAMP.wood[4];
      if (y === base) c = darken(RAMP.wood[4], 0.12);
      g.set(x, y, c);
    }
  // 궤짝 옆구리 손잡이 구멍
  g.hline(9, 13, top + 5, darken(RAMP.wood[4], 0.25));
  g.hline(25, 29, top + 5, darken(RAMP.wood[4], 0.25));
  // 널빤지 윗면
  g.rect(tx0 - 1, top, tx1 - tx0 + 3, 3, RAMP.wood[1]);
  g.hline(tx0 - 1, tx1 + 1, top, RAMP.wood[0]);
  g.hline(tx0 - 1, tx1 + 1, top + 2, RAMP.wood[3]);
  // ── 다라이 1 (생선 — 물빛)
  // 빨간 고무 다라이 (판 위에 앉은 옆모습: 뒤 테 · 담긴 것 · 앞 테 · 몸통)
  const basin = (cx: number, inner: (y0: number) => void) => {
    const red = 0xe2665a;
    g.hline(cx - 4, cx + 4, top - 6, 0xc04c44); // 뒤 테
    g.hline(cx - 5, cx + 5, top - 5, red);
    inner(top - 5);
    g.hline(cx - 5, cx + 5, top - 4, 0xf4887a); // 앞 테 (밝게)
    g.hline(cx - 4, cx + 4, top - 3, red);
    g.hline(cx - 4, cx + 4, top - 2, red);
    g.hline(cx - 3, cx + 3, top - 1, darken(red, 0.1));
    g.set(cx + 4, top - 3, darken(red, 0.14));
    g.set(cx + 4, top - 2, darken(red, 0.14));
    g.set(cx - 4, top - 3, lighten(red, 0.12));
  };
  basin(11, (y0) => {
    // 물 + 생선 둘 (꼬리가 위로 삐죽)
    g.hline(8, 14, y0, 0x8fd2dc);
    g.hline(8, 11, y0, 0x9ab4c8);
    g.set(8, y0, 0x1a1e28);
    g.set(12, y0 - 1, 0x7a94aa);
    g.set(12, y0 - 2, 0x7a94aa);
    g.set(13, y0 - 2, 0x9ab4c8);
    g.set(14, y0 - 1, 0xd8a24a);
    g.set(15, y0 - 2, 0xb07a30);
  });
  basin(29, (y0) => {
    // 조개·소라 소복이 + 불가사리
    for (const [x, c] of [[25, 0xf2e2c8], [26, 0xd8c0a0], [27, 0xf6eadb], [28, 0xe8cfa8], [29, 0xb59ad0], [30, 0xf2e2c8], [31, 0xdcc09a], [32, 0xf6eadb], [33, 0xe8cfa8]] as const) g.set(x, y0, c);
    for (const [x, c] of [[26, 0xf6eadb], [28, 0xf2e2c8], [31, 0xe8d4b4]] as const) g.set(x, y0 - 1, c);
    g.set(30, y0 - 2, 0xf09a62);
    g.set(29, y0 - 1, 0xf09a62);
    g.set(30, y0 - 1, 0xe08a52);
    g.set(31, y0 - 1, 0xf09a62);
  });
  // 가운데: 약초 한 단 + 보랏빛 광석
  g.vline(18, top - 5, top - 1, 0x5a9a48);
  g.vline(19, top - 4, top - 1, 0x4a8a3e);
  g.set(17, top - 5, 0x88c477);
  g.set(19, top - 6, 0x88c477);
  g.set(18, top - 6, 0xf0e070);
  g.hline(17, 19, top - 2, 0xd8b070); // 묶은 끈
  g.rect(22, top - 3, 2, 2, 0x9a7ad0);
  g.set(22, top - 3, 0xd8c8f4);
  g.set(23, top - 2, 0x7458ac);
  // ── 앞에 기댄 골판지 팻말 (빨간 동그라미)
  const sx = 14;
  const sy = top + 3;
  g.rect(sx, sy, 10, 7, 0xd8b88a);
  g.hline(sx, sx + 9, sy, 0xe8cca0);
  g.vline(sx + 9, sy, sy + 6, 0xbe9c70);
  g.ellipse(sx + 3, sy + 3.5, 2, 2, 0xd84a3a);
  g.set(sx + 3, sy + 3, 0xd8b88a);
  g.set(sx + 3, sy + 4, 0xd8b88a);
  g.hline(sx + 6, sx + 7, sy + 2, 0x6a4a3a);
  g.hline(sx + 6, sx + 7, sy + 4, 0x6a4a3a);
  // ── 스티로폼 생선 상자 (궤짝 오른쪽 옆, 파란 뚜껑)
  const bx = 36;
  g.rect(bx, base - 7, 7, 8, 0xf6f8f8);
  g.vline(bx + 6, base - 7, base, 0xd8e0e4);
  g.hline(bx, bx + 6, base, 0xc8d2d8);
  g.rect(bx - 1, base - 9, 8, 2, 0x5aa6c8);
  g.hline(bx - 1, bx + 6, base - 9, 0x86c4dc);
  // ── 왼쪽 앞에 내려놓은 여벌 테왁 + 망사리
  {
    const fx = 4;
    const fy = base - 3;
    for (let y = 0; y < 4; y++) for (let x = -3 + (y > 1 ? 1 : 0); x <= 3 - (y > 2 ? 1 : 0); x++) if ((x + y) % 2 === 0) g.set(fx + 2 + x, fy + y, 0x3f7a64);
    g.ellipse(fx, fy, 3.2, 3, 0xf08a3c);
    g.recolor((x, y) => Math.hypot(x + 0.5 - fx, y + 0.5 - fy) <= 3.3 && x + y >= fx + fy + 1, 0xd2702e);
    g.set(fx - 1, fy - 2, 0xffd4a0);
    g.set(fx - 2, fy - 1, 0xffb070);
    g.hline(fx - 3, fx + 3, fy, 0xe07a34);
  }
  // ── 파라솔 갓 (민트·흰 여덟 쪽, 가장자리 물결)
  const cx = poleX + 0.5;
  const cy = 12;
  const rx = 20;
  for (let y = 1; y <= cy + 2; y++)
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / 11;
      if (dy > 0.22) continue;
      if (dx * dx + dy * dy > 1) continue;
      const slice = Math.floor(((x + 0.5 - cx) / rx) * 4 + 4);
      const mint = slice % 2 === 0;
      const lightV = 0.15 + Math.max(0, (x - cx) / rx) * 0.35 + Math.max(0, (y - 4) / 10) * 0.25;
      const ramp = mint ? RAMP.roofM : RAMP.wall;
      g.set(x, y, ramp[Math.min(ramp.length - 1, Math.round(lightV * (ramp.length - 1)))]);
    }
  // 갓 아래 물결 자락
  for (let x = Math.ceil(cx - rx + 1); x < cx + rx - 1; x++) {
    const slice = Math.floor(((x + 0.5 - cx) / rx) * 4 + 4);
    const c = slice % 2 === 0 ? RAMP.roofM[3] : RAMP.wall[3];
    if ((x + 1) % 5 !== 0) g.set(x, cy + 3, c);
  }
  // 꼭지
  g.set(poleX, 0, RAMP.wall[1]);
  g.set(poleX + 1, 0, RAMP.wall[2]);
  // ── 작은 등 (파라솔 오른쪽 살 끝에 매단)
  const lx = STALL_LAMP.x;
  const ly = STALL_LAMP.y;
  g.set(lx, ly - 1, 0x5a5560);
  g.rect(lx - 1, ly, 3, 4, lit ? 0xffe08a : 0xf6d27a);
  g.set(lx, ly + 1, lit ? 0xfff8d8 : 0xfff0b8);
  g.hline(lx - 1, lx + 1, ly + 4, 0x6a5a50);
  if (concept === "winter") {
    // 갓 위 소복한 눈 (위 두세 줄을 덮고 아래 끝은 푸른 그늘, 군데군데 흘러내림) · 상자 뚜껑·판 위 눈
    for (let x = 2; x <= 41; x++) {
      let y0 = -1;
      for (let y = 0; y <= 12; y++) if (g.filled(x, y)) { y0 = y; break; }
      if (y0 < 0 || y0 > 9) continue;
      const depth = 2 + ((x * 7) % 5 === 0 ? 1 : 0) + (x > 8 && x < 34 && (x * 3) % 7 === 0 ? 1 : 0);
      for (let k = 0; k < depth; k++) g.set(x, y0 + k, k === 0 && x > 26 ? 0xeef1f6 : 0xf8f6f0);
      g.set(x, y0 + depth, 0xd6e0ee);
    }
    g.set(poleX, 0, 0xf8f6f0);
    g.set(poleX + 1, 0, 0xeef1f6);
    seasonSnow(g, bx - 1, bx + 6, base - 10);
    seasonSnow(g, tx0, tx0 + 5, top - 1);
  } else if (concept === "christmas") {
    // 갓 가장자리 꼬마전구 줄 + 기둥에 리본
    for (let x = Math.ceil(cx - rx + 2); x < cx + rx - 2; x += 3) g.set(x, cy + 4, [0xe0303c, 0xf2c444, 0x2e8a4e, 0x6ab8f0][(x >> 1) % 4]);
    seasonHolly(g, 6, top - 3);
  }
  toneOutline(g);
  stallShadow(g, W / 2 - 1, base + 1, W / 2 - 3, 2.2, 60);
  return g.toCanvas();
}

export const NODE_KINDS = ["herb", "ore", "dig", "bug", "clam"] as const;
/** 11/26 지점 그림 갈래까지 (nodeArtOf) */
const NODE_ARTS = [...NODE_KINDS, "seaweed", "pool-herb", "pool-bug", "pool-ore", "dunegrass", "pebbles"] as const;

export function ensureForageTextures(scene: Phaser.Scene, night: boolean): void {
  const tx = scene.textures;
  if (!tx.exists(FTEX.bobber)) {
    for (const c of MAP_CONCEPTS)
      for (let f = 0; f < 2; f++) {
        tx.addCanvas(FTEX.npc("fishmonger", f, c), fishmonger(f, c));
        tx.addCanvas(FTEX.npc("collector", f, c), collector(f, c));
        tx.addCanvas(FTEX.npc("haenyeo", f, c), haenyeo(f, c));
        tx.addCanvas(FTEX.npc("trader", f, c), trader(f, c));
      }
    for (const c of MAP_CONCEPTS) for (const lit of [false, true]) tx.addCanvas(FTEX.seaStall(c, lit), haenyeoStall(c, lit));
    for (const c of MAP_CONCEPTS) for (const lit of [false, true]) tx.addCanvas(FTEX.campStall(c, lit), traderBooth(c, lit));
    tx.addCanvas(FTEX.stall("fishmonger"), fishStall());
    tx.addCanvas(FTEX.stall("collector"), collectorMat());
    tx.addCanvas(FTEX.bobber, bobber());
    tx.addCanvas(FTEX.bang, bang());
  }
  // 곤충 수풀은 낮/밤 그림이 다르다 → 밤 그림은 다른 키 (지우지 않는다: 텍스처는 장면끼리 같이 쓰여 마을·캠핑장·바닷가 그림이 서로 가리킨다)
  for (const k of NODE_ARTS)
    for (let f = 0; f < 2; f++) {
      const key = FTEX.node(k, f, night);
      if (!tx.exists(key)) tx.addCanvas(key, nodeArt(k, f, night));
    }
}

const portraits = new Map<string, string>();
/** NPC 얼굴 그림 dataURL (판매 창, 2배). 브라우저에서만 */
export function npcPortraitUrl(id: "fishmonger" | "collector" | "haenyeo" | "trader", scale = 2, concept: MapConcept = "default"): string {
  const key = `${id}|${scale}|${concept}`;
  const hit = portraits.get(key);
  if (hit) return hit;
  const src = id === "fishmonger" ? fishmonger(0, concept) : id === "haenyeo" ? haenyeo(0, concept) : id === "trader" ? trader(0, concept) : collector(0, concept);
  const out = document.createElement("canvas");
  out.width = src.width * scale;
  out.height = src.height * scale;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, out.width, out.height);
  const url = out.toDataURL("image/png");
  portraits.set(key, url);
  return url;
}

/** 아이템 아이콘을 장면 텍스처로 (잡았을 때 머리 위에 띄운다) */
export function ensureIconTexture(scene: Phaser.Scene, id: string): string | null {
  const key = FTEX.icon(id);
  if (scene.textures.exists(key)) return key;
  const c = forageIconCanvas(id);
  if (!c) return null;
  scene.textures.addCanvas(key, c);
  return key;
}
