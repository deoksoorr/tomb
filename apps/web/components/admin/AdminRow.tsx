"use client";

import Image from "next/image";
import { itemById } from "@tomb/protocol";
import type { AdminGrave } from "@/lib/admin";
import { lifespanLabel } from "@/lib/epitaph";
import { REPORT_REASON_LABELS } from "@/lib/reports";
import { CAUSE_LABELS } from "@/lib/types";
import type { AdminAction } from "@/lib/validate";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Admin.module.css";

type Props = {
  grave: AdminGrave;
  expanded: boolean;
  selected: boolean;
  busy: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onAction: (action: AdminAction) => void;
};

const pad = (n: number) => String(n).padStart(2, "0");
function formatDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}
function formatDateTime(ms: number): string {
  const d = new Date(ms);
  return `${formatDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 신고 수가 있거나 초기화하지 않은 신고 기록이 있으면 "신고됨" */
export const isReported = (g: AdminGrave) => g.reports > 0 || g.reportLog.length > 0;

export default function AdminRow({ grave: g, expanded, selected, busy, onToggleExpand, onToggleSelect, onAction }: Props) {
  const detailsId = `admin-grave-${g.id}`;
  return (
    <li className={cx(styles.row, g.hidden && styles.rowHidden)}>
      <div className={styles.rowMain}>
        <input
          type="checkbox"
          className={styles.check}
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`${g.name} 선택`}
        />
        {g.imageUrl ? (
          <Image className={styles.thumb} src={g.imageUrl} alt="" width={48} height={48} unoptimized />
        ) : (
          <span className={styles.thumb} aria-hidden="true">
            사진 없음
          </span>
        )}
        <button
          type="button"
          className={styles.rowButton}
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={onToggleExpand}
        >
          <span className={styles.name}>{g.name}</span>
          <span className={styles.meta}>
            {g.mourner} · {formatDate(g.createdAt)}
          </span>
          <span className={styles.meta}>
            🌼 {g.flowers} · 🙏 {g.revives} ·{" "}
            <span className={cx(isReported(g) && styles.alert)}>
              신고 {g.reports}
              {g.reportLog.length > g.reports && ` (기록 ${g.reportLog.length})`}
            </span>
          </span>
        </button>
        <span className={cx(styles.badge, g.hidden ? styles.badgeHidden : styles.badgeOpen)}>
          {g.hidden ? "숨김" : "공개"}
        </span>
      </div>

      {expanded && (
        <div id={detailsId} className={styles.details}>
          {g.imageUrl && <Image className={styles.photo} src={g.imageUrl} alt={`${g.name} 스크린샷`} width={320} height={180} unoptimized />}
          <dl className={styles.facts}>
            <dt>묘비명</dt>
            <dd>{g.epitaph}</dd>
            <dt>생존 기간</dt>
            <dd>{lifespanLabel(g.bornAt, g.diedAt, g.ageDays)}</dd>
            {g.lastTask && (
              <>
                <dt>마지막 작업</dt>
                <dd>{g.lastTask}</dd>
              </>
            )}
            <dt>사인</dt>
            <dd>
              {g.causes.map((c) => CAUSE_LABELS[c]).join(", ")}
              {g.causeDetail && <p className={styles.detailText}>{g.causeDetail}</p>}
            </dd>
            {g.links?.length ? (
              <>
                <dt>링크</dt>
                <dd className={styles.linkList}>
                  {g.links.map((href) => (
                    <a key={href} href={href} target="_blank" rel="noopener noreferrer nofollow">
                      {href}
                    </a>
                  ))}
                </dd>
              </>
            ) : null}
            {g.stack?.length ? (
              <>
                <dt>기술 스택</dt>
                <dd className={styles.tags}>
                  {g.stack.map((t) => (
                    <span key={t} className={ui.tag}>
                      {t}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            {g.decor?.length ? (
              <>
                <dt>꾸미기</dt>
                <dd className={styles.tags}>
                  {g.decor.map((d) => (
                    <span key={`${d.itemId}-${d.until}`} className={ui.tag}>
                      {itemById(d.itemId)?.name ?? d.itemId} · ~{formatDate(d.until)}
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
            <dt>id</dt>
            <dd>
              <code>{g.id}</code> ·{" "}
              <a href={`/?grave=${encodeURIComponent(g.id)}`} target="_blank" rel="noopener noreferrer">
                묘지에서 보기
              </a>
            </dd>
          </dl>

          <section className={styles.logSection} aria-label="신고 기록">
            <h3 className={styles.subTitle}>신고 기록</h3>
            {g.reportLog.length ? (
              <ol className={styles.log}>
                {g.reportLog.map((e, i) => (
                  <li key={`${e.at}-${i}`}>
                    <time dateTime={new Date(e.at).toISOString()}>{formatDateTime(e.at)}</time>
                    {REPORT_REASON_LABELS[e.reason]}
                  </li>
                ))}
              </ol>
            ) : (
              <p className={ui.hint}>신고 기록이 없어요.</p>
            )}
            {g.reports === 0 && g.reportLog.length > 0 && (
              <p className={ui.hint}>숨김을 풀면서 신고 수는 0으로 돌아갔어요. 기록만 남아 있어요.</p>
            )}
          </section>

          <div className={styles.actions}>
            <button type="button" className={ui.button} disabled={busy} onClick={() => onAction(g.hidden ? "unhide" : "hide")}>
              {g.hidden ? "다시 공개" : "숨기기"}
            </button>
            <button
              type="button"
              className={ui.button}
              disabled={busy || !isReported(g)}
              onClick={() => onAction("resetReports")}
            >
              신고 초기화
            </button>
            <button type="button" className={cx(ui.button, ui.danger)} disabled={busy} onClick={() => onAction("delete")}>
              삭제
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
