import { Grid, type Color } from "./pixel";

// 11/22 손 꾸미기 크게 (운영자 「손 파츠 아이템들 다 크게 — 티가 하나도 안 난다」):
//  예전 손 꾸미기는 손 자리(hx·hY)에 3×3~5×5 점으로 찍혀 몸에 묻혔다. 이제 손 꾸미기를 전부 이 파일의 문자 그림(4~7 × 5~14)으로 다시 그려
//  ① 한 장(레이어)에 따로 그린 뒤 ② 몸 위에 얹으면서 몸과 맞닿는 둘레에 외곽선 한 줄을 둘러(스티커처럼) 몸과 갈라 보이게 하고
//  ③ 뒷모습은 앞모습 그림을 좌우로 뒤집어 반대편 손 자리에 몸 뒤로 깐다 (몸에 가린 곳은 안 보이고 옆으로 삐져나온 곳만 보인다).
//  칸(20×28) 밖으로 나가지 않게 x 1~18 · y 3~26 안으로 밀어 넣고, 눈을 가리면 옆·아래로 비켜 준다 (avatarCore가 자리를 잡는다).
//  칸을 넓히지 않은 까닭: 아바타 칸 크기(AV_W)는 시트·놀이기구·동물원·붕어빵 수레·염색 가면 등 수십 곳이 같이 쓴다 — 손 꾸미기는 칸 안에서 충분히 커진다.
//  얼죽아 컵·붕어빵 봉투(골목 수레 한정)는 처음부터 이 크기로 그려져 있어 그림은 그대로 두고(bungeoGear) 외곽선·뒷모습만 같이 쓴다.
//  우산·풍선은 시트 밖에 따로 크게 그린다 (cosmeticFx).

/** 문자 그림 하나 ('.' = 투명). grip = 손이 쥐는 칸 (그림 안 좌표) */
type Art = {
  /** 앞모습 그림. 동작 단계(hem 0·1·2)마다 다른 그림이면 여러 장 */
  rows: readonly string[] | readonly (readonly string[])[];
  pal: Readonly<Record<string, Color>>;
  grip: readonly [number, number];
  /** 옆모습 그림 (없으면 앞모습 그대로) */
  side?: { rows: readonly string[]; grip: readonly [number, number] };
  /** 뒷모습에서 보이는 면 (없으면 앞모습을 뒤집어 쓴다 — 휴대폰 뒷면처럼 앞뒤가 다른 것만) */
  back?: readonly string[];
  /** 반투명 칸 (문자 → 0~255, 없으면 불투명) */
  alpha?: Readonly<Record<string, number>>;
  /** 끈에 매달려 둥실 뜬 것 (얼굴을 비킬 때 아래보다 위로 먼저 — 소원 등불) */
  float?: boolean;
  /** 외곽선 뒤에 밝게 찍는 점 (불빛·김·반짝임) — 단계마다 [x, y, 색, 알파] 목록, 그림 안 좌표 (밖으로 나가도 된다) */
  glow?: readonly (readonly (readonly [number, number, Color, number?])[])[];
};

const steam = (x: number, y: number): (readonly [number, number, Color, number])[][] => [
  [
    [x, y - 1, 0xffffff, 150],
    [x + 1, y - 2, 0xffffff, 110],
    [x, y - 3, 0xffffff, 70],
  ],
  [
    [x + 1, y - 1, 0xffffff, 140],
    [x, y - 2, 0xffffff, 110],
    [x + 1, y - 3, 0xffffff, 60],
  ],
  [
    [x, y - 1, 0xffffff, 120],
    [x, y - 2, 0xffffff, 90],
    [x - 1, y - 3, 0xffffff, 60],
  ],
];

// 공통 색
const EYE = 0x2a1e1a;
const SILVER_HI = 0xf4f6fa;
const SILVER = 0xc8ccd8;
const SILVER_LO = 0x7c8294;

