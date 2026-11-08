"use client";

import { useState } from "react";
import { itemById, type ItemKind } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { useMe } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { decorateGrave, fireFirework, wearCosmetic } from "./actions";
import { bagEntries, KIND_LABELS, remainingLabel, type MyGraveEntry } from "./items";
import styles from "./BagDialog.module.css";

const SECTIONS: ItemKind[] = ["firework", "cosmetic", "decor", "graveStyle"];

type Props = {
  cache: GraveCache;
  /** 묘비 꾸미기를 놓을 내 묘비들 */
  myGraves: MyGraveEntry[];
  onClose: () => void;
};

/** 가방: 종류별로 묶고 쓰기·착용·묘비에 놓기. 디자인권은 묘비를 세울 때 고른다 */
export default function BagDialog({ cache, myGraves, onClose }: Props) {
  const { me, error } = useMe();
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 묘비에 놓으려고 고른 꾸미기 */
  const [placing, setPlacing] = useState<string | null>(null);
  // 남은 시간은 열 때 시각 기준 (렌더 중에 시계를 읽지 않는다)
  const [openedAt] = useState(() => Date.now());

  async function act(task: () => Promise<void>, done: string) {
    setPending(true);
    setNotice(null);
    try {
      await task();
      setNotice(done);
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (!me) {
    return (
      <Dialog title="가방" onClose={onClose}>
        <p className={styles.state} role="status">
          {error ?? "불러오는 중…"}
        </p>
      </Dialog>
    );
  }

  const bag = bagEntries(me.inventory);
  const equipped = me.equipped.filter((e) => e.until > openedAt);

  return (
    <Dialog title="가방" onClose={onClose}>
      <div className={styles.bag}>
        {bag.length === 0 && <p className={styles.empty}>가방이 비었어요. 상점에서 포인트로 살 수 있어요.</p>}
        {SECTIONS.map((kind) => {
          const items = bag.filter((e) => e.item.kind === kind);
          const worn = kind === "cosmetic" ? equipped : [];
          if (items.length === 0 && worn.length === 0) return null;
          return (
            <section key={kind} className={styles.section}>
              <h3 className={styles.heading}>{KIND_LABELS[kind]}</h3>
              <ul className={styles.list}>
                {items.map(({ item, count }) => (
                  <li key={item.id} className={styles.row}>
                    <ItemIcon itemId={item.id} scale={4} />
                    <span className={styles.main}>
                      <span className={styles.name}>
                        {item.name} <span className={styles.count}>×{count}</span>
                      </span>
                      <span className={styles.meta}>{item.desc}</span>
                    </span>
                    {kind === "firework" && (
                      <button
                        type="button"
                        className={ui.button}
                        disabled={pending}
                        onClick={() =>
                          act(async () => {
                            await fireFirework(item.id);
                            onClose();
                          }, "펑!")
                        }
                      >
                        쏘기
                      </button>
                    )}
                    {kind === "cosmetic" && (
                      <button
                        type="button"
                        className={ui.button}
                        disabled={pending}
                        onClick={() => act(() => wearCosmetic(item.id), `${item.name}을(를) 착용했어요.`)}
                      >
                        착용
                      </button>
                    )}
                    {kind === "decor" && (
                      <button
                        type="button"
                        className={ui.button}
                        disabled={pending}
                        aria-expanded={placing === item.id}
                        onClick={() => setPlacing(placing === item.id ? null : item.id)}
                      >
                        묘비에 놓기
                      </button>
                    )}
                    {kind === "graveStyle" && <span className={styles.meta}>묘비 세울 때 골라요</span>}
                  </li>
                ))}
                {worn.map((e) => (
                  <li key={e.itemId} className={cx(styles.row, styles.worn)}>
                    <ItemIcon itemId={e.itemId} scale={4} />
                    <span className={styles.main}>
                      <span className={styles.name}>{itemById(e.itemId)?.name ?? e.itemId} · 착용 중</span>
                      <span className={styles.meta}>{remainingLabel(e.until, openedAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              {kind === "decor" && placing && (
                <div className={styles.place}>
                  {myGraves.length === 0 ? (
                    <p>아직 세운 묘비가 없어요.</p>
                  ) : (
                    <>
                      <p className={ui.hint}>어느 묘비에 놓을까요? 놓는 순간 가방에서 사라져요.</p>
                      {myGraves.map(({ grave, plot, here }) => (
                        <button
                          key={grave.id}
                          type="button"
                          className={styles.placeChoice}
                          disabled={pending}
                          onClick={() =>
                            act(async () => {
                              await decorateGrave(placing, grave.id, cache);
                              setPlacing(null);
                            }, `${grave.name}에 놓았어요.`)
                          }
                        >
                          {grave.name}
                          <span className={styles.meta}>{here ? plot : `${grave.channel}채널`}</span>
                        </button>
                      ))}
                    </>
                  )}
                </div>
              )}
            </section>
          );
        })}
        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}
