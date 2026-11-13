"use client";

import { PHASE_LABELS, WEATHER_LABELS } from "@/lib/ambience";
import { ATTEND_STAY_MINUTES, attendLeftText } from "@/lib/attendStay";
import { DAILY_EARN_CAP } from "@/lib/economy";
import { useAmbience } from "@/lib/hooks/useAmbience";
import { useBridgeValue } from "@/lib/hooks/useBridge";
import { useMe } from "@/lib/hooks/useMe";
import { FactGrid } from "../ui/InfoBlocks";

export type TodayFact = "attend" | "cap" | "channel" | "sky";
const ALL: readonly TodayFact[] = ["attend", "cap", "channel", "sky"];

/** 오늘의 정보 칸: 출석 · 남은 포인트 한도 · 지금 채널 · 날씨/시간대 (메뉴·선물함이 같이 쓴다) */
export default function TodayFacts({ show = ALL }: { show?: readonly TodayFact[] }) {
  const { me } = useMe();
  const ambience = useAmbience();
  const status = useBridgeValue("net:status");
  const att = me?.attendance;
  const left = me ? Math.max(0, DAILY_EARN_CAP - me.todayEarned) : null;
  const facts = {
    attend: {
      label: "오늘 출석",
      value: !att ? "…" : att.today ? "도장 찍음" : att.stayMinutes >= ATTEND_STAY_MINUTES ? "받을 수 있어요" : "아직",
      note: !att
        ? undefined
        : att.today
          ? `${att.streak}일 연속 출석 중`
          : attendLeftText(att.stayMinutes),
      tone: att?.today ? ("good" as const) : att && att.stayMinutes >= ATTEND_STAY_MINUTES ? ("warn" as const) : undefined,
    },
    cap: {
      label: "오늘 남은 포인트 한도",
      value: left === null ? "…" : `${left.toLocaleString("ko-KR")}P`,
      note: me ? `오늘 ${me.todayEarned.toLocaleString("ko-KR")}/${DAILY_EARN_CAP.toLocaleString("ko-KR")}P 모음 · 자정에 다시 차요` : undefined,
      tone: left === 0 ? ("warn" as const) : undefined,
    },
    channel: {
      label: "지금 채널",
      value: status?.channel ? `${status.channel}채널` : "연결 중",
      note: status?.channel ? `${status.count}/${status.cap}명이 함께 있어요` : undefined,
    },
    sky: {
      label: "날씨·시간대",
      value: ambience ? `${PHASE_LABELS[ambience.phase]} · ${WEATHER_LABELS[ambience.weather]}` : "…",
      note: ambience?.phase === "night" ? "맑은 밤이면 망원경 포인트가 늘어요" : "한국 시간 기준으로 바뀌어요",
    },
  } as const;
  return <FactGrid facts={show.map((k) => facts[k])} />;
}
