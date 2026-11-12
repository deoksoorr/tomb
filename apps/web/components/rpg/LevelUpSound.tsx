"use client";

import { useEffect } from "react";
import { playRpgSoundOnce } from "@/game/rpg/sfx";

/** 16번: 결과 화면에 "레벨 업!"이 뜰 때 한 번 울리는 소리 (그림 없음) */
export default function LevelUpSound({ level }: { level: number }) {
  useEffect(() => {
    playRpgSoundOnce("levelup", 0.8);
  }, [level]);
  return null;
}
