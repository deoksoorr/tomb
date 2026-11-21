"use client";

import { useState } from "react";
import { bridge } from "@/game/bridge";
import { avatarColorSpec } from "@/game/sprites/avatar";
import type { ChairMode } from "@/lib/chairman/rules";
import { useBridgeEvent } from "@/lib/hooks/useBridge";
import { boardTops, dropChairStatus } from "./chairData";
import ChairEntryDialog from "./ChairEntryDialog";
import ChairIntro from "./ChairIntro";
import { boardTags, ledLine } from "./chairText";

// 11/20 회장님 독대 UI 묶음 (GameShell에 하나):
//  chairman:door (등대 문 E) → 입장 창 → [사직서 내기] → 입장 연출 → 가장 하얄 때 chairman:enter {mode, practice}
//  → game/chairman(ChairmanHostScene)이 판 시작·싸움·결과 창. 회장실이 뜨면(chairman:ui · 사냥 장면) 하얀빛이 걷힌다.
//  chairman:result → 상태 기억을 버린다. chairman:aborted(11/22 시작 전 나가기) → 상태 버림 + 돌려받았으면 토스트. lighthouse:want → 이번 주 노멀·헬 현재 1위로 전광판 글·이름표 (lighthouse:board).

/** 회장실이 안 떠도 이만큼 지나면 하얀빛을 걷는다 */
const ENTER_WAIT_MS = 6000;

type Props = { color: string; body: string; onOpenRace: () => void; canOpen: boolean };

export default function ChairLayer({ color, body, onOpenRace, canOpen }: Props) {
  const [open, setOpen] = useState(false);
  const [intro, setIntro] = useState<{ mode: ChairMode; practice: boolean } | null>(null);

  useBridgeEvent("chairman:door", () => {
    if (canOpen && !intro) setOpen(true);
  });
  const board = () =>
    void boardTops()
      .then((t) => bridge.emit("lighthouse:board", { led: ledLine(t), tags: boardTags(t) }))
      .catch(() => undefined);
  useBridgeEvent("lighthouse:want", board);
  useBridgeEvent("chairman:result", () => {
    dropChairStatus();
    board();
  });
  // 11/22 시작 전 나가기: 상태를 새로 받게 버리고, 판을 돌려받았으면 마을에 한 줄
  useBridgeEvent("chairman:aborted", (a) => {
    dropChairStatus();
    if (a.refunded) bridge.emit("toast", { message: "오늘 판을 돌려드렸어요" });
  });

  /** 싸움 부르기 → 회장실이 뜰 때까지 (또는 오류) */
  const enter = (mode: ChairMode, practice: boolean) =>
    new Promise<void>((resolve) => {
      const offs: (() => void)[] = [];
      const done = () => {
        for (const o of offs.splice(0)) o();
        clearTimeout(t);
        resolve();
      };
      const t = setTimeout(done, ENTER_WAIT_MS);
      offs.push(
        bridge.on("chairman:ui", (u) => {
          if (!(u.kind === "status" && u.state === "starting")) done();
        }),
        bridge.on("scene:changed", (c) => c.scene === "hunt" && done()),
      );
      bridge.emit("chairman:enter", { mode, practice });
    });

  const look = bridge.last("look:set");
  return (
    <>
      {open && (
        <ChairEntryDialog
          onClose={() => setOpen(false)}
          onOpenRace={() => {
            setOpen(false);
            onOpenRace();
          }}
          onStart={(mode, practice) => {
            setOpen(false);
            setIntro({ mode, practice });
          }}
        />
      )}
      {intro && (
        <ChairIntro
          me={{ body: look?.body ?? body, color: avatarColorSpec(color, look?.dye), look: look?.look ?? [] }}
          mode={intro.mode}
          onEnter={() => enter(intro.mode, intro.practice)}
          onEnd={() => setIntro(null)}
        />
      )}
    </>
  );
}
