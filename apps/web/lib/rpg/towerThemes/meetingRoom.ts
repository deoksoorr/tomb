import type { MonsterDef, ZoneDef } from "../catalog";

// 11/15 야근 빌딩 테마 「끝없는 회의실」 (6~10층, 그다음 10층마다: 16~20 · 26~30 …).
// 몬스터·사냥터 정의와 순수 계산(벽시계·한 바퀴마다 바뀌는 회의·방이 좁아지는 칸)만 — 서버·게임·안내서가 같이 쓴다.
// 이 파일은 catalog에서 타입만 가져온다 (catalog가 이 파일의 값을 가져가므로 런타임 순환이 없게). 층 계획은 meetingRoomPlan.ts

export const MT_ZONE = "mt_meeting" as const;

export type MtMonsterId =
  | "mt_cc_mail"
  | "mt_cc_reply"
  | "mt_cc_fwd"
  | "mt_marker"
  | "mt_no_opinion"
  | "mt_slides"
  | "mt_clock_watcher"
  | "mt_chat_ping"
  | "mt_projector"
  | "mt_chair_intern"
  | "mt_coffee"
  | "mt_howl"
  | "mt_attendee"
  | "mt_agenda"
  | "mt_minutes"
  | "mt_chair";

/** 일반 몬스터 (층마다 이 중 몇 종만 골라 나온다 — meetingRoomPlan) */
export const MT_POOL: readonly MtMonsterId[] = [
  "mt_cc_mail",
  "mt_marker",
  "mt_no_opinion",
  "mt_slides",
  "mt_clock_watcher",
  "mt_chat_ping",
  "mt_projector",
  "mt_chair_intern",
  "mt_coffee",
  "mt_howl",
];
/** 무리로 몰려나올 수 있는 것 (단톡방 알림이 가장 자주) */
export const MT_PACKABLE: readonly MtMonsterId[] = ["mt_chat_ping", "mt_chat_ping", "mt_chat_ping", "mt_no_opinion", "mt_chair_intern", "mt_coffee"];
export const MT_ELITE: MtMonsterId = "mt_agenda";
export const MT_MID: MtMonsterId = "mt_minutes";
export const MT_BOSS: MtMonsterId = "mt_chair";

const mon = (d: MonsterDef): MonsterDef => d;

