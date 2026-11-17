"use client";

/* eslint-disable @next/next/no-img-element -- 그 자리에서 그린 작은 픽셀 그림 */
import { useEffect, useMemo, useState } from "react";
import { bridge } from "@/game/bridge";
import { snackBagIcon } from "@/game/sea/gullArt";
import { errorMessage } from "@/lib/api";
import { useBridgeEvent, useBridgeValue } from "@/lib/hooks/useBridge";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { SNACK, SNACK_KINDS, type GullSnacks, type SnackKind } from "@/lib/sea/gull";
import { gullApi, publishSnacks, setSnackHand } from "@/lib/sea/gullClient";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import s from "./GullSnacks.module.css";

// 11/17 r2 포구 갈매기 과자 UI (사용자 피드백):
//  - 과자 자판기 창: 선착장 길목 「과자 자판기」 앞 E (게임 sea:snack:vend). 매점 창에서 옮겼어요 — 값·하루 10개는 그대로 (서버 lib/sea/gullService)
//  - 과자 칸: 바닷가에 있는 동안 물때 줄 아래에 가진 과자 개수 (손에 든 과자 강조 · 눌러서 바꿔 들어요) +
//    던질 수 있는 곳이면 [과자 던지기] (가장 가까운 갈매기 쪽으로 — 게임 sea:snack:throw). 없으면 자판기 안내

/** 과자 봉지 그림 (16×16, 한 번만 그려요) */
function useSnackIcons(): Record<SnackKind, string> {
  return useMemo(() => {
    try {
      return { plain: snackBagIcon(false).toCanvas().toDataURL(), spicy: snackBagIcon(true).toCanvas().toDataURL() };
    } catch {
      return { plain: "", spicy: "" };
    }
  }, []);
}

/** 던질 과자 (손에 든 것, 다 떨어졌으면 다른 것) */
function thrownKind(v: { plain: number; spicy: number; hand: SnackKind }): SnackKind {
  const other: SnackKind = v.hand === "plain" ? "spicy" : "plain";
  return v[v.hand] > 0 || v[other] <= 0 ? v.hand : other;
}

/** 과자 칸 (Hud 물때 줄 아래). compact = 터치 화면 위 가장자리 묶음 안 */
export function SnackBar({ compact = false }: { compact?: boolean }) {
  const map = useBridgeValue("map:changed")?.map;
  const snacks = useBridgeValue("sea:gull:snacks");
  const can = useBridgeValue("sea:snack:can");
  const icons = useSnackIcons();
  if (map !== "sea" || !snacks) return null;
  const held = thrownKind(snacks);
  return (
    <div className={s.bar} data-compact={compact || undefined} role="group" aria-label="가진 갈매기 과자">
      {/* 11/17 다 써도 개수 칸(0)만 그대로 보여요 — 「자판기에서 사요」 안내는 뺐어요 (사용자: 계속 떠서 거슬려요) */}
      <>
          <span className={s.chips}>
            {SNACK_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className={s.chip}
                aria-pressed={held === k}
                aria-label={`${SNACK[k].name} ${snacks[k]}개${held === k ? ", 손에 들었어요" : ", 눌러서 손에 들기"}`}
                title={SNACK[k].name}
                onClick={() => setSnackHand(k)}
              >
                {icons[k] ? <img className={s.chipIcon} src={icons[k]} alt="" aria-hidden="true" /> : null}
                <b className={s.count}>{snacks[k]}</b>
              </button>
            ))}
          </span>
          {can && snacks[can.kind] > 0 && (
            <button type="button" className={s.throw} onClick={() => bridge.emit("sea:snack:throw")} aria-label={`${SNACK[can.kind].name} 던지기, ${snacks[can.kind]}개 남았어요`}>
              {!compact && <kbd className={s.key}>F</kbd>}
              과자 던지기
              {icons[can.kind] ? <img className={s.throwIcon} src={icons[can.kind]} alt="" aria-hidden="true" /> : null}
              <b className={s.count}>{snacks[can.kind]}</b>
            </button>
          )}
      </>
    </div>
  );
}

