import { ZOO, ZOO_EAST_GATE, ZOO_GATE, ZOOKEEPER } from "@tomb/protocol";

// 동물원 배치 (예전 버드나무 묘역 자리) — 순수 데이터 (Phaser 없음 → zoo.test.ts·world.test.ts가 충돌·길·우리 안을 검사한다).
// 그림은 zoo/zooArt.ts + zoo/ZooView.ts, 구역·문·사육사 좌표 원본은 protocol world.ts(ZOO·ZOO_GATE·ZOO_EAST_GATE·ZOOKEEPER).
// 충돌은 layout.staticColliders()에 들어가 걷기 격자·고양이 길찾기·새로고침 복원 판정이 모두 같은 상자를 본다.
//
//   y=784 ━━━━━━━━━━━[정문 x160~192]━━━━━━━━━━━━━━━━━━━━━━━━━┓
//         ┃ ┌사슴 우리┐  ║  사육사·노점  ┌여우 굴┬작은 친구들┐ ┃
//         ┃ └────────┘  ║              └──────┴──────────┘ ┃
//   y≈888 ┃ ═══════════ 가로 길 ═════════════════════════════ [동문 → 안개 숲]
//         ┃ ┌거위 연못┐  ║  ┌큰 개 놀이터┐   쉼터(벤치·버드나무)  ┃
//   y=1008┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛ (아래 담)

type Box = { x: number; y: number; w: number; h: number };

export type PenId = "deer" | "fox" | "friends" | "geese" | "hounds";
export type Pen = { id: PenId; name: string; rect: Box };

/** 우리 다섯 곳 (나무 울타리로 네 변을 막는다 — 사람은 못 들어가고 동물은 안에서만 돌아다닌다) */
export const ZOO_PENS: readonly Pen[] = [
  { id: "deer", name: "사슴 우리", rect: { x: 56, y: 792, w: 92, h: 72 } },
  { id: "fox", name: "여우 굴", rect: { x: 252, y: 792, w: 68, h: 72 } },
  { id: "friends", name: "작은 친구들", rect: { x: 320, y: 792, w: 72, h: 72 } },
  { id: "geese", name: "거위 연못", rect: { x: 56, y: 912, w: 92, h: 88 } },
  { id: "hounds", name: "큰 개 놀이터", rect: { x: 204, y: 912, w: 104, h: 88 } },
];
export function penById(id: PenId): Pen {
  return ZOO_PENS.find((p) => p.id === id)!;
}

/** 자갈길 (타일 단위, 포함 범위): 정문에서 내려오는 세로 길 · 가운데 가로 길 · 사육사 앞마당 */
export const ZOO_PATHS: readonly { tx0: number; tx1: number; ty0: number; ty1: number }[] = [
  { tx0: 10, tx1: 11, ty0: 49, ty1: 62 },
  { tx0: 3, tx1: 24, ty0: 55, ty1: 55 },
  { tx0: 12, tx1: 14, ty0: 50, ty1: 53 },
];
/** 동문 → 안개 숲 흙길 (가로 길 줄, 울타리 밖 세 칸) */
export const ZOO_EAST_TRAIL = { tx0: 25, tx1: 27, ty: 55 } as const;
/** 거위 연못 물 (그림만 — 우리 안이라 사람이 들어갈 수 없다) */
export const ZOO_POND = { x: 100, y: 958, rx: 24, ry: 12 } as const;
/** 사육사 노점 (사육사 오른쪽, 받침 가운데) */
export const ZOO_STALL = { x: ZOOKEEPER.x + 24, y: ZOOKEEPER.y + 2 } as const;

export type ZooDecorKind = "arch" | "stall" | "trough" | "hay" | "shed" | "doghouse" | "den" | "perch" | "pond" | "sign" | "lantern" | "willow" | "bush" | "flowers";
export type ZooDecor = { kind: ZooDecorKind; x: number; y: number; label?: string };

