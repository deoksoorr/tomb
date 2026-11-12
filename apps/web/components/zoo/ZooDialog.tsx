"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useEffect, useMemo, useState } from "react";
import { isPermanentUntil, isRideablePet, itemById, ZOO_PETS, type PetDef } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { keeperPortraitUrl } from "@/game/world/zoo/zooArt";
import { KEEPER_NAME, KEEPER_TITLE } from "@/game/world/zoo/ZooView";
import { errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import type { Me } from "@/lib/types";
import { zooApi } from "@/lib/zoo/client";
import { applyStyle, takeOff, wearStashed } from "../account/actions";
import { remainingLabel } from "../account/items";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import PetArt, { hasPetArt } from "./PetArt";
import s from "./zoo.module.css";

// 동물원 사육사의 펫 분양 창 (사육사 앞에서 E). 펫은 영구로만 분양한다 (상점의 기간제 펫 판매는 멈췄다).
// 한 번에 한 마리만 데리고 다닌다: 분양 받으면 바로 데리고 다니고, 데리고 다니던 펫은 집(벗어 둔 꾸미기)으로 간다.
// 여기서도, 가방의 펫 칸에서도 데리고 다닐 펫을 바꾸거나 집에 둘 수 있다. 타는 펫은 데리고 다니면서 R(모바일은 타기 버튼)로 올라탄다.

type Owned = { where: "worn" | "home"; until: number } | null;

function ownedOf(me: Me | null, id: string, now: number): Owned {
  if (!me) return null;
  const worn = me.equipped.find((e) => e.itemId === id && e.until > now);
  if (worn) return { where: "worn", until: worn.until };
  const home = me.stash?.find((e) => e.itemId === id && e.until > now);
  return home ? { where: "home", until: home.until } : null;
}

export default function ZooDialog({ onClose }: { onClose: () => void }) {
  const { me, error } = useMe();
  const [openedAt] = useState(() => Date.now());
  const [pickId, setPickId] = useState<string>(ZOO_PETS[0].id);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [portrait] = useState(() => (typeof document === "undefined" ? "" : keeperPortraitUrl()));

  useEffect(() => {
    void meStore.refresh();
  }, []);

  const pick: PetDef = ZOO_PETS.find((p) => p.id === pickId) ?? ZOO_PETS[0];
  const item = itemById(pick.id)!;
  const owned = ownedOf(me, pick.id, openedAt);
  const forever = !!owned && isPermanentUntil(owned.until);
  const ticket = me?.inventory[pick.id] ?? 0;
  const short = !!me && me.points < pick.price;
  const family = useMemo(() => ZOO_PETS.filter((p) => ownedOf(me, p.id, openedAt)).length, [me, openedAt]);

  async function run(job: () => Promise<string>) {
    setPending(true);
    setNotice(null);
    try {
      setNotice(await job());
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  const adopt = () =>
    run(async () => {
      applyStyle(await zooApi.buy(pick.id));
      bridge.emit("forage:coin");
      return `${item.name}이(가) 가족이 됐어요! 지금부터 데리고 다녀요.${isRideablePet(pick.id) ? " R 키(모바일은 타기 버튼)로 올라타 보세요." : ""}`;
    });
  const bring = () =>
    run(async () => {
      await wearStashed(pick.id);
      return `${item.name}을(를) 데리고 다녀요.`;
    });
  const home = () =>
    run(async () => {
      await takeOff("pet");
      return `${item.name}은(는) 집에서 쉬고 있어요. 언제든 다시 데리고 나올 수 있어요.`;
    });

  function select(id: string) {
    setPickId(id);
    setConfirm(null);
    setNotice(null);
  }

  return (
    <Dialog title={`${KEEPER_NAME} · ${KEEPER_TITLE}`} onClose={onClose}>
      <div className={s.zoo}>
        <div className={s.hello}>
          {portrait && <img src={portrait} width={48} height={56} alt="" style={{ imageRendering: "pixelated" }} />}
          <p>
            어서 와요! 여기 아이들은 한 번 데려가면 평생 가족이에요. 한 번에 한 마리만 데리고 다닐 수 있고, 나머지는 집에서 기다려요.
            <br />
            <span className={s.muted}>큰 개·왕거위·달빛 사슴은 등에 태워 줘요.</span>
          </p>
        </div>
        <p className={s.balance}>
          내 포인트 <strong>{me ? me.points.toLocaleString("ko-KR") : "–"}</strong>
          <span className={s.muted}>
            {" "}
            · 가족 {family}/{ZOO_PETS.length}
          </span>
        </p>
        {!me && error && <p className={ui.error}>{error}</p>}

        <div className={s.body}>
          <section className={s.detail} aria-label={`${item.name} 자세히 보기`} aria-live="polite">
            <div className={s.stage}>{hasPetArt(pick.id) ? <PetArt petId={pick.id} box={112} /> : <ItemIcon itemId={pick.id} size={96} />}</div>
            <h3 className={s.name}>
              {item.name}
              {isRideablePet(pick.id) && <span className={s.badge}>타는 펫</span>}
            </h3>
            <p className={s.desc}>{item.desc}</p>
            <p className={s.price}>
              영구 분양 <strong>{pick.price.toLocaleString("ko-KR")}P</strong>
            </p>
            <p className={s.state}>
              {forever
                ? owned!.where === "worn"
                  ? "가족 · 지금 데리고 다니는 중"
                  : "가족 · 집에서 쉬는 중"
                : owned
                  ? `예전에 산 기간제 (${remainingLabel(owned.until, openedAt)}) · ${owned.where === "worn" ? "데리고 다니는 중" : "집에 있음"}`
                  : ticket > 0
                    ? `가방에 기간제 이용권 ${ticket}개`
                    : "아직 가족이 아니에요"}
            </p>
            <div className={s.actions}>
              {!forever &&
                (confirm === pick.id ? (
                  <>
                    <button type="button" className={cx(ui.button, ui.primary)} disabled={pending || short} onClick={() => void adopt()}>
                      {pending ? "분양 중…" : `정말 분양 받기 (${pick.price.toLocaleString("ko-KR")}P)`}
                    </button>
                    <button type="button" className={ui.button} disabled={pending} onClick={() => setConfirm(null)}>
                      그만두기
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={cx(ui.button, ui.primary)}
                    disabled={!me || pending || short}
                    onClick={() => setConfirm(pick.id)}
                    aria-label={`${item.name}, ${pick.price}포인트에 영구로 분양 받기`}
                  >
                    {short ? `포인트가 모자라요 (${pick.price.toLocaleString("ko-KR")}P)` : `분양 받기 · ${pick.price.toLocaleString("ko-KR")}P`}
                  </button>
                ))}
              {owned?.where === "home" && (
                <button type="button" className={ui.button} disabled={pending} onClick={() => void bring()}>
                  데리고 다니기
                </button>
              )}
              {owned?.where === "worn" && (
                <button type="button" className={ui.button} disabled={pending} onClick={() => void home()}>
                  집에 두기
                </button>
              )}
            </div>
            {isRideablePet(pick.id) && (
              <p className={ui.hint}>데리고 다니면서 R 키(모바일은 타기 버튼)로 올라타요. 조금 빨라져요. 앉기·낚시·놀이기구·배·물에 들어가면 저절로 내려요.</p>
            )}
          </section>

          <ul className={s.list} aria-label="분양하는 펫">
            {ZOO_PETS.map((p) => {
              const it = itemById(p.id)!;
              const o = ownedOf(me, p.id, openedAt);
              const fam = !!o && isPermanentUntil(o.until);
              return (
                <li key={p.id}>
                  <button type="button" className={s.card} aria-pressed={p.id === pick.id} onClick={() => select(p.id)} aria-label={`${it.name}, ${p.price}포인트${fam ? ", 가족" : ""}`}>
                    <ItemIcon itemId={p.id} size={32} />
                    <span className={s.cardName}>{it.name}</span>
                    <span className={s.cardMeta}>
                      {fam ? (o!.where === "worn" ? "함께 걷는 중" : "가족") : `${p.price.toLocaleString("ko-KR")}P`}
                      {isRideablePet(p.id) ? " · 탈것" : ""}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <p className={ui.hint} role="status">
          {notice ?? "분양 받은 펫은 영원히 내 가족이에요. 가방의 펫 칸에서도 데리고 다닐 펫을 바꾸거나 집에 둘 수 있어요."}
        </p>
      </div>
    </Dialog>
  );
}
