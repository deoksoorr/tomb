"use client";

import { useEffect, useState } from "react";
import { itemName } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { giftsStore, useGifts } from "@/lib/hooks/useGifts";
import { meStore } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { socialApi } from "@/lib/socialApi";
import type { GiftEntry } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./GiftsDialog.module.css";

const DAY = 86_400_000;
const dateText = (t: number) => {
  const d = new Date(t + 9 * 3_600_000); // KST
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

/** 11번 선물함: 운영자가 보낸 쪽지·포인트·아이템. 받기(한 번만)·지우기. 받지 않은 선물은 30일 보관 */
export default function GiftsDialog({ onClose }: { onClose: () => void }) {
  const { gifts } = useGifts();
  const [pending, setPending] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 남은 기간 기준 시각 (렌더 중에 시계를 읽지 않는다)
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    void giftsStore.refresh().then(() => setNow(Date.now()));
  }, []);

  async function claim(g: GiftEntry) {
    setPending(g.id);
    setNotice(null);
    try {
      const res = await socialApi.claimGift(g.id);
      meStore.set(res.me);
      giftsStore.replace(g.id, res.gift);
      const parts = [
        ...(g.points ? [`${res.points.toLocaleString("ko-KR")}P${res.points < g.points ? " (지갑이 가득 차 일부만)" : ""}`] : []),
        ...g.items.map((i) => `${itemName(i.itemId)} ×${i.count}`),
      ];
      const msg = `선물을 받았어요: ${parts.join(", ")}`;
      setNotice(msg);
      showToast(msg, 5_000);
    } catch (e) {
      setNotice(errorMessage(e));
      void giftsStore.refresh();
    } finally {
      setPending(null);
    }
  }

  async function drop(g: GiftEntry) {
    if (g.claimedAt === null && confirmDrop !== g.id) {
      setConfirmDrop(g.id);
      return;
    }
    setPending(g.id);
    setConfirmDrop(null);
    try {
      await socialApi.deleteGift(g.id);
      giftsStore.replace(g.id, null);
      setNotice("선물을 지웠어요.");
    } catch (e) {
      setNotice(errorMessage(e));
      void giftsStore.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog title="선물함" onClose={onClose}>
      <div className={styles.wrap}>
        <p className={ui.hint}>마을 관리인이 보낸 선물이 여기로 와요. 받지 않은 선물은 보낸 날부터 30일 동안 보관돼요.</p>
        {gifts === null && <p className={ui.hint}>불러오는 중…</p>}
        {gifts?.length === 0 && <p className={styles.empty}>선물함이 비어 있어요.</p>}
        <ul className={styles.list}>
          {gifts?.map((g) => {
            const left = Math.max(0, Math.ceil((g.expiresAt - now) / DAY));
            return (
              <li key={g.id} className={cx(styles.card, g.claimedAt !== null && styles.claimed)}>
                <div className={styles.head}>
                  <span className={styles.from}>
                    {g.claimedAt === null && <span className={styles.redDot} aria-label="안 받은 선물" />}
                    {g.from}
                  </span>
                  <span className={styles.date}>{dateText(g.createdAt)}</span>
                </div>
                <p className={styles.note}>{g.note}</p>
                <div className={styles.contents} aria-label="선물 내용">
                  {g.points > 0 && <span className={styles.chip}>{g.points.toLocaleString("ko-KR")}P</span>}
                  {g.items.map((i) => (
                    <span key={i.itemId} className={styles.chip}>
                      <ItemIcon itemId={i.itemId} size={20} />
                      {itemName(i.itemId)} ×{i.count}
                    </span>
                  ))}
                </div>
                <div className={styles.actions}>
                  <span className={styles.meta}>{g.claimedAt !== null ? `${dateText(g.claimedAt)}에 받았어요` : `${left}일 남음`}</span>
                  {g.claimedAt === null && (
                    <button type="button" className={cx(ui.button, ui.primary)} disabled={pending !== null} onClick={() => void claim(g)}>
                      받기
                    </button>
                  )}
                  <button
                    type="button"
                    className={cx(ui.button, confirmDrop === g.id ? ui.danger : ui.quiet)}
                    disabled={pending !== null}
                    onClick={() => void drop(g)}
                  >
                    {confirmDrop === g.id ? "안 받고 지울까요?" : "지우기"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}
