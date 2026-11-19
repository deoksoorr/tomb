"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { cardWindowUrl } from "@/game/rpg/cards/cardArt";
import { iconUrl } from "@/game/rpg/icons";
import { PROC_SHOW_MS, type ProcView } from "@/lib/rpg/procs";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import c from "./cards.module.css";

// 11/17 「발동」 표시: 발동형 카드·세트 장비 효과가 터지는 순간 그 그림이 오른쪽에서 미끄러져 들어와 2초 떠 있다 (game/rpg/procToast showProc).
// 여러 장이면 위아래로 쌓인다. 같은 것이 또 터지면 새로 쌓지 않고 그 장을 다시 2초로. 부활은 맨 위에 크게 (가운데에 두면 일어나는 내 캐릭터를 가린다).
// 폰(손가락·좁은 화면)은 스킬 칸·조이스틱을 가리지 않게 위쪽 가운데에 작게 (cards.module.css)

/** 빠져나가는 시간 (2초 안에서) */
const OUT_MS = 260;
/** 한 번에 쌓는 장 수 (넘치면 오래된 것부터) */
const MAX = 4;

type Live = ProcView & { until: number; n: number };

/** 그림은 크게 구워 정수배로 줄여 보인다 (카드 24칸 ×6, 장비 16칸 ×8 — 72·48·144px 어디서나 칸이 고르게) */
function Art({ p }: { p: ProcView }) {
  const card = "card" in p.art;
  const src = "card" in p.art ? cardWindowUrl(p.art.card, 6) : iconUrl(p.art.icon, 8);
  return <img className={cx(c.procArt, !card && c.procIcon)} src={src} width={72} height={72} alt="" aria-hidden="true" />;
}

export default function ProcToasts() {
  const [list, setList] = useState<Live[]>([]);
  const [now, setNow] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useBridgeEvent("rpg:proc", (p) => {
    const t = performance.now();
    setNow(t);
    setList((old) => {
      const live = old.filter((x) => x.until > t);
      const same = live.find((x) => x.key === p.key);
      // 같은 것이 떠 있으면 그 자리에서 다시 2초 (n이 바뀌면 살짝 튄다)
      if (same) return live.map((x) => (x === same ? { ...p, until: t + (p.ms ?? PROC_SHOW_MS), n: x.n + 1 } : x));
      return [...live, { ...p, until: t + (p.ms ?? PROC_SHOW_MS), n: 0 }].slice(-MAX);
    });
  });

  // 다음으로 끝나는 장에 맞춰 다시 그린다 (빠져나가기 시작 · 사라짐)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!list.length) return;
    const t = performance.now();
    const next = Math.min(...list.flatMap((x) => [x.until - OUT_MS, x.until]).filter((v) => v > t));
    timer.current = setTimeout(
      () => {
        const t2 = performance.now();
        setNow(t2);
        setList((old) => (old.some((x) => x.until <= t2) ? old.filter((x) => x.until > t2) : old));
      },
      Math.max(16, (Number.isFinite(next) ? next : t) - t + 4),
    );
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [list, now]);

  if (!list.length) return null;
  const card = (p: Live) => (
    <div
      key={`${p.key}|${p.n}`}
      className={cx(c.proc, p.big && c.procBig, now >= p.until - OUT_MS && c.procOut)}
      style={{ "--proc": `#${p.color.toString(16).padStart(6, "0")}` } as CSSProperties}
      role="status"
    >
      <Art p={p} />
      <div className={c.procText}>
        <span className={c.procName}>{p.name}</span>
        <strong className={c.procFire}>{p.tag ?? "발동!"}</strong>
        <span className={c.procLine}>{p.line}</span>
        {p.left && <span className={c.procLeft}>{p.left}</span>}
      </div>
    </div>
  );
  return (
    <div className={c.procStack} aria-live="polite">
      {[...list.filter((x) => x.big), ...list.filter((x) => !x.big)].map(card)}
    </div>
  );
}
