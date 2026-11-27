import type { CxDir, CxRow, CxSeat } from "./types";

// 11/27 펜션 전용 가구 8 · 바닥 3 · 벽지 3 — 소슬댁만 팔고, 펜션 주인만 사고, 펜션에만 놓는다.
//
// ── 그림·동작 (이 파일 + game/housing/campExclusive/pensionArt.ts 두 개만) ──
//  - 이름·값·칸(w·h)·id는 확정이라 그대로 둔다 (서버 값·점수·테스트가 이것을 본다).
//  - act: 상호작용 선언 (types.ts CxAct). 자리(seats) 좌표는 그림(pensionArt — 운영자 확인한 시안)에 맞춘 방향마다의 발 위치.
//    보드게임 탁자는 둘레 빈 칸 앉기(around — 밥상 규칙), 6인 식탁은 그림 속 의자 셋·긴 벤치에 여섯 자리. 체크무늬 러그는 바닥층(rug)이라 빈 칸에 앉는다.
//  - 그림 변형 이름(fx.v "low"·"taken"·"roll1"·"sing", 켜짐 "on")은 pensionArt 머리말과 맞춘다.
//  - 밤 빛(light)의 색·반지름도 여기서 (켜기·끄기 가구는 켜졌을 때만).

/**
 * 6인 식탁 자리 줄: 긴 쪽 64px에 21px 간격 셋 (pensionArt PN_DINE_SEATS와 같은 값 — 의자 등받이·접시가 이 줄에 그려져 있다).
 * 앞(0): 먼 쪽 의자(아래를 봄, 칸 위 끝 +8) · 가까운 쪽 벤치(위를 봄, 아래 끝 −3)
 * 뒤(2): 먼 쪽 벤치(+4) · 가까운 쪽 의자(−4) — 사람이 의자 등받이 앞에 그려진다 (시안 그대로)
 * 옆(1 왼쪽을 봄): 벤치 = 왼쪽(오른쪽을 보고 x 4) · 의자 = 오른쪽(왼쪽을 보고 x w−6), 자리 줄 + 4. 오른쪽을 봄(3)은 좌우 반대
 */
export const PN_DINE_SEATS = [11, 32, 53] as const;

/**
 * 흔들의자 한 바퀴 (그림 pensionArt rockTilt — 기울기 k: 가운데 → 뒤로 1 → 뒤로 2 → 뒤로 1 → 가운데 → 앞으로 1 → 앞으로 2 → 앞으로 1).
 * 장면 길이는 사인 흔들림(진폭 2, 한 바퀴 2.4초)이 그 장면 칸(k ± 0.5)에 머무는 시간: 끝(±2)은 길고 가운데는 짧다 → 끝에서 느려지는 흔들림
 */
export const ROCK_K = [0, 1, 2, 1, 0, -1, -2, -1] as const;
export const ROCK_FRAMES = ROCK_K.map((k) => (k > 0 ? `b${k}` : k < 0 ? `w${-k}` : ""));
export const ROCK_MS = ROCK_K.map((k) => {
  const A = 2;
  const per = 2400 / (2 * Math.PI);
  const a = (p: number) => Math.asin(Math.max(-1, Math.min(1, p / A)));
  const m = Math.abs(k);
  // 가운데 칸 [−0.5, 0.5] 한 번 지나기 · 1칸 [0.5, 1.5] · 끝 칸 [1.5, 2] 갔다 오기
  const rad = m === 0 ? 2 * a(0.5) : m === 1 ? a(1.5) - a(0.5) : 2 * (Math.PI / 2 - a(1.5));
  return Math.round(rad * per);
});
/** 등받이 윗끝이 받침 점에서 이만큼 위 (pensionArt ROCK_PIVOT.top) — 옆모습 기울기 atan(k / 22.5) */
const ROCK_TOP = 22.5;
/**
 * 앉은 사람 자리 (장면 i, 놓인 방향 d): 옆을 보면 의자와 같은 각도로 발(자리) 둘레를 기운다 (왼쪽을 보면 뒤로 젖힐 때 시계 방향, 오른쪽은 반대),
 * 앞을 보면 뒤로 젖힐 때 1px 위·앞으로 1px 아래, 뒤를 보면 반대 (의자 앉는 판·등받이와 같은 1px)
 */