export const MT_MONSTERS: Record<MtMonsterId, MonsterDef> = {
  // 참조 메일: 잡으면 둘로 (회신 → 전달, 3대까지) — 광역기가 빛난다
  mt_cc_mail: mon({ id: "mt_cc_mail", name: "참조 메일", desc: "참조에 참조를 단 메일. 지우면 회신 두 통이 되고, 회신을 지우면 전달 두 통이 된다.", hp: 110, atk: 13, def: 2, speed: 34, exp: 14, behavior: "split", size: 16, color: 0xf4f0e2, accent: 0x3a7ad0, split: { id: "mt_cc_reply", n: 2 } }),
  mt_cc_reply: mon({ id: "mt_cc_reply", name: "회신 메일", desc: "RE: RE: 제목이 길어질수록 빨라진다.", hp: 44, atk: 10, def: 1, speed: 44, exp: 5, behavior: "split", size: 12, color: 0xf0dca0, accent: 0xd06a2a, split: { id: "mt_cc_fwd", n: 2 }, minion: true }),
  mt_cc_fwd: mon({ id: "mt_cc_fwd", name: "전달 메일", desc: "FW: 누가 보냈는지도 모르는 마지막 한 통. 작고 아주 빠르다.", hp: 18, atk: 7, def: 0, speed: 58, exp: 2, behavior: "chase", size: 9, color: 0xffb8d0, accent: 0xc83c6a, minion: true }),
  mt_marker: mon({ id: "mt_marker", name: "화이트보드 마커", desc: "뚜껑을 잃어버린 마커. 돌아다니며 바닥에 선을 긋는데, 그 선은 몇 초 동안 벽이 된다.", hp: 120, atk: 12, def: 3, speed: 46, exp: 16, behavior: "wander", size: 14, color: 0x2a9a5a, accent: 0xf2f2ee, patterns: ["bite"] }),
  mt_no_opinion: mon({ id: "mt_no_opinion", name: "의견 없음", desc: "회의 내내 아무 말이 없다. 보이지 않고, 움직일 때만 윤곽이 아른거린다.", hp: 130, atk: 15, def: 2, speed: 32, exp: 18, behavior: "chase", size: 15, color: 0xc8ccd8, accent: 0x7a7e8a, patterns: ["bite"] }),
  mt_slides: mon({ id: "mt_slides", name: "발표 자료", desc: "87쪽짜리 발표 자료. 멀리서 레이저 포인터로 나를 짚은 뒤 한 장을 쏘아 보낸다.", hp: 115, atk: 16, def: 2, speed: 28, exp: 18, behavior: "ranged", size: 16, color: 0xf2f2f6, accent: 0xe8402a, patterns: ["bite"] }),
  mt_clock_watcher: mon({ id: "mt_clock_watcher", name: "시계 보는 사람", desc: "손목시계만 본다. 가까이 있으면 그 초조함이 옮아 공격이 느려진다.", hp: 170, atk: 12, def: 5, speed: 24, exp: 20, behavior: "chase", size: 16, color: 0x4a5a7a, accent: 0xe8c050, patterns: ["bite"] }),
  mt_chat_ping: mon({ id: "mt_chat_ping", name: "단톡방 알림", desc: "읽지 않은 메시지 999+. 작은 빨간 알림이 떼로 몰려와 좌우로 흔들리며 파고든다.", hp: 26, atk: 8, def: 0, speed: 64, exp: 4, behavior: "chase", size: 9, color: 0xe8402a, accent: 0xf2f2ee, patterns: ["bite"] }),
  mt_projector: mon({ id: "mt_projector", name: "빔프로젝터", desc: "팬 소리가 요란한 회의실 빔. 바닥에 뜨거운 화면을 비추며 천천히 나를 따라 옮긴다.", hp: 160, atk: 14, def: 5, speed: 22, exp: 20, behavior: "ranged", size: 17, color: 0x3a3f4a, accent: 0xfff0a0, patterns: ["bite"] }),
  mt_chair_intern: mon({ id: "mt_chair_intern", name: "의자 굴리는 인턴", desc: "바퀴 의자를 타고 곧장 미끄러져 온다. 벽에 부딪히면 튕겨서 다시 온다.", hp: 120, atk: 17, def: 3, speed: 30, exp: 18, behavior: "dash", size: 16, color: 0x4a8ad0, accent: 0x2a2e3a, patterns: ["bite"] }),
  mt_coffee: mon({ id: "mt_coffee", name: "커피 쏟는 사람", desc: "\"아 죄송해요!\" 가는 곳마다 커피를 쏟는다. 웅덩이를 밟으면 발이 끈적해진다.", hp: 130, atk: 13, def: 2, speed: 34, exp: 16, behavior: "wander", size: 15, color: 0xe8e0d0, accent: 0x6a3e20, patterns: ["bite"] }),
  mt_howl: mon({ id: "mt_howl", name: "마이크 하울링", desc: "삐이이— 스피커 가까이 간 마이크. 주기적으로 소리 고리를 터뜨려 밀어낸다.", hp: 150, atk: 14, def: 4, speed: 20, exp: 20, behavior: "chase", size: 15, color: 0x2a2a32, accent: 0x7ad0ff, patterns: ["bite"] }),
  mt_attendee: mon({ id: "mt_attendee", name: "회의 참석자", desc: "주재자가 부르면 노트북을 들고 들어온다. 졸린 눈으로 따라온다.", hp: 60, atk: 11, def: 2, speed: 40, exp: 6, behavior: "chase", size: 13, color: 0x7a8a9a, accent: 0xd8e0e8, minion: true, patterns: ["bite"] }),
  // 정예: 살아 있는 동안 몬스터가 계속 회의실로 들어온다 (층 계획 adds 상한까지)
  mt_agenda: mon({ id: "mt_agenda", name: "안건 추가", desc: "\"그 김에 이것도 같이 논의하죠.\" 살아 있는 동안 회의실 문이 계속 열린다.", hp: 160, atk: 16, def: 6, speed: 22, exp: 40, behavior: "chase", size: 20, color: 0xf0d040, accent: 0xe8402a, patterns: ["bite", "slam"] }),
  // 중간 우두머리 (8층·18층 … 정예로): 내 최근 움직임을 그대로 따라 하는 그림자를 남긴다
  mt_minutes: mon({ id: "mt_minutes", name: "회의록 담당", desc: "모든 말을 받아 적는다. 내가 지나간 길을 그대로 되밟는 그림자가 따라온다 — 닿으면 아프다.", hp: 240, atk: 18, def: 7, speed: 30, exp: 80, behavior: "chase", size: 22, color: 0x34405a, accent: 0xf2ead3, patterns: ["bite", "aimed_shot", "slam"] }),
  mt_chair: mon({
    id: "mt_chair",
    name: "회의 주재자",
    desc: "\"마지막으로 한 가지만 더.\" 말할 때마다 테이블이 밀려와 방이 좁아지고 참석자가 늘어난다. 끝에는 의자를 돌리며 사방으로 쏜다.",
    hp: 2200,
    atk: 24,
    def: 9,
    speed: 22,
    exp: 330,
    behavior: "boss",
    size: 40,
    color: 0x2a3048,
    accent: 0xe8c050,
    patterns: ["bite", "fan_volley", "slam", "aimed_shot"],
    phases: [
      { below: 0.75, add: ["charge", "rain"], haste: 0.85, label: "\"한 가지만 더!\"" },
      { below: 0.5, add: ["nova", "cross"], haste: 0.72, label: "\"다들 들어와 보세요!\"" },
      { below: 0.25, add: ["breath"], haste: 0.6, label: "의자를 돌리기 시작한다!" },
    ],
  }),
};

