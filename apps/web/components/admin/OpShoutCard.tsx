"use client";

import { useState } from "react";
import { MEGAPHONE_MAX } from "@tomb/protocol";
import { request } from "@/lib/api";
import type { OpShoutResponse } from "@/lib/opShout";
import { cx } from "../ui/cx";
import { OpShoutPreview } from "../overlay/MegaphoneSpotlight";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import ops from "./Ops.module.css";
import s from "./OpShoutCard.module.css";

/** 미리 보기 자리 글 (아직 아무것도 안 썼을 때) */
const SAMPLE = "잠시 뒤 10시에 낚시 대회가 열려요!";

/**
 * 11/26 대시보드 「운영자 외치기」: 쓴 한 줄이 지금 접속한 모든 채널 화면 가운데에 확성기 모양 「운영자」 알림으로 떠요.
 * 기록에 남지 않아 나중에 들어온 사람은 못 봐요 (확성기 기록·채팅 기록·신고에 안 들어감). 5초에 한 번, 60자까지.
 * 게임 안 운영자 계정은 채팅에 「/외치기 할 말」
 */
export default function OpShoutCard({ toast, fail }: { toast: (m: string) => void; fail: (e: unknown) => void }) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const size = [...text.trim()].length;
  const send = async () => {
    if (!text.trim() || pending) return;
    setPending(true);
    try {
      const r = await request<OpShoutResponse>("/api/admin/shout", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      setText("");
      toast(r.sent > 0 ? `${r.sent}개 채널에 외쳤어요.` : "지금 접속한 사람이 없어 아무 채널에도 뜨지 않았어요.");
    } catch (e) {
      fail(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <div className={cx(styles.card, s.card)}>
      <div className={styles.cardHead}>
        <h3 className={styles.cardTitle}>운영자 외치기</h3>
      </div>
      <div className={s.body}>
        <form
          className={s.form}
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className={ui.field}>
            <span className={ui.label}>
              외칠 말
              <span className={ui.counter}>
                {size}/{MEGAPHONE_MAX}
              </span>
            </span>
            <input
              className={ui.input}
              type="text"
              value={text}
              maxLength={MEGAPHONE_MAX + 10}
              placeholder={SAMPLE}
              aria-invalid={size > MEGAPHONE_MAX || undefined}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          <div className={ops.row}>
            <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || size === 0 || size > MEGAPHONE_MAX}>
              {pending ? "외치는 중…" : "모든 채널에 외치기"}
            </button>
          </div>
          <p className={ui.hint}>
            지금 접속한 모든 채널(마을·바닷가·캠핑장, 집·사냥터 안 포함) 화면 가운데에 확성기처럼 떠요. 기록에는 남지 않아 나중에 들어온 사람은 못 봐요. 5초에 한 번 외칠 수 있어요.
            게임 안 운영자 계정은 채팅에 「/외치기 할 말」로 보내요.
          </p>
        </form>
        <div className={s.previewBox} aria-label="미리 보기">
          <span className={s.previewLabel}>게임 화면 미리 보기</span>
          <OpShoutPreview text={text.trim() || SAMPLE} />
        </div>
      </div>
    </div>
  );
}