export function rockSitPose(d: CxDir, i: number): readonly [number, number, number] {
  const k = ROCK_K[i % ROCK_K.length];
  if (d === 1 || d === 3) return [0, 0, (d === 1 ? 1 : -1) * ((Math.atan(k / ROCK_TOP) * 180) / Math.PI)];
  const s = Math.sign(k);
  return [0, d === 0 ? -s : s, 0];
}
function longTableSeats(d: CxDir, w: number, h: number): CxSeat[] {
  const out: CxSeat[] = [];
  for (const c of PN_DINE_SEATS) {
    if (d === 0) out.push({ x: c, y: 8, face: 0 }, { x: c, y: h - 3, face: 2 });
    else if (d === 2) out.push({ x: c, y: 4, face: 0 }, { x: c, y: h - 4, face: 2 });
    else if (d === 1) out.push({ x: 4, y: c + 4, face: 3 }, { x: w - 6, y: c + 4, face: 1 });
    else out.push({ x: w - 4, y: c + 4, face: 1 }, { x: 6, y: c + 4, face: 3 });
  }
  return out;
}

export const PENSION_CX: readonly CxRow[] = [
  {
    id: "cx_pn_firewood",
    name: "자작나무 장작 바구니",
    desc: "하얀 자작나무 장작을 바구니 가득 쌓아 뒀어요.",
    price: 600,
    w: 1,
    h: 1,
    use: "장작 꺼내기",
    act: {
      // 바구니 장작이 줄어든 그림(low) + 손에 장작 한 토막
      fx: {
        v: "low",
        ms: 4000,
        emote: "fire",
        sfx: "rustle",
        lines: ["장작 한 아름 안았어요.", "자작나무 향이 은은해요."],
      },
      hold: { item: "log" },
    },
  },
  {
    id: "cx_pn_ski_rack",
    name: "스키 거치대",
    desc: "알록달록한 스키 두 쌍이 다음 겨울을 기다려요.",
    price: 720,
    w: 1,
    h: 2,
    use: "스키 꺼내 메기",
    act: {
      // 앞 빨간 스키가 빠진 그림(taken) + 어깨에 스키
      fx: {
        v: "taken",
        ms: 4000,
        emote: "wow",
        sfx: "click",
        lines: ["올겨울엔 꼭 슬로프에 갈 거예요.", "왁스칠이 반들반들해요."],
      },
      hold: { item: "ski" },
    },
  },
  {
    id: "cx_pn_check_rug",
    name: "체크무늬 러그",
    desc: "초록 타탄 체크 러그예요. 위에 다른 가구를 올려도 돼요.",
    price: 800,
    w: 3,
    h: 2,
    rug: true,
    use: "러그에 앉기",
    act: { rug: true },
  },
  {
    id: "cx_pn_rocking",
    name: "흔들의자",
    desc: "앉으면 삐걱삐걱 천천히 흔들려요.",
    price: 1_040,
    w: 1,
    h: 1,
    use: "앉기",
    // 흔들 받침 두 줄만 바닥에 닿는다 (그림 안에 발 그늘)
    noShadow: true,
    act: {
      // 방석 위 (아래 끝 −5). 뒤를 보면 양털 덮개 등받이가 사람 앞이라 발을 칸 위 끝에 올려 머리·어깨가 보이게 (펜션 소파 규칙)
      seats: (d, w, h) => [{ x: w / 2, y: d === 2 ? h - 16 : h - 5, face: d, behind: d === 2 }],
      // 앉아 있는 동안 천천히 앞뒤로 (한 바퀴 2.4초 — 끝에서 오래 머물고 가운데는 빨리 지나간다). 앉은 사람도 같은 장면에 같이 기운다
      seatAnim: { frames: ROCK_FRAMES, ms: ROCK_MS, sitPose: rockSitPose },
    },
  },
  {
    id: "cx_pn_boardgame",
    name: "보드게임 탁자",
    desc: "주사위와 말이 놓인 탁자예요. 둘레에 앉아 한 판 해요.",
    price: 1_200,
    w: 2,
    h: 2,
    use: "둘러앉기 · 앉아서 주사위 굴리기",
    act: {
      // 변마다 가운데 한 자리 (그 변 칸이 모두 비어야 — 시안 4자리). 먼 쪽(위)은 칸 안 4px — 낮은 탁자가 무릎을 가린다
      around: { farIn: 6, mode: "sideCenter" },
      // 앉은 채로 E: 주사위가 굴러가는 그림(roll1). 일어나기는 X·점프·움직이기
      seatFx: {
        label: "주사위 굴리기",
        v: "roll1",
        ms: 1400,
        emote: "wow",
        sfx: "pop",
        lines: ["주사위 6! 한 칸 더 가요.", "더블이 나왔어요!", "1이 나왔어요… 다음엔 꼭."],
      },
    },
  },
  {
    id: "cx_pn_karaoke",
    name: "미러볼 노래방 기계",
    desc: "켜면 미러볼이 돌면서 방 안에 색색 불빛이 흩어져요.",
    price: 1_520,
    w: 1,
    h: 1,
    use: "켜기 · 노래하기 · 끄기",
    // 빛은 미러볼 높이 (칸 아래 가운데에서 위로 26px)
    light: { color: 0xff8ad8, r: 34, dy: -26 },
    act: {
      toggle: {
        label: ["노래방 끄기", "노래방 켜기"],
        labels: ["노래방 켜기", "노래하기"],
        sfx: "tune",
        // 켜진 동안 미러볼 반짝임·LED 띠가 번갈아 (f1)
        anim: { frames: ["", "f1"], ms: 420 },
        // 켜 둔 채로 E = 노래하기 (몇 번이든), 끄기는 X
        useWhileOn: { label: "노래하기", offLabel: "노래방 끄기" },
      },
      // 켤 때·노래할 때 거치대 마이크를 꺼내(sing — 거치대가 빈 그림) 손에 들고 한 곡
      fx: {
        v: "sing",
        ms: 4000,
        emote: "note",
        lines: ["♪ 한 곡 뽑았어요!", "100점! 앵콜!", "탬버린은 제가 맡을게요."],
      },
      hold: { item: "mic" },
    },
  },
  {
    id: "cx_pn_long_table",
    name: "원목 6인 식탁",
    desc: "의자 셋과 긴 벤치가 딸린 원목 식탁이에요. 여섯이 같이 앉아요.",
    price: 1_680,
    w: 4,
    h: 2,
    use: "앉기",
    act: { seats: longTableSeats },
  },
  {
    id: "cx_pn_stove",
    name: "펜션 장작 난로",
    desc: "연통 달린 무쇠 난로예요. 불을 지피면 방이 금세 훈훈해져요.",
    price: 2_080,
    w: 2,
    h: 2,
    use: "불 켜기·끄기",
    // 빛은 불창 높이 (칸 아래 가운데에서 위로 20px)
    light: { color: 0xff9a50, r: 56, dy: -20 },
    act: {
      toggle: {
        startOn: true,
        label: ["난로 불 끄기", "난로 불 켜기"],
        sfx: "fireOn",
        // 켜진 동안 불꽃이 일렁인다 (f1)
        anim: { frames: ["", "f1"], ms: 300 },
      },
      // 곁에 다가가면 손을 녹인다 (한 번, 멀어졌다 다시 오면 또)
      near: { r: 30, emote: "fire", lines: ["손이 사르르 녹아요.", "장작 타는 소리가 좋아요."] },
    },
  },
  // ── 바닥 ──
  {
    id: "cx_pn_floor_log",
    name: "통나무 원목 마루",
    desc: "하얗게 바랜 넓은 원목 널을 세로로 깐 마루예요.",
    price: 1_600,
    w: 1,
    h: 1,
    skin: "floor",
  },
  {
    id: "cx_pn_floor_herring",
    name: "헤링본 마루",
    desc: "짧은 널을 V자로 엇갈려 깐 마루예요.",
    price: 2_000,
    w: 1,
    h: 1,
    skin: "floor",
  },
  {
    id: "cx_pn_floor_terra",
    name: "테라코타 타일",
    desc: "구운 흙빛 타일이 따뜻하게 깔려 있어요.",
    price: 1_400,
    w: 1,
    h: 1,
    skin: "floor",
  },
  // ── 벽지 ──
  {
    id: "cx_pn_wall_plaster",
    name: "회반죽 통나무 벽",
    desc: "통나무 사이를 하얀 회반죽으로 메운 벽이에요.",
    price: 1_400,
    w: 1,
    h: 1,
    skin: "wall",
  },
  {
    id: "cx_pn_wall_snow",
    name: "눈꽃 무늬 벽지",
    desc: "청회색 바탕에 하얀 눈꽃과 뜨개 띠를 두른 벽지예요.",
    price: 1_800,
    w: 1,
    h: 1,
    skin: "wall",
  },
  {
    id: "cx_pn_wall_check",
    name: "빨간 체크 패브릭 벽",
    desc: "빨간 체크 천을 씌운 포근한 벽이에요.",
    price: 1_600,
    w: 1,
    h: 1,
    skin: "wall",
  },
];
