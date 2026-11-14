import { isZoneId, type ZoneId } from "@/lib/rpg/catalog";

// 40번 사냥터 지도 (순수 함수: Phaser·캔버스 없이 테스트한다).
// 사냥터마다 소품(그림+충돌)·바닥 무늬·지형 구역(컨베이어·늪·덩굴·웅덩이·문·엘리베이터)·조명·출현 지점을 정한다.
// 충돌은 원과 사각형, 몬스터 길찾기는 8px 칸 흐름장(BFS). 시드로 몇 가지 배치 중 하나를 고른다 (모든 배치를 테스트가 확인).

export const AW = 448;
export const AH = 288;
/** HuntScene 경계 (WALL)와 같다 */
export const SIDE = 10;
/** 위 벽 그림 높이. 발은 TOP_SOLID + 반지름 아래까지만 간다 */
export const TOP = 30;
export const TOP_SOLID = 24;
export const CELL = 8;
export const COLS = AW / CELL;
export const ROWS = AH / CELL;

export type Pt = { x: number; y: number };
export type Solid = { t: "r"; x: number; y: number; w: number; h: number } | { t: "c"; x: number; y: number; r: number };

/** 그림이 있는 소품. (x,y)는 바닥 가운데 (깊이 정렬 기준) */
export type Prop = { kind: string; x: number; y: number; flip?: boolean; v?: number };
/** 바닥에 납작하게 그리는 무늬 (깔개·줄·얼룩) */
export type Decal = { kind: string; x: number; y: number; w: number; h: number; v?: number };

export type RegionKind = "conveyor" | "mud" | "vine" | "puddle" | "door" | "pad" | "stage" | "shredder";
export type Region = {
  kind: RegionKind;
  /** 사각형 (x,y,w,h) 또는 타원 (ellipse: 가운데 x+w/2, y+h/2) */
  x: number;
  y: number;
  w: number;
  h: number;
  ellipse?: boolean;
  /** 컨베이어 방향(±1)·문이 미는 방향(+1 아래) */
  dir?: number;
  /** 같은 기믹 안에서의 순번 (엘리베이터 짝, 늪이 끓는 차례) */
  id?: number;
};

/** emergency: 소등(정전) 중에도 켜져 있는 비상등 (어둠 위에 그린다) */
export type Light = { x: number; y: number; r: number; color: number; flicker?: boolean; emergency?: boolean };

export type ArenaLayout = {
  zone: ZoneId;
  variant: number;
  props: Prop[];
  solids: Solid[];
  decals: Decal[];
  regions: Region[];
  lights: Light[];
  spawns: Pt[];
  start: Pt;
};

// ── 소품 크기·충돌 (그림은 arena/art.ts가 같은 kind로 그린다) ──

type PropMeta = { w: number; h: number; solid?: { t: "r"; dx: number; dy: number; w: number; h: number } | { t: "c"; dx: number; dy: number; r: number } };

const R = (dx: number, dy: number, w: number, h: number) => ({ t: "r" as const, dx, dy, w, h });
const C = (dx: number, dy: number, r: number) => ({ t: "c" as const, dx, dy, r });

export const PROP_META: Record<string, PropMeta> = {
  plant: { w: 16, h: 24, solid: C(0, -4, 6) },
  palm: { w: 30, h: 40, solid: C(0, -5, 8) },
  cooler: { w: 14, h: 26, solid: R(-7, -10, 14, 10) },
  conf_table: { w: 100, h: 40, solid: R(-48, -26, 96, 24) },
  chair: { w: 12, h: 14 },
  coffee_cart: { w: 24, h: 26, solid: R(-11, -12, 22, 12) },
  bench_seat: { w: 16, h: 18 },
  pole: { w: 6, h: 40, solid: C(0, -2, 3) },
  dumbbell_rack: { w: 22, h: 60, solid: R(-11, -56, 22, 56) },
  weight_bench: { w: 44, h: 22, solid: R(-20, -12, 40, 12) },
  treadmill_head: { w: 14, h: 26 },
  cubicle: { w: 68, h: 42, solid: R(-32, -24, 64, 24) },
  copier: { w: 26, h: 30, solid: R(-12, -14, 24, 14) },
  bookshelf: { w: 100, h: 46, solid: R(-50, -14, 100, 14) },
  read_table: { w: 60, h: 30, solid: R(-28, -18, 56, 18) },
  book_cart: { w: 22, h: 22, solid: R(-10, -10, 20, 10) },
  gondola: { w: 84, h: 40, solid: R(-40, -18, 80, 18) },
  cart: { w: 20, h: 18 },
  dead_tree: { w: 30, h: 44, solid: C(0, -4, 7) },
  paper_stack: { w: 18, h: 20, solid: C(0, -4, 6) },
  reeds: { w: 18, h: 18 },
  cactus: { w: 18, h: 30, solid: C(0, -4, 5) },
  desert_rock: { w: 26, h: 18, solid: C(0, -5, 8) },
  buried_desk: { w: 34, h: 20, solid: R(-15, -10, 30, 10) },
  pub_table: { w: 48, h: 30, solid: R(-22, -16, 44, 16) },
  stool: { w: 10, h: 10 },
  crates: { w: 26, h: 34, solid: R(-12, -24, 24, 24) },
  stall: { w: 60, h: 46, solid: R(-28, -18, 56, 18) },
  lantern_post: { w: 10, h: 46, solid: C(0, -2, 4) },
  light_tree: { w: 28, h: 42, solid: C(0, -5, 8) },
  park_bench: { w: 30, h: 14 },
  // 11/15 분기 마감 전날 밤·구조조정 발표 날
  night_desk: { w: 72, h: 40, solid: R(-34, -22, 68, 20) },
  file_cabinet: { w: 18, h: 30, solid: R(-8, -12, 16, 12) },
  empty_desk: { w: 44, h: 30, solid: R(-20, -14, 40, 12) },
  box_stack: { w: 22, h: 26, solid: R(-10, -10, 20, 10) },
};