export const HELD_ART: Readonly<Record<string, Art>> = {
  // ── 처음 상점 ──
  hand_lantern: {
    // 손등불: 쇠 고리에 매단 나무 틀 등불 (창 셋에 따뜻한 불빛)
    rows: [".kkk.", ".k.k.", "RRRRr", "wYyYd", "wyOyd", "wYyYd", "rrrrr", ".r.r."],
    pal: { k: 0x3a3127, R: 0x8a6a44, r: 0x4a3424, w: 0x7a5a38, d: 0x4a3424, Y: 0xffe9a8, y: 0xffc860, O: 0xfff6d0 },
    grip: [2, 1],
    glow: [[[2, 4, 0xfffbe8]], [[2, 4, 0xffe9a8]]],
  },
  hand_coffee: {
    // 아이스 아메리카노: 흰 뚜껑 + 초록 빨대 + 얼음 동동 + 크라프트 슬리브
    rows: ["...G.", "...g.", "lLLLl", "aIccA", "accIA", "kKKKk", "kKKKk", "acIcA", ".aCA."],
    pal: { G: 0x6ad89a, g: 0x3aa86a, l: 0xc8ccd4, L: 0xf8f8f8, a: 0xd2e2ee, A: 0x9ab0c4, I: 0xe8f6fc, c: 0x5a3420, C: 0x3e2414, k: 0x9a6c3a, K: 0xc89a6a },
    grip: [2, 6],
  },
  hand_briefcase: {
    // 서류 가방: 손잡이를 쥐고 늘어뜨린 갈색 가죽 가방 + 금 잠금쇠
    rows: ["..HHH..", ".H...H.", "TTTTTTt", "bbbGbbd", "bbbgbbd", "ddddddd"],
    pal: { H: 0x3a2414, T: 0xb08050, t: 0x8a5a32, b: 0x8a5a32, d: 0x5a3420, G: 0xf2c43a, g: 0xb88a22 },
    grip: [3, 1],
  },
  hand_phone: {
    // 스마트폰: 파란 화면 + 빨간 알림 (뒷면은 카메라 점)
    rows: ["...rr", "kkkrr", "kSSsk", "ksSsk", "kSssk", "kSSsk", "kkKkk"],
    back: [".....", "kkkkk", "kKkkk", "kkkkk", "kkkkk", "kkkkk", "kkkkk"],
    pal: { k: 0x2a2a34, K: 0x6a6a78, S: 0x9ad8ff, s: 0x5aa8e0, r: 0xff4a5a },
    grip: [2, 5],
    glow: [[], [[1, 3, 0xe0f6ff], [2, 3, 0xe0f6ff]], []],
  },
  hand_lantern_blue: {
    // 도깨비 등롱: 짙은 뚜껑 + 청록 종이 + 푸른 도깨비불
    rows: ["..k..", ".KKK.", "bBcBb", "BcCcB", "BcCcB", "bBcBb", ".KKK.", "..t.."],
    pal: { k: 0x2a3a4a, K: 0x2a3a4a, b: 0x1e4a5c, B: 0x3a7a90, c: 0x8ae8ff, C: 0xd8fcff, t: 0x4ab0c8 },
    grip: [2, 1],
    glow: [[[2, 4, 0xffffff]], [[2, 3, 0xffffff]], [[2, 4, 0xeafcff]]],
  },
  hand_donut: {
    // 도넛: 분홍 아이싱 + 알록달록 스프링클 + 가운데 구멍
    rows: [".pPPP.", "pPsPyq", "PP..Pq", "DPwPqd", ".DDdd."],
    pal: { p: 0xffbcd4, P: 0xf08ab0, q: 0xc8608a, s: 0x8ad8ff, y: 0xffe066, w: 0xffffff, D: 0xdca462, d: 0xa8703a },
    grip: [2, 3],
  },
  hand_clipboard: {
    // 결재판: 갈색 판 + 은 집게 + 흰 서류 줄글 + 빨간 도장
    rows: ["..sS..", "bsSSsB", "bwwwwB", "bllllB", "bwwwwB", "bllwRB", "bbbbbB"],
    back: ["..sS..", "bsSSsB", "bbbbbB", "bbbbbB", "bbbbbB", "bbbbbB", "bbbbbB"],
    pal: { b: 0xb07a3e, B: 0x7a4a22, s: 0x8a8e9c, S: 0xd8dce6, w: 0xf8f6ee, l: 0x9a9488, R: 0xe04040 },
    grip: [1, 4],
  },
  hand_mic: {
    // 마이크: 은색 그릴 공 + 은 띠 + 까만 손잡이
    rows: [".Hh.", "HhsS", "hsSS", ".rr.", ".kK.", ".kK.", ".kK.", ".K.."],
    pal: { H: 0xf2f2fa, h: 0xc0c0d0, s: 0x8a8a98, S: 0x5a5a68, r: 0x9a9aa8, k: 0x2e2e38, K: 0x18181e },
    grip: [1, 6],
  },
  hand_bouquet: {
    // 꽃다발: 빨강·노랑·분홍·흰 꽃 + 잎 + 크림 포장지 + 분홍 리본
    rows: [".Rr.Pp", "rrWypp", "gwwYyg", ".gGgG.", ".cCCc.", ".ccCc.", "..bB..", "..cC..", "...c.."],
    pal: { R: 0xff6a7a, r: 0xe84a5a, P: 0xffc0d8, p: 0xff8ab8, W: 0xffffff, w: 0xe4e4ee, Y: 0xfff08a, y: 0xffd04a, g: 0x4a9a42, G: 0x86c86a, c: 0xf6e8cc, C: 0xd8c4a0, b: 0xff7aa0, B: 0xd04a7c },
    grip: [2, 6],
  },
  hand_wand: {
    // 요술봉: 큰 금별 + 분홍 리본 + 분홍 줄무늬 막대 (별이 반짝)
    rows: ["..Y..", ".YWY.", "YYwYy", ".YYy.", ".y.y.", ".bpb.", "..p..", "..P..", "..p..", "..P.."],
    pal: { Y: 0xffe066, W: 0xfffbe0, w: 0xfff2a0, y: 0xe0a830, b: 0xff7ab0, p: 0xd88ab8, P: 0xf4c0dc },
    grip: [2, 8],
    glow: [
      [[2, 1, 0xffffff]],
      [
        [2, 1, 0xfffbe0],
        [4, 0, 0xfffbe0, 200],
      ],
      [
        [2, 2, 0xffffff],
        [0, 0, 0xfffbe0, 180],
      ],
    ],
  },
  // ── 말랑 묶음 ──
  hand_bungeo: {
    // 붕어빵: 왼쪽을 보는 노릇한 물고기 빵 (비늘 무늬 · 갈라진 꼬리 · 점 눈)
    rows: ["..hhh.T", ".hfFfTT", "hefFfT.", ".fFfFTT", "..LLL.T"],
    pal: { h: 0xf4c878, f: 0xdc9c48, F: 0xb87430, L: 0x9a5a20, e: 0x4a2a14, T: 0xc88438 },
    grip: [3, 3],
  },
  hand_plush: {
    // 곰돌이 인형: 동그란 귀 · 점 눈 · 크림 주둥이 · 분홍 리본 · 크림 배
    rows: ["ll..ll", "lffffl", "fkffkf", "fcnncf", ".pPPp.", "lffffl", "lfccfl", "lf..fl"],
    pal: { f: 0xc8905a, l: 0xa06a3a, c: 0xf6e4c4, k: EYE, n: 0x5a3a2a, p: 0xff7aa0, P: 0xffb0c8 },
    grip: [1, 5],
  },
  hand_dango: {
    // 삼색 경단 꼬치: 분홍 · 하양 · 연두 동그란 경단 셋 + 나무 꼬치
    rows: ["..s..", ".hpp.", "hpppq", ".pqq.", ".HWW.", "HWWWV", ".WVV.", ".jgg.", "jgggG", ".gGG.", "..s..", "..S..", "..s.."],
    pal: { s: 0xd0a868, S: 0xa07840, h: 0xffd8e6, p: 0xf8a8c0, q: 0xe080a0, H: 0xffffff, W: 0xfbf6ee, V: 0xe2d8cc, j: 0xd8f0b0, g: 0xb8e08a, G: 0x8ac060 },
    grip: [2, 11],
  },
  // ── 테마 묶음 ──
  hand_mug: {
    // 캠핑 머그: 손잡이를 쥔 하늘빛 법랑 컵 (남색 테두리 · 하얀 점) + 코코아 + 김
    rows: ["..nnnn", "..oOOn", "nnhbbB", "n.wbbB", "n.hbwB", "nnhbbB", "..BBBB"],
    pal: { n: 0x2a4a7a, o: 0x8a5232, O: 0x6a3a1e, h: 0xa8d8f4, b: 0x7ab8e0, B: 0x4a88b8, w: 0xf4fbff },
    grip: [1, 4],
    glow: steam(3, 0),
  },
  hand_icecream: {
    // 아이스크림 콘: 체리 + 딸기 한 스쿱 + 바닐라 한 스쿱 + 와플 콘
    rows: ["..c..", ".pPp.", "pPppq", ".qpq.", ".vVv.", "vVvvu", ".uvu.", "kKkKk", ".KkK.", "..k.."],
    pal: { c: 0xe02a3a, p: 0xff9ab8, P: 0xffc8d8, q: 0xe0708e, v: 0xfff4dc, V: 0xfffcf2, u: 0xe8d0a8, k: 0xe0a860, K: 0xb07a3a },
    grip: [2, 8],
  },
  // ── 크리스마스 ──
  xm_cane: {
    // 별 지팡이 사탕: 빨강·하양 줄무늬 굵은 지팡이 + 바깥으로 굽은 손잡이 + 금별 (별빛은 xmasFx xCane)
    rows: ["....Y.", "...YWY", "....y.", "..rwr.", ".wr.wr", "wr...w", "rw....", "wr....", "rw....", "wr....", "rw....", "wr...."],
    pal: { r: 0xd42c3c, w: 0xfbf8f2, Y: 0xf2c84a, W: 0xfff2b0, y: 0xb88a22 },
    grip: [1, 9],
    glow: [[[4, 1, 0xfffbe0]], [[4, 1, 0xfff2b0]]],
  },
  // ── 계절 한정 ──
  sc_goguma: {
    // 군고구마 봉투: 크라프트 봉투 위로 삐죽 나온 군고구마 둘 (노란 속) + 김
    rows: [".II...", ".YyII.", "YYyYyy", "HhHhHh", "kkkkkL", "kkkkkL", "kkkkLL", ".LLLL."],
    pal: { I: 0xf8c650, Y: 0x8a3a66, y: 0x5e2446, H: 0xe8c48a, h: 0xcf9f5c, k: 0xcf9f5c, L: 0x9a6c36, R: 0xd63a3a },
    grip: [2, 4],
    glow: steam(1, 0),
  },
  si_cookie: {
    // 진저브레드 쿠키: 하얀 아이싱 눈·단추, 빨간 사탕 단추
    rows: ["..hbB..", ".hwbwB.", "..bbB..", "hbbwbbB", ".BbrbB.", "..bwb..", ".hb.bB.", ".BB.BB."],
    pal: { b: 0xb86a32, h: 0xdc8e4c, B: 0x8a4a22, w: 0xfff6ec, r: 0xd63a3a },
    grip: [1, 3],
  },
  of_drink: {
    // 에너지 드링크: 까만 캔 + 연두 번개 무늬 + 은 테 (연두빛은 seasonSetFx2 ssDrink)
    rows: ["RrrrQ", "kkLLK", "kLLkK", "LLLLK", "kkLkK", "kLkkK", "QQQQQ"],
    pal: { R: 0xf4f6fa, r: 0xc8ccd6, Q: 0x8a8e9a, k: 0x22242c, K: 0x15161c, L: 0x9cff3a },
    grip: [1, 4],
    glow: [[[2, 3, 0xd8ff9a]], [[3, 1, 0xd8ff9a]], [[1, 5, 0xd8ff9a]]],
  },
  gk_firefly: {
    // 반딧불 유리병: 끈 고리 + 코르크 + 밤빛 유리병 속 반딧불 셋 (빛은 seasonSetFx2 ssJar)
    rows: [".sss.", ".hcl.", "HGGGg", "HiFiI", "GiiFI", "GFiiI", "gIIIg"],
    pal: { s: 0x5a4632, h: 0xcca070, c: 0xa8784a, l: 0x7a5232, H: 0xe8fbff, G: 0x9fd0dc, g: 0x6a9aa8, i: 0x2c4c58, I: 0x3a6270, F: 0xfff27a },
    grip: [2, 0],
    glow: [
      [
        [2, 3, 0xffffe0],
        [3, 4, 0xffffe0],
        [6, -1, 0xfff27a, 220],
      ],
      [
        [1, 5, 0xffffe0],
        [6, 0, 0xfff27a, 200],
      ],
      [
        [2, 3, 0xffffe0],
        [1, 5, 0xffffe0],
        [5, -2, 0xfff27a, 210],
      ],
    ],
  },
  sm_pouch: {
    // 복주머니: 다홍 비단 주머니 + 금 끈 매듭 + 금 무늬
    rows: [".y...y.", "..yYy..", "..hdd..", ".hdddl.", "hdyyydl", "hdyYydl", "hddyddl", ".ddlll."],
    pal: { y: 0xf2c84a, Y: 0xfff2b0, h: 0xff7c64, d: 0xe24a3c, l: 0xa82a28 },
    grip: [3, 2],
  },
  vc_chocobox: {
    // 의리 초콜릿 상자: 빨간 하트 상자 + 금 리본 (매듭 고리 둘)
    rows: [".Gg.gG.", ".hhgrr.", "hhrgrrl", "hrrgrrl", ".rrgrl.", "..rgl..", "...l..."],
    pal: { h: 0xff7076, r: 0xe0323e, l: 0x9c1c2a, g: 0xf6cc4a, G: 0xfff2b0 },
    grip: [3, 3],
    glow: [[[1, 2, 0xffd0d4]], [[1, 2, 0xffffff]]],
  },
  sp_gimbap: {
    // 김밥 도시락: 민트 통 + 김밥 단면 줄줄이 + 젓가락
    rows: ["......o", ".....O.", "mmmmmOM", "mwykwcM", "mskwekM", "MMMMMMM"],
    pal: { o: 0xe0b878, O: 0xc89a5a, m: 0x6ccab2, M: 0x3e9a86, k: 0x26322a, w: 0xf4f0e4, y: 0xf8d24a, c: 0xff8a4a, s: 0x5ab84a, e: 0xf8d24a },
    grip: [2, 3],
  },
  sd_baton: {
    // 계주 바통: 비스듬히 쥔 굵은 빨간 바통 + 가운데 흰 테이프
    rows: [".....Rr", "....Rrl", "...Rrl.", "..wwd..", ".Rrl...", "Rrl....", "rl....."],
    pal: { R: 0xff7a6a, r: 0xe03a3a, l: 0xa02028, w: 0xf8f8f4, d: 0xd8d8d0 },
    grip: [3, 3],
  },
  ye_mic: {
    // 애창곡 마이크: 은색 그릴 공 + 분홍 불빛 테 + 금빛 손잡이 (불빛은 seasonSetFx3 ssMic)
    rows: [".Hs.", "HsSl", "sSsl", ".ll.", "PppQ", ".Gg.", ".Gg.", ".Gk.", "..k."],
    pal: { H: SILVER_HI, s: SILVER, S: 0xa8aebc, l: SILVER_LO, P: 0xffb8dc, p: 0xff5aa8, Q: 0xc83a80, G: 0xfff0a0, g: 0xf0c040, k: 0xa8761c },
    grip: [1, 6],
    glow: [[[0, 4, 0xffe0f0]], [[1, 4, 0xffe0f0]], [[2, 4, 0xffe0f0]]],
  },
  su_flask: {
    // 믹스커피 보온병: 빨간 컵 뚜껑 + 은빛 몸 + 노란 믹스커피 띠 + 김
    rows: ["RrrQ", ".rQ.", "Hsst", "Hsst", "yyyY", "Hsst", "Hsst", ".tt."],
    pal: { R: 0xf06050, r: 0xd8463a, Q: 0xa02e2e, H: 0xf4f8fc, s: 0xc8d0dc, t: 0x8a94a4, y: 0xf2c84a, Y: 0xc89a2a },
    grip: [1, 5],
    glow: steam(1, 0),
  },
  rs_shake: {
    // 단백질 쉐이크: 까만 뚜껑 고리 + 거품 + 초코 쉐이크 통 + 눈금
    rows: [".KK.", "KkkC", "bffB", "HccL", "HccL", "HwcL", "HccL", ".LL."],
    pal: { K: 0x50505e, k: 0x2a2a32, C: 0x18181e, b: 0xe4eef6, f: 0xe8d0b0, B: 0xc8a888, H: 0xc08a5c, c: 0x8a5634, L: 0x5e3820, w: 0xe4eef6 },
    grip: [1, 5],
  },
  ic_rod: {
    // 빙어 낚싯대: 코르크 손잡이 + 빨강·하양 낚싯대 + 줄 끝에서 파닥이는 빙어 (꼬리가 단계마다 흔들린다)
    rows: [
      ["...wL.", "..r.L.", "..w.L.", ".r..L.", ".w.beb", "r..sss", "w..sws", "C..sss", "C..b.b", "c....."],
      ["...wL.", "..r.L.", "..w.L.", ".r..L.", ".w.beb", "r..sss", "w..sws", "C..sss", "C...bb", "c....."],
      ["...wL.", "..r.L.", "..w.L.", ".r..L.", ".w.beb", "r..sss", "w..sws", "C..sss", "C..bb.", "c....."],
    ],
    pal: { r: 0xe23a40, w: 0xf6f6f6, C: 0xc89a62, c: 0x9a7040, L: 0xdfe6ee, s: 0xb8d4e6, b: 0x5a84a4, e: 0x1a2a3a },
    alpha: { L: 200 },
    grip: [0, 8],
    glow: [[[4, 6, 0xffffff]], [[4, 6, 0xffffff]]],
  },
  // ── 운영자 전용 ──
  staff_ledger: {
    // 저승 명부: 검은 표지 + 붉은 제목 띠 + 금실 묶음 + 종이 끝
    rows: ["bkkkp", "gkRkp", "bkRkp", "gkRkp", "bkkkp", "gkkkp", "bbbbp"],
    pal: { b: 0x3a3446, k: 0x1e1c24, R: 0xc83a3a, p: 0xe8e0d0, g: 0xc8a860 },
    grip: [1, 4],
  },
  staff_lamp: {
    // 저승 등불: 검은 덮개 + 흰 종이 네모 초롱 + 푸른 불빛
    rows: ["..k..", "kkkkk", "wWcWw", "WcCcW", "WcCcW", "wWcWw", "kkkkk", ".k.k."],
    pal: { k: 0x2a2a34, W: 0xeef4fa, w: 0xc8d4e0, c: 0x9af0ff, C: 0xd8faff },
    grip: [2, 1],
    glow: [[[2, 4, 0xffffff]], [[2, 3, 0xffffff]]],
  },
  // ── 수집 의뢰 · 초대 보상 ──
  q_hand_net: {
    // 채집망: 대나무 자루 + 초록 고리 + 반투명 그물 + 그물 자루에 잡힌 주황 나비
    rows: ["..RRr..", ".RmmmR.", "RmmmmmR", ".rmmmr.", "..rpr.m", "...pmOm", "...pmom", "...P.m.", "...p...", "...p...", "...P...", "...p...", "...p...", "...P..."],
    pal: { R: 0x7ae0a0, r: 0x2e9a62, m: 0xf2f8f4, O: 0xff8a2a, o: 0xffb84a, p: 0xd0a868, P: 0x94703e },
    alpha: { m: 120 },
    grip: [3, 12],
  },
  q_hand_brush: {
    // 발굴 붓: 부채꼴 솔 + 놋쇠 고리 + 나무 자루
    rows: ["f.F.f", "fFFFd", "fFFFd", ".fFd.", ".bBb.", "..w..", "..w..", "..w..", "..W.."],
    pal: { F: 0xfff0c8, f: 0xe4cc90, d: 0xc8a870, b: 0xe0b040, B: 0xf8dc80, w: 0x8a5a32, W: 0x5a3820 },
    grip: [2, 6],
  },
  q_hand_wishlamp: {
    // 새해 소원 등불: 손에 쥔 끈 위로 둥실 뜬 귤빛 한지 풍등 (안쪽 불빛은 cosmeticFx qWishGlow)
    rows: [".rrrrr.", "oOYYYOd", "oOYWYOd", "oOYYYOd", ".OOYOd.", "..dkd..", "...s...", "...s...", "...s..."],
    pal: { r: 0xb83a2a, o: 0xffc070, O: 0xf0903a, d: 0xc85a1a, Y: 0xffd27a, W: 0xfff6d0, k: 0x6a3a1a, s: 0xe8d8b0 },
    grip: [3, 8],
    float: true,
    side: { rows: [".rrrr.", "oOYYOd", "oYWYOd", "oOYYOd", ".OYOd.", "..dkd.", "...s..", "...s..", "...s.."], grip: [3, 8] },
    glow: [[[3, 2, 0xfffbe8]], [[3, 2, 0xffe6a0]]],
  },
  inv_hand_lantern: {
    // 마중 등불: 대나무 손잡이 + 둥근 연분홍 초롱 + 겹친 하트 둘 (빨강·금빛, 빛은 cosmeticFx qWishGlow)
    rows: ["..kkk..", ".pPPPp.", "pRPRPPq", "pRRGPGq", "pPRGGGq", ".pPPGq.", "..kkk..", "...b...", "...b...", "...B..."],
    pal: { k: 0x8a5a2e, p: 0xfde0e4, P: 0xf8cad0, q: 0xe89aa8, R: 0xe0485a, G: 0xffd27a, b: 0xc8a060, B: 0x9a7438 },
    grip: [3, 8],
    glow: [[[4, 4, 0xfff2c8]], [[2, 3, 0xffb0a0]]],
  },
};

