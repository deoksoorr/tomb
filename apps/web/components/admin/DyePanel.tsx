"use client";

import { useState, type FormEvent } from "react";
import { DYE_PART_NAMES, DYE_PARTS, normalizeDyeColor, type DyePart } from "@tomb/protocol";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { adminDyeApi } from "@/lib/dye/client";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";
import social from "./SocialPanels.module.css";
import { Empty, Loading } from "./PanelState";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const pad = (n: number) => String(n).padStart(2, "0");
const when = (ms: number) => {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * 46번 고정 색 염색권 탭: 색·이름·쓸 수 있는 부위·수량·대상(전체/계정)을 정해 새 염색권을 만들고 선물함으로 보낸다.
 * 유저는 선물함에서 받아 가방에서 부위만 골라 쓴다 (색은 여기서 정한 값만 — 유저가 색을 넣는 길은 없다)
 */
export default function DyePanel({ toast, onAuthLost }: Props) {
  const [version, setVersion] = useState(0);
  const data = usePanelData(() => adminDyeApi.list(), [version], toast, onAuthLost);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#f4a7b9");
  const [parts, setParts] = useState<DyePart[]>([]);
  const [count, setCount] = useState(1);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"all" | "one">("one");
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<AdminAccountRow[] | null>(null);
  const [target, setTarget] = useState<AdminAccountRow | null>(null);
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

  const hex = normalizeDyeColor(color);
  const ready = name.trim().length > 0 && !!hex && (mode === "all" || !!target);

  async function issue(e: FormEvent) {
    e.preventDefault();
    if (!ready || !hex) return;
    if (mode === "all" && !armed) {
      setArmed(true);
      return;
    }
    setBusy(true);
    setArmed(false);
    try {
      await adminDyeApi.issue({
        name: name.trim(),
        color: hex,
        ...(parts.length ? { parts } : {}),
        count,
        target: mode === "all" ? "all" : target!.accountId,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      toast(mode === "all" ? "전체 선물함으로 염색권을 보냈어요." : `${target!.name ?? "그 계정"}의 선물함으로 염색권을 보냈어요.`);
      setName("");
      setNote("");
      setVersion((v) => v + 1);
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (p: DyePart) => setParts((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  return (
    <section className={social.panel} aria-label="고정 색 염색권">
      <form className={cx(ui.panel, social.form)} onSubmit={(e) => void issue(e)}>
        <h2 className={styles.subTitle}>고정 색 염색권 발급</h2>
        <label className={ui.field}>
          <span className={ui.label}>
            이름 <span className={ui.counter}>{name.length}/24</span>
          </span>
          <input className={ui.input} value={name} maxLength={24} placeholder="예: 벚꽃 분홍 염색권" onChange={(e) => setName(e.target.value)} required />
        </label>
        <div className={ui.field}>
          <span className={ui.label}>색</span>
          <div className={social.row}>
            <input type="color" value={hex ?? "#000000"} onChange={(e) => setColor(e.target.value)} aria-label="색 고르기" />
            <input className={ui.input} value={color} maxLength={7} onChange={(e) => setColor(e.target.value)} aria-invalid={!hex} aria-label="색 코드 (#RRGGBB)" />
          </div>
        </div>
        <div className={ui.field}>
          <span className={ui.label}>쓸 수 있는 부위 (안 고르면 모든 부위)</span>
          <div className={styles.segmented} role="group" aria-label="쓸 수 있는 부위">
            {DYE_PARTS.map((p) => (
              <button key={p} type="button" className={ui.button} aria-pressed={parts.includes(p)} onClick={() => toggle(p)}>
                {DYE_PART_NAMES[p]}
              </button>
            ))}
          </div>
        </div>
        <label className={ui.field}>
          <span className={ui.label}>수량 (계정마다)</span>
          <input className={cx(ui.input, social.count)} type="number" min={1} max={10} value={count} onChange={(e) => setCount(Math.max(1, Math.min(10, Math.floor(Number(e.target.value) || 1))))} />
        </label>
        <div className={styles.segmented} role="group" aria-label="받는 사람">
          <button type="button" className={ui.button} aria-pressed={mode === "one"} onClick={() => setMode("one")}>
            특정 계정
          </button>
          <button type="button" className={ui.button} aria-pressed={mode === "all"} onClick={() => setMode("all")}>
            전체
          </button>
        </div>
        {mode === "one" && (
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
            {found && !found.length && <p className={ui.hint}>그 닉네임의 계정이 없어요.</p>}
            {found && found.length > 0 && (
              <ul className={social.found}>
                {found.map((a) => (
                  <li key={a.accountId}>
                    <button type="button" className={cx(ui.button, target?.accountId === a.accountId && ui.primary)} onClick={() => setTarget(a)}>
                      {a.name ?? "이름 없음"} <span className={styles.meta}>{a.accountId.slice(0, 6)}…</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className={social.picked}>받는 사람: {target ? `${target.name ?? "이름 없음"} (${target.accountId})` : "아직 안 골랐어요"}</p>
          </div>
        )}
        <label className={ui.field}>
          <span className={ui.label}>선물함 쪽지 (비우면 기본 문구)</span>
          <textarea className={cx(ui.input, social.note)} value={note} maxLength={200} rows={2} onChange={(e) => setNote(e.target.value)} />
        </label>
        <button type="submit" className={cx(ui.button, armed ? ui.danger : ui.primary)} disabled={busy || !ready}>
          {armed ? "정말 전체에게 보낼까요? (한 번 더 누르기)" : "만들어서 선물함으로 보내기"}
        </button>
        <p className={ui.hint}>유저는 선물함에서 받은 뒤 가방(염색권 칸)이나 상점 염색·외형에서 부위만 골라 써요.</p>
      </form>

      <div className={social.logBox}>
        <h2 className={styles.subTitle}>발급 기록</h2>
        {!data && <Loading />}
        {data?.issues.length === 0 && <Empty>아직 발급한 염색권이 없어요.</Empty>}
        {data && data.issues.length > 0 && (
          <div className={styles.tableWrap}>
            <table className={styles.table} aria-label="염색권 발급 기록">
              <thead>
                <tr>
                  <th scope="col">보낸 때</th>
                  <th scope="col">염색권</th>
                  <th scope="col">색</th>
                  <th scope="col" className={styles.num}>
                    수량
                  </th>
                  <th scope="col">대상</th>
                </tr>
              </thead>
              <tbody>
                {data.issues.map((i) => (
                  <tr key={`${i.defId}-${i.at}`}>
                    <td className={styles.nowrap}>{when(i.at)}</td>
                    <td>{i.name}</td>
                    <td>
                      <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: 3, background: i.color, verticalAlign: "middle" }} aria-hidden="true" /> {i.color}
                    </td>
                    <td className={styles.num}>{i.count}</td>
                    <td>{i.target === "all" ? "전체" : i.target.slice(0, 8)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
