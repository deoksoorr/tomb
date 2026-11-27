import type { CxDir, CxEnterStep, CxRow, CxSeat } from "./types";

// 11/27 카라반 전용 가구 8 · 바닥 3 · 벽지 3 — 관리소 언젠가 씨만 팔고, 카라반 주인만 사고, 카라반에만 놓는다.
// 그림은 game/housing/campExclusive/caravanArt.ts (운영자가 고른 시안 그대로). 이름·값·칸(w·h)·id는 확정.
//
// 자리 좌표 = 그 방향 차지 칸 왼쪽 위에서 발(앵커)까지 px. 그림은 칸 위로 up px 솟으므로 시안 그림 좌표 y − up.
// 누운 자리는 마을 침대처럼 발 원점 기준으로 tilt만큼 돌린 누운 그림 (90 = 머리가 오른쪽 · −90 = 왼쪽 · 180 = 아래).
// 머리가 가구 그림(머리판·난간)에 겹치지 않게 머리 끝을 베개 안에 맞췄다 — 목선 아래 몸은 덮개(caravanArt coverArt)가 가린다.

/** 접이식 캠핑 의자 (솟는 높이 10): 시안 발 자리 그림 y 21. 뒤를 보면 등받이가 앞(behind)이고, 머리·어깨가 등받이 위로 보이게 5px 올린다 */
const CHAIR_BACK_UP = 5;
const campChairSeat = (d: CxDir, w: number, h: number): CxSeat[] => [{ x: w / 2, y: h - 5 - (d === 2 ? CHAIR_BACK_UP : 0), face: d, ...(d === 2 ? { behind: true } : {}) }];

/** 릴렉스 체어 (솟는 높이 8): 머리는 베개, 몸은 겨자색 니트 담요 (덮개 키 = 가구 id) */
const relaxSeat = (d: CxDir, w: number): CxSeat[] => {
  const lie = { face: 0, lie: true, cover: true } as const;
  if (d === 0) return [{ x: w / 2, y: 13, ...lie }];
  if (d === 2) return [{ x: w / 2, y: 0, tilt: 180, ...lie }];
  // 옆: 머리가 등판(왼쪽을 보면 오른쪽 끝) 베개 위
  return [{ x: d === 1 ? 13 : w - 13, y: 0, tilt: d === 1 ? 90 : -90, ...lie }];
};

/**
 * 2층 벙커 침대 (솟는 높이 28): [위층, 아래층]. 위층 초록 침낭(cx_cv_bunk_up) · 아래층 남색 줄무늬 이불(cx_cv_bunk_lo).
 * 위층은 공중이라 옆·뒤로 놓으면 발 자리가 차지 칸 위(음수 y)로 올라간다. 위층 사람 깊이(depthY)는 아래층 발 줄 + 1 —
 * 침대 그림(아래층 발 줄 − 1)보다 앞, 아래층 사람(발 줄 + 2)보다 뒤. 그래서 가구 깊이가 위층 자리 때문에 칸 위로 뛰지 않는다.
 *
 * 11/27 드나드는 길 (운영자 「2층에 타는 모션이 너무 이상한데」): 위층은 사다리 밑까지 걸어가 사다리를 타고(뒷모습 걸음) 올라가 눕고,
 * 일어나면 사다리로 내려와 사다리 밑에 선다. 아래층은 열린 쪽(앞·옆으로 놓으면 긴 앞면, 뒤로 놓으면 왼쪽 옆) 앞에서 미끄러져 눕는다.
 * 사다리 자리는 그림(caravanArt bunkFront·bunkSide·bunkBack)과 같다: 앞 = 오른쪽 기둥 x 23~27 · 옆 = 발치 끝판 x 5~9 · 뒤 = 먼 쪽(고리 x 22~28 — 침대 뒤로 오른다)
 */