/** 이 파일이 그리는 손 꾸미기인지 */
export function hasHeldArt(id: string | null | undefined): boolean {
  return !!id && !!HELD_ART[id];
}

const rowsOf = (a: Art, phase: number): readonly string[] => {
  const r = a.rows;
  return typeof r[0] === "string" ? (r as readonly string[]) : (r as readonly (readonly string[])[])[phase % r.length];
};

/** 그림 한 장 (앞·옆·뒤, 동작 단계) */
export function heldSprite(id: string, view: "down" | "side" | "up", phase: number): { rows: readonly string[]; grip: readonly [number, number]; art: Art } | null {
  const a = HELD_ART[id];
  if (!a) return null;
  if (view === "side" && a.side) return { rows: a.side.rows, grip: a.side.grip, art: a };
  if (view === "up" && a.back) return { rows: a.back, grip: a.grip, art: a };
  return { rows: rowsOf(a, phase), grip: a.grip, art: a };
}

/** 손 꾸미기를 놓는 칸 안 범위 (둘레에 외곽선 한 칸이 들어가야 한다 — seasonSetBounds 테스트와 같다) */
export const HELD_X0 = 1;
export const HELD_X1 = 18;
export const HELD_Y0 = 3;
export const HELD_Y1 = 26;

/**
 * 그림 왼쪽 위 자리: 손 자리(hx, hY)에 grip을 맞추고 칸 안으로 밀어 넣은 뒤, 눈을 가리면 바깥(오른쪽)·아래로 비켜 준다.
 * eyes = 이 프레임의 눈 칸 (가리면 안 되는 칸)
 */
