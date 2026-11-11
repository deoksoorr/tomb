"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AdminPassed } from "@/lib/admin";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { MAX_PASS_DAYS, MIN_PASS_DAYS, type PassReason } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void; onChanged: () => void };

const REASONS: Record<PassReason, string> = { time: "기간", full: "묘역 가득", one: "1인 1묘비 정리" };
const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 콘텐츠 탭의 성불: 성불 기간 설정 + 성불한 묘비 목록(숨김 포함, 검색, 완전 삭제) */
export default function PassedPanel({ toast, onAuthLost, onChanged }: Props) {
  const [version, setVersion] = useState(0);
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<AdminPassed | null>(null);
  const [busy, setBusy] = useState(false);
  const settings = usePanelData(() => adminApi.graveSettings(), [version], toast, onAuthLost);
  const data = usePanelData(() => adminApi.passed(q, 0), [q, version], toast, onAuthLost);
  const [days, setDays] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await adminApi.setGraveSettings(Number(days));
      toast(`성불 기간을 ${r.passDays}일로 바꿨어요.${r.passedNow ? ` 지금 ${r.passedNow}개가 성불했어요.` : ""}`);
      setDays("");
      setVersion((v) => v + 1);
      onChanged();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: AdminPassed) => {
    setConfirm(null);
    setBusy(true);
    try {
      await adminApi.deletePassed(p.id);
      toast(`「${p.name}」을(를) 완전히 지웠어요.`);
      setVersion((v) => v + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const n = Number(days);
  const validDays = Number.isInteger(n) && n >= MIN_PASS_DAYS && n <= MAX_PASS_DAYS;

  return (
    <section className={styles.notices} aria-label="성불">
      <form className={styles.pointsForm} onSubmit={(e) => void save(e)} aria-label="성불 기간">
        <span className={styles.statLabel}>
          성불 기간 {settings ? `${settings.passDays}일` : "…"} · 묘역 정원 채널마다 {settings?.capacity ?? "…"}개
        </span>
        <input
          className={cx(ui.input, styles.pointsDelta)}
          type="number"
          inputMode="numeric"
          min={MIN_PASS_DAYS}
          max={MAX_PASS_DAYS}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder="일"
          aria-label="새 성불 기간(일)"
        />
        <button type="submit" className={ui.button} disabled={busy || !validDays}>
          바꾸기
        </button>
      </form>
      <p className={ui.hint}>
        세운 뒤 이 기간이 지나면 성불해요(규칙을 켜기 전에 세운 묘비는 켠 날부터 셉니다). 줄이면 지난 묘비가 바로 성불해요.
      </p>

      <div className={styles.toolbar}>
        <input
          type="search"
          className={cx(ui.input, styles.search)}
          placeholder="이름·묘비명·상주 검색"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="성불한 묘비 검색"
        />
        <span className={styles.meta}>{data ? `${data.total}개` : "…"}</span>
      </div>
      {!data && <p className={styles.empty}>불러오는 중…</p>}
      {data && !data.entries.length && <p className={styles.empty}>성불한 묘비가 없어요.</p>}
      <ul className={styles.list}>
        {data?.entries.map((p) => (
          <li key={p.id} className={styles.notice}>
            <div className={styles.noticeTitle}>
              <strong>{p.name}</strong>
              {p.hidden && <span className={cx(styles.badge, styles.badgeHidden)}>숨김</span>}
              <span className={styles.meta}>
                {p.channel}채널 · 상주 {p.mourner} · 🌼 {p.flowers} · {when(p.passedAt)} 성불({REASONS[p.reason]})
              </span>
            </div>
            <p className={styles.noticeBody}>{p.epitaph}</p>
            <div className={styles.segmented}>
              <button type="button" className={cx(ui.button, ui.quiet, ui.danger)} onClick={() => setConfirm(p)} disabled={busy}>
                완전 삭제
              </button>
            </div>
          </li>
        ))}
      </ul>
      {data?.next !== null && data?.next !== undefined && <p className={ui.hint}>최근 100개만 보여요. 검색으로 좁혀 주세요.</p>}

      {confirm && (
        <Dialog title="성불한 묘비 삭제" size="sm" onClose={() => setConfirm(null)}>
          <div className={styles.confirm}>
            <p>「{confirm.name}」을(를) 성불 목록에서도 완전히 지울까요? 사진도 함께 지워지고 되돌릴 수 없어요.</p>
            <div className={styles.actions}>
              <button type="button" className={cx(ui.button, ui.danger)} autoFocus onClick={() => void remove(confirm)}>
                삭제하기
              </button>
              <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirm(null)}>
                그만두기
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </section>
  );
}
