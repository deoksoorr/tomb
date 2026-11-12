// 사냥터(RPG) 카탈로그: 장비·포션·스킬·몬스터·사냥터·난이도. 서버(검증·보상)와 클라이언트(UI·게임)가 같이 쓴다.
import { isShopListed, itemById, ITEMS } from "@tomb/protocol";
import type { BossPhase, PatternId } from "./patterns";
import type { WeaponStyleId } from "./weapons";
// 이름은 회사 생활(월요병·야근·결재·회식)과 누구나 한 번쯤 그만둔 다짐에서 따왔다.

export const STAT_KEYS = ["str", "agi", "vit", "int", "dex", "luk"] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_LABELS: Record<StatKey, { name: string; desc: string }> = {
  str: { name: "STR", desc: "공격력 (1당 ATK +3)" },
  agi: { name: "AGI", desc: "공격속도·회피·이동속도" },
  vit: { name: "VIT", desc: "최대 HP·방어" },
  int: { name: "INT", desc: "최대 SP·스킬 위력" },
  dex: { name: "DEX", desc: "명중·공격력 조금 (벌레 잡기: 벌레가 오래 보임)" },
  luk: { name: "LUK", desc: "치명타·회피 조금 (벌레 잡기: 황금 벌레)" },
};

/** 장비·버프가 더해 주는 값 */
export type Bonus = Partial<Stats> & {
  atk?: number;
  def?: number;
  hp?: number;
  sp?: number;
  /** 초당 공격 횟수 */
  aspd?: number;
  /** % */
  crit?: number;
  hit?: number;
  flee?: number;
  /** 이동속도 px/s */
  move?: number;
};

export type GearKind = "weapon" | "armor" | "head" | "acc";
export const GEAR_SLOTS = ["weapon", "armor", "head", "acc1", "acc2"] as const;
export type GearSlot = (typeof GEAR_SLOTS)[number];
export const SLOT_LABELS: Record<GearSlot, string> = {
  weapon: "무기",
  armor: "갑옷",
  head: "머리",
  acc1: "장신구 1",
  acc2: "장신구 2",
};
export const KIND_LABELS: Record<GearKind, string> = { weapon: "무기", armor: "갑옷", head: "머리", acc: "장신구" };
export const slotKind = (slot: GearSlot): GearKind => (slot === "acc1" || slot === "acc2" ? "acc" : slot);

/** 아이콘 그림 종류 (game/rpg/icons.ts가 그린다) + 두 색 */
export type IconArt = { shape: string; main: number; accent: number };

export type GearDef = {
  id: string;
  kind: GearKind;
  name: string;
  desc: string;
  reqLevel: number;
  price: number;
  bonus: Bonus;
  art: IconArt;
  /** 무기: 기본 공격 범위 (없으면 공격 방식 style의 기본 범위, lib/rpg/weapons.ts) */
  area?: { range: number; arcDeg: number };
  /** 무기: 공격 방식 (40번 무기 특색 — 휘두르기·내려찍기·찌르기·연타·쏘기·범위 마법·던지기). 없으면 휘두르기 */
  style?: WeaponStyleId;
};

const gear = (
  id: string,
  kind: GearKind,
  name: string,
  desc: string,
  reqLevel: number,
  price: number,
  bonus: Bonus,
  art: IconArt,
  area?: GearDef["area"],
  style?: WeaponStyleId,
): GearDef => ({ id, kind, name, desc, reqLevel, price, bonus, art, ...(area ? { area } : {}), ...(style ? { style } : {}) });

