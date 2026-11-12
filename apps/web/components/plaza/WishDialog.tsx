"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { WISH_COINS, WISH_DAILY, type WishFortune, type WishResponse } from "@/lib/wish";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./WishDialog.module.css";

/**
 * 50번 소원 분수 (광장 북쪽). 동전(1·3·5P)을 고르면 서버(/api/plaza/wish)가 차감하고 오늘의 운세를 준다.
 * 가끔 몇 포인트가 튀어 돌아온다. 하루 세 번. 던지면 게임이 동전이 날아가 퐁당하는 연출을 한다(wish:thrown).
 */
export default function WishDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fortune: WishFortune; bonus: number; spent: number } | null>(null);

  // 열 때 포인트를 새로 받는다 (다른 창·탭에서 쓰거나 받은 것까지)
  useEffect(() => {
    void meStore.refresh();
  }, []);

  async function toss(amount: number) {
    setPending(true);
    setError(null);
    try {
      const res = await request<WishResponse>("/api/plaza/wish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      meStore.set(res.me);
      setResult({ fortune: res.fortune, bonus: res.bonus, spent: res.spent });
      bridge.emit("wish:thrown", { amount });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog title="소원 분수" onClose={onClose}>
      <div className={styles.wrap}>
        <p className={styles.lead}>
          동전을 던지고 소원을 빌면 오늘의 운세가 나와요. 가끔은 동전이 반짝 튀어 돌아오기도 해요. (하루 {WISH_DAILY}번)
        </p>
        {result && (
          <div className={styles.result} role="status">
            <span className={styles.luck}>오늘의 운세 · {result.fortune.title}</span>
            <p className={styles.text}>{result.fortune.text}</p>
            {result.bonus > 0 ? (
              <p className={styles.bonus}>동전이 반짝 튀어 돌아왔어요! +{result.bonus}P</p>
            ) : (
              <p className={styles.points}>동전 {result.spent}P가 퐁당 — 소원이 물결에 실려 갔어요.</p>
            )}
          </div>
        )}
        <div className={styles.coins}>
          {WISH_COINS.map((c) => (
            <button key={c} type="button" className={`${ui.button} ${styles.coin}`} onClick={() => toss(c)} disabled={pending || (me ? me.points < c : false)}>
              {c}P 던지기
            </button>
          ))}
        </div>
        {me && <p className={styles.points}>내 포인트 {me.points.toLocaleString("ko-KR")}P</p>}
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
