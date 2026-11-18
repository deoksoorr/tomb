"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { useMe } from "@/lib/hooks/useMe";
import { ghostApi } from "@/lib/sea/ghostClient";
import type { GhostCall } from "@/lib/sea/ghostShip";
import GhostShop from "./GhostShop";
import s from "./GhostLayer.module.css";

// 11/17 유령선 UI의 뿌리 (GameShell이 게임이 뜨면 붙여요).
//  - 갑판의 유령 상인 앞에서 E → 게임이 sea:ghost:open → 장터 창
//  - 운영자 계정이 바닷가에 있으면 운영자에게만 보이는 「유령선 부르기·보내기·시간표대로」 (서버가 운영자인지 다시 확인해요)
//    11/18 왼쪽 위 확성기·공지 칸을 가려서 오른쪽 가운데의 작은 [운영자 유령선] 칩으로 접어 두고, 누르면 펼친다

export default function GhostLayer({ avatar }: { avatar?: { color: string; body?: string } }) {
  const [open, setOpen] = useState(false);
  useBridgeEvent("sea:ghost:open", () => setOpen(true));
  return (
    <>
      <GhostStaffHud />
      {open && <GhostShop onClose={() => setOpen(false)} avatar={avatar} />}
    </>
  );
}

function GhostStaffHud() {
  const { me } = useMe();
  const map = useBridgeValue("map:changed")?.map;
  const call = useBridgeValue("sea:ghost:call")?.call ?? null;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const shown = !!me?.staff && map === "sea";

  // 바닷가에 들어오면 지금 부른 상태를 받아 게임에 알려요 (운영자만)
  useEffect(() => {
    if (!shown) return;
    let live = true;
    ghostApi
      .status()
      .then((r) => live && bridge.emit("sea:ghost:call", { call: r.call ?? null }))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [shown]);

  if (!shown) return null;
  const set = async (next: GhostCall) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await ghostApi.call(next);
      bridge.emit("sea:ghost:call", { call: r.call ?? null });
      setMsg(next === "on" ? "유령선을 불렀어요" : next === "off" ? "유령선을 보냈어요" : "시간표대로 다녀요");
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={s.hud} role="group" aria-label="운영자 유령선 시험">
      <button type="button" className={s.title} aria-expanded={open} onClick={() => setOpen(!open)}>
        운영자 유령선 {open ? "▸" : "◂"}
      </button>
      {open && (
        <div className={s.row}>
          <button type="button" className={s.btn} aria-pressed={call === "on"} disabled={busy} onClick={() => void set("on")}>
            부르기
          </button>
          <button type="button" className={s.btn} aria-pressed={call === "off"} disabled={busy} onClick={() => void set("off")}>
            보내기
          </button>
          <button type="button" className={s.btn} aria-pressed={call === null} disabled={busy} onClick={() => void set(null)}>
            시간표대로
          </button>
        </div>
      )}
      {open && msg && (
        <span className={s.msg} role="status">
          {msg}
        </span>
      )}
    </div>
  );
}
