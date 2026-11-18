"use client";

import { useEffect, useState } from "react";
import type { AdminReviewRow } from "@/app/api/admin/rpg/review/route";
import { ApiRequestError, errorMessage } from "@/lib/api";
import { titleDef } from "@/lib/titles";
import ui from "./AdminUi.module.css";
import { adminApi } from "./adminApi";
import { Empty, Failed, Loading } from "./PanelState";
import s from "./ReviewPanel.module.css";

// 11/18 기록 확인 (보안 검토): 서버가 확신할 수 없는 기록을 버리지 않고 붙잡아 둔 것.
//  - 의심 판: 너무 빨리 깬 야근 빌딩 판 (판·포인트만 받고 나머지는 인정하면 판 끝과 같은 정산)
//  - 서버 최초 칭호: 한 명뿐인 칭호 (같은 칭호는 먼저 조건을 채운 사람부터)
//  - 서버 최고 층: 남이 가진 서버 전체 최고 층을 새로 깬 정상 판 (보상은 다 받았고, 꼭대기 층 주인·전체 랭킹 기록만)

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const pad = (n: number) => String(n).padStart(2, "0");
function when(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const mmss = (ms: number) => `${Math.floor(ms / 60_000)}분 ${pad(Math.floor((ms % 60_000) / 1000))}초`;

const KIND: Record<AdminReviewRow["kind"], { label: string; cls: string }> = {
  tower: { label: "의심 판", cls: s.tagSus },
  first: { label: "서버 최초 칭호", cls: s.tagFirst },
  top: { label: "서버 최고 층", cls: s.tagTop },
};

/** 의심 사유를 사람 말로 (모르는 것은 운영 로그 표시 그대로) */
function whyText(w: string): string {
  const m = /^(deal|floorTime):(\d+)s\/(\d+)s/.exec(w);
  if (m) return m[1] === "deal" ? `최대 피해로도 ${m[2]}초는 걸리는데 ${m[3]}초에 깼어요` : `층을 깨는 데 최소 ${m[2]}초인데 ${m[3]}초에 깼어요`;
  if (w.startsWith("rate:")) return `처치 수가 처치 속도 상한을 넘었어요 (${w.slice(5)})`;
  if (w.startsWith("cards:")) return `카드 기록이 맞지 않아요 (${w.slice(6)})`;
  if (w.startsWith("need:")) return `깬 층 몬스터 기록이 모자라요 (${w.slice(5)})`;
  if (w.startsWith("kill:")) return `출현 상한보다 많이 잡았어요 (${w.slice(5)})`;
  return w;
}

/** 확인 창에 쓸 한 줄 */
function what(it: AdminReviewRow): string {
  if (it.kind === "first") return `「${titleDef(it.titleId)?.name ?? it.titleId}」 칭호`;
  if (it.kind === "top") return `서버 최고 ${it.floor}층 기록`;
  return `${it.start}층부터 ${it.start + it.floors - 1}층까지 깬 판`;
}

export default function ReviewPanel({ toast, onAuthLost }: Props) {
  const [items, setItems] = useState<AdminReviewRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    adminApi
      .reviews()
      .then((r) => {
        if (!live) return;
        setItems(r.items);
        setFailed(false);
      })
      .catch((e) => {
        if (!live) return;
        setFailed(true);
        if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      });
    return () => {
      live = false;
    };
  }, [version, onAuthLost]);

  async function act(it: AdminReviewRow, action: "approve" | "reject") {
    const who = it.name ?? it.acct.slice(0, 6);
    const lost = it.kind === "top" ? "전체 랭킹과 꼭대기 층에 올리지 않아요. 이미 받은 보상은 그대로예요." : "붙잡아 둔 것은 주지 않아요.";
    const ask = action === "approve" ? `${who}님의 ${what(it)}을 인정할까요? 되돌릴 수 없어요.` : `${who}님의 ${what(it)}을 거절할까요? ${lost}`;
    if (!window.confirm(ask)) return;
    setBusy(it.id);
    try {
      const r = await adminApi.review(it.id, action);
      const res = r.result;
      if (action === "reject") toast("거절했어요.");
      else if (res?.kind === "first") toast(res.granted ? "칭호를 줬어요." : "이미 다른 사람이 주인이라 주지 못했어요.");
      else if (res?.kind === "top") toast(res.took ? "꼭대기 층 주인과 랭킹에 올렸어요." : "랭킹에 올렸어요. 그사이 더 높은 기록이 있어 꼭대기 층 주인은 그대로예요.");
      else toast(`정산했어요. 우두머리 상자 ${res?.reward.tower?.chests.length ?? 0}개, 초월 EXP +${(res?.reward.transcend?.exp ?? 0).toLocaleString("ko-KR")}`);
      setVersion((v) => v + 1);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) onAuthLost();
      else toast(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  if (failed) return <Failed onRetry={() => setVersion((v) => v + 1)} />;
  if (!items) return <Loading />;
  if (!items.length) return <Empty>확인할 기록이 없어요.</Empty>;
  return (
    <section className={s.wrap} aria-label="기록 확인">
      <p className={ui.hint}>
        의심 판은 포인트만 먼저 받았어요. 인정하면 최고 층, 랭킹, 우두머리 상자, 초월 EXP가 판 끝과 똑같이 들어가요. 서버 최고 층은 보상을 다 받았고, 인정하면 꼭대기 층 주인과
        전체 랭킹에 올라가요. 서버 최초 칭호는 먼저 조건을 채운 사람부터 확인해요.
      </p>
      <ul className={s.list}>
        {items.map((it) => (
          <li key={it.id} className={s.card}>
            <p className={s.head}>
              <span className={`${s.tag} ${KIND[it.kind].cls}`}>{KIND[it.kind].label}</span>
              <b>{it.name ?? "(이름 없음)"}</b>
              <span className={s.meta}>{when(it.at)}</span>
            </p>
            {it.kind === "first" && <p>「{titleDef(it.titleId)?.name ?? it.titleId}」 칭호를 기다려요.</p>}
            {it.kind === "top" && (
              <p>
                {it.floor}층에 올라 서버 최고 기록을 새로 깼어요. 깬 시각은 판 시작부터 {mmss(it.floorMs)}이에요.
              </p>
            )}
            {it.kind === "tower" && (
              <>
                <p>
                  야근 빌딩 {it.start}층부터 {it.start + it.floors - 1}층까지 ({it.floors}층), 판 시간 {mmss(it.durationMs)}, 서버가 잰 시간 {mmss(it.elapsed)}
                </p>
                <p className={s.meta}>
                  Lv.{it.level}, 장비 힘 ×{it.gp}, 처치 {it.kills.toLocaleString("ko-KR")}마리, 카드 {it.cards}장{it.dm ? `, 최대 피해 ${it.dm.toLocaleString("ko-KR")}/초` : ""}
                </p>
                <ul className={s.why}>
                  {it.why.map((w) => (
                    <li key={w}>{whyText(w)}</li>
                  ))}
                </ul>
                {it.log?.ft && it.log.ft.length > 0 && (
                  <p className={s.meta}>
                    층마다 깬 시각{" "}
                    {it.log.ft
                      .slice(0, 40)
                      .map((ms, i) => `${it.start + i}층 ${Math.round(ms / 1000)}초`)
                      .join(", ")}
                    {it.log.ft.length > 40 ? " …" : ""}
                  </p>
                )}
                {(it.log?.dmg !== undefined || it.log?.sk) && (
                  <p className={s.meta}>
                    {it.log?.dmg !== undefined ? `넣은 피해 ${Math.round(it.log.dmg).toLocaleString("ko-KR")}` : ""}
                    {it.log?.sk
                      ? `${it.log?.dmg !== undefined ? ", " : ""}스킬 ${Object.entries(it.log.sk)
                          .map(([k, n]) => `${k} ${n}번`)
                          .join(", ")}`
                      : ""}
                  </p>
                )}
              </>
            )}
            <div className={s.actions}>
              <button type="button" className={ui.button} disabled={busy !== null} onClick={() => void act(it, "approve")}>
                인정
              </button>
              <button type="button" className={`${ui.button} ${ui.danger}`} disabled={busy !== null} onClick={() => void act(it, "reject")}>
                거절
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
