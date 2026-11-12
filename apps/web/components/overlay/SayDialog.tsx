"use client";

import { PHRASES } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import Dialog from "../ui/Dialog";
import styles from "./MenuSheet.module.css";

/** 말풍선 고르기 (데스크톱 T 키 · 터치 메뉴): 정해진 문장만 보낸다 */
export default function SayDialog({ onClose }: { onClose: () => void }) {
  function say(id: string) {
    onClose();
    bridge.emit("input:say", { id });
  }
  return (
    <Dialog title="말풍선" onClose={onClose}>
      <div className={styles.phrases}>
        {PHRASES.map((p) => (
          <button key={p.id} type="button" className={styles.phrase} onClick={() => say(p.id)}>
            {p.text}
          </button>
        ))}
      </div>
    </Dialog>
  );
}
