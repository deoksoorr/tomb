"use client";

import { useEffect, useRef } from "react";
import { CHAMP_HAT, CHAMP_TITLE, champBitsOf, champHatOf, DIR, itemName, type ChampBoard } from "@tomb/protocol";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { OutfitStage, STAGE_H, STAGE_W } from "../shop/outfitStage";
import ItemIcon from "../ui/ItemIcon";
import styles from "./WeeklyRace.module.css";

// 레이스 창의 1위 보상 그림: 전용 모자(아이템 아이콘) + 전용 오라 미리보기(상점 입어 보기 무대에 그 랭킹 색 오라) + "이번 주 ○○왕" 배지 + 포인트.
// 오라 미리보기는 은은히 움직이고(초당 약 20장), 움직임 줄이기면 멈춘 그림 한 장.

/** 랭킹별 전용 오라 이름 */
export const CHAMP_AURA_NAME: Record<ChampBoard, string> = { points: "금빛 오라", huntKills: "불꽃 오라", fish: "물결 오라" };
/** 미리보기 유령 색 (뼛빛) */
const GHOST = "#e8d9b0";
const FRAME_MS = 50;

/** 전용 오라 미리보기 (작은 캔버스). bits = 1위 비트 묶음, look = 함께 입힐 꾸미기 */
export function AuraPreview({ bits, look, label, scale = 1, staff = false }: { bits: number; look: readonly string[]; label: string; scale?: number; /** 31번 운영자 오라 */ staff?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const key = look.join(",");
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const stage = new OutfitStage();
    const l = { color: GHOST, body: "hood", look: key ? key.split(",") : [], champ: bits, staff };
    const pose = { dir: DIR.down, walking: false };
    if (reduced) {
      stage.draw(ctx, 0, pose, l, true);
      return;
    }
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      stage.draw(ctx, now, pose, l, false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [bits, key, reduced, staff]);
  return <canvas ref={ref} className={styles.auraCanvas} width={STAGE_W} height={STAGE_H} style={scale === 1 ? undefined : { width: STAGE_W * scale, height: STAGE_H * scale }} role="img" aria-label={label} />;
}

/** 한 랭킹 1위 보상 줄: 오라 미리보기 · 모자 · 배지 · 포인트 (아래에 짧은 이름) */
export function ChampReward({ board, points }: { board: ChampBoard; points: number }) {
  const hat = CHAMP_HAT[board];
  return (
    <div className={styles.rewardRow} aria-label={`1위 보상: ${itemName(hat)} · ${CHAMP_AURA_NAME[board]} · 이번 주 ${CHAMP_TITLE[board]} 배지 · ${points.toLocaleString("ko-KR")}P`}>
      <AuraPreview bits={champBitsOf([board])} look={[hat]} label={`${CHAMP_AURA_NAME[board]} 미리보기`} />
      <div className={styles.rewardItems}>
        <span className={styles.rewardHat}>
          <ItemIcon itemId={hat} size={24} />
          <span className={styles.rewardName}>{itemName(hat)}</span>
        </span>
        <span className={styles.badge} data-board={board}>
          ♛ 이번 주 {CHAMP_TITLE[board]}
        </span>
        <span className={styles.rewardPoints}>+{points.toLocaleString("ko-KR")}P</span>
        <span className={styles.rewardCaption}>
          {itemName(hat)} · {CHAMP_AURA_NAME[board]}
        </span>
      </div>
    </div>
  );
}

/** 여러 랭킹 1위면 합쳐진 오라 하나 + 다관왕 전용 모자: 2관왕 세 조합(두 색 섞임 · 쌍둥이 왕관) + 3관왕(무지개 · 삼관왕 대관) */
const COMBOS: readonly { boards: ChampBoard[]; name: string }[] = [
  { boards: ["points", "huntKills"], name: "포인트왕+사냥왕" },
  { boards: ["points", "fish"], name: "포인트왕+낚시왕" },
  { boards: ["huntKills", "fish"], name: "사냥왕+낚시왕" },
  { boards: ["points", "huntKills", "fish"], name: "3관왕 무지개" },
];

export function ComboAuras() {
  return (
    <ul className={styles.combo}>
      {COMBOS.map((c) => (
        <li key={c.name}>
          <AuraPreview bits={champBitsOf(c.boards)} look={[champHatOf(c.boards)]} label={`${c.name} 오라 미리보기`} />
          <span className={styles.rewardCaption}>
            {c.name} · {itemName(champHatOf(c.boards))}
          </span>
        </li>
      ))}
    </ul>
  );
}
