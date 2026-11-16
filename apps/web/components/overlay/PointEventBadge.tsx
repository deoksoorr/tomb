"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { meStore } from "@/lib/hooks/useMe";
import { onVisibleAgain, tabHidden } from "@/lib/hooks/visibleAgain";
import { pointEventBanner, pointEventOn, type PointEvent, type PointEventResponse } from "@/lib/pointEvent";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Hud.module.css";

// 포인트 배수 이벤트 안내 띠 (게임 화면 위 가운데, 문구는 lib/pointEvent pointEventBanner). /api/point-event(CDN 1분 캐시)를 몇 분마다 가볍게 확인하고,
// 끝나는 시각이 되면 다시 묻지 않아도 저절로 사라진다. 켜지거나 꺼지면 내 정보도 다시 읽어 오늘 포인트 게이지의 한도를 맞춘다.

/** 다시 확인하는 간격 (앞에 있는 탭만) */
const POLL_MS = 5 * 60_000;
/** 앞으로 돌아왔을 때 이만큼 지났으면 바로 다시 확인 */
const STALE_MS = 2 * 60_000;

/** 마지막으로 받은 값과 받은 시각 (받은 직후 그릴 때 기준 시각이 옛 값이 되지 않게) */
let current: { event: PointEvent | null; at: number } = { event: null, at: 0 };
let fetchedAt = 0;
let loaded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let offVisible: (() => void) | null = null;
const listeners = new Set<() => void>();

async function load() {
  fetchedAt = Date.now();
  try {
    const res = await fetch("/api/point-event", { cache: "no-store" });
    if (!res.ok) return;
    const next = ((await res.json()) as PointEventResponse).event ?? null;
    const at = Date.now();
    const wasOn = pointEventOn(current.event, at);
    const changed = JSON.stringify(next) !== JSON.stringify(current.event);
    if (changed) current = { event: next, at };
    if (loaded && wasOn !== pointEventOn(next, at)) void meStore.refresh().catch(() => undefined);
    loaded = true;
    if (changed) listeners.forEach((fn) => fn());
  } catch {
    // 안내 띠일 뿐이라 조용히 넘어간다 (다음 확인 때 다시)
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (listeners.size === 1) {
    if (Date.now() - fetchedAt > STALE_MS) void load();
    timer = setInterval(() => {
      if (!tabHidden()) void load();
    }, POLL_MS);
    offVisible = onVisibleAgain(() => {
      if (Date.now() - fetchedAt > STALE_MS) void load();
    });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size) return;
    if (timer) clearInterval(timer);
    offVisible?.();
    timer = null;
    offVisible = null;
  };
}

/** 지금 켜져 있으면 안내 띠. compact = 터치 화면 위 가장자리 바 아래 */
export default function PointEventBadge({ compact = false }: { compact?: boolean }) {
  const snap = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  const ev = snap?.event ?? null;
  // 1분마다 + 끝나는 순간에 다시 그린다 (끝 문구의 "오늘·내일"과 사라지는 때)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!ev) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    const left = ev.endAt === null ? null : ev.endAt - Date.now();
    const end = left !== null && left > 0 && left < 2 ** 31 - 1 ? setTimeout(() => setNow(Date.now()), left + 50) : null;
    return () => {
      clearInterval(t);
      if (end) clearTimeout(end);
    };
  }, [ev]);

  const t = Math.max(now, snap?.at ?? 0);
  if (!ev || !pointEventOn(ev, t)) return null;
  return (
    <p className={cx(ui.top, styles.event, compact && styles.eventCompact)} role="status">
      {pointEventBanner(ev, t)}
    </p>
  );
}
