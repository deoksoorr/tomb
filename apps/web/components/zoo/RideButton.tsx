"use client";

import { isRideablePet, itemById } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import s from "./zoo.module.css";

/**
 * 타는 펫 타기·내리기 버튼. 탈 수 있는 펫(isRideablePet)을 데리고 메인 맵에 있을 때만 보인다 (타는 중이면 "내리기").
 * 데스크톱은 오른쪽 아래 확대·축소 버튼 왼쪽(R 키와 같다), 터치는 행동 버튼 묶음 안 (MobileControls). 모양은 className으로 받는다.
 * 상태는 게임의 ride:state(sticky)
 */
export default function RideButton({ variant, className }: { variant: "desktop" | "touch"; className?: string }) {
  const ride = useBridgeValue("ride:state");
  const scene = useBridgeValue("scene:changed")?.scene ?? "world";
  const pet = ride?.pet && isRideablePet(ride.pet) ? ride.pet : null;
  if (!ride || !pet || scene !== "world") return null;
  const name = itemById(pet)?.name ?? "펫";
  return (
    <button
      type="button"
      className={cx(variant === "desktop" ? s.rideDesk : s.rideTouch, className)}
      data-slot={variant === "touch" ? "ride" : undefined}
      aria-pressed={ride.riding}
      disabled={!ride.riding && !ride.can}
      onClick={(e) => {
        e.currentTarget.blur();
        bridge.emit("input:ride");
      }}
      aria-label={ride.riding ? `${name}에서 내리기` : `${name}에 올라타기`}
      title={ride.riding ? "내리기 (R)" : ride.can ? "올라타기 (R)" : "지금은 탈 수 없어요 (물·자리·놀이기구에서 내린 뒤)"}
    >
      {ride.riding ? "내리기" : "타기"}
      {variant === "desktop" && <kbd>R</kbd>}
    </button>
  );
}
