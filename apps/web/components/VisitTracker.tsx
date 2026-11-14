"use client";

import { useEffect } from "react";

// 47번 방문 분석 (가벼운 신호 두 가지, 화면에는 아무것도 그리지 않는다):
//  - 방문: 브라우저 세션(탭)마다 한 번, 처음 연 주소의 경로 모양·리퍼러·utm을 /api/analytics/hit로
//  - 체류: 화면이 보이던 시간만 모아 숨겨질 때·나갈 때 한 번씩 /api/analytics/stay로 (sendBeacon).
//    주기 전송은 없다 (Redis 명령 절약 — 숨길 때·나갈 때 모아서 한 번)
// 관리자 화면은 세지 않는다. 저장소가 막힌 브라우저(사생활 보호 모드)는 페이지마다 한 번 보낸다.

const HIT_KEY = "tomb.visit";
const MIN_STAY_SEC = 3;

function sendHit(): void {
  const u = new URL(window.location.href);
  const q = u.searchParams;
  const body = {
    ref: document.referrer || null,
    path: u.pathname,
    grave: q.has("grave"),
    utm: { source: q.get("utm_source"), medium: q.get("utm_medium"), campaign: q.get("utm_campaign") },
  };
  void fetch("/api/analytics/hit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    keepalive: true,
  }).catch(() => {});
}

function sendStay(sec: number): void {
  const data = JSON.stringify({ sec });
  try {
    if (navigator.sendBeacon?.("/api/analytics/stay", new Blob([data], { type: "application/json" }))) return;
  } catch {
    // 아래 fetch로
  }
  void fetch("/api/analytics/stay", { method: "POST", headers: { "content-type": "application/json" }, body: data, keepalive: true }).catch(() => {});
}

export default function VisitTracker() {
  useEffect(() => {
    if (window.location.pathname.startsWith("/admin")) return;
    let first = true;
    try {
      first = !sessionStorage.getItem(HIT_KEY);
      sessionStorage.setItem(HIT_KEY, "1");
    } catch {
      first = true;
    }
    if (first) sendHit();

    let since = document.visibilityState === "visible" ? performance.now() : null;
    let acc = 0;
    const flush = () => {
      if (since !== null) {
        const now = performance.now();
        acc += now - since;
        since = document.visibilityState === "visible" ? now : null;
      }
      const sec = Math.round(acc / 1000);
      if (sec < MIN_STAY_SEC) return;
      acc = 0;
      sendStay(Math.min(sec, 6 * 3600));
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        if (since === null) since = performance.now();
      } else flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);
  return null;
}
