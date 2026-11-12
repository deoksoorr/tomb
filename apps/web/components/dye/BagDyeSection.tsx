"use client";

import { useEffect, useState, type ReactNode } from "react";
import { DYE_PART_NAMES, ITEMS } from "@tomb/protocol";
import { dyeApi } from "@/lib/dye/client";
import type { DyeSessionView, FixedDyeDef } from "@/lib/dye/types";
import { meStore } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import bag from "../account/BagDialog.module.css";
import { currentLook } from "../account/items";
import { cx } from "../ui/cx";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import DyeDialog, { type DyeTicket } from "./DyeDialog";
import { fixedTicket, ticketOf } from "./StylePanel";
import styles from "./StylePanel.module.css";

// 가방 "폭죽·묘비" 칸 맨 위: 46번 염색권 (무작위·고정 색) 쓰기 + 진행 중인 염색 이어서 하기

const RANDOM = ITEMS.filter((i) => i.kind === "dye");

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
              desc: `정해진 색 ${d.color}${d.parts?.length ? ` · ${d.parts.map((p) => DYE_PART_NAMES[p]).join("·")}에만` : ""}`,
              count: n,
              icon: <span className={styles.swatch} style={{ background: d.color, width: 32, height: 32 }} aria-hidden="true" />,
              ticket: fixedTicket(d),
            },
          ]
        : [];
    }),
  ];

  // 다 쓴 뒤에도 결과 창은 남아 있어야 하므로 창이 열려 있으면 그린다
  if (!rows.length && !session && !open) return null;
  const look = currentLook(me.equipped, openedAt);

  return (
    <section className={bag.section}>
      <h3 className={bag.heading}>염색권</h3>
      {session && (
        <div className={styles.banner} role="status">
          <span>{DYE_PART_NAMES[session.part]} 염색이 진행 중이에요.</span>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={() => setOpen({ ticket: null, resume: session })}>
            이어서 하기
          </button>
        </div>
      )}
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
    </section>
  );
}
