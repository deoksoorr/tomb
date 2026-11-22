"use client";

import { useEffect, useState } from "react";
import { DYE_COLOR_SLOT_PRICES, DYE_COLOR_SLOTS_MAX, isDyeableCosmetic, isDyeSlotCosmetic, isFixedDyeId, itemById, ITEMS } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import type { FixedDyeDef } from "@/lib/dye/types";
import { resellBlock, resellPrice } from "@/lib/resell";
import type { Me } from "@/lib/types";
import { applyStyle } from "../account/actions";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import DirectDyeDialog from "./DirectDyeDialog";
import DyeDialog from "./DyeDialog";
import { fixedTicket, ticketOf } from "./StylePanel";
import { DyeValue } from "./dyeValue";
import styles from "./itemDyeInfo.module.css";

export { DyeValue };

// 11/22 아이템 정보의 염색·색 보관함·되팔기 (가방 [꾸미기] 자세히 보기 · 카드 · 상점 내 소유 표시 · 염색 창이 같이 쓴다).
//  - 「염색: ■ #3a7bd5」 (특수 색이면 이름도), 안 칠했으면 「원래 색」, 날개·연·noDye는 「염색 불가」
//  - 색 보관함: [원래 색] [커스텀1] [커스텀2] [커스텀3] — 칠한 칸은 눌러 공짜로 바꿔 입고, 빈 칸은 「비었어요」, 살 수 있는 칸은 「+ 2,000P」
//  - [염색] → 가진 염색권 고르기 → 염색 창 (이 아이템이 골라진 채로)
//  - 되팔기: 「되팔기 0,000P (정가의 30%)」 또는 「판매 불가 · 까닭」

type ItemDyes = NonNullable<Me["itemDyes"]>;

/** 지금 입는 색 (원래 색이면 null) */
export function itemColorOf(itemDyes: ItemDyes | undefined, itemId: string): string | null {
  const st = itemDyes?.[itemId];
  return st && st.sel >= 0 ? (st.colors[st.sel] ?? null) : null;
}

/** 「염색: …」 한 줄 (머리·목·옷·등 꾸미기만 — 그 밖은 아무것도 안 그린다) */
export function ItemDyeLine({ itemId, itemDyes, className }: { itemId: string; itemDyes?: ItemDyes; className?: string }) {
  if (!isDyeSlotCosmetic(itemId)) return null;
  return (
    <span className={cx(styles.line, className)}>
      염색: {isDyeableCosmetic(itemId) ? <DyeValue color={itemColorOf(itemDyes, itemId)} /> : <span className={styles.value}>염색 불가</span>}
    </span>
  );
}

/** 되팔기 한 줄 (가방): 「되팔기 0,000P (정가의 30%)」 또는 「판매 불가 · 까닭」 */
export function ResellLine({ itemId, state, until }: { itemId: string; state: "worn" | "stash" | "new"; until: number | null }) {
  const it = itemById(itemId);
  if (!it || it.kind !== "cosmetic") return null;
  const block = resellBlock(itemId, state, until);
  return <span className={styles.line}>{block ? `판매 불가 · ${block}` : `되팔기 ${resellPrice(itemId).toLocaleString("ko-KR")}P (정가의 30%)`}</span>;
}

/**
 * 가방 자세히 보기의 염색·되팔기 묶음: 색 보관함 칸 · [염색] · [팔기]. 바꾸면 내 정보·게임의 내 아바타를 바로 바꾼다 (applyStyle)
 */
