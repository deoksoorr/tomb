"use client";

import { useEffect, useMemo, useState } from "react";
import { BBQ_MENU, bbqStands, DRUNK_MAX, drunkLevel, type BbqItem, type BbqItemId, type BbqStand } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { bbqPlateArt } from "@/game/camp/campArt";
import { myFood } from "@/game/camp/foodState";
import { errorMessage, request } from "@/lib/api";
import type { BbqResponse, BbqStatusResponse } from "@/lib/campBbq";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { snackBagIcon } from "@/game/sea/gullArt";
import { SNACK, SNACK_KINDS, type SnackKind } from "@/lib/sea/gull";
import { gullApi, publishSnacks, setSnackHand, snackHand } from "@/lib/sea/gullClient";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./CampBbq.module.css";

// 11/15 캠핑장 메뉴 창: 바베큐 그릴 앞 E는 먹거리, 음료 자판기 앞 E는 마실 거리 (camp:bbq:open stand). 하루 한도는 없다.
// 고르면 서버(/api/camp/bbq)가 포인트를 쓰고 증서를 준다 → 게임(camp:bbq:eat)이 먹는·마시는 연출과 효과를 보여 주고,
// 같은 맵 사람들 화면에도 보인다. 효과는 커지기·빨라지기·취기 세 갈래로 따로 겹친다. 재미용이라 능력치는 그대로.

const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
const minutes = (ms: number) => Math.round(ms / 60_000);

/** 메뉴 그림 (게임과 같은 픽셀 그림을 4배로) */
function useIcon(id: BbqItemId): string {
  return useMemo(() => {
    try {
      return bbqPlateArt(id).toCanvas().toDataURL();
    } catch {
      return "";
    }
  }, [id]);
}

function Icon({ id }: { id: BbqItemId }) {
  const src = useIcon(id);
  // 그 자리에서 그린 작은 픽셀 그림(data URL)이라 next/image가 필요 없다
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img className={styles.icon} src={src} alt="" aria-hidden="true" /> : <span className={styles.icon} aria-hidden="true" />;
}

/** 효과 한 줄 (메뉴 소개 뒤) */
function effectText(m: BbqItem): string {
  if (m.kind === "grow") return m.scale >= 2 && Number.isInteger(m.scale) ? `${minutes(m.ms)}분 동안 몸이 ${m.scale}배로 커져요.` : `${minutes(m.ms)}분 동안 ${Math.round((m.scale - 1) * 100)}% 커져요.`;
  if (m.kind === "speed") return `${minutes(m.ms)}분 동안 마을·캠핑장·바닷가에서 ${Math.round((m.speed - 1) * 100)}% 빨리 걸어요.${m.trail ? " 걸으면 잔상이 따라와요." : ""}`;
  if (m.kind === "sober") return "마시면 취기가 한 단계 내려가요.";
  return "한 잔마다 취기가 하나씩 올라요. 10분에 하나씩 깨요.";
}

export default function CampBbq() {
  const [stand, setStand] = useState<BbqStand | null>(null);
  useEffect(() => bridge.on("camp:bbq:open", (e) => setStand(e?.stand ?? "grill")), []);
  if (!stand) return null;
  return <BbqDialog key={stand} stand={stand} onClose={() => setStand(null)} />;
}

