"use client";

import { useState } from "react";
import { MAINT_MSG_MAX, type MaintState } from "@tomb/protocol";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { maintUntilLabel } from "@/lib/maintText";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import { logsAdminApi } from "./logsAdminApi";
import { fullTime } from "./memberFormat";
import ops from "./Ops.module.css";
import { LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void; version: number };

/** datetime-local 값(한국 시각으로 본다) ↔ epoch ms */
function fromLocal(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - 9 * 3_600_000;
}
function toLocal(ms: number): string {
  const d = new Date(ms + 9 * 3_600_000);
  return d.toISOString().slice(0, 16);
}

const QUICK: [number, string][] = [
  [30, "30분 뒤"],
  [60, "1시간 뒤"],
  [120, "2시간 뒤"],
];

/**
 * 11/26 점검 모드: [점검 시작](확인 한 번) → 운영자 빼고 모든 접속을 끊고 새 입장을 막는다. 사이트 전체(첫 화면·개발자 노트·안내)는 15초 안에 점검 화면(503).
 * 관리자 화면·운영자 계정은 그대로 들어온다. [점검 끝]이면 점검 화면이 30초 안에 저절로 다시 들어온다
 */
export default function MaintenancePanel({ toast, onAuthLost, version }: Props) {
  const [again, setAgain] = useState(0);
  const load = usePanelLoad(() => logsAdminApi.maintenance(), [version, again], toast, onAuthLost);
  const [state, setState] = useState<MaintState | null>(null);
  const cur = state ?? load.data?.state ?? null;
  const [msg, setMsg] = useState("");
  const [until, setUntil] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  /** 고른 예상 끝 시각이 이미 지났다 (고를 때 확인 — 서버도 다시 막는다) */
  const [past, setPast] = useState(false);
  const untilMs = until ? fromLocal(until) : null;
  const pickUntil = (v: string) => {
    setUntil(v);
    const ms = v ? fromLocal(v) : null;
    setPast(v !== "" && (ms === null || ms <= Date.now()));
    setConfirming(false);
  };

  const run = async (on: boolean) => {
    setPending(true);
    try {
      const r = await logsAdminApi.setMaintenance(on ? { on: true, msg: msg.trim(), until: untilMs } : { on: false });
      setState(r.state);
      setConfirming(false);
      toast(on ? `점검을 시작했어요. 접속 ${r.kicked ?? 0}명을 내보냈어요.` : "점검을 끝냈어요. 점검 화면이 30초 안에 다시 들어와요.");
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  if (!cur) return <LoadState data={null} error={load.error} retry={load.retry} />;

  const preview = (
    <div className={ops.preview} aria-label="손님 화면 미리 보기">
      <p className={ops.previewTitle}>서버 점검 중이에요</p>
      <p className={ops.previewMsg}>{(cur.on ? cur.msg : msg.trim()) || "더 좋은 마을로 돌아올게요."}</p>
      {maintUntilLabel(cur.on ? cur.until : untilMs) && <span className={ops.previewUntil}>{maintUntilLabel(cur.on ? cur.until : untilMs)}쯤 끝나요</span>}
    </div>
  );

  return (
    <section aria-label="점검 모드">
      <div className={cx(ops.maintCard, cur.on && ops.maintOn)}>
        <div className={ops.maintHead}>
          <h2 className={ops.maintTitle}>{cur.on ? "점검 중" : "평소 운영 중"}</h2>
          <span className={cx(ops.tag, cur.on ? ops.tagBad : ops.tagOk)}>{cur.on ? `${fullTime(cur.at)}부터` : "열림"}</span>
          <button type="button" className={cx(ui.button, ui.small)} style={{ marginLeft: "auto" }} onClick={() => setAgain((n) => n + 1)} disabled={pending}>
            상태 다시 보기
          </button>
        </div>

        {cur.on ? (
          <div className={ops.maintForm}>
            <p className={ops.muted}>
              손님은 모두 점검 화면을 보고 있어요. 관리자 화면과 운영자 계정은 그대로 들어와요.
              {cur.until ? ` 예상 끝: ${maintUntilLabel(cur.until)}` : ""}
            </p>
            <div className={ops.row}>
              <button type="button" className={cx(ui.button, ui.primary)} onClick={() => void run(false)} disabled={pending}>
                점검 끝
              </button>
            </div>
          </div>
        ) : (
          <form
            className={ops.maintForm}
            onSubmit={(e) => {
              e.preventDefault();
              setConfirming(true);
            }}
          >
            <label className={ui.field}>
              <span className={ui.label}>안내 문구 ({[...msg].length}/{MAINT_MSG_MAX})</span>
              <textarea
                className={ui.input}
                value={msg}
                maxLength={MAINT_MSG_MAX}
                placeholder="예: 캠핑장 개편 작업 중이에요. 조금만 기다려 주세요!"
                onChange={(e) => {
                  setMsg(e.target.value);
                  setConfirming(false);
                }}
                disabled={pending}
              />
            </label>
            <div className={ui.field}>
              <span className={ui.label}>예상 끝 시각 (한국 시각, 비워 두면 안 보여요)</span>
              <div className={ops.row}>
                <input
                  className={ui.input}
                  type="datetime-local"
                  value={until}
                  onChange={(e) => pickUntil(e.target.value)}
                  disabled={pending}
                  aria-label="예상 끝 시각"
                />
                <div className={ops.quick}>
                  {QUICK.map(([min, label]) => (
                    <button
                      key={min}
                      type="button"
                      className={cx(ui.button, ui.small)}
                      onClick={() => pickUntil(toLocal(Math.ceil((Date.now() + min * 60_000) / 300_000) * 300_000))}
                      disabled={pending}
                    >
                      {label}
                    </button>
                  ))}
                  {until && (
                    <button type="button" className={cx(ui.button, ui.quiet, ui.small)} onClick={() => pickUntil("")} disabled={pending}>
                      지우기
                    </button>
                  )}
                </div>
              </div>
            </div>
            {confirming ? (
              <div className={ops.confirmBox} role="alert">
                <p style={{ margin: "0 0 10px" }}>정말 점검을 시작할까요? 운영자를 빼고 지금 접속한 모든 사람이 끊기고, 사이트 전체가 점검 화면으로 바뀌어요.</p>
                <div className={ops.row}>
                  <button type="button" className={cx(ui.button, ui.danger)} onClick={() => void run(true)} disabled={pending || past}>
                    {pending ? "시작하는 중…" : "네, 점검 시작"}
                  </button>
                  <button type="button" className={ui.button} onClick={() => setConfirming(false)} disabled={pending}>
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className={ops.row}>
                <button type="submit" className={cx(ui.button, ui.danger)} disabled={pending}>
                  점검 시작
                </button>
                {past && <span className={ops.muted}>예상 끝 시각이 이미 지났어요.</span>}
              </div>
            )}
          </form>
        )}
        {preview}
      </div>
      <p className={ui.hint} style={{ maxWidth: 640, marginTop: 12 }}>
        점검 중에도 열려 있는 곳: 관리자 화면·관리자 API, 점검 상태 확인, 그림·글꼴 같은 정적 파일. 검색엔진에는 503과 다시 올 시각(Retry-After)을 알려 순위를 지켜요. 점검 상태는 실시간
        서버에 두어 저장소(Redis) 비용이 없어요.
      </p>
      <p className={ui.hint} style={{ maxWidth: 640, marginTop: 6 }}>
        점검 중에도 게임 API(상점·낚시·선물 등)는 막지 않아요. 이미 집 안에 들어가 있던 접속도 끊기지 않고 새 입장만 막혀요. 그래서 경제 버그를 급히 멈추는 용도로는 쓸 수
        없어요.
      </p>
    </section>
  );
}
