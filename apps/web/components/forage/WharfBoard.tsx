"use client";

import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import QuestBoard from "./QuestBoard";
import StampExchange from "./StampExchange";
import { questStore, useQuests } from "./questStore";
import s from "./forage.module.css";
import qs from "./quest.module.css";

// 11/15 납품 부두 의뢰 게시판 창: 맨 위에 지금 가진 의뢰 도장을 크게, 아래에 [의뢰] · [도장 교환소] 칸.
// 의뢰판·교환소는 수집가 유령 창과 같은 컴포넌트(QuestBoard·StampExchange)를 그대로 쓴다

type Tab = "quest" | "shop";

export default function WharfBoard({ onClose }: { onClose: () => void }) {
  const { board } = useQuests();
  const [tab, setTab] = useState<Tab>("quest");
  useEffect(() => {
    void questStore.refresh();
  }, []);
  return (
    <Dialog title="의뢰 게시판 · 납품 부두" onClose={onClose}>
      <div className={s.sellShop}>
        <div className={qs.stampBig}>
          <span className={qs.seal} aria-hidden>
            印
          </span>
          <span>
            의뢰 도장 <strong>{board ? board.stamps : "…"}</strong>개
          </span>
        </div>
        <div className={qs.tabs} role="tablist" aria-label="의뢰 게시판">
          <button type="button" role="tab" aria-selected={tab === "quest"} className={qs.tab} onClick={() => setTab("quest")}>
            의뢰
          </button>
          <button type="button" role="tab" aria-selected={tab === "shop"} className={qs.tab} onClick={() => setTab("shop")}>
            도장 교환소
          </button>
        </div>
        {tab === "quest" ? <QuestBoard /> : <StampExchange />}
      </div>
    </Dialog>
  );
}
