"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useSyncExternalStore } from "react";
import { furnitureIcon } from "@/game/housing/art";
import { HOUSE_TITLES, houseTitle, nextTitle } from "@/lib/housing/catalog";
import styles from "./housing.module.css";

const noop = () => () => undefined;

/** 하우징 물건 픽셀 아이콘. 게임 안 그림과 같은 캔버스 그림을 정수 배율로 키운다 (서버 렌더에서는 빈 칸) */
export function FurnitureIcon({ itemId, size = 48 }: { itemId: string; size?: number }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return <span style={{ width: size, height: size, display: "inline-block" }} aria-hidden="true" />;
  const base = furnitureIcon(itemId, 1);
  const big = Math.max(base.w, base.h);
  const scale = Math.max(1, Math.round(size / big));
  const icon = furnitureIcon(itemId, scale);
  // 원본이 size보다 크면(외관 미리보기 128px) 비율대로 줄여 보여 준다
  const k = big > size * 1.5 ? size / big : 1;
  return <img src={icon.url} width={Math.round(icon.w * k)} height={Math.round(icon.h * k)} alt="" aria-hidden="true" style={{ imageRendering: "pixelated", flex: "none" }} />;
}

/** 꾸밈 점수 호칭 배지 */
export function TitleBadge({ score }: { score: number }) {
  const t = houseTitle(score);
  return (
    <span className={styles.title} data-tier={HOUSE_TITLES.indexOf(t)} title={t.desc}>
      {t.name}
    </span>
  );
}

/** 다음 호칭까지 남은 점수 */
export function TitleProgress({ score }: { score: number }) {
  const cur = houseTitle(score);
  const next = nextTitle(score);
  if (!next) return <p className={styles.small}>가장 높은 호칭이에요. {cur.desc}.</p>;
  const pct = Math.round(((score - cur.min) / (next.min - cur.min)) * 100);
  return (
    <div className={styles.stack} style={{ gap: 4 }}>
      <div className={styles.meter} role="progressbar" aria-valuemin={cur.min} aria-valuemax={next.min} aria-valuenow={score} aria-label="다음 호칭까지">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className={styles.small}>
        다음 호칭 「{next.name}」까지 {next.min - score}점
      </p>
    </div>
  );
}

export const fmt = (n: number) => n.toLocaleString("ko-KR");
