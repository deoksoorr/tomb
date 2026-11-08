"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { DECOR_DURATION_MS, graveTier, itemById, MAX_DECOR_PER_GRAVE } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { api, ApiRequestError, errorMessage, isAbortError } from "@/lib/api";
import { lifespanLabel } from "@/lib/epitaph";
import { REPORT_REASON_LABELS, REPORT_REASONS, type ReportReason } from "@/lib/reports";
import type { GravesState } from "@/lib/hooks/useGraves";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { forgetOwnerToken, getOwnerToken } from "@/lib/storage";
import { CAUSE_LABELS, type PublicGrave } from "@/lib/types";
import { decorateGrave } from "../account/actions";
import { bagEntries, durationLabel, pointsText, remainingLabel } from "../account/items";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import GraveArt from "./GraveArt";
import { graveLocation } from "./location";
import styles from "./GraveModal.module.css";

type Action = "flower" | "revive" | "share" | "report" | "remove" | "decorate";
/** 상세 응답에서 온 "나와의 관계". isMine: 내 계정이 세운 묘비 */
type Mine = { revived: boolean; floweredToday: boolean; isMine: boolean };

type Props = {
  graveId: string;
  graves: GravesState;
  onClose: () => void;
  /** ownerToken은 계정 개편 전 묘비용. 내 계정 묘비면 null이어도 된다 */
  onEdit: (grave: PublicGrave, ownerToken: string | null) => void;
};

const withPoints = (message: string, earned: number | undefined) => {
  const points = pointsText(earned);
  return points ? `${message} · ${points}` : message;
};

