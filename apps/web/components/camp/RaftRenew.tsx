"use client";

import { useEffect, useState } from "react";
import { raftHm } from "@tomb/protocol";
import { bridge, type RaftPrompt } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { meStore } from "@/lib/hooks/useMe";
import type { RaftDealResponse } from "@/lib/raft/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import s from "./RaftRenew.module.css";

// 11/27 좌대 연장 칸: 끝나기 1분 전 내 좌대 위에 있을 때만 (game/camp/CampRafts가 camp:raft:prompt). 잠수 방지 —
// 놓치면 끝날 때 좌대에서 내려오고 다시 사야 올라가요. 누르면 오늘 남은 좌대 시간만큼(2시간까지) 늘어요.

export default function RaftRenew() {
  const [p, setP] = useState<RaftPrompt | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  useBridgeEvent("camp:raft:prompt", (x) => {
    setP(x);
    setClock(Date.now());
    if (!x) setError(null);
  });
  useEffect(() => {
    if (!p) return;
    const t = setInterval(() => setClock(Date.now()), 250);
    return () => clearInterval(t);
  }, [p]);
  if (!p) return null;
  const left = Math.max(0, Math.ceil((p.at - clock) / 1000));

  async function renew() {
    setPending(true);
    setError(null);
    try {
      const r = await request<RaftDealResponse>("/api/camp/raft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ op: "renew" }) });
      meStore.set(r.me);
      bridge.emit("camp:raft:grant", { grant: r.grant, status: r.status });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={s.box} role="alertdialog" aria-live="polite" aria-label={`${p.n}번 좌대 연장`}>
      <p className={s.head}>
        {p.n}번 좌대 시간이 <b className={s.sec}>{left}초</b> 남았어요
      </p>
      <p className={s.sub}>오늘 남은 좌대 시간 {raftHm(p.dayLeftMin)} · 남은 연장 {p.renewLeft}번</p>
      <button type="button" className={cx(ui.button, ui.primary, s.btn)} disabled={pending || left <= 0} onClick={() => void renew()}>
        {pending ? "연장하는 중…" : `연장하기 (${p.price}P · ${raftHm(p.min)})`}
      </button>
      {error && (
        <p className={ui.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
