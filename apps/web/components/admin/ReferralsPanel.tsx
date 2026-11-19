"use client";

import { useState } from "react";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import { ApiRequestError, errorMessage, request } from "@/lib/api";
import type { AdminReferralResponse, AdminReferralRow } from "@/lib/referralService";
import { decisionText, GRAND_SKIP_TEXT, REF_MODE_LABEL, REF_MODES, type RefMode } from "@/lib/referralRules";
import { parseReason, SAME_LEVEL_LABEL, SAME_REVIEW_AT, SAME_SAME_AT, type SameLevel } from "@/lib/sameUserRules";
import { stayText } from "@/lib/stayTime";
import { GIFT_MAX_TARGETS } from "@/lib/types";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import an from "./Analytics.module.css";
import { fullTime, joinDate } from "./memberFormat";
import { Empty, LoadState } from "./PanelState";
import { usePanelLoad } from "./usePanelData";
import LinkedNames, { NameLine } from "./LinkedNames";
import mm from "./Members.module.css";

type Props = {
  toast: (message: string) => void;
  onAuthLost: () => void;
  /** 이름을 누르면 회원 목록 탭에서 그 계정을 찾는다 */
  onFindMember: (accountId: string) => void;
  /** 고른 계정을 선물 탭에 담아 연다 */
  onGift: (rows: AdminAccountRow[]) => void;
};

