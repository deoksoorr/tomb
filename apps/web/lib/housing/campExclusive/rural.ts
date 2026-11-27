import type { CxRow } from "./types";

// 11/27 촌캉스 전용 가구 8 · 바닥 3 · 벽지 3 — 순이 할머니만 팔고, 촌캉스 주인만 사고, 촌캉스에만 놓는다.
//
// 그림은 game/housing/campExclusive/ruralArt.ts (그림 변형 이름·손에 든 그림 heldArt·누운 덮개 coverArt).
//  - 이름·값·칸(w·h)·id는 확정 (서버 값·점수·테스트가 본다). 곶감 걸이는 2×1 (11/27 확정).
//  - 자리(seats) 좌표는 게임 그림에 맞춘 값: 방석은 방석 가운데, 이불 요는 두 베개에 머리가 오고 어깨선이 이불 깃에 온다 (네 방향).
//  - 곶감 걸이는 먹은 개수를 켜기 값으로 남긴다 (0 가득 → 1·2·3개 먹음 → 다음 E에 할머니가 새 줄로 채워 둔 가득).
//  - TV는 채널을 돌리는 켜기 (값 0 꺼짐 · 1~3 채널), 켤 때·돌릴 때마다 잠깐 지지직. 선풍기는 바람 세기 (값 0 꺼짐 · 1~3).

/** 다듬잇돌 앞에 무릎 꿇는 자리 (방향 d마다, 차지 칸 왼쪽 위 기준 px — 그림 ruralArt가 이 자리에서 방망이 든 손을 그린다) */
export const DADUMI_SEAT = (d: number, w: number, h: number) =>
  d === 0
    ? { x: w / 2, y: 6, face: 0 as const, behind: true }
    : d === 2
      ? { x: w / 2, y: h + 9, face: 2 as const, inside: false }
      : { x: d === 1 ? w + 2 : -2, y: h - 13, face: d as 1 | 3, inside: false };

/** 목화솜 이불 요 두 자리 (방향 d마다, 차지 칸 왼쪽 위 기준 px): 머리 = 베개 가운데, 기울기로 머리가 베개 쪽 */
const BED_SEATS = (
  d: number,
  w: number,
): readonly { x: number; y: number; tilt?: number }[] =>
  d === 0
    ? [
        { x: 13, y: 12 },
        { x: 35, y: 12 },
      ]
    : d === 2
      ? [
          { x: 13, y: 8, tilt: 180 },
          { x: 35, y: 8, tilt: 180 },
        ]
      : [
          { x: d === 1 ? 11 : w - 11, y: 7, tilt: d === 1 ? 90 : -90 },
          { x: d === 1 ? 11 : w - 11, y: 28, tilt: d === 1 ? 90 : -90 },
        ];