/** 장식 (x,y = 받침 가운데, 그림 맨 아래 줄). 우리 이름 팻말은 가로 길 쪽 울타리 앞에 */
export const ZOO_DECOR: readonly ZooDecor[] = [
  { kind: "arch", x: (ZOO_GATE.x0 + ZOO_GATE.x1) / 2, y: ZOO_GATE.y },
  { kind: "lantern", x: 148, y: 780 },
  { kind: "lantern", x: 204, y: 780 },
  { kind: "stall", x: ZOO_STALL.x, y: ZOO_STALL.y },
  // 사슴 우리: 지붕 있는 쉼터·건초·여물통
  { kind: "shed", x: 80, y: 816 },
  { kind: "hay", x: 130, y: 818 },
  { kind: "trough", x: 104, y: 858 },
  // 여우 굴: 바위 굴
  { kind: "den", x: 300, y: 812 },
  { kind: "flowers", x: 268, y: 852 },
  // 작은 친구들: 횃대·여물통
  { kind: "perch", x: 376, y: 812 },
  { kind: "trough", x: 340, y: 858 },
  // 거위 연못
  { kind: "pond", x: ZOO_POND.x, y: ZOO_POND.y + ZOO_POND.ry },
  { kind: "hay", x: 138, y: 930 },
  // 큰 개 놀이터: 개집·여물통
  { kind: "doghouse", x: 228, y: 938 },
  { kind: "trough", x: 286, y: 992 },
  // 쉼터 (벤치 bX 둘레)
  { kind: "willow", x: 384, y: 936 },
  { kind: "bush", x: 322, y: 958 },
  { kind: "flowers", x: 330, y: 1000 },
  // 우리 이름 팻말 (가로 길에서 보이게)
  { kind: "sign", x: 102, y: 878, label: "사슴 우리" },
  { kind: "sign", x: 286, y: 878, label: "여우 굴" },
  { kind: "sign", x: 356, y: 878, label: "작은 친구들" },
  { kind: "sign", x: 102, y: 908, label: "거위 연못" },
  { kind: "sign", x: 256, y: 908, label: "큰 개 놀이터" },
];

/** 바깥 울타리·우리 울타리 한 줄 (가로 y0 = y1, 세로 x0 = x1) */
export type ZooFence = { x0: number; y0: number; x1: number; y1: number };

function fenceSides(r: Box): ZooFence[] {
  return [
    { x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y },
    { x0: r.x, y0: r.y + r.h, x1: r.x + r.w, y1: r.y + r.h },
    { x0: r.x, y0: r.y, x1: r.x, y1: r.y + r.h },
    { x0: r.x + r.w, y0: r.y, x1: r.x + r.w, y1: r.y + r.h },
  ];
}

/** 바깥 울타리 (위쪽 정문·동문 자리는 비운다. 아래는 담이 막는다) */
export const ZOO_OUTER: readonly ZooFence[] = [
  { x0: ZOO.x, y0: ZOO.y, x1: ZOO_GATE.x0, y1: ZOO.y },
  { x0: ZOO_GATE.x1, y0: ZOO.y, x1: ZOO.x + ZOO.w, y1: ZOO.y },
  { x0: ZOO.x, y0: ZOO.y, x1: ZOO.x, y1: ZOO.y + ZOO.h },
  { x0: ZOO.x + ZOO.w, y0: ZOO.y, x1: ZOO.x + ZOO.w, y1: ZOO_EAST_GATE.y0 },
  { x0: ZOO.x + ZOO.w, y0: ZOO_EAST_GATE.y1, x1: ZOO.x + ZOO.w, y1: ZOO.y + ZOO.h },
];
/** 우리 울타리 (네 변 모두 막힘, 붙어 있는 우리는 같은 줄을 두 번 친다 — 그림은 ZooView가 한 번만) */
export const ZOO_PEN_FENCES: readonly ZooFence[] = ZOO_PENS.flatMap((p) => fenceSides(p.rect));
export const ZOO_FENCES: readonly ZooFence[] = [...ZOO_OUTER, ...ZOO_PEN_FENCES];

/** 울타리 충돌 (가로는 선 위 3px ~ 아래 1px, 세로는 선 양옆 2px — 묘역 철책과 같다) */
export function zooFenceCollider(f: ZooFence): Box {
  return f.y0 === f.y1 ? { x: f.x0, y: f.y0 - 3, w: f.x1 - f.x0, h: 4 } : { x: f.x0 - 2, y: f.y0, w: 4, h: f.y1 - f.y0 };
}