// ── 만들기 도구 ──

class Builder {
  props: Prop[] = [];
  solids: Solid[] = [];
  decals: Decal[] = [];
  regions: Region[] = [];
  lights: Light[] = [];
  spawns: Pt[] = [];
  start: Pt = { x: AW / 2, y: 150 };

  prop(kind: string, x: number, y: number, extra: Partial<Prop> = {}): this {
    const meta = PROP_META[kind];
    if (!meta) throw new Error(`unknown prop ${kind}`);
    this.props.push({ kind, x, y, ...extra });
    const s = meta.solid;
    if (s?.t === "r") this.solids.push({ t: "r", x: x + s.dx, y: y + s.dy, w: s.w, h: s.h });
    else if (s?.t === "c") this.solids.push({ t: "c", x: x + s.dx, y: y + s.dy, r: s.r });
    return this;
  }
  /** 그림 없이 막기 (벽에 붙은 의자 줄 등은 바닥 그림으로) */
  block(x: number, y: number, w: number, h: number): this {
    this.solids.push({ t: "r", x, y, w, h });
    return this;
  }
  decal(kind: string, x: number, y: number, w: number, h: number, v?: number): this {
    this.decals.push({ kind, x, y, w, h, ...(v !== undefined ? { v } : {}) });
    return this;
  }
  region(r: Region): this {
    this.regions.push(r);
    return this;
  }
  light(x: number, y: number, r: number, color: number, flicker = false): this {
    this.lights.push({ x, y, r, color, ...(flicker ? { flicker } : {}) });
    return this;
  }
  /** 소등 중에도 켜져 있는 비상등 */
  emergency(x: number, y: number, r: number, color: number): this {
    this.lights.push({ x, y, r, color, emergency: true });
    return this;
  }
  spawn(...pts: [number, number][]): this {
    for (const [x, y] of pts) this.spawns.push({ x, y });
    return this;
  }
}

/** 가장자리 출현 지점 (모든 사냥터 공통 바탕) */
const EDGE_SPAWNS: [number, number][] = [
  [36, 62],
  [AW - 36, 62],
  [36, AH - 30],
  [AW - 36, AH - 30],
  [AW / 2, AH - 24],
];

type Make = (b: Builder, v: number) => void;

