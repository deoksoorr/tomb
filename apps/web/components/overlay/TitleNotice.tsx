"use client";

import { useEffect, useRef, useState } from "react";
import { bridge } from "@/game/bridge";
import { api, errorMessage } from "@/lib/api";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { titleNews } from "@/lib/hooks/useTitleNews";
import { onVisibleAgain, tabHidden } from "@/lib/hooks/visibleAgain";
import { showToast } from "@/lib/hooks/useToasts";
import { playTitleChime } from "@/lib/titleChime";
import { perkText, TITLE_GRADE_NAMES, titleDef, type TitleDef } from "@/lib/titles";
import { wearTitle } from "../account/actions";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./TitleNotice.module.css";

/** 신호(me:stale·집 저장) 뒤 확인까지 기다리는 시간 (결과가 한꺼번에 들어오게) */
const SETTLE_MS = 2500;
/** 포인트가 바뀌어도(도감 등록 보상 등) 이 간격 안에는 다시 확인하지 않는다 (Redis 명령 절약 — 서버도 칭호 사실을 몇 분 기억한다) */
const POINTS_GAP_MS = 10 * 60_000;
/** 신호로 확인할 때도 이 간격은 둔다 */
const MIN_GAP_MS = 20_000;
/** 안전망: 화면이 보이는 동안 이만큼마다 한 번 (집 점수처럼 신호가 없는 칭호도 잡게). 숨긴 탭은 멈춘다 */
const SAFETY_MS = 30 * 60_000;

/**
 * 새 칭호 알림: 칭호를 새로 얻으면 금빛 테두리 짧은 창 "새 칭호 「…」를 얻었어요!" + [지금 달기] [나중에] + 반짝 소리.
 * 판정은 서버(GET /api/me/titles의 fresh = 얻었는데 아직 알리지 않은 칭호). 여러 개면 한 번에 묶는다.
 * 기능 전부터 얻어 둔 칭호(처음 확인, first)는 "칭호가 n개 생겼어요"로 한 번만 묶어 알린다.
 * 확인 시점 (Redis 명령 아끼기 — 숨긴 탭은 하지 않는다): 처음 마을에 들어올 때 · 서버 신호(me:stale — 1위 지급 등) · 집 꾸미기 저장 뒤 ·
 * 1위 값이 바뀐 뒤 · 포인트가 바뀐 뒤(도감 등록 보상 등, 마지막 확인에서 10분 지났을 때만) · 숨겼다 돌아올 때(10분 지났으면) · 30분 안전망. 알림 창을 띄운 칭호는 서버에 "알림" 기록을 남겨 다른 탭·기기에서 다시 뜨지 않는다.
 * 가방 [칭호] 칸에서 아직 안 본 칭호(unseen)는 titleNews로 넘겨 가방 단추 점·"NEW" 표시에 쓴다
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
    /** 잠시 뒤에 한 번 (몰아서 바뀌면 마지막 것 기준, 최소 간격 지키기). 숨긴 탭이면 하지 않는다 */
    const soon = (ms = SETTLE_MS, gap = MIN_GAP_MS) => {
      if (tabHidden()) return;
      clearTimeout(timer);
      timer = setTimeout(() => !tabHidden() && void check(), Math.max(ms, lastAt + gap - Date.now()));
    };
    if (!tabHidden()) void check();
    // 포인트·1위 값이 바뀌면 (도감 등록 보상·1위 지급 뒤) — 단, 마지막 확인에서 POINTS_GAP_MS가 지났을 때만
    let prev = meStore.getSnapshot().me;
    const offMe = meStore.subscribe(() => {
      const cur = meStore.getSnapshot().me;
      if (cur && prev && cur.champ !== prev.champ) soon();
      else if (cur && prev && cur.lifetimePoints !== prev.lifetimePoints && Date.now() - lastAt >= POINTS_GAP_MS) soon(SETTLE_MS, POINTS_GAP_MS);
      prev = cur;
    });
    const offStale = bridge.on("me:stale", () => soon());
    const offHouse = bridge.on("house:data", () => soon());
    const safety = setInterval(() => !tabHidden() && Date.now() - lastAt >= SAFETY_MS && void check(), 60_000);
    // 숨겼다 돌아오면 (흩어서) 오래됐을 때만
    const offVisible = onVisibleAgain(() => Date.now() - lastAt >= POINTS_GAP_MS && void check());
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(safety);
      offMe();
      offStale();
      offHouse();
      offVisible();
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
              <b className={styles.name} data-grade={t.grade}>
                <span className={styles.grade}>{TITLE_GRADE_NAMES[t.grade]}</span> 「{t.name}」
              </b>
              <span className={styles.how}>{t.how.replace(/(하)?면$/, "")}</span>
              {perkText(t.grade) && <span className={styles.perk}>칭호 능력: {perkText(t.grade)}</span>}
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
