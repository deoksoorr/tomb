"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useSyncExternalStore } from "react";
import { facadePreview, furnitureIcon, furniturePreview } from "@/game/housing/art";
import { defaultExterior, furnitureById, HOUSE_TITLES, houseTitle, nextTitle, PLOT_TIERS, plotCost, type HouseExteriorMap, type PlotTierId } from "@/lib/housing/catalog";
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

/** 3번 상점 "놓아 본 모습": 기본 벽·바닥 위에 놓은 그림 (스킨이면 그 벽지·바닥을 입힌 방 귀퉁이) */
export function FurniturePreview({ itemId, height = 72 }: { itemId: string; height?: number }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  if (!client) return <span style={{ width: height, height, display: "inline-block" }} aria-hidden="true" />;
  const base = furniturePreview(itemId, 1);
  const scale = Math.max(1, Math.round(height / base.h));
  const img = furniturePreview(itemId, scale);
  // 정수 배율로 키운 뒤 칸에 맞게 줄인다 (픽셀이 뭉개지지 않게)
  const k = img.h > height ? height / img.h : 1;
  return <img src={img.url} width={Math.round(img.w * k)} height={Math.round(img.h * k)} alt="" aria-hidden="true" style={{ imageRendering: "pixelated", flex: "none", borderRadius: 4 }} />;
}

/**
 * 가구 상점 썸네일: 모든 상품을 같은 고정 칸(w×h) 가운데에 담는다. 칸보다 작으면 정수 배율로 키우고(픽셀 그대로),
 * 크면 비율대로 줄인다. 칸 크기는 렌더 전·이미지 로드 전후 모두 같다 (상품마다 썸네일 크기가 달라 보이던 문제)
 */
export function FurnitureThumb({ itemId, ext, w = 120, h = 96 }: { itemId: string; ext?: boolean; w?: number; h?: number }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const box = { width: w, height: h, flex: "none", display: "grid", placeItems: "center", overflow: "hidden" } as const;
  if (!client) return <span style={box} aria-hidden="true" />;
  const draw = ext ? furnitureIcon : furniturePreview;
  const base = draw(itemId, 1);
  const fit = Math.min(w / base.w, h / base.h);
  const n = fit >= 1 ? Math.floor(fit) : 1;
  const img = n > 1 ? draw(itemId, n) : base;
  const k = fit >= 1 ? 1 : fit;
  const iw = Math.max(1, Math.round(img.w * k));
  const ih = Math.max(1, Math.round(img.h * k));
  return (
    <span style={box} aria-hidden="true">
      <img src={img.url} width={iw} height={ih} alt="" style={{ width: iw, height: ih, maxWidth: "none", imageRendering: "pixelated", borderRadius: ext ? 0 : 4 }} />
    </span>
  );
}

/**
 * 가구 상점 큰 미리보기: 집 안에 놓였을 때와 같은 그림을 고정 칸(w×h)에 정수 배율로 크게 보여 준다.
 * r = 돌린 방향, night = 집 안 밤 조명, frame = 잔물결 장면(연못). 외관은 마을에서 보이는 집 모습(밤이면 밤 그림).
 */
export function FurnitureStage({ itemId, w, h, r = 0, night = false, frame = 0 }: { itemId: string; w: number; h: number; r?: number; night?: boolean; frame?: number }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const box = { width: w, height: h, flex: "none", display: "grid", placeItems: "center", overflow: "hidden" } as const;
  if (!client) return <span style={box} aria-hidden="true" />;
  const def = furnitureById(itemId);
  const draw = (s: number) =>
    def?.ext ? facadePreview({ ...defaultExterior(), [def.ext]: itemId }, "small", s, night) : furniturePreview(itemId, s, { r, night, frame, stage: true });
  const base = draw(1);
  const fit = Math.min(w / base.w, h / base.h);
  // 칸이 2배에 조금 못 미치면(낮은 화면) 1배로 작게 두지 않고 2배 그림을 칸에 맞게 살짝 줄인다
  const n = fit >= 1.6 && fit < 2 ? 2 : Math.max(1, Math.floor(fit));
  const img = n > 1 ? draw(n) : base;
  // 칸보다 크면 비율대로 줄인다
  const k = Math.min(1, fit / n);
  const iw = Math.max(1, Math.round(img.w * k));
  const ih = Math.max(1, Math.round(img.h * k));
  return (
    <span style={box} aria-hidden="true">
      <img src={img.url} width={iw} height={ih} alt="" style={{ width: iw, height: ih, maxWidth: "none", imageRendering: "pixelated", borderRadius: def?.ext ? 0 : 4 }} />
    </span>
  );
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

/** 업그레이드로 이 크기까지 오는 길 안내 (가격은 카탈로그에서 계산) */
function tierHint(i: number): string {
  if (i === 0) {
    const up = PLOT_TIERS[1];
    return up ? `분양 뒤 ${up.name}(+${fmt(up.price)}P)·더 큰 터로 넓힐 수 있어요` : "";
  }
  const steps = PLOT_TIERS.slice(0, i + 1).map((t) => `${fmt(t.price)}P`).join(" + ");
  return `${PLOT_TIERS[0].name}에서 업그레이드로도 넓힐 수 있어요 (${steps})`;
}

/** 처음 분양할 터 크기 고르기: 세 크기를 카드로 나란히 (집 모습·방 크기·바로 사기 값) */
export function TierPicker({ value, onChange, points, disabled }: { value: PlotTierId; onChange: (t: PlotTierId) => void; points: number; disabled?: boolean }) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const ext = defaultExterior();
  return (
    <div className={styles.tierRow} role="radiogroup" aria-label="분양받을 터 크기">
      {PLOT_TIERS.map((t, i) => {
        const img = client ? facadePreview(ext, t.id, 1) : null;
        const cost = plotCost(t.id);
        const short = points < cost;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={t.id === value}
            className={styles.tierCard}
            data-current={t.id === value}
            data-pick="true"
            disabled={disabled}
            onClick={() => onChange(t.id)}
          >
            {img ? (
              <img src={img.url} width={img.w} height={img.h} alt="" style={{ imageRendering: "pixelated" }} />
            ) : (
              <span style={{ width: 128, height: 104, display: "block" }} aria-hidden="true" />
            )}
            <strong>{t.name}</strong>
            <span className={styles.small}>
              방 {t.w}×{t.h}칸 · 물건 {t.maxItems}개
            </span>
            <span className={styles.points}>
              <strong>{fmt(cost)}P</strong>
              {short ? " · 모자라요" : ""}
            </span>
            <span className={styles.small}>{tierHint(i)}</span>
          </button>
        );
      })}
    </div>
  );
}
