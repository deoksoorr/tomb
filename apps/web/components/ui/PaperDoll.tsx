"use client";

import { createContext, use, useId, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import { cx } from "./cx";
import { tipAlignOf } from "./paperDollLayout";
import styles from "./PaperDoll.module.css";

const AreasContext = createContext("");

// 장비창 ("종이 인형"): 가운데 큰 아바타, 둘레에 부위 칸을 몸 위치에 맞춰 놓는다.
// 가방(캐릭터 꾸미기)과 사냥터(장비)가 같이 쓴다. 칸 배치는 grid-template-areas 문자열로 받는다 (아바타 칸 이름은 "fig").

type DollProps = {
  /** 예: `"back head neck" "aura fig hand" "pet feet info"` */
  areas: string;
  /** 가운데 아바타 (OutfitCanvas). 무대 가장자리를 잘라 아바타를 크게 보인다 */
  figure: ReactNode;
  /** 아바타 아래 한 줄 */
  caption?: ReactNode;
  /** 스크린리더용 이름 (예: "착용 부위") */
  label: string;
  children: ReactNode;
  className?: string;
  /**
   * 낮은 칸: 그림은 왼쪽, 부위·이름·남은 기간 막대는 오른쪽에 한 덩어리로 (칸 높이 약 52px — 칸이 많을 때).
   * "large" = 같은 모양을 크게 (그림 48px·글자 크게) + 칸이 줄 높이를 꽉 채운다 (가방 [지금 모습]이 창 높이를 다 쓸 때)
   */
  compact?: boolean | "large";
};

export function PaperDoll({ areas, figure, caption, label, children, className, compact }: DollProps) {
  return (
    <div role="group" aria-label={label} className={cx(styles.doll, className)} data-compact={compact === true ? "" : compact || undefined} style={{ "--areas": areas } as CSSProperties}>
      <div className={styles.figure} style={{ gridArea: "fig" }}>
        <div className={styles.crop}>{figure}</div>
        {caption}
      </div>
      <AreasContext value={areas}>{children}</AreasContext>
    </div>
  );
}

type SlotProps = {
  area: string;
  /** 부위 이름 (머리·목·무기…) */
  label: string;
  /** 낀 것 이름 (비었으면 null) */
  name: string | null;
  icon: ReactNode;
  /** 빈 칸에 흐리게 깔리는 그림 */
  silhouette: ReactNode;
  /** 남은 시간 막대 */
  meter?: { ratio: number; text: string } | null;
  /** 이름 아래 짧은 줄 (능력치 등) */
  sub?: string | null;
  /** 이름 색 (사냥 장비 등급) */
  tone?: string;
  /** 마우스·초점 말풍선 (이름 + 설명) */
  tip: { title: string; body?: string };
  /** 말풍선 맞춤. 없으면 칸 배치에서 정한다 (첫 열 start, 끝 열 end → 창 밖으로 안 나간다) */
  tipAlign?: "start" | "center" | "end";
  /** 목록에서 고른 것이 들어갈 칸 */
  highlight?: boolean;
  selected?: boolean;
  ariaLabel: string;
  onClick: () => void;
  /** 끌어다 놓기 (데스크톱). accepts: 지금 끄는 것을 받을 수 있는지 */
  drop?: { accepts: boolean; onDrop: (data: string) => void };
};

/** 장비창 한 칸 (누르면 그 부위 메뉴, 끌어다 놓기도 받는다) */
export function DollSlot({ area, label, name, icon, silhouette, meter, sub, tone, tip, tipAlign, highlight, selected, ariaLabel, onClick, drop }: SlotProps) {
  const tipId = useId();
  const areas = use(AreasContext);
  const [over, setOver] = useState(false);
  const dragProps = drop
    ? {
        onDragOver: (e: DragEvent) => {
          if (!drop.accepts) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (e: DragEvent) => {
          setOver(false);
          if (!drop.accepts) return;
          e.preventDefault();
          drop.onDrop(e.dataTransfer.getData("text/plain"));
        },
      }
    : {};
  return (
    <div className={styles.slotWrap} style={{ gridArea: area }}>
      <button
        type="button"
        className={cx(styles.slot, !name && styles.empty)}
        data-highlight={highlight || undefined}
        data-over={over || undefined}
        aria-pressed={selected}
        aria-label={ariaLabel}
        aria-describedby={tipId}
        onClick={onClick}
        {...dragProps}
      >
        <span className={styles.slotLabel}>{label}</span>
        <span className={styles.slotIcon}>{name ? icon : <span className={styles.silhouette}>{silhouette}</span>}</span>
        <span className={styles.slotName} style={tone ? { color: tone } : undefined}>
          {name ?? "비어 있음"}
        </span>
        {sub && <span className={styles.slotSub}>{sub}</span>}
        {meter && (
          <span className={styles.meter}>
            <span className={styles.meterBar} aria-hidden="true">
              <span style={{ width: `${Math.round(meter.ratio * 100)}%` }} data-low={meter.ratio < 0.2 || undefined} />
            </span>
            <span className={styles.meterText}>{meter.text}</span>
          </span>
        )}
      </button>
      <span id={tipId} role="tooltip" className={styles.tip} data-align={tipAlign ?? tipAlignOf(areas, area)}>
        <b>{tip.title}</b>
        {tip.body && <span>{tip.body}</span>}
      </span>
    </div>
  );
}

/** 칸이 아닌 자리에 놓는 작은 글 상자 (예: 착용 4/7) */
export function DollNote({ area, children }: { area: string; children: ReactNode }) {
  return (
    <div className={styles.note} style={{ gridArea: area }}>
      {children}
    </div>
  );
}
