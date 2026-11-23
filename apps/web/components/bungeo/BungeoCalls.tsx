"use client";

import { useEffect } from "react";
import { BUNGEO_CALLER, bungeoCallsDue } from "@/lib/bungeo/cart";
import { chatStore } from "../overlay/chatLines";

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
 * 11/22 골목 붕어빵 수레가 열린 밤, 정해진 시각(lib/bungeo/cart bungeoCalls — 22:00 · 00:00)에
 * 지나가는 사람(BUNGEO_CALLER)이 채팅하듯 한 줄 외친다. 서버를 거치지 않고 화면마다 띄우며, 같은 외침은 한 번만(key).
 * 11/23 수레 자리가 마을·바닷가로 바뀌면서 맵을 가리지 않는다 (마을·바닷가·캠핑장 어디서든 들린다 — 실시간 서버 비용 없음)
 */
export default function BungeoCalls() {
  useEffect(() => {
    const tick = () => {
      for (const c of bungeoCallsDue(Date.now() + devOffset())) chatStore.push(BUNGEO_CALLER, c.text, false, c.key);
    };
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, []);
  return null;
}
