"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { titleNews } from "@/lib/hooks/useTitleNews";
import { showToast } from "@/lib/hooks/useToasts";
import { playTitleChime } from "@/lib/titleChime";
import { titleDef, type TitleDef } from "@/lib/titles";
import { wearTitle } from "../account/actions";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./TitleNotice.module.css";

/** 내 정보가 바뀐 뒤 확인까지 기다리는 시간 (도감 등록·1위 지급 결과가 한꺼번에 들어오게) */
const SETTLE_MS = 2500;
/** 연달아 확인하지 않는 최소 간격 */
const MIN_GAP_MS = 10_000;
/** 화면이 보이는 동안 이만큼마다 한 번 (집 점수처럼 내 정보가 안 바뀌는 칭호도 잡게) */
const POLL_MS = 4 * 60_000;

/**
 * 새 칭호 알림: 칭호를 새로 얻으면 금빛 테두리 짧은 창 "새 칭호 「…」를 얻었어요!" + [지금 달기] [나중에] + 반짝 소리.
 * 판정은 서버(GET /api/me/titles의 fresh = 얻었는데 아직 알리지 않은 칭호). 여러 개면 한 번에 묶는다.
 * 기능 전부터 얻어 둔 칭호(처음 확인, first)는 "칭호가 n개 생겼어요"로 한 번만 묶어 알린다.
 * 확인 시점: 처음 마을에 들어올 때 · 내 정보가 바뀐 뒤(도감 등록 포인트·1위 지급 등) · 서버 신호(me:stale) · 집 꾸미기 저장 뒤 ·
 * 화면으로 돌아올 때 · 몇 분마다. 알림 창을 띄운 칭호는 서버에 "알림" 기록을 남겨 다른 탭·기기에서 다시 뜨지 않는다.
 * 가방 [칭호] 칸에서 아직 안 본 칭호(unseen)는 titleNews로 넘겨 가방 단추 점·"새로!" 표시에 쓴다
 */
export default function TitleNotice() {
  const { me } = useMe();
  const ready = !!me;
  const [notice, setNotice] = useState<{ titles: TitleDef[]; first: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const shown = useRef(new Set<string>());

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    let busy = false;
    let lastAt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = async (): Promise<void> => {
      if (busy || !alive) return;
      busy = true;
      lastAt = Date.now();
      try {
        const r = await api.titles();
        if (!alive) return;
        titleNews.set(r.unseen);
        // 처음 확인인데 얻어 둔 칭호가 없으면 기록만 남긴다 (다음에 얻는 칭호는 "새 칭호"로 하나씩)
        if (r.first && !r.fresh.length) void api.titleMarks({ announced: [] }).catch(() => undefined);
        const fresh = r.fresh.filter((id) => !shown.current.has(id));
        const defs = fresh.map((id) => titleDef(id)).filter((t): t is TitleDef => !!t);
        if (defs.length) {
          for (const id of fresh) shown.current.add(id);
          setNotice((cur) => (cur ? { titles: [...cur.titles, ...defs], first: cur.first && r.first } : { titles: defs, first: r.first }));
          playTitleChime();
          void api.titleMarks({ announced: fresh }).catch(() => undefined);
        }
      } catch {
        // 다음 확인 때 다시
      } finally {
        busy = false;
      }
    };
    /** 잠시 뒤에 한 번 (몰아서 바뀌면 마지막 것 기준, 최소 간격 지키기) */
    const soon = (ms = SETTLE_MS) => {
      clearTimeout(timer);
      timer = setTimeout(() => void check(), Math.max(ms, lastAt + MIN_GAP_MS - Date.now()));
    };
    void check();
    // 포인트·착용·1위 값이 바뀌면 (도감 등록 보상·1위 지급·자동 낚시 정산 뒤) 잠시 뒤 확인
    let prev = meStore.getSnapshot().me;
    const offMe = meStore.subscribe(() => {
      const cur = meStore.getSnapshot().me;
      if (cur && prev && (cur.lifetimePoints !== prev.lifetimePoints || cur.champ !== prev.champ)) soon();
      prev = cur;
    });
    const offStale = bridge.on("me:stale", () => soon(SETTLE_MS));
    const offHouse = bridge.on("house:data", () => soon(SETTLE_MS));
    const poll = setInterval(() => document.visibilityState === "visible" && void check(), POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && soon(500);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(poll);
      offMe();
      offStale();
      offHouse();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready]);

  if (!notice) return null;
  const close = () => setNotice(null);
  const first = notice.titles[0];
  const many = notice.titles.length > 1;
  const heading = notice.first
    ? many
      ? `칭호가 ${notice.titles.length}개 생겼어요!`
      : `칭호 「${first.name}」가 생겼어요!`
    : many
      ? `새 칭호 ${notice.titles.length}개를 얻었어요!`
      : `새 칭호 「${first.name}」를 얻었어요!`;
  const wearNow = async () => {
    setPending(true);
    try {
      await wearTitle(first.id);
      showToast(`칭호 「${first.name}」을(를) 달았어요. 머리 위에 보여요.`);
      close();
    } catch (e) {
      showToast(errorMessage(e));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog kind="confirm" title="새 칭호" onClose={close}>
      <div className={styles.body}>
        <p className={styles.lead}>
          <span className={styles.spark} aria-hidden="true">
            ✦
          </span>
          {heading}
        </p>
        <ul className={styles.list}>
          {notice.titles.map((t) => (
            <li key={t.id}>
              <b className={styles.name}>「{t.name}」</b>
              <span className={styles.how}>{t.how.replace(/(하)?면$/, "")}</span>
            </li>
          ))}
        </ul>
        <p className={styles.note}>가방 [칭호]에서 언제든 바꿔 달 수 있어요. 단 칭호는 머리 위 이름표 위에 보여요.</p>
        <div className={styles.actions}>
          <button type="button" className={cx(ui.button, ui.primary)} disabled={pending} onClick={() => void wearNow()}>
            {many ? `「${first.name}」 지금 달기` : "지금 달기"}
          </button>
          <button type="button" className={ui.button} onClick={close}>
            나중에
          </button>
        </div>
      </div>
    </Dialog>
  );
}
