"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useMemo, useState } from "react";
import { bridge } from "@/game/bridge";
import { npcPortraitUrl } from "@/game/world/forage/art";
import { errorMessage } from "@/lib/api";
import { DAILY_EARN_CAP } from "@/lib/economy";
import { CAT_LABEL, LIFE_CATS, npcById, RARITY_LABEL, speciesById, type NpcId } from "@/lib/forage/catalog";
import { forageApi } from "@/lib/forage/client";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { forageStore, useForage } from "./forageStore";
import s from "./forage.module.css";

// NPC 판매 창 (어부 영감 = 물고기, 수집가 유령 = 약초·광석·발굴품·곤충). NPC 앞에서 E를 눌렀을 때만 열린다.
// 비싼 것부터 오늘 남은 한도 안에서 판다 (서버가 정한다). 못 판 것은 가방에 그대로 남아 내일 팔 수 있다.

export default function NpcShop({ npcId, onClose }: { npcId: NpcId; onClose: () => void }) {
  const npc = npcById(npcId)!;
  const { state } = useForage();
  const { me } = useMe();
  const [pick, setPick] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [portrait] = useState(() => (typeof document === "undefined" ? "" : npcPortraitUrl(npc.id)));

  const rows = useMemo(() => {
    const bag = state?.bag ?? {};
    return Object.entries(bag)
      .map(([id, n]) => ({ sp: speciesById(id), n }))
      .filter((r): r is { sp: NonNullable<typeof r.sp>; n: number } => !!r.sp && npc.buys.includes(r.sp.cat) && r.n > 0)
      .sort((a, b) => LIFE_CATS.indexOf(a.sp.cat) - LIFE_CATS.indexOf(b.sp.cat) || b.sp.price - a.sp.price);
  }, [state, npc]);

  // F16: 처음엔 아무것도 고르지 않은 상태(0개) → [고른 것 팔기]는 −/+로 고른 만큼, [전부 팔기]는 가진 것 전부
  const qty = (id: string, owned: number) => Math.min(owned, pick?.[id] ?? 0);
  const total = rows.reduce((n, r) => n + qty(r.sp.id, r.n) * r.sp.price, 0);
  const source = npc.id === "fishmonger" ? "fish" : "gather";
  const soldToday = state ? (source === "fish" ? state.today.fishP : state.today.gatherP) : 0;
  const cap = state ? (source === "fish" ? state.today.fishCap : state.today.gatherCap) : 0;

  function setQty(id: string, owned: number, v: number) {
    setPick((p) => ({ ...(p ?? {}), [id]: Math.max(0, Math.min(owned, v)) }));
  }

  async function sell(all: boolean) {
    const items: Record<string, number> = {};
    for (const r of rows) {
      const n = all ? r.n : qty(r.sp.id, r.n);
      if (n > 0) items[r.sp.id] = n;
    }
    if (!Object.keys(items).length) return;
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
          ? "오늘은 더 못 사요. 한도가 다 찼어요 — 가방에 두었다가 내일 와요."
          : `${count}개를 팔아 +${res.earned}P 받았어요.${res.capped ? " 오늘 한도에 닿아서 나머지는 가방에 남겨 뒀어요." : ""}`,
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
        <div className={s.limits}>
          <span>
            오늘 판 값 <strong>{soldToday}</strong> / {cap}P
          </span>
          <span>
            오늘 모은 포인트 <strong>{me?.todayEarned ?? 0}</strong> / {DAILY_EARN_CAP}P
          </span>
          <span>사는 것: {npc.buys.map((c) => CAT_LABEL[c]).join("·")}</span>
        </div>
        {rows.length === 0 ? (
          <p className={s.empty}>{npc.id === "fishmonger" ? "팔 물고기가 없어요. 나루터 옆 낚시터(나무 데크)에서 낚아 와요." : "팔 게 없어요. 숲·풀밭·언덕에서 캐거나 수풀에서 곤충을 잡아 와요."}</p>
        ) : (
          <div className={s.sellList} role="list">
            {rows.map(({ sp, n }) => {
              const q = qty(sp.id, n);
              return (
                <div key={sp.id} className={s.sellRow} role="listitem">
                  <ItemIcon itemId={sp.id} size={32} />
                  <span>
                    {sp.name}
                    <small>
                      {RARITY_LABEL[sp.rarity]} · {sp.price}P · {n}개 있음
                    </small>
                  </span>
                  <span className={s.qty}>
                    <button type="button" className={ui.button} onClick={() => setQty(sp.id, n, q - 1)} disabled={busy || q <= 0} aria-label={`${sp.name} 하나 덜`}>
                      −
                    </button>
                    <span className={s.qtyNum} aria-label={`${sp.name} 팔 개수`} aria-live="polite">
                      {q}
                    </span>
                    <button type="button" className={ui.button} onClick={() => setQty(sp.id, n, q + 1)} disabled={busy || q >= n} aria-label={`${sp.name} 하나 더`}>
                      +
                    </button>
                    <button
                      type="button"
                      className={cx(ui.button, ui.quiet, s.qtyAll)}
                      onClick={() => setQty(sp.id, n, q >= n ? 0 : n)}
                      disabled={busy}
                      aria-label={q >= n ? `${sp.name} 고른 것 비우기` : `${sp.name} ${n}개 모두 고르기`}
                    >
                      {q >= n ? "0" : "모두"}
                    </button>
                  </span>
                  <span className={s.price}>{q * sp.price}P</span>
                </div>
              );
            })}
          </div>
        )}
        <div className={s.sellFoot}>
          <span className={s.total}>
            합계 <strong>{total}P</strong>
          </span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" className={ui.button} disabled={busy || !rows.length} onClick={() => void sell(true)}>
              전부 팔기
            </button>
            <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || total <= 0} onClick={() => void sell(false)}>
              {busy ? "파는 중…" : total > 0 ? `고른 것 팔기 (${total}P)` : "고른 것 팔기"}
            </button>
          </span>
        </div>
        <p className={ui.hint} role="status">
          {notice ?? "비싼 것부터 오늘 남은 한도 안에서만 팔려요. 못 판 것은 가방에 남아요."}
        </p>
      </div>
    </Dialog>
  );
}
