"use client";

import { useId, useState } from "react";
import type { ChairMode } from "@/lib/chairman/rules";
import WeeklyRace from "../grave/WeeklyRace";
import ChairRank from "./ChairRank";
import s from "./ChairEntry.module.css";

// 11/20 이번 주 레이스 창 (U) 탭: [이번 주 레이스] [회장님 독대]. 회장님 독대는 노멀·헬 이번 주 상위 50명 + 내 줄 (ChairRank). 두 탭 모두 남은 시간 줄(RaceCountdown)이 있다.

export type RaceTab = "race" | "chair";
let next: { tab: RaceTab; mode: ChairMode } | null = null;
/** 다음에 열리는 레이스 창의 탭 (입장 창 [이번 주 순위]) */
export const openRaceTab = (tab: RaceTab, mode: ChairMode = "normal") => void (next = { tab, mode });

export default function RaceWindow() {
  const [init] = useState(() => {
    const n = next ?? { tab: "race" as RaceTab, mode: "normal" as ChairMode };
    next = null;
    return n;
  });
  const [tab, setTab] = useState<RaceTab>(init.tab);
  const id = useId();
  return (
    <div>
      <div className={s.raceTabs} role="tablist" aria-label="레이스 종류">
        {(
          [
            ["race", "이번 주 레이스"],
            ["chair", "회장님 독대"],
          ] as const
        ).map(([t, label]) => (
          <button key={t} type="button" role="tab" id={`${id}-${t}`} aria-selected={tab === t} aria-controls={`${id}-panel`} className={s.raceTab} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab}`}>
        {tab === "race" ? <WeeklyRace /> : <ChairRank initial={init.mode} />}
      </div>
    </div>
  );
}
