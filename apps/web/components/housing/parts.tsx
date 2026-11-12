"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useSyncExternalStore } from "react";
import { facadePreview, furnitureIcon } from "@/game/housing/art";
import { defaultExterior, HOUSE_TITLES, houseTitle, nextTitle, PLOT_TIERS, type HouseExteriorMap, type PlotTierId } from "@/lib/housing/catalog";
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

/** 터 크기별로 마을에 서는 집 그림 (F2: 넓히면 집도 커지는 걸 미리 보여 준다) */
export function TierCompare({ exterior, current }: { exterior?: HouseExteriorMap; current?: PlotTierId | null }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const ext = exterior ?? defaultExterior();
  return (
    <div className={styles.tierRow} role="list" aria-label="터 크기별 집 모습">
      {PLOT_TIERS.map((t) => {
        const img = client ? facadePreview(ext, t.id, 1) : null;
        return (
          <figure key={t.id} className={styles.tierCard} data-current={t.id === current} role="listitem" style={{ margin: 0 }}>
            {img ? (
              <img src={img.url} width={img.w} height={img.h} alt={`${t.name} 집 모습`} style={{ imageRendering: "pixelated" }} />
            ) : (
              <span style={{ width: 128, height: 104, display: "block" }} aria-hidden="true" />
            )}
            <figcaption className={styles.small}>
              {t.name} {t.w}×{t.h}칸{t.id === current ? " · 지금" : ""}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
