import { bridge } from "@/game/bridge";
import { rideBlockReason, rideStatusOf, sameRide } from "./ridePolicy";

// 11/16 다른 장면(사냥터·야근 빌딩·미니게임·집·분양 마을)으로 가는 모든 입구가 함께 쓰는 확인 (규칙은 lib/ridePolicy).
//  - 게임 장면(마을·캠핑장·바닷가)은 매 프레임 publishRide로 내 캐릭터 상태를 알린다 → bridge "player:ride"(sticky)
//  - UI는 들어가기 직전에 rideGate(하려는 일)를 부른다: 탈것이면 안내 토스트를 띄우고 막는다(문구를 돌려준다),
//    자리에 앉아 있으면 "player:stand"로 일으켜 세운 뒤 간다(null)
//  - 버튼을 흐리게 하는 데는 rideBlocked (hooks/useRideBlocked)

/** 장면 쪽 내 캐릭터 (game/entities/Player) 중 여기서 쓰는 것 */
export type RideBody = {
  readonly state: string;
  readonly inBoat: boolean;
  readonly inCar: boolean;
  readonly sitting: boolean;
  readonly anchored: boolean;
  readonly rideLock: boolean;
  leaveAnchor(now: number, hard?: boolean): void;
  stand(now: number, seats: { sit(seatId: string): void; stand(): void } | null): void;
};

/** 장면이 매 프레임 (pet = 타는 펫에 올라타 있음, 11/16 r13 seaRide = 바닷가 튜브·제트스키): 바뀌었을 때만 알린다 */
export function publishRide(pl: RideBody, pet: boolean, seaRide: "tube" | "jetski" | "kayak" | null = null): void {
  const st = rideStatusOf({ state: pl.state, inBoat: pl.inBoat, inCar: pl.inCar, pet, seaRide });
  if (sameRide(bridge.last("player:ride"), st)) return;
  bridge.emit("player:ride", st);
}

/** 장면이 player:stand를 받으면: 의자·벤치·바닥·그네·나무·해먹 같은 자리에서만 일어난다 (탈것은 그대로 — 입구가 먼저 막는다) */
export function standForGate(pl: RideBody, now: number, seats: { sit(seatId: string): void; stand(): void } | null): void {
  if (!rideStatusOf({ state: pl.state, inBoat: pl.inBoat, inCar: pl.inCar, pet: false }).seated) return;
  if (pl.sitting) pl.stand(now, seats);
  else if (pl.anchored && !pl.rideLock) pl.leaveAnchor(now, true);
}

/** 지금 못 가는 이유 (가도 되면 null). todo = 하려는 일 ("사냥터에 갈" …, lib/ridePolicy rideBlockReason) */
export function rideBlocked(todo?: string): string | null {
  return rideBlockReason(bridge.last("player:ride"), bridge.last("bus:state")?.riding === true, todo);
}

/** 들어가기 직전 확인: 막히면 토스트를 띄우고 그 문구를 돌려준다. 가도 되면(앉아 있었으면 일으켜 세우고) null */
export function rideGate(todo?: string): string | null {
  const why = rideBlocked(todo);
  if (why) {
    bridge.emit("toast", { message: why });
    return why;
  }
  if (bridge.last("player:ride")?.seated) bridge.emit("player:stand");
  return null;
}
