"use client";

import { useEffect, useState, type ReactNode } from "react";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { meStore } from "@/lib/hooks/useMe";
import { DEFAULT_PASS_DAYS, SHRINE_KEEP_DAYS, type PublicGrave, type ShrineEntry } from "@/lib/types";
import { GRAVEYARD_CAPACITY } from "@tomb/protocol";
import StyleArt from "../grave/StyleArt";
import Dialog from "../ui/Dialog";
import { EmptyHero } from "../ui/InfoBlocks";
import ui from "../ui/ui.module.css";
import { remainingLabel, type MyGraveEntry } from "./items";
import styles from "./BagDialog.module.css";

type Props = {
  cache: GraveCache;
  /** 다시 모신 묘비로 가기 (다른 채널이면 채널을 옮긴다) */
  onGo: (entry: MyGraveEntry) => void;
  onClose: () => void;
  /** 성불한 이야기들 열기 (없으면 버튼을 숨긴다) */
  onOpenPassed?: () => void;
  /** 아래에 덧붙일 내용 (게임 안: 지금 채널 묘역 현황) */
  footer?: ReactNode;
};

/** 성황당: 내가 이장한 묘비가 잠시 머무는 곳. 보관 기간 안에는 다시 모실(복구) 수 있다 */
export default function ShrineDialog({ cache, onGo, onClose, onOpenPassed, footer }: Props) {
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
          성황당은 묘역을 떠난 묘비들이 머무는 곳이에요. 이장한 내 묘비는 {SHRINE_KEEP_DAYS}일 동안 이곳에 모셔지고, 그 안에 다시
          모시면 원래 채널 맨 뒤 자리로 돌아가요(지나면 지워져요).
        </p>
        <p className={ui.hint}>
          세운 지 {DEFAULT_PASS_DAYS}일이 지난 묘비는 성불해 묘역을 떠나요. 묘역(채널마다 {GRAVEYARD_CAPACITY}자리)이 꽉 차면 가장
          오래된 묘비부터 조금 일찍 성불해요. 성불한 묘비는 &quot;성불한 이야기들&quot;에 남아요.
        </p>
        {onOpenPassed && (
          <button type="button" className={ui.button} onClick={onOpenPassed}>
            성불한 이야기들 보기
          </button>
        )}
        {entries === null ? (
          <p className={styles.state} role="status">
            불러오는 중…
          </p>
        ) : entries.length === 0 ? (
          <EmptyHero icon="candle" title="모셔 둔 묘비가 없어요">
            묘비 상세 창에서 내 묘비를 [이장]하면 이곳에 {SHRINE_KEEP_DAYS}일 동안 모셔져요. 자리를 옮기고 싶거나 잠시 쉬게 하고 싶을 때
            써 보세요.
          </EmptyHero>
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
        {footer}
      </div>
    </Dialog>
  );
}
