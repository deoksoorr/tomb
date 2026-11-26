import { bystanderGain } from "./rides";
import { RideSound } from "./RideSound";

// 11/26 배 공용 효과음 (마을 조각배·바닷가 카약과 같은 파일: /sfx/boat-board · /sfx/row — RideSound 효과음 갈래).
// 새 배는 이걸 쓰면 탈 때·내릴 때·노 젓는 소리와 구경꾼 거리 규칙(놀거리 공통 rides.bystanderGain)이 저절로 맞는다.
//  - 탄 사람(그 배에 내가 있으면)은 그대로, 물가 구경꾼은 바로 옆에서만 작게
//  - 노 젓는 박자는 배 속도를 따라간다 (빠를수록 촘촘히). 멈추면 소리도 멈추고, 한 박자 넘게 쉬었다 다시 저으면 첫 노는 바로
//  - 내가 안 탄 배는 남이 탄 직후 잠깐 노 소리 없음 (그 배 위치는 남의 아바타 보간이라 선착장 → 배 자리로 옮겨 앉는 게 「움직임」으로 잡힌다)

export const BOAT_BOARD_SFX = { gain: 0.55, rate: 1.05 } as const;
export const BOAT_LEAVE_SFX = { gain: 0.45, rate: 1.1 } as const;
export const BOAT_ROW_GAIN = 0.5;
/** 이보다 느리면 노를 안 젓는 것으로 본다 (px/s, 배 그림의 노 젓기 기준과 같다) */
export const BOAT_ROW_MIN_SPEED = 6;
/** 노 한 번 간격: 제 속도일 때 · 막 출발하거나 거의 멈췄을 때 (ms) */
export const BOAT_STROKE_FAST_MS = 520;
export const BOAT_STROKE_SLOW_MS = 900;
/** 남이 탄 직후 노 소리를 쉬는 시간 (ms, 옮겨 앉는 보간 + 속도 평활이 가라앉는 데 ~1초) */
export const BOAT_BOARD_QUIET_MS = 1200;

/** 노 젓는 간격 (ms): speed가 top에 가까울수록 FAST, BOAT_ROW_MIN_SPEED 가까이면 SLOW */
export function rowStrokeMs(speed: number, top: number): number {
  const span = Math.max(1, top - BOAT_ROW_MIN_SPEED);
  const k = Math.max(0, Math.min(1, (speed - BOAT_ROW_MIN_SPEED) / span));
  return Math.round(BOAT_STROKE_SLOW_MS + (BOAT_STROKE_FAST_MS - BOAT_STROKE_SLOW_MS) * k);
}

/** 들리는 배율: 그 배에 탄 사람 1, 구경꾼은 거리 d(px)로 0..RIDE_BYSTANDER_GAIN */
export function boatHearGain(onBoat: boolean, d: number): number {
  return onBoat ? 1 : bystanderGain(d);
}

type Player = Pick<RideSound, "play" | "destroy">;
type DevLog = { at: number; ev: "board" | "leave" | "row"; key: string; gain: number; onBoat: boolean }[];

export class BoatSfx {
  /** 배마다 다음 노 소리 때 (scene ms) */
  private readonly next = new Map<string, number>();

  constructor(private readonly sound: Player = new RideSound()) {}

  /** 누가 배에 탔다 (onBoat: 내가 그 배에 있다 · d: 나와 배 거리 · now: scene ms) */
  board(key: string, onBoat: boolean, d: number, now: number): void {
    if (!onBoat) this.next.set(key, Math.max(this.next.get(key) ?? 0, now + BOAT_BOARD_QUIET_MS));
    this.emit("board", key, BOAT_BOARD_SFX.gain * boatHearGain(onBoat, d), BOAT_BOARD_SFX.rate, onBoat);
  }

  /** 누가 배에서 내렸다 */
  leave(key: string, onBoat: boolean, d: number): void {
    this.emit("leave", key, BOAT_LEAVE_SFX.gain * boatHearGain(onBoat, d), BOAT_LEAVE_SFX.rate, onBoat);
  }

  /** 매 프레임 배마다: 움직이면 속도 박자로 노 소리 (top: 그 배의 제 속도 px/s) */
  row(key: string, now: number, speed: number, top: number, onBoat: boolean, d: number): void {
    // 멈추면 조용 (박자는 그대로 둔다 — 보간 흔들림으로 잠깐 느려졌다 다시 빨라져도 노 소리가 겹쳐 나지 않게)
    if (!(speed > BOAT_ROW_MIN_SPEED)) return;
    const at = this.next.get(key);
    if (at !== undefined && now < at) return;
    this.next.set(key, now + rowStrokeMs(speed, top));
    this.emit("row", key, BOAT_ROW_GAIN * boatHearGain(onBoat, d), 0.9 + Math.random() * 0.2, onBoat);
  }

  private emit(ev: DevLog[number]["ev"], key: string, gain: number, rate: number, onBoat: boolean): void {
    if (gain <= 0.01) return;
    this.sound.play(ev === "row" ? "row" : "boat-board", gain, rate);
    devLog(ev, key, gain, onBoat);
  }

  destroy(): void {
    this.next.clear();
    this.sound.destroy();
  }
}

/** 개발 서버에서만: 배 소리가 난 때를 window.__tombBoatSfx에 남긴다 (브라우저 확인용, 실서버 빌드에서는 빠진다) */
function devLog(ev: DevLog[number]["ev"], key: string, gain: number, onBoat: boolean): void {
  if (process.env.NODE_ENV === "production" || typeof window === "undefined") return;
  const w = window as unknown as { __tombBoatSfx?: DevLog };
  const log = (w.__tombBoatSfx ??= []);
  log.push({ at: Math.round(performance.now()), ev, key, gain: Math.round(gain * 1000) / 1000, onBoat });
  if (log.length > 300) log.splice(0, log.length - 300);
}
