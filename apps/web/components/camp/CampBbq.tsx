"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { BBQ_MENU, DRUNK_MAX, drunkLevel, type BbqCat, type BbqItem, type BbqItemId } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { bbqPlateArt } from "@/game/camp/campArt";
import { myFood } from "@/game/camp/foodState";
import { errorMessage, request } from "@/lib/api";
import type { BbqResponse, BbqStatusResponse } from "@/lib/campBbq";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./CampBbq.module.css";

// 11/15 캠핑장 야외 바베큐 메뉴 창: 그릴 앞에서 E(camp:bbq:open)로 연다. 「먹거리」·「마실 거리」 두 칸 (하루 한도는 없다).
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
  if (m.kind === "speed") return `${minutes(m.ms)}분 동안 마을·캠핑장에서 ${Math.round((m.speed - 1) * 100)}% 빨리 걸어요.${m.trail ? " 걸으면 잔상이 따라와요." : ""}`;
  return "한 잔마다 취기가 하나씩 올라요. 10분에 하나씩 깨요.";
}

export default function CampBbq() {
  const [open, setOpen] = useState(false);
  useEffect(() => bridge.on("camp:bbq:open", () => setOpen(true)), []);
  if (!open) return null;
  return <BbqDialog onClose={() => setOpen(false)} />;
}

function BbqDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const baseId = useId();
  const [tab, setTab] = useState<BbqCat>("food");
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
        body: JSON.stringify({ item: item.id }),
      });
      meStore.set(res.me);
      bridge.emit("camp:bbq:eat", { item: res.item, until: res.until, grant: res.grant, ...(res.lv !== undefined ? { lv: res.lv } : {}), ...(res.at !== undefined ? { at: res.at } : {}) });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const items = BBQ_MENU.filter((m) => m.cat === tab);
  return (
    <Dialog title="야외 바베큐" onClose={onClose} kind="confirm">
      <div className={styles.wrap}>
        <div className={styles.tabs} role="tablist" aria-label="메뉴 칸">
          {(
            [
              ["food", "먹거리"],
              ["drink", "마실 거리"],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" role="tab" id={`${baseId}-${k}`} aria-selected={tab === k} aria-controls={`${baseId}-panel`} className={styles.tab} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>
        <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}`} className={styles.wrap}>
          <p className={styles.lead}>{tab === "drink" ? "시원한 거 한잔해요. 마실수록 볼이 발그레해져요." : "숯불에 막 구웠어요. 먹으면 몸이 커지거나 걸음이 빨라져요."}</p>
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
                  {pending === m.id ? (m.cat === "drink" ? "따르는 중…" : "굽는 중…") : `${m.price}P`}
                </button>
              </li>
            ))}
          </ul>
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