const api = {
  view: () => request<AdminReferralResponse>("/api/admin/referrals", { cache: "no-store" }),
  setMode: (mode: RefMode) =>
    request<AdminReferralResponse>("/api/admin/referrals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode }) }),
  decideMany: (refereeIds: string[], approve: boolean) =>
    request<AdminReferralResponse>("/api/admin/referrals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refereeIds, approve }) }),
  decide: (refereeId: string, approve: boolean) =>
    request<AdminReferralResponse>("/api/admin/referrals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ refereeId, approve }) }),
};

const num = (n: number) => n.toLocaleString("ko-KR");

/** 진행 칸 (11/18 하루 1시간 넘게 머문 날 기준): 달성했으면 달성 시각, 아니면 그런 날 수 (옛 기준으로 쳐 준 날은 따로) */
function progressText(r: AdminReferralRow, rules: AdminReferralResponse["rules"]): string {
  const days = `${stayText(rules.dayMin)} 넘긴 날 ${Math.min(r.days, rules.needDays)}일 / ${rules.needDays}일${r.legacyDays ? ` (옛 기준 ${r.legacyDays}일 포함)` : ""}`;
  if (r.qualifiedAt) return `${joinDate(r.qualifiedAt)} 달성 · ${days}`;
  return days;
}

/** 11/18 점검용: 어제·오늘 머문 분(하루 기록이 남은 날만)과 새 기준 달성 여부 */
function recentText(r: AdminReferralRow): string {
  const md = (d: string) => `${Number(d.slice(4, 6))}/${Number(d.slice(6, 8))}`;
  const days = r.recent.map((x) => `${md(x.day)} ${stayText(x.min)}`).join(", ");
  return `${days}${r.meetsRule ? ", 새 기준 달성" : ""}`;
}

/** 보상 칸: 보낸 쪽 (승인해서 보낸 것 포함) */
function paidText(r: AdminReferralRow): string {
  if (!r.qualifiedAt) return "—";
  if (r.hold === 1) return "확인 기다림";
  if (r.hold === 3) return "거절함";
  const how = r.hold === 2 ? "승인, " : "";
  if (r.refereePaid && r.referrerPaid) return `${how}둘 다`;
  if (r.refereePaid) return `${how}새 이웃만 (추천인은 이달 상한)`;
  return "없음";
}

const LEVEL_BADGE: Record<SameLevel, string> = { clear: styles.badgeOpen, review: styles.badgeWarn, same: styles.badgeHidden };

/**
 * 추천 탭: 합계, 확인 기다림(오래된 것 먼저, 고른 것 한꺼번에 승인·거절), 보상 방식(모두 확인·자동·끔), 많이 데려온 추천인, 최근 추천 100건.
 * 같은 사람 판정(단계·점수·이유, 새 이웃과 같은 IP·기기 계정 전부)을 줄마다 보여 주고, 「확인 필요」로 보류한 보상은 승인·거절한다.
 * 자동 보상이 꺼졌거나 「같은 사람 같음」이라 못 받은 계정은 골라서 선물 탭으로 넘겨 직접 보낸다. 규칙은 lib/referralRules.ts·lib/sameUserRules.ts
 */
export default function ReferralsPanel({ toast, onAuthLost, onFindMember, onGift }: Props) {
  const load = usePanelLoad(() => api.view(), [], toast, onAuthLost);
  const [saved, setSaved] = useState<AdminReferralResponse | null>(null);
  const [pending, setPending] = useState(false);
  /** 고른 계정 id → 이름 (선물 보내기·id 복사) */
  const [picked, setPicked] = useState<Map<string, string | null>>(new Map());
  const view = saved ?? load.data;

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  /** 확인 기다림에서 고른 새 이웃 (한꺼번에 승인·거절) */
  const [chosen, setChosen] = useState<Set<string>>(new Set());

  const changeMode = async (mode: RefMode) => {
    if (mode === "off" && !window.confirm("보상을 끌까요? 조건 달성만 기록되고, 포인트는 선물로 직접 보내야 해요.")) return;
    setPending(true);
    try {
      setSaved(await api.setMode(mode));
      toast(`보상 방식을 「${REF_MODE_LABEL[mode]}」으로 바꿨어요.`);
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };

  const decideChosen = async (approve: boolean) => {
    const ids = [...chosen];
    if (!ids.length) return;
    if (!window.confirm(approve ? `고른 ${ids.length}건을 승인할까요? 양쪽에 보상 선물이 바로 가요.` : `고른 ${ids.length}건의 보상을 거절할까요? 되돌릴 수 없어요.`)) return;
    setPending(true);
    try {
      const r = await api.decideMany(ids, approve);
      setSaved(r);
      setChosen(new Set());
      toast(decisionText(r.decision));
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };

  const decide = async (r: AdminReferralRow, approve: boolean) => {
    const who = r.refereeName ?? r.refereeId;
    if (!window.confirm(approve ? `${who}님 추천을 승인할까요? 양쪽에 보상 선물이 바로 가요.` : `${who}님 추천 보상을 거절할까요? 되돌릴 수 없어요.`)) return;
    setPending(true);
    try {
      const res = await api.decide(r.refereeId, approve);
      setSaved(res);
      toast(decisionText(res.decision));
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };

  const toggle = (id: string, name: string | null) =>
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < GIFT_MAX_TARGETS) next.set(id, name);
      return next;
    });

  const copyIds = async () => {
    const text = [...picked].map(([id, name]) => `${name ?? "이름 없음"}\t${id}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast(`${picked.size}명의 이름과 계정 id를 복사했어요.`);
    } catch {
      toast("복사하지 못했어요.");
    }
  };

  if (!view) return <LoadState data={load.data} error={load.error} retry={load.retry} />;
  const t = view.totals;
  const who = (id: string, name: string | null) => (
    <button type="button" className={cx(ui.button, ui.quiet, ui.small)} onClick={() => onFindMember(id)} title={`회원 목록 탭에서 이 계정을 찾아요 (${id})`}>
      {name ?? "이름 없음"}
    </button>
  );
  const pick = (id: string, name: string | null) => (
    <input
      type="checkbox"
      className={styles.check}
      checked={picked.has(id)}
      disabled={!picked.has(id) && picked.size >= GIFT_MAX_TARGETS}
      onChange={() => toggle(id, name)}
      aria-label={`${name ?? "이름 없음"} 고르기`}
    />
  );

  /** 같은 사람 판정 칸: 단계 배지·점수, 이유 전부(무리 이웃 이름 전부), 새 이웃과 같은 IP·같은 기기 계정 전부 */
  const judge = (r: AdminReferralRow) => (
    <>
      <span className={cx(styles.badge, LEVEL_BADGE[r.level])}>
        {SAME_LEVEL_LABEL[r.level]} {r.score}점
      </span>
      {r.reasons.length > 0 && (
        <ul className={mm.links}>
          {r.reasons.map((raw) => {
            const reason = parseReason(raw);
            if (!reason) return null;
            return (
              <li key={raw}>
                {reason.text}
                {reason.accounts.length > 0 && (
                  <NameLine label="겹친 이웃" accounts={reason.accounts.map((id) => ({ accountId: id, name: view.names[id] ?? null }))} onFind={onFindMember} />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <LinkedNames links={r.links} onFind={onFindMember} />
    </>
  );
  /** 추천인이 이번 달 보상을 다 받았으면 (확인 기다림일 때만 — 승인하면 새 이웃만 받는다) */
  const capBadge = (r: AdminReferralRow) =>
    r.hold === 1 &&
    r.referrerCapped && <p className={cx(styles.badge, styles.badgeWarn)}>추천인은 이번 달 보상을 다 받았어요. 승인하면 새 이웃만 받아요.</p>;
  /** 2단계: 추천인의 추천인 이름과 그 보상 상태 */
  const grandLine = (r: AdminReferralRow) => {
    if (!r.grandId) return null;
    const p = view.rules.grandReward;
    const state =
      r.grand === "paid"
        ? `${p} 보냄`
        : r.grand === "cap"
          ? `이번 달 2단계 보상 ${view.rules.grandMonthCap}번을 다 받아서 못 보냄`
          : r.grand.startsWith("skip:")
            ? (GRAND_SKIP_TEXT[r.grand.slice(5)] ?? "건너뛰었어요")
            : r.hold === 1
              ? `승인하면 ${p}을 보내요`
              : "아직이에요";
    return (
      <p className={ui.hint}>
        추천인의 추천인 {who(r.grandId, r.grandName)} {state}
      </p>
    );
  };
  const heldIds = view.held.map((r) => r.refereeId);
  const allChosen = heldIds.length > 0 && heldIds.every((id) => chosen.has(id));

  return (
    <>
      <div className={an.section}>
        <div className={an.kpis}>
          <Kpi label="추천 코드 입력" value={num(t.entered)} />
          <Kpi label="조건 달성" value={num(t.qualified)} note={t.entered ? `${Math.round((t.qualified / t.entered) * 100)}%` : undefined} />
          <Kpi label="보상 지급" value={`${num(t.paidReferee + t.paidReferrer)}건`} note={`새 이웃 ${num(t.paidReferee)}, 추천인 ${num(t.paidReferrer)}`} />
          <Kpi label="2단계 선물" value={`${num(t.paidGrand)}건`} />
          <Kpi label="확인 기다림" value={num(t.held)} note={t.denied ? `거절 ${num(t.denied)}` : undefined} />
          <Kpi label="같은 사람 같음" value={num(t.same)} />
        </div>
      </div>

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>확인 기다림</h2>
          <span className={an.sub}>조건을 넘긴 순서대로, 오래된 것부터 {num(view.held.length)}건이에요.</span>
        </div>
        {!view.held.length ? (
          <Empty inline>확인을 기다리는 추천이 없어요.</Empty>
        ) : (
          <>
            <div className={styles.bulkBar}>
              <label className={styles.selectAll}>
                <input
                  type="checkbox"
                  className={styles.check}
                  checked={allChosen}
                  onChange={() => setChosen(allChosen ? new Set() : new Set(heldIds))}
                  aria-label="확인 기다림 모두 고르기"
                />
                모두 고르기
              </label>
              <span className={styles.bulkCount}>{chosen.size}건 골랐어요</span>
              <button type="button" className={cx(ui.button, ui.primary)} disabled={pending || !chosen.size} onClick={() => void decideChosen(true)}>
                고른 것 승인
              </button>
              <button type="button" className={cx(ui.button, ui.danger)} disabled={pending || !chosen.size} onClick={() => void decideChosen(false)}>
                고른 것 거절
              </button>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table} aria-label="확인 기다림">
                <thead>
                  <tr>
                    <th scope="col">고르기</th>
                    <th scope="col">새 이웃</th>
                    <th scope="col">추천인</th>
                    <th scope="col">조건 달성</th>
                    <th scope="col">같은 사람 판정</th>
                    <th scope="col">하나씩</th>
                  </tr>
                </thead>
                <tbody>
                  {view.held.map((r) => (
                    <tr key={r.refereeId}>
                      <td>
                        <input
                          type="checkbox"
                          className={styles.check}
                          checked={chosen.has(r.refereeId)}
                          onChange={() =>
                            setChosen((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.refereeId)) next.delete(r.refereeId);
                              else next.add(r.refereeId);
                              return next;
                            })
                          }
                          aria-label={`${r.refereeName ?? "이름 없음"} 고르기`}
                        />
                      </td>
                      <td>{who(r.refereeId, r.refereeName)}</td>
                      <td>
                        {who(r.referrerId, r.referrerName)}
                        {capBadge(r)}
                        {grandLine(r)}
                      </td>
                      <td className={styles.nowrap} title={fullTime(r.qualifiedAt)}>
                        {joinDate(r.qualifiedAt)}
                      </td>
                      <td>{judge(r)}</td>
                      <td>
                        <div className={styles.segmented}>
                          <button type="button" className={cx(ui.button, ui.small, ui.primary)} disabled={pending} onClick={() => void decide(r, true)}>
                            승인
                          </button>
                          <button type="button" className={cx(ui.button, ui.small, ui.danger)} disabled={pending} onClick={() => void decide(r, false)}>
                            거절
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>보상 방식</h2>
          <span className={an.sub}>지금은 「{REF_MODE_LABEL[view.mode]}」이에요</span>
        </div>
        <div className={styles.segmented}>
          {REF_MODES.map((m) => (
            <button
              key={m}
              type="button"
              className={cx(ui.button, view.mode === m && (m === "off" ? ui.danger : ui.primary))}
              aria-pressed={view.mode === m}
              disabled={pending || view.mode === m}
              onClick={() => void changeMode(m)}
            >
              {REF_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <ul className={ui.hint}>
          <li>「{REF_MODE_LABEL.review}」은 조건을 넘긴 추천을 점수와 상관없이 모두 확인 기다림에 올려요. 승인하면 양쪽에 보상을 보내고 칭호에도 세요.</li>
          <li>「{REF_MODE_LABEL.auto}」은 같은 사람 판정으로 정해요. 의심 없음은 바로 보내고, 확인 필요는 기다리고, 같은 사람 같음은 보내지 않아요.</li>
          <li>「{REF_MODE_LABEL.off}」은 조건 달성만 기록해요. 바꾼 뒤 조건을 넘기는 추천부터 적용돼요.</li>
          <li>
            새 이웃이 하루 {stayText(view.rules.dayMin)} 넘게 머문 날이 {view.rules.needDays}일이 되면 조건 달성이에요. 이어진 날이 아니어도 돼요. 그때 둘 다 {view.rules.reward}을 받아요. 꾸미기는 선물함, 물약과 서류는 사냥 가방으로 가요.
          </li>
          <li>11/18 기준을 바꾸기 전에 들어온 날은 너그럽게 1시간 넘긴 날로 쳐요(진행 칸 「옛 기준」). 어제·오늘은 실제 머문 시간으로 봐요.</li>
          <li>추천인 보상은 한국 시간 달력으로 한 달에 {view.rules.monthCap}명까지예요. 넘으면 세기만 해요.</li>
          <li>
            추천인의 추천인도 {view.rules.grandReward}을 받아요. 한 달에 {view.rules.grandMonthCap}번까지이고 칭호에는 세지 않아요. 운영자이거나 같은 사람 같으면 건너뛰어요.
          </li>
          <li>
            같은 사람 판정은 같은 기기, 같은 IP, 같은 대역, 브라우저 환경, 가입 시간, 접속한 날, 다른 이웃과 겹침을 점수로 더해요. {SAME_REVIEW_AT}점부터 「
            {SAME_LEVEL_LABEL.review}」, {SAME_SAME_AT}점부터 「{SAME_LEVEL_LABEL.same}」이에요.
          </li>
          <li>보상을 못 받은 계정은 아래 표에서 골라 선물 탭에서 직접 보낼 수 있어요.</li>
        </ul>
      </div>

      {picked.size > 0 && (
        <div className={styles.bulkBar}>
          <span className={styles.bulkCount}>{picked.size}명 골랐어요</span>
          <button
            type="button"
            className={cx(ui.button, ui.primary)}
            onClick={() => onGift([...picked].map(([accountId, name]) => ({ accountId, name, points: 0, rank: 0 })))}
          >
            선물 탭에서 보내기
          </button>
          <button type="button" className={ui.button} onClick={() => void copyIds()}>
            이름과 id 복사
          </button>
          <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setPicked(new Map())}>
            고르기 풀기
          </button>
        </div>
      )}

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>많이 데려온 추천인</h2>
          <span className={an.sub}>가입 수 상위 30명을 조건 달성 순으로 보여 줘요. {view.month.slice(4)}월 보상은 이번 달 받은 수예요.</span>
        </div>
        {!view.top.length ? (
          <Empty inline>아직 추천 코드로 가입한 이웃이 없어요.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="많이 데려온 추천인">
              <thead>
                <tr>
                  <th scope="col">고르기</th>
                  <th scope="col">추천인</th>
                  <th scope="col" className={styles.num}>
                    가입
                  </th>
                  <th scope="col" className={styles.num}>
                    조건 달성
                  </th>
                  <th scope="col" className={styles.num}>
                    받은 보상
                  </th>
                  <th scope="col" className={styles.num}>
                    {view.month.slice(4)}월 보상
                  </th>
                </tr>
              </thead>
              <tbody>
                {view.top.map((r) => (
                  <tr key={r.accountId}>
                    <td>
                      {pick(r.accountId, r.name)}
                    </td>
                    <td>
                      {who(r.accountId, r.name)}
                    </td>
                    <td className={styles.num}>{num(r.joined)}</td>
                    <td className={styles.num}>{num(r.qualified)}</td>
                    <td className={styles.num}>{num(r.paid)}</td>
                    <td className={styles.num}>
                      {r.month} / {view.rules.monthCap}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className={an.section}>
        <div className={an.sectionHead}>
          <h2 className={an.sectionTitle}>최근 추천</h2>
          <span className={an.sub}>최근 100건이에요. 고르기는 새 이웃 계정을 담아요.</span>
        </div>
        {!view.recent.length ? (
          <Empty inline>아직 추천 기록이 없어요.</Empty>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="최근 추천">
              <thead>
                <tr>
                  <th scope="col">고르기</th>
                  <th scope="col">새 이웃</th>
                  <th scope="col">추천인</th>
                  <th scope="col">정한 때</th>
                  <th scope="col">진행</th>
                  <th scope="col">보상</th>
                  <th scope="col">같은 사람 판정</th>
                </tr>
              </thead>
              <tbody>
                {view.recent.map((r) => (
                  <tr key={r.refereeId}>
                    <td>
                      {pick(r.refereeId, r.refereeName)}
                    </td>
                    <td>
                      {who(r.refereeId, r.refereeName)}
                    </td>
                    <td>
                      {who(r.referrerId, r.referrerName)}
                    </td>
                    <td className={styles.nowrap} title={fullTime(r.at)}>
                      {joinDate(r.at)} {r.via === "signup" ? "가입 때" : "내 정보에서"}
                    </td>
                    <td className={styles.nowrap}>
                      {progressText(r, view.rules)}
                      <br />
                      <small>{recentText(r)}</small>
                    </td>
                    <td>
                      {paidText(r)}
                      {capBadge(r)}
                      {grandLine(r)}
                      {r.hold === 1 && (
                        <div className={styles.segmented}>
                          <button type="button" className={cx(ui.button, ui.small, ui.primary)} disabled={pending} onClick={() => void decide(r, true)}>
                            승인
                          </button>
                          <button type="button" className={cx(ui.button, ui.small, ui.danger)} disabled={pending} onClick={() => void decide(r, false)}>
                            거절
                          </button>
                        </div>
                      )}
                    </td>
                    <td>{judge(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={an.kpi}>
      <span className={an.kpiLabel}>{label}</span>
      <span className={an.kpiValue}>{value}</span>
      {note && <span className={an.kpiNote}>{note}</span>}
    </div>
  );
}
