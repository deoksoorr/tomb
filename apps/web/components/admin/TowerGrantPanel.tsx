"use client";

import { useState, type FormEvent } from "react";
import { ApiRequestError, errorMessage } from "@/lib/api";
import type { AdminAccountRow } from "@/app/api/admin/accounts/search/route";
import type { RunReward } from "@/lib/rpg/types";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import styles from "./Admin.module.css";

// 11/15 야근 빌딩 대신 정산: 서버가 잘못 거절한 판을 판 끝과 같은 정산으로 넣는다 (우두머리 상자는 새로 굴린다).
// 걸린 시간은 운영 로그의 판 시작·거절 시각으로 셈해서 넣는다 (랭킹 동점 순서에만 쓰인다)

type Props = { toast: (message: string) => void; onAuthLost: () => void };

export default function TowerGrantPanel({ toast, onAuthLost }: Props) {
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<AdminAccountRow[] | null>(null);
  const [pick, setPick] = useState<AdminAccountRow | null>(null);
  const [start, setStart] = useState(1);
  const [floors, setFloors] = useState(10);
  const [min, setMin] = useState(10);
  const [sec, setSec] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ name: string; reward: RunReward } | null>(null);

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

  async function grant(e: FormEvent) {
    e.preventDefault();
    if (!pick) return;
    const floorMs = (min * 60 + sec) * 1000;
    const top = start + floors - 1;
    if (!window.confirm(`${pick.name ?? pick.accountId}님에게 ${start}층부터 ${top}층까지 깬 판을 넣을까요? 걸린 시간은 ${min}분 ${sec}초예요. 되돌릴 수 없어요.`)) return;
    setBusy(true);
    try {
      const r = await adminApi.towerGrant({ accountId: pick.accountId, start, floors, floorMs });
      setDone({ name: pick.name ?? pick.accountId, reward: r.reward });
      toast("정산했어요.");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  }

  const t = done?.reward.tower;
  return (
    <section className={styles.notices} aria-label="야근 빌딩 대신 정산">
      <p className={ui.hint}>서버가 잘못 거절한 판을 대신 넣어요. 최고 층, 초월 EXP, 우두머리 상자, 칭호가 판 끝과 똑같이 정산돼요. 상자는 새로 굴려요.</p>

      <form onSubmit={search} className={styles.actions}>
        <input className={ui.input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="닉네임" aria-label="닉네임으로 찾기" />
        <button type="submit" className={ui.button}>
          찾기
        </button>
      </form>
      {found && (
        <ul>
          {found.length === 0 && <li>찾는 계정이 없어요.</li>}
          {found.map((a) => (
            <li key={a.accountId}>
              <button type="button" className={ui.button} aria-pressed={pick?.accountId === a.accountId} onClick={() => setPick(a)}>
                {a.name ?? "(이름 없음)"} · {a.points.toLocaleString("ko-KR")}P
              </button>
            </li>
          ))}
        </ul>
      )}

      {pick && (
        <form onSubmit={grant} className={styles.actions}>
          <label>
            시작 층 <input className={ui.input} type="number" min={1} value={start} onChange={(e) => setStart(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label>
            깬 층 수 <input className={ui.input} type="number" min={1} value={floors} onChange={(e) => setFloors(Math.max(1, Number(e.target.value) || 1))} />
          </label>
          <label>
            걸린 시간 <input className={ui.input} type="number" min={0} value={min} onChange={(e) => setMin(Math.max(0, Number(e.target.value) || 0))} />분
            <input className={ui.input} type="number" min={0} max={59} value={sec} onChange={(e) => setSec(Math.min(59, Math.max(0, Number(e.target.value) || 0)))} />초
          </label>
          <button type="submit" className={ui.button} disabled={busy}>
            {busy ? "정산하는 중…" : `${pick.name ?? "이 계정"}님에게 넣기`}
          </button>
        </form>
      )}

      {done && t && (
        <div role="status">
          <p>
            {done.name}님: 최고 층 {t.best}층{t.newBest ? " (새 기록)" : ""}, 우두머리 상자 {t.chests.length}개, 초월 EXP +{(done.reward.transcend?.exp ?? 0).toLocaleString("ko-KR")}
          </p>
          {t.titles.length > 0 && <p>새 칭호 {t.titles.join(", ")}</p>}
          <p>받은 것 {done.reward.drops.map((d) => `${d.id}${d.qty && d.qty > 1 ? ` ×${d.qty}` : ""}`).join(", ") || "없음"}</p>
        </div>
      )}
    </section>
  );
}