function BbqDialog({ stand, onClose }: { stand: BbqStand; onClose: () => void }) {
  const { me } = useMe();
  const tab = stand === "grill" || stand === "kiosk" ? "food" : "drink";
  const [pending, setPending] = useState<BbqItemId | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 지금 취기: 이 브라우저 기억, 서버 기록(다른 기기에서 마신 것) 중 큰 쪽
  const [tipsy, setTipsy] = useState(() => drunkLevel(myFood().drunk, Date.now()));

  useEffect(() => {
    void meStore.refresh();
    request<BbqStatusResponse>("/api/camp/bbq").then(
      (r) => setTipsy((t) => Math.max(t, r.drunk ?? 0)),
      () => {},
    );
  }, []);

  async function buy(item: BbqItem) {
    setPending(item.id);
    setError(null);
    try {
      const res = await request<BbqResponse>("/api/camp/bbq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item: item.id, stand }),
      });
      meStore.set(res.me);
      bridge.emit("camp:bbq:eat", { item: res.item, until: res.until, grant: res.grant, ...(res.lv !== undefined ? { lv: res.lv } : {}), ...(res.at !== undefined ? { at: res.at } : {}), stand });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  // 11/16 r12 바닷가: 매점은 먹거리, 바닷가 자판기는 술·음료 (bbqStands)
  const items = BBQ_MENU.filter((m) => bbqStands(m).includes(stand));
  const title = stand === "kiosk" ? "포구 매점" : stand === "vending" || stand === "seaVend" ? "음료 자판기" : "야외 바베큐";
  const lead =
    stand === "kiosk"
      ? "바닷바람 맞으며 한 입 해요. 먹으면 몸이 커지거나 걸음이 빨라져요."
      : tab === "drink"
        ? "버튼을 누르면 덜컹 떨어져요. 마실수록 볼이 발그레해져요."
        : "숯불에 막 구웠어요. 먹으면 몸이 커지거나 걸음이 빨라져요.";
  return (
    <Dialog title={title} onClose={onClose} kind="confirm">
      <div className={styles.wrap}>
        <div className={styles.wrap}>
          <p className={styles.lead}>{lead}</p>
          <ul className={styles.menu}>
            {items.map((m) => (
              <li key={m.id} className={styles.row}>
                <Icon id={m.id} />
                <span className={styles.text}>
                  <b>
                    <span className={styles.dot} style={{ background: css(m.tint) }} aria-hidden="true" /> {m.name}
                  </b>
                  <span className={styles.note}>
                    {m.note} {effectText(m)}
                  </span>
                </span>
                <button
                  type="button"
                  className={cx(ui.button, ui.primary, styles.buy)}
                  onClick={() => void buy(m)}
                  disabled={pending !== null || (me ? me.points < m.price : false)}
                >
                  {pending === m.id ? (stand === "kiosk" ? "받는 중…" : m.cat === "drink" ? "뽑는 중…" : "굽는 중…") : `${m.price}P`}
                </button>
              </li>
            ))}
          </ul>
          {stand === "kiosk" && <GullSnacks />}
          <p className={styles.foot}>
            {tab === "drink" ? (tipsy >= DRUNK_MAX ? "취기가 끝까지 올랐어요. 더 마시면 깨는 시간만 늘어요." : tipsy > 0 ? `지금 취기는 ${tipsy}단계예요.` : "몇 잔이든 마실 수 있어요.") : "몇 접시든 먹을 수 있어요."}
            {me && ` 내 포인트는 ${me.points.toLocaleString("ko-KR")}P예요.`}
          </p>
        </div>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

/** 11/17 포구 갈매기 과자 (매점 아래 칸): 갈매기 과자 · 매운 새우 과자. 하루 둘 합쳐 10개, 손에 든 과자를 갈매기 가까이에서 E로 던져요 */
function GullSnacks() {
  const [st, setSt] = useState<{ plain: number; spicy: number; bought: number; limit: number } | null>(null);
  const [hand, setHand] = useState<SnackKind>(snackHand);
  const [pending, setPending] = useState<SnackKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const icons = useMemo(() => {
    try {
      return { plain: snackBagIcon(false).toCanvas().toDataURL(), spicy: snackBagIcon(true).toCanvas().toDataURL() };
    } catch {
      return { plain: "", spicy: "" };
    }
  }, []);
  useEffect(() => {
    gullApi.get().then((r) => {
      setSt(r);
      publishSnacks(r);
    }, () => {});
  }, []);
  async function buy(kind: SnackKind) {
    setPending(kind);
    setMsg(null);
    try {
      const r = await gullApi.buy(kind);
      meStore.set(r.me);
      setSt(r);
      setHand(kind);
      setSnackHand(kind);
      publishSnacks(r);
      setMsg(`${SNACK[kind].name}를 손에 들었어요. 갈매기 가까이에서 E로 던져요.`);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }
  const left = st ? Math.max(0, st.limit - st.bought) : 0;
  return (
    <section className={styles.gull} aria-label="갈매기 과자">
      <p className={styles.gullTitle}>갈매기 과자 {st && <span className={styles.note}>오늘 {left}개 더 살 수 있어요</span>}</p>
      <ul className={styles.menu}>
        {SNACK_KINDS.map((k) => (
          <li key={k} className={styles.row}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 그 자리에서 그린 작은 픽셀 그림 */}
            {icons[k] ? <img className={styles.icon} src={icons[k]} alt="" aria-hidden="true" /> : <span className={styles.icon} aria-hidden="true" />}
            <span className={styles.text}>
              <b>{SNACK[k].name}</b>
              <span className={styles.note}>
                {k === "spicy" ? "받아먹은 갈매기가 30초 동안 빨개져요. 가끔 붉은 깃털을 줘요." : "던지면 갈매기들이 몰려와요. 가끔 고맙다며 깃털을 줘요."} {st ? `가진 것 ${st[k]}개.` : ""}
              </span>
              <button type="button" className={cx(ui.button, styles.hand)} aria-pressed={hand === k} onClick={() => (setHand(k), setSnackHand(k))}>
                {hand === k ? "손에 들었어요" : "손에 들기"}
              </button>
            </span>
            <button type="button" className={cx(ui.button, ui.primary, styles.buy)} onClick={() => void buy(k)} disabled={pending !== null || !st || left <= 0}>
              {pending === k ? "받는 중…" : `${SNACK[k].price}P`}
            </button>
          </li>
        ))}
      </ul>
      {msg && <p className={styles.note}>{msg}</p>}
    </section>
  );
}