const GEAR_RAW: GearDef[] = [
  // ── 무기 ──
  // 무기마다 공격 방식(style)이 다르다 (40번): 범위를 따로 적지 않으면 방식의 기본 범위
  gear("w_ruler", "weapon", "나무 자", "책상 서랍에서 나온 30cm 자. 생각보다 아프다.", 1, 30, { atk: 6 }, { shape: "ruler", main: 0xc89a5a, accent: 0x5a3e22 }, undefined, "swing"),
  gear("w_keyboard", "weapon", "기계식 키보드", "때릴 때마다 딸깍딸깍. 옆자리가 쳐다본다.", 5, 120, { atk: 15, aspd: 0.1 }, { shape: "keyboard", main: 0x3a3f4a, accent: 0xe8d9b0 }, undefined, "combo"),
  gear("w_rubber_band", "weapon", "고무줄 총", "나무젓가락과 고무줄로 만든 사무실 저격총. 멀리서 딱.", 8, 200, { atk: 18, hit: 6 }, { shape: "slingshot", main: 0xc89a5a, accent: 0xe07a6a }, undefined, "shot"),
  gear("w_duck", "weapon", "삑삑 오리 망치", "때릴 때마다 삑. 사무실 스트레스 해소용.", 10, 260, { atk: 25, crit: 5 }, { shape: "duck", main: 0xf0c83c, accent: 0xe07a2a }, undefined, "smash"),
  gear("w_marker", "weapon", "보드마커 지팡이", "회의실 화이트보드의 주인. 휘두르면 잉크가 터진다.", 12, 330, { atk: 22, int: 3, sp: 15 }, { shape: "marker", main: 0x2a5ac8, accent: 0xf2f2f2 }, undefined, "magic"),
  gear("w_monitor_arm", "weapon", "장우산 창", "비 오는 출근길의 동반자. 길고 단단해서 멀리서 찌른다.", 15, 420, { atk: 35, hit: 10 }, { shape: "spear", main: 0x9aa3ad, accent: 0x2a2e36 }, { range: 44, arcDeg: 22 }, "thrust"),
  gear("w_refactor", "weapon", "효율의 검", "같은 일을 더 적은 손짓으로 벤다.", 22, 700, { atk: 52, aspd: 0.15 }, { shape: "sword", main: 0xbcd8e8, accent: 0x5a7aa8 }, { range: 30, arcDeg: 150 }, "swing"),
  gear("w_legacy_axe", "weapon", "서류 정리 도끼", "무겁고 느리지만, 누구도 건드리지 못하던 서류 더미를 쪼갠다.", 30, 1000, { atk: 74, str: 3, aspd: -0.1 }, { shape: "axe", main: 0x8a6a4a, accent: 0xb0b8c0 }, { range: 28, arcDeg: 170 }, "smash"),
  gear("w_compiler", "weapon", "전설의 법인카드", "한도 없음. 전설로만 전해진다. 던지면 지나가는 모든 것을 긁는다.", 40, 1600, { atk: 98, crit: 8, dex: 3 }, { shape: "chip", main: 0x55704f, accent: 0xffe39a }, undefined, "card"),
  // 11/12 추가분: 공격 방식 7종이 3개씩 고루 (가격은 기존 곡선 — 대략 요구 레벨 × 35~40P, I0d 경제 기준 하루 약 200P)
  gear("w_namecard", "weapon", "명함 한 뭉치", "첫 만남에 건네던 명함. 손목 스냅으로 날리면 종이에 베인다.", 3, 70, { atk: 8, dex: 1 }, { shape: "namecard", main: 0xf2f2f2, accent: 0x3c5a8a }, undefined, "card"),
  gear("w_laser", "weapon", "레이저 포인터", "발표 화면 위 빨간 점. 가리키는 곳이 펑 터진다.", 4, 90, { atk: 9, int: 2, sp: 10 }, { shape: "marker", main: 0xe84040, accent: 0x3a3f4a }, undefined, "magic"),
  gear("w_pen", "weapon", "삼색 볼펜 창", "딸깍 소리와 함께 길게 뻗어 찌른다. 빨강·파랑·검정.", 6, 150, { atk: 16, hit: 4 }, { shape: "pen", main: 0xe8e8ec, accent: 0x2a5ac8 }, { range: 40, arcDeg: 22 }, "thrust"),
  gear("w_mouse", "weapon", "무선 마우스 너클", "더블클릭, 트리플클릭. 손이 쉬지 않는다.", 16, 500, { atk: 36, aspd: 0.15 }, { shape: "mouse", main: 0x2a2e36, accent: 0x6ad0c8 }, undefined, "combo"),
  gear("w_tie", "weapon", "회식 넥타이", "회식 3차에 머리에 묶었던 그 넥타이. 휘두르면 바람 소리가 난다.", 18, 560, { atk: 42, agi: 2 }, { shape: "tie", main: 0xc83c5a, accent: 0x2a2e48 }, { range: 32, arcDeg: 140 }, "swing"),
  gear("w_stapler", "weapon", "스테이플러 연발총", "철컥철컥. 서류 대신 적을 철해 버린다.", 20, 640, { atk: 46, hit: 8 }, { shape: "stapler", main: 0x3a3f4a, accent: 0xc8ccd2 }, undefined, "shot"),
  gear("w_giftcard", "weapon", "명절 상품권", "손을 떠나는 순간 모두가 탐낸다. 날아가며 스친 자리를 긁는다.", 24, 820, { atk: 58, crit: 6, luk: 2 }, { shape: "namecard", main: 0xe8b830, accent: 0xa83c3c }, undefined, "card"),
  gear("w_ppt", "weapon", "파워포인트 마법서", "애니메이션 효과를 넣을 때마다 폭발이 커진다.", 28, 950, { atk: 64, int: 5, sp: 40 }, { shape: "book", main: 0xd0502a, accent: 0xf2ead3 }, undefined, "magic"),
  gear("w_calculator", "weapon", "공학용 계산기", "두드릴수록 숫자가 맞아 간다. 결산 시즌의 무기.", 33, 1150, { atk: 80, aspd: 0.12, dex: 3 }, { shape: "calculator", main: 0x4a4f58, accent: 0xf0a040 }, undefined, "combo"),
  gear("w_selfie", "weapon", "워크숍 셀카봉", "단체 사진을 찍던 그 셀카봉. 끝까지 늘리면 무척 길다.", 36, 1300, { atk: 88, hit: 14, agi: 2 }, { shape: "spear", main: 0xffb0c8, accent: 0x2a2e36 }, { range: 48, arcDeg: 20 }, "thrust"),
  gear("w_tumbler", "weapon", "텀블러 캐논", "샷 추가. 멀리서 뜨겁게 맞힌다.", 42, 1800, { atk: 105, hit: 12, crit: 5 }, { shape: "tumbler", main: 0x40a050, accent: 0xf2f2f2 }, undefined, "shot"),
  gear("w_stamp", "weapon", "최종 결재 도장", "대표님 책상 위의 그 도장. 한 번 찍히면 되돌릴 수 없다.", 45, 2000, { atk: 118, str: 4, crit: 4, aspd: -0.08 }, { shape: "stamp", main: 0xa83c3c, accent: 0xe8b830 }, { range: 30, arcDeg: 170 }, "smash"),
  // ── 갑옷 ──
  gear("a_hoodie", "armor", "후드티", "회색. 모든 재택근무자의 기본 방어구.", 1, 30, { def: 3, hp: 20 }, { shape: "hoodie", main: 0x6e7076, accent: 0x4a4c52 }),
  gear("a_flannel", "armor", "체크 셔츠", "사흘째 야근 중인 사람의 갑옷.", 6, 120, { def: 7, hp: 45 }, { shape: "shirt", main: 0xa83c3c, accent: 0x3a2020 }),
  gear("a_laptop_bag", "armor", "방탄 노트북 가방", "충전기와 마우스와 희망이 들어 있다.", 12, 300, { def: 13, hp: 85 }, { shape: "bag", main: 0x2e3440, accent: 0x88c0d0 }),
  gear("a_standing_desk", "armor", "스탠딩 데스크 갑주", "서서 버티는 자세가 몸에 밴다.", 20, 600, { def: 21, hp: 140, vit: 2 }, { shape: "plate", main: 0x8a8f98, accent: 0xd0d4da }),
  gear("a_server_rack", "armor", "철제 캐비닛 아머", "서랍 여닫는 소리가 요란하다. 아무것도 안 뚫린다.", 32, 1100, { def: 31, hp: 230 }, { shape: "rack", main: 0x24282e, accent: 0x6ad07a }),
  gear("a_cardigan", "armor", "사무실 카디건", "에어컨 바람 막이. 의자 등받이에 늘 걸려 있다.", 3, 70, { def: 5, hp: 30, flee: 2 }, { shape: "hoodie", main: 0xd8c8a8, accent: 0x8a7a5a }),
  gear("a_vest", "armor", "등산 조끼", "주머니가 열두 개. 부장님 워크숍 필수품.", 9, 220, { def: 10, hp: 60, agi: 2 }, { shape: "vest", main: 0x5a8a4a, accent: 0xe8d9b0 }),
  gear("a_padding", "armor", "무릎까지 롱패딩", "출근길 영하 10도도 버틴다. 걸음은 조금 느려진다.", 16, 450, { def: 17, hp: 110, move: -4 }, { shape: "padding", main: 0x2a2e36, accent: 0x6a6e78 }),
  gear("a_suit", "armor", "면접 정장", "단추 하나까지 긴장한 옷. 입으면 운이 따른다는 소문.", 26, 850, { def: 26, hp: 180, luk: 3 }, { shape: "suit", main: 0x2a3a5a, accent: 0xf2f2f2 }),
  gear("a_hazmat", "armor", "마감 주간 방호복", "마감 주간에만 꺼내 입는다. 어떤 요청도 스며들지 않는다.", 42, 1700, { def: 40, hp: 320, vit: 3 }, { shape: "plate", main: 0xf0c83c, accent: 0x3a3f4a }),
  // ── 머리 ──
  gear("h_cap", "head", "야구모자", "머리 안 감은 날의 친구.", 1, 20, { def: 1, flee: 3 }, { shape: "cap", main: 0x3c5a8a, accent: 0xe8d9b0 }),
  gear("h_headset", "head", "노이즈캔슬링 헤드셋", "부장님 호출이 들리지 않는다.", 8, 150, { def: 3, sp: 20, int: 2 }, { shape: "headset", main: 0x2a2a30, accent: 0xc8a050 }),
  gear("h_vr", "head", "VR 고글", "앞이 더 잘 보인다고 주장한다.", 18, 380, { def: 5, hit: 12, dex: 3 }, { shape: "goggles", main: 0xe8e8ec, accent: 0x5a3e8a }),
  gear("h_crown", "head", "정시 퇴근 왕관", "딱 한 번 정시에 퇴근한 자의 증표.", 28, 800, { def: 8, luk: 5, sp: 30 }, { shape: "crown", main: 0xe8b830, accent: 0xc83c5a }),
  gear("h_glasses", "head", "블루라이트 안경", "모니터 열 시간째. 그래도 눈은 지켜 준다.", 4, 80, { def: 2, hit: 4 }, { shape: "glasses", main: 0x2a2e36, accent: 0x7ad0f0 }),
  gear("h_eyemask", "head", "점심시간 수면 안대", "12시 30분부터 1시까지는 아무도 못 깨운다.", 12, 280, { def: 4, hp: 30, flee: 4 }, { shape: "goggles", main: 0x5a3e8a, accent: 0xffb0c8 }),
  gear("h_helmet", "head", "자전거 출근 헬멧", "지옥철 대신 페달을 밟는 자의 투구.", 22, 560, { def: 7, hp: 60, agi: 2 }, { shape: "helmet", main: 0x3a9a8a, accent: 0xf2f2f2 }),
  gear("h_halo", "head", "연차 쓴 날의 후광", "아무 연락도 오지 않는 하루. 머리 위가 환하다.", 38, 1300, { def: 11, int: 4, sp: 50, luk: 3 }, { shape: "halo", main: 0xffe39a, accent: 0xe8b830 }),
  // ── 장신구 ──
  gear("c_earphones", "acc", "유선 이어폰", "꼬여 있지만 끊기지 않는다.", 1, 25, { agi: 1, flee: 2 }, { shape: "earphones", main: 0xf2f2f2, accent: 0x9aa3ad }),
  gear("c_sticker", "acc", "행운의 스티커", "노트북에 붙여 둔 고양이 스티커.", 3, 90, { luk: 4, crit: 2 }, { shape: "sticker", main: 0xffb0c8, accent: 0x5a3e4a }),
  gear("c_smartwatch", "acc", "스마트워치", "일어나라고 재촉한다. 덕분에 빠르다.", 7, 160, { agi: 3, flee: 5 }, { shape: "watch", main: 0x2a2e36, accent: 0x6ad0c8 }),
  gear("c_ide_ring", "acc", "단축키 반지", "복사·붙여넣기가 손끝에서 흐른다.", 14, 280, { dex: 4, hit: 8 }, { shape: "ring", main: 0xc8a050, accent: 0x5a8ac8 }),
  gear("c_mug", "acc", "끝없는 머그컵", "식지도 비지도 않는다.", 20, 420, { int: 3, sp: 40 }, { shape: "mug", main: 0xe8d9b0, accent: 0x6a4a30 }),
  gear("c_grass_badge", "acc", "개근 배지", "1년 내내 지각 한 번 없던 기록.", 26, 600, { str: 3, vit: 3 }, { shape: "badge", main: 0x40a050, accent: 0x205028 }),
  gear("c_lanyard", "acc", "사원증 목걸이", "삑. 출입이 허가되었습니다.", 2, 50, { hp: 15, def: 1 }, { shape: "lanyard", main: 0x3c5a8a, accent: 0xf2f2f2 }),
  gear("c_tumbler", "acc", "보온 텀블러", "아침에 담은 커피가 퇴근까지 따뜻하다.", 11, 250, { sp: 25, vit: 2 }, { shape: "tumbler", main: 0x9aa3ad, accent: 0x2a2e36 }),
  gear("c_pedometer", "acc", "만보기", "점심 산책 만 보. 다리가 가벼워진다.", 17, 380, { agi: 3, move: 6 }, { shape: "watch", main: 0xf0d050, accent: 0x2a2e36 }),
  gear("c_gold_card", "acc", "골드 카드 지갑", "포인트 적립은 생명이다.", 34, 1150, { crit: 6, luk: 4, str: 2 }, { shape: "badge", main: 0xe8b830, accent: 0x5a3e22 }),
  gear("c_bonus", "acc", "성과급 봉투", "1년을 버틴 보상. 생각보다 얇지만 든든하다.", 44, 1700, { str: 4, dex: 4, crit: 4 }, { shape: "envelope", main: 0xf2ead3, accent: 0xc83c5a }),
];

