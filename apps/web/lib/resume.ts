// 새로고침(업데이트·F5) 뒤 같은 채널·같은 자리로 돌아오기 위한 기록 (sessionStorage, 탭 하나에만 산다).
//  - 페이지가 내려가기 직전(pagehide)에 월드 씬이 저장한다: 채널·위치·좌석·자세(앉기·그네·매달리기)·방향 + 입장 정보
//  - 다시 열리면 App이 읽자마자 지운다. 탭을 복제하면 sessionStorage가 복사되므로, 남겨 두면 두 탭이 같은 자리로 돌아온다
//  - 1분이 지난 기록은 버린다 (새로고침이 아니라 한참 뒤에 다시 연 것)
//  - 좌석은 서버가 최종 판정한다: 그 사이 다른 사람이 앉았으면 가까운 빈자리, 없으면 그 옆에 선다 (WorldScene)
//  - 맵 배치 버전(MAP_VERSION)이 다른 기록(맵 개편 전 화면이 남긴 것)은 채널·입장 정보만 쓰고 자리는 입구(SPAWN)에서 시작한다

import { MAP_VERSION, SPAWN } from "@tomb/protocol";

export const RESUME_KEY = "tomb.resume";
/** 이보다 오래된 기록은 쓰지 않는다 */
export const RESUME_MAX_AGE_MS = 60_000;

/** 되살릴 자세. 걷던 중이면 서 있는 것으로 저장한다 */
export type ResumePose = "idle" | "sitGround" | "sitChair" | "swing" | "hang" | "hammock";
const POSES: readonly ResumePose[] = ["idle", "sitGround", "sitChair", "swing", "hang", "hammock"];

export type ResumeState = {
  channel: number;
  x: number;
  y: number;
  /** sitChair일 때 앉아 있던 좌석 */
  seatId: string | null;
  pose: ResumePose;
  dir: number;
  savedAt: number;
  /** 입장 화면을 건너뛰고 바로 들어가기 위한 입장 정보 */
  name: string;
  color: string;
  body?: string;
  /** 음악을 틀어 두고 있었는지 (자동 재생은 막혀 있어 첫 입력 때 다시 튼다) */
  bgm?: boolean;
  /** 저장할 때의 맵 배치 버전 (MAP_VERSION). 다르면 자리는 버린다 */
  map?: number;
};

const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** 저장된 문자열 → 기록. 형식이 틀렸거나 오래됐으면 null */
export function parseResume(raw: string | null, now: number): ResumeState | null {
  if (!raw) return null;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  if (!isNum(r.savedAt) || now - r.savedAt > RESUME_MAX_AGE_MS || r.savedAt - now > 5_000) return null;
  if (!isNum(r.channel) || !Number.isInteger(r.channel) || r.channel < 1) return null;
  if (!isNum(r.x) || !isNum(r.y) || r.x < 0 || r.y < 0 || r.x > 0xffff || r.y > 0xffff) return null;
  if (typeof r.name !== "string" || !r.name || typeof r.color !== "string" || !r.color) return null;
  // 맵이 바뀐 뒤의 옛 기록: 채널은 잇고 자리는 입구에서 (옛 좌표·좌석 id는 새 맵에서 엉뚱한 곳일 수 있다)
  const sameMap = r.map === MAP_VERSION;
  const pose = sameMap && POSES.includes(r.pose as ResumePose) ? (r.pose as ResumePose) : "idle";
  const seatId = pose === "sitChair" && typeof r.seatId === "string" && r.seatId ? r.seatId : null;
  return {
    channel: r.channel,
    x: sameMap ? r.x : SPAWN.x,
    y: sameMap ? r.y : SPAWN.y,
    seatId,
    pose: pose === "sitChair" && !seatId ? "sitGround" : pose,
    dir: isNum(r.dir) && Number.isInteger(r.dir) && r.dir >= 0 && r.dir <= 3 ? r.dir : 0,
    savedAt: r.savedAt,
    name: r.name,
    color: r.color,
    body: typeof r.body === "string" ? r.body : undefined,
    bgm: r.bgm === true,
    map: MAP_VERSION,
  };
}

/** 저장된 기록을 읽고 바로 지운다 (탭 복제로 같은 기록이 두 번 쓰이지 않게) */
export function takeResume(now: number, storage: Pick<Storage, "getItem" | "removeItem"> | null = sessionStore()): ResumeState | null {
  if (!storage) return null;
  let raw: string | null = null;
  try {
    raw = storage.getItem(RESUME_KEY);
    storage.removeItem(RESUME_KEY);
  } catch {
    return null;
  }
  return parseResume(raw, now);
}

let boot: ResumeState | null | undefined;
/**
 * 이 페이지가 열릴 때의 기록 (처음 부를 때 한 번 읽고 지운 뒤 계속 같은 값). useSyncExternalStore의 스냅샷으로 쓴다.
 * 서버에서는 null.
 */
export function bootResume(): ResumeState | null {
  if (boot === undefined) boot = typeof window === "undefined" ? null : takeResume(Date.now());
  return boot;
}

/** 저장 때 함께 실을 값 (UI 쪽: 음악 재생 여부 등). 게임은 UI 모듈을 모르므로 여기서 이어 준다 */
let extras: () => Partial<Pick<ResumeState, "bgm">> = () => ({});
export function setResumeExtras(fn: () => Partial<Pick<ResumeState, "bgm">>): void {
  extras = fn;
}

export function saveResume(s: Omit<ResumeState, "bgm" | "map">, storage: Pick<Storage, "setItem"> | null = sessionStore()): void {
  if (!storage) return;
  try {
    storage.setItem(RESUME_KEY, JSON.stringify({ ...s, ...extras(), map: MAP_VERSION }));
  } catch {
    // 저장소를 못 쓰면 입구에서 다시 시작할 뿐이다
  }
}

/** bfcache로 되살아난 페이지: 나갈 때 남긴 기록은 쓸 일이 없다 → 지운다 */
export function dropResume(storage: Pick<Storage, "removeItem"> | null = sessionStore()): void {
  try {
    storage?.removeItem(RESUME_KEY);
  } catch {
    // 무시
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}