export function heldOrigin(rows: readonly string[], grip: readonly [number, number], hx: number, hY: number, eyes: readonly (readonly [number, number])[], float = false): { x: number; y: number } {
  const w = Math.max(...rows.map((r) => r.length));
  const h = rows.length;
  const clampX = (x: number) => Math.max(HELD_X0, Math.min(HELD_X1 - w + 1, x));
  const clampY = (y: number) => Math.max(HELD_Y0, Math.min(HELD_Y1 - h + 1, y));
  const x0 = clampX(hx - grip[0]);
  const y0 = clampY(hY - grip[1]);
  const hits = (ox: number, oy: number) =>
    eyes.some(([ex, ey]) => {
      const c = rows[ey - oy]?.[ex - ox];
      return c !== undefined && c !== ".";
    });
  if (!hits(x0, y0)) return { x: x0, y: y0 };
  // 가까운 자리부터: 바깥(오른쪽) → 아래 → 위 (띄운 등불처럼 위로 비켜야 하는 것도 있다)
  let best: { x: number; y: number; cost: number } | null = null;
  for (let dy = -5; dy <= 8; dy++)
    for (let dx = 0; dx <= 3; dx++) {
      const x = clampX(x0 + dx);
      const y = clampY(y0 + dy);
      const cost = x - x0 + Math.abs(y - y0) * (y < y0 === float ? 1 : 1.3);
      if ((!best || cost < best.cost) && !hits(x, y)) best = { x, y, cost };
    }
  return best ? { x: best.x, y: best.y } : { x: x0, y: y0 };
}

