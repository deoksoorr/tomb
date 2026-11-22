"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { toUi } from "@/lib/uiScale";
import styles from "./TopLeftCluster.module.css";

/**
 * 11/22 터치 화면(폰·태블릿) 왼쪽 위 칩 묶음: 긴급 의뢰 · 자동 낚시 · 📌소식 · 새 개발자 노트 · 첫 걸음(미션)을
 * 칸마다 따로 위치를 계산해 다섯 층으로 쌓던 것(--urgent-h·--autofish-h·--pin-h·--note-h·--retain-h 줄줄이)을 한 상자에 모은다.
 *  - 넓으면 두 줄: [긴급 · 자동 낚시] / [소식 · 개발자 노트 · 첫 걸음]. 세로 폰처럼 좁으면 순서대로 흘려 들어가는 만큼 한 줄에 (넘치는 것만 아래로)
 *  - 칩은 각자 자리에서 그리고(상태·동작 그대로), 이 상자로 포털만 한다. 데스크톱은 상자가 없어 예전 자리 그대로
 *  - 상자 맨 아래 y를 --tl-bottom(문서 루트)으로 알린다 → 그 아래 놓이는 것(마을 소식 띠·접속 보너스·물때 줄)이 칩을 가리지 않는다
 */

export type TopLeftKind = "urgent" | "fish" | "pin" | "note" | "retain";
type Slots = { a: HTMLElement | null; b: HTMLElement | null };

/** 첫 줄(a): 긴급·자동 낚시 — 지금 돌아가는 것. 둘째 줄(b): 소식·개발자 노트·첫 걸음 — 읽을 것·할 것 */
const GROUP: Record<TopLeftKind, keyof Slots> = { urgent: "a", fish: "a", pin: "b", note: "b", retain: "b" };

const SlotContext = createContext<Slots | null>(null);

/** GameShell: 터치 화면이면 묶음 상자 자리(on), 아니면 null (칩은 제자리에 그린다) */
export function useTopLeftSlots(on: boolean) {
  const [a, setA] = useState<HTMLElement | null>(null);
  const [b, setB] = useState<HTMLElement | null>(null);
  const value = useMemo<Slots | null>(() => (on ? { a, b } : null), [on, a, b]);
  return { value, setA, setB };
}

export const TopLeftProvider = SlotContext.Provider;

/**
 * 칩 하나를 묶음 상자로 보낸다 (터치). 상자가 없으면(데스크톱) 그대로 제자리에.
 * overlay: 예전에 월드 HUD(.overlay) 안에 있던 칩 — 집·사냥터·탈것·바라보기 중엔 숨고 불멍 중엔 흐리게 (예전 그대로)
 */
export function TopLeftItem({ kind, overlay, children }: { kind: TopLeftKind; overlay?: boolean; children: ReactNode }) {
  const slots = useContext(SlotContext);
  if (!slots) return <>{children}</>;
  const el = slots[GROUP[kind]];
  // 상자가 막 붙는 첫 그림에서는 그리지 않는다 (예전 고정 자리에 한 번 번쩍이지 않게)
  if (!el) return null;
  return createPortal(
    <div className={styles.item} data-tl={kind} data-overlay={overlay || undefined}>
      {children}
    </div>,
    el,
  );
}

/** 터치 화면 왼쪽 위 묶음 상자 ([메뉴] 줄 바로 아래). hide·dim은 월드 HUD가 숨거나 흐려지는 때 (overlay 칩에만) */
export function TopLeftCluster({ setA, setB, hide, dim }: { setA: (el: HTMLElement | null) => void; setB: (el: HTMLElement | null) => void; hide: boolean; dim: boolean }) {
  const [box, setBox] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!box) return;
    const root = document.documentElement;
    const put = () => {
      const r = box.getBoundingClientRect();
      if (r.height > 0) root.style.setProperty("--tl-bottom", `${Math.ceil(toUi(r.bottom))}px`);
      else root.style.removeProperty("--tl-bottom");
    };
    put();
    const ro = new ResizeObserver(put);
    ro.observe(box);
    return () => {
      ro.disconnect();
      root.style.removeProperty("--tl-bottom");
    };
  }, [box]);
  return (
    <div ref={setBox} className={styles.cluster} data-hide={hide || undefined} data-dim={dim || undefined}>
      <div ref={setA} className={styles.row} />
      <div ref={setB} className={styles.row} />
    </div>
  );
}
