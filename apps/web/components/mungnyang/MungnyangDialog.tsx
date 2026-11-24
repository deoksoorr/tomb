"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { isPermanentUntil } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { furnitureById } from "@/lib/housing/catalog";
import { rotateMode } from "@/lib/housing/layout";
import { useMediaQuery } from "@/lib/hooks/useMedia";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { mungnyangApi } from "@/lib/mungnyang/client";
import type { MungnyangFurnRow, MungnyangPetRow, MungnyangStatus } from "@/lib/mungnyang/service";
import type { Me } from "@/lib/types";
import { applyStyle, takeOff, wearStashed } from "../account/actions";
import { FurnitureStage, FurnitureThumb } from "../housing/parts";
import shop from "../shop/ShopDialog.module.css";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import LookScoreBadge from "../ui/LookScoreBadge";
import { watchMoreBelow } from "../ui/moreBelow";
import ui from "../ui/ui.module.css";
import { NoHouseBubble, rememberHouse, walkToHousing } from "../noHouse/NoHouseTalk";
import styles from "./MungnyangDialog.module.css";
import {
  boughtText,
  footHint,
  haveText,
  MUNGNYANG_SHOP_TITLE,
  MUNGNYANG_TABS,
  mungnyangHello,
  petStateText,
  viewName,
  type MungnyangTab,
} from "./mungnyangText";
import PetTurnArt, { hasPetAct, petTurnWays, petViewAt } from "./PetTurnArt";

// 11/19 「분양사 보리」 창 (동물원 정문 왼쪽 분양사 앞에서 E). 서버 /api/mungnyang (lib/mungnyang).
//  - 탭 「펫」: 품종 펫 12 + 사육사와 같이 파는 셋. 걷는 모습 미리보기(돌려 보기 — 옆·앞·뒤, 재롱 보기 = 품종 동작 한 번), 영구 분양(사면 바로 데리고 다님)
//  - 탭 「집 가구」: 품종 집 가구 12 + 가구점과 같이 파는 셋. 가구점·가구 보따리상과 같은 큰 미리보기(돌려 보기·낮밤), 집이 없으면 못 산다
//    (11/20 집이 없으면 탭을 누를 때마다 보리가 고개를 저으며 거절 말풍선 — components/noHouse. 목록은 구경만)

type Owned = { forever: boolean; where: "worn" | "home" } | null;
function ownedOf(me: Me | null, id: string, now: number): Owned {
  if (!me) return null;
  const worn = me.equipped.find((e) => e.itemId === id && e.until > now);
  if (worn) return { forever: isPermanentUntil(worn.until), where: "worn" };
  const home = me.stash?.find((e) => e.itemId === id && e.until > now);
  return home ? { forever: isPermanentUntil(home.until), where: "home" } : null;
}

const won = (n: number) => `${n.toLocaleString("ko-KR")}P`;

