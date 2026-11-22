"use client";

import { useEffect, useState } from "react";
import { itemName } from "@tomb/protocol";
import { GIFT_TERMS, type GiftItem } from "@/lib/types";
import { errorMessage } from "@/lib/api";
import { giftsStore, useGifts } from "@/lib/hooks/useGifts";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { socialApi } from "@/lib/socialApi";
import type { GiftEntry } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { EmptyHero, InfoCard, Shortcuts, TipList } from "../ui/InfoBlocks";
import TodayFacts from "../overlay/TodayFacts";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./GiftsDialog.module.css";

const DAY = 86_400_000;
/** 선물 아이템 한 줄: 기간 선물은 "밀짚모자 (7일)", 기본은 "밀짚모자 ×2" */
const giftItemText = (i: GiftItem) => `${itemName(i.itemId)} ${i.term ? `(${GIFT_TERMS[i.term].label})` : `×${i.count}`}`;
const dateText = (t: number) => {
  const d = new Date(t + 9 * 3_600_000); // KST
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
};

/** 11/22 한 번에 받기·지우기 대상: 안 받은 선물(모두 받기) · 받은 선물(받은 선물 지우기 — 안 받은 선물은 절대 지우지 않는다) */
export function splitGifts(gifts: readonly GiftEntry[] | null | undefined): { unclaimed: GiftEntry[]; claimed: GiftEntry[] } {
  const list = gifts ?? [];
  return { unclaimed: list.filter((g) => g.claimedAt === null), claimed: list.filter((g) => g.claimedAt !== null) };
}

/** 11번 선물함: 운영자가 보낸 쪽지·포인트·아이템. 받기(한 번만)·지우기. 받지 않은 선물은 30일 보관 */
export default function GiftsDialog({ onClose, onOpenCalendar }: { onClose: () => void; onOpenCalendar?: () => void }) {
  const { gifts } = useGifts();
  // 운영자 계정은 출석 도장을 받지 않는다 → 출석 달력 바로 가기를 뺀다
  const staff = !!useMe().me?.staff;
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
        ...g.items.map(giftItemText),
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

  // 11/22 운영자: 선물이 여러 개면 한 번에 받기 · 받은 선물 기록 한 번에 지우기 (서버는 하나씩 — 받기마다 지갑 상한·중복 검사가 그대로 돈다)
  const { unclaimed, claimed: claimedList } = splitGifts(gifts);

  async function claimAll() {
    setPending("all");
    setNotice(null);
    let points = 0;
    let items = 0;
    let failed: string | null = null;
    for (const g of unclaimed) {
      try {
        const res = await socialApi.claimGift(g.id);
        meStore.set(res.me);
        giftsStore.replace(g.id, res.gift);
        points += res.points;
        items += g.items.length;
      } catch (e) {
        failed = errorMessage(e);
      }
    }
    if (failed) void giftsStore.refresh();
    const got = [...(points ? [`${points.toLocaleString("ko-KR")}P`] : []), ...(items ? [`아이템 ${items}종류`] : [])];
    const msg = got.length ? `선물을 모두 받았어요: ${got.join(", ")}${failed ? ` (일부는 못 받았어요: ${failed})` : ""}` : (failed ?? "받을 선물이 없어요.");
    setNotice(msg);
    if (got.length) showToast(msg, 5_000);
    setPending(null);
  }

  async function dropClaimed() {
    setPending("all");
    setConfirmDrop(null);
    let failed = false;
    for (const g of claimedList) {
      try {
        await socialApi.deleteGift(g.id);
        giftsStore.replace(g.id, null);
      } catch {
        failed = true;
      }
    }
    if (failed) void giftsStore.refresh();
    setNotice(failed ? "일부 기록은 지우지 못했어요. 다시 해 주세요." : "받은 선물 기록을 지웠어요.");
    setPending(null);
  }

  return (
    <Dialog title="선물함" onClose={onClose}>
      <div className={styles.wrap}>
        <p className={ui.hint}>마을 관리인이 보낸 선물이 여기로 와요. 받지 않은 선물은 보낸 날부터 30일 동안 보관돼요.</p>
        {(unclaimed.length > 1 || claimedList.length > 0) && (
          <div className={styles.bulk}>
            {unclaimed.length > 1 && (
              <button type="button" className={cx(ui.button, ui.primary)} disabled={pending !== null} onClick={() => void claimAll()}>
                모두 받기 ({unclaimed.length})
              </button>
            )}
            {claimedList.length > 0 && (
              <button type="button" className={cx(ui.button, ui.quiet)} disabled={pending !== null} onClick={() => void dropClaimed()}>
                받은 선물 지우기 ({claimedList.length})
              </button>
            )}
          </div>
        )}
        {gifts === null && <p className={ui.hint}>불러오는 중…</p>}
        {gifts?.length === 0 && (
          <EmptyHero icon="gift" title="선물함이 비어 있어요">
            새 선물이 오면 위쪽 선물함 버튼과 메뉴에 빨간 점이 켜지고, 잠깐 알림도 떠요.
          </EmptyHero>
        )}
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
                    <span key={`${i.itemId}|${i.term ?? ""}`} className={styles.chip}>
                      <ItemIcon itemId={i.itemId} size={20} />
                      {giftItemText(i)}
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
        <InfoCard title="다른 보상도 챙겨요" icon="calendar">
          <TodayFacts show={["attend", "earned"]} />
          {onOpenCalendar && !staff && <Shortcuts items={[{ label: "출석 달력 열기", icon: "calendar", onClick: onOpenCalendar }]} />}
        </InfoCard>
        <InfoCard title="선물은 이럴 때 와요" icon="info">
          <TipList
            tips={[
              "점검이나 오류로 불편했던 날에는 마을 관리인이 사과 선물을 보내요.",
              "이벤트·명절·업데이트 기념 선물이 오기도 해요.",
              "받은 포인트는 바로 내 포인트에, 아이템은 가방에 들어가요.",
              "받은 선물 기록도 30일 동안 여기에 남아요. [받은 선물 지우기]로 한 번에 지울 수 있어요.",
            ]}
          />
        </InfoCard>
      </div>
    </Dialog>
  );
}