const MAKE: Record<ZoneId, { variants: number; make: Make }> = {
  // 월요일 회의실: 회의 탁자 셋, 구석 화분, 커피 카트. 기믹은 움직이는 발표 조명 (HP 회복)
  "meeting-room": {
    variants: 2,
    make(b, v) {
      const tables: [number, number][] = v === 0 ? [[112, 116], [336, 116], [224, 232]] : [[112, 232], [336, 232], [224, 112]];
      if (v === 1) b.start = { x: AW / 2, y: 170 };
      for (const [x, y] of tables) {
        b.decal("rug", x - 60, y - 44, 120, 62);
        b.prop("conf_table", x, y);
        for (let i = -1; i <= 1; i++) {
          b.prop("chair", x + i * 30, y - 30);
          b.prop("chair", x + i * 30, y + 10, { flip: true });
        }
      }
      b.prop("plant", 18, TOP_SOLID + 10).prop("plant", AW - 18, TOP_SOLID + 10).prop("plant", 18, AH - 10).prop("plant", AW - 18, AH - 10);
      b.prop("coffee_cart", AW - 34, 170).prop("cooler", 26, 170);
      b.light(224, 40, 46, 0xfff0c0).light(96, 40, 26, 0xfff0c0).light(352, 40, 26, 0xfff0c0);
      b.spawn(...EDGE_SPAWNS, [224, 40], [24, 120], [AW - 24, 120]);
    },
  },

  // 출근길 지하철: 위 벽 창문·문 두 개, 벽에 붙은 긴 의자, 손잡이 기둥. 문이 열리면 문 앞을 밀어낸다
  subway: {
    variants: 2,
    make(b, v) {
      const doors = [112, 336];
      // 위쪽 의자 줄 (문 자리만 비움) — 벽에 붙어 있어 뒤로 숨을 틈이 없다
      b.block(SIDE, TOP_SOLID, 76, 18).block(130, TOP_SOLID, 188, 18).block(354, TOP_SOLID, AW - 354 - SIDE, 18);
      b.decal("seat_row", SIDE, TOP_SOLID - 4, 76, 22).decal("seat_row", 130, TOP_SOLID - 4, 188, 22).decal("seat_row", 354, TOP_SOLID - 4, AW - 354 - SIDE, 22);
      // 아래쪽 의자 줄 (가운데 통로)
      b.block(SIDE, AH - 26, 190, 26).block(250, AH - 26, AW - 250 - SIDE, 26);
      b.decal("seat_row_b", SIDE, AH - 30, 190, 30).decal("seat_row_b", 250, AH - 30, AW - 250 - SIDE, 30);
      doors.forEach((x, i) => {
        b.region({ kind: "door", x: x - 18, y: TOP_SOLID, w: 36, h: 70, dir: 1, id: i });
        b.decal("door_mat", x - 18, TOP_SOLID + 2, 36, 26);
      });
      b.decal("door_mat", 202, AH - 28, 46, 18);
      const poles: [number, number][] = v === 0 ? [[170, 110], [278, 110], [170, 196], [278, 196], [64, 150], [384, 150]] : [[112, 150], [224, 104], [336, 150], [224, 206], [60, 104], [388, 206]];
      for (const [x, y] of poles) b.prop("pole", x, y);
      b.decal("aisle_line", SIDE, 72, AW - SIDE * 2, 2).decal("aisle_line", SIDE, AH - 46, AW - SIDE * 2, 2);
      for (let x = 40; x < AW; x += 60) b.light(x, 10, 22, 0xe8f6ff);
      b.spawn([112, 52], [336, 52], [26, 150], [AW - 26, 150], [224, 262], [26, 100], [AW - 26, 200]);
    },
  },

  // 새해 다짐 헬스장: 러닝머신 벨트 셋 (방향이 바뀐다), 아령 거치대, 벤치
  gym: {
    variants: 2,
    make(b, v) {
      b.decal("mat_area", 34, 120, 70, 64).decal("mat_area", AW - 104, 120, 70, 64);
      const belts: [number, number, number, number][] =
        v === 0
          ? [[60, 82, 132, 1], [AW - 192, 82, 132, -1], [140, 218, 168, 1]]
          : [[60, 218, 132, -1], [AW - 192, 218, 132, 1], [140, 82, 168, -1]];
      belts.forEach(([x, y, w, dir], i) => {
        b.region({ kind: "conveyor", x, y, w, h: 18, dir, id: i });
        b.prop("treadmill_head", dir > 0 ? x + w + 6 : x - 6, y + 18, { flip: dir < 0 });
      });
      b.prop("dumbbell_rack", SIDE + 11, 186).prop("dumbbell_rack", AW - SIDE - 11, 186);
      b.prop("weight_bench", 120, 158).prop("weight_bench", 328, 158, { flip: true });
      b.prop("cooler", 224, TOP_SOLID + 10).prop("plant", 18, AH - 10).prop("plant", AW - 18, AH - 10);
      b.light(80, 30, 30, 0xfff8e8).light(224, 30, 30, 0xfff8e8).light(368, 30, 30, 0xfff8e8);
      b.spawn(...EDGE_SPAWNS, [26, 104], [AW - 26, 104]);
    },
  },

  // 야근 사무실: 칸막이 책상 미로 (4×3 격자, 가운데 줄 가운데는 비움) + 양쪽 끝 엘리베이터 (순간 이동)
  "legacy-forest": {
    variants: 3,
    make(b, v) {
      b.start = { x: AW / 2, y: 150 };
      const cols = [70, 172, 276, 378];
      const rows = [92, 162, 232];
      // 배치마다 몇 칸을 비운다 (비운 칸엔 화분·복사기)
      const skip = [new Set(["1,1", "2,1"]), new Set(["1,1", "2,1", "0,0", "3,2"]), new Set(["1,1", "2,1", "3,0", "0,2"])][v];
      rows.forEach((y, r) =>
        cols.forEach((x, c) => {
          if (skip.has(`${c},${r}`)) {
            if (r !== 1) b.prop(c % 2 ? "copier" : "plant", x, y - 6);
            return;
          }
          b.prop("cubicle", x, y, { v: (c + r) % 3 });
          b.light(x - 16, y - 20, 16, 0x7ab8f0, true).light(x + 16, y - 20, 16, 0x7ab8f0, true);
        }),
      );
      b.region({ kind: "pad", x: 26, y: TOP_SOLID, w: 30, h: 18, id: 0 });
      b.region({ kind: "pad", x: AW - 56, y: TOP_SOLID, w: 30, h: 18, id: 1 });
      b.decal("carpet_path", SIDE, 112, AW - SIDE * 2, 26).decal("carpet_path", SIDE, 182, AW - SIDE * 2, 26);
      b.light(41, 20, 24, 0xfff0b0).light(AW - 41, 20, 24, 0xfff0b0).light(224, 150, 40, 0xfff0d0);
      b.spawn([41, 46], [AW - 41, 46], [224, 46], [26, 128], [AW - 26, 196], [224, 264], [120, 264]);
    },
  },

  // 시험 전날 도서관: 벽에 붙은 책장 넷, 열람 탁자 둘. 기믹은 정전 (시야가 좁아짐)
  library: {
    variants: 2,
    make(b, v) {
      b.decal("runner", 196, TOP + 4, 56, AH - TOP - 14);
      const shelfY = v === 0 ? [84, 232] : [100, 236];
      for (const y of shelfY) {
        b.prop("bookshelf", SIDE + 50, y, { v: y });
        b.prop("bookshelf", AW - SIDE - 50, y, { v: y + 1 });
      }
      const tY = v === 0 ? [84, 232] : [70, 220];
      for (const y of tY) {
        b.prop("read_table", 224, y);
        b.light(212, y - 22, 26, 0xffd890).light(236, y - 22, 26, 0xffd890);
      }
      b.prop("book_cart", 150, 150).prop("book_cart", 298, 150, { flip: true });
      b.prop("plant", 140, TOP_SOLID + 10).prop("plant", 308, TOP_SOLID + 10);
      b.light(224, 16, 34, 0xc8d8ff);
      b.spawn([36, AH - 30], [AW - 36, AH - 30], [AW / 2, AH - 24], [26, 160], [AW - 26, 160], [120, 44], [328, 44], [AW / 2 - 60, 120]);
    },
  },

  // 장바구니 정글: 진열대·야자수·카트, 숨 쉬듯 커졌다 작아지는 충동구매 덩굴밭 (느려짐)
  "cart-jungle": {
    variants: 2,
    make(b, v) {
      b.decal("tile_path", 196, TOP, 56, AH - TOP - SIDE).decal("tile_path", SIDE, 136, AW - SIDE * 2, 28);
      const g: [number, number][] = v === 0 ? [[96, 104], [352, 104], [96, 230], [352, 230]] : [[104, 92], [344, 120], [104, 218], [344, 246]];
      for (const [x, y] of g) b.prop("gondola", x, y, { v: x + y });
      b.prop("palm", 224, 92).prop("palm", 224, 240);
      b.prop("cart", 150, 196).prop("cart", 300, 70, { flip: true }).prop("cart", 40, 160);
      const vines: [number, number, number, number][] =
        v === 0 ? [[130, 128, 58, 40], [262, 132, 58, 40], [40, 244, 70, 26], [AW - 116, 44, 76, 26]] : [[126, 150, 60, 40], [264, 150, 60, 40], [180, 252, 90, 22], [30, 40, 70, 24]];
      vines.forEach(([x, y, w, h], i) => b.region({ kind: "vine", x, y, w, h, ellipse: true, id: i }));
      b.light(224, 20, 40, 0xfff0d0).light(60, 20, 26, 0xff90c0).light(AW - 60, 20, 26, 0x90f0ff);
      b.spawn(...EDGE_SPAWNS, [26, 150], [AW - 26, 150]);
    },
  },

  // 결재 늪: 끓는 늪 웅덩이 (느려짐 + 끓을 때 피해), 마른 나무, 반려된 서류 더미
  "deadline-swamp": {
    variants: 2,
    make(b, v) {
      const mud: [number, number, number, number][] =
        v === 0
          ? [[56, 64, 104, 48], [282, 82, 112, 52], [96, 198, 104, 48], [282, 206, 92, 44]]
          : [[150, 50, 120, 44], [40, 140, 96, 50], [312, 150, 100, 48], [168, 214, 116, 46]];
      mud.forEach(([x, y, w, h], i) => b.region({ kind: "mud", x, y, w, h, ellipse: true, id: i }));
      const trees: [number, number][] = v === 0 ? [[48, 160], [404, 170], [224, 70], [244, 262]] : [[60, 80], [390, 92], [60, 250], [396, 252]];
      for (const [x, y] of trees) b.prop("dead_tree", x, y);
      const stacks: [number, number][] = v === 0 ? [[168, 150], [300, 160], [380, 60]] : [[150, 128], [300, 120], [250, 270]];
      for (const [x, y] of stacks) b.prop("paper_stack", x, y);
      for (const [x, y] of [[20, 120], [AW - 20, 240], [130, AH - 12], [340, AH - 12], [30, 40]] as const) b.prop("reeds", x, y);
      b.spawn(...EDGE_SPAWNS, [26, 220], [AW - 26, 120]);
    },
  },

  // 방학 숙제 사막: 선인장·바위·반쯤 묻힌 책상, 신기루. 기믹은 모래 폭풍 (밀림 + 시야 흐림)
  "homework-desert": {
    variants: 2,
    make(b, v) {
      b.decal("dune", 30, 60, 150, 50).decal("dune", 260, 200, 170, 56).decal("dune", 280, 50, 120, 36).decal("mirage", v ? 50 : 352, 140, 64, 26);
      const cacti: [number, number][] = v === 0 ? [[80, 86], [372, 74], [122, 236], [330, 232], [44, 170]] : [[96, 70], [352, 92], [64, 220], [384, 238], [244, 252]];
      for (const [x, y] of cacti) b.prop("cactus", x, y);
      const rocks: [number, number][] = v === 0 ? [[300, 118], [150, 150]] : [[168, 112], [296, 176]];
      for (const [x, y] of rocks) b.prop("desert_rock", x, y);
      b.prop("buried_desk", v ? 380 : 66, v ? 160 : 212);
      b.spawn(...EDGE_SPAWNS, [26, 120], [AW - 26, 160]);
    },
  },

  // 회식 3차: 술상·맥주 상자, 무대. 기믹은 미끄러운 술 웅덩이
  "burnout-abyss": {
    variants: 2,
    make(b, v) {
      b.region({ kind: "stage", x: 164, y: TOP, w: 120, h: 30 });
      b.decal("stage", 164, TOP - 2, 120, 32);
      const tables: [number, number][] = v === 0 ? [[92, 104], [356, 104], [92, 226], [356, 226]] : [[110, 120], [338, 120], [224, 236], [60, 236]];
      for (const [x, y] of tables) {
        b.prop("pub_table", x, y, { v: x });
        b.prop("stool", x - 30, y - 6).prop("stool", x + 30, y - 6).prop("stool", x, y + 12);
      }
      b.prop("crates", SIDE + 12, 172).prop("crates", AW - SIDE - 12, 172);
      const puddles: [number, number, number, number][] =
        v === 0 ? [[184, 104, 80, 26], [140, 188, 66, 22], [268, 182, 72, 22], [180, 252, 96, 18]] : [[180, 76, 88, 24], [40, 160, 70, 24], [300, 196, 80, 24], [130, 244, 60, 20]];
      puddles.forEach(([x, y, w, h], i) => b.region({ kind: "puddle", x, y, w, h, ellipse: true, id: i }));
      b.light(224, 30, 60, 0xff6ac8).light(60, 20, 34, 0x6ad0ff).light(AW - 60, 20, 34, 0xc86aff);
      for (const [x, y] of tables) b.light(x, y - 22, 24, 0xffb060);
      b.spawn(...EDGE_SPAWNS, [26, 120], [AW - 26, 120], [224, 70]);
    },
  },

  // 12월 31일 밤 축제장: 포장마차·가로등·전구 나무, 벤치. 기믹은 하늘에서 떨어지는 폭죽 (경고 원)
  "new-year-eve": {
    variants: 2,
    make(b, v) {
      b.decal("plaza", 120, 104, 208, 96);
      const stalls: [number, number][] = v === 0 ? [[70, 92], [378, 92]] : [[70, 248], [378, 248]];
      for (const [x, y] of stalls) b.prop("stall", x, y, { v: x });
      const posts: [number, number][] = [[150, 64], [298, 64], [150, 236], [298, 236]];
      for (const [x, y] of posts) {
        b.prop("lantern_post", x, y);
        b.light(x, y - 40, 30, 0xffd080);
      }
      const trees: [number, number][] = v === 0 ? [[40, 236], [408, 236]] : [[40, 76], [408, 76]];
      for (const [x, y] of trees) {
        b.prop("light_tree", x, y);
        b.light(x, y - 18, 30, 0xfff0a0, true);
      }
      b.prop("park_bench", 224, 266).prop("park_bench", 224, 52);
      for (const [x, y] of stalls) b.light(x, y - 24, 40, 0xff9a50);
      b.spawn([26, 160], [AW - 26, 160], [224, 40], [100, 40], [348, 40], [110, AH - 24], [338, AH - 24]);
    },
  },

  // 분기 마감 전날 밤: 꺼진 모니터가 놓인 책상 섬, 서류 캐비닛·복사기, 깜빡이는 형광등, 비상구 초록 불. 기믹은 자동 소등 (아주 좁은 시야)
  "quarter-close": {
    variants: 2,
    make(b, v) {
      const desks: [number, number][] = v === 0 ? [[92, 100], [224, 100], [356, 100], [92, 214], [356, 214]] : [[140, 92], [308, 92], [80, 204], [224, 214], [368, 204]];
      b.decal("carpet_path", SIDE, v === 0 ? 144 : 128, AW - SIDE * 2, 28);
      desks.forEach(([x, y], i) => {
        // 한 자리만 모니터가 켜져 있다 (v=1 그림) — 누군가 아직 안 갔다
        b.prop("night_desk", x, y, { v: i === 2 ? 1 : 0 });
        b.prop("chair", x - 18, y + 8).prop("chair", x + 18, y + 8, { flip: true });
        b.decal("paper_scatter", x - 30, y + 4, 60, 14, i);
        if (i === 2) b.light(x - 12, y - 20, 18, 0x7ab8f0, true);
      });
      if (v === 0) {
        b.prop("file_cabinet", 150, TOP_SOLID + 14).prop("file_cabinet", 298, TOP_SOLID + 14);
        b.prop("copier", 224, 214);
      } else {
        b.prop("file_cabinet", 40, 120).prop("file_cabinet", AW - 40, 120);
        b.prop("copier", 300, 152);
      }
      b.prop("plant", 18, AH - 10).prop("plant", AW - 18, AH - 10).prop("cooler", v === 0 ? 30 : AW - 30, 170);
      // 천장 형광등 (몇 개는 수명이 다해 깜빡인다)
      for (const [x, y, fl] of [[92, 60, 0], [224, 60, 1], [356, 60, 0], [92, 176, 1], [224, 176, 0], [356, 176, 0]] as const) b.light(x, y, 38, 0xd8ecff, fl === 1);
      // 비상구 (위 벽 오른쪽) — 소등돼도 켜져 있다
      b.emergency(AW - 64, 12, 30, 0x3aff8a);
      b.spawn(...EDGE_SPAWNS, [26, 140], [AW - 26, 140], [224, 40]);
    },
  },

  // 구조조정 발표 날: 짐을 뺀 빈 책상·박스 더미가 늘어선 인사팀 복도, 양쪽 벽에 문서 파쇄기. 기믹은 서류 폭풍 (가로로 밀림 + 파쇄기)
  "layoff-day": {
    variants: 2,
    make(b, v) {
      b.decal("hall_runner", SIDE, 132, AW - SIDE * 2, 36);
      // 양쪽 벽 파쇄기 (구간마다 끊겨 있다 — 밀려도 틈으로 피할 수 있다)
      const shred: [number, number, number][] =
        v === 0
          ? [[SIDE, TOP + 8, 92], [SIDE, 182, AH - SIDE - 182 - 4], [AW - SIDE - 18, TOP + 30, 100], [AW - SIDE - 18, 196, AH - SIDE - 196 - 4]]
          : [[SIDE, TOP + 36, 96], [SIDE, 204, AH - SIDE - 204 - 4], [AW - SIDE - 18, TOP + 8, 84], [AW - SIDE - 18, 170, AH - SIDE - 170 - 4]];
      shred.forEach(([x, y, h], i) => b.region({ kind: "shredder", x, y, w: 18, h, id: i }));
      const desks: [number, number][] = v === 0 ? [[110, 96], [224, 96], [338, 96], [110, 214], [338, 214]] : [[96, 110], [224, 80], [352, 110], [150, 232], [298, 232]];
      desks.forEach(([x, y], i) => {
        b.prop("empty_desk", x, y, { v: i });
        b.prop("chair", x + (i % 2 ? -14 : 14), y + 10, { flip: i % 2 === 1 });
      });
      const boxes: [number, number][] = v === 0 ? [[168, 160], [280, 160], [224, 236], [60, 150], [388, 150]] : [[160, 166], [288, 166], [224, 196], [70, 196], [378, 196]];
      boxes.forEach(([x, y], i) => b.prop("box_stack", x, y, { v: i }));
      b.decal("paper_scatter", 120, 150, 70, 16, 1).decal("paper_scatter", 260, 178, 80, 16, 2).decal("paper_scatter", 180, 60, 90, 14, 3);
      b.prop("plant", 150, TOP_SOLID + 10).prop("cooler", 360, TOP_SOLID + 12);
      for (const x of [92, 224, 356]) b.light(x, 50, 40, 0xf0f4ff).light(x, 190, 40, 0xf0f4ff);
      b.spawn([40, 62], [AW - 40, 62], [40, AH - 30], [AW - 40, AH - 30], [AW / 2, AH - 22], [AW / 2, 40], [150, AH - 22], [298, 44]);
    },
  },
};

