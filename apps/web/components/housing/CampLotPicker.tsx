"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useSyncExternalStore } from "react";
import { campLotShort, defaultCaravanDesign, type CampLot, type CaravanDesign } from "@tomb/protocol";
import { houseArt } from "@/game/camp/campHomeArtPension";
import { slateHouseArt } from "@/game/camp/campHomeArtRural";
import type { Grid } from "@/game/sprites/pixel";
import { campLotTag } from "./campOfficeText";
import { caravanPicture, gridPicture } from "./CaravanDesignPicker";
import styles from "./housing.module.css";
import { fmt } from "./parts";

// 11/26 캠핑장 분양 창의 터 고르기 (분양 사무소 「터 크기」 카드 TierPicker와 같은 그림 카드 — OfficeDialog zone "camp").
// 빈 터는 고를 수 있고(값), 분양된 터는 주인 이름만 보인다 (못 고름). 고른 터는 테두리가 촛불색.
// 카라반 12터는 포구 터 크기 카드처럼 3칸, 펜션·촌캉스 2터는 2칸 (housing.module.css .lotGrid)

const noop = () => () => undefined;

/** 게임 안 그 터의 집 그림 (앞마당 1단계·작은 집, 크리스마스면 눈 덮인 그림) — 1배, 한 번 그린 건 다시 쓴다. 카라반은 11/26 디자인대로 (없으면 그 자리 기본 모습) */
function lotPicture(l: CampLot, xmas: boolean, design?: CaravanDesign): { url: string; w: number; h: number } {
  if (l.kind === "caravan") return caravanPicture(design ?? defaultCaravanDesign(l.lot), 1, xmas);
  return gridPicture(`lot|${l.lot}|${xmas}`, (): Grid => (l.kind === "pension" ? houseArt("small", l.lot, false, xmas, l.lot).grid : slateHouseArt(false, xmas).grid));
}

/** design = 11/26 그 카드에 그릴 카라반 디자인 (분양된 터 = 주인 디자인, 고른 빈 터 = 지금 고르는 디자인, 나머지 빈 터 = 그 자리 기본 모습) */
/** hint = 카드 아래 줄 (빈 터만 — 포구 터 크기 카드의 넓히기 안내 자리) */
export type CampLotState = { lot: CampLot; price: number | null; owner: string | null; mine: boolean; free: boolean; design?: CaravanDesign; hint?: string };

export function CampLotPicker({
  lots,
  value,
  onChange,
  points,
  disabled,
  xmas = false,
}: {
  lots: readonly CampLotState[];
  value: number | null;
  onChange: (lot: number) => void;
  points: number;
  disabled?: boolean;
  xmas?: boolean;
}) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const caravan = lots[0]?.lot.kind === "caravan";
  return (
    <div className={styles.lotGrid} data-wide={!caravan || undefined} role="radiogroup" aria-label="분양받을 터">
      {lots.map(({ lot: l, price, owner, mine, free, design, hint }) => {
        const img = client ? lotPicture(l, xmas, design) : null;
        const name = campLotShort(l.lot);
        const tag = campLotTag(l);
        const short = free && price !== null && points < price;
        const status = mine ? "내 집" : owner ? `${owner}의 집` : free ? null : "분양됨";
        return (
          <button
            key={l.lot}
            type="button"
            role="radio"
            aria-checked={l.lot === value}
            aria-label={`${name}, ${tag}, ${status ?? (price !== null ? `${fmt(price)}P` : "빈 터")}`}
            className={styles.tierCard}
            data-pick="true"
            data-current={l.lot === value}
            disabled={disabled || !free}
            onClick={() => onChange(l.lot)}
          >
            <span className={styles.lotPic} aria-hidden="true">
              {img && <img src={img.url} width={img.w} height={img.h} alt="" />}
            </span>
            <strong className={styles.lotName}>{name}</strong>
            <span className={styles.small}>{tag}</span>
            {status ? (
              <span className={styles.lotOwner} title={status}>
                {status}
              </span>
            ) : (
              <span className={styles.points} data-short={short || undefined}>
                <strong>{price !== null ? `${fmt(price)}P` : "…"}</strong>
              </span>
            )}
            {hint && !status && <span className={styles.small}>{hint}</span>}
          </button>
        );
      })}
    </div>
  );
}
