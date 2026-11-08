"use client";

import { useEffect, useId, useState } from "react";
import { errorMessage } from "@/lib/api";
import { GUEST_MAX_LEN } from "@/lib/housing/catalog";
import { housingApi } from "@/lib/housing/client";
import type { GuestEntryView } from "@/lib/housing/types";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ui from "../ui/ui.module.css";
import styles from "./housing.module.css";

const when = (at: number) =>
  new Date(at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 방명록: 최근 50개. 쓴 사람·집주인은 지울 수 있고, 다른 사람 글은 신고할 수 있다 */
export default function GuestbookDialog({ houseId, houseName, mine, onClose }: { houseId: string; houseName: string; mine: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<GuestEntryView[] | null>(null);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const fid = useId();

  useEffect(() => {
    housingApi
      .guestbook(houseId)
      .then((r) => setEntries(r.entries))
      .catch((e) => setMsg(errorMessage(e)));
  }, [houseId]);

  async function run(fn: () => Promise<{ entries: GuestEntryView[] } | null>, done: string) {
    setPending(true);
    setMsg(null);
    try {
      const r = await fn();
      if (r) setEntries(r.entries);
      setMsg(done);
    } catch (e) {
      setMsg(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog title={`${houseName} 방명록`} onClose={onClose}>
      <div className={styles.stack}>
        {!mine && (
          <form
            className={styles.stack}
            style={{ gap: 6 }}
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const r = await housingApi.writeGuest(houseId, text);
                setText("");
                return r;
              }, "남겼어요.");
            }}
          >
            <label htmlFor={`${fid}-t`} className={ui.label}>
              한마디 남기기 <span className={ui.counter}>{[...text].length}/{GUEST_MAX_LEN}</span>
            </label>
            <div className={styles.guestForm}>
              <input
                id={`${fid}-t`}
                className={ui.input}
                value={text}
                maxLength={GUEST_MAX_LEN + 4}
                onChange={(e) => setText(e.target.value)}
                placeholder="예) 석등이 참 예쁘네요"
              />
              <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !text.trim()}>
                남기기
              </button>
            </div>
            <p className={styles.small}>하루 10개까지, 링크는 넣을 수 없어요. 서로 다른 세 사람이 신고하면 가려져요.</p>
          </form>
        )}
        {entries === null && !msg && <p className={styles.muted}>불러오는 중…</p>}
        {entries?.length === 0 && <p className={styles.muted}>아직 아무도 다녀가지 않았어요.</p>}
        {entries && entries.length > 0 && (
          <ul className={styles.guestList}>
            {entries.map((g) => (
              <li key={g.id} className={styles.guest}>
                <div className={styles.spread}>
                  <span className={ui.label}>{g.name}</span>
                  <span className={styles.small}>{when(g.at)}</span>
                </div>
                <p className={styles.guestText}>{g.text}</p>
                <div className={styles.row} style={{ justifyContent: "flex-end" }}>
                  {(g.mine || mine) && (
                    <button
                      type="button"
                      className={cx(ui.button, ui.quiet)}
                      disabled={pending}
                      onClick={() => run(() => housingApi.deleteGuest(houseId, g.id), "지웠어요.")}
                    >
                      지우기
                    </button>
                  )}
                  {!g.mine && (
                    <button
                      type="button"
                      className={cx(ui.button, ui.quiet, ui.danger)}
                      disabled={pending}
                      onClick={async () => {
                        setPending(true);
                        try {
                          const r = await housingApi.reportGuest(houseId, g.id);
                          setMsg(r.duplicate ? "이미 신고한 글이에요." : "신고했어요. 확인 후 정리할게요.");
                        } catch (e) {
                          setMsg(errorMessage(e));
                        } finally {
                          setPending(false);
                        }
                      }}
                    >
                      신고
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className={styles.notice} role="status">
          {msg}
        </p>
      </div>
    </Dialog>
  );
}
