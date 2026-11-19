import type { Weather } from "@/lib/ambience";

// 11/19 촬영 모드(2D) 규칙 (순수 — 시험할 수 있게). 화면은 components/photo, 게임 쪽은 game/photo.
// 촬영 모드는 서버에 아무것도 보내지 않아요. 필터(시간대·날씨·이름표·내 캐릭터)는 내 화면에서만 바뀌고 끝나면 모두 되돌려요.

/** 촬영 모드를 열 수 있는 장면 (사냥·별자리·미니게임 중엔 열지 않아요). 모름(undefined) = 처음 마을 */
const PHOTO_SCENES: ReadonlySet<string> = new Set(["world", "shop", "house"]);

export type PhotoGate = {
  /** 게임이 떠 있음 */
  ready: boolean;
  /** scene:changed 장면 */
  scene?: string;
  /** 버스 창밖 연출 중 */
  riding: boolean;
  /** 바다 보기·망원경 같은 바라보는 장면 중 (view:busy) */
  viewing: boolean;
  /** 창(dialog)이나 메뉴가 떠 있음, 게임 키가 막혀 있음 */
  covered: boolean;
  /** 내 집 꾸미기 중 */
  houseEditing: boolean;
};

/** 지금 촬영 모드를 열 수 있는지 */
export function photoAllowed(g: PhotoGate): boolean {
  return g.ready && (g.scene === undefined || PHOTO_SCENES.has(g.scene)) && !g.riding && !g.viewing && !g.covered && !g.houseEditing;
}

export type PhotoKeyEvent = Pick<KeyboardEvent, "code" | "key" | "type" | "repeat" | "ctrlKey" | "metaKey" | "altKey" | "isComposing">;

/**
 * 촬영 모드 단축키. K(keydown) = 열고 닫기, PrintScreen(keyup — 윈도우에서만 잡혀요) = 열기.
 * 채팅 입력칸에 쓰는 중(editable)·IME 조합 중·조합 키(Ctrl 등)는 무시해요. 열기는 photoAllowed일 때만.
 */
export function photoKeyAction(e: PhotoKeyEvent, editable: boolean, photoOn: boolean, gate: PhotoGate): "open" | "close" | null {
  if (e.isComposing || e.key === "Process" || e.ctrlKey || e.metaKey || e.altKey || editable) return null;
  if (e.code === "KeyK" && e.type === "keydown" && !e.repeat) {
    if (photoOn) return "close";
    return photoAllowed(gate) ? "open" : null;
  }
  if (e.code === "PrintScreen" && e.type === "keyup" && !photoOn) return photoAllowed(gate) ? "open" : null;
  return null;
}

/**
 * 촬영 모드 중에도 그대로 가는 키 (단추 사이 옮겨 다니기만). 11/19 사용자: 촬영 중엔 내 캐릭터는 그 자리에 멈춰 있어요 —
 * 걷기·달리기·점프·앉기·말 걸기·채팅·창 단축키를 모두 막아요 (Esc·K는 촬영 모드가 받아요). 다른 사람·NPC는 평소처럼 움직여요
 */
export const PHOTO_PASS_CODES: ReadonlySet<string> = new Set(["Tab"]);

/** 촬영 모드 중 keydown 하나: pass = 그대로 보내요, block = 막아요, exit = 촬영 모드 끝내기 (Esc·K) */
export function photoModeKey(e: PhotoKeyEvent, editable: boolean): "pass" | "block" | "exit" {
  if (editable || e.ctrlKey || e.metaKey || e.altKey) return "pass";
  if (e.code === "Escape" || e.code === "KeyK") return e.repeat || e.isComposing ? "block" : "exit";
  return PHOTO_PASS_CODES.has(e.code) ? "pass" : "block";
}

/** 시간대 미리보기 (lib/ambience 하늘 이름 차례와 같게). hour = 그 시간대 가운데쯤 KST 시각 */
export const PHOTO_TIMES = [
  { id: "dawn", label: "새벽", hour: 6 },
  { id: "morning", label: "아침", hour: 8.5 },
  { id: "noon", label: "점심", hour: 12.5 },
  { id: "afternoon", label: "오후", hour: 15.5 },
  { id: "dusk", label: "해질녘", hour: 18.3 },
  { id: "night", label: "밤", hour: 22 },
] as const;
export type PhotoTime = (typeof PHOTO_TIMES)[number]["id"];

export const PHOTO_WEATHERS: readonly { id: Weather; label: string }[] = [
  { id: "clear", label: "맑음" },
  { id: "cloudy", label: "흐림" },
  { id: "fog", label: "안개" },
  { id: "rain", label: "비" },
  { id: "snow", label: "눈" },
];

export type PhotoFilters = {
  /** 이름표 보이기 */
  names: boolean;
  /** 내 캐릭터 보이기 (내 화면에서만) */
  me: boolean;
  /** null = 지금 시간 그대로 */
  time: PhotoTime | null;
  /** null = 지금 날씨 그대로 */
  weather: Weather | null;
};

/** 촬영 모드를 열 때·끝낼 때의 필터 (모두 평소 그대로) */
export const PHOTO_DEFAULT: PhotoFilters = { names: true, me: true, time: null, weather: null };

/** 평소와 다른 필터가 하나라도 있는지 ([모두 되돌리기]를 보일지) */
export function photoFiltered(f: PhotoFilters): boolean {
  return !f.names || !f.me || f.time !== null || f.weather !== null;
}

/** 시간대·날씨 필터 → 하늘 덮어쓰기 (lib/ambience AmbienceOverride 꼴). 둘 다 없으면 null = 미리보기 끔 */
export function photoAmbience(f: Pick<PhotoFilters, "time" | "weather">): { hour?: number; weather?: Weather } | null {
  const hour = f.time ? PHOTO_TIMES.find((t) => t.id === f.time)?.hour : undefined;
  const weather = f.weather ?? undefined;
  if (hour === undefined && weather === undefined) return null;
  return { ...(hour !== undefined ? { hour } : {}), ...(weather ? { weather } : {}) };
}

const KST_OFFSET = 9 * 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");

/** 저장 파일 이름: 게임 이름_KST 날짜_시각 (AtOneTime_2026-11-19_031522.png) */
export function photoFileName(now: number): string {
  const d = new Date(now + KST_OFFSET);
  const date = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const time = `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `AtOneTime_${date}_${time}.png`;
}

/** 사진 긴 변 상한 (큰 모니터에서 2배면 너무 커요) */
export const PHOTO_MAX_SIDE = 4096;

/** 사진 배율: 2배 (긴 변이 PHOTO_MAX_SIDE를 넘으면 1배). 픽셀 아트라 칸이 고르게 정수 배로만 늘려요 */
export function photoScale(w: number, h: number): 1 | 2 {
  return Math.max(w, h) * 2 <= PHOTO_MAX_SIDE ? 2 : 1;
}
