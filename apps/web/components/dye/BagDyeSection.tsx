"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DYE_PART_NAMES, DYE_PARTS, isFixedDyeId, ITEMS } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { specDye } from "@/game/sprites/avatar";
import { dyeApi } from "@/lib/dye/client";
import type { DyeSessionView, FixedDyeDef } from "@/lib/dye/types";
import { meStore } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import bag from "../account/BagDialog.module.css";
import { currentLook } from "../account/items";
import { openShopTab } from "../shop/shopTab";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import DyeDialog, { type DyeTicket } from "./DyeDialog";
import { fixedTicket, ticketOf } from "./StylePanel";
import styles from "./StylePanel.module.css";

// 가방 "염색권" 칸 (11/12: 예전엔 "폭죽·묘비" 칸 맨 위에 섞여 있었다).
// 가진 염색권(무작위 3종·고정 색) 쓰기 · 진행 중인 염색 이어서 하기 · 지금 부위 색 · 원래 색 되돌리기·외형 바꾸기 바로가기(상점 염색·외형 탭)

const RANDOM = ITEMS.filter((i) => i.kind === "dye");

/** 가방 탭 숫자: 무작위 염색권 + 고정 색 염색권(dyefix_*) 개수 */
export function dyeTicketCount(inventory: Record<string, number>): number {
  return Object.entries(inventory).reduce((n, [id, c]) => n + (RANDOM.some((i) => i.id === id) || isFixedDyeId(id) ? c : 0), 0);
}

export default function BagDyeSection({ me, avatar, onNotice }: { me: Me; avatar: { color: string; body: string }; onNotice: (m: string | null) => void }) {
  const [session, setSession] = useState<DyeSessionView | null>(null);
  const [tickets, setTickets] = useState<Record<string, FixedDyeDef>>({});
  const [open, setOpen] = useState<{ ticket: DyeTicket | null; resume: DyeSessionView | null } | null>(null);
  const invKey = Object.keys(me.inventory).join(",");
  const [openedAt] = useState(() => Date.now());

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

  const rows: { key: string; name: string; desc: string; count: number; icon: ReactNode; ticket: DyeTicket }[] = [
    ...RANDOM.flatMap((item) => {
      const n = me.inventory[item.id] ?? 0;
      const t = ticketOf(item);
      return n > 0 && t ? [{ key: item.id, name: item.name, desc: item.desc, count: n, icon: <ItemIcon itemId={item.id} size={32} />, ticket: t }] : [];
    }),
    ...Object.values(tickets).flatMap((d) => {
      const n = me.inventory[d.id] ?? 0;
      return n > 0
        ? [
            {
              key: d.id,
              name: d.name,
              desc: `정해진 색 ${d.color} · ${d.parts?.length ? `${d.parts.map((p) => DYE_PART_NAMES[p]).join("·")}에만` : "모든 부위"}`,
              count: n,
              icon: <span className={styles.swatch} style={{ background: d.color, width: 32, height: 32 }} aria-hidden="true" />,
              ticket: fixedTicket(d),
            },
          ]
        : [];
    }),
  ];

  const look = currentLook(me.equipped, openedAt);
  const dye = specDye(avatar.color);
  const toShop = () => {
    openShopTab("dye");
    bridge.emit("shop:open");
  };

  return (
    <div className={bag.others}>
      {session && (
        <div className={styles.banner} role="status">
          <span>{DYE_PART_NAMES[session.part]} 염색이 진행 중이에요.</span>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => setOpen({ ticket: null, resume: session })}>
            이어서 하기
          </button>
        </div>
      )}
      <section className={bag.section}>
        <h3 className={bag.heading}>가진 염색권</h3>
        {rows.length === 0 ? (
          <p className={bag.empty}>염색권이 없어요. 상점의 염색·외형에서 살 수 있어요.</p>
        ) : (
          <ul className={bag.list}>
            {rows.map((r) => (
              <li key={r.key} className={bag.row}>
                {r.icon}
                <span className={bag.main}>
                  <span className={bag.name}>
                    {r.name} <span className={bag.count}>×{r.count}</span>
                  </span>
                  <span className={bag.meta}>{r.desc}</span>
                </span>
                <button type="button" className={ui.button} disabled={!!session} onClick={() => setOpen({ ticket: r.ticket, resume: null })}>
                  쓰기
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={bag.section}>
        <h3 className={bag.heading}>지금 색</h3>
        <ul className={bag.list} aria-label="부위별 지금 색">
          {DYE_PARTS.map((p) => (
            <li key={p} className={bag.row}>
              <span className={styles.swatch} data-empty={dye[p] ? undefined : ""} style={{ background: dye[p] ?? undefined, width: 24, height: 24 }} aria-hidden="true" />
              <span className={bag.main}>
                <span className={bag.name}>{DYE_PART_NAMES[p]}</span>
                <span className={bag.meta}>{dye[p] ?? "원래 색"}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className={styles.banner}>
          <span>원래 색 되돌리기·외형 바꾸기는 상점에서 해요.</span>
          <button type="button" className={ui.button} onClick={toShop}>
            상점 염색·외형
          </button>
        </div>
      </section>
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
    </div>
  );
}