const KIND_ORDER: Record<GearKind, number> = { weapon: 0, armor: 1, head: 2, acc: 3 };
/** 종류 → 요구 레벨 순 (상점·가방 목록이 이 순서를 그대로 쓴다) */
export const GEAR: readonly GearDef[] = [...GEAR_RAW].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.reqLevel - b.reqLevel);

export const gearById = (id: string): GearDef | undefined => GEAR.find((g) => g.id === id);

// ── 포션 (쌓임, 사냥터에서 단축키로 마심) ──

export type PotionDef = {
  id: string;
  name: string;
  desc: string;
  price: number;
  hp?: number;
  sp?: number;
  /** 쓰러지면 자동으로 먹고 HP 50%로 일어난다 (한 판에 1번) */
  revive?: boolean;
  /** 단축키 (부활 쿠키는 자동) */
  key?: string;
  art: IconArt;
};

export const POTIONS: readonly PotionDef[] = [
  { id: "p_coffee", name: "커피", desc: "HP 150 회복 · 독·화상·출혈 풀기", price: 8, hp: 150, key: "Q", art: { shape: "cup", main: 0x6a4a30, accent: 0xe8d9b0 } },
  { id: "p_energy", name: "에너지드링크", desc: "SP 60 회복 · 둔화·빙결·혼란·침묵 풀기", price: 10, sp: 60, key: "E", art: { shape: "can", main: 0x3c8ac8, accent: 0xf0f0f0 } },
  { id: "p_lunchbox", name: "야근 도시락", desc: "HP 400·SP 120 회복 · 상태 이상 모두 풀기", price: 30, hp: 400, sp: 120, key: "R", art: { shape: "box", main: 0xc85a3c, accent: 0xf2ead3 } },
  { id: "p_cookie", name: "부활 쿠키", desc: "쓰러지면 자동으로 먹고 HP 50%로 일어나요 (한 판에 1번)", price: 60, revive: true, art: { shape: "cookie", main: 0xc89a5a, accent: 0x5a3e22 } },
];

export const potionById = (id: string): PotionDef | undefined => POTIONS.find((p) => p.id === id);
export const POTION_MAX_STACK = 99;
/** 같은 포션을 다시 마실 수 있을 때까지 (ms) */
export const POTION_COOLDOWN_MS = 1200;

// ── 스킬 (직업 없음: 누구나 모든 스킬을 배운다) ──

export type SkillId =
  | "refactor"
  | "hotfix"
  | "rollback"
  | "cache_hit"
  | "debugging"
  | "pair_prog"
  | "code_review"
  | "overtime"
  | "deploy"
  | "coffee_break"
  // 11/12 추가분: 이동기·원거리·끌어모으기·소환·버프·지연 폭발·보호막
  | "sprint"
  | "afk"
  | "stapler_burst"
  | "urgent_meeting"
  | "printer"
  | "team_dinner"
  | "report_bomb"
  | "auto_reply";

