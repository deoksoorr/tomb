"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DYE_PART_NAMES, DYE_PARTS, isFixedDyeId, ITEMS } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { specDye } from "@/game/sprites/avatar";
import { dyeApi } from "@/lib/dye/client";
import { colorLabel, swatchStyle } from "@/lib/dye/look";
import { specialLabel, wobbleLabel } from "@/lib/dye/palette";
import { dyeCountsDiffer } from "@/lib/dye/rules";
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
  const alive = useRef(true);

  /** 서버 기준으로 진행 중인 판·염색권 개수를 다시 받는다 (개수가 내 정보와 다르면 내 정보를 다시 받아 가방 표시를 맞춘다) */
  const sync = useCallback(() => {
    dyeApi
      .state()
      .then((s) => {
        if (!alive.current) return;
        setSession(s.session);
        setTickets(s.tickets);
        // 선물함에서 막 받음 · 시작하며 1장 씀 · 만료로 정리됨 → 서버 개수와 다르면 내 정보를 다시 받는다
        if (dyeCountsDiffer(meStore.getSnapshot().me?.inventory ?? {}, s.counts ?? {})) void meStore.refresh();
        if (s.ended) onNotice(`시간이 지난 ${DYE_PART_NAMES[s.ended.part]} 염색은 끝났어요. 색은 그대로예요.`);
      })
      .catch(() => {});
  }, [onNotice]);

  useEffect(() => {
    alive.current = true;
    sync();
    return () => {
      alive.current = false;
    };
  }, [invKey, sync]);

  const rows: { key: string; name: string; desc: string; count: number; icon: ReactNode; ticket: DyeTicket }[] = [
    ...RANDOM.flatMap((item) => {
      const n = me.inventory[item.id] ?? 0;
      const t = ticketOf(item);
      return n > 0 && t ? [{ key: item.id, name: item.name, desc: t.mode === "random" ? `${item.desc} (흔들림 ${wobbleLabel(t.tier)} · 특수 색은 ${specialLabel(t.tier)})` : item.desc, count: n, icon: <ItemIcon itemId={item.id} size={32} />, ticket: t }] : [];
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
                {/* 진행 중인 판이 있으면 새 염색권을 쓰지 않고 그 판을 이어서 연다 (서버도 같은 규칙) */}
                <button type="button" className={ui.button} onClick={() => setOpen(session ? { ticket: null, resume: session } : { ticket: r.ticket, resume: null })}>
                  {session ? "이어서" : "쓰기"}
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
              <span className={styles.swatch} data-empty={dye[p] ? undefined : ""} style={{ ...(dye[p] ? swatchStyle(dye[p]) : {}), width: 24, height: 24 }} aria-hidden="true" />
              <span className={bag.main}>
                <span className={bag.name}>{DYE_PART_NAMES[p]}</span>
                <span className={bag.meta}>{dye[p] ? colorLabel(dye[p]) : "원래 색"}</span>
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
          onClose={(pending) => {
            setOpen(null);
            // 포기 요청이 끝난 뒤에 상태를 받아야 이미 끝난 판이 "진행 중"으로 남지 않는다
            void (pending ?? Promise.resolve()).then(sync);
          }}
          onDone={(m) => {
            onNotice(m);
            setSession(null);
          }}
        />
      )}
    </div>
  );
}
