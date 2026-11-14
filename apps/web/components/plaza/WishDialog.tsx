"use client";

import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { errorMessage, request } from "@/lib/api";
import { DAY_RESET_TEXT, gameYmd } from "@/lib/gameDay";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { readItem, writeItem } from "@/lib/storage";
import { WISH_BONUS_JACKPOT, WISH_BONUS_SPARKLE, WISH_COINS, WISH_DAILY, WISH_LUCK_TABLE, type WishFortune, type WishResponse } from "@/lib/wish";
import Dialog from "../ui/Dialog";
import { InfoCard, InfoGrid, TipList } from "../ui/InfoBlocks";
import PixelArt, { type PixelRect } from "../ui/PixelArt";
import ui from "../ui/ui.module.css";
import styles from "./WishDialog.module.css";

/** 오늘(새벽 5시에 바뀌는 게임 날짜) 이 기기에서 던진 기록 */
const LOG_KEY = "tomb.ui.wishLog";
type Toss = { day: string; at: number; spent: number; bonus: number; title: string; text: string };

/** 게임 날짜 (YYYY-MM-DD, 한국 시간 새벽 5시에 바뀐다 — 서버 횟수와 같은 경계) */
const kstDay = (t: number) => gameYmd(t);

function readTodayLog(now: number): Toss[] {
  try {
    const v: unknown = JSON.parse(readItem(LOG_KEY) ?? "[]");
    const today = kstDay(now);
    return Array.isArray(v) ? (v as Toss[]).filter((x) => x && x.day === today && typeof x.title === "string") : [];
  } catch {
    return [];
  }
}

/** 방금 받은 운세를 오늘 기록 맨 앞에 넣고, 오늘 기록 전체를 돌려준다 */
function recordToss(res: WishResponse): Toss[] {
  const now = Date.now();
  const entry: Toss = { day: kstDay(now), at: now, spent: res.spent, bonus: res.bonus, title: res.fortune.title, text: res.fortune.text };
  const next = [entry, ...readTodayLog(now)].slice(0, WISH_DAILY * 2);
  writeItem(LOG_KEY, JSON.stringify(next));
  return next;
}

const pct = (r: number) => `${Math.round(r * 100)}%`;

/** 분수 그림 (48×30 격자) */
const FOUNTAIN: readonly PixelRect[] = [
  // 물보라
  [22, 1, 4, 1, "#cfe8f0"],
  [20, 2, 2, 1, "#9fd0e0"],
  [26, 2, 2, 1, "#9fd0e0"],
  [18, 3, 2, 2, "#7fbcd2"],
  [28, 3, 2, 2, "#7fbcd2"],
  [16, 5, 2, 3, "#6aa9c2"],
  [30, 5, 2, 3, "#6aa9c2"],
  [15, 8, 1, 4, "#5b98b2"],
  [32, 8, 1, 4, "#5b98b2"],
  [23, 2, 2, 8, "#9fd0e0"],
  // 기둥과 위 접시
  [18, 10, 12, 2, "#8a8577"],
  [19, 12, 10, 1, "#6d695e"],
  [22, 13, 4, 7, "#9c9786"],
  [23, 13, 1, 7, "#b5af9c"],
  // 아래 수반
  [6, 20, 36, 3, "#9c9786"],
  [7, 19, 34, 1, "#b5af9c"],
  [8, 21, 32, 1, "#3e7c95"],
  [9, 21, 4, 1, "#7fbcd2"],
  [30, 21, 5, 1, "#7fbcd2"],
  [6, 23, 36, 5, "#7a7566"],
  [6, 23, 36, 1, "#6d695e"],
  [4, 28, 40, 2, "#4f4c43"],
  // 물속 동전
  [14, 21, 2, 1, "#e0c36a"],
  [25, 21, 2, 1, "#f0d27a"],
  [34, 21, 1, 1, "#e0c36a"],
];

/**
 * 50번 소원 분수 (광장 북쪽). 동전(1·3·5P)을 고르면 서버(/api/plaza/wish)가 차감하고 오늘의 운세를 준다.
 * 가끔 몇 포인트가 튀어 돌아온다. 하루 세 번. 던지면 게임이 동전이 날아가 퐁당하는 연출을 한다(wish:thrown).
 * 아래에 오늘 받은 운세(이 기기 기록)·운세 종류와 확률·팁을 보여 준다
 */
export default function WishDialog({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fortune: WishFortune; bonus: number; spent: number } | null>(null);
  const [log, setLog] = useState<Toss[]>(() => readTodayLog(Date.now()));

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
      setLog(recordToss(res));
      bridge.emit("wish:thrown", { amount });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const tossed = log.length;

  return (
    <Dialog title="소원 분수" onClose={onClose}>
      <div className={styles.wrap}>
        <div className={styles.hero}>
          <PixelArt width={48} height={30} rects={FOUNTAIN} scale={4} className={styles.art} label="광장 북쪽의 소원 분수" />
          <div className={styles.heroText}>
            <p className={styles.lead}>
              동전을 던지고 소원을 빌면 오늘의 운세가 나와요. 가끔은 동전이 반짝 튀어 돌아오기도 해요. (하루 {WISH_DAILY}번)
            </p>
            <p className={styles.count}>
              오늘 이 기기에서 {Math.min(tossed, WISH_DAILY)}/{WISH_DAILY}번 던졌어요
              {me && ` · 내 포인트 ${me.points.toLocaleString("ko-KR")}P`}
            </p>
          </div>
        </div>
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
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}

        <InfoGrid>
          <InfoCard title="오늘 받은 운세" icon="spark" aside={tossed ? `${tossed}번` : undefined}>
            {log.length === 0 ? (
              <p className={styles.muted}>아직 던지지 않았어요. 첫 동전을 던져 보세요.</p>
            ) : (
              <ul className={styles.log}>
                {log.map((t) => (
                  <li key={t.at}>
                    <span className={styles.logHead}>
                      <b>{t.title}</b>
                      <span className={styles.muted}>
                        {new Date(t.at).toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })} · {t.spent}P
                        {t.bonus > 0 && ` · +${t.bonus}P 돌아옴`}
                      </span>
                    </span>
                    <span className={styles.logText}>{t.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </InfoCard>
          <InfoCard title="운세 종류" icon="list">
            <ul className={styles.table}>
              {WISH_LUCK_TABLE.map((l) => (
                <li key={l.luck}>
                  <span className={styles.tableTitle}>{l.title}</span>
                  <span className={styles.bar} aria-hidden="true">
                    <span style={{ width: `${l.chance * 2.5}%` }} />
                  </span>
                  <span className={styles.muted}>{l.chance}%</span>
                </li>
              ))}
            </ul>
          </InfoCard>
        </InfoGrid>
        <InfoCard title="알아 두기" icon="info">
          <TipList
            tips={[
              `${pct(WISH_BONUS_SPARKLE + WISH_BONUS_JACKPOT)} 확률로 동전이 튀어 돌아와요. 그중 ${pct(WISH_BONUS_JACKPOT)}는 대박 — 던진 것의 두 배 + 5P예요.`,
              "운세는 동전 크기와 상관없이 같은 확률로 나와요. 1P로도 충분해요.",
              "돌아온 포인트는 하루 포인트 한도에 들어가요. 한도가 차면 줄거나 0이 될 수 있어요.",
              `던진 횟수는 한국 시간 ${DAY_RESET_TEXT}에 다시 채워져요.`,
            ]}
          />
        </InfoCard>
      </div>
    </Dialog>
  );
}