/** 장식 하나의 충돌 상자 (없으면 null). 우리 안 장식은 사람이 닿지 않아 막지 않는다 */
export function zooDecorCollider(d: ZooDecor): Box | null {
  switch (d.kind) {
    case "stall":
      return { x: d.x - 12, y: d.y - 6, w: 24, h: 6 };
    case "lantern":
      return { x: d.x - 4, y: d.y - 5, w: 8, h: 5 };
    case "sign":
      return { x: d.x - 2, y: d.y - 3, w: 4, h: 3 };
    case "willow":
      return { x: d.x - 4, y: d.y - 5, w: 8, h: 5 };
    case "arch":
      return null; // 기둥 둘은 zooColliders()에서 따로
    default:
      return null;
  }
}

/** 정문 아치 폭 (울타리 문 폭 + 양쪽 기둥) */
export const ZOO_ARCH_W = 44;
export const ZOO_ARCH_H = 38;

/** 동물원 충돌 전부: 바깥·우리 울타리, 정문 아치 기둥, 노점·석등·팻말·나무, 사육사 발밑 */
export function zooColliders(): Box[] {
  const out: Box[] = ZOO_FENCES.map(zooFenceCollider);
  for (const d of ZOO_DECOR) {
    if (d.kind === "arch") {
      const half = ZOO_ARCH_W / 2;
      out.push({ x: d.x - half, y: d.y - 5, w: 6, h: 5 }, { x: d.x + half - 6, y: d.y - 5, w: 6, h: 5 });
      continue;
    }
    const c = zooDecorCollider(d);
    if (c) out.push(c);
  }
  out.push({ x: ZOOKEEPER.x - 6, y: ZOOKEEPER.y - 5, w: 12, h: 5 });
  return out;
}

/** 밤 등불 (WorldMap.staticLights에 더한다): 정문 석등 둘, 노점 등, 아치 양쪽 등 */
export const ZOO_LIGHTS: readonly { x: number; y: number; scale: number; tint: number; base: number }[] = [
  ...ZOO_DECOR.filter((d) => d.kind === "lantern").map((d) => ({ x: d.x, y: d.y - 15, scale: 0.75, tint: 0xffc068, base: 0.7 })),
  { x: ZOO_STALL.x, y: ZOO_STALL.y - 24, scale: 0.55, tint: 0xffd890, base: 0.65 },
  ...[-1, 1].map((s) => ({ x: (ZOO_GATE.x0 + ZOO_GATE.x1) / 2 + s * (ZOO_ARCH_W / 2 - 3), y: ZOO_GATE.y - 24, scale: 0.5, tint: 0xffc070, base: 0.75 })),
];

/** 동물원 바닥: 자갈길 "gravel", 우리 안 "dirt", 동문 밖 흙길 "dirt", 나머지는 null(풀밭 — 호출한 쪽이 정한다) */
export function zooGround(tx: number, ty: number): "gravel" | "dirt" | null {
  if (ty === ZOO_EAST_TRAIL.ty && tx >= ZOO_EAST_TRAIL.tx0 && tx <= ZOO_EAST_TRAIL.tx1) return "dirt";
  const px = tx * 16 + 8;
  const py = ty * 16 + 8;
  if (px < ZOO.x || px > ZOO.x + ZOO.w || py < ZOO.y || py > ZOO.y + ZOO.h) return null;
  for (const p of ZOO_PATHS) if (tx >= p.tx0 && tx <= p.tx1 && ty >= p.ty0 && ty <= p.ty1) return "gravel";
  for (const p of ZOO_PENS) {
    const r = p.rect;
    if (px > r.x && px < r.x + r.w && py > r.y && py < r.y + r.h) return "dirt";
  }
  return null;
}

/** 사육사 상호작용 자리 (발 기준 — 노점 앞 마당에서 사육사를 마주 본다) */
export const ZOOKEEPER_SPOT = { x: ZOOKEEPER.x, y: ZOOKEEPER.y + 10 } as const;
