"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { isChampItem, type CosmeticSlot, type ItemKind } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import type { GraveCache } from "@/lib/hooks/useGraves";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { useMe } from "@/lib/hooks/useMe";
import { lookScore } from "@/lib/lookScore";
import { readItem } from "@/lib/storage";
import { LS } from "@/lib/types";
import { fittingLook } from "../shop/fitting";
import { OutfitCanvas, useOutfitView, ViewControls } from "../shop/OutfitPreview";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ForageBag from "../forage/ForageBag";
import BagDyeSection, { dyeTicketCount } from "../dye/BagDyeSection";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import StyledName from "../ui/StyledName";
import { DollNote, DollSlot, PaperDoll } from "../ui/PaperDoll";
import ui from "../ui/ui.module.css";
import { openMegaphone } from "@/lib/hooks/useMegaphone";
import { decorateGrave, fireFirework, takeOff, wearCosmetic, wearStashed } from "./actions";
import ChampRewardsTab from "./ChampRewardsTab";
import { bagEntries, KIND_LABELS, remainingLabel, type MyGraveEntry } from "./items";
import {
  canDropOn,
  displaced,
  entryStatus,
  matchesSlot,
  resolveAvatar,
  SLOT_NAMES,
  SLOT_ORDER,
  SLOT_SILHOUETTE,
  slotCounts,
  timeLeftRatio,
  wardrobeEntries,
  wearAction,
  wornBySlot,
  type SlotFilter,
  type WardrobeEntry,
} from "./wardrobe";
import styles from "./BagDialog.module.css";

const OTHER_KINDS: ItemKind[] = ["firework", "megaphone", "decor", "graveStyle"];
type BagTab = "wear" | "other" | "dye" | "forage" | "race";

/** 몸 위치에 맞춘 칸 배치: 등은 어깨 뒤, 목·손은 오른쪽, 오라는 몸 옆, 발은 아래, 펫은 발 옆.
 * 맨 아래 줄은 닉네임 꾸미기: 이름 글자 · (지금 이름표 미리보기) · 이름표 바탕판 */
const DOLL_AREAS = `"back head neck" "aura fig hand" "pet feet info" "nameColor namePv namePlate"`;

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