const bunkSeats = (d: CxDir, w: number): CxSeat[] => {
  const pair = (x: number, upY: number, loY: number, upPath: CxEnterStep[], loPath: CxEnterStep[], tilt?: number): CxSeat[] => [
    { x, y: upY, face: 0, lie: true, cover: "cx_cv_bunk_up", depthY: loY + 1, enter: upPath, pick: "위칸 눕기", ...(tilt ? { tilt } : {}) },
    { x, y: loY, face: 0, lie: true, cover: "cx_cv_bunk_lo", enter: loPath, pick: "아래칸 눕기", ...(tilt ? { tilt } : {}) },
  ];
  if (d === 0)
    return pair(
      w / 2,
      0,
      30,
      [
        { x: 25, y: 54 },
        { x: 25, y: 47 },
        { x: 25, y: 2, climb: true },
      ],
      [{ x: 11, y: 54 }],
    );
  if (d === 2)
    return pair(
      w / 2,
      -18,
      16,
      [
        { x: w + 6, y: 8 },
        { x: 25, y: -4, behind: true },
        { x: 25, y: -24, climb: true, behind: true },
      ],
      [{ x: -7, y: 26 }],
      180,
    );
  // 옆: 머리가 오른쪽(왼쪽을 볼 때) 머리판 바로 앞 베개 위, 사다리는 발치 끝판
  const lx = d === 1 ? 7 : w - 7;
  return pair(
    d === 1 ? 24 : w - 24,
    -16,
    12,
    [
      { x: lx, y: 38 },
      { x: lx, y: 31 },
      { x: lx, y: -10, climb: true },
    ],
    [{ x: d === 1 ? 26 : w - 26, y: 38 }],
    d === 1 ? 90 : -90,
  );
};

