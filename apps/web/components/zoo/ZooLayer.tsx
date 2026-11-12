"use client";

import { useState } from "react";
import { itemById } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import s from "./zoo.module.css";
import ZooDialog from "./ZooDialog";

// 동물원 UI의 뿌리 (GameShell이 게임이 뜨면 붙인다).
//  - 사육사 앞에서 E → 게임이 zoo:open → 분양 창
//  - 타는 펫을 데리고 있으면 화면 오른쪽 아래 "타기" 버튼 (데스크톱은 R 키와 같다). 상태는 게임의 ride:state(sticky)

export default function ZooLayer() {
  const [open, setOpen] = useState(false);
  const [ride, setRide] = useState(() => bridge.last("ride:state") ?? null);
  const [scene, setScene] = useState(() => bridge.last("scene:changed")?.scene ?? "world");

  useBridgeEvent("zoo:open", () => setOpen(true));
  useBridgeEvent("ride:state", (r) => setRide(r));
  useBridgeEvent("scene:changed", (e) => setScene(e.scene));

  const name = ride?.pet ? (itemById(ride.pet)?.name ?? "펫") : null;
  return (
    <>
      {open && <ZooDialog onClose={() => setOpen(false)} />}
      {ride?.pet && name && scene === "world" && (
        <button
          type="button"
          className={s.ride}
          aria-pressed={ride.riding}
          disabled={!ride.riding && !ride.can}
          onClick={(e) => {
            e.currentTarget.blur();
            bridge.emit("input:ride");
          }}
          aria-label={ride.riding ? `${name}에서 내리기` : `${name}에 올라타기`}
          title={ride.riding ? "내리기 (R)" : "올라타기 (R)"}
        >
          {ride.riding ? "내리기" : "타기"} <kbd>R</kbd>
        </button>
      )}
    </>
  );
}
