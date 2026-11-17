"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트 */
import { useEffect, useState } from "react";
import { bridge } from "@/game/bridge";
import { ghostMerchantArt, MERCHANT_H, MERCHANT_W } from "@/game/sea/ghostShipArt";
import { errorMessage } from "@/lib/api";
import { meStore } from "@/lib/hooks/useMe";
import { ghostApi } from "@/lib/sea/ghostClient";
import type { GhostRow, GhostStatus } from "@/lib/sea/ghostService";
import { applyStyle } from "../account/actions";
import { FurnitureIcon } from "../housing/parts";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import s from "./GhostShop.module.css";

// 11/17 유령선 특가 장터 창 (갑판의 유령 상인 앞에서 E). 상점 창과 같은 틀에 녹색 등불 빛.
// 원래 값에 줄을 긋고 낼 값을 같이 보여 줘요. 값·할인·1인 1개·열린 시간은 모두 서버가 정해요 (lib/sea/ghostService).

const TAG_TEXT: Record<GhostRow["tag"], string> = { sale: "30% 할인", deal: "오늘의 파격가", limited: "유령선 한정" };

/** 상인 얼굴 (게임 그림 첫 장) */
function merchantUrl(): string {
  if (typeof document === "undefined") return "";
  const { grid } = ghostMerchantArt();
  const c = document.createElement("canvas");
  c.width = MERCHANT_W;
  c.height = MERCHANT_H;
  const full = grid.toCanvas();
  c.getContext("2d")?.drawImage(full, 0, 0, MERCHANT_W, MERCHANT_H, 0, 0, MERCHANT_W, MERCHANT_H);
  return c.toDataURL();
}

/** 열린 때 안내 (짧은 해요체) */
function stateLine(st: GhostStatus): string {
  if (st.open) return st.call === "on" ? "운영자 시험으로 불렀어요. 물건마다 한 사람에 하나씩 팔아요." : "밤 11시까지 열어요. 물건마다 한 사람에 하나씩 팔아요.";
  if (st.phase === "fog") return "안개 속에서 배를 대는 중이에요. 밤 9시에 열어요.";
  if (st.phase === "leaving") return "장터를 닫고 안개 속으로 떠나는 중이에요.";
  return "유령선이 떠나 있어요. 토요일 밤 9시에 다시 와요.";
}

export default function GhostShop({ onClose }: { onClose: () => void }) {
  const [st, setSt] = useState<GhostStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [face] = useState(merchantUrl);

  useEffect(() => {
    let live = true;
    ghostApi
      .status()
      .then((r) => live && setSt(r))
      .catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, []);

  async function buy(row: GhostRow) {
    setPending(true);
    setNotice(null);
    try {
      const r = await ghostApi.buy(row.key);
      setSt(r);
      if (r.lookGrant) applyStyle({ me: r.me, lookGrant: r.lookGrant });
      else meStore.set(r.me);
      bridge.emit("forage:coin");
      setNotice(row.kind === "cosmetic" ? `${r.got}, 영구로 가졌어요. 가방의 꾸미기에서 입을 수 있어요.` : `${r.got}, 가구 가방에 넣었어요. 집에서 꾸미기로 놓을 수 있어요.`);
    } catch (e) {
      setNotice(errorMessage(e));
      // 값·열림이 바뀌었을 수 있어요 → 다시 받아요
      ghostApi.status().then(setSt).catch(() => undefined);
    } finally {
      setPending(false);
      setConfirm(null);
    }
  }

  return (
    <Dialog title="유령 상인의 장터" onClose={onClose}>
      <div className={s.shop}>
        <div className={s.hello}>
          {face && <img src={face} width={MERCHANT_W * 2} height={MERCHANT_H * 2} alt="" className={s.face} />}
          <p>
            어서 와요, 산 사람 손님. 안개가 걷히기 전에 골라요.
            <br />
            <span className={s.muted}>{st ? stateLine(st) : "등불을 켜는 중이에요…"}</span>
          </p>
        </div>
        <p className={s.balance}>
          내 포인트 <strong>{st ? st.points.toLocaleString("ko-KR") : "–"}</strong>
        </p>
        {error && <p className={ui.error}>{error}</p>}
        {st && (
          <ul className={s.grid} aria-label="이번 주 유령선 물건">
            {st.items.map((row) => {
              const short = st.points < row.cost;
              const noHouse = row.kind === "furniture" && !st.house;
              const asking = confirm === row.key;
              return (
                <li key={row.key} className={s.card} data-tag={row.tag} data-bought={row.bought || undefined}>
                  <span className={s.ribbon}>{TAG_TEXT[row.tag]}</span>
                  <span className={s.thumb}>{row.kind === "cosmetic" ? <ItemIcon itemId={row.id} size={48} /> : <FurnitureIcon itemId={row.id} size={48} />}</span>
                  <span className={s.name}>{row.name}</span>
                  <span className={s.kind}>{row.kind === "cosmetic" ? "꾸미기 · 영구" : "가구"}</span>
                  <span className={s.price}>
                    {row.cost < row.base ? (
                      <>
                        <s className={s.old}>{row.base.toLocaleString("ko-KR")}P</s> <strong>{row.cost.toLocaleString("ko-KR")}P</strong>
                        <span className={s.off}>−{Math.round(row.rate * 100)}%</span>
                      </>
                    ) : (
                      <strong>{row.cost.toLocaleString("ko-KR")}P</strong>
                    )}
                  </span>
                  {row.bought ? (
                    <span className={s.done}>샀어요</span>
                  ) : asking ? (
                    <span className={s.ask}>
                      <button type="button" className={cx(ui.button, s.buy)} disabled={pending} onClick={() => void buy(row)}>
                        {pending ? "사는 중…" : "정말 살래요"}
                      </button>
                      <button type="button" className={ui.button} disabled={pending} onClick={() => setConfirm(null)}>
                        그만두기
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={cx(ui.button, s.buy)}
                      disabled={!st.open || pending || short || noHouse}
                      onClick={() => setConfirm(row.key)}
                      aria-label={`${row.name}, ${row.cost}포인트에 사기`}
                    >
                      {!st.open ? "닫혔어요" : noHouse ? "집이 있어야 해요" : short ? "포인트가 모자라요" : "사기"}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <p className={ui.hint} role="status">
          {notice ?? "포인트왕이나 칭호 할인이 더 크면 그 할인으로 셈해요. 할인은 가장 큰 것 하나만 먹어요."}
        </p>
      </div>
    </Dialog>
  );
}
