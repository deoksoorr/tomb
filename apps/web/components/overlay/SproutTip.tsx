"use client";

import { useState } from "react";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { SproutBubble } from "../ui/SproutMark";

// 11/22 머리 위 새싹 말풍선: 게임이 새싹에 마우스를 올리거나(데스크톱) 누르면(폰) 화면 자리를 알려 준다 (sprout:tip).
// 그 사람이 움직이면 게임이 매 프레임 새 자리를 보내 따라가고, 닫는 것(마우스가 벗어남·누른 지 잠깐 뒤·새싹이 안 보임)도 게임이 null로 알린다

export default function SproutTip() {
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  useBridgeEvent("sprout:tip", (t) => setTip(t));
  return tip ? <SproutBubble x={tip.x} y={tip.y} /> : null;
}
