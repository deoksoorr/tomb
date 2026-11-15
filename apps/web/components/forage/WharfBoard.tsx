"use client";

import { useEffect, useState } from "react";
import Dialog from "../ui/Dialog";
import QuestBoard from "./QuestBoard";
import StampExchange from "./StampExchange";
import UrgentPanel from "./UrgentPanel";
import { questStore, useQuests } from "./questStore";
import { urgentStore, useUrgent } from "./urgentStore";
import s from "./forage.module.css";
import qs from "./quest.module.css";
import us from "./urgent.module.css";

// 11/15 납품 부두 의뢰 게시판 창: 맨 위에 지금 가진 의뢰 도장을 크게, 아래에 [의뢰] · [도장 교환소] 칸.
// 의뢰판·교환소는 수집가 유령 창과 같은 컴포넌트(QuestBoard·StampExchange)를 그대로 쓴다
// 11/15 [긴급] 칸: 긴급 의뢰가 진행 중이거나 받을 보상이 있으면 맨 앞에 생기고, 그때 열면 그 칸부터 (UrgentPanel)

type Tab = "urgent" | "quest" | "shop";

export default function WharfBoard({ onClose }: { onClose: () => void }) {
  const { board } = useQuests();
  const { pub, mine } = useUrgent();
  // 연 때 기준 (탭 고르기·점 표시만 — 남은 시간은 긴급 칸이 따로 센다)
  const [openedAt] = useState(() => Date.now());
  const live = !!pub?.ev && openedAt < pub.ev.end;
  const claimable = !!mine?.rows.some((r) => r.done && r.reward && !r.claimed);
  const showUrgent = !!pub?.ev || claimable || !!mine?.rows.some((r) => r.done && r.mine > 0) || !!mine?.sup;
  const [tab, setTab] = useState<Tab | null>(null);
  // 처음 열 때: 긴급 의뢰가 진행 중이거나 받을 보상이 있으면 그 칸부터 (한 번 정하면 보상을 받은 뒤에도 그 칸에 머문다)
  const [autoUrgent, setAutoUrgent] = useState(false);
  if ((live || claimable) && !autoUrgent && tab === null) setAutoUrgent(true);
  const cur: Tab = tab ?? (autoUrgent ? "urgent" : "quest");
  useEffect(() => {
    void questStore.refresh();
    void urgentStore.refreshMine();
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
          {(showUrgent || cur === "urgent") && (
            <button type="button" role="tab" aria-selected={cur === "urgent"} className={qs.tab} onClick={() => setTab("urgent")}>
              긴급
              {(live || claimable) && <span className={us.tabBadge} aria-hidden="true" />}
            </button>
          )}
          <button type="button" role="tab" aria-selected={cur === "quest"} className={qs.tab} onClick={() => setTab("quest")}>
            의뢰
          </button>
          <button type="button" role="tab" aria-selected={cur === "shop"} className={qs.tab} onClick={() => setTab("shop")}>
            도장 교환소
          </button>
        </div>
        {cur === "urgent" ? <UrgentPanel /> : cur === "quest" ? <QuestBoard /> : <StampExchange />}
      </div>
    </Dialog>
  );
}
