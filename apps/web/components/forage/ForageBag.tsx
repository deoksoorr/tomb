"use client";

import { useEffect } from "react";
import { bridge } from "@/game/bridge";
import { buyerOf, LIFE_CATS, speciesById } from "@/lib/forage/catalog";
import { sizeText } from "@/lib/forage/rules";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// 가방의 "물고기·채집물" 칸 (BagDialog 안). 겹쳐 쌓이고, 파는 것은 NPC 앞에서만 (어부 영감·수집가 유령).

export default function ForageBag() {
  const { state, error } = useForage();
  useEffect(() => {
    void forageStore.refresh();
  }, []);
  const items = Object.entries(state?.bag ?? {})
    .map(([id, n]) => ({ sp: speciesById(id), n }))
    .filter((r): r is { sp: NonNullable<typeof r.sp>; n: number } => !!r.sp && r.n > 0)
    .sort((a, b) => LIFE_CATS.indexOf(a.sp.cat) - LIFE_CATS.indexOf(b.sp.cat) || b.sp.rarity - a.sp.rarity);
  // 가방은 종류별 개수만 둔다 → 크기는 도감의 가장 큰 기록(직접·자동 모두)으로 보여 준다
  const maxOf = (id: string) => state?.dex[id]?.max ?? 0;
  return (
    <section aria-label="물고기·채집물" style={{ display: "grid", gap: 8 }}>
      {!state ? (
        <p className={error ? ui.error : ui.hint}>{error ?? "불러오는 중…"}</p>
      ) : items.length === 0 ? (
        <p className={ui.hint}>아직 없어요. 나루터 옆 낚시터에서 낚시하고, 숲·풀밭·언덕에서 캐 보세요.</p>
      ) : (
        <div className={s.bagGrid}>
          {items.map(({ sp, n }) => (
            <div
              key={sp.id}
              className={s.bagItem}
              title={`${sp.name}${maxOf(sp.id) ? ` · 가장 큰 ${sizeText(maxOf(sp.id))}` : ""} · ${buyerOf(sp.cat).name}에게 ${sp.price}P`}
            >
              <b>{n}</b>
              <ItemIcon itemId={sp.id} size={32} />
              <span>{sp.name}</span>
            </div>
          ))}
        </div>
      )}
      <p className={ui.hint}>
        물고기는 낚시터의 <b>어부 영감</b>, 나머지는 숲 빈터의 <b>수집가 유령</b>에게 팔 수 있어요.{" "}
        <button type="button" className={ui.button} style={{ minHeight: 28, padding: "2px 8px" }} onClick={() => bridge.emit("forage:dex", {})}>
          도감 보기
        </button>
      </p>
    </section>
  );
}