/** 사냥터 지도. seed로 배치 하나를 고른다 (같은 시드면 같은 지도) */
export function buildLayout(zone: ZoneId | string, seed: number): ArenaLayout {
  const id: ZoneId = isZoneId(zone) ? zone : "meeting-room";
  const def = MAKE[id];
  const variant = Math.abs(seed) % def.variants;
  return layoutVariant(id, variant);
}

export function layoutVariant(id: ZoneId, variant: number): ArenaLayout {
  const b = new Builder();
  MAKE[id].make(b, variant);
  return { zone: id, variant, props: b.props, solids: b.solids, decals: b.decals, regions: b.regions, lights: b.lights, spawns: b.spawns, start: b.start };
}

export const layoutVariants = (id: ZoneId) => MAKE[id].variants;

// ── 충돌 ──

/** 원(반지름 r)을 모든 장애물 밖으로 밀어낸다 (p를 바꾼다). 겹쳤으면 true */
export function collide(solids: readonly Solid[], p: Pt, r: number): boolean {
  let hit = false;
  for (let iter = 0; iter < 2; iter++) {
    for (const s of solids) {
      if (s.t === "c") {
        const dx = p.x - s.x;
        const dy = p.y - s.y;
        const min = s.r + r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2);
        hit = true;
        if (d < 0.01) p.y = s.y + min;
        else {
          p.x = s.x + (dx / d) * min;
          p.y = s.y + (dy / d) * min;
        }
      } else {
        const cx = Math.max(s.x, Math.min(p.x, s.x + s.w));
        const cy = Math.max(s.y, Math.min(p.y, s.y + s.h));
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          p.x = cx + (dx / d) * r;
          p.y = cy + (dy / d) * r;
        } else {
          // 안쪽: 가장 얕은 쪽으로 뺀다
          const left = p.x - s.x;
          const right = s.x + s.w - p.x;
          const up = p.y - s.y;
          const down = s.y + s.h - p.y;
          const m = Math.min(left, right, up, down);
          if (m === left) p.x = s.x - r;
          else if (m === right) p.x = s.x + s.w + r;
          else if (m === up) p.y = s.y - r;
          else p.y = s.y + s.h + r;
        }
      }
    }
  }
  return hit;
}

