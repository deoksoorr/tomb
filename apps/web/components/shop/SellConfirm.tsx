"use client";

import { useState } from "react";
import { itemById } from "@tomb/protocol";
import { errorMessage } from "@/lib/api";
import { dyeApi } from "@/lib/dye/client";
import type { StyleChangeResponse } from "@/lib/dye/types";
import { resellPrice } from "@/lib/resell";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./SellConfirm.module.css";

// 11/22 꾸미기 되팔기 확인 창 (상점 자세히 보기의 [팔기]). 되팔기는 상점 한 곳에서만 한다 (운영자 — 가방에는 값·단추를 두지 않는다).
// 서버 POST /api/shop/sell (lib/resellService) — 정가의 30%, 염색 칸·칠한 색은 같이 사라진다

export default function SellConfirm({
  itemId,
  dyed,
  onClose,
  onSold,
}: {
  itemId: string;
  /** 칠한 색·칸이 있으면 사라진다고 한 줄 더 */
  dyed: boolean;
  onClose: () => void;
  /** 판 뒤 (응답: 바뀐 내 정보 + 받은 포인트) */
  onSold: (res: StyleChangeResponse & { paid: number }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = itemById(itemId)?.name ?? itemId;

  async function sell() {
    setBusy(true);
    setError(null);
    try {
      onSold(await dyeApi.sell(itemId));
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={`${name}을(를) 팔까요?`} onClose={onClose} kind="confirm" closable={!busy}>
      <div className={styles.confirm}>
        <p>
          {resellPrice(itemId).toLocaleString("ko-KR")}P를 받아요. 다시 사려면 정가를 내야 해요.
          {dyed ? " 색 칸과 칠한 색은 사라지고 돌려받지 않아요." : ""}
        </p>
        {error && <p className={ui.error}>{error}</p>}
        <div className={styles.acts}>
          <button type="button" className={ui.button} disabled={busy} onClick={onClose}>
            그만두기
          </button>
          <button type="button" className={cx(ui.button, ui.danger)} disabled={busy} onClick={() => void sell()}>
            {busy ? "파는 중…" : "팔기"}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