export const MT_ZONE_DEF: ZoneDef = {
  id: MT_ZONE,
  difficulty: "hell",
  slug: MT_ZONE,
  name: "끝없는 회의실",
  desc: "유리벽 너머로 회의실이 끝없이 비친다. 노을이 지고, 밤이 되고, 아침이 와도 회의는 끝나지 않는다.",
  unlockLevel: 50,
  power: 1.2,
  gimmick: {
    name: "회의 연장",
    desc: "주기적으로 바닥에 노란 줄이 그어지고, 그 자리로 가장자리 테이블이 밀려 들어와 방이 좁아진다. 움직이는 테이블에 닿으면 밀리고 다친다. 우두머리를 오래 붙잡을수록 방이 작아진다 (층마다 처음으로).",
  },
  pool: [...MT_POOL],
  boss: MT_BOSS,
  elite: MT_ELITE,
  mid: MT_MID,
  summon: { id: "mt_attendee", n: 4 },
  favor: [],
  waves: 2,
  timeLimitSec: 90,
  floor: [0x3a3448, 0x342e42],
  deco: 0xf0a050,
};

// ── 벽시계·한 바퀴 (10층마다 같은 테마로 돌아올 때 회의가 하루를 넘어간다) ──

/** f층 벽시계 (분, 0~1439): 6층 17:00부터 층마다 25분 */
export const meetingClock = (f: number) => (((17 * 60 + (Math.max(1, Math.floor(f)) - 6) * 25) % 1440) + 1440) % 1440;
export const clockText = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export type MtTime = "sunset" | "night" | "dawn" | "sunrise" | "day";
/** 시계로 정해지는 빛 (노을 → 야근 → 새벽 → 밤샘 아침 → 다음 날 낮) */
export function meetingTime(min: number): MtTime {
  const h = min / 60;
  if (h >= 16 && h < 19.5) return "sunset";
  if (h >= 19.5 || h < 0.5) return "night";
  if (h < 5) return "dawn";
  if (h < 8.5) return "sunrise";
  return "day";
}

