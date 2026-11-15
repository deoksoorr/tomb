"use client";

import { useEffect, useState } from "react";
import { BBQ_DAILY, BBQ_MENU, type BbqItemId } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import type { BbqResponse, BbqStatusResponse } from "@/lib/campBbq";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./CampBbq.module.css";

// 11/15 캠핑장 야외 바베큐 메뉴 창: 그릴 앞에서 E(camp:bbq:open)로 연다. 고르면 서버(/api/camp/bbq)가 포인트를 쓰고 한 접시 증서를 준다
// → 게임(camp:bbq:eat)이 먹는 연출과 함께 잠깐 커지고, 같은 캠핑장 사람들 화면에도 커진 모습이 보인다. 재미용이라 능력치는 그대로.

const sec = (ms: number) => Math.round(ms / 1000);
const css = (c: number) => `#${c.toString(16).padStart(6, "0")}`;

export default function CampBbq() {
  const [open, setOpen] = useState(false);
  useEffect(() => bridge.on("camp:bbq:open", () => setOpen(true)), []);
  if (!open) return null;
  return <BbqDialog onClose={() => setOpen(false)} />;
}

function BbqDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [eaten, setEaten] = useState<number | null>(null);
  const [pending, setPending] = useState<BbqItemId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void meStore.refresh();
    request<BbqStatusResponse>("/api/camp/bbq").then(
      (r) => setEaten(r.eaten),
      () => setEaten(null),
    );
  }, []);

  async function buy(item: BbqItemId) {
    setPending(item);
    setError(null);
    try {
      const res = await request<BbqResponse>("/api/camp/bbq", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ item }),
      });
      meStore.set(res.me);
      setEaten(res.eaten);
      bridge.emit("camp:bbq:eat", { item: res.item, until: res.until, grant: res.grant });
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(null);
    }
  }

  const left = eaten === null ? null : Math.max(0, BBQ_DAILY - eaten);
  return (
    <Dialog title="야외 바베큐" onClose={onClose} kind="confirm">
      <div className={styles.wrap}>
        <p className={styles.lead}>숯불에 막 구웠어요. 먹으면 잠깐 몸이 커져요.</p>
        <ul className={styles.menu}>
          {BBQ_MENU.map((m) => (
            <li key={m.id} className={styles.row}>
              <span className={styles.dot} style={{ background: css(m.tint) }} aria-hidden="true" />
              <span className={styles.text}>
                <b>{m.name}</b>
                <span className={styles.note}>
                  {m.note} {sec(m.ms)}초 동안이에요.
                </span>
              </span>
              <button
                type="button"
                className={cx(ui.button, ui.primary, styles.buy)}
                onClick={() => void buy(m.id)}
                disabled={pending !== null || left === 0 || (me ? me.points < m.price : false)}
              >
                {pending === m.id ? "굽는 중…" : `${m.price}P`}
              </button>
            </li>
          ))}
        </ul>
        <p className={styles.foot}>
          {left === null ? `하루 ${BBQ_DAILY}접시까지 먹을 수 있어요.` : left > 0 ? `오늘 ${left}접시 더 먹을 수 있어요.` : "오늘은 배불러요. 내일 또 먹으러 와요."}
          {me && ` 내 포인트는 ${me.points.toLocaleString("ko-KR")}P예요.`}
        </p>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
