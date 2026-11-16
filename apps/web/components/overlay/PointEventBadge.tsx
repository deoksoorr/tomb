"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { bridge } from "@/game/bridge";
import { meStore } from "@/lib/hooks/useMe";
import { onVisibleAgain, tabHidden } from "@/lib/hooks/visibleAgain";
import { POINT_EVENT_NOTICE_PREFIX, pointEventBanner, pointEventOn, type PointEvent, type PointEventResponse } from "@/lib/pointEvent";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Hud.module.css";

// 포인트 배수 이벤트 안내 띠 (게임 화면 위 가운데, 문구는 lib/pointEvent pointEventBanner). /api/point-event(CDN 30초 캐시)를 1분마다 가볍게 확인하고,
// 끝나는 시각이 되면 다시 묻지 않아도 저절로 사라진다. 바뀌면 내 정보도 다시 읽어 오늘 포인트 게이지의 한도를 맞춘다.
// 관리자가 켜고 끄고 바꾸면 마을 전체 공지(id가 POINT_EVENT_NOTICE_PREFIX로 시작)가 오니, 들은 즉시 캐시를 건너뛰고 다시 읽는다.
// 다른 서버 인스턴스의 적립 경로 캐시(5초)가 따라올 때쯤 한 번 더 (NOTICE_RECHECK_MS).

/** 다시 확인하는 간격 (앞에 있는 탭만) */
const POLL_MS = 60_000;
/** 이벤트 공지를 듣고 한 번 더 확인하기까지 */
const NOTICE_RECHECK_MS = 6_000;
/** 앞으로 돌아왔을 때 이만큼 지났으면 바로 다시 확인 */
const STALE_MS = 30_000;

/** 마지막으로 받은 값과 받은 시각 (받은 직후 그릴 때 기준 시각이 옛 값이 되지 않게) */
let current: { event: PointEvent | null; at: number } = { event: null, at: 0 };
let fetchedAt = 0;
let loaded = false;
let timer: ReturnType<typeof setInterval> | null = null;
let offVisible: (() => void) | null = null;
let offNotice: (() => void) | null = null;
const listeners = new Set<() => void>();

/** fresh = CDN 캐시를 건너뛴다 (이벤트 공지를 들었을 때) */
async function load(fresh = false) {
  fetchedAt = Date.now();
  try {
    const res = await fetch(fresh ? `/api/point-event?fresh=${fetchedAt}` : "/api/point-event", { cache: "no-store" });
    if (!res.ok) return;
    const next = ((await res.json()) as PointEventResponse).event ?? null;
    const at = Date.now();
    const changed = JSON.stringify(next) !== JSON.stringify(current.event);
    if (changed) current = { event: next, at };
    if (loaded && changed) void meStore.refresh().catch(() => undefined);
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
    offNotice = bridge.on("megaphone:heard", (m) => {
      if (!m.system || !m.id.startsWith(POINT_EVENT_NOTICE_PREFIX)) return;
      void load(true);
      setTimeout(() => {
        void load(true);
        void meStore.refresh().catch(() => undefined);
      }, NOTICE_RECHECK_MS);
    });
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size) return;
    if (timer) clearInterval(timer);
    offVisible?.();
    offNotice?.();
    timer = null;
    offVisible = null;
    offNotice = null;
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