export const CARAVAN_CX: readonly CxRow[] = [
  {
    id: "cx_cv_camp_chair",
    name: "접이식 캠핑 의자",
    desc: "펴면 의자, 접으면 가방이에요. 팔걸이에 컵 홀더도 있어요.",
    price: 600,
    w: 1,
    h: 1,
    use: "앉기",
    act: { seats: campChairSeat },
  },
  {
    id: "cx_cv_icebox",
    name: "아이스박스",
    desc: "뚜껑을 열면 얼음 사이에 시원한 음료가 꽂혀 있어요.",
    price: 640,
    w: 1,
    h: 1,
    use: "음료 꺼내 마시기",
    act: {
      fx: {
        v: "open",
        ms: 2500,
        emote: "soda",
        sfx: "fridge",
        lines: ["시원한 사이다 한 캔 꺼냈어요.", "얼음이 아직 안 녹았어요.", "캬, 시원해요."],
      },
      hold: { item: "can", ms: 4000 },
    },
  },
  {
    id: "cx_cv_radio",
    name: "레트로 라디오",
    desc: "안테나를 쭉 뽑으면 지직거리다가 옛날 노래가 나와요.",
    price: 800,
    w: 1,
    h: 1,
    use: "켜기·끄기",
    // 켤 때 음표 이모티콘 + 한마디 (켜 둔 동안은 그림 위에 음표 둘)
    // 켜 둔 동안 다이얼 창 작은 빛 (앞모습 다이얼이 오른쪽)
    light: { color: 0xffd890, r: 12, dx: 3, dy: -16 },
    act: {
      toggle: { label: ["라디오 끄기", "라디오 켜기"], sfx: "tune", anim: { frames: ["", "f1"], ms: 700 } },
      fx: { emote: "note", lines: ["지직… 옛날 노래가 잡혔어요.", "볼륨을 살짝 올렸어요."] },
    },
  },
  {
    id: "cx_cv_lantern",
    name: "랜턴 스탠드",
    desc: "갈고리에 건 랜턴이 카라반 안을 노랗게 밝혀요.",
    price: 880,
    w: 1,
    h: 2,
    use: "켜기·끄기",
    // 받침만 바닥에 닿는다 (발 그늘은 그림 안). 빛은 매단 랜턴 높이 (앞모습 랜턴이 기둥 오른쪽 — 방향마다 자리가 달라 앞모습 기준 어림)
    noShadow: true,
    light: { color: 0xffc870, r: 34, dx: 3, dy: -30 },
    act: { toggle: { startOn: true, label: ["랜턴 끄기", "랜턴 켜기"] } },
  },
  {
    id: "cx_cv_mug_shelf",
    name: "캠핑 머그 선반",
    desc: "색색 법랑 머그를 걸어 둔 선반이에요. 하나 꺼내 커피를 타요.",
    price: 960,
    w: 2,
    h: 1,
    use: "커피 타기",
    act: {
      fx: {
        v: "pour",
        ms: 3000,
        emote: "coffee",
        sfx: "pour",
        lines: ["따뜻한 커피 한 잔 탔어요.", "오늘은 초록 머그로 할래요."],
      },
      hold: { item: "mug", ms: 5000 },
    },
  },
  {
    id: "cx_cv_relax_chair",
    name: "릴렉스 체어",
    desc: "등을 한껏 젖히면 낮잠이 솔솔 와요.",
    price: 1_200,
    w: 1,
    h: 2,
    use: "기대 눕기",
    act: { seats: relaxSeat },
  },
  {
    id: "cx_cv_canopy",
    name: "전구 줄 캐노피",
    desc: "줄무늬 차양 끝에 꼬마전구를 줄줄이 달았어요.",
    price: 1_280,
    w: 3,
    h: 1,
    use: "켜기·끄기",
    // 기둥만 바닥에 닿는다. 빛은 처마 끝 전구 줄 높이
    noShadow: true,
    light: { color: 0xffe27a, r: 40, dx: 1, dy: -22 },
    act: { toggle: { startOn: true, label: ["전구 끄기", "전구 켜기"] } },
  },
  {
    id: "cx_cv_bunk",
    name: "2층 벙커 침대",
    desc: "위층은 별 보는 자리, 아래층은 푹 자는 자리예요.",
    price: 1_920,
    w: 2,
    h: 3,
    use: "위·아래 칸 눕기",
    // 두 칸이 다 비었으면 E에 고르는 말풍선 (위칸·아래칸), 하나만 비었으면 그 칸으로
    act: { seats: bunkSeats, pickLabel: "눕기 (위칸·아래칸)" },
  },
  // ── 바닥 ──
  {
    id: "cx_cv_floor_check",
    name: "레트로 체크 장판",
    desc: "분홍·크림 체크가 깔린 옛날 캠핑카 바닥이에요.",
    price: 1_400,
    w: 1,
    h: 1,
    skin: "floor",
  },
  {
    id: "cx_cv_floor_rug",
    name: "캠핑 러그 마루",
    desc: "짙은 나무 마루 사이사이에 무늬 러그 줄을 깔았어요.",
    price: 1_600,
    w: 1,
    h: 1,
    skin: "floor",
  },
  {
    id: "cx_cv_floor_mint",
    name: "민트 체크 타일",
    desc: "민트와 크림이 번갈아 깔린 산뜻한 타일이에요.",
    price: 1_200,
    w: 1,
    h: 1,
    skin: "floor",
  },
  // ── 벽지 ──
  {
    id: "cx_cv_wall_ply",
    name: "크림색 합판 벽",
    desc: "크림색 합판 아래로 민트 띠를 두른 벽이에요.",
    price: 1_200,
    w: 1,
    h: 1,
    skin: "wall",
  },
  {
    id: "cx_cv_wall_cherry",
    name: "빈티지 체리 패널",
    desc: "붉은 체리목 판을 세로로 이어 붙인 벽이에요.",
    price: 1_800,
    w: 1,
    h: 1,
    skin: "wall",
  },
  {
    id: "cx_cv_wall_canvas",
    name: "줄무늬 캔버스 벽",
    desc: "올리브색 줄무늬 캔버스를 둘러 텐트 안 같아요.",
    price: 1_400,
    w: 1,
    h: 1,
    skin: "wall",
  },
];