export function ItemDyePanel({
  me,
  itemId,
  state,
  until,
  avatar,
  look,
  onNotice,
}: {
  me: Me;
  itemId: string;
  state: "worn" | "stash" | "new";
  until: number | null;
  avatar: { color: string; body: string };
  look: readonly string[];
  onNotice: (m: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [open, setOpen] = useState<{ kind: "board"; ticket: ReturnType<typeof ticketOf> } | { kind: "direct"; itemId: string; name: string; mode: "pick" | "special" } | null>(null);
  const [confirmSell, setConfirmSell] = useState(false);
  const [buyAsk, setBuyAsk] = useState<number | null>(null);
  const [fixedDefs, setFixedDefs] = useState<Record<string, FixedDyeDef>>({});
  const dyeable = isDyeableCosmetic(itemId);
  const st = me.itemDyes?.[itemId];
  const colors = st?.colors.length ? st.colors : [null];
  const sel = st?.sel ?? -1;
  const name = itemById(itemId)?.name ?? itemId;
  const sellBlock = resellBlock(itemId, state, until);

  useEffect(() => {
    if (!choosing) return;
    let alive = true;
    dyeApi
      .state()
      .then((s) => alive && setFixedDefs(s.tickets))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [choosing]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    onNotice(null);
    try {
      await task();
    } catch (e) {
      onNotice(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const select = (k: number) =>
    run(async () => {
      applyStyle(await dyeApi.select(itemId, k));
      onNotice(k < 0 ? `${name}을(를) 원래 색으로 입었어요.` : `${name}을(를) 커스텀 ${k + 1} 색으로 입었어요.`);
    });
  const buySlot = () =>
    run(async () => {
      applyStyle(await dyeApi.buySlot(itemId));
      setBuyAsk(null);
      onNotice(`${name}의 색 칸을 하나 더 열었어요. 염색권으로 칠해 주세요.`);
    });
  const sell = () =>
    run(async () => {
      const res = await dyeApi.sell(itemId);
      applyStyle(res);
      setConfirmSell(false);
      onNotice(`${name}을(를) ${res.paid.toLocaleString("ko-KR")}P에 팔았어요.`);
    });

  // 가진 염색권 (무작위·색 확정·특수색 확정·고정 색)
  const tickets = [
    ...ITEMS.filter((i) => i.kind === "dye" && (me.inventory[i.id] ?? 0) > 0).map((i) => ({ id: i.id, name: i.name, n: me.inventory[i.id], mode: i.dye?.mode, color: undefined as string | undefined })),
    ...Object.values(fixedDefs)
      .filter((d) => (me.inventory[d.id] ?? 0) > 0 && !d.parts?.length)
      .map((d) => ({ id: d.id, name: d.name, n: me.inventory[d.id], mode: "fixed" as const, color: d.color })),
  ];
  const nextPrice = colors.length < DYE_COLOR_SLOTS_MAX ? DYE_COLOR_SLOT_PRICES[colors.length] : null;

  return (
    <div className={styles.panel}>
      {isDyeSlotCosmetic(itemId) && (
        <>
          <ItemDyeLine itemId={itemId} itemDyes={me.itemDyes} />
          {dyeable && (
            <div className={styles.slots} role="group" aria-label={`${name} 색 보관함`}>
              <button type="button" className={cx(ui.button, styles.slot)} aria-pressed={sel < 0} disabled={busy} onClick={() => sel >= 0 && select(-1)}>
                <ItemIcon itemId={itemId} size={32} />
                원래 색
              </button>
              {colors.map((c, k) => (
                <button key={k} type="button" className={cx(ui.button, styles.slot)} aria-pressed={sel === k} disabled={busy || !c} onClick={() => sel !== k && select(k)}>
                  {c ? <ItemIcon itemId={itemId} size={32} dye={c} /> : <span className={styles.emptyIcon} aria-hidden="true" />}
                  커스텀 {k + 1}
                  <span className={styles.slotNote}>{c ? <DyeValue color={c} short /> : "비었어요"}</span>
                </button>
              ))}
              {nextPrice !== null &&
                (buyAsk === colors.length ? (
                  <span className={styles.ask}>
                    <span>{nextPrice.toLocaleString("ko-KR")}P로 칸을 열까요?</span>
                    <button type="button" className={cx(ui.button, ui.primary)} disabled={busy || me.points < nextPrice} onClick={buySlot}>
                      {me.points < nextPrice ? "포인트가 모자라요" : "열기"}
                    </button>
                    <button type="button" className={ui.button} disabled={busy} onClick={() => setBuyAsk(null)}>
                      그만두기
                    </button>
                  </span>
                ) : (
                  <button type="button" className={cx(ui.button, styles.slot, styles.buy)} disabled={busy} onClick={() => setBuyAsk(colors.length)}>
                    <span className={styles.emptyIcon} aria-hidden="true">
                      +
                    </span>
                    커스텀 {colors.length + 1}
                    <span className={styles.slotNote}>+ {nextPrice.toLocaleString("ko-KR")}P</span>
                  </button>
                ))}
            </div>
          )}
          {dyeable && (
            <div className={styles.actions}>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={busy} onClick={() => setChoosing(true)}>
                염색
              </button>
              {sel >= 0 && (
                <button type="button" className={ui.button} disabled={busy} onClick={() => select(-1)}>
                  원래 색으로
                </button>
              )}
            </div>
          )}
        </>
      )}
      <ResellLine itemId={itemId} state={state} until={until} />
      {!sellBlock &&
        (confirmSell ? (
          <div className={styles.confirm} role="alertdialog" aria-label={`${name} 팔기 확인`}>
            <p>
              {name}을(를) {resellPrice(itemId).toLocaleString("ko-KR")}P에 팔까요? 다시 사려면 정가를 내야 해요.
              {st ? " 염색 칸과 색은 사라지고 돌려받지 않아요." : ""}
            </p>
            <div className={styles.actions}>
              <button type="button" className={cx(ui.button, ui.danger)} disabled={busy} onClick={sell}>
                팔기
              </button>
              <button type="button" className={ui.button} disabled={busy} onClick={() => setConfirmSell(false)}>
                그만두기
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={ui.button} disabled={busy} onClick={() => setConfirmSell(true)}>
              팔기 · {resellPrice(itemId).toLocaleString("ko-KR")}P
            </button>
          </div>
        ))}

      {choosing && (
        <Dialog title={`${name} 염색`} onClose={() => setChoosing(false)} kind="confirm">
          <div className={styles.chooser}>
            {tickets.length === 0 ? (
              <p className={styles.line}>염색권이 없어요. 잡화점의 염색·외형에서 살 수 있어요.</p>
            ) : (
              <>
                <p className={styles.line}>쓸 염색권을 골라요. {colors.some(Boolean) ? "칠할 칸은 다음 창에서 골라요." : "처음 칠하면 커스텀 1 칸이 생겨요."}</p>
                <ul className={styles.tickets}>
                  {tickets.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={cx(ui.button, styles.ticket)}
                        onClick={() => {
                          setChoosing(false);
                          if (t.mode === "pick" || t.mode === "special") setOpen({ kind: "direct", itemId: t.id, name: t.name, mode: t.mode });
                          else {
                            const def = isFixedDyeId(t.id) ? fixedDefs[t.id] : null;
                            const item = ITEMS.find((i) => i.id === t.id);
                            setOpen({ kind: "board", ticket: def ? fixedTicket(def) : item ? ticketOf(item) : null });
                          }
                        }}
                      >
                        {t.color ? <span className={styles.swatch} style={{ background: t.color }} aria-hidden="true" /> : <ItemIcon itemId={t.id} size={32} />}
                        <span>{t.name}</span>
                        <span className={styles.slotNote}>×{t.n}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </Dialog>
      )}
      {open?.kind === "board" && open.ticket && (
        <DyeDialog ticket={open.ticket} avatar={avatar} look={look} itemDyes={me.itemDyes} initialTarget={itemId} onClose={() => setOpen(null)} onDone={onNotice} />
      )}
      {open?.kind === "direct" && (
        <DirectDyeDialog ticket={{ itemId: open.itemId, name: open.name, mode: open.mode }} avatar={avatar} look={look} itemDyes={me.itemDyes} initialTarget={itemId} onClose={() => setOpen(null)} onDone={onNotice} />
      )}
    </div>
  );
}
