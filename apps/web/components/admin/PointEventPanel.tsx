"use client";

import { useEffect, useState } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { earnRule, type EarnSource } from "@/lib/economy";
import { nextDayStartMs, nextWeekStartMs } from "@/lib/gameDay";
import {
  allSources,
  BOOSTABLE_SOURCES,
  earnBoostAt,
  isBoosted,
  POINT_EVENT_MULT,
  POINT_EVENT_MULTS,
  pointEventEndText,
  pointEventListText,
  pointEventOn,
  type PointEvent,
} from "@/lib/pointEvent";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { opsAdminApi } from "./opsAdminApi";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const KST_MS = 9 * 3_600_000;
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" });
/** ms → datetime-local 값 (한국 시간) */
const toInput = (t: number) => new Date(t + KST_MS).toISOString().slice(0, 16);
/** datetime-local 값 (한국 시간으로 읽는다) → ms. 비었거나 이상하면 null */
function fromInput(v: string): number | null {
  const t = Date.parse(`${v}:00Z`);
  return Number.isFinite(t) ? t - KST_MS : null;
}

/**
 * 포인트 배수 이벤트 탭: 늘릴 항목(전부 또는 골라서)·배수·끝나는 시각(한국 시간)을 정해 켜고 끈다.
 * 고른 항목은 적립과 그 항목 하루 한도가 배수가 되고, 하루 전체 한도는 늘어난 몫만큼 늘어난다. 규칙은 lib/pointEvent.ts
 */
