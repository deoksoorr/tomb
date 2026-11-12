"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/lib/api";
import { lifespanLabel, todayKst } from "@/lib/epitaph";
import { DEFAULT_PASS_DAYS, type PassedEntry } from "@/lib/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import { EmptyHero } from "../ui/InfoBlocks";
import ui from "../ui/ui.module.css";
import StyleArt from "./StyleArt";
import styles from "./PassedDialog.module.css";

type Props = {
  onClose: () => void;
  /** 목록 아래에 덧붙일 내용 (게임 안: 지금 채널 묘역 현황) */
  footer?: ReactNode;
};

const SEARCH_DELAY_MS = 300;

/** 성불한 이야기들 (49번): 묘역을 떠난 묘비들. 최신 성불 순, 이름·묘비명·상주 검색, 받은 헌화 수 */
export default function PassedDialog({ onClose, footer }: Props) {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  /** 받은 결과와 그 검색어 (검색어가 바뀌면 새 결과가 올 때까지 "불러오는 중") */
  const [page, setPage] = useState<{ q: string; entries: PassedEntry[]; next: number | null; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  // 입력을 멈추면 찾는다
  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    let alive = true;
    api
      .passed(q)
      .then((r) => {
        if (!alive) return;
        setError(null);
        setPage({ q, entries: r.entries, next: r.next, total: r.total });
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(errorMessage(e));
        setPage({ q, entries: [], next: null, total: 0 });
      });
    return () => {
      alive = false;
    };
  }, [q]);

  const entries = page && page.q === q ? page.entries : null;
  const next = page?.next ?? null;
  const total = page?.total ?? 0;

  async function more() {
    if (!page || next === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const r = await api.passed(q, next);
      setPage((p) => p && { ...p, entries: [...p.entries, ...r.entries.filter((e) => !p.entries.some((x) => x.id === e.id))], next: r.next });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <Dialog title="성불한 이야기들" onClose={onClose}>
      <div className={styles.wrap}>
        <p className={ui.hint}>묘비는 세운 뒤 시간이 지나면 성불해 묘역을 떠나요. 떠난 이야기들은 여기에 남아요.</p>
        <input
          type="search"
          className={cx(ui.input, styles.search)}
          placeholder="이름·묘비명·상주로 찾기"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="성불한 이야기 찾기"
        />
        {entries === null ? (
          <p className={styles.state} role="status">
            불러오는 중…
          </p>
        ) : entries.length === 0 ? (
          error || q ? (
            <p className={styles.state}>{error ?? "찾는 이야기가 없어요."}</p>
          ) : (
            <EmptyHero icon="candle" title="아직 성불한 이야기가 없어요">
              묘비는 세운 지 {DEFAULT_PASS_DAYS}일이 지나면 성불해 묘역을 떠나요. 떠난 묘비의 묘비명·상주의 한마디·받은 헌화가 이곳에
              남아, 이름이나 상주로 다시 찾아볼 수 있어요.
            </EmptyHero>
          )
        ) : (
          <>
            {q && <p className={ui.hint}>{total}개 찾았어요.</p>}
            <ul className={styles.list}>
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => setOpen((id) => (id === e.id ? null : e.id))}
                    aria-expanded={open === e.id}
                  >
                    <StyleArt style={e.style} ageDays={e.ageDays} scale={1} />
                    <span className={styles.main}>
                      <span className={styles.name}>{e.name}</span>
                      <span className={styles.meta}>
                        상주 {e.mourner} · {todayKst(e.passedAt).replaceAll("-", ".")} 성불
                      </span>
                    </span>
                    <span className={styles.flowers} aria-label={`받은 헌화 ${e.flowers}`}>
                      🌼 {e.flowers}
                    </span>
                  </button>
                  {open === e.id && (
                    <div className={styles.detail}>
                      <p className={styles.epitaph}>{e.epitaph}</p>
                      {e.comment && <p>{`상주의 한마디: ${e.comment}`}</p>}
                      <p className={ui.hint}>
                        {lifespanLabel(e.bornAt, e.diedAt, e.ageDays)} · {e.channel}채널에 {todayKst(e.createdAt).replaceAll("-", ".")} 안장
                      </p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {next !== null && (
              <button type="button" className={cx(ui.button, styles.more)} onClick={() => void more()} disabled={loadingMore}>
                {loadingMore ? "불러오는 중…" : "더 보기"}
              </button>
            )}
          </>
        )}
        {footer}
      </div>
    </Dialog>
  );
}
