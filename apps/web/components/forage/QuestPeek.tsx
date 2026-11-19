"use client";

import { useEffect, useState } from "react";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import PixelIcon from "../ui/PixelIcon";
import ui from "../ui/ui.module.css";
import QuestBoard from "./QuestBoard";
import StampExchange from "./StampExchange";
import { questStore, useQuests } from "./questStore";
import s from "./forage.module.css";
import qs from "./quest.module.css";

// 11/19 어디서든 보는 의뢰판 (데스크톱 바로 가기 [의뢰] · 폰 [메뉴] 시트): 오늘 의뢰·필요한 것·도장·가방에 있는 수만 보인다.
// 납품은 버스 정류장 마당 의뢰 게시판에서 (아래 [게시판까지 안내] → 창을 닫고 금빛 화살표로 길 안내).
// 의뢰판 사본은 questStore (날짜가 바뀌기 전에는 다시 받지 않는다 — 열 때마다 서버를 읽지 않게)

export default function QuestPeek({ onClose, onGuide }: { onClose: () => void; onGuide: () => void }) {
  const { board } = useQuests();
  // 11/19 [오늘 의뢰]·[도장 교환소] 두 칸 (교환소도 보기만 — 받기는 게시판 앞에서)
  const [tab, setTab] = useState<"quests" | "shop">("quests");
  useEffect(() => {
    void questStore.refresh();
  }, []);
  return (
    <Dialog title="의뢰 게시판" onClose={onClose}>
      <div className={s.sellShop}>
        <div className={qs.stampBig}>
          <span className={qs.seal} aria-hidden>
            印
          </span>
          <span>
            의뢰 도장 <strong>{board ? board.stamps : "…"}</strong>개
          </span>
        </div>
        <div className={qs.peekTabs} role="tablist" aria-label="의뢰 게시판 칸">
          {(
            [
              ["quests", "오늘 의뢰"],
              ["shop", "도장 교환소"],
            ] as const
          ).map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cx(ui.button, qs.peekTab, tab === id && qs.peekTabOn)} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>
        {tab === "quests" ? <QuestBoard viewOnly /> : <StampExchange viewOnly />}
        <div className={qs.peekFoot}>
          <p>납품은 마을 의뢰 게시판에서 해요. 버스 정류장 마당에 있어요.</p>
          <button type="button" className={cx(ui.button, ui.primary)} onClick={onGuide}>
            <PixelIcon name="target" />
            게시판까지 안내
          </button>
        </div>
      </div>
    </Dialog>
  );
}
