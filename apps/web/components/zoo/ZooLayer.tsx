"use client";

import { useState } from "react";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import ZooDialog from "./ZooDialog";

// 동물원 UI의 뿌리 (GameShell이 게임이 뜨면 붙인다).
//  - 사육사 앞에서 E → 게임이 zoo:open → 분양 창
//  - 타기 버튼은 HUD 안에 있다 (RideButton: 데스크톱은 바로 가기 줄 끝, 터치는 행동 버튼 묶음)

export default function ZooLayer() {
  const [open, setOpen] = useState(false);
  useBridgeEvent("zoo:open", () => setOpen(true));
  return open ? <ZooDialog onClose={() => setOpen(false)} /> : null;
}