export default function PointEventPanel({ toast, onAuthLost }: Props) {
  const loaded = usePanelData(() => opsAdminApi.pointEvent(), [], toast, onAuthLost);
  const [saved, setSaved] = useState<{ event: PointEvent | null } | null>(null);
  const [until, setUntil] = useState(true);
  const [endInput, setEndInput] = useState(() => toInput(nextWeekStartMs()));
  const [pickDraft, setPickDraft] = useState<EarnSource[] | null>(null);
  const [multDraft, setMultDraft] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  // 상태 문구는 1분마다 다시 센다 (끝나는 시각이 지나면 저절로 "꺼져 있어요")
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const view = saved ?? loaded;
  const ev = view?.event ?? null;
  const on = pointEventOn(ev, now);
  const capsToday = isBoosted(earnBoostAt(ev, now));
  // 고를 칸·배수: 손대기 전에는 켜져 있는 이벤트 값 (없으면 전부·기본 배수)
  const picked = pickDraft ?? (on && ev ? ev.sources : [...BOOSTABLE_SOURCES]);
  const mult = multDraft ?? (on && ev ? ev.mult : POINT_EVENT_MULT);
  const toggle = (s: EarnSource, yes: boolean) => setPickDraft(BOOSTABLE_SOURCES.filter((x) => (x === s ? yes : picked.includes(x))));

  const send = async (turnOn: boolean) => {
    const endAt = turnOn && until ? fromInput(endInput) : null;
    if (turnOn && until && endAt === null) return toast("끝나는 시각을 골라 주세요.");
    if (turnOn && !picked.length) return toast("늘릴 항목을 하나 넘게 골라 주세요.");
    setPending(true);
    try {
      const r = await opsAdminApi.setPointEvent(turnOn ? { on: true, endAt, sources: picked, mult } : { on: false });
      setSaved(r);
      setPickDraft(null);
      setMultDraft(null);
      const t = Date.now();
      setNow(t);
      const e = r.event;
      toast(
        !turnOn || !e
          ? "포인트 이벤트를 껐어요."
          : `포인트 이벤트를 켰어요. ${pointEventListText(e.sources)} ${e.mult}배예요. ${e.endAt ? `${pointEventEndText(e.endAt, t)}까지예요.` : "끌 때까지 이어져요."}`,
      );
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onAuthLost();
      else toast(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={styles.notices} aria-label="포인트 배수 이벤트">
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>포인트 배수 이벤트</strong>
        </p>
        {view === null ? (
          <p className={ui.hint}>불러오는 중…</p>
        ) : (
          <>
            <p role="status">
              {on && ev
                ? `지금 켜져 있어요. ${pointEventListText(ev.sources)} ${ev.mult}배예요. ${
                    ev.endAt === null ? "끌 때까지 이어져요." : `${pointEventEndText(ev.endAt, now)}에 저절로 꺼져요.`
                  }`
                : capsToday
                  ? "꺼져 있어요. 오늘 늘어난 한도는 새벽 5시까지 그대로예요."
                  : "꺼져 있어요."}
            </p>
            {ev && (on || capsToday) && (
              <p className={ui.hint}>
                켠 시각 {KST.format(ev.startAt)}
                {ev.endAt !== null && <>, 끝 {KST.format(ev.endAt)}</>}
              </p>
            )}
            <form
              className={styles.pointsForm}
              onSubmit={(e) => {
                e.preventDefault();
                void send(true);
              }}
              aria-label="포인트 배수 이벤트 설정"
            >
              <fieldset className={styles.channels} disabled={pending} style={{ border: 0, margin: 0, padding: 0, flexBasis: "100%" }}>
                <legend className={styles.statLabel}>늘릴 항목</legend>
                <label className={styles.statLabel}>
                  <input type="checkbox" checked={allSources(picked)} onChange={(e) => setPickDraft(e.target.checked ? [...BOOSTABLE_SOURCES] : [])} /> <strong>전부</strong>
                </label>
                {BOOSTABLE_SOURCES.map((s) => (
                  <label key={s} className={styles.statLabel}>
                    <input type="checkbox" checked={picked.includes(s)} onChange={(e) => toggle(s, e.target.checked)} /> {earnRule(s).label}
                  </label>
                ))}
              </fieldset>
              <label className={styles.statLabel}>
                배수{" "}
                <select className={cx(ui.input)} value={mult} onChange={(e) => setMultDraft(Number(e.target.value))} disabled={pending}>
                  {POINT_EVENT_MULTS.map((m) => (
                    <option key={m} value={m}>
                      {m}배
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.statLabel}>
                <input type="checkbox" checked={until} onChange={(e) => setUntil(e.target.checked)} disabled={pending} /> 끝나는 시각 정하기
              </label>
              <input
                className={cx(ui.input)}
                type="datetime-local"
                value={endInput}
                onChange={(e) => setEndInput(e.target.value)}
                disabled={pending || !until}
                aria-label="끝나는 시각 (한국 시간)"
              />
              <button type="button" className={ui.button} onClick={() => setEndInput(toInput(nextWeekStartMs(Date.now())))} disabled={pending || !until}>
                다음 월요일 새벽 5시
              </button>
              <button type="button" className={ui.button} onClick={() => setEndInput(toInput(nextDayStartMs(Date.now())))} disabled={pending || !until}>
                내일 새벽 5시
              </button>
              <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !picked.length}>
                {on ? "바꾼 설정 저장" : "켜기"}
              </button>
              {on && (
                <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void send(false)} disabled={pending}>
                  지금 끄기
                </button>
              )}
            </form>
          </>
        )}
        <p className={ui.hint}>
          고른 항목은 켜져 있는 동안 적립이 배수로 들어오고, 이벤트가 걸친 날은 그 항목 하루 한도도 배수가 돼요. 하루 전체 한도는 늘어난 만큼만 커져요.
          중간에 꺼도 그날 새벽 5시까지는 늘어난 한도가 남아요. 켜 둔 채 항목에서 빼면 그 항목은 바로 원래대로예요.
          출석 달력 보상, 선물, 지갑 상한은 그대로예요. 시각은 한국 시간이에요. 켜고 끄고 바꿀 때마다 마을 전체 공지가 나가고, 게임 화면 위 안내 띠도 바로 바뀌어요. 정해 둔 시각에 끝나면 끝 공지도 한 번 나가요.
        </p>
      </div>
    </section>
  );
}