/** 그림을 레이어(빈 그리드)에 칠한다 */
export function paintHeld(layer: Grid, rows: readonly string[], art: Art, ox: number, oy: number): void {
  rows.forEach((r, j) =>
    [...r].forEach((ch, i) => {
      const c = art.pal[ch];
      if (ch === "." || c === undefined) return;
      layer.set(ox + i, oy + j, c, art.alpha?.[ch] ?? 255);
    }),
  );
}

/** 외곽선 뒤에 밝게 찍는 점 (칸 안만) */
export function heldGlowDots(art: Art, phase: number): readonly (readonly [number, number, Color, number?])[] {
  const g = art.glow;
  return g && g.length ? g[phase % g.length] : [];
}

/**
 * 레이어를 몸 위에 얹는다.
 * front: 손 꾸미기가 몸 앞 — 레이어를 덮고, 몸과 맞닿는 둘레 칸(몸이 칠해진 칸)에 외곽선 색을 둘러 갈라 보이게 한다.
 * behind: 뒷모습 — 몸이 없는 칸에만 칠하고, 몸과 맞닿는 칸은 외곽선 색 (몸 테두리가 꾸미기 위로 지나간다).
 */
export function stampHeld(g: Grid, layer: Grid, line: Color, mode: "front" | "behind"): void {
  const solid = (x: number, y: number) => (layer.get(x, y) & 255) >= 128;
  const near = (x: number, y: number, f: (x: number, y: number) => boolean) => f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1);
  if (mode === "behind") {
    // 몸과 맞닿는 칸은 (반투명 그물이라도) 몸 테두리 색 — 몸 외곽선이 끊기지 않게
    const body = (x: number, y: number) => g.filled(x, y);
    const put: [number, number, number][] = [];
    for (let y = 0; y < layer.h; y++)
      for (let x = 0; x < layer.w; x++) {
        const v = layer.get(x, y);
        if ((v & 255) === 0 || g.filled(x, y)) continue;
        put.push([x, y, near(x, y, body) ? Grid.rgba(line) : v]);
      }
    for (const [x, y, v] of put) g.px[y * g.w + x] = v;
    return;
  }
  const ring: [number, number][] = [];
  for (let y = 0; y < layer.h; y++)
    for (let x = 0; x < layer.w; x++) if (!solid(x, y) && g.filled(x, y) && near(x, y, solid)) ring.push([x, y]);
  for (let y = 0; y < layer.h; y++)
    for (let x = 0; x < layer.w; x++) {
      const v = layer.get(x, y);
      const a = v & 255;
      if (!a) continue;
      if (a >= 255 || !g.filled(x, y)) g.px[y * g.w + x] = v;
      else {
        // 반투명 칸(그물)은 몸 색에 섞는다
        const d = g.get(x, y);
        const t = a / 255;
        const mixc = (s: number) => Math.round((((d >>> 8) >> s) & 255) * (1 - t) + (((v >>> 8) >> s) & 255) * t) << s;
        g.px[y * g.w + x] = Grid.rgba((mixc(16) | mixc(8) | mixc(0)) >>> 0, d & 255);
      }
    }
  for (const [x, y] of ring) g.set(x, y, line);
}
