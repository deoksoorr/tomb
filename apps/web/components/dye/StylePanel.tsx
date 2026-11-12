"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AVATAR_BODIES, DYE_PART_NAMES, DYE_PARTS, ITEMS, type DyePart, type ItemDef } from "@tomb/protocol";
import { specDye, withDyePart } from "@/game/sprites/avatar";
import { api, errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import { DYE_RESET_PRICE, RESHAPE_PRICE } from "@/lib/dye/rules";
import type { DyeSessionView, FixedDyeDef } from "@/lib/dye/types";
import { meStore } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import { applyStyle } from "../account/actions";
import AvatarSprite from "../entry/AvatarSprite";
import shop from "../shop/ShopDialog.module.css";
import OutfitPreview from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import DyeDialog, { type DyeTicket } from "./DyeDialog";
import styles from "./StylePanel.module.css";

// 상점 "염색·외형" 탭: 46번 염색권(사기·쓰기) · 진행 중인 염색 이어서 하기 · 25번 외형 바꾸기 · 원래 색 되돌리기.
// 왼쪽(폰은 위) 자세히 보기 = 바꾸면 어떻게 보이는지 미리 보기, 오른쪽 = 고를 것들.

const DYE_ITEMS = ITEMS.filter((i) => i.kind === "dye" && i.dye?.mode === "random");

type Sel = { kind: "ticket"; itemId: string } | { kind: "fixed"; id: string } | { kind: "body"; body: string } | { kind: "reset"; part: DyePart };

type Props = {
  me: Me | null;
  /** 내 아바타 (resolveAvatar: 염색이 들어간 색 표기 + 몸) */
  avatar: { color: string; body: string };
  look: readonly string[];
  onNotice: (m: string | null) => void;
};

export function ticketOf(item: ItemDef): DyeTicket | null {
  const d = item.dye;
  if (!d) return null;
  return d.mode === "random" ? { itemId: item.id, name: item.name, mode: "random", tier: d.tier } : { itemId: item.id, name: item.name, mode: "fixed", color: d.color, parts: d.parts };
}

export const fixedTicket = (d: FixedDyeDef): DyeTicket => ({ itemId: d.id, name: d.name, mode: "fixed", color: d.color, parts: d.parts });

export default function StylePanel({ me, avatar, look, onNotice }: Props) {
  const [sel, setSel] = useState<Sel>({ kind: "ticket", itemId: DYE_ITEMS[0]?.id ?? "" });
  const [pending, setPending] = useState(false);
  const [session, setSession] = useState<DyeSessionView | null>(null);
  const [tickets, setTickets] = useState<Record<string, FixedDyeDef>>({});
  const [open, setOpen] = useState<{ ticket: DyeTicket | null; resume: DyeSessionView | null } | null>(null);
  const invKey = me ? Object.keys(me.inventory).join(",") : "";

  // 진행 중인 판·고정 색 염색권 정의 (가방이 바뀌면 다시)
  useEffect(() => {
    let alive = true;
    dyeApi
      .state()
      .then((s) => {
        if (!alive) return;
        setSession(s.session);
        setTickets(s.tickets);
        // 서버 가방에는 있는데 내 정보에 없는 염색권(선물함에서 막 받음) → 내 정보를 다시 받는다
        const stale = Object.keys(s.tickets).some((id) => !invKey.split(",").includes(id));
        if (s.finalized || stale) void meStore.refresh();
        if (s.finalized) {
          onNotice(`시간이 지난 염색은 ${DYE_PART_NAMES[s.finalized.part]} ${s.finalized.color}(으)로 정해졌어요.`);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [invKey, open, onNotice]);

  const dye = specDye(avatar.color);
  const owned = (id: string) => me?.inventory[id] ?? 0;
  const myBody = avatar.body;

  async function run(task: () => Promise<void>) {
    setPending(true);
    onNotice(null);
    try {
      await task();
    } catch (e) {
      onNotice(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const buyTicket = (item: ItemDef) =>
    run(async () => {
      const res = await api.buy(item.id);
      meStore.set(res.me);
      onNotice(`${item.name}을(를) 가방에 넣었어요.`);
    });

  const doReshape = (body: string) =>
    run(async () => {
      const res = await dyeApi.reshape(body);
      applyStyle(res);
      onNotice(`${AVATAR_BODIES.find((b) => b.id === body)?.label ?? body}(으)로 바꿨어요. 염색한 색은 그대로 따라가요.`);
    });

  const doReset = (part: DyePart) =>
    run(async () => {
      const res = await dyeApi.reset(part);
      applyStyle(res);
      onNotice(`${DYE_PART_NAMES[part]}을(를) 원래 색으로 되돌렸어요.`);
    });

  // ── 자세히 보기 ──
  let previewColor = avatar.color;
  let previewBody = myBody;
  let title = "";
  let desc = "";
  let action: ReactNode = null;
  const short = (price: number) => me !== null && me.points < price;

  if (sel.kind === "ticket") {
    const item = DYE_ITEMS.find((i) => i.id === sel.itemId) ?? DYE_ITEMS[0];
    const n = owned(item.id);
    title = item.name;
    desc = `${item.desc} 제한 시간은 모두 60초예요.`;
    action = (
      <>
        <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={!me || pending || short(item.price)} onClick={() => buyTicket(item)}>
          {`${item.price}P${short(item.price) ? " · 모자라요" : " · 사기"}`}
        </button>
        {n > 0 && (
          <button type="button" className={cx(ui.button, shop.buy)} disabled={pending || !!session} onClick={() => setOpen({ ticket: ticketOf(item), resume: null })}>
            쓰기 (가방에 {n}장)
          </button>
        )}
      </>
    );
  } else if (sel.kind === "fixed") {
    const d = tickets[sel.id];
    const part = d?.parts?.[0] ?? "body";
    if (d) previewColor = withDyePart(avatar.color, part, d.color);
    title = d?.name ?? "고정 색 염색권";
    desc = d ? `정해진 색 ${d.color}으로 바로 염색해요.${d.parts?.length ? ` 쓸 수 있는 부위: ${d.parts.map((p) => DYE_PART_NAMES[p]).join("·")}` : ""}` : "";
    action = d && (
      <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={pending || owned(d.id) < 1} onClick={() => setOpen({ ticket: fixedTicket(d), resume: null })}>
        쓰기 (가방에 {owned(d.id)}장)
      </button>
    );
  } else if (sel.kind === "body") {
    previewBody = sel.body;
    const same = sel.body === myBody;
    title = `외형 바꾸기 · ${AVATAR_BODIES.find((b) => b.id === sel.body)?.label ?? ""}`;
    desc = "몸 모양을 바꿔요. 염색한 머리·몸·포인트 색은 새 몸의 같은 부위로 그대로 따라가요.";
    action = (
      <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={!me || pending || same || short(RESHAPE_PRICE)} onClick={() => doReshape(sel.body)}>
        {same ? "지금 이 모습이에요" : `${RESHAPE_PRICE}P${short(RESHAPE_PRICE) ? " · 모자라요" : " · 이 모습으로"}`}
      </button>
    );
  } else {
    const dyed = !!dye[sel.part];
    previewColor = withDyePart(avatar.color, sel.part, null);
    title = `${DYE_PART_NAMES[sel.part]} 원래 색으로`;
    desc = "염색한 부위를 처음 색으로 되돌려요.";
    action = (
      <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={!me || pending || !dyed || short(DYE_RESET_PRICE)} onClick={() => doReset(sel.part)}>
        {!dyed ? "이미 원래 색이에요" : `${DYE_RESET_PRICE}P${short(DYE_RESET_PRICE) ? " · 모자라요" : " · 되돌리기"}`}
      </button>
    );
  }

  const fixedOwned = Object.values(tickets).filter((d) => owned(d.id) > 0);

  return (
    <>
      <section className={shop.detail} aria-label="자세히 보기" aria-live="polite">
        <OutfitPreview className={shop.fitPreview} color={previewColor} body={previewBody} look={look} label={`${title} 미리 보기`} />
        <div className={shop.info}>
          <p className={shop.name}>{title}</p>
          <p className={shop.desc}>{desc}</p>
          {action}
        </div>
      </section>

      <div className={shop.listCol}>
        {session && (
          <div className={styles.banner} role="status">
            <span>{DYE_PART_NAMES[session.part]} 염색이 진행 중이에요.</span>
            <button type="button" className={cx(ui.button, ui.primary)} onClick={() => setOpen({ ticket: null, resume: session })}>
              이어서 하기
            </button>
          </div>
        )}
        <div className={styles.scroll}>
          <h3 className={styles.heading}>염색권</h3>
          <ul className={shop.grid} aria-label="염색권">
            {DYE_ITEMS.map((item) => (
              <li key={item.id}>
                <button type="button" className={shop.tile} aria-pressed={sel.kind === "ticket" && sel.itemId === item.id} onClick={() => setSel({ kind: "ticket", itemId: item.id })}>
                  <span className={shop.thumb}>
                    <ItemIcon itemId={item.id} size={48} />
                  </span>
                  <span className={shop.tileName}>{item.name}</span>
                  <span className={shop.tilePrice}>
                    {item.price}P{owned(item.id) > 0 && <span className={shop.badge}>{owned(item.id)}장</span>}
                  </span>
                </button>
              </li>
            ))}
            {fixedOwned.map((d) => (
              <li key={d.id}>
                <button type="button" className={shop.tile} aria-pressed={sel.kind === "fixed" && sel.id === d.id} onClick={() => setSel({ kind: "fixed", id: d.id })}>
                  <span className={shop.thumb}>
                    <span className={styles.swatch} style={{ background: d.color }} aria-hidden="true" />
                  </span>
                  <span className={shop.tileName}>{d.name}</span>
                  <span className={shop.tilePrice}>
                    <span className={shop.badge}>{owned(d.id)}장</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <h3 className={styles.heading}>외형 바꾸기 · {RESHAPE_PRICE}P</h3>
          <ul className={shop.grid} aria-label="몸 모양">
            {AVATAR_BODIES.map((b) => (
              <li key={b.id}>
                <button type="button" className={shop.tile} aria-pressed={sel.kind === "body" && sel.body === b.id} onClick={() => setSel({ kind: "body", body: b.id })}>
                  <span className={shop.thumb}>
                    <AvatarSprite color={avatar.color} body={b.id} scale={2} />
                  </span>
                  <span className={shop.tileName}>{b.label}</span>
                  <span className={shop.tilePrice}>{b.id === myBody ? <span className={shop.badge}>지금</span> : `${RESHAPE_PRICE}P`}</span>
                </button>
              </li>
            ))}
          </ul>

          <h3 className={styles.heading}>원래 색으로 · 부위마다 {DYE_RESET_PRICE}P</h3>
          <ul className={shop.grid} aria-label="원래 색으로 되돌릴 부위">
            {DYE_PARTS.map((p) => (
              <li key={p}>
                <button type="button" className={shop.tile} aria-pressed={sel.kind === "reset" && sel.part === p} onClick={() => setSel({ kind: "reset", part: p })}>
                  <span className={shop.thumb}>
                    <span className={styles.swatch} style={{ background: dye[p] ?? "transparent" }} data-empty={!dye[p] || undefined} aria-hidden="true" />
                  </span>
                  <span className={shop.tileName}>{DYE_PART_NAMES[p]}</span>
                  <span className={shop.tilePrice}>{dye[p] ? `${DYE_RESET_PRICE}P` : "원래 색"}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {open && (
        <DyeDialog
          ticket={open.ticket}
          resume={open.resume}
          avatar={avatar}
          look={look}
          onClose={() => setOpen(null)}
          onDone={(m) => {
            onNotice(m);
            setSession(null);
          }}
        />
      )}
    </>
  );
}