export type SkillDef = {
  id: SkillId;
  name: string;
  /** 한 단어 효과 */
  tag: string;
  maxLevel: number;
  reqLevel: number;
  requires?: { id: SkillId; level: number }[];
  sp: (lv: number) => number;
  cooldownMs: (lv: number) => number;
  /** 레벨별 효과 설명 */
  describe: (lv: number) => string;
  art: IconArt;
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** 스킬 수치. 게임(효과)과 UI(설명)가 같이 쓴다 */
export const SKILL_FX = {
  refactor: (lv: number) => ({ mult: 1.6 + 0.3 * lv, range: 30 }),
  hotfix: (lv: number) => ({ healPct: 0.12 + 0.05 * lv }),
  rollback: (lv: number) => ({ durMs: 1000 + 300 * lv }),
  cache_hit: (lv: number) => ({ speed: 0.2 + 0.08 * lv, durMs: 8000 }),
  debugging: (lv: number) => ({ crit: 8 * lv, durMs: 10_000 }),
  pair_prog: (lv: number) => ({ durMs: 8000 + 2000 * lv, atkPct: 0.3 + 0.1 * lv }),
  code_review: (lv: number) => ({ vuln: 0.1 * lv, slow: 0.25, durMs: 6000, radius: 70 }),
  overtime: (lv: number) => ({ atk: 0.15 * lv, hpDrainPct: 0.02, durMs: 10_000 }),
  deploy: (lv: number) => ({ mult: 1.2 + 0.25 * lv, radius: 64 }),
  coffee_break: (lv: number) => ({ spPct: 0.2 + 0.1 * lv, rootMs: 800 }),
  sprint: (lv: number) => ({ dist: 60 + 6 * lv, mult: 0.9 + 0.2 * lv, width: 16 }),
  afk: (lv: number) => ({ dist: 72, safeMs: 600 + 200 * lv }),
  stapler_burst: (lv: number) => ({ n: 3 + lv, mult: 0.6 + 0.12 * lv, range: 110 }),
  urgent_meeting: (lv: number) => ({ radius: 100, stunMs: 500 + 150 * lv, vuln: 0.05 * lv }),
  printer: (lv: number) => ({ durMs: 8000 + 1500 * lv, atkPct: 0.4 + 0.1 * lv, everyMs: 700, range: 110 }),
  team_dinner: (lv: number) => ({ aspd: 0.15 + 0.05 * lv, regenPct: 0.01 + 0.004 * lv, durMs: 10_000 }),
  report_bomb: (lv: number) => ({ mult: 2 + 0.4 * lv, radius: 46, delayMs: 800, reach: 120 }),
  auto_reply: (lv: number) => ({ shieldPct: 0.15 + 0.05 * lv, durMs: 8000 }),
} as const;

export const SKILLS: readonly SkillDef[] = [
  {
    id: "refactor",
    name: "결재판 치기",
    tag: "강타",
    maxLevel: 5,
    reqLevel: 1,
    sp: (lv) => 5 + lv,
    cooldownMs: () => 2500,
    describe: (lv) => `앞의 적 하나를 공격력의 ${pct(SKILL_FX.refactor(lv).mult)}로 내려친다.`,
    art: { shape: "sk_slash", main: 0xbcd8e8, accent: 0x5a7aa8 },
  },
  {
    id: "hotfix",
    name: "급한 불 끄기",
    tag: "회복",
    maxLevel: 5,
    reqLevel: 2,
    sp: (lv) => 10 + 2 * lv,
    cooldownMs: () => 8000,
    describe: (lv) => `최대 HP의 ${pct(SKILL_FX.hotfix(lv).healPct)} + INT×3을 회복한다.`,
    art: { shape: "sk_cross", main: 0x6ad07a, accent: 0x205028 },
  },
  {
    id: "rollback",
    name: "못 들은 척",
    tag: "잠깐 무적",
    maxLevel: 3,
    reqLevel: 8,
    requires: [{ id: "hotfix", level: 2 }],
    sp: () => 15,
    cooldownMs: () => 20_000,
    describe: (lv) => `${(SKILL_FX.rollback(lv).durMs / 1000).toFixed(1)}초 동안 어떤 피해도 받지 않는다.`,
    art: { shape: "sk_undo", main: 0xc8a0e8, accent: 0x5a3e8a },
  },
  {
    id: "cache_hit",
    name: "칼퇴 질주",
    tag: "이동속도",
    maxLevel: 5,
    reqLevel: 3,
    sp: () => 8,
    cooldownMs: () => 15_000,
    describe: (lv) => `8초 동안 이동속도 +${pct(SKILL_FX.cache_hit(lv).speed)}.`,
    art: { shape: "sk_bolt", main: 0xffe39a, accent: 0xc8a050 },
  },
  {
    id: "debugging",
    name: "매의 눈",
    tag: "치명타↑",
    maxLevel: 5,
    reqLevel: 5,
    requires: [{ id: "refactor", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 18_000,
    describe: (lv) => `10초 동안 치명타 확률 +${SKILL_FX.debugging(lv).crit}%.`,
    art: { shape: "sk_bug", main: 0x6ad0c8, accent: 0x205050 },
  },
  {
    id: "pair_prog",
    name: "입사 동기 소환",
    tag: "도우미 소환",
    maxLevel: 5,
    reqLevel: 12,
    requires: [{ id: "code_review", level: 2 }],
    sp: () => 20,
    cooldownMs: () => 30_000,
    describe: (lv) =>
      `${SKILL_FX.pair_prog(lv).durMs / 1000}초 동안 입사 동기 유령이 곁에서 공격력의 ${pct(SKILL_FX.pair_prog(lv).atkPct)}로 함께 싸운다.`,
    art: { shape: "sk_pair", main: 0xd9dccf, accent: 0x55704f },
  },
  {
    id: "code_review",
    name: "빨간 펜 첨삭",
    tag: "적 약화",
    maxLevel: 5,
    reqLevel: 6,
    sp: () => 12,
    cooldownMs: () => 14_000,
    describe: (lv) => `주변 적이 6초 동안 받는 피해 +${pct(SKILL_FX.code_review(lv).vuln)}, 이동속도 -25%.`,
    art: { shape: "sk_eye", main: 0xe8d9b0, accent: 0xa83c3c },
  },
  {
    id: "overtime",
    name: "야근",
    tag: "공격력↑·HP 감소",
    maxLevel: 5,
    reqLevel: 10,
    requires: [{ id: "coffee_break", level: 1 }],
    sp: () => 5,
    cooldownMs: () => 20_000,
    describe: (lv) => `10초 동안 공격력 +${pct(SKILL_FX.overtime(lv).atk)}, 대신 매초 최대 HP의 2%를 잃는다.`,
    art: { shape: "sk_moon", main: 0xffe39a, accent: 0x2a2e48 },
  },
  {
    id: "deploy",
    name: "전체 회신",
    tag: "광역",
    maxLevel: 5,
    reqLevel: 15,
    requires: [{ id: "refactor", level: 3 }],
    sp: (lv) => 18 + 2 * lv,
    cooldownMs: () => 9000,
    describe: (lv) => `주변 모든 적에게 공격력의 ${pct(SKILL_FX.deploy(lv).mult)} 피해.`,
    art: { shape: "sk_rocket", main: 0xe07a2a, accent: 0xf2f2f2 },
  },
  {
    id: "coffee_break",
    name: "커피 브레이크",
    tag: "SP 회복",
    maxLevel: 3,
    reqLevel: 4,
    sp: () => 0,
    cooldownMs: () => 40_000,
    describe: (lv) => `잠깐 멈춰 서서 최대 SP의 ${pct(SKILL_FX.coffee_break(lv).spPct)}를 회복한다.`,
    art: { shape: "sk_cup", main: 0x6a4a30, accent: 0xe8d9b0 },
  },
  {
    id: "stapler_burst",
    name: "스테이플러 난사",
    tag: "부채꼴 연사",
    maxLevel: 5,
    reqLevel: 6,
    sp: (lv) => 9 + lv,
    cooldownMs: () => 5000,
    describe: (lv) => `앞쪽 부채꼴로 철심 ${SKILL_FX.stapler_burst(lv).n}발을 쏜다. 한 발에 공격력의 ${pct(SKILL_FX.stapler_burst(lv).mult)}.`,
    art: { shape: "sk_staple", main: 0xc8ccd2, accent: 0x3a3f4a },
  },
  {
    id: "sprint",
    name: "지각 직전 돌파",
    tag: "돌진",
    maxLevel: 5,
    reqLevel: 7,
    requires: [{ id: "cache_hit", level: 1 }],
    sp: () => 10,
    cooldownMs: () => 7000,
    describe: (lv) =>
      `바라보는 쪽으로 ${SKILL_FX.sprint(lv).dist}px 순식간에 달려 나가며, 지나친 적에게 공격력의 ${pct(SKILL_FX.sprint(lv).mult)} 피해. 달리는 동안은 맞지 않는다.`,
    art: { shape: "sk_dash", main: 0x7ad0f0, accent: 0x2a5ac8 },
  },
  {
    id: "afk",
    name: "자리 비움",
    tag: "순간이동",
    maxLevel: 3,
    reqLevel: 9,
    requires: [{ id: "sprint", level: 1 }],
    sp: () => 8,
    cooldownMs: () => 12_000,
    describe: (lv) => `가장 가까운 적의 반대쪽으로 순간이동하고 ${(SKILL_FX.afk(lv).safeMs / 1000).toFixed(1)}초 동안 아무도 나를 못 찾는다(피해 없음).`,
    art: { shape: "sk_blink", main: 0xd9dccf, accent: 0x6a6e78 },
  },
  {
    id: "team_dinner",
    name: "팀 회식",
    tag: "공속↑·재생",
    maxLevel: 5,
    reqLevel: 11,
    requires: [{ id: "coffee_break", level: 1 }],
    sp: () => 15,
    cooldownMs: () => 24_000,
    describe: (lv) =>
      `10초 동안 공격 속도 +${pct(SKILL_FX.team_dinner(lv).aspd)}, 매초 최대 HP의 ${(SKILL_FX.team_dinner(lv).regenPct * 100).toFixed(1)}% 회복.`,
    art: { shape: "sk_cheers", main: 0xf0d050, accent: 0xf2ead3 },
  },
  {
    id: "urgent_meeting",
    name: "긴급 회의 소집",
    tag: "끌어모으기",
    maxLevel: 5,
    reqLevel: 13,
    requires: [{ id: "code_review", level: 2 }],
    sp: () => 16,
    cooldownMs: () => 16_000,
    describe: (lv) =>
      `주변 적을 내 앞으로 끌어모으고 ${(SKILL_FX.urgent_meeting(lv).stunMs / 1000).toFixed(2)}초 동안 묶어 둔다. 모인 적이 받는 피해 +${pct(SKILL_FX.urgent_meeting(lv).vuln)}.`,
    art: { shape: "sk_pull", main: 0xe07a2a, accent: 0x2a2e48 },
  },
  {
    id: "auto_reply",
    name: "부재중 자동응답",
    tag: "보호막",
    maxLevel: 5,
    reqLevel: 14,
    requires: [{ id: "rollback", level: 1 }],
    sp: () => 14,
    cooldownMs: () => 22_000,
    describe: (lv) => `8초 동안 최대 HP의 ${pct(SKILL_FX.auto_reply(lv).shieldPct)}만큼 피해를 대신 받아 주는 보호막.`,
    art: { shape: "sk_shield", main: 0x6ad0c8, accent: 0x205050 },
  },
  {
    id: "printer",
    name: "복합기 설치",
    tag: "포탑 소환",
    maxLevel: 5,
    reqLevel: 18,
    requires: [{ id: "pair_prog", level: 1 }],
    sp: () => 22,
    cooldownMs: () => 25_000,
    describe: (lv) =>
      `그 자리에 복합기를 놓는다. ${SKILL_FX.printer(lv).durMs / 1000}초 동안 가까운 적에게 종이를 뱉어 공격력의 ${pct(SKILL_FX.printer(lv).atkPct)} 피해.`,
    art: { shape: "sk_printer", main: 0xe8e8ec, accent: 0x3a3f4a },
  },
  {
    id: "report_bomb",
    name: "보고서 폭탄",
    tag: "지연 폭발",
    maxLevel: 5,
    reqLevel: 20,
    requires: [{ id: "deploy", level: 1 }],
    sp: (lv) => 24 + 2 * lv,
    cooldownMs: () => 11_000,
    describe: (lv) => `가장 가까운 적 자리에 두꺼운 보고서를 던진다. 0.8초 뒤 터져 둘레 적에게 공격력의 ${pct(SKILL_FX.report_bomb(lv).mult)} 피해.`,
    art: { shape: "sk_bomb", main: 0xf2ead3, accent: 0xd03030 },
  },
];

export const skillById = (id: string): SkillDef | undefined => SKILLS.find((s) => s.id === id);
export const HOTBAR_SIZE = 6;

// ── 난이도 ──

export const DIFFICULTIES = ["easy", "normal", "hard", "hell"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export type DifficultyDef = {
  id: Difficulty;
  name: string;
  /** 권장 레벨 */
  recLevel: number;
  /** 몬스터 레벨 (명중·회피 계산) */
  monsterLevel: number;
  hpMul: number;
  atkMul: number;
  defMul: number;
  expMul: number;
  /** 한 판 최대 포인트 (사냥터 / 미니게임) */
  huntPoints: number;
  miniPoints: number;
  /** 미니게임 한 판 최대 EXP */
  miniExp: number;
  /**
   * 드롭 확률 (굴림 1번당). 43번에서 0.15~0.3 → 0.08~0.15, 11/12에 다시 절반쯤(0.04~0.07): 장비·포션이 너무 잘 나왔다
   */
  dropChance: number;
  /** 우두머리를 잡고 다 깼을 때 장비 확률 (11/12: 예전엔 확정, 0.3~0.2 → 이번에 절반: 0.15~0.1) */
  bossDropChance: number;
  /** 다 깼을 때 기간제 코디(캐릭터 꾸미기 하루권)가 나올 확률 — 아주 가끔. 서버가 계정 가방에 넣는다 */
  cosmeticChance: number;
  /** 드롭 장비의 요구 레벨 상한 */
  dropMaxLevel: number;
};

export const DIFFS: Record<Difficulty, DifficultyDef> = {
  easy: { id: "easy", name: "쉬움", recLevel: 1, monsterLevel: 3, hpMul: 1, atkMul: 1, defMul: 1, expMul: 1, huntPoints: 20, miniPoints: 12, miniExp: 40, dropChance: 0.04, bossDropChance: 0.15, cosmeticChance: 0.006, dropMaxLevel: 8 },
  normal: { id: "normal", name: "보통", recLevel: 8, monsterLevel: 12, hpMul: 2.6, atkMul: 2.3, defMul: 2.5, expMul: 2.6, huntPoints: 35, miniPoints: 20, miniExp: 90, dropChance: 0.05, bossDropChance: 0.135, cosmeticChance: 0.009, dropMaxLevel: 18 },
  hard: { id: "hard", name: "어려움", recLevel: 18, monsterLevel: 24, hpMul: 6, atkMul: 4.6, defMul: 5, expMul: 5.5, huntPoints: 55, miniPoints: 30, miniExp: 180, dropChance: 0.06, bossDropChance: 0.12, cosmeticChance: 0.012, dropMaxLevel: 30 },
  hell: { id: "hell", name: "지옥", recLevel: 30, monsterLevel: 38, hpMul: 13, atkMul: 8.5, defMul: 9, expMul: 11, huntPoints: 80, miniPoints: 45, miniExp: 320, dropChance: 0.07, bossDropChance: 0.1, cosmeticChance: 0.015, dropMaxLevel: 50 },
};

// ── 몬스터 ──

export type MonsterBehavior =
  | "chase" // 쫓아와서 몸통 박치기
  | "dash" // 잠깐 멈췄다가 돌진
  | "wander" // 방향을 자꾸 바꾼다
  | "ranged" // 떨어져서 쏜다
  | "explode" // 붙으면 터진다
  | "split" // 죽으면 둘로 갈라진다
  | "blink" // 사라졌다 나타난다
  | "boss";

export type MonsterId =
  | "scope_creep"
  | "endless_meeting"
  | "tech_debt_slime"
  | "already_exists"
  | "req_change"
  | "merge_conflict"
  | "conflict_shard"
  | "server_bill"
  | "opposing_lead"
  | "legacy_golem"
  | "burnout_wraith"
  | "prod_dragon"
  // 40번 테마 사냥터 (출근길 지하철·헬스장·도서관·장바구니 정글·방학 숙제 사막·12월 31일 밤 축제장·회식 3차 우두머리)
  | "rush_commuter"
  | "phone_zombie"
  | "backpack_turtle"
  | "express_train"
  | "dumbbell_imp"
  | "protein_shaker"
  | "treadmill_ghost"
  | "membership_titan"
  | "flying_book"
  | "night_owl"
  | "eraser_crumb"
  | "eraser_bit"
  | "exam_paper"
  | "sale_tag"
  | "impulse_vine"
  | "runaway_cart"
  | "black_friday"
  | "diary_mummy"
  | "essay_cactus"
  | "sand_worm"
  | "homework_sphinx"
  | "firecracker_kid"
  | "resolution_card"
  | "countdown_clock"
  | "party_popper"
  | "midnight_bell"
  | "endless_toast";

export type MonsterDef = {
  id: MonsterId;
  name: string;
  desc: string;
  /** 쉬움 기준 */
  hp: number;
  atk: number;
  def: number;
  /** px/s */
  speed: number;
  exp: number;
  behavior: MonsterBehavior;
  /** 몸 크기 (픽셀, 스프라이트 한 변) */
  size: number;
  color: number;
  accent: number;
  /** 쓰러지면 이것 n마리로 갈라진다 (서버 출현 상한도 같이 센다) */
  split?: { id: MonsterId; n: number };
  /** 갈라진 조각처럼 웨이브 마릿수에 들지 않는 졸개 */
  minion?: boolean;
  // ── 2번 공격 패턴 (combat feel 담당 구역 — lib/rpg/patterns.ts) ──
  /**
   * 공격 패턴 이름 (PATTERNS: bite·slam·charge·aimed_shot·fan_volley·self_destruct·ambush·nova·rain·cross·breath).
   * 없으면 behavior마다 기본 패턴 (BEHAVIOR_PATTERNS). 예: patterns: ["bite", "charge"]
   */
  patterns?: PatternId[];
  /** 우두머리 단계: HP 문턱마다 붙는 패턴 (없으면 DEFAULT_BOSS_PHASES — 70% 돌진·충격파, 35% 낙하·십자) */
  phases?: BossPhase[];
};

export const MONSTERS: Record<MonsterId, MonsterDef> = {
  scope_creep: { id: "scope_creep", name: "추가 업무", desc: "\"이것만 하나 더\"가 조금씩, 아주 조금씩 불어난다.", hp: 40, atk: 7, def: 0, speed: 34, exp: 6, behavior: "chase", size: 14, color: 0x8ac85a, accent: 0x3a5a28 },
  endless_meeting: { id: "endless_meeting", name: "끝없는 회의", desc: "끝날 듯 끝나지 않는다. 느리지만 질기다.", hp: 90, atk: 6, def: 3, speed: 20, exp: 10, behavior: "chase", size: 16, color: 0x9aa3ad, accent: 0x4a4f58 },
  tech_debt_slime: { id: "tech_debt_slime", name: "미룬 일 슬라임", desc: "\"내일부터\"라고 미뤄 둘수록 끈적해진다.", hp: 70, atk: 8, def: 2, speed: 26, exp: 9, behavior: "chase", size: 14, color: 0x6a8a3c, accent: 0x2e3e1a },
  already_exists: { id: "already_exists", name: "\"그거 해 봤는데\" 유령", desc: "나타났다 사라지며 의욕을 빨아먹는다.", hp: 55, atk: 9, def: 0, speed: 40, exp: 11, behavior: "blink", size: 14, color: 0xd9dccf, accent: 0x6a6e78 },
  req_change: { id: "req_change", name: "오락가락 지시", desc: "아침 지시와 저녁 지시가 다르다. 어디로 갈지 아무도 모른다.", hp: 50, atk: 10, def: 1, speed: 52, exp: 10, behavior: "wander", size: 12, color: 0xe07a2a, accent: 0x6a3010 },
  merge_conflict: { id: "merge_conflict", name: "겹친 약속", desc: "쓰러뜨리면 둘로 갈라진다. 둘 다 가야 한다.", hp: 80, atk: 9, def: 2, speed: 30, exp: 12, behavior: "split", size: 15, color: 0xc83c5a, accent: 0x3c8ac8, split: { id: "conflict_shard", n: 2 } },
  conflict_shard: { id: "conflict_shard", name: "반쪽 약속", desc: "갈라진 약속 조각.", hp: 25, atk: 6, def: 0, speed: 46, exp: 3, behavior: "chase", size: 9, color: 0xc83c5a, accent: 0x3c8ac8, minion: true },
  server_bill: { id: "server_bill", name: "카드값 폭탄", desc: "다가와서 터진다. 청구서는 늘 갑자기 온다.", hp: 35, atk: 22, def: 0, speed: 44, exp: 9, behavior: "explode", size: 13, color: 0x3a3f4a, accent: 0xe84040 },
  opposing_lead: { id: "opposing_lead", name: "잔소리 부장님", desc: "\"그게 돈이 돼?\" 거리를 두고 잔소리를 던진다.", hp: 160, atk: 11, def: 4, speed: 28, exp: 24, behavior: "ranged", size: 16, color: 0x5a6a8a, accent: 0xe8d9b0 },
  legacy_golem: { id: "legacy_golem", name: "서류 더미 골렘", desc: "10년 치 서류가 뭉쳐 일어났다. 단단하고 무겁다.", hp: 260, atk: 15, def: 8, speed: 18, exp: 30, behavior: "dash", size: 20, color: 0x8a7a5a, accent: 0x4a3e2a },
  burnout_wraith: { id: "burnout_wraith", name: "월요병 망령", desc: "닿기만 해도 기운이 빠진다.", hp: 120, atk: 14, def: 2, speed: 38, exp: 22, behavior: "blink", size: 16, color: 0x5a3e8a, accent: 0xc8a0e8 },
  prod_dragon: { id: "prod_dragon", name: "칼퇴 방해 드래곤", desc: "금요일 저녁 6시, 퇴근 5분 전에 깨어난다.", hp: 1400, atk: 20, def: 6, speed: 24, exp: 220, behavior: "boss", size: 32, color: 0xa83c3c, accent: 0xffb040 },

  // ── 출근길 지하철 ──
  rush_commuter: { id: "rush_commuter", name: "밀치는 출근 인파", desc: "\"내릴게요!\" 소리와 함께 어깨부터 들어온다.", hp: 48, atk: 8, def: 1, speed: 38, exp: 7, behavior: "chase", size: 14, color: 0x34405a, accent: 0xd8c8a8 },
  phone_zombie: { id: "phone_zombie", name: "폰만 보는 좀비", desc: "고개를 숙인 채 아무 데로나 걷는다. 앞을 안 본다.", hp: 60, atk: 9, def: 1, speed: 30, exp: 8, behavior: "wander", size: 14, color: 0x7a8a6a, accent: 0x7ad0f0 },
  backpack_turtle: { id: "backpack_turtle", name: "백팩 거북이", desc: "뒤돌 때마다 등에 멘 가방이 휘두르는 망치가 된다.", hp: 85, atk: 12, def: 4, speed: 22, exp: 11, behavior: "dash", size: 16, color: 0x5a8a4a, accent: 0xc87a3a },
  express_train: { id: "express_train", name: "지각 직전 급행열차", desc: "8시 59분, 문이 닫히기 직전에 달려든다. 화날수록 칸이 늘어난다.", hp: 520, atk: 14, def: 4, speed: 22, exp: 64, behavior: "boss", size: 36, color: 0x3a9a8a, accent: 0xf0d050 },

  // ── 새해 다짐 헬스장 ──
  dumbbell_imp: { id: "dumbbell_imp", name: "3일차 아령", desc: "1월 3일에 구석으로 밀려난 아령. 서운해서 쫓아온다.", hp: 55, atk: 9, def: 2, speed: 34, exp: 7, behavior: "chase", size: 13, color: 0x5a5f6a, accent: 0xd04a4a },
  protein_shaker: { id: "protein_shaker", name: "흔들린 프로틴", desc: "너무 흔들어서 뚜껑이 곧 날아간다.", hp: 40, atk: 20, def: 0, speed: 42, exp: 8, behavior: "explode", size: 13, color: 0xe8e0d0, accent: 0x8a5ac8 },
  treadmill_ghost: { id: "treadmill_ghost", name: "안 쓴 회원권 유령", desc: "결제만 하고 한 번도 안 온 회원권. 보였다 안 보였다 한다.", hp: 65, atk: 10, def: 0, speed: 40, exp: 10, behavior: "blink", size: 14, color: 0xc8f0e8, accent: 0x3a8a7a },
  membership_titan: { id: "membership_titan", name: "1년 회원권 거인", desc: "1월 1일에 끊은 1년 회원권의 원한. 아령을 불러 모은다.", hp: 600, atk: 15, def: 5, speed: 20, exp: 72, behavior: "boss", size: 36, color: 0xd8885a, accent: 0x2a2e48 },

  // ── 시험 전날 도서관 ──
  flying_book: { id: "flying_book", name: "펄럭이는 전공책", desc: "한 번도 안 편 전공책이 드디어 펼쳐졌다. 정신없이 날아다닌다.", hp: 45, atk: 10, def: 1, speed: 54, exp: 9, behavior: "wander", size: 13, color: 0x8a3a3a, accent: 0xf2ead3 },
  night_owl: { id: "night_owl", name: "밤샘 올빼미", desc: "\"딱 한 장만 더…\" 멀리서 요점 정리 쪽지를 던진다.", hp: 90, atk: 11, def: 2, speed: 28, exp: 14, behavior: "ranged", size: 15, color: 0x7a5a3a, accent: 0xffd04a },
  eraser_crumb: { id: "eraser_crumb", name: "지우개 똥 뭉치", desc: "밤새 지운 흔적. 때리면 가루로 흩어진다.", hp: 75, atk: 9, def: 2, speed: 30, exp: 11, behavior: "split", size: 15, color: 0xe88a9a, accent: 0x5a8ac8, split: { id: "eraser_bit", n: 2 } },
  eraser_bit: { id: "eraser_bit", name: "지우개 가루", desc: "흩어진 지우개 가루.", hp: 22, atk: 6, def: 0, speed: 48, exp: 3, behavior: "chase", size: 9, color: 0xe88a9a, accent: 0x5a8ac8, minion: true },
  exam_paper: { id: "exam_paper", name: "빨간 줄 시험지", desc: "내일 볼 시험지가 미리 와서 채점부터 한다. 화날수록 빨간 줄이 늘어난다.", hp: 700, atk: 16, def: 5, speed: 22, exp: 110, behavior: "boss", size: 36, color: 0xf2ead3, accent: 0xd03030 },

  // ── 장바구니 정글 ──
  sale_tag: { id: "sale_tag", name: "1+1 스티커", desc: "붙는 순간 필요 없던 물건이 두 개가 된다. 작고 빠르다.", hp: 38, atk: 9, def: 0, speed: 50, exp: 7, behavior: "chase", size: 11, color: 0xf0d040, accent: 0xd03030 },
  impulse_vine: { id: "impulse_vine", name: "충동구매 덩굴", desc: "\"오늘만 이 가격\" 씨앗을 멀리서 쏜다.", hp: 95, atk: 11, def: 3, speed: 20, exp: 13, behavior: "ranged", size: 16, color: 0x3a8a3a, accent: 0xf080b0 },
  runaway_cart: { id: "runaway_cart", name: "폭주 카트", desc: "바퀴 하나가 고장 난 카트. 멈췄다가 갑자기 돌진한다.", hp: 110, atk: 14, def: 5, speed: 24, exp: 14, behavior: "dash", size: 17, color: 0xb0b8c0, accent: 0xd03030 },
  black_friday: { id: "black_friday", name: "블랙 프라이데이 쇼핑백", desc: "\"전 품목 90%\" 문구로 정신을 빼놓는 거대한 쇼핑백.", hp: 760, atk: 17, def: 6, speed: 21, exp: 120, behavior: "boss", size: 38, color: 0x2a2a30, accent: 0xf0c040 },

  // ── 방학 숙제 사막 ──
  diary_mummy: { id: "diary_mummy", name: "밀린 그림일기 미라", desc: "한 달 치 일기를 하루에 쓰다 붕대가 됐다. 질기다.", hp: 140, atk: 12, def: 4, speed: 24, exp: 16, behavior: "chase", size: 16, color: 0xe8dcc0, accent: 0x6a5a3a },
  essay_cactus: { id: "essay_cactus", name: "독후감 선인장", desc: "읽지도 않은 책의 독후감. 가시 돋친 문장을 쏜다.", hp: 110, atk: 13, def: 3, speed: 18, exp: 15, behavior: "ranged", size: 16, color: 0x4a9a4a, accent: 0xf0e0a0 },
  sand_worm: { id: "sand_worm", name: "탐구 보고서 모래벌레", desc: "모래 속으로 숨었다가 발밑에서 튀어나온다.", hp: 100, atk: 14, def: 2, speed: 36, exp: 15, behavior: "blink", size: 16, color: 0xc8a060, accent: 0x8a4a2a },
  homework_sphinx: { id: "homework_sphinx", name: "개학 전날 스핑크스", desc: "\"숙제는 다 했니?\" 대답을 못 하면 지나갈 수 없다.", hp: 1300, atk: 19, def: 7, speed: 22, exp: 200, behavior: "boss", size: 38, color: 0xd8b060, accent: 0x3a5aa8 },

  // ── 12월 31일 밤 축제장 ──
  firecracker_kid: { id: "firecracker_kid", name: "성급한 폭죽", desc: "자정까지 못 참고 먼저 터지러 온다.", hp: 40, atk: 22, def: 0, speed: 46, exp: 9, behavior: "explode", size: 12, color: 0xd03a3a, accent: 0xf0d050 },
  resolution_card: { id: "resolution_card", name: "작심삼일 다짐 카드", desc: "올해도 썼던 그 다짐. 나타났다 사라지길 반복한다.", hp: 110, atk: 13, def: 2, speed: 38, exp: 18, behavior: "blink", size: 15, color: 0xf2ead3, accent: 0x3a6ac8 },
  countdown_clock: { id: "countdown_clock", name: "카운트다운 시계", desc: "10초 남았을 때 가장 빠르다. 째깍째깍 돌진한다.", hp: 180, atk: 16, def: 6, speed: 22, exp: 22, behavior: "dash", size: 18, color: 0xc8a050, accent: 0x2a2e48 },
  party_popper: { id: "party_popper", name: "고깔모자 파티꾼", desc: "멀리서 꽃가루 폭탄을 쏜다. 신났다.", hp: 120, atk: 14, def: 3, speed: 28, exp: 20, behavior: "ranged", size: 15, color: 0x8a4ac8, accent: 0xf0d050 },
  midnight_bell: { id: "midnight_bell", name: "제야의 종 대마왕", desc: "자정에 서른세 번 울린다. 한 번 울릴 때마다 한 해의 후회가 쏟아진다.", hp: 1700, atk: 21, def: 7, speed: 20, exp: 250, behavior: "boss", size: 40, color: 0xb07a3a, accent: 0xf0d050 },

  // ── 회식 3차 우두머리 ──
  endless_toast: { id: "endless_toast", name: "끝나지 않는 건배사", desc: "\"마지막으로 한마디만\"이 한 시간째. 잔을 들 때마다 졸개가 늘어난다.", hp: 1500, atk: 20, def: 6, speed: 22, exp: 230, behavior: "boss", size: 36, color: 0x3a8a4a, accent: 0xf2ead3 },
};

export const MONSTER_IDS = Object.keys(MONSTERS) as MonsterId[];

// ── 사냥터 (40번: 난이도마다 두 곳 이상, 캐릭터 레벨로 차례로 열린다) ──

export const ZONE_IDS = [
  "meeting-room",
  "subway",
  "gym",
  "legacy-forest",
  "library",
  "cart-jungle",
  "deadline-swamp",
  "homework-desert",
  "burnout-abyss",
  "new-year-eve",
] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

export type ZoneDef = {
  /** 사냥터 id = 함께 사냥 방 id에 쓰는 영문 이름 (`hunt:{slug}:{difficulty}`). 처음 네 곳은 예전 이름 그대로 */
  id: ZoneId;
  difficulty: Difficulty;
  slug: ZoneId;
  name: string;
  desc: string;
  /** 이 레벨부터 갈 수 있다 */
  unlockLevel: number;
  /** 같은 난이도 안에서 몬스터 체력·공격력·EXP 배율 (뒤에 열리는 곳이 조금 더 세고 보상도 조금 더) */
  power: number;
  /** 지형 기믹 (로비 카드·입장 안내) */
  gimmick: { name: string; desc: string };
  /** 일반 웨이브에 나오는 몬스터 */
  pool: MonsterId[];
  /** 마지막 웨이브 우두머리 */
  boss: MonsterId;
  /** 우두머리가 화날 때(체력 60%·30%)마다 불러내는 졸개. 서버 출현 상한에 2번 몫이 더해진다 */
  summon: { id: MonsterId; n: number };
  /** 이 사냥터에서 더 잘 나오는 장비 (드롭 장비 굴림에서 가중치 ×3) */
  favor: string[];
  waves: number;
  timeLimitSec: number;
  /** 로비 카드·지도 바탕색: 바닥 두 색, 장식 색 */
  floor: [number, number];
  deco: number;
};

const TIER_WAVES: Record<Difficulty, { waves: number; timeLimitSec: number }> = {
  easy: { waves: 4, timeLimitSec: 150 },
  normal: { waves: 5, timeLimitSec: 180 },
  hard: { waves: 6, timeLimitSec: 210 },
  hell: { waves: 7, timeLimitSec: 240 },
};

const zone = (z: Omit<ZoneDef, "slug" | "waves" | "timeLimitSec">): ZoneDef => ({ ...z, slug: z.id, ...TIER_WAVES[z.difficulty] });

export const HUNT_ZONES: Record<ZoneId, ZoneDef> = {
  "meeting-room": zone({
    id: "meeting-room",
    difficulty: "easy",
    name: "월요일 회의실",
    desc: "새 다짐이 처음으로 반대에 부딪히는 곳.",
    unlockLevel: 1,
    power: 1,
    gimmick: { name: "발표 조명", desc: "천천히 움직이는 프로젝터 조명 안에 서 있으면 HP가 차오른다." },
    pool: ["scope_creep", "endless_meeting", "req_change"],
    boss: "opposing_lead",
    summon: { id: "scope_creep", n: 2 },
    favor: ["w_ruler", "h_headset"],
    floor: [0x3a3830, 0x34322b],
    deco: 0x8a7a5a,
  }),
  subway: zone({
    id: "subway",
    difficulty: "easy",
    name: "출근길 지하철",
    desc: "8시 40분, 한 칸에 이백 명. 내릴 역은 아직 멀었다.",
    unlockLevel: 3,
    power: 1.15,
    gimmick: { name: "문이 열립니다", desc: "역에 설 때마다 문이 열리고 인파가 밀려 들어와 문 앞을 밀어낸다. 문 위 불이 깜빡이면 비켜서자." },
    pool: ["rush_commuter", "phone_zombie", "backpack_turtle", "scope_creep"],
    boss: "express_train",
    summon: { id: "rush_commuter", n: 2 },
    favor: ["c_earphones", "h_cap"],
    floor: [0x8a8f98, 0x7a8088],
    deco: 0x3a9a8a,
  }),
  gym: zone({
    id: "gym",
    difficulty: "easy",
    name: "새해 다짐 헬스장",
    desc: "1월 2일엔 줄을 섰는데, 1월 4일부터 텅 비었다.",
    unlockLevel: 5,
    power: 1.3,
    gimmick: { name: "러닝머신 컨베이어", desc: "러닝머신 위에서는 몸이 한쪽으로 끌려간다. 화살표가 깜빡이면 방향이 바뀐다." },
    pool: ["dumbbell_imp", "protein_shaker", "treadmill_ghost", "req_change"],
    boss: "membership_titan",
    summon: { id: "dumbbell_imp", n: 2 },
    favor: ["c_smartwatch", "a_hoodie"],
    floor: [0x3a3f48, 0x30353e],
    deco: 0xd8885a,
  }),
  "legacy-forest": zone({
    id: "legacy-forest",
    difficulty: "normal",
    name: "야근 사무실",
    desc: "아무도 손대지 못한 서류가 나무처럼 쌓여 있다. 칸막이 사이로 길을 찾아야 한다.",
    unlockLevel: 8,
    power: 1,
    gimmick: { name: "칸막이 미로·엘리베이터", desc: "책상 칸막이가 미로처럼 막고 있다. 양쪽 끝 엘리베이터에 타면 반대편 엘리베이터로 순간 이동." },
    pool: ["tech_debt_slime", "already_exists", "merge_conflict", "req_change", "scope_creep"],
    boss: "legacy_golem",
    summon: { id: "tech_debt_slime", n: 2 },
    favor: ["w_keyboard", "a_flannel"],
    floor: [0x2c3a2a, 0x283524],
    deco: 0x55704f,
  }),
  library: zone({
    id: "library",
    difficulty: "normal",
    name: "시험 전날 도서관",
    desc: "열람실 불이 하나둘 꺼진다. 아직 1단원도 못 봤다.",
    unlockLevel: 11,
    power: 1.15,
    gimmick: { name: "정전", desc: "가끔 불이 나가 내 주변만 보인다. 불빛이 깜빡이면 곧 꺼진다는 신호." },
    pool: ["flying_book", "night_owl", "eraser_crumb", "already_exists"],
    boss: "exam_paper",
    summon: { id: "flying_book", n: 2 },
    favor: ["h_headset", "c_ide_ring"],
    floor: [0x5a3e2e, 0x4e3628],
    deco: 0xe8c070,
  }),
  "cart-jungle": zone({
    id: "cart-jungle",
    difficulty: "normal",
    name: "장바구니 정글",
    desc: "\"구경만 할게요\"라고 들어왔다가 길을 잃은 쇼핑몰.",
    unlockLevel: 14,
    power: 1.3,
    gimmick: { name: "충동구매 덩굴밭", desc: "바닥의 덩굴밭에서는 발이 묶여 느려진다. 덩굴은 숨을 쉬듯 커졌다 작아진다." },
    pool: ["sale_tag", "impulse_vine", "runaway_cart", "server_bill"],
    boss: "black_friday",
    summon: { id: "sale_tag", n: 3 },
    favor: ["w_duck", "a_laptop_bag"],
    floor: [0x2e5a34, 0x284e2e],
    deco: 0xf080b0,
  }),
  "deadline-swamp": zone({
    id: "deadline-swamp",
    difficulty: "hard",
    name: "결재 늪",
    desc: "올린 결재는 돌아오지 않고, 발을 디딜수록 일정이 가라앉는다.",
    unlockLevel: 18,
    power: 1,
    gimmick: { name: "끓는 늪", desc: "늪에서는 느려지고, 거품이 크게 일면 곧 끓어올라 안에 있는 모두가 다친다." },
    pool: ["merge_conflict", "server_bill", "opposing_lead", "legacy_golem", "tech_debt_slime"],
    boss: "prod_dragon",
    summon: { id: "tech_debt_slime", n: 2 },
    favor: ["w_legacy_axe", "a_standing_desk"],
    floor: [0x26302e, 0x222a28],
    deco: 0x4a6a5a,
  }),
  "homework-desert": zone({
    id: "homework-desert",
    difficulty: "hard",
    name: "방학 숙제 사막",
    desc: "개학까지 사흘. 한 달 치 숙제가 모래처럼 쌓여 있다.",
    unlockLevel: 22,
    power: 1.15,
    gimmick: { name: "모래 폭풍", desc: "모래 폭풍이 불면 앞이 흐려지고 바람 부는 쪽으로 밀린다. 지평선이 흔들리면 곧 분다." },
    pool: ["diary_mummy", "essay_cactus", "sand_worm", "server_bill"],
    boss: "homework_sphinx",
    summon: { id: "diary_mummy", n: 2 },
    favor: ["c_mug", "w_monitor_arm"],
    floor: [0xd8b878, 0xc8a868],
    deco: 0x8a6a3a,
  }),
  "burnout-abyss": zone({
    id: "burnout-abyss",
    difficulty: "hell",
    name: "회식 3차",
    desc: "모든 다짐이 마지막으로 무너지는 곳. 아무도 먼저 못 일어난다.",
    unlockLevel: 30,
    power: 1,
    gimmick: { name: "미끄러운 바닥", desc: "엎질러진 술 웅덩이에서는 미끄러져 멈추기 어렵다." },
    pool: ["burnout_wraith", "server_bill", "legacy_golem", "already_exists", "opposing_lead", "merge_conflict"],
    boss: "endless_toast",
    summon: { id: "burnout_wraith", n: 2 },
    favor: ["w_compiler"],
    floor: [0x241e2c, 0x201a28],
    deco: 0x5a3e8a,
  }),
  "new-year-eve": zone({
    id: "new-year-eve",
    difficulty: "hell",
    name: "12월 31일 밤 축제장",
    desc: "올해의 다짐이 전부 몰려나오는 마지막 밤. 자정까지 버텨라.",
    unlockLevel: 36,
    power: 1.15,
    gimmick: { name: "불꽃놀이", desc: "하늘에서 폭죽이 떨어진다. 바닥에 빨간 원이 보이면 피하자 — 몬스터도 맞는다." },
    pool: ["firecracker_kid", "resolution_card", "countdown_clock", "party_popper", "burnout_wraith"],
    boss: "midnight_bell",
    summon: { id: "firecracker_kid", n: 3 },
    favor: ["a_server_rack", "w_compiler"],
    floor: [0x2a2a44, 0x24243c],
    deco: 0xf0d050,
  }),
};

/** 난이도마다 처음 열리는 사냥터 (예전 API·저장된 선택이 사냥터 없이 난이도만 보낼 때) */
export const ZONES: Record<Difficulty, ZoneDef> = {
  easy: HUNT_ZONES["meeting-room"],
  normal: HUNT_ZONES["legacy-forest"],
  hard: HUNT_ZONES["deadline-swamp"],
  hell: HUNT_ZONES["burnout-abyss"],
};

export const isZoneId = (v: unknown): v is ZoneId => typeof v === "string" && (ZONE_IDS as readonly string[]).includes(v);

/** 난이도 + (있으면) 사냥터 id → 사냥터. 난이도가 다른 id면 그 난이도의 기본 사냥터 */
export function zoneFor(d: Difficulty, id?: string | null): ZoneDef {
  const z = isZoneId(id) ? HUNT_ZONES[id] : undefined;
  return z && z.difficulty === d ? z : ZONES[d];
}

/** 난이도별 사냥터 (열리는 레벨 순) */
export const zonesOf = (d: Difficulty): ZoneDef[] => ZONE_IDS.map((id) => HUNT_ZONES[id]).filter((z) => z.difficulty === d);

// ── 미니게임 ──

export const GAME_KINDS = ["hunt", "bugs", "stars"] as const;
export type GameKind = (typeof GAME_KINDS)[number];

export const GAMES: Record<GameKind, { name: string; desc: string; how: string; statNote: string }> = {
  hunt: {
    name: "사냥터",
    desc: "다짐을 망치는 것들을 웨이브마다 물리친다. 장비·스킬·포션을 모두 쓴다.",
    how: "WASD/방향키 이동 · Space/J 공격(누르고 있으면 계속 공격, 앞쪽 부채꼴 안의 적을 모두 때림) · 마우스·손가락을 누르고 있으면 그쪽으로 계속 공격 · 1~6 스킬 · Q/E/R 포션 · Esc 멈춤",
    statNote: "모든 능력치와 장비가 그대로 쓰인다",
  },
  bugs: {
    name: "벌레 잡기",
    desc: "아홉 개의 창에서 튀어나오는 벌레를 잡는다. 초록 체크 표시와 줄 그어진 회색 '이미 잡은 벌레'는 건드리지 말 것. 콤보가 쌓일수록 점수 배수가 오른다.",
    how: "클릭·탭, 또는 Q W E / A S D / Z X C 키로 칸을 누른다",
    statNote: "DEX: 벌레가 조금 더 오래 보임 · LUK: 황금 벌레가 더 자주",
  },
  stars: {
    name: "별자리 잇기",
    desc: "끝내지 못한 다짐들이 밤하늘의 별로 떠오른다. 빛의 고리가 별에 닿는 순간 눌러 하나의 별자리로 잇는다.",
    how: "고리가 별에 겹치는 순간 Space·J·클릭·탭 (어디를 눌러도 다음 별) · 너무 일찍 누르면 놓침",
    statNote: "DEX: 판정이 조금 너그러워짐",
  },
};

/** 미니게임 시간 (초) */
export const MINI_TIME_SEC: Record<Exclude<GameKind, "hunt">, number> = { bugs: 60, stars: 75 };

export const timeLimitSec = (game: GameKind, d: Difficulty, zone?: string | null) => (game === "hunt" ? zoneFor(d, zone).timeLimitSec : MINI_TIME_SEC[game]);

// ── 드롭 표시 (11/12: 기간제 코디 드롭) ──

/**
 * 사냥터를 다 깼을 때 아주 가끔 나오는 기간제 코디 = 상점에서 파는 캐릭터 꾸미기(펫 제외) 중 200P 이하.
 * 서버가 계정 가방에 넣는다 (이미 가방·착용·벗어 둔 꾸미기에 있으면 다음 후보, 상점 중복 구매 금지 규칙과 같다)
 */
export const COSMETIC_DROPS: readonly string[] = ITEMS.filter((i) => i.kind === "cosmetic" && isShopListed(i) && i.price <= 200).map((i) => i.id);

/** 코디 드롭 아이콘 (선물 상자) */
export const COSMETIC_DROP_ART: IconArt = { shape: "gift", main: 0xffb0c8, accent: 0xe8b830 };

export type DropKind = "gear" | "potion" | "cosmetic";
export type DropInfo = { name: string; art: IconArt; kind: DropKind; note?: string };

/** 판 결과 드롭 한 줄 → 이름·아이콘 (UI가 결과 화면에 그대로 쓴다). 모르는 id면 null */
export function dropInfo(d: { kind: DropKind; id: string }): DropInfo | null {
  if (d.kind === "gear") {
    const g = gearById(d.id);
    return g ? { name: g.name, art: g.art, kind: "gear" } : null;
  }
  if (d.kind === "potion") {
    const p = potionById(d.id);
    return p ? { name: p.name, art: p.art, kind: "potion" } : null;
  }
  const it = itemById(d.id);
  return it ? { name: it.name, art: COSMETIC_DROP_ART, kind: "cosmetic", note: "캐릭터 꾸미기 하루권 · 상점 가방에 들어갔어요" } : null;
}
