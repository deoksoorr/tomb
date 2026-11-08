"use client";

import { useId, useMemo, useRef, useState } from "react";
import { sortByRevives } from "@/lib/hooks/graveMerge";
import { todayKst } from "@/lib/epitaph";
import type { PublicGrave } from "@/lib/types";
import { cx } from "../ui/cx";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import styles from "./RankingPanel.module.css";

type Tab = "revive" | "flower" | "recent";

const TABS: { id: Tab; label: string; empty: string }[] = [
  { id: "revive", label: "살려주세요 순", empty: "아직 살려 달라는 목소리가 없어요." },
  { id: "flower", label: "헌화 순", empty: "아직 놓인 꽃이 없어요." },
  { id: "recent", label: "최근 안장", empty: "아직 아무도 잠들지 않았어요." },
];

const LIMIT = 20;

function ranked(graves: readonly PublicGrave[], reviveTop: readonly string[], tab: Tab): PublicGrave[] {
  if (tab === "revive") return sortByRevives(graves, reviveTop);
  if (tab === "flower") return graves.filter((g) => g.flowers > 0).sort((a, b) => b.flowers - a.flowers);
  return [...graves].sort((a, b) => b.createdAt - a.createdAt);
}

function metric(g: PublicGrave, tab: Tab): string {
  if (tab === "revive") return `🙏 ${g.revives}`;
  if (tab === "flower") return `🌼 ${g.flowers}`;
  return todayKst(g.createdAt).replaceAll("-", ".");
}

type Props = {
  graves: readonly PublicGrave[];
  reviveTop: readonly string[];
  /** 항목 클릭: 그 묘비 앞으로 순간이동 + 상세 모달 */
  onPick: (graveId: string) => void;
};

/** 우측 접이식 랭킹 */
export default function RankingPanel({ graves, reviveTop, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("revive");
  const toggleRef = useRef<HTMLButtonElement>(null);
  const baseId = useId();
  const items = useMemo(() => ranked(graves, reviveTop, tab).slice(0, LIMIT), [graves, reviveTop, tab]);
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  function pick(graveId: string) {
    // 좁은 화면에서는 패널이 월드를 가리므로 접는다
    if (window.matchMedia("(max-width: 640px)").matches) setOpen(false);
    onPick(graveId);
  }

  return (
    <section className={styles.ranking} aria-label="랭킹">
      <button
        ref={toggleRef}
        type="button"
        className={cx(ui.button, styles.toggle)}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${baseId}-panel`}
      >
        <PixelIcon name="list" />
        <span>랭킹</span>
      </button>

      {open && (
        <div
          id={`${baseId}-panel`}
          className={cx(ui.panel, styles.panel)}
          onKeyDown={(e) => {
            if (e.key !== "Escape") return;
            setOpen(false);
            toggleRef.current?.focus();
          }}
        >
          <div className={styles.tabs} role="tablist" aria-label="랭킹 기준">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`${baseId}-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`${baseId}-list`}
                className={styles.tab}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div id={`${baseId}-list`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.listWrap}>
            {items.length === 0 ? (
              <p className={styles.empty}>{current.empty}</p>
            ) : (
              <ol className={styles.list}>
                {items.map((g, i) => (
                  <li key={g.id}>
                    <button type="button" className={styles.item} onClick={() => pick(g.id)}>
                      <span className={styles.rank}>{i + 1}</span>
                      <span className={styles.name}>{g.name}</span>
                      <span className={styles.metric}>{metric(g, tab)}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
