"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useMemo, useState } from "react";
import { bridge } from "@/game/bridge";
import { npcPortraitUrl } from "@/game/world/forage/art";
import { currentMapConcept } from "@/lib/mapConceptClient";
import { errorMessage } from "@/lib/api";
import { bagSpecies, CAT_LABEL, GRADE_LABEL, gradedPrice, gradeOf, LIFE_CATS, npcBuys, npcBuysAll, npcById, RARITY_LABEL, type FishGrade, type NpcId, type Species } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import { meStore } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import { watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// NPC 판매 창 (어부 영감 = 물고기, 수집가 유령 = 약초·광석·발굴품·곤충). NPC 앞에서 E를 눌렀을 때만 열린다.
// 11/19 하루 판매 한도가 없어 고른 것을 다 판다 (서버가 정한다. 지갑이 꽉 찰 때만 남은 것을 가방에 둔다).
// 11/15: NPC는 사기만 한다. 수집 의뢰·도장 교환소는 버스 정류장 마당 의뢰 게시판 한 곳 (WharfBoard)
// 11/16 r11: 포구 시장을 빼서 바다 고기는 어부 영감, 갯벌에서 캔 것은 수집가 유령에게 팔아요
// 11/20 바닷가 해녀 할망은 물고기·채집물을 다 사요 (값은 마을과 같아요 — 한 목록에 다 나와요)
// 11/22 직접 낚은 대물·월척은 칸이 따로 (아이콘에 등급 표, 값은 등급 배수). 월척이 섞이면 팔기 전에 한 번 묻는다
// 11/26 캠핑장 낚시터 사장님도 해녀 할망처럼 다 사요. 얼굴 그림은 지금 맵 판(겨울·크리스마스)으로

type Row = { id: string; sp: Species; grade: FishGrade; price: number; n: number };

const EMPTY: Record<NpcId, string> = {
  fishmonger: "팔 물고기가 없어요. 호수 잔교나 강둑, 바닷가 갯바위에서 낚아 와요.",
  collector: "팔 게 없어요. 숲, 풀밭, 북서쪽 언덕, 갯벌에서 캐거나 수풀에서 곤충을 잡아 와요.",
  haenyeo: "팔 게 없어요. 갯바위나 선착장에서 낚고, 갯벌이나 풀밭에서 캐 와요.",
  trader: "팔 게 없어요. 계곡이나 윤슬 낚시터에서 낚고, 숲이나 바위에서 캐 와요.",
};

/** 11/20 큰 값은 쉼표로 (999개면 1만 P를 넘는다) */
const fmtP = (n: number) => n.toLocaleString("ko-KR");

export default function NpcShop({ npcId, onClose }: { npcId: NpcId; onClose: () => void }) {
  const npc = npcById(npcId)!;
  const { state } = useForage();
  const [pick, setPick] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 11/22 월척을 같이 팔지 묻는 중 (전부 팔기 = true, 고른 것 팔기 = false) */
  const [askBig, setAskBig] = useState<{ all: boolean; n: number } | null>(null);
  const portrait = useMemo(() => (typeof document === "undefined" ? "" : npcPortraitUrl(npc.id, 2, currentMapConcept())), [npc.id]);

  // 가방 칸마다 한 장 (11/22 같은 종의 보통·대물·월척은 나란히)
  const rows = useMemo(() => {
    const bag = state?.bag ?? {};
    return Object.entries(bag)
      .flatMap(([id, n]): Row[] => {
        const sp = bagSpecies(id);
        if (!sp || !npcBuys(npc, sp) || n <= 0) return [];
        const grade = gradeOf(id);
        return [{ id, sp, grade, price: gradedPrice(sp, grade), n }];
      })
      .sort((a, b) => LIFE_CATS.indexOf(a.sp.cat) - LIFE_CATS.indexOf(b.sp.cat) || b.sp.price - a.sp.price || a.sp.id.localeCompare(b.sp.id) || a.grade - b.grade);
  }, [state, npc]);

  // F16: 처음엔 아무것도 고르지 않은 상태(0개) → [고른 것 팔기]는 −/+로 고른 만큼, [전부 팔기]는 가진 것 전부
  const qty = (id: string, owned: number) => Math.min(owned, pick?.[id] ?? 0);
  const total = rows.reduce((n, r) => n + qty(r.id, r.n) * r.price, 0);

  function setQty(id: string, owned: number, v: number) {
    setAskBig(null);
    setPick((p) => ({ ...(p ?? {}), [id]: Math.max(0, Math.min(owned, v)) }));
  }

  async function sell(all: boolean, sure = false) {
    const items: Record<string, number> = {};
    for (const r of rows) {
      const n = all ? r.n : qty(r.id, r.n);
      if (n > 0) items[r.id] = n;
    }
    if (!Object.keys(items).length) return;
    // 11/22 월척이 섞이면 한 번 묻는다 (아끼던 걸 [전부 팔기]로 같이 팔지 않게)
    const big = rows.reduce((k, r) => k + (r.grade === 2 ? (items[r.id] ?? 0) : 0), 0);
    if (big > 0 && !sure) return setAskBig({ all, n: big });
    setAskBig(null);
    setBusy(true);
    setNotice(null);
    try {
      const res = await forageApi.sell(npc.id, items);
      forageStore.set(res.state);
      meStore.set(res.me);
      setPick(null);
      const count = Object.values(res.sold).reduce((n, k) => n + k, 0);
      if (count > 0) bridge.emit("forage:coin");
      setNotice(
        count === 0
          ? "지갑이 꽉 차서 더 못 사요. 포인트를 쓰고 다시 와요."
          : `${count}개를 팔아 +${res.earned}P 받았어요.${res.capped ? " 지갑이 꽉 차서 나머지는 가방에 남겨 뒀어요." : ""}`,
      );
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`${npc.name} · ${npc.title}`} onClose={onClose}>
      <div className={s.sellShop}>
        <div className={s.npcHello}>
          {portrait && <img src={portrait} width={48} height={52} alt="" style={{ imageRendering: "pixelated" }} />}
          <p style={{ margin: 0 }}>{npc.hello}</p>
        </div>
        {(
          <>
          <div className={s.limits}>
            <span>사는 것: {npcBuysAll(npc) ? "물고기와 채집물 전부" : npc.where === "flat" ? "갯벌에서 캔 것" : npc.buys.map((c) => CAT_LABEL[c]).join("·")}</span>
          </div>
          {rows.length === 0 ? (
            <p className={s.empty}>{EMPTY[npc.id]}</p>
          ) : (
            // 11/20 운영자: 가로 한 줄 목록 → 세로 카드 격자 (위 아이콘 → 이름 → 등급·개수 → 값 → −/+·모두). 이 칸만 스크롤
            <div ref={watchMoreBelow} className={s.sellScroll}>
              <div className={s.sellList} role="list">
                {rows.map(({ id, sp, grade, price, n }) => {
                  const q = qty(id, n);
                  // 11/22 「대물 잉어」처럼 등급을 이름 앞에 (읽어 주는 이름·버튼 이름도)
                  const name = grade > 0 ? `${GRADE_LABEL[grade]} ${sp.name}` : sp.name;
                  return (
                    <div
                      key={id}
                      className={s.sellCard}
                      role="listitem"
                      data-picked={q > 0 || undefined}
                      title={`${name} (${RARITY_LABEL[sp.rarity]}, ${n}개 있음)`}
                      aria-label={`${name}, ${RARITY_LABEL[sp.rarity]}, ${n}개 있음, 한 개 ${price}P`}
                    >
                      {/* 11/20 2차: 개수는 아이콘 귀퉁이, 값은 이름 아래 한 줄 (고르면 「3개 21P」). 11/22 등급 표는 왼쪽 위 귀퉁이 */}
                      <span className={s.cardIcon}>
                        <ItemIcon itemId={sp.id} size={32} />
                        <span className={s.cardCount}>×{n}</span>
                        {grade > 0 && (
                          <span className={s.gradeBadge} data-grade={grade} aria-hidden>
                            {GRADE_LABEL[grade]}
                          </span>
                        )}
                      </span>
                      <span className={s.cardName}>{sp.name}</span>
                      <span className={s.cardPrice}>{q > 0 ? `${q}개 ${fmtP(q * price)}P` : grade > 0 ? `개당 ${fmtP(price)}P` : `${fmtP(price)}P`}</span>
                      <span className={s.qty}>
                        <button type="button" className={ui.button} onClick={() => setQty(id, n, q - 1)} disabled={busy || q <= 0} aria-label={`${name} 하나 덜`}>
                          −
                        </button>
                        <span className={s.qtyNum} aria-label={`${name} 팔 개수`} aria-live="polite">
                          {q}
                          <small>/{n}</small>
                        </span>
                        <button type="button" className={ui.button} onClick={() => setQty(id, n, q + 1)} disabled={busy || q >= n} aria-label={`${name} 하나 더`}>
                          +
                        </button>
                      </span>
                      {/* 모두 고르기 ↔ 고른 것 비우기 (다 고르면 글자가 「비우기」, 수량 칸은 13/13 그대로) */}
                      <button
                        type="button"
                        className={cx(ui.button, s.qtyAll)}
                        onClick={() => setQty(id, n, q >= n ? 0 : n)}
                        disabled={busy}
                        aria-label={q >= n ? `${name} 고른 것 비우기` : `${name} ${n}개 모두 고르기`}
                      >
                        {q >= n ? "비우기" : "모두"}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {askBig && (
            <div className={s.askBig} role="alert">
              <span>월척 {askBig.n}마리도 같이 팔아요?</span>
              <span style={{ display: "flex", gap: 6 }}>
                <button type="button" className={ui.button} disabled={busy} onClick={() => setAskBig(null)}>
                  그만둘래요
                </button>
                <button type="button" className={cx(ui.button, ui.primary)} disabled={busy} onClick={() => void sell(askBig.all, true)}>
                  같이 팔아요
                </button>
              </span>
            </div>
          )}
          <div className={s.sellFoot}>
            <span className={s.total}>
              합계 <strong>{fmtP(total)}P</strong>
            </span>
            <span style={{ display: "flex", gap: 8 }}>
              <button type="button" className={ui.button} disabled={busy || !rows.length} onClick={() => void sell(true)}>
                전부 팔기
              </button>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || total <= 0} onClick={() => void sell(false)}>
                {busy ? "파는 중…" : total > 0 ? `고른 것 팔기 (${fmtP(total)}P)` : "고른 것 팔기"}
              </button>
            </span>
          </div>
          <p className={ui.hint} role="status">
            {notice ?? "고른 것을 한 번에 팔아요. 희귀할수록 비싸요."}
          </p>
          </>
        )}
      </div>
    </Dialog>
  );
}
