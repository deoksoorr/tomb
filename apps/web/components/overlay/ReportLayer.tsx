"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { errorMessage } from "@/lib/api";
import { showToast } from "@/lib/hooks/useToasts";
import { reportStore, submitReport, useReportTarget, type ReportTarget } from "@/lib/reportClient";
import { REPORT_MEMO_MAX, USER_REPORT_REASON_LABELS, USER_REPORT_REASONS, type UserReportReason } from "@/lib/reports";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./ReportLayer.module.css";

type Menu = { sid: number; name: string; ch?: number; room?: string; x: number; y: number };
const MENU_W = 180;
const MENU_H = 96;

/**
 * 47번 게임 안 신고: 다른 사람 캐릭터(이름표)를 누르면 누른 자리 옆에 작은 메뉴 → "신고하기"(사유 + 메모 100자).
 * 확성기 창의 신고 버튼도 같은 신고 창을 연다 (reportStore.open)
 */
export default function ReportLayer() {
  const [menu, setMenu] = useState<Menu | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const target = useReportTarget();

  // 게임은 월드 좌표만 알려 주므로, 누른 화면 위치는 마지막 포인터 위치로 잡는다
  useEffect(() => {
    const onUp = (e: PointerEvent) => void (pointer.current = { x: e.clientX, y: e.clientY });
    window.addEventListener("pointerup", onUp, true);
    return () => window.removeEventListener("pointerup", onUp, true);
  }, []);
  useBridgeEvent("peer:menu", (m) => {
    const { x, y } = pointer.current;
    setMenu({ ...m, x: Math.max(8, Math.min(x + 8, window.innerWidth - MENU_W - 8)), y: Math.max(8, Math.min(y - 12, window.innerHeight - MENU_H - 8)) });
  });
  // 메뉴 밖을 누르거나 ESC면 닫는다
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector("button")?.focus({ preventScroll: true });
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    const t = setTimeout(() => window.addEventListener("pointerdown", onDown, true), 0);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <>
      {menu && (
        <div ref={menuRef} className={styles.menu} style={{ left: menu.x, top: menu.y }} role="menu" aria-label={`${menu.name} 메뉴`}>
          <p className={styles.menuName}>{menu.name}</p>
          <button
            type="button"
            role="menuitem"
            className={cx(ui.button, styles.menuItem)}
            onClick={() => {
              reportStore.open({ type: "user", name: menu.name, sid: menu.sid, ch: menu.ch, room: menu.room });
              setMenu(null);
            }}
          >
            신고하기
          </button>
          <button type="button" role="menuitem" className={cx(ui.button, ui.quiet, styles.menuItem)} onClick={() => setMenu(null)}>
            닫기
          </button>
        </div>
      )}
      {target && <ReportDialog target={target} onDone={showToast} />}
    </>
  );
}

function ReportDialog({ target, onDone }: { target: ReportTarget; onDone: (message: string) => void }) {
  const [reason, setReason] = useState<UserReportReason | null>(null);
  const [memo, setMemo] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = () => reportStore.close();
  const reasons = target.type === "megaphone" ? USER_REPORT_REASONS.filter((r) => r !== "nickname") : USER_REPORT_REASONS;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!reason) return setError("신고 사유를 골라 주세요.");
    setPending(true);
    setError(null);
    try {
      await submitReport(target, reason, memo.trim());
      close();
      onDone("신고를 보냈어요. 운영자가 확인할게요.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog kind="confirm" title={target.type === "user" ? "유저 신고" : "확성기 신고"} onClose={close} closable={!pending}>
      <form className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={styles.who}>
          <strong>{target.name}</strong>
          {target.type === "megaphone" && <span className={styles.quote}>「{target.text}」</span>}
        </p>
        <fieldset className={styles.reasons}>
          <legend className={ui.hint}>신고 사유</legend>
          {reasons.map((r) => (
            <label key={r} className={styles.reason}>
              <input type="radio" name="report-reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
              {USER_REPORT_REASON_LABELS[r]}
            </label>
          ))}
        </fieldset>
        <label className={ui.field}>
          <span className={ui.label}>
            메모 (선택, {[...memo].length}/{REPORT_MEMO_MAX})
          </span>
          <textarea
            className={cx(ui.input, styles.memo)}
            value={memo}
            maxLength={REPORT_MEMO_MAX}
            rows={3}
            onChange={(e) => setMemo([...e.target.value].slice(0, REPORT_MEMO_MAX).join(""))}
            placeholder="무슨 일이 있었는지 짧게 적어 주세요."
          />
        </label>
        <p className={ui.hint}>같은 사람은 하루에 한 번 신고할 수 있어요.</p>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.buttons}>
          <button type="submit" className={cx(ui.button, ui.danger)} disabled={pending || !reason}>
            신고하기
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={close} disabled={pending}>
            그만두기
          </button>
        </div>
      </form>
    </Dialog>
  );
}