/** 위 벽 띠까지 포함한 전체 장애물 */
export function allSolids(l: ArenaLayout): Solid[] {
  return [{ t: "r", x: 0, y: 0, w: AW, h: TOP_SOLID }, ...l.solids];
}

/** 몸 반지름 r인 것이 (x,y)에 설 수 있나 (HuntScene 경계 + 장애물) */
export function standable(solids: readonly Solid[], x: number, y: number, r: number): boolean {
  if (x < SIDE + r || x > AW - SIDE - r || y < SIDE + r + 4 || y > AH - SIDE - 2) return false;
  for (const s of solids) {
    if (s.t === "c") {
      if (Math.hypot(x - s.x, y - s.y) < s.r + r) return false;
    } else {
      const cx = Math.max(s.x, Math.min(x, s.x + s.w));
      const cy = Math.max(s.y, Math.min(y, s.y + s.h));
      if (Math.hypot(x - cx, y - cy) < r) return false;
    }
  }
  return true;
}

/** 칸마다 반지름 r로 설 수 있는지 (1 = 갈 수 있음) */
export function freeGrid(solids: readonly Solid[], r: number): Uint8Array {
  const g = new Uint8Array(COLS * ROWS);
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) g[j * COLS + i] = standable(solids, i * CELL + CELL / 2, j * CELL + CELL / 2, r) ? 1 : 0;
  return g;
}

