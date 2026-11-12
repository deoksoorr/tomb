"use client";

import { useEffect, useState, type FormEvent } from "react";
import { itemById, MEGAPHONE_MAX } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { errorMessage } from "@/lib/api";
import { megaphoneStore, useMegaphone } from "@/lib/hooks/useMegaphone";
import { meStore, useMe } from "@/lib/hooks/useMe";
import { showToast } from "@/lib/hooks/useToasts";
import { socialApi } from "@/lib/socialApi";
import { cx } from "../ui/cx";
import Dialog from "../ui/Dialog";
import ItemIcon from "../ui/ItemIcon";
import ui from "../ui/ui.module.css";
import styles from "./MegaphoneDialog.module.css";

const KINDS = ["mega_ch", "mega_all"] as const;

/** 23번 외치기 창 (확성기 창의 [외치기]·가방에서 연다). 열려 있을 때만 그린다 */
export default function MegaphoneLayer({ channel, onOpenShop }: { channel: number; onOpenShop: () => void }) {
  const { composing } = useMegaphone();
  return composing ? <MegaphoneDialog channel={channel} onOpenShop={onOpenShop} onClose={() => megaphoneStore.compose(false)} /> : null;
}

function MegaphoneDialog({ channel, onOpenShop, onClose }: { channel: number; onOpenShop: () => void; onClose: () => void }) {
  const { me } = useMe();
  const owned = (id: string) => me?.inventory[id] ?? 0;
  const [itemId, setItemId] = useState<string>(() => KINDS.find((k) => (meStore.getSnapshot().me?.inventory[k] ?? 0) > 0) ?? "mega_ch");
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const length = [...text.trim()].length;
  const none = KINDS.every((k) => owned(k) === 0);
  // 가방 개수를 최신으로 (다른 기기·선물로 들어온 확성기)
  useEffect(() => {
    void meStore.refresh();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!length || length > MEGAPHONE_MAX || owned(itemId) === 0) return;
    setPending(true);
    setError(null);
    try {
      const res = await socialApi.shout(itemId, text, channel);
      meStore.set(res.me);
      megaphoneStore.push(res.entry);
      bridge.emit("megaphone:send", { grant: res.grant });
      showToast(res.entry.scope === "all" ? "모든 채널에 외쳤어요!" : `${channel}채널에 외쳤어요!`);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog title="확성기로 외치기" onClose={onClose} closable={!pending}>
      <form className={styles.form} onSubmit={(e) => void submit(e)}>
        <p className={ui.hint}>
          내 닉네임과 한마디가 사람들의 왼쪽 위 확성기 창에 몇 초간 크게 뜨고, 기록에 남아요. 욕설·링크는 쓸 수 없고, 30초에 한 번만
          외칠 수 있어요.
        </p>
        <fieldset className={styles.kinds}>
          <legend className={ui.label}>어디에 외칠까요?</legend>
          {KINDS.map((id) => {
            const item = itemById(id)!;
            return (
              <label key={id} className={cx(styles.kind, itemId === id && styles.picked, owned(id) === 0 && styles.empty)}>
                <input type="radio" name="megaphone" value={id} checked={itemId === id} onChange={() => setItemId(id)} />
                <ItemIcon itemId={id} size={32} />
                <span className={styles.kindText}>
                  <b>{item.name}</b>
                  <span className={styles.meta}>{id === "mega_all" ? "모든 채널" : `지금 ${channel}채널`} · 가방에 {owned(id)}개</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <label className={ui.field}>
          <span className={ui.label}>
            한마디 <span className={ui.counter}>{length}/{MEGAPHONE_MAX}</span>
          </span>
          <input
            className={ui.input}
            value={text}
            maxLength={MEGAPHONE_MAX + 20}
            onChange={(e) => setText(e.target.value)}
            placeholder="예: 오늘 밤 모닥불 앞에서 만나요!"
            aria-invalid={length > MEGAPHONE_MAX}
            autoFocus
          />
        </label>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
        <div className={styles.actions}>
          {owned(itemId) === 0 ? (
            <>
              <span className={styles.meta}>{none ? "확성기가 없어요." : "이 확성기는 없어요."}</span>
              <button
                type="button"
                className={cx(ui.button, ui.primary)}
                onClick={() => {
                  onClose();
                  onOpenShop();
                }}
              >
                상점에서 사기
              </button>
            </>
          ) : (
            <button type="submit" className={cx(ui.button, ui.primary)} disabled={pending || !length || length > MEGAPHONE_MAX}>
              {pending ? "외치는 중…" : "외치기"}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
