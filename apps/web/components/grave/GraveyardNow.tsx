"use client";

import { useState } from "react";
import { GRAVEYARD_CAPACITY } from "@tomb/protocol";
import { remainingText } from "@/lib/passText";
import type { PublicGrave } from "@/lib/types";
import { FactGrid, InfoCard } from "../ui/InfoBlocks";
import styles from "./GraveyardNow.module.css";

/** 곧 성불하는 묘비를 몇 개까지 */
const UPCOMING = 4;

/**
 * 지금 채널 묘역 현황 (내 묘비 가기·성불한 이야기들 창 아래): 묘비 수·빈 자리·가장 사랑받은 묘비, 곧 성불하는 이야기.
 * 누르면 그 묘비를 비추고 상세를 연다 (onPick)
 */
export default function GraveyardNow({ graves, channel, onPick }: { graves: readonly PublicGrave[]; channel: number; onPick?: (graveId: string) => void }) {
  // 남은 시간 기준 (렌더 중에 시계를 읽지 않는다)
  const [now] = useState(() => Date.now());
  const loved = graves.reduce<PublicGrave | null>((b, g) => (g.flowers > (b?.flowers ?? 0) ? g : b), null);
  const upcoming = graves
    .filter((g) => typeof g.passAt === "number")
    .sort((a, b) => (a.passAt ?? 0) - (b.passAt ?? 0))
    .slice(0, UPCOMING);
  const facts = [
    { label: "세워진 묘비", value: `${graves.length}/${GRAVEYARD_CAPACITY}`, note: `${channel}채널 묘역` },
    {
      label: "빈 자리",
      value: `${Math.max(0, GRAVEYARD_CAPACITY - graves.length)}자리`,
      note: graves.length >= GRAVEYARD_CAPACITY ? "가득 차면 오래된 묘비부터 일찍 성불해요" : "지금 바로 세울 수 있어요",
    },
    { label: "가장 많이 헌화받은 묘비", value: loved ? loved.name : "아직 없음", note: loved ? `헌화 ${loved.flowers}송이` : "첫 꽃을 놓아 보세요" },
  ];
  return (
    <InfoCard title={`지금 ${channel}채널 묘역`} icon="grave" className={styles.card}>
      <FactGrid facts={facts} />
      <h4 className={styles.sub}>곧 성불하는 이야기</h4>
      {upcoming.length === 0 ? (
        <p className={styles.muted}>지금 이 채널 묘역에는 묘비가 없어요.</p>
      ) : (
        <ul className={styles.list}>
          {upcoming.map((g) => (
            <li key={g.id}>
              <button type="button" className={styles.item} onClick={() => onPick?.(g.id)} disabled={!onPick}>
                <span className={styles.name}>{g.name}</span>
                <span className={styles.epitaph}>{g.epitaph}</span>
                <span className={styles.left}>{(g.passAt ?? 0) > now ? `${remainingText((g.passAt ?? 0) - now)} 뒤` : "곧"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </InfoCard>
  );
}
