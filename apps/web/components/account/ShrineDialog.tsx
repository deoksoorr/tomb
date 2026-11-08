"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { meStore } from "@/lib/hooks/useMe";
import { SHRINE_KEEP_DAYS, type PublicGrave, type ShrineEntry } from "@/lib/types";
import StyleArt from "../grave/StyleArt";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { remainingLabel, type MyGraveEntry } from "./items";
import styles from "./BagDialog.module.css";

type Props = {
  cache: GraveCache;
  /** 다시 모신 묘비로 가기 (다른 채널이면 채널을 옮긴다) */
  onGo: (entry: MyGraveEntry) => void;
  onClose: () => void;
};

/** 성황당: 내가 이장한 묘비가 잠시 머무는 곳. 보관 기간 안에는 다시 모실(복구) 수 있다 */
export default function ShrineDialog({ cache, onGo, onClose }: Props) {
  const [entries, setEntries] = useState<ShrineEntry[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [restored, setRestored] = useState<PublicGrave | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 남은 보관일은 열 때 시각 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());

  useEffect(() => {
    let alive = true;
    api
      .shrine()
      .then((r) => alive && setEntries(r.entries))
      .catch((e: unknown) => {
        if (!alive) return;
        setEntries([]);
        setNotice(errorMessage(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  async function restore(grave: PublicGrave) {
    setPending(grave.id);
    setNotice(null);
    try {
      const res = await api.restoreFromShrine(grave.id);
      setEntries((list) => list?.filter((e) => e.grave.id !== grave.id) ?? null);
      meStore.addGrave(grave.id);
      const back = res.grave ?? null;
      if (back) {
        cache.upsert(back);
        bridge.emit("grave:changed", { graveId: back.id, kind: "updated" });
      }
      setRestored(back);
      setNotice(`${grave.name}을(를) 다시 모셨어요.`);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog title="성황당" onClose={onClose}>
      <div className={styles.bag}>
        <p className={ui.hint}>
          이장한 묘비는 {SHRINE_KEEP_DAYS}일 동안 이곳에 모셔져요. 그 안에 다시 모시면 원래 채널 맨 뒤 자리로 돌아가요.
        </p>
        {entries === null ? (
          <p className={styles.state} role="status">
            불러오는 중…
          </p>
        ) : entries.length === 0 ? (
          <p className={styles.empty}>모셔 둔 묘비가 없어요.</p>
        ) : (
          <ul className={styles.list}>
            {entries.map(({ grave, expiresAt }) => (
              <li key={grave.id} className={styles.row}>
                <StyleArt style={grave.style} ageDays={grave.ageDays} scale={1} />
                <span className={styles.main}>
                  <span className={styles.name}>{grave.name}</span>
                  <span className={styles.meta}>
                    {grave.channel}채널 · {remainingLabel(expiresAt, openedAt)}
                  </span>
                </span>
                <button
                  type="button"
                  className={ui.button}
                  onClick={() => restore(grave)}
                  disabled={pending !== null}
                >
                  {pending === grave.id ? "모시는 중…" : "다시 모시기"}
                </button>
              </li>
            ))}
          </ul>
        )}
        {restored && (
          <button
            type="button"
            className={`${ui.button} ${ui.primary}`}
            onClick={() => onGo({ grave: restored, plot: null, here: cache.getChannel() === restored.channel })}
          >
            다시 모신 묘비로 가기
          </button>
        )}
        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}