/** http(s) 링크만, 보이는 글자는 호스트+경로 */
function safeLinks(links: readonly string[] | undefined): { href: string; label: string }[] {
  return (links ?? []).flatMap((href) => {
    try {
      const url = new URL(href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return [];
      return [{ href: url.href, label: (url.host + url.pathname).replace(/\/$/, "") }];
    } catch {
      return [];
    }
  });
}

export default function GraveModal({ graveId, graves, onClose, onEdit }: Props) {
  const { cache } = graves;
  const grave = graves.byId.get(graveId);
  const [mine, setMine] = useState<Mine | null>(null);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState<Partial<Record<Action, boolean>>>({});
  const [confirming, setConfirming] = useState<"report" | "remove" | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>("other");
  const [notice, setNotice] = useState<string | null>(null);
  const [ownerToken] = useState(() => getOwnerToken(graveId));
  const [decorating, setDecorating] = useState(false);
  const { me } = useMe();
  const canManage = ownerToken !== null || mine?.isMine === true;
  // 화면에 그릴 때 기준 시각 (남은 기간 표시용, 렌더 중에 시계를 읽지 않게 열 때 한 번)
  const [openedAt] = useState(() => Date.now());

  // 열 때마다 상세를 다시 받는다: 내 반응 여부 + 최신 카운트
  useEffect(() => {
    const ctrl = new AbortController();
    cache
      .refresh(graveId, ctrl.signal)
      .then((detail) => {
        if (!detail) setMissing(true);
        else setMine({ revived: detail.myRevive, floweredToday: detail.myFlowerToday, isMine: detail.isMine });
      })
      .catch((e: unknown) => {
        if (!isAbortError(e)) setNotice(errorMessage(e));
      });
    return () => ctrl.abort();
  }, [cache, graveId]);

  async function run(action: Action, task: () => Promise<void>) {
    if (pending[action]) return;
    setPending((p) => ({ ...p, [action]: true }));
    setNotice(null);
    try {
      await task();
    } catch (e) {
      setNotice(errorMessage(e));
    } finally {
      setPending((p) => ({ ...p, [action]: false }));
    }
  }

  const flower = () =>
    run("flower", async () => {
      try {
        const { count, earned } = await api.flower(graveId);
        cache.patch(graveId, { flowers: count });
        setMine((m) => m && { ...m, floweredToday: true });
        meStore.addEarned(earned);
        bridge.emit("grave:flowered", { graveId });
        setNotice(withPoints("꽃을 놓았어요.", earned));
      } catch (e) {
        // 오늘 이미 헌화함
        if (e instanceof ApiRequestError && e.status === 409) setMine((m) => m && { ...m, floweredToday: true });
        throw e;
      }
    });

  // 낙관적 토글: 먼저 바꿔 보여 주고, 실패하면 되돌린다
  const revive = () =>
    run("revive", async () => {
      if (!grave || !mine) return;
      const before = { revived: mine.revived, count: grave.revives };
      const next = !mine.revived;
      setMine({ ...mine, revived: next });
      cache.patch(graveId, { revives: Math.max(0, before.count + (next ? 1 : -1)) });
      try {
        const res = await api.revive(graveId);
        setMine((m) => m && { ...m, revived: res.revived });
        cache.patch(graveId, { revives: res.count });
        meStore.addEarned(res.earned);
        bridge.emit("grave:revived", { graveId, revived: res.revived });
        const points = pointsText(res.earned);
        if (points) setNotice(points);
      } catch (e) {
        setMine((m) => m && { ...m, revived: before.revived });
        cache.patch(graveId, { revives: before.count });
        throw e;
      }
    });

  const share = () =>
    run("share", async () => {
      const url = `${window.location.origin}/?grave=${encodeURIComponent(graveId)}`;
      try {
        await navigator.clipboard.writeText(url);
        setNotice("링크를 복사했어요.");
      } catch {
        setNotice(`이 주소를 복사해 주세요: ${url}`);
      }
    });

  const report = () =>
    run("report", async () => {
      setConfirming(null);
      await api.report(graveId, reportReason);
      setNotice("신고를 받았어요. 살펴볼게요.");
    });

  const remove = () =>
    run("remove", async () => {
      if (!canManage) return;
      setConfirming(null);
      await api.deleteGrave(graveId, ownerToken);
      forgetOwnerToken(graveId);
      cache.remove(graveId);
      bridge.emit("grave:changed", { graveId, kind: "removed" });
      showToast("묘비를 이장했어요.");
      onClose();
    });

  const decorate = (itemId: string) =>
    run("decorate", async () => {
      await decorateGrave(itemId, graveId, cache);
      setDecorating(false);
      setNotice(`${itemById(itemId)?.name ?? "꾸미기"}을(를) 놓았어요.`);
    });

  // 상세를 한 번 받은 뒤 목록에서 사라졌으면(이장·숨김) 더는 보여 줄 것이 없다
  if (!grave || missing) {
    const gone = missing || mine !== null;
    return (
      <Dialog title="묘비" onClose={onClose}>
        <p className={styles.state} role="status">
          {gone ? "이장되었거나 찾을 수 없는 묘비예요." : (notice ?? "묘비를 살피는 중…")}
        </p>
      </Dialog>
    );
  }

  const links = safeLinks(grave.links);
  const decor = grave.decor ?? [];
  const decorInBag = me ? bagEntries(me.inventory, "decor") : [];
  const location = graveLocation(graves.graves, graves.reviveTop, graveId);

  function goToGrave() {
    bridge.emit("grave:focus", { graveId, teleport: true });
    onClose();
  }

  return (
    <Dialog title={grave.name} onClose={onClose}>
      <article className={styles.grave}>
        <figure className={styles.photo}>
          {grave.imageUrl ? (
            <Image
              src={grave.imageUrl}
              alt={`${grave.name} 스크린샷`}
              fill
              unoptimized
              sizes="(max-width: 460px) 100vw, 420px"
              className={styles.photoImage}
            />
          ) : (
            <div className={styles.noPhoto}>
              <GraveArt tier={graveTier(grave.ageDays)} flowers={grave.flowers} scale={4} />
              <figcaption>사진 없음</figcaption>
            </div>
          )}
        </figure>

        <p className={styles.epitaph}>{grave.epitaph}</p>
        <p className={styles.lifespan}>{lifespanLabel(grave.bornAt, grave.diedAt, grave.ageDays)}</p>

        <dl className={styles.facts}>
          {location && (
            <div>
              <dt>위치</dt>
              <dd className={styles.location}>
                <span>{location}</span>
                <button type="button" className={cx(ui.button, styles.goTo)} onClick={goToGrave}>
                  이 묘비 앞으로 가기
                </button>
              </dd>
            </div>
          )}
          <div>
            <dt>사인</dt>
            <dd>
              <ul className={styles.tags}>
                {grave.causes.map((c) => (
                  <li key={c} className={ui.tag}>
                    {CAUSE_LABELS[c] ?? c}
                  </li>
                ))}
              </ul>
              {grave.causeDetail && <p className={styles.detail}>{grave.causeDetail}</p>}
            </dd>
          </div>
          {grave.lastTask && (
            <div>
              <dt>마지막으로 하던 일</dt>
              <dd>{grave.lastTask}</dd>
            </div>
          )}
          <div>
            <dt>상주</dt>
            <dd>{grave.mourner}</dd>
          </div>
          {decor.length > 0 && (
            <div>
              <dt>꾸밈</dt>
              <dd>
                <ul className={styles.tags}>
                  {decor.map((d) => (
                    <li key={d.itemId} className={ui.tag}>
                      {itemById(d.itemId)?.name ?? d.itemId} · {remainingLabel(d.until, openedAt)}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
          {links.length > 0 && (
            <div>
              <dt>링크</dt>
              <dd className={styles.links}>
                {links.map((l) => (
                  <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                ))}
              </dd>
            </div>
          )}
          {grave.stack && grave.stack.length > 0 && (
            <div>
              <dt>기술 스택</dt>
              <dd>
                <ul className={styles.tags}>
                  {grave.stack.map((s) => (
                    <li key={s} className={ui.tag}>
                      {s}
                    </li>
                  ))}
                </ul>
              </dd>
            </div>
          )}
        </dl>

        <div className={styles.reactions}>
          <button
            type="button"
            className={cx(ui.button, styles.reaction)}
            onClick={flower}
            disabled={!mine || mine.floweredToday || pending.flower}
          >
            🌼 {mine?.floweredToday ? "오늘 헌화했어요" : "헌화하기"} ({grave.flowers})
          </button>
          <button
            type="button"
            className={cx(ui.button, styles.reaction)}
            onClick={revive}
            disabled={!mine}
            aria-pressed={mine?.revived ?? false}
          >
            🙏 이건 살려주세요 ({grave.revives})
          </button>
        </div>

        {confirming ? (
          <div className={styles.confirm} role="group" aria-label="확인">
            <p>{confirming === "report" ? "이 묘비를 신고할까요?" : "이 묘비를 이장(삭제)할까요? 되돌릴 수 없어요."}</p>
            {confirming === "report" && (
              <fieldset className={styles.reasons}>
                <legend className={ui.hint}>신고 사유</legend>
                {REPORT_REASONS.map((r) => (
                  <label key={r} className={styles.reason}>
                    <input
                      type="radio"
                      name="report-reason"
                      value={r}
                      checked={reportReason === r}
                      onChange={() => setReportReason(r)}
                    />
                    {REPORT_REASON_LABELS[r]}
                  </label>
                ))}
              </fieldset>
            )}
            <div className={styles.confirmButtons}>
              <button
                type="button"
                className={cx(ui.button, ui.danger)}
                onClick={confirming === "report" ? report : remove}
                autoFocus
              >
                {confirming === "report" ? "신고하기" : "이장하기"}
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirming(null)}>
                그만두기
              </button>
            </div>
          </div>
        ) : (
          <div className={styles.secondary}>
            <button type="button" className={cx(ui.button, ui.quiet)} onClick={share}>
              공유
            </button>
            <button
              type="button"
              className={cx(ui.button, ui.quiet)}
              onClick={() => setConfirming("report")}
              disabled={pending.report}
            >
              신고
            </button>
            {canManage && (
              <>
                <button
                  type="button"
                  className={cx(ui.button, ui.quiet)}
                  onClick={() => setDecorating((v) => !v)}
                  aria-expanded={decorating}
                >
                  꾸미기
                </button>
                <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => onEdit(grave, ownerToken)}>
                  수정
                </button>
                <button
                  type="button"
                  className={cx(ui.button, ui.quiet, ui.danger)}
                  onClick={() => setConfirming("remove")}
                  disabled={pending.remove}
                >
                  이장(삭제)
                </button>
              </>
            )}
          </div>
        )}

        {decorating && !confirming && (
          <div className={styles.decorPicker}>
            {decor.length >= MAX_DECOR_PER_GRAVE ? (
              <p>묘비 하나에는 {MAX_DECOR_PER_GRAVE}개까지 놓을 수 있어요. 기간이 끝나면 다시 놓을 수 있어요.</p>
            ) : decorInBag.length === 0 ? (
              <p>가방에 묘비 꾸미기가 없어요. 상점에서 살 수 있어요.</p>
            ) : (
              <>
                <p className={ui.hint}>
                  놓는 순간 가방에서 사라지고 {durationLabel(DECOR_DURATION_MS)} 동안 이 묘비에 남아요.
                </p>
                <div className={styles.decorChoices}>
                  {decorInBag.map(({ item, count }) => (
                    <button
                      key={item.id}
                      type="button"
                      className={ui.button}
                      onClick={() => decorate(item.id)}
                      disabled={pending.decorate}
                    >
                      {item.name} 놓기 ({count})
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <p className={styles.notice} role="status">
          {notice}
        </p>
      </article>
    </Dialog>
  );
}
