"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { isTouchUi } from "@/game/input/keyHint";
import { rideStopNotice, type RideKind } from "@/lib/ridePolicy";
import { dismountPetThen, rideGate, rideKindNow } from "@/lib/rideGate";
import { clearRideStop, rideStopNow, subscribeRideStop, type RideStopReq } from "@/lib/rideStop";
import Dialog from "../ui/Dialog";
import { cx } from "../ui/cx";
import ui from "../ui/ui.module.css";
import s from "./RideStopDialog.module.css";

/**
 * 11/22 탈것에 탄 채 사냥터·귀신의 집·집 같은 입구에서 막혔을 때 화면 가운데 알림 (예전엔 창 아래 작은 글씨·아래 토스트라 잘 몰랐어요).
 * 타는 펫이면 [goLabel]: 펫에서 내린 뒤(lib/rideGate dismountPetThen) onGo — 부른 쪽이 원래 하려던 걸 이어서 해요.
 * 내려지지 않았으면(1.5초 안에 장면이 알리지 않음) 알림은 그대로 두고 문구만 바꿔요
 */
export default function RideStopDialog({ kind, todo, goLabel, onGo, onClose }: { kind: RideKind; todo: string; goLabel?: string; onGo?: () => void; onClose: () => void }) {
  const [touch] = useState(isTouchUi);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const n = rideStopNotice(kind, todo, touch);
  const canGo = n.dismount && !!goLabel && !!onGo;
  return (
    <Dialog kind="confirm" title={n.title} onClose={onClose}>
      <div className={s.body} data-testid="ride-stop">
        <p className={s.text}>{n.text}</p>
        {n.hint && <p className={s.hint}>{failed ? "지금은 내릴 수 없어요. 잠깐 뒤에 다시 눌러 주세요." : n.hint}</p>}
        <div className={s.buttons}>
          {canGo && (
            <button
              type="button"
              className={cx(ui.button, ui.primary)}
              disabled={waiting}
              onClick={() => {
                setWaiting(true);
                setFailed(false);
                dismountPetThen((ok) => {
                  setWaiting(false);
                  if (ok) onGo();
                  else setFailed(true);
                });
              }}
            >
              {goLabel}
            </button>
          )}
          <button type="button" className={cx(ui.button, !canGo && ui.primary)} onClick={onClose}>
            확인
          </button>
        </div>
      </div>
    </Dialog>
  );
}

/**
 * 11/22 창 자리에 띄우는 알림 (사냥터·귀신의 집·별자리·집 창): 창이 살아 있어야 [내리고 ○○하기]로 이어서 할 수 있어서
 * 창은 그대로 두고 그 창 대신 알림을 그린다 (`if (rideStop) return rideStop;`). [확인]·×는 onClose(창까지 닫기).
 * gate(todo, go?) = rideGate와 같지만 막히면 알림을 띄우고 true
 */
export function useRideStopGate(onClose: () => void): { rideStop: ReactNode; gate: (todo: string, go?: RideStopReq["go"]) => boolean } {
  const [stop, setStop] = useState<Omit<RideStopReq, "onClose"> | null>(null);
  const gate = useCallback((todo: string, go?: RideStopReq["go"]) => {
    if (!rideGate(todo, true)) return false;
    setStop({ kind: rideKindNow() ?? "other", todo, ...(go ? { go } : {}) });
    return true;
  }, []);
  const rideStop = stop ? (
    <RideStopDialog
      kind={stop.kind}
      todo={stop.todo}
      {...(stop.go ? { goLabel: stop.go.label } : {})}
      onGo={() => {
        setStop(null);
        stop.go?.run();
      }}
      onClose={() => {
        setStop(null);
        onClose();
      }}
    />
  ) : null;
  return { rideStop, gate };
}

/** 11/22 화면 전체에 하나 (GameShell): 창을 닫고 알림만 남기는 곳의 알림 (lib/rideStop rideGateAlert) */
export function RideStopHost() {
  const req = useSyncExternalStore(subscribeRideStop, rideStopNow, () => null);
  if (!req) return null;
  return (
    <RideStopDialog
      // 새 알림이면 새 창 (기다리는 중·실패 문구를 남기지 않게)
      key={`${req.kind}:${req.todo}`}
      kind={req.kind}
      todo={req.todo}
      {...(req.go ? { goLabel: req.go.label } : {})}
      onGo={() => {
        clearRideStop();
        req.go?.run();
      }}
      onClose={() => {
        clearRideStop();
        req.onClose?.();
      }}
    />
  );
}