export const cellOf = (x: number, y: number) => {
  const i = Math.max(0, Math.min(COLS - 1, Math.floor(x / CELL)));
  const j = Math.max(0, Math.min(ROWS - 1, Math.floor(y / CELL)));
  return j * COLS + i;
};

const N8: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

/** BFS 거리 (갈 수 없는 칸·못 닿는 칸은 Infinity). 대각선은 양옆이 열려 있을 때만 */
export function distanceField(free: Uint8Array, from: number, out = new Float32Array(COLS * ROWS)): Float32Array {
  out.fill(Infinity);
  if (!free[from]) return out;
  const q = new Int32Array(COLS * ROWS);
  let head = 0;
  let tail = 0;
  out[from] = 0;
  q[tail++] = from;
  // 칸 수가 2천 개 남짓이라 단순 BFS(대각선 비용 근사)로 충분하다
  while (head < tail) {
    const c = q[head++];
    const ci = c % COLS;
    const cj = (c - ci) / COLS;
    for (const [di, dj, w] of N8) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const n = nj * COLS + ni;
      if (!free[n]) continue;
      if (di && dj && (!free[cj * COLS + ni] || !free[nj * COLS + ci])) continue;
      const nd = out[c] + w;
      if (nd < out[n]) {
        const fresh = out[n] === Infinity;
        out[n] = nd;
        if (fresh) q[tail++] = n;
      }
    }
  }
  return out;
}