/** 과자 자판기 창 (선착장 길목 자판기 앞 E) */
export function SnackVendLayer() {
  const [open, setOpen] = useState(false);
  useBridgeEvent("sea:snack:vend", () => setOpen(true));
  return open ? <SnackVend onClose={() => setOpen(false)} /> : null;
}

function SnackVend({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [st, setSt] = useState<GullSnacks | null>(null);
  const live = useBridgeValue("sea:gull:snacks");
  const hand: SnackKind = live?.hand ?? "plain";
  const [pending, setPending] = useState<SnackKind | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const icons = useSnackIcons();
  useEffect(() => {
    void meStore.refresh();
    gullApi.get().then((r) => {
      setSt(r);
      publishSnacks(r);
    }, () => {});
  }, []);
  async function buy(kind: SnackKind) {
    setPending(kind);
    setMsg(null);
    try {
      const r = await gullApi.buy(kind);
      meStore.set(r.me);
      setSt(r);
      setSnackHand(kind);
      publishSnacks(r);
      setMsg(`${SNACK[kind].name}를 손에 들었어요.`);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(null);
    }
  }
  // 가진 개수는 게임이 알려 준 값이 먼저 (던지면 바로 줄어요)
  const have = { plain: live?.plain ?? st?.plain ?? 0, spicy: live?.spicy ?? st?.spicy ?? 0 };
  const left = st ? Math.max(0, st.limit - st.bought) : null;
  return (
    <Dialog title="과자 자판기" onClose={onClose}>
      <div className={s.vend}>
        <p className={s.lead}>포구 갈매기가 좋아하는 과자예요. 백사장이나 선착장, 방파제에서 던져 줘요.</p>
        <div className={s.status} role="status">
          <span className={s.have} aria-label={`가진 과자, ${SNACK.plain.name} ${have.plain}개, ${SNACK.spicy.name} ${have.spicy}개`}>
            가진 과자
            {SNACK_KINDS.map((k) => (
              <span key={k} className={s.haveItem} data-hand={hand === k || undefined}>
                {icons[k] ? <img className={s.chipIcon} src={icons[k]} alt="" aria-hidden="true" /> : null}
                <b>{have[k]}</b>
              </span>
            ))}
          </span>
          <span className={s.left}>{left === null ? "오늘 살 수 있는 개수를 보는 중…" : left > 0 ? `오늘 ${left}개 더 살 수 있어요` : "오늘은 다 샀어요. 내일 새벽 5시에 다시 팔아요."}</span>
        </div>
        <ul className={s.menu}>
          {SNACK_KINDS.map((k) => (
            <li key={k} className={s.row} data-kind={k}>
              {icons[k] ? <img className={s.icon} src={icons[k]} alt="" aria-hidden="true" /> : <span className={s.icon} aria-hidden="true" />}
              <span className={s.text}>
                <b>{SNACK[k].name}</b>
                <span className={s.note}>{k === "spicy" ? "받아먹은 갈매기가 30초 동안 빨개져요. 가끔 붉은 깃털을 줘요." : "던지면 갈매기들이 몰려와요. 가끔 고맙다며 깃털을 줘요."}</span>
                <button type="button" className={cx(ui.button, s.hand)} aria-pressed={hand === k} onClick={() => setSnackHand(k)}>
                  {hand === k ? "손에 들었어요" : "손에 들기"}
                </button>
              </span>
              <button type="button" className={cx(ui.button, ui.primary, s.buy)} onClick={() => void buy(k)} disabled={pending !== null || !st || (left ?? 0) <= 0 || (me ? me.points < SNACK[k].price : false)}>
                {pending === k ? "받는 중…" : `${SNACK[k].price}P`}
              </button>
            </li>
          ))}
        </ul>
        <p className={s.foot} role="status">
          {msg ?? "하루에 두 가지를 합쳐 10개까지 살 수 있어요."}
          {me && ` 내 포인트는 ${me.points.toLocaleString("ko-KR")}P예요.`}
        </p>
      </div>
    </Dialog>
  );
}
