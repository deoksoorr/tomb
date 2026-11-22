"use client";

import { useState } from "react";
import { furnitureById } from "@/lib/housing/catalog";
import { rotateMode } from "@/lib/housing/layout";
import type { NpcFurnRow } from "@/lib/housing/npcFurnShop";
import { FurnitureStage, FurnitureThumb } from "../housing/parts";
import shop from "../shop/ShopDialog.module.css";
import { cx } from "../ui/cx";
import { watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";
import styles from "./NpcFurniturePanel.module.css";

// 11/20 NPC 가구 상점 공용 판(자세히 보기 + 목록): 분양사 보리 「집 가구」 탭의 가구 판매 부분을 떼어 낸 것.
// 지금은 총무팀 문대리(components/office) 창이 쓴다. 가구점·가구 보따리상·보리와 같은 큰 미리보기(돌려 보기 4방향·낮밤),
// 원가에 줄 긋고 할인가, 가방에 가진 개수, 집이 없으면 사기 단추를 흐리게(구경만). 사기·알림은 부모 창이 한다 (onBuy).

const won = (n: number) => `${n.toLocaleString("ko-KR")}P`;

/** 가구 가방에 가진 개수 */
export const haveText = (n: number) => `가방에 ${n}개 있어요.`;

function priceText(base: number, cost: number) {
  if (cost >= base) return <>{won(base)}</>;
  return (
    <>
      <s className={shop.oldPrice}>{won(base)}</s> {won(cost)}
    </>
  );
}

export type NpcFurniturePanelProps = {
  /** 판매 목록 (응답 전이면 null) */
  rows: readonly NpcFurnRow[] | null;
  /** 내 포인트 (모르면 null) */
  points: number | null;
  /** 로그인한 내 정보가 있는지 (없으면 사기 단추를 막는다) */
  signedIn: boolean;
  /** 집이 없음 (사기 단추를 흐리게 — 구경만) */
  noHouse: boolean;
  /** 사는 중인 줄 id (그동안 단추를 막는다) */
  pending: string | null;
  onBuy: (row: NpcFurnRow) => void;
  /** 목록 화면 읽기 이름 · 불러오는 중 한 줄 */
  listLabel: string;
  loadingText: string;
  /** 고르거나 돌려 볼 때 (부모가 알림을 지운다) */
  onPick?: () => void;
};

export default function NpcFurniturePanel({ rows, points, signedIn, noHouse, pending, onBuy, listLabel, loadingText, onPick }: NpcFurniturePanelProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const [turn, setTurn] = useState(0);
  const [night, setNight] = useState(false);
  const list = rows ?? [];
  const row = list.find((f) => f.id === picked) ?? list[0] ?? null;

  function pick(id: string) {
    setPicked(id);
    setTurn(0);
    onPick?.();
  }

  function detail(r: NpcFurnRow) {
    const def = furnitureById(r.id);
    const ways = def && rotateMode(def) === "turn" ? 4 : 2;
    const short = points !== null && points < r.cost;
    return (
      <section ref={watchMoreBelow} className={cx(shop.detail, styles.detail, "more-fade")} aria-label={`${r.name} 자세히 보기`} aria-live="polite">
        <div className={styles.stageWrap}>
          <div className={styles.furnStage} data-night={night || undefined}>
            <FurnitureStage itemId={r.id} w={200} h={140} r={turn % ways} night={night} />
          </div>
          <div className={styles.stageBar}>
            <button type="button" className={cx(ui.button, styles.stageBtn)} onClick={() => setTurn((t) => (t + 1) % ways)}>
              {ways === 4 ? "돌려 보기" : "뒤집어 보기"}
            </button>
            <button type="button" className={cx(ui.button, styles.stageBtn)} aria-pressed={night} onClick={() => setNight((n) => !n)}>
              {night ? "낮으로" : "밤으로"}
            </button>
          </div>
        </div>
        <div className={shop.info}>
          <p className={shop.name}>{r.name}</p>
          <p className={shop.desc}>{r.desc}</p>
          {def?.use && <p className={shop.meta}>집에서 「{def.use}」 할 수 있어요.</p>}
          {r.have > 0 && <p className={styles.state}>{haveText(r.have)}</p>}
          <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={!signedIn || pending !== null || short || noHouse} onClick={() => onBuy(r)}>
            {pending === r.id ? "사는 중…" : noHouse ? "집이 있어야 살 수 있어요" : <span>사기 ({priceText(r.base, r.cost)}){short ? " 모자라요" : ""}</span>}
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className={shop.panel}>
      {row ? detail(row) : <section className={shop.detail} aria-hidden="true" />}
      <div className={shop.listCol}>
        <ul ref={watchMoreBelow} className={cx(styles.grid, "more-fade")} aria-label={listLabel}>
          {list.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className={shop.tile}
                aria-pressed={row?.id === r.id}
                title={`${r.name} — ${r.desc}`}
                aria-label={`${r.name}, ${r.cost}포인트, 눌러서 둘러보기`}
                onClick={() => pick(r.id)}
              >
                <span className={shop.thumb}>
                  <FurnitureThumb itemId={r.id} w={56} h={48} />
                </span>
                <span className={shop.tileName}>{r.name}</span>
                <span className={shop.tilePrice}>
                  {priceText(r.base, r.cost)}
                  {r.have > 0 ? <span className={shop.badge}>{r.have}개</span> : null}
                </span>
              </button>
            </li>
          ))}
          {!rows && <li className={styles.empty}>{loadingText}</li>}
        </ul>
      </div>
    </div>
  );
}