/** 한 바퀴(10층)마다 붙는 회의 이름·몬스터 특성 (앞 바퀴 것도 계속) */
export const MT_LOOPS: readonly { name: string; trait: string; desc: string }[] = [
  { name: "노을 회의", trait: "", desc: "블라인드 틈으로 주황 노을이 줄무늬로 든다." },
  { name: "야근 회의", trait: "카페인 각성", desc: "블라인드가 내려가고 형광등이 흐려진다. 몬스터가 가끔 커피 김을 뿜으며 확 빨라진다." },
  { name: "새벽 회의", trait: "회의록 공유", desc: "푸른 새벽빛. 몬스터가 쓰러지면 가까운 몬스터 둘의 체력이 찬다." },
  { name: "밤샘 회의", trait: "안건 폭주", desc: "아침 해가 뜬다. 정예 「안건 추가」가 층마다 나오고 더 많이 불러들인다." },
  { name: "다음 날 회의", trait: "연장 또 연장", desc: "다음 날 낮. 테이블이 더 자주, 더 깊이 밀려온다." },
];
/** f층이 끝없는 회의실 몇 바퀴째인가 (0 = 6~10층). period = 테마 한 바퀴 층 수 (테마 수 × 5) */
export const mtLoop = (f: number, period = 10) => Math.max(0, Math.floor((Math.max(1, Math.floor(f)) - 1) / period));
export const mtLoopInfo = (loop: number) => MT_LOOPS[Math.min(MT_LOOPS.length - 1, Math.max(0, loop))];

// ── 회의 연장: 방이 좁아지는 칸 (게임이 그대로 쓰고, 테스트가 경계를 본다) ──

export type MtRoom = { x0: number; y0: number; x1: number; y1: number };
export type MtSide = "left" | "right" | "top" | "bottom";
/** 아무리 좁아져도 이만큼은 남는다 (가로·세로) */
export const MT_ROOM_MIN = { w: 196, h: 128 } as const;
/** 한 번 밀려올 때 들어오는 깊이 (다음 날 회의부터 더 깊게) */
export const mtShrinkStep = (loop: number) => (loop >= 4 ? 30 : 22);
/** 밀려오기 사이 간격 ms (보통 · 우두머리 층). 다음 날 회의부터 더 자주 */
export const mtShrinkEvery = (boss: boolean, loop: number) => Math.round((boss ? 15_000 : 19_000) * (loop >= 4 ? 0.75 : 1));

/** 그쪽으로 더 밀려올 수 있는 깊이 (최소 크기까지 남은 것) */
export function mtSlack(r: MtRoom, side: MtSide): number {
  const sw = Math.max(0, r.x1 - r.x0 - MT_ROOM_MIN.w);
  const sh = Math.max(0, r.y1 - r.y0 - MT_ROOM_MIN.h);
  return side === "left" || side === "right" ? sw : sh;
}

/** side에서 step만큼 밀려온 방 (최소 크기 아래로는 안 간다) */
export function mtShrink(r: MtRoom, side: MtSide, step: number): MtRoom {
  const d = Math.max(0, Math.min(step, mtSlack(r, side)));
  if (side === "left") return { ...r, x0: r.x0 + d };
  if (side === "right") return { ...r, x1: r.x1 - d };
  if (side === "top") return { ...r, y0: r.y0 + d };
  return { ...r, y1: r.y1 - d };
}

/** 다음에 밀려올 쪽: 여유가 있는 쪽 중에서 (r은 0..1 난수), 방 가운데가 너무 치우치지 않게 덜 들어온 쪽 먼저. 다 막혔으면 null */
export function mtNextSide(room: MtRoom, full: MtRoom, r: number): MtSide | null {
  const sides: MtSide[] = ["left", "right", "top", "bottom"];
  const ok = sides.filter((s) => mtSlack(room, s) >= 6);
  if (!ok.length) return null;
  const used = (s: MtSide) => (s === "left" ? room.x0 - full.x0 : s === "right" ? full.x1 - room.x1 : s === "top" ? room.y0 - full.y0 : full.y1 - room.y1);
  const min = Math.min(...ok.map(used));
  const fresh = ok.filter((s) => used(s) <= min + 24);
  return fresh[Math.min(fresh.length - 1, Math.floor(r * fresh.length))];
}
