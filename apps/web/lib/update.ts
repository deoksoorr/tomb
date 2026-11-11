import { CLIENT_VERSION } from "@tomb/protocol";
import type { BusyState } from "./busy";

// 새 버전 안내·자동 새로고침 판정 (순수 함수). 화면은 components/overlay/UpdateNotice.tsx.
//  - patch(평소 패치): 아래 고정 배너. 3분 동안 입력이 없으면 자동 새로고침.
//    탭이 숨겨져 있으면 그동안은 새로고침하지 않고, 돌아온 순간(입력 전) 바로 새로고침한다 —
//    숨은 탭은 브라우저가 화면 갱신을 멈춰 게임이 뜨지 못하고, 그 사이 남들 화면에서 내 아바타가 사라지기 때문.
//    사냥·미니게임·묘비 작성·저장 안 한 입력이 있으면 기다린다.
//  - required(큰 패치: 최소 클라이언트 버전 미달): 게임을 가리는 창 + 10초 뒤 자동 새로고침.
//    조작 중이어도 진행하되 사냥 한 판·묘비 작성 폼은 끝날 때까지 기다린다.
//    실시간 서버만 먼저 바뀌어 아직 새 웹 배포가 없으면(새로고침해도 같은 화면) 배포가 보일 때까지 기다린다.

export type UpdateLevel = "none" | "patch" | "required";

/** 이만큼 입력이 없으면 평소 패치를 자동으로 적용한다 */
export const IDLE_RELOAD_MS = 3 * 60_000;
/** 큰 패치 안내 창의 카운트다운 */
export const REQUIRED_COUNTDOWN_MS = 10_000;
/** 숨겨 둔 탭으로 돌아온 뒤 이 시간 안(그리고 입력 전)이면 바로 적용한다 */
export const RETURN_WINDOW_MS = 10_000;
/** 버전 확인 주기: 보이는 탭 / 숨은 탭 / 새 배포를 기다리는 중 */
export const CHECK_VISIBLE_MS = 2 * 60_000;
export const CHECK_HIDDEN_MS = 5 * 60_000;
export const CHECK_WAITING_MS = 15_000;

export type VersionInfo = { version: string; minClient?: number };

/**
 * /api/version 응답 → 안내 단계. baseline = 이 화면의 빌드 배포 id (없으면 처음 받은 값).
 * deployReady = 새로고침하면 실제로 다른 빌드를 받는지.
 */
export function versionLevel(
  baseline: string,
  info: VersionInfo,
  myClient: number = CLIENT_VERSION,
): { level: UpdateLevel; deployReady: boolean } {
  const deployReady = info.version !== baseline;
  if (typeof info.minClient === "number" && info.minClient > myClient) return { level: "required", deployReady };
  return { level: deployReady ? "patch" : "none", deployReady };
}

export type UpdateInput = {
  level: UpdateLevel;
  now: number;
  /** 마지막 입력(키·포인터·휠·터치) 시각 */
  lastInputAt: number;
  hidden: boolean;
  /** 숨은 탭에서 다시 보이게 된 시각 (없으면 null) */
  returnedAt: number | null;
  busy: BusyState;
  /** required 안내를 띄운 시각 (카운트다운 시작) */
  requiredAt: number | null;
  deployReady: boolean;
};

export function decideUpdate(i: UpdateInput): "wait" | "reload" {
  if (i.level === "none" || !i.deployReady) return "wait";
  if (i.level === "required") {
    if (i.busy.hard || i.requiredAt === null) return "wait";
    return i.now - i.requiredAt >= REQUIRED_COUNTDOWN_MS ? "reload" : "wait";
  }
  if (i.busy.hard || i.busy.soft || i.hidden) return "wait";
  if (i.returnedAt !== null && i.now - i.returnedAt <= RETURN_WINDOW_MS && i.lastInputAt < i.returnedAt) return "reload";
  return i.now - i.lastInputAt >= IDLE_RELOAD_MS ? "reload" : "wait";
}

/** 카운트다운 남은 초 (표시용) */
export function countdownLeft(requiredAt: number | null, now: number): number {
  if (requiredAt === null) return Math.ceil(REQUIRED_COUNTDOWN_MS / 1000);
  return Math.max(0, Math.ceil((REQUIRED_COUNTDOWN_MS - (now - requiredAt)) / 1000));
}