export default function MungnyangDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const baseId = useId();
  const coarse = useMediaQuery("(pointer: coarse)");
  const [status, setStatus] = useState<MungnyangStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<MungnyangTab>("pet");
  const [picked, setPicked] = useState<Record<MungnyangTab, string | null>>({ pet: null, furn: null });
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openedAt] = useState(() => Date.now());
  const [turn, setTurn] = useState(0);
  const [actKey, setActKey] = useState(0);
  const [night, setNight] = useState(false);
  /** 11/20 「집 가구」 탭을 누른 횟수 (집이 없으면 누를 때마다 보리가 새로 거절한다) */
  const [furnTaps, setFurnTaps] = useState(0);

  const load = useCallback(
    (live: () => boolean = () => true) =>
      mungnyangApi
        .status()
        .then((s) => {
          if (!live()) return;
          setStatus(s);
          rememberHouse(s.house);
          setLoadError(null);
        })
        .catch((e: unknown) => {
          if (live()) setLoadError(errorMessage(e));
        }),
    [],
  );

  useEffect(() => {
    let live = true;
    void load(() => live);
    void meStore.refresh();
    return () => {
      live = false;
    };
  }, [load]);

  const points = me?.points ?? status?.points ?? null;
  const pets = status?.pets ?? [];
  const furn = status?.furn ?? [];
  const pet = pets.find((p) => p.id === picked.pet) ?? pets[0] ?? null;
  const item = furn.find((f) => f.id === picked.furn) ?? furn[0] ?? null;

  function pick(id: string) {
    setPicked((p) => ({ ...p, [tab]: id }));
    setTurn(0);
    setActKey(0);
    setConfirm(null);
    setNotice(null);
  }

  function switchTab(t: MungnyangTab) {
    if (t === "furn") setFurnTaps((n) => n + 1);
    setTab(t);
    setTurn(0);
    setActKey(0);
    setConfirm(null);
    setNotice(null);
  }

  async function run(key: string, job: () => Promise<string>) {
    setPending(key);
    setNotice(null);
    try {
      setNotice(await job());
    } catch (e) {
      setNotice(errorMessage(e));
      void load();
    } finally {
      setPending(null);
      setConfirm(null);
    }
  }

  const buyPet = (row: MungnyangPetRow) =>
    run(`pet:${row.id}`, async () => {
      const res = await mungnyangApi.buy("pet", row.id);
      setStatus(res);
      if (res.lookGrant) applyStyle({ me: res.me, lookGrant: res.lookGrant });
      else meStore.set(res.me);
      bridge.emit("forage:coin");
      return boughtText(res.got, "pet", row.ride, coarse);
    });
  const buyFurn = (row: MungnyangFurnRow) =>
    run(`furn:${row.id}`, async () => {
      const res = await mungnyangApi.buy("furn", row.id);
      setStatus(res);
      meStore.set(res.me);
      bridge.emit("forage:coin");
      return boughtText(res.got, "furn");
    });

  function priceText(base: number, cost: number) {
    if (cost >= base) return <>{won(base)}</>;
    return (
      <>
        <s className={shop.oldPrice}>{won(base)}</s> {won(cost)}
      </>
    );
  }

  function petDetail(row: MungnyangPetRow) {
    const o = ownedOf(me, row.id, openedAt);
    const forever = !!o?.forever;
    const ticket = me?.inventory[row.id] ?? 0;
    const short = points !== null && points < row.price;
    const ways = petTurnWays(row.id);
    const view = petViewAt(row.id, turn);
    const busy = pending !== null;
    return (
      <section ref={watchMoreBelow} className={cx(shop.detail, styles.detail, "more-fade")} aria-label={`${row.name} 자세히 보기`} aria-live="polite">
        <div className={styles.stageWrap}>
          <div className={styles.petStage}>
            <PetTurnArt petId={row.id} view={view} actKey={actKey} box={120} />
            <span className={styles.viewTag}>{viewName(view)}</span>
          </div>
          <div className={styles.stageBar}>
            <button type="button" className={cx(ui.button, styles.stageBtn)} onClick={() => setTurn((t) => (t + 1) % ways)}>
              {ways === 4 ? "돌려 보기" : "뒤집어 보기"}
            </button>
            {hasPetAct(row.id) && (
              <button
                type="button"
                className={cx(ui.button, styles.stageBtn)}
                onClick={() => {
                  if (view !== "right" && view !== "left") setTurn(0);
                  setActKey((k) => k + 1);
                }}
              >
                재롱 보기
              </button>
            )}
          </div>
        </div>
        <div className={shop.info}>
          <p className={shop.name}>
            {row.name}
            {row.ride && <span className={styles.rideTag}>타는 펫</span>}
          </p>
          <p className={shop.desc}>{row.desc}</p>
          <LookScoreBadge itemId={row.id} className={shop.lookScore} />
          <p className={styles.state}>{petStateText(o, ticket)}</p>
          {!forever &&
            (confirm === row.id ? (
              <div className={styles.confirm}>
                <button type="button" className={cx(ui.button, shop.buy, shop.buyForever)} disabled={busy || short} onClick={() => void buyPet(row)}>
                  {pending ? "분양 중…" : `정말 데려가기 (${won(row.price)})`}
                </button>
                <button type="button" className={cx(ui.button, shop.buy)} disabled={busy} onClick={() => setConfirm(null)}>
                  그만두기
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={cx(ui.button, shop.buy, shop.buyForever)}
                disabled={!me || busy || short}
                onClick={() => setConfirm(row.id)}
                aria-label={`${row.name}, ${row.price}포인트에 영구로 분양받기`}
              >
                {short ? `포인트가 모자라요 (${won(row.price)})` : `영구 분양받기 (${won(row.price)})`}
              </button>
            ))}
          {o?.where === "home" && (
            <button type="button" className={cx(ui.button, shop.buy)} disabled={busy} onClick={() => void run("bring", async () => (await wearStashed(row.id), `${row.name}, 같이 다녀요.`))}>
              데리고 다니기
            </button>
          )}
          {o?.where === "worn" && (
            <button type="button" className={cx(ui.button, shop.buy)} disabled={busy} onClick={() => void run("home", async () => (await takeOff("pet"), `${row.name}, 집에서 쉬고 있어요.`))}>
              집에 두기
            </button>
          )}
        </div>
      </section>
    );
  }

  function furnDetail(row: MungnyangFurnRow) {
    const def = furnitureById(row.id);
    const ways = def && rotateMode(def) === "turn" ? 4 : 2;
    const short = points !== null && points < row.cost;
    const noHouse = status?.house === false;
    return (
      <section ref={watchMoreBelow} className={cx(shop.detail, styles.detail, "more-fade")} aria-label={`${row.name} 자세히 보기`} aria-live="polite">
        <div className={styles.stageWrap}>
          <div className={styles.furnStage} data-night={night || undefined}>
            <FurnitureStage itemId={row.id} w={200} h={140} r={turn % ways} night={night} />
          </div>
          <div className={styles.stageBar}>
            <button type="button" className={cx(ui.button, styles.stageBtn)} onClick={() => setTurn((t) => (t + 1) % ways)}>
              {ways === 4 ? "돌려 보기" : "뒤집어 보기"}
            </button>
            <button type="button" className={cx(ui.button, styles.stageBtn)} aria-pressed={night} onClick={() => setNight((n) => !n)}>
              {night ? "낮으로" : "밤으로"}
            </button>
          </div>
        </div>
        <div className={shop.info}>
          <p className={shop.name}>{row.name}</p>
          <p className={shop.desc}>{row.desc}</p>
          {def?.use && <p className={shop.meta}>집에서 「{def.use}」 할 수 있어요.</p>}
          {row.have > 0 && <p className={styles.state}>{haveText(row.have)}</p>}
          <button type="button" className={cx(ui.button, ui.primary, shop.buy)} disabled={!me || pending !== null || short || noHouse} onClick={() => void buyFurn(row)}>
            {pending ? "사는 중…" : noHouse ? "집이 있어야 살 수 있어요" : <span>사기 ({priceText(row.base, row.cost)}){short ? " 모자라요" : ""}</span>}
          </button>
        </div>
      </section>
    );
  }

  const shown = tab === "pet" ? pet : item;

  return (
    <Dialog title={MUNGNYANG_SHOP_TITLE} onClose={onClose} className={shop.window}>
      <div className={shop.shop}>
        <div className={shop.top}>
          <p className={shop.balance}>
            내 포인트 <strong>{points === null ? "–" : points.toLocaleString("ko-KR")}</strong>
          </p>
          <p className={shop.topHint}>{mungnyangHello(tab)}</p>
        </div>
        {loadError && !status && <p className={ui.error}>{loadError}</p>}
        {tab === "furn" && status?.house === false && <NoHouseBubble key={furnTaps} onWalk={() => walkToHousing(onClose)} />}

        <div className={shop.tabs} role="tablist" aria-label="분양 칸">
          {MUNGNYANG_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`${baseId}-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`${baseId}-panel`}
              className={shop.tab}
              onClick={() => switchTab(t.id)}
            >
              {t.label}
              <span className={shop.tabCount}>{status ? (t.id === "pet" ? pets.length : furn.length) : ""}</span>
            </button>
          ))}
        </div>

        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={shop.panel}>
          {tab === "pet" && pet ? petDetail(pet) : tab === "furn" && item ? furnDetail(item) : <section className={shop.detail} aria-hidden="true" />}
          <div className={shop.listCol}>
            <ul ref={watchMoreBelow} className={cx(styles.grid, "more-fade")} aria-label={tab === "pet" ? "분양하는 펫" : "파는 집 가구"}>
              {tab === "pet"
                ? pets.map((r) => {
                    const o = ownedOf(me, r.id, openedAt);
                    const fam = !!o?.forever;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          className={shop.tile}
                          aria-pressed={shown?.id === r.id}
                          title={`${r.name} — ${r.desc}`}
                          aria-label={`${r.name}, ${r.price}포인트${fam ? ", 가족" : ""}`}
                          onClick={() => pick(r.id)}
                        >
                          <span className={shop.thumb}>
                            <ItemIcon itemId={r.id} size={48} />
                          </span>
                          <span className={shop.tileName}>{r.name}</span>
                          <LookScoreBadge itemId={r.id} short />
                          <span className={shop.tilePrice}>{fam ? <span className={shop.badge}>{o!.where === "worn" ? "함께 걷는 중" : "가족"}</span> : won(r.price)}</span>
                        </button>
                      </li>
                    );
                  })
                : furn.map((r) => (
                    <li key={r.id}>
                      <button
                        type="button"
                        className={shop.tile}
                        aria-pressed={shown?.id === r.id}
                        title={`${r.name} — ${r.desc}`}
                        aria-label={`${r.name}, ${r.cost}포인트, 눌러서 둘러보기`}
                        onClick={() => pick(r.id)}
                      >
                        <span className={shop.thumb}>
                          <FurnitureThumb itemId={r.id} w={56} h={48} />
                        </span>
                        <span className={shop.tileName}>{r.name}</span>
                        <span className={shop.tilePrice}>
                          {priceText(r.base, r.cost)}
                          {r.have > 0 ? <span className={shop.badge}>{r.have}개</span> : null}
                        </span>
                      </button>
                    </li>
                  ))}
              {!status && !loadError && <li className={styles.empty}>아이들을 데려오는 중이에요…</li>}
            </ul>
          </div>
        </div>

        <p className={shop.notice} role="status">
          {notice ?? footHint(tab)}
        </p>
      </div>
    </Dialog>
  );
}