export const RURAL_CX: readonly CxRow[] = [
  {
    id: "cx_rr_cushion",
    name: "꽃무늬 방석",
    desc: "할머니가 꽃무늬 천으로 손수 지은 방석이에요.",
    price: 600,
    w: 1,
    h: 1,
    use: "앉기",
    // 바닥에 납작하게 까는 것이라 칸 전체 발밑 그늘은 깔지 않는다 (그림 안에 얇은 그늘)
    noShadow: true,
    act: {
      // 방석 가운데에 보는 쪽을 보고 앉는다 (납작해서 뒤를 봐도 방석이 사람을 가리지 않는다)
      seats: (d, w, h) => [{ x: w / 2, y: h - 7, face: d }],
    },
  },
  {
    id: "cx_rr_lamp",
    name: "등잔",
    desc: "심지에 불을 붙이면 방 안이 은은하게 일렁여요.",
    price: 640,
    w: 1,
    h: 1,
    use: "켜기·끄기",
    // 빛 자리 = 백자 등잔 불꽃 (차지 칸 아래 가운데에서 위로)
    light: { color: 0xffb860, r: 30, dx: 0, dy: -26 },
    act: {
      toggle: {
        startOn: true,
        label: ["등잔 끄기", "등잔 켜기"],
        sfx: "fireOn",
        // 켜져 있는 동안 불꽃이 두 장으로 일렁인다
        anim: { frames: ["", "f1"], ms: 240 },
      },
    },
  },
  {
    id: "cx_rr_dadumi",
    name: "다듬잇돌",
    desc: "방망이로 두드리면 또닥또닥 소리가 마루에 울려요.",
    price: 720,
    w: 2,
    h: 1,
    use: "앉아서 다듬이질하기",
    act: {
      // 돌 너머에 무릎 꿇고 앉는다 (앞을 보면 돌 뒤 · 왼쪽을 보면 오른편 · 뒤를 보면 돌 앞 · 오른쪽을 보면 왼편).
      // 앉아 있는 동안 두 손 방망이가 번갈아 오르내린다 (그림 use·f1), 앉은 채로 E = 또각 소리 + 한마디
      seats: (d, w, h) => [DADUMI_SEAT(d, w, h)],
      seatAnim: { frames: ["use", "use-f1"], ms: 260 },
      seatFx: {
        sfx: "step",
        emote: "note",
        lines: ["또닥또닥, 또닥또닥.", "빨래가 반듯하게 펴졌어요."],
      },
    },
  },
  {
    id: "cx_rr_gotgam",
    name: "곶감 걸이",
    desc: "줄줄이 꿴 곶감이 쫀득하게 말라 가요.",
    price: 800,
    w: 2,
    h: 1,
    use: "곶감 하나 빼 먹기",
    act: {
      // 먹은 개수가 남는다 (켜기 값 0..3 — 그림 s1~s3에서 오른쪽 줄 아래부터 빈다). 셋 먹은 뒤 E면 새 줄로 가득
      toggle: {
        steps: 4,
        label: ["곶감 하나 더 빼 먹기", "곶감 하나 빼 먹기"],
        labels: [
          "곶감 하나 빼 먹기",
          "곶감 하나 더 빼 먹기",
          "곶감 하나 더 빼 먹기",
          "새 곶감 줄 걸기",
        ],
        sfx: "rustle",
      },
      fx: {
        emote: "grin",
        lines: ["쫀득쫀득 달아요.", "하나만 더… 할머니한테는 비밀이에요."],
      },
      hold: { item: "gotgam", ms: 4000 },
    },
  },
  {
    id: "cx_rr_fan",
    name: "옛날 선풍기",
    desc: "버튼을 누를 때마다 바람이 세져요. 고개도 돌려요.",
    price: 960,
    w: 1,
    h: 1,
    use: "켜기·끄기",
    // 값 0 꺼짐 · 1 약 · 2 중 · 3 강 (센 바람일수록 날개가 흐릿하게) — 켜져 있으면 고개를 돌린다 (toggle.anim)
    act: {
      toggle: {
        steps: 4,
        label: ["바람 세기 바꾸기", "선풍기 켜기"],
        labels: ["선풍기 켜기", "바람 세게", "바람 더 세게", "선풍기 끄기"],
        // 켜져 있는 동안 고개를 가운데 → 왼쪽 → 가운데 → 오른쪽으로 돌린다
        anim: { frames: ["", "f1", "f2", "f3"], ms: 700 },
      },
    },
  },
  {
    id: "cx_rr_ssal",
    name: "쌀뒤주",
    desc: "뚜껑을 열면 햅쌀이 가득해요. 바닥이 보이면 안 돼요.",
    price: 1_040,
    w: 2,
    h: 1,
    use: "열기",
    act: {
      fx: {
        v: "open",
        ms: 3000,
        emote: "wow",
        sfx: "creak",
        lines: ["햅쌀이 가득해요.", "쌀 냄새가 고소해요."],
      },
    },
  },
  {
    id: "cx_rr_tv",
    name: "브라운관 TV",
    desc: "나무 받침장에 올린 옛날 TV예요. 다이얼을 돌려 채널을 바꿔요.",
    price: 1_280,
    w: 2,
    h: 1,
    use: "켜기·끄기",
    // 빛 자리 = 브라운관 화면
    light: { color: 0x9ad0ff, r: 30, dx: -3, dy: -22 },
    act: {
      // 값 0 꺼짐 · 1 색 막대 · 2 사극 · 3 일기 예보. 켤 때·돌릴 때마다 잠깐 지지직(그림 static)하다 채널이 잡힌다
      toggle: {
        steps: 4,
        label: ["채널 돌리기", "TV 켜기"],
        labels: ["TV 켜기", "채널 돌리기", "채널 돌리기", "TV 끄기"],
        sfx: "static",
        // 지지직(static) 화면이 두 장으로 번갈아 (채널 화면은 그대로)
        anim: { frames: ["", "f1"], ms: 120 },
      },
      fx: {
        v: "static",
        ms: 900,
        sfx: "tune",
        lines: ["지지직… 채널이 잡혔어요.", "안테나를 살짝 돌렸어요."],
      },
    },
  },
  {
    id: "cx_rr_bedding",
    name: "목화솜 이불 요",
    desc: "목화솜을 두툼하게 넣은 요와 이불이에요. 아랫목에 펴 두면 딱이에요.",
    price: 1_600,
    w: 3,
    h: 2,
    use: "눕기",
    // 바닥에 납작하게 까는 것이라 칸 전체 발밑 그늘은 깔지 않는다 (그림 안에 얇은 그늘)
    noShadow: true,
    act: {
      // 두 사람이 나란히 눕는다: 다홍 목단 이불이 몸을 덮는다 (덮개 = 그 자리 이불 그림 — ruralArt coverArt)
      seats: (d, w) =>
        BED_SEATS(d, w).map((s, k) => ({
          ...s,
          face: 0 as const,
          lie: true,
          cover: `cx_rr_bedding_${k}`,
        })),
    },
  },
  // ── 바닥 ──
  {
    id: "cx_rr_floor_vinyl",
    name: "반들 비닐 장판",
    desc: "노랗게 반들거리는 옛날 비닐 장판이에요.",
    price: 1_200,
    w: 1,
    h: 1,
    skin: "floor",
  },
  {
    id: "cx_rr_floor_kongdam",
    name: "콩댐 한지 장판",
    desc: "한지에 콩물을 먹여 은은하게 윤이 나는 장판이에요.",
    price: 1_800,
    w: 1,
    h: 1,
    skin: "floor",
  },
  {
    id: "cx_rr_floor_daecheong",
    name: "대청마루",
    desc: "짧은 널을 우물 정 자로 짜 맞춘 마루예요.",
    price: 1_600,
    w: 1,
    h: 1,
    skin: "floor",
  },
  // ── 벽지 ──
  {
    id: "cx_rr_wall_changho",
    name: "창호 한지 벽",
    desc: "나무 살에 창호지를 바른 벽이에요. 햇빛이 은은하게 비쳐요.",
    price: 1_400,
    w: 1,
    h: 1,
    skin: "wall",
  },
  {
    id: "cx_rr_wall_hwangto",
    name: "황토 흙벽",
    desc: "황토를 손으로 펴 바른 따뜻한 흙벽이에요.",
    price: 1_600,
    w: 1,
    h: 1,
    skin: "wall",
  },
  {
    id: "cx_rr_wall_news",
    name: "신문지 도배 벽",
    desc: "옛날 신문지로 꼼꼼히 도배한 벽이에요. 읽을거리가 많아요.",
    price: 1_000,
    w: 1,
    h: 1,
    skin: "wall",
  },
];
