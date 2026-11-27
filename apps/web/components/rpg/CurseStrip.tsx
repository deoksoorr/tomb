"use client";

import { useState } from "react";
import { activeCurses, curseText, nextCurse } from "@/lib/rpg/tower";
import s from "./rpg.module.css";

// 11/27 야근 빌딩 판 HUD 저주 줄 (운영자 「지금 걸린 저주를 판 안에서 보이게」):
// PC = 작은 판 안 한 줄에 저주마다 짧은 이름 배지, 올리거나 누르면 이름·설명·다음 저주.
// 폰(compact) = 「저주 3」 칩 하나, 누르면 같은 목록. 저주 목록·층은 lib/rpg/tower CURSES 그대로

export default function CurseStrip({ floor, compact = false }: { floor: number; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const on = activeCurses(floor);
  const next = nextCurse(floor);
  if (!on.length && !next) return null;
  const nextText = next ? `다음 저주: ${next.from}층 ${next.name}` : "더 걸릴 저주가 없어요";
  return (
    <div className={s.curseStrip} data-compact={compact || undefined} data-open={open || undefined} onPointerDown={(e) => e.stopPropagation()}>
      <button
        type="button"
        className={s.curseBtn}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`걸린 저주 ${on.length}개. ${nextText}. 누르면 자세히 봐요`}
      >
        {compact || !on.length ? (
          <span className={s.curseCount}>
            저주 <b>{on.length}</b>
            {compact && <i aria-hidden="true">{open ? "▴" : "▾"}</i>}
          </span>
        ) : (
          <>
            <span className={s.curseLabel}>저주</span>
            {on.map((c) => (
              <span key={c.id} className={s.curseBadge}>
                {c.short}
              </span>
            ))}
          </>
        )}
      </button>
      <div className={s.curseList} role="note" aria-label="걸린 저주">
        {on.length ? (
          <ul>
            {on.map((c) => (
              <li key={c.id}>
                <b>{c.name}</b>
                <span className={s.curseFrom}>{c.from}층부터</span>
                <small>{curseText(c)}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p className={s.curseNone}>아직 걸린 저주가 없어요</p>
        )}
        <p className={s.curseNext}>{nextText}</p>
      </div>
    </div>
  );
}

/**
 * 11/27 PC 판 HUD 저주 판 (운영자 「키 안내 옆에 늘 보이게, 올리지 않아도」): 오른쪽 위 키 안내 버튼 옆 작은 판.
 * 걸린 저주마다 「이름 · 짧은 효과」 한 줄 + 흐린 「다음: 120층 연달아 회의」. 자세한 설명은 줄에 올리면(title)
 */
export function CursePanel({ floor }: { floor: number }) {
  const on = activeCurses(floor);
  const next = nextCurse(floor);
  if (!on.length && !next) return null;
  return (
    <section className={s.cursePanel} aria-label="걸린 저주">
      <strong>저주 {on.length}</strong>
      {on.length > 0 && (
        <ul>
          {on.map((c) => (
            <li key={c.id} title={curseText(c)}>
              <b>{c.name}</b> · {c.brief}
            </li>
          ))}
        </ul>
      )}
      <small>{next ? `다음: ${next.from}층 ${next.name}` : "더 걸릴 저주가 없어요"}</small>
    </section>
  );
}