/** 가방: [꾸미기] 장비창(입은 것) + 부위별 목록, [소모품: 폭죽·확성기·묘비 꾸미기] 쓰기·묘비에 놓기 */
export default function BagDialog({ cache, myGraves, onClose, avatar, onOpenRace }: Props) {
  const { me, error } = useMe();
  const [tab, setTab] = useState<BagTab>("wear");
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
              ["wear", `캐릭터 꾸미기 ${wardrobe.filter((e) => !isChampItem(e.item.id)).length}`],
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
          {tab === "wear" ? (
            <Wardrobe entries={wardrobe} now={now} pending={pending} act={act} avatar={resolveAvatar(avatar, me, savedColor)} score={lookScore(me, now)} name={me.name ?? ""} />
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

// ── 캐릭터 꾸미기: 장비창 + 부위별 목록 ──

function Wardrobe({
  entries,
  now,
  pending,
  act,
  avatar,
  score,
  name,
}: {
  entries: WardrobeEntry[];
  now: number;
  pending: boolean;
  act: (task: () => Promise<void>, done: string) => Promise<void>;
  avatar: { color: string; body: string };
  /** 내 꾸미기 점수 (지금 입은 코디 · lib/lookScore.ts) */
  score: number;
  /** 내 이름 (닉네임 꾸미기 미리보기) */
  name: string;
}) {
  const [filter, setFilter] = useState<SlotFilter>("all");
  /** 목록에서 마우스를 올리거나 초점이 간 것: 장비창에 미리 입혀 보고, 들어갈 칸을 밝힌다 */
  const [peek, setPeek] = useState<WardrobeEntry | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const view = useOutfitView(false);
  const listRef = useRef<HTMLElement>(null);
  const hintId = useId();
  const reduced = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canDrag = useMediaQuery("(hover: hover) and (pointer: fine)");

  const worn = wornBySlot(entries);
  const wornIds = SLOT_ORDER.flatMap((s) => (worn[s] ? [worn[s]!.item.id] : []));
  const fit = fittingLook(wornIds, peek && peek.state !== "worn" ? peek.item.id : null);
  // 주간 랭킹 1위 전용 모자는 [레이스 보상] 칸에서 다룬다 (장비창에는 입은 그대로 보이고, 목록·부위 수에서는 뺀다)
  const listed = entries.filter((e) => !isChampItem(e.item.id));
  const counts = slotCounts(listed);
  const shown = listed.filter((e) => matchesSlot(e.slot, filter));
  const peekSlot = dragging ? (entries.find((e) => e.item.id === dragging)?.slot ?? null) : (peek?.slot ?? null);

  function run(e: WardrobeEntry) {
    const a = wearAction(e);
    const name = e.item.name;
    if (a.kind === "unequip") {
      void act(() => takeOff(e.slot), `${name}을(를) 벗어 두었어요. 남은 시간은 계속 흘러요.`);
      return;
    }
    const old = displaced(entries, e);
    const swap = old ? ` ${old.name}은(는) 벗어 두었어요.` : "";
    if (a.kind === "spend") void act(() => wearCosmetic(e.item.id), `${name}을(를) 입었어요. 지금부터 24시간 유지돼요.${swap}`);
    else void act(() => wearStashed(e.item.id), `${name}을(를) 다시 입었어요.${swap}`);
    setPeek(null);
  }

  /** 칸을 누르면 그 부위만 목록에 (벗기·입을 것), 좁은 화면이면 목록이 보이게 내린다 */
  function pickSlot(slot: CosmeticSlot) {
    setFilter((f) => (f === slot ? "all" : slot));
    listRef.current?.scrollIntoView({ block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }

  function onDragStart(e: DragEvent, entry: WardrobeEntry) {
    e.dataTransfer.setData("text/plain", entry.item.id);
    e.dataTransfer.effectAllowed = "move";
    setDragging(entry.item.id);
  }

  const wornCount = Object.keys(worn).length;

  return (
    <div className={styles.wardrobe}>
      <section className={styles.dollPane} aria-label="착용 부위">
        <PaperDoll
          className={styles.doll}
          areas={DOLL_AREAS}
          label="착용 부위"
          figure={
            <OutfitCanvas
              color={avatar.color}
              body={avatar.body}
              look={fit.look}
              label={peek && !fit.wearing ? `${peek.item.name}을(를) 입어 본 내 모습` : "지금 내 모습"}
              dir={view.dir}
              walking={view.walking}
              onRotate={view.rotate}
              describedBy={hintId}
            />
          }
          caption={
            <p className={styles.figNote} aria-live="polite">
              {peek && peek.state !== "worn" ? `미리 보기: ${peek.item.name}` : "\u00a0"}
            </p>
          }
        >
          {SLOT_ORDER.map((slot) => {
            const e = worn[slot];
            const label = SLOT_NAMES[slot];
            return (
              <DollSlot
                key={slot}
                area={slot}
                label={label}
                name={e?.item.name ?? null}
                icon={e ? <ItemIcon itemId={e.item.id} size={32} /> : null}
                silhouette={<ItemIcon itemId={SLOT_SILHOUETTE[slot]} size={32} />}
                meter={e?.until ? { ratio: timeLeftRatio(e.until, now), text: remainingLabel(e.until, now) } : null}
                tip={e ? { title: e.item.name, body: e.item.desc } : { title: `${label} · 비어 있어요`, body: "눌러서 이 부위에 입을 것을 골라요." }}
                selected={filter === slot}
                highlight={peekSlot === slot}
                ariaLabel={`${label} 칸, ${e ? `${e.item.name} 착용 중, ${remainingLabel(e.until!, now)}` : "비어 있음"}. 누르면 ${label} 꾸미기 목록`}
                onClick={() => pickSlot(slot)}
                drop={{
                  accepts: !!dragging && canDropOn(dragging, slot) && !pending,
                  onDrop: (id) => {
                    setDragging(null);
                    const entry = entries.find((x) => x.item.id === id && x.state !== "worn");
                    if (entry) run(entry);
                  },
                }}
              />
            );
          })}
          <DollNote area="info">
            착용 {wornCount}/{SLOT_ORDER.length}
          </DollNote>
          {/* 닉네임 꾸미기 미리보기: 지금(또는 목록에서 고른 것을 입어 본) 이름 글자·이름표 */}
          <DollNote area="namePv">
            <span className={styles.namePv}>
              <StyledName name={name || "내 이름"} look={fit.look} />
            </span>
          </DollNote>
        </PaperDoll>
        <ViewControls dir={view.dir} walking={view.walking} onDir={view.setDir} onWalking={view.setWalking} className={styles.viewControls} />
        <p className={styles.hint}>
          내 꾸미기 점수 <b>{score}점</b> · 랭킹 [꾸미기]에 올라가요
        </p>
        <p id={hintId} className={styles.hint}>
          칸을 누르면 그 부위 목록이 나와요{canDrag ? " · 목록에서 칸으로 끌어다 놓아도 입어요" : ""}. 벗어 둔 꾸미기도 남은 시간은 계속 흘러요.
        </p>
      </section>

      <section ref={listRef} className={styles.listPane} aria-label="가진 꾸미기">
        <div className={styles.filter} role="group" aria-label="착용 부위로 거르기">
          {(["all", ...SLOT_ORDER] as SlotFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              className={styles.chip}
              aria-pressed={filter === f}
              data-empty={counts[f] === 0 || undefined}
              onClick={() => setFilter(f)}
            >
              {f === "all" ? "전체" : SLOT_NAMES[f]} <span className={styles.chipCount}>{counts[f]}</span>
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className={styles.empty}>
            {filter === "all" ? "가진 꾸미기가 없어요." : `${SLOT_NAMES[filter]}에 입을 꾸미기가 없어요.`} 상점 캐릭터 꾸미기에서 살 수 있어요.
          </p>
        ) : (
          SLOT_ORDER.filter((slot) => shown.some((e) => e.slot === slot)).map((slot) => (
            <div key={slot} className={styles.group}>
              <h3 className={styles.heading}>
                {SLOT_NAMES[slot]}
                {!worn[slot] && <span className={styles.meta}> · 비어 있어요</span>}
              </h3>
              <ul className={styles.list}>
                {shown
                  .filter((e) => e.slot === slot)
                  .map((e) => {
                    const a = wearAction(e);
                    const old = displaced(entries, e);
                    return (
                      <li
                        key={`${e.item.id}-${e.state}`}
                        className={cx(styles.row, styles.wearRow)}
                        data-state={e.state}
                        draggable={canDrag && a.kind !== "unequip" && !pending}
                        onDragStart={(ev) => onDragStart(ev, e)}
                        onDragEnd={() => setDragging(null)}
                        onPointerEnter={(ev) => ev.pointerType === "mouse" && setPeek(e)}
                        onPointerLeave={(ev) => ev.pointerType === "mouse" && setPeek(null)}
                        onFocus={() => setPeek(e)}
                        onBlur={() => setPeek(null)}
                      >
                        <ItemIcon itemId={e.item.id} size={32} />
                        <span className={styles.main}>
                          <span className={styles.name}>
                            {e.item.name} <LookScoreBadge itemId={e.item.id} short />
                          </span>
                          <span className={styles.status} data-state={e.state}>
                            {entryStatus(e, now)}
                          </span>
                          <span className={styles.meta}>
                            {e.item.desc}
                            {old && ` · 입으면 ${old.name}은(는) 벗어 둬요`}
                          </span>
                        </span>
                        <button
                          type="button"
                          className={cx(ui.button, a.kind !== "unequip" && ui.primary, styles.wearBtn)}
                          disabled={pending}
                          aria-label={`${e.item.name} ${a.label}`}
                          onClick={() => run(e)}
                        >
                          {a.label}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
