"use client";

import { useEffect } from "react";
import { bridge } from "@/game/bridge";
import { BAG_MAX, bagCount, bagSpecies, buyerOf, GRADE_LABEL, gradedPrice, gradeOf, LIFE_CATS, type FishGrade, type Species } from "@/lib/forage/catalog";
import { sizeText } from "@/lib/forage/rules";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import { questStore, useQuests } from "./questStore";
import s from "./forage.module.css";
import q from "./quest.module.css";

// 가방의 "물고기·채집물" 칸 (BagDialog 안). 겹쳐 쌓이고, 파는 것은 NPC 앞에서만 (어부 영감·수집가 유령).
// 11/22 직접 낚은 대물·월척은 따로 쌓인다 (등급 표, 같은 종 옆에)

export default function ForageBag() {
  const { state, error } = useForage();
  const { board } = useQuests();
  useEffect(() => {
    void forageStore.refresh();
    // 11/15 의뢰 도장 (의뢰판 읽기 1번 — 오늘 이미 받았으면 다시 읽지 않는다)
    void questStore.refresh();
  }, []);
  const items = Object.entries(state?.bag ?? {})
    .flatMap(([id, n]): { id: string; sp: Species; grade: FishGrade; n: number }[] => {
      const sp = bagSpecies(id);
      return sp && n > 0 ? [{ id, sp, grade: gradeOf(id), n }] : [];
    })
    .sort((a, b) => LIFE_CATS.indexOf(a.sp.cat) - LIFE_CATS.indexOf(b.sp.cat) || b.sp.rarity - a.sp.rarity || a.sp.id.localeCompare(b.sp.id) || a.grade - b.grade);
  // 가방은 종류별 개수만 둔다 → 크기는 도감의 가장 큰 기록(직접·자동 모두)으로 보여 준다
  const maxOf = (id: string) => state?.dex[id]?.max ?? 0;
  // 11/19 가방 전체 한도 (물고기·채집물 합)
  const count = bagCount(state?.bag);
  const full = count >= BAG_MAX;
  return (
    <section aria-label="물고기·채집물" style={{ display: "grid", gap: 8 }}>
      {state && (
        <p className={s.bagCount} data-full={full || undefined}>
          <span>가방</span>
          <strong>
            {count} / {BAG_MAX}
          </strong>
          {full && <em>가득 찼어요. 팔면 다시 담을 수 있어요</em>}
        </p>
      )}
      {!state ? (
        <p className={error ? ui.error : ui.hint}>{error ?? "불러오는 중…"}</p>
      ) : items.length === 0 ? (
        <p className={ui.hint}>아직 없어요. 호수 잔교·강둑·연못가에서 낚시하고, 숲, 풀밭, 북서쪽 언덕의 반짝이는 곳에서 캐 보세요.</p>
      ) : (
        <div className={s.bagGrid}>
          {items.map(({ id, sp, grade, n }) => (
            <div
              key={id}
              className={s.bagItem}
              title={`${grade > 0 ? `${GRADE_LABEL[grade]} ` : ""}${sp.name}${maxOf(sp.id) ? ` · 가장 큰 ${sizeText(maxOf(sp.id))}` : ""} · ${buyerOf(sp.cat).name}에게 ${gradedPrice(sp, grade)}P`}
            >
              <b>{n}</b>
              {grade > 0 && (
                <span className={s.gradeBadge} data-grade={grade}>
                  {GRADE_LABEL[grade]}
                </span>
              )}
              <ItemIcon itemId={sp.id} size={32} />
              <span>{sp.name}</span>
            </div>
          ))}
        </div>
      )}
      {/* 11/15 의뢰 도장 (가방이 아니라 계정에 쌓인다): 하나라도 있으면 작은 칩으로만 */}
      {board && board.stamps > 0 && (
        <div className={q.stampChip} title="의뢰 도장 (캠핑장행 정류장 왼쪽 의뢰 게시판에서 바꿔요)">
          <span className={q.seal} aria-hidden>
            印
          </span>
          <span>
            도장 <strong>{board.stamps}</strong>
          </span>
        </div>
      )}
      <p className={ui.hint}>
        <button type="button" className={ui.button} style={{ minHeight: 28, padding: "2px 8px" }} onClick={() => bridge.emit("forage:dex", {})}>
          도감 보기
        </button>
      </p>
    </section>
  );
}
