"use client";

import { useEffect, useId, useState } from "react";
import { isChampItem, type ItemKind } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { useMe } from "@/lib/hooks/useMe";
import { lookScore } from "@/lib/lookScore";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import Dialog from "../ui/Dialog";
import ForageBag from "../forage/ForageBag";
import BagDyeSection, { dyeTicketCount } from "../dye/BagDyeSection";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import { openMegaphone } from "@/lib/hooks/useMegaphone";
import { decorateGrave, fireFirework } from "./actions";
import ChampRewardsTab from "./ChampRewardsTab";
import { bagEntries, KIND_LABELS, type MyGraveEntry } from "./items";
import { LookPane, PickPane } from "./WardrobePanes";
import { resolveAvatar, wardrobeEntries, type SlotFilter } from "./wardrobe";
import styles from "./BagDialog.module.css";

const OTHER_KINDS: ItemKind[] = ["firework", "megaphone", "decor", "graveStyle"];
/** look = [지금 모습](장비창), wear = [꾸미기](부위별 카드 목록 — components/account/WardrobePanes) */
type BagTab = "look" | "wear" | "other" | "dye" | "forage" | "race";

type Props = {
  cache: GraveCache;
  /** 묘비 꾸미기를 놓을 내 묘비들 */
  myGraves: MyGraveEntry[];
  onClose: () => void;
  /** 게임 속 내 아바타 (입장할 때 정한 색·몸) */
  avatar?: { color: string; body?: string };
  /** [레이스 보상] 칸이 비었을 때 [레이스 보기] (이번 주 레이스 창) */
  onOpenRace?: () => void;
};

/** 가방: [지금 모습] 장비창(입은 것), [꾸미기] 부위별 목록·입어 보기, [소모품: 폭죽·확성기·묘비 꾸미기] 쓰기·묘비에 놓기 */
export default function BagDialog({ cache, myGraves, onClose, avatar, onOpenRace }: Props) {
  const { me, error } = useMe();
  const [tab, setTab] = useState<BagTab>("look");
  /** [꾸미기] 부위 칩 ([지금 모습]의 부위 칸을 누르면 그 부위로) */
  const [slotFilter, setSlotFilter] = useState<SlotFilter>("all");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /** 묘비에 놓으려고 고른 꾸미기 */
  const [placing, setPlacing] = useState<string | null>(null);
  const baseId = useId();
  const [savedColor] = useState(() => readItem(LS.color));
  // 남은 시간 기준 시각 (렌더 중에 시계를 읽지 않는다): 30초마다 + 무엇을 한 직후
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

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
      setNow(Date.now());
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

  // 염색권은 따로 "염색권" 칸에 (11/12)
  const others = bagEntries(me.inventory).filter((e) => e.item.kind !== "cosmetic" && e.item.kind !== "dye");
  const wardrobe = wardrobeEntries(me, now);

  return (
    <Dialog title="가방" onClose={onClose}>
      <div className={styles.bag}>
        <div className={styles.tabs} role="tablist" aria-label="가방 칸">
          {(
            [
              // 주간 랭킹 1위 전용 모자는 [레이스 보상] 칸에 따로 (일반 꾸미기 수에서 뺀다)
              ["look", "지금 모습"],
              ["wear", `꾸미기 ${wardrobe.filter((e) => !isChampItem(e.item.id)).length}`],
              ["other", `소모품 ${others.reduce((n, e) => n + e.count, 0)}`],
              ["dye", `염색권 ${dyeTicketCount(me.inventory)}`],
              ["forage", "물고기·채집물"],
              ["race", "레이스 보상"],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              id={`${baseId}-${k}`}
              aria-selected={tab === k}
              aria-controls={`${baseId}-panel`}
              className={styles.tab}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.panel}>
          {tab === "look" ? (
            <LookPane
              entries={wardrobe}
              now={now}
              avatar={resolveAvatar(avatar, me, savedColor)}
              score={lookScore(me, now)}
              name={me.name ?? ""}
              onPickSlot={(slot) => {
                setSlotFilter(slot);
                setTab("wear");
              }}
            />
          ) : tab === "wear" ? (
            <PickPane entries={wardrobe} now={now} pending={pending} act={act} avatar={resolveAvatar(avatar, me, savedColor)} name={me.name ?? ""} filter={slotFilter} onFilter={setSlotFilter} />
          ) : tab === "dye" ? (
            <BagDyeSection me={me} avatar={resolveAvatar(avatar, me, savedColor)} onNotice={setNotice} />
          ) : tab === "forage" ? (
            <ForageBag />
          ) : tab === "race" ? (
            <ChampRewardsTab me={me} now={now} pending={pending} act={act} onOpenRace={onOpenRace} />
          ) : (
            <div className={styles.others}>
              {others.length === 0 && <p className={styles.empty}>폭죽·확성기·묘비 꾸미기 같은 소모품이 없어요. 상점에서 포인트로 살 수 있어요.</p>}
              {OTHER_KINDS.map((kind) => {
                const items = others.filter((e) => e.item.kind === kind);
                if (items.length === 0) return null;
                return (
                  <section key={kind} className={styles.section}>
                    <h3 className={styles.heading}>{KIND_LABELS[kind]}</h3>
                    <ul className={styles.list}>
                      {items.map(({ item, count }) => (
                        <li key={item.id} className={styles.row}>
                          <ItemIcon itemId={item.id} size={32} />
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
                          {kind === "megaphone" && (
                            <button
                              type="button"
                              className={ui.button}
                              onClick={() => {
                                onClose();
                                openMegaphone();
                              }}
                            >
                              외치기
                            </button>
                          )}
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
            </div>
          )}
        </div>

        <p className={styles.notice} role="status">
          {notice}
        </p>
      </div>
    </Dialog>
  );
}
