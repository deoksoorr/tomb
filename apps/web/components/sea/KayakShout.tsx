"use client";

import { useEffect, useRef, useState } from "react";
import { SEA_KAYAK_DOCK, SEA_KAYAK_SHOUT_COST, SEA_KAYAKS, seaKayakDismount, seaKayakShoutText } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./KayakShout.module.css";

// 11/16 r18 카약 「같이 타요」: 카약 앞자리에서 뒷자리가 빈 채 선착장 가까이 있으면 「같이 탈 사람 부르기 (20P)」.
// 채널에 온 외침은 어디서든(마을·캠핑장·바닷가) 띄우고 [같이 타기] — 마을이면 버스로 바닷가 카약 선착장 옆으로, 바닷가면 걸어서.
// 뒷자리가 차거나 외친 사람이 내리면 「자리 찼어요」로 바꿨다가 사라지고, 2분이 지나면 저절로 사라져요.

type Shout = { id: string; name: string; kayak: string; until: number; ended?: "full" | "gone"; mine: boolean };

export default function KayakShout({ channel }: { channel: number }) {
  const [shoutable, setShoutable] = useState<string | null>(() => bridge.last("kayak:shoutable")?.kayak ?? null);
  const [shouts, setShouts] = useState<Shout[]>([]);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const mine = useRef(new Set<string>());

  useEffect(() => {
    const offs = [
      bridge.on("kayak:shoutable", (v) => setShoutable(v?.kayak ?? null)),
      bridge.on("kayak:shout", (m) => setShouts((list) => [...list.filter((s) => s.id !== m.id && s.until > Date.now()), { id: m.id, name: m.name, kayak: m.kayak, until: m.until, mine: mine.current.has(m.id) }].slice(-3))),
      bridge.on("kayak:shoutEnd", ({ id, why }) => {
        setShouts((list) => list.map((s) => (s.id === id ? { ...s, ended: why, until: Math.min(s.until, Date.now() + 6000) } : s)));
      }),
      bridge.on("kayak:shoutDenied", ({ id, refund }) => {
        if (!mine.current.has(id)) return;
        void request<{ me: Me }>("/api/sea/kayak-shout/refund", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refund }) }).then(
          (r) => {
            meStore.set(r.me);
            setNote("외침이 닿지 않았어요. 20P를 돌려받았어요.");
          },
          () => setNote("외침이 닿지 않았어요."),
        );
      }),
    ];
    const t = window.setInterval(() => {
      const t0 = Date.now();
      setNow(t0);
      setShouts((list) => list.filter((s) => s.until > t0));
    }, 1000);
    return () => {
      for (const off of offs) off();
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(t);
  }, [note]);

  async function call() {
    if (!shoutable || busy) return;
    setBusy(true);
    try {
      const r = await request<{ grant: string; id: string; me: Me }>("/api/sea/kayak-shout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kayak: shoutable, channel }),
      });
      mine.current.add(r.id);
      meStore.set(r.me);
      bridge.emit("kayak:send", { grant: r.grant });
      setNote("같이 탈 사람을 불렀어요.");
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function join(kayak: string) {
    const map = bridge.last("map:changed")?.map ?? "village";
    if (map === "sea") bridge.emit("kayak:join", { kayak });
    else {
      // 마을·캠핑장: 버스를 타고 바닷가 카약 선착장 옆으로 (친구 따라가기와 같은 길)
      const n = Math.max(0, Number(kayak.slice(2)) - 1);
      const at = seaKayakDismount(SEA_KAYAKS[n] ?? { x: SEA_KAYAK_DOCK.x + 20, y: SEA_KAYAK_DOCK.y });
      bridge.emit("friend:goto", { sid: 0, name: "카약 선착장", x: at.x, y: at.y, map: "sea" });
    }
  }

  const live = shouts.filter((s) => s.until > now);
  if (!shoutable && !live.length && !note) return null;
  return (
    <div className={styles.wrap}>
      {shoutable && (
        <button type="button" className={cx(ui.button, ui.primary, styles.call)} onClick={() => void call()} disabled={busy}>
          같이 탈 사람 부르기 ({SEA_KAYAK_SHOUT_COST}P)
        </button>
      )}
      {live.map((s) => (
        <div key={s.id} className={styles.row}>
          <span className={styles.text}>{s.ended ? (s.ended === "full" ? "자리 찼어요" : "카약 외침이 끝났어요") : seaKayakShoutText(s.name)}</span>
          {!s.ended && !s.mine && (
            <button type="button" className={cx(ui.button, styles.join)} onClick={() => join(s.kayak)}>
              같이 타기
            </button>
          )}
        </div>
      ))}
      {note && <div className={styles.note}>{note}</div>}
    </div>
  );
}
