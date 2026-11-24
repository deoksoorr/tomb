"use client";

import { useEffect, useState } from "react";
import { type GaugeKind, playGauge, type PlayGauge as Gauge } from "@/lib/playGauge";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { cx } from "../ui/cx";
import styles from "./PlayGauge.module.css";
import { playWanted } from "./RetainHud";

/** 다 찬 뒤 「완료!」를 보여 주는 시간 */
const DONE_SHOW_MS = 2_400;
const TITLE: Record<GaugeKind, string> = { bumper: "범퍼카 미션", sky: "하늘 구경 미션", fire: "불멍 미션" };

/**
 * 11/24 시간 미션 게이지: 그 놀이가 오늘 미션에 있고 아직 못 채웠을 때만, 하는 동안 잰 시간을 채워 보인다.
 *  - 범퍼카: 게임(BumperRide)이 실제로 몬 시간을 1초마다 bumper:drive로 (멈춰 있던 시간은 안 는다)
 *  - 관람차·열기구(sky:hud가 있는 동안)·불멍(view:mode campfire): 시작한 때부터 흐른 시간
 * 미션은 RetainHud가 같은 시각(playSendMs)에 보내고, 게이지는 그때 꽉 차 「완료!」를 잠깐 보인 뒤 사라진다. 그만두면 바로 숨김
 */
export function usePlayGauge(kind: GaugeKind): Gauge | null {
  // run = 이번 판 (미션이 아니면 null), ms = 잰 시간
  const [run, setRun] = useState<{ at: number; ms: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  // 관람차·열기구는 sky:hud가 1초마다 오니, 켜져 있는 동안은 이번 판을 그대로 둔다 (다 차서 숨긴 것도 내릴 때까지 숨김)
  const toggle = (on: boolean) => {
    if (!on) {
      setRun(null);
      setHidden(false);
      return;
    }
    setRun((r) => r ?? (playWanted(kind) ? { at: Date.now(), ms: 0 } : null));
  };
  useBridgeEvent("bumper:riding", ({ riding }) => kind === "bumper" && toggle(riding));
  useBridgeEvent("bumper:drive", ({ ms }) => kind === "bumper" && setRun((r) => (r ? { ...r, ms } : r)));
  useBridgeEvent("sky:hud", (hud) => kind === "sky" && toggle(!!hud));
  useBridgeEvent("view:mode", ({ mode }) => kind === "fire" && toggle(mode === "campfire"));

  const g = run ? playGauge(kind, run.ms) : null;
  const done = !!g?.done;
  const timed = !!run && kind !== "bumper" && !done;
  useEffect(() => {
    if (!timed) return;
    const t = setInterval(() => setRun((r) => (r ? { ...r, ms: Date.now() - r.at } : r)), 250);
    return () => clearInterval(t);
  }, [timed]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setHidden(true), DONE_SHOW_MS);
    return () => clearTimeout(t);
  }, [done]);
  return hidden ? null : g;
}

/** 게이지 판 (자리는 부르는 쪽이 정한다: 범퍼카·불멍은 아래 PlayGauges, 관람차·열기구는 SkyHud 아래 가운데 묶음 안) */
export function PlayGaugeView({ kind, g, note, className }: { kind: GaugeKind; g: Gauge; note?: string | null; className?: string }) {
  return (
    <div className={cx(styles.gauge, className)} data-done={g.done || undefined} role="status" aria-label={`${TITLE[kind]} ${g.done ? "완료" : g.text}`}>
      <div className={styles.row}>
        <span className={styles.title}>{TITLE[kind]}</span>
        <span className={styles.time}>{g.done ? "완료!" : g.text}</span>
      </div>
      <div className={styles.track} aria-hidden="true">
        <div className={styles.fill} style={{ transform: `scaleX(${g.frac})` }} />
      </div>
      {note && !g.done && <small className={styles.note}>{note}</small>}
    </div>
  );
}

/** 범퍼카·불멍 게이지 (아래 가운데 고정). GameShell에 둔다 */
export default function PlayGauges() {
  const bumper = usePlayGauge("bumper");
  const fire = usePlayGauge("fire");
  return (
    <>
      {bumper && <PlayGaugeView kind="bumper" g={bumper} note="몰고 다닐 때만 차요 · 내리면 처음부터" className={styles.fixed} />}
      {fire && <PlayGaugeView kind="fire" g={fire} note="일어나면 처음부터" className={styles.fixed} />}
    </>
  );
}