/** 가장 가까운 갈 수 있는 칸 (없으면 -1) */
export function nearestFree(free: Uint8Array, x: number, y: number): number {
  const c = cellOf(x, y);
  if (free[c]) return c;
  let best = -1;
  let bd = Infinity;
  for (let k = 0; k < free.length; k++) {
    if (!free[k]) continue;
    const kx = (k % COLS) * CELL + CELL / 2;
    const ky = Math.floor(k / COLS) * CELL + CELL / 2;
    const d = (kx - x) ** 2 + (ky - y) ** 2;
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

/**
 * 몬스터 길찾기: 플레이어 칸에서 퍼지는 거리장. 플레이어가 다른 칸으로 옮길 때만 다시 계산한다.
 * 곧장 갈 수 있으면(사이에 막힌 칸이 없으면) 원래 방향 그대로, 막혀 있으면 거리가 줄어드는 이웃 칸 쪽으로.
 */
export class FlowField {
  readonly free: Uint8Array;
  private dist = new Float32Array(COLS * ROWS);
  private target = -1;

  constructor(solids: readonly Solid[], readonly radius = 8) {
    this.free = freeGrid(solids, radius);
  }

  update(tx: number, ty: number): void {
    const c = nearestFree(this.free, tx, ty);
    if (c === this.target || c < 0) return;
    this.target = c;
    distanceField(this.free, c, this.dist);
  }

  /** (x,y)에서 (tx,ty)까지 막힌 칸이 없나 */
  clearLine(x: number, y: number, tx: number, ty: number): boolean {
    const d = Math.hypot(tx - x, ty - y);
    const n = Math.ceil(d / 6);
    for (let k = 1; k < n; k++) if (!this.free[cellOf(x + ((tx - x) * k) / n, y + ((ty - y) * k) / n)]) return false;
    return true;
  }

  /** 거리가 줄어드는 쪽 단위 벡터 (모르면 null) */
  dirAt(x: number, y: number): Pt | null {
    const c = cellOf(x, y);
    const ci = c % COLS;
    const cj = (c - ci) / COLS;
    let best = -1;
    let bd = this.free[c] ? this.dist[c] : Infinity;
    for (const [di, dj] of N8) {
      const ni = ci + di;
      const nj = cj + dj;
      if (ni < 0 || nj < 0 || ni >= COLS || nj >= ROWS) continue;
      const n = nj * COLS + ni;
      if (!this.free[n]) continue;
      if (di && dj && (!this.free[cj * COLS + ni] || !this.free[nj * COLS + ci])) continue;
      if (this.dist[n] < bd) {
        bd = this.dist[n];
        best = n;
      }
    }
    if (best < 0) return null;
    const bx = (best % COLS) * CELL + CELL / 2 - x;
    const by = Math.floor(best / COLS) * CELL + CELL / 2 - y;
    const m = Math.hypot(bx, by) || 1;
    return { x: bx / m, y: by / m };
  }
}

// ── 지형 구역 ──

export function inRegion(r: Region, x: number, y: number, grow = 1): boolean {
  if (r.ellipse) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    const dx = (x - cx) / ((r.w / 2) * grow);
    const dy = (y - cy) / ((r.h / 2) * grow);
    return dx * dx + dy * dy <= 1;
  }
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}
