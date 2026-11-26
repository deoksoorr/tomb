"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useSyncExternalStore } from "react";
import {
  CARAVAN_AWNING_NAMES,
  CARAVAN_COLOR_COUNT,
  CARAVAN_COLOR_NAMES,
  CARAVAN_MODEL_NAME,
  CARAVAN_MODELS,
  caravanDesignKey,
  caravanDesignName,
  type CampYard,
  type CaravanDesign,
  type CaravanModel,
} from "@tomb/protocol";
import { AWNING_COLORS, caravanBodySwatch, caravanDesignArt } from "@/game/camp/campHomeArt";
import type { Grid } from "@/game/sprites/pixel";
import styles from "./housing.module.css";
import d from "./caravanDesign.module.css";

// 11/26 카라반 디자인 고르기 (포구 오두막 겉모습 고르기 CottageStylePicker와 같은 그림 카드 — 분양 창에서 터를 고른 다음, 주인은 관리 창에서 무료로 바꾼다).
// 모델 3(에어스트림·티어드롭·버스 개조) × 몸통 색 4 × 차양 색 4. 위에는 고른 디자인으로 그린 카라반 (앞마당 1단계 크게 + 3단계 작게 — 차양·줄전구는 2단계부터).

const noop = () => () => undefined;
const pics = new Map<string, { url: string; w: number; h: number }>();

/** 픽셀 그리드 → dataURL (1배, 한 번 그린 건 다시 쓴다) */
export function gridPicture(key: string, make: () => Grid): { url: string; w: number; h: number } {
  const hit = pics.get(key);
  if (hit) return hit;
  const g = make();
  const c = document.createElement("canvas");
  c.width = g.w;
  c.height = g.h;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(g.w, g.h);
  for (let i = 0; i < g.px.length; i++) {
    const v = g.px[i];
    img.data[i * 4] = (v >>> 24) & 255;
    img.data[i * 4 + 1] = (v >>> 16) & 255;
    img.data[i * 4 + 2] = (v >>> 8) & 255;
    img.data[i * 4 + 3] = v & 255;
  }
  ctx.putImageData(img, 0, 0);
  const out = { url: c.toDataURL(), w: g.w, h: g.h };
  pics.set(key, out);
  return out;
}

/** 고른 디자인의 카라반 그림 (앞마당 stage단계, 크리스마스면 문에 리스) */
export function caravanPicture(design: CaravanDesign, stage: CampYard, xmas: boolean): { url: string; w: number; h: number } {
  return gridPicture(`cv|${caravanDesignKey(design)}|${stage}|${xmas ? 1 : 0}`, () => caravanDesignArt(design, stage, { xmas }).grid);
}

const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

/** 모델 한 줄 설명 (포구 오두막 겉모습 카드 COTTAGE_STYLES.desc처럼) */
const MODEL_DESC: Record<CaravanModel, string> = {
  airstream: "은빛 알루미늄 몸통에 둥근 지붕을 얹었어요.",
  teardrop: "물방울처럼 동글동글한 작은 카라반이에요.",
  bus: "낡은 버스를 고쳐 집으로 만들었어요.",
};

/**
 * owned = 주인이 관리 창에서 바꾸는 중 (안내 줄만 다르다).
 * preview = 위쪽 큰 미리보기 (11/26 분양 창은 끈다 — 포구 오두막 겉모습 고르기처럼 카드만. 고른 디자인은 터 카드 그림에 보인다)
 */
export function CaravanDesignPicker({
  value,
  onChange,
  xmas = false,
  disabled,
  owned = false,
  preview = true,
}: {
  value: CaravanDesign;
  onChange: (d: CaravanDesign) => void;
  xmas?: boolean;
  disabled?: boolean;
  owned?: boolean;
  preview?: boolean;
}) {
  const client = useSyncExternalStore(noop, () => true, () => false);
  const big = client && preview ? caravanPicture(value, 1, xmas) : null;
  const full = client && preview ? caravanPicture(value, 3, xmas) : null;
  const set = (p: Partial<CaravanDesign>) => onChange({ ...value, ...p });
  return (
    <div className={d.box}>
      {preview && (
        <>
          <div className={d.preview} aria-label={`고른 디자인: ${caravanDesignName(value)}`} role="img">
            <span className={d.big}>{big && <img src={big.url} width={big.w * 2} height={big.h * 2} alt="" />}</span>
            <span className={d.small}>
              {full && <img src={full.url} width={full.w} height={full.h} alt="" />}
              <span className={styles.small}>앞마당 3단계</span>
            </span>
          </div>
          <p className={d.name}>{caravanDesignName(value)}</p>
          <p className={d.label}>모델</p>
        </>
      )}
      {/* 모델 카드 = 포구 오두막 겉모습 카드(CottageStylePicker)와 같은 칸 (그림 · 이름 · 한 줄 설명) */}
      <div className={styles.pickGrid} role="radiogroup" aria-label="카라반 모델">
        {CARAVAN_MODELS.map((m: CaravanModel) => {
          const pic = client ? caravanPicture({ model: m, color: value.model === m ? value.color : 0, awning: value.awning }, 1, xmas) : null;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={m === value.model}
              className={styles.tierCard}
              data-pick="true"
              data-current={m === value.model}
              disabled={disabled}
              onClick={() => m !== value.model && set({ model: m })}
              style={{ gridRow: "span 3" }}
            >
              <span className={d.modelPic} aria-hidden="true">
                {pic && <img src={pic.url} width={pic.w} height={pic.h} alt="" />}
              </span>
              <strong>{CARAVAN_MODEL_NAME[m]}</strong>
              <span className={styles.small}>{MODEL_DESC[m]}</span>
            </button>
          );
        })}
      </div>

      <p className={d.label}>몸통 색{value.model === "airstream" ? " (은색 몸통의 색 띠)" : ""}</p>
      <div className={d.swatches} role="radiogroup" aria-label="몸통 색">
        {Array.from({ length: CARAVAN_COLOR_COUNT }, (_, i) => (
          <button key={i} type="button" role="radio" aria-checked={i === value.color} className={d.swatch} data-current={i === value.color} disabled={disabled} onClick={() => set({ color: i })}>
            <span className={d.chip} style={{ background: hex(caravanBodySwatch(value.model, i)) }} aria-hidden="true" />
            <span>{CARAVAN_COLOR_NAMES[value.model][i]}</span>
          </button>
        ))}
      </div>

      <p className={d.label}>차양 색</p>
      <div className={d.swatches} role="radiogroup" aria-label="차양 색">
        {CARAVAN_AWNING_NAMES.map((n, i) => {
          const [a, b] = AWNING_COLORS[i];
          return (
            <button key={i} type="button" role="radio" aria-checked={i === value.awning} className={d.swatch} data-current={i === value.awning} disabled={disabled} onClick={() => set({ awning: i })}>
              <span className={d.chip} style={{ background: `repeating-linear-gradient(90deg, ${hex(a)} 0 5px, ${hex(b)} 5px 10px)` }} aria-hidden="true" />
              <span>{n}</span>
            </button>
          );
        })}
      </div>
      <p className={styles.small}>{owned ? "차양은 앞마당 2단계부터 펼쳐져요." : "차양은 앞마당 2단계부터 펼쳐져요. 디자인은 분양가와 상관없고, 분양받은 뒤에도 무료로 바꿀 수 있어요."}</p>
    </div>
  );
}
