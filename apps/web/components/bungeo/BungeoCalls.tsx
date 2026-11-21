"use client";

import { useEffect } from "react";
import { BUNGEO_CALLER, bungeoCalls } from "@/lib/bungeo/cart";
import { gameDay } from "@/lib/gameDay";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { chatStore } from "../overlay/chatLines";

/** 정각이 지난 뒤 이만큼 안에 화면이 켜져 있으면 띄운다 (그 뒤에 들어온 사람에게는 지난 외침을 띄우지 않는다) */
const LATE_MS = 90_000;

/** 개발 서버에서만 수레 시계를 앞당겨 본다 (BungeoCartView와 같은 값 — 운영 빌드는 무시) */
function devOffset(): number {
  if (process.env.NODE_ENV === "production") return 0;
  try {
    const v = Number(window.localStorage.getItem("tomb:dev:bungeoOffset") ?? 0);
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * 11/22 골목 붕어빵 수레가 열린 밤, 마을에 있으면 정해진 시각(lib/bungeo/cart bungeoCalls — 22:00 · 00:00)에
 * 지나가는 사람(BUNGEO_CALLER)이 채팅하듯 한 줄 외친다. 서버를 거치지 않고 화면마다 띄우며, 같은 외침은 한 번만(key)
 */
export default function BungeoCalls() {
  const map = useBridgeValue("map:changed")?.map ?? "village";
  useEffect(() => {
    if (map !== "village") return;
    const tick = () => {
      const now = Date.now() + devOffset();
      for (const c of bungeoCalls(gameDay(now))) if (now >= c.at && now < c.at + LATE_MS) chatStore.push(BUNGEO_CALLER, c.text, false, c.key);
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [map]);
  return null;
}
