"use client";

import { SELL_RATE } from "@/lib/rpg/character";
import type { RpgView } from "@/lib/rpg/types";
import c from "./HuntCap.module.css";

// 오늘 사냥 포인트 막대: "오늘 사냥 포인트 n / 600P". 숫자는 서버가 준 view.today (economy.ts의 hunt dailyMax와 오늘 받은 양).
// 한도에 닿으면 주운 물건은 내일 팔 수 있다고 안내한다 (산 장비 되팔기는 환불이라 한도와 상관없다).

type Where = "start" | "bag" | "result";

const FULL_TEXT: Record<Where, string> = {
  start: "그래도 사냥은 할 수 있어요 — EXP와 주운 물건은 그대로 받아요.",
  bag: "주운 장비·물약은 지금 팔면 값을 못 받아 가방에 그대로 남아요.",
  result: "이번 판 EXP와 주운 물건은 그대로 받았어요.",
};

export default function HuntCapMeter({ today, where }: { today: RpgView["today"]; where: Where }) {
  const got = Math.min(today.huntPoints, today.cap);
  const left = Math.max(0, today.cap - got);
  const ratio = today.cap ? got / today.cap : 1;
  const full = left === 0;
  const near = !full && ratio >= 0.85;
  const refund = `${Math.round(SELL_RATE * 100)}%`;
  return (
    <div className={c.box} data-full={full || undefined} data-near={near || undefined}>
      <div className={c.head}>
        <span className={c.label}>오늘 사냥 포인트</span>
        <span className={c.nums}>
          <b>{got.toLocaleString("ko-KR")}</b> / {today.cap.toLocaleString("ko-KR")}P
        </span>
        <span className={c.left}>{full ? "오늘 한도 끝" : `${left.toLocaleString("ko-KR")}P 더 받을 수 있어요`}</span>
      </div>
      <div
        className={c.bar}
        role="meter"
        aria-label="오늘 사냥 포인트"
        aria-valuemin={0}
        aria-valuemax={today.cap}
        aria-valuenow={got}
        aria-valuetext={`${got} / ${today.cap}P`}
      >
        <span style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      {full ? (
        <p className={c.msg} role="status">
          <b>오늘 사냥으로 받을 수 있는 포인트를 다 받았어요</b> — 주운 물건은 내일 팔 수 있어요 (상점에서 산 장비는 지금도 {refund} 환불). {FULL_TEXT[where]} 한도는 내일 0시(한국 시간)에
          다시 차요.
        </p>
      ) : near ? (
        <p className={c.msg}>곧 오늘 한도예요. 한도를 넘는 포인트는 내일 다시 받을 수 있어요.</p>
      ) : null}
    </div>
  );
}
