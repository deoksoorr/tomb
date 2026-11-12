"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { AdminAccountRow as AccountRow } from "@/app/api/admin/accounts/search/route";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { BALANCE_CAP, CODE_RE, normalizeCode } from "@/lib/economy";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import { BanDialog, BanList, KickButton, type BanTarget } from "./BanPanel";
import styles from "./Admin.module.css";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  /** 47번 신고 탭의 "정지로 이동": 이 대상으로 정지 창을 바로 연다 (열고 나면 onBanPresetUsed) */
  banPreset?: BanTarget | null;
  onBanPresetUsed?: () => void;
};

/**
 * 48번 회원 탭: 닉네임으로 계정 찾기 → 코드 재발급(분실 문의), 포인트 지급·회수.
 * 47번: 찾은 계정마다 [지금 내보내기]·[정지], IP로 바로 차단, 정지·차단 목록(기간 수정·조기 해제·처리 기록)
 */
export default function MembersPanel({ toast, onAuthLost, banPreset, onBanPresetUsed }: Props) {
  // 신고 탭에서 넘어오면 회원 탭이 새로 열리므로 처음 값으로 정지 창을 연다
  const [banTarget, setBanTarget] = useState<BanTarget | null>(() => banPreset ?? null);
  const [banVersion, setBanVersion] = useState(0);
  useEffect(() => {
    if (banPreset) onBanPresetUsed?.();
  }, [banPreset, onBanPresetUsed]);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<AccountRow[] | null>(null);
  const [pending, setPending] = useState(false);
  const [confirm, setConfirm] = useState<AccountRow | null>(null);
  const [issued, setIssued] = useState<{ accountId: string; name: string | null; code: string } | null>(null);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  const search = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    try {
      setRows((await adminApi.searchAccounts(name)).accounts);
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  };

  const reissue = async (row: AccountRow) => {
    setConfirm(null);
    setPending(true);
    try {
      setIssued(await adminApi.reissueCode(row.accountId));
    } catch (err) {
      fail(err);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={styles.notices} aria-label="회원">
      <form className={styles.pointsForm} onSubmit={(e) => void search(e)} aria-label="계정 찾기">
        <span className={styles.statLabel}>계정 찾기</span>
        <input
          className={cx(ui.input, styles.pointsTarget)}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="닉네임 일부 (포인트를 모은 적 있는 계정)"
          aria-label="닉네임"
          autoComplete="off"
        />
        <button type="submit" className={ui.button} disabled={pending || !name.trim()}>
          찾기
        </button>
      </form>

      {issued && (
        <div className={styles.notice} role="status">
          <p className={styles.noticeTitle}>
            <strong>{issued.name ?? "이름 없음"}</strong> 새 코드 (지금 한 번만 보여요, 이전 코드는 막혔어요)
          </p>
          <p className={styles.noticeBody}>
            <code>{issued.code}</code>
          </p>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setIssued(null)}>
            닫기
          </button>
        </div>
      )}

      {rows !== null &&
        (rows.length === 0 ? (
          <p className={styles.empty}>찾는 계정이 없어요.</p>
        ) : (
          <ul className={styles.list}>
            {rows.map((r) => (
              <li key={r.accountId} className={styles.notice}>
                <div className={styles.noticeTitle}>
                  <strong>{r.name ?? "이름 없음"}</strong>
                  <span className={styles.meta}>
                    모은 포인트 {r.points.toLocaleString("ko-KR")} · {r.rank}위 · {r.accountId}
                  </span>
                </div>
                {confirm?.accountId === r.accountId ? (
                  <div className={styles.segmented}>
                    <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void reissue(r)} disabled={pending}>
                      새 코드 발급 (이전 코드 무효)
                    </button>
                    <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setConfirm(null)}>
                      그만두기
                    </button>
                  </div>
                ) : (
                  <div className={styles.segmented}>
                    <button type="button" className={ui.button} onClick={() => setConfirm(r)} disabled={pending}>
                      코드 재발급
                    </button>
                    <KickButton accountId={r.accountId} name={r.name} toast={toast} onAuthLost={onAuthLost} />
                    <button type="button" className={cx(ui.button, ui.danger)} onClick={() => setBanTarget({ accountId: r.accountId, name: r.name })}>
                      정지
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ))}

      <PointsForm toast={toast} onAuthLost={onAuthLost} />

      <div className={styles.actions}>
        <button type="button" className={ui.button} onClick={() => setBanTarget({})}>
          IP로 바로 차단
        </button>
      </div>
      <BanList toast={toast} onAuthLost={onAuthLost} version={banVersion} onChanged={() => setBanVersion((v) => v + 1)} />
      {banTarget && (
        <BanDialog
          target={banTarget}
          toast={toast}
          onAuthLost={onAuthLost}
          onClose={() => setBanTarget(null)}
          onDone={() => {
            setBanTarget(null);
            setBanVersion((v) => v + 1);
          }}
        />
      )}
    </section>
  );
}

/** 포인트 지급·회수: 개인 코드(XXXX-XXXX-XXXX) 또는 계정 id + 증감 */
function PointsForm({ toast, onAuthLost }: Props) {
  const [target, setTarget] = useState("");
  const [delta, setDelta] = useState("");
  const [pending, setPending] = useState(false);
  const amount = Number(delta);
  const valid = target.trim() !== "" && Number.isInteger(amount) && amount !== 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const code = normalizeCode(target);
    setPending(true);
    try {
      const r = await adminApi.points(CODE_RE.test(code) ? { code } : { accountId: target.trim() }, amount);
      toast(`${r.accountId.slice(0, 6)}… 계정 잔액 ${r.points}점`);
      setTarget("");
      setDelta("");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onAuthLost();
      else toast(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className={styles.pointsForm} onSubmit={(e) => void submit(e)} aria-label="포인트 지급">
      <span className={styles.statLabel}>포인트 지급</span>
      <input
        className={cx(ui.input, styles.pointsTarget)}
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        placeholder="개인 코드 또는 계정 id"
        aria-label="개인 코드 또는 계정 id"
        autoComplete="off"
        spellCheck={false}
      />
      <input
        className={cx(ui.input, styles.pointsDelta)}
        type="number"
        inputMode="numeric"
        min={-BALANCE_CAP}
        max={BALANCE_CAP}
        step={1}
        value={delta}
        onChange={(e) => setDelta(e.target.value)}
        placeholder="+100 / -50"
        aria-label="지급량 (빼려면 음수)"
      />
      <button type="submit" className={ui.button} disabled={pending || !valid}>
        지급
      </button>
    </form>
  );
}
