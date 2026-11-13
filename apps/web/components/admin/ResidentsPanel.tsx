"use client";

import { useState, type FormEvent } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { RESIDENTS_MAX, type ResidentSettings } from "@/lib/residents";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import styles from "./Admin.module.css";
import { opsAdminApi } from "./opsAdminApi";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

/**
 * 돌아다니는 마을 주민 탭: 켜기/끄기와 주민 수(0~15). 주민은 서버 없이 각 화면이 계산하는 NPC라
 * 접속자 수·순위·신고에는 들어가지 않는다. 게임은 1~2분마다 이 값을 확인해 주민이 흐려지며 나타나거나 사라진다.
 */
export default function ResidentsPanel({ toast, onAuthLost }: Props) {
  const loaded = usePanelData(() => opsAdminApi.residents(), [], toast, onAuthLost);
  const [draft, setDraft] = useState<ResidentSettings | null>(null);
  const [pending, setPending] = useState(false);
  const view = draft ?? loaded;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!view) return;
    setPending(true);
    try {
      const r = await opsAdminApi.setResidents(view);
      setDraft(r);
      toast(r.enabled ? `마을 주민 ${r.count}명으로 저장했어요.` : "마을 주민을 껐어요.");
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onAuthLost();
      else toast(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={styles.notices} aria-label="마을 주민">
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>돌아다니는 마을 주민</strong>
        </p>
        {view === null ? (
          <p className={ui.hint}>불러오는 중…</p>
        ) : (
          <form className={styles.pointsForm} onSubmit={(e) => void save(e)} aria-label="마을 주민 설정">
            <label className={styles.statLabel}>
              <input type="checkbox" checked={view.enabled} onChange={(e) => setDraft({ ...view, enabled: e.target.checked })} disabled={pending} /> 켜기
            </label>
            <label className={styles.statLabel}>
              주민 수{" "}
              <input
                className={cx(ui.input)}
                type="number"
                min={0}
                max={RESIDENTS_MAX}
                step={1}
                value={view.count}
                onChange={(e) =>
                  setDraft({
                    ...view,
                    count: Math.max(0, Math.min(RESIDENTS_MAX, Math.round(Number(e.target.value) || 0))),
                  })
                }
                disabled={pending || !view.enabled}
                aria-label={`주민 수 (0~${RESIDENTS_MAX})`}
                style={{ width: "5em" }}
              />
            </label>
            <button type="submit" className={ui.button} disabled={pending}>
              저장
            </button>
          </form>
        )}
        <p className={ui.hint}>
          서버 없이 각자의 화면이 같은 규칙으로 계산하는 NPC예요 (같은 채널이면 모두 같은 자리에서 봐요). 접속자 수·채널 인원·순위·신고에는 들어가지 않아요.
          저장하면 게임 화면에 1~2분 안에 반영되고, 주민이 천천히 나타나거나 사라져요. 기본값은 켜기 · 12명이에요.
        </p>
      </div>
    </section>
  );
}
