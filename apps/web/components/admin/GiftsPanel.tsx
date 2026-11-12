"use client";

import { useState, type FormEvent } from "react";
import { ITEMS, itemById, itemName } from "@tomb/protocol";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import { KIND_LABELS } from "../account/items";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import social from "./SocialPanels.module.css";
import { socialAdminApi } from "./socialAdminApi";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };
type Line = { itemId: string; count: number };

const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** 아이템 고르기: 종류별 묶음 */
const KINDS = [...new Set(ITEMS.map((i) => i.kind))];

/** 11번 선물 탭: 대상(전체 / 닉네임으로 찾은 계정)에게 쪽지 + 포인트·아이템 보내기, 발송 기록 */
export default function GiftsPanel({ toast, onAuthLost }: Props) {
  const [version, setVersion] = useState(0);
  const log = usePanelData(() => socialAdminApi.gifts(), [version], toast, onAuthLost);
  const [mode, setMode] = useState<"all" | "one">("one");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<AdminAccountRow[] | null>(null);
  const [target, setTarget] = useState<AdminAccountRow | null>(null);
  const [from, setFrom] = useState("");
  const [note, setNote] = useState("");
  const [points, setPoints] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState(ITEMS[0].id);
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const fail = (e: unknown) => {
    if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
    else toast(errorMessage(e));
  };

  async function search(e: FormEvent) {
    e.preventDefault();
    try {
      setFound((await adminApi.searchAccounts(query)).accounts);
    } catch (err) {
      fail(err);
    }
  }

  const addLine = () => {
    if (!itemById(pick) || count < 1) return;
    setLines((prev) => {
      const cur = prev.find((l) => l.itemId === pick);
      return cur ? prev.map((l) => (l.itemId === pick ? { ...l, count: Math.min(99, l.count + count) } : l)) : [...prev, { itemId: pick, count }];
    });
  };

  const ready = note.trim().length > 0 && (points > 0 || lines.length > 0) && (mode === "all" || !!target);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (!ready) return;
    if (mode === "all" && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setArmed(false);
    try {
      await socialAdminApi.sendGift({
        target: mode === "all" ? "all" : target!.accountId,
        targetName: mode === "all" ? null : target!.name,
        from: from.trim() || null,
        note: note.trim(),
        points,
        items: lines,
      });
      toast(mode === "all" ? "전체에게 선물을 보냈어요." : `${target!.name ?? "그 계정"}에게 선물을 보냈어요.`);
      setNote("");
      setPoints(0);
      setLines([]);
      setVersion((v) => v + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={social.panel} aria-label="선물">
      <form className={cx(ui.panel, social.form)} onSubmit={(e) => void send(e)}>
        <h2 className={styles.subTitle}>선물 보내기</h2>
        <div className={styles.segmented} role="group" aria-label="받는 사람">
          <button type="button" className={ui.button} aria-pressed={mode === "one"} onClick={() => setMode("one")}>
            특정 계정
          </button>
          <button type="button" className={ui.button} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
            전체
          </button>
        </div>
        {mode === "all" ? (
          <p className={ui.hint}>지금까지 들어온 모든 계정이 받을 수 있어요 (보낸 뒤에 처음 들어온 계정은 제외). 계정마다 복사하지 않고 받을 때 처리해요.</p>
        ) : (
          <div className={social.targetBox}>
            <div className={social.row}>
              <input
                type="search"
                className={cx(ui.input, styles.search)}
                placeholder="닉네임 검색"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void search(e);
                }}
                aria-label="닉네임 검색"
              />
              <button type="button" className={ui.button} onClick={(e) => void search(e)} disabled={!query.trim()}>
                찾기
              </button>
            </div>
            {found && !found.length && <p className={ui.hint}>그 닉네임의 계정이 없어요 (포인트를 모은 적 있는 계정만 찾아요).</p>}
            {found && found.length > 0 && (
              <ul className={social.found}>
                {found.map((a) => (
                  <li key={a.accountId}>
                    <button type="button" className={cx(ui.button, target?.accountId === a.accountId && ui.primary)} onClick={() => setTarget(a)}>
                      {a.name ?? "이름 없음"} <span className={styles.meta}>{a.points.toLocaleString("ko-KR")}P · {a.accountId.slice(0, 6)}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={social.picked}>받는 사람: {target ? `${target.name ?? "이름 없음"} (${target.accountId})` : "아직 안 골랐어요"}</p>
          </div>
        )}
        <label className={ui.field}>
          <span className={ui.label}>보내는 이 (비우면 「마을 관리인」)</span>
          <input className={ui.input} value={from} maxLength={20} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>
            쪽지 <span className={ui.counter}>{note.length}/200</span>
          </span>
          <textarea className={cx(ui.input, social.note)} value={note} maxLength={200} rows={3} onChange={(e) => setNote(e.target.value)} required />
        </label>
        <label className={ui.field}>
          <span className={ui.label}>포인트</span>
          <input className={ui.input} type="number" min={0} max={9999} value={points} onChange={(e) => setPoints(Math.max(0, Math.min(9999, Math.floor(Number(e.target.value) || 0))))} />
        </label>
        <div className={ui.field}>
          <span className={ui.label}>아이템 (코디·폭죽·확성기·염색권 등 카탈로그 아이템)</span>
          <div className={social.row}>
            <select className={cx(ui.input, styles.select)} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="아이템">
              {KINDS.map((k) => (
                <optgroup key={k} label={KIND_LABELS[k] ?? k}>
                  {ITEMS.filter((i) => i.kind === k).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input className={cx(ui.input, social.count)} type="number" min={1} max={99} value={count} onChange={(e) => setCount(Math.max(1, Math.min(99, Math.floor(Number(e.target.value) || 1))))} aria-label="개수" />
            <button type="button" className={ui.button} onClick={addLine}>
              추가
            </button>
          </div>
          {lines.length > 0 && (
            <ul className={social.lines}>
              {lines.map((l) => (
                <li key={l.itemId}>
                  {itemById(l.itemId)?.name ?? l.itemId} ×{l.count}
                  <button type="button" className={cx(ui.button, ui.quiet)} onClick={() => setLines((p) => p.filter((x) => x.itemId !== l.itemId))}>
                    빼기
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="submit" className={cx(ui.button, armed ? ui.danger : ui.primary)} disabled={busy || !ready}>
          {armed ? "정말 전체에게 보낼까요? (한 번 더 누르기)" : mode === "all" ? "전체에게 보내기" : "보내기"}
        </button>
        <p className={ui.hint}>받지 않은 선물은 30일 동안 보관돼요. 유저는 메뉴의 선물함(빨간 점)에서 받아요.</p>
      </form>

      <div className={social.logBox}>
        <h2 className={styles.subTitle}>발송 기록</h2>
        {!log && <p className={ui.hint}>불러오는 중…</p>}
        {log?.gifts.length === 0 && <p className={ui.hint}>아직 보낸 선물이 없어요.</p>}
        {log && log.gifts.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>보낸 때</th>
                <th>대상</th>
                <th>쪽지</th>
                <th>내용</th>
                <th>받음</th>
              </tr>
            </thead>
            <tbody>
              {log.gifts.map((g) => (
                <tr key={g.id}>
                  <td>{when(g.createdAt)}</td>
                  <td>{g.target === "all" ? "전체" : (g.targetName ?? g.target.slice(0, 8))}</td>
                  <td className={social.noteCell} title={g.note}>
                    <b>{g.from}</b> {g.note}
                  </td>
                  <td>
                    {[...(g.points ? [`${g.points}P`] : []), ...g.items.map((i) => `${itemName(i.itemId)}×${i.count}`)].join(", ")}
                  </td>
                  <td>{g.claims}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
