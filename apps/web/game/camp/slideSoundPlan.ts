import { isSnowy, type MapConcept } from "@/lib/mapConcept";
import { sledPath, slidePath, slideRidePose, slideTimeline } from "./campPlayPath";
import type { SlideCue, SlideKind } from "./slideSynth";

// 11/26 미끄럼 효과음이 언제·얼마나 나는지 (순수 함수 — slideSound.test가 본다).
// 내가 탈 때는 타는 박자(slideTimeline)를 그대로 따르고, 다른 사람은 보이는 자리·빠르기로 같은 소리를 고른다.

export type SlideVoice = { kind: SlideKind; bells: boolean };

/** 맵 컨셉 → 소리: 겨울·크리스마스는 눈썰매(크리스마스는 앉을 때 작은 썰매 방울), 기본은 워터 슬라이드 */
export function slideVoiceOf(concept: MapConcept): SlideVoice {
  return { kind: isSnowy(concept) ? "sled" : "water", bells: concept === "christmas" };
}

/** 이보다 한 프레임이 길면(탭을 숨겼다 돌아옴 등) 밀린 한 번 소리는 건너뛴다 */
const STALE_MS = 400;

/** 내가 탄 지 prevT → t ms 사이에 나는 한 번 소리 (prevT < 0: 막 탔다) */
export function slideCuesBetween(prevT: number, t: number, snowy: boolean): SlideCue[] {
  if (prevT >= 0 && t - prevT > STALE_MS) return [];
  const tl = slideTimeline(snowy);
  const out: SlideCue[] = [];
  if (prevT < 0 && t >= 0) out.push("climb");
  if (prevT < tl.sitAt && t >= tl.sitAt) out.push("sit");
  if (prevT < tl.endAt && t >= tl.endAt) out.push("land");
  return out;
}

const poseSpeed = (t: number, snowy: boolean, dt = 10): number => {
  const a = slideRidePose(t, snowy);
  const b = slideRidePose(t + dt, snowy);
  return (Math.hypot(b.x - a.x, b.y - a.y) / dt) * 1000;
};

function topSpeed(snowy: boolean): number {
  const tl = slideTimeline(snowy);
  let max = 1;
  for (let t = tl.startAt; t < tl.endAt - 10; t += 10) max = Math.max(max, poseSpeed(t, snowy));
  return max;
}

/** 미끄러질 때 가장 빠른 속도 (px/s — 길·가속 식에서 잰다) */
export const SLIDE_TOP_SPEED: Readonly<Record<SlideKind, number>> = { sled: topSpeed(true), water: topSpeed(false) };

/** 속도 px/s → 0..1 */
export function slideSpeed01(pxPerSec: number, kind: SlideKind): number {
  if (!Number.isFinite(pxPerSec) || pxPerSec <= 0) return 0;
  return Math.min(1, pxPerSec / SLIDE_TOP_SPEED[kind]);
}

/** 내가 탄 지 t ms: 내려가는 소리 빠르기 0..1 (미끄러지는 동안만, 그 밖은 0) */
export function slideRunSpeed(t: number, snowy: boolean): number {
  const tl = slideTimeline(snowy);
  if (t < tl.startAt || t >= tl.endAt) return 0;
  return slideSpeed01(poseSpeed(t, snowy), snowy ? "sled" : "water");
}

// ── 다른 사람이 탈 때 (보이는 자리로) ──

/** 사다리·언덕 오르는 중 / 미끄럼 위(앉음·미끄러짐) / 풀 안 */
export type RemoteSlidePhase = "climb" | "ride" | "pool";

export type RemoteSlideTrack = {
  x: number;
  y: number;
  phase: RemoteSlidePhase;
  /** 고른 빠르기 px/s */
  speed: number;
  /** 미끄럼 출발점보다 아래로 내려왔다 (내려가는 중) */
  descending: boolean;
  landed: boolean;
  /** 내려가다 멈춰 있는 시간 (눈썰매가 언덕 밑에 섰는지) */
  stillMs: number;
};

/** 이보다 한 프레임에 많이 움직이면 순간이동으로 보고 빠르기를 다시 잰다 */
const JUMP_PX = 30;
/** 빠르기를 고르는 시간 상수 (ms) */
const SMOOTH_MS = 80;
/** 출발점보다 이만큼 아래면 내려가는 중 */
const DESCEND_DY = 4;
/** 눈썰매: 내려가다 이만큼 느려진 채로 STILL_MS가 지나면 언덕 밑에 닿은 것 (보간이 잠깐 멈춘 것과 헷갈리지 않게 몇 프레임) */
const STILL_SPEED = 0.12;
const STILL_MS = 110;

const startY = (kind: SlideKind) => (kind === "sled" ? sledPath(0).y : slidePath(0).y);

export type RemoteSlideStep = { track: RemoteSlideTrack; cues: SlideCue[]; /** 내려가는 소리 빠르기 0..1 (안 내려가면 0) */ run: number };

/** 다른 사람이 미끄럼 자리에 있는 한 프레임 (prev = 지난 프레임, 처음이면 null) */
export function trackRemoteSlide(prev: RemoteSlideTrack | null, x: number, y: number, phase: RemoteSlidePhase, dtMs: number, kind: SlideKind): RemoteSlideStep {
  const cues: SlideCue[] = [];
  if (!prev) {
    // 사다리 밑에서 막 탔으면 오르는 소리 (맵에 들어와 보니 이미 내려가는 중이면 소리 없이 따라만 간다)
    if (phase === "climb") cues.push("climb");
    const descending = phase !== "climb" && y > startY(kind) + DESCEND_DY;
    return { track: { x, y, phase, speed: 0, descending, landed: phase === "pool", stillMs: 0 }, cues, run: 0 };
  }
  const dt = Math.max(1, dtMs);
  const d = Math.hypot(x - prev.x, y - prev.y);
  const inst = d > JUMP_PX ? 0 : (d / dt) * 1000;
  const speed = d > JUMP_PX ? 0 : prev.speed + (inst - prev.speed) * Math.min(1, dt / SMOOTH_MS);
  const s01 = slideSpeed01(speed, kind);
  const track: RemoteSlideTrack = { ...prev, x, y, phase, speed };
  if (prev.phase === "climb" && phase === "ride") cues.push("sit");
  if (phase !== "climb" && y > startY(kind) + DESCEND_DY) track.descending = true;
  if (track.descending && !track.landed) {
    if (kind === "water") {
      if (phase === "pool") {
        track.landed = true;
        cues.push("land");
      }
    } else {
      // 멈춤은 이번 프레임 빠르기로 (고른 빠르기는 늦게 줄어 닿는 소리가 늦어진다)
      track.stillMs = slideSpeed01(inst, kind) < STILL_SPEED ? prev.stillMs + dt : 0;
      if (track.stillMs >= STILL_MS) {
        track.landed = true;
        cues.push("land");
      }
    }
  }
  const run = phase === "ride" && track.descending && !track.landed ? s01 : 0;
  return { track, cues, run };
}

/** 다른 사람이 미끄럼 자리에서 내렸다: 내려가던 중이면(닿는 소리를 아직 안 냈으면) 닿는 소리 */
export function endRemoteSlide(track: RemoteSlideTrack | null): SlideCue[] {
  return track && track.descending && !track.landed ? ["land"] : [];
}
