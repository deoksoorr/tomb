"use client";

/* eslint-disable @next/next/no-img-element -- 캔버스로 만든 dataURL 픽셀아트라 next/image 최적화가 필요 없다 */
import { useState } from "react";
import { bridge } from "@/game/bridge";
import type { EmoSlot } from "@/game/logic/emoBoard";
import { emoteDataUrl } from "@/game/sprites/emotes";
import { readItem, writeItem } from "@/lib/storage";
import FavStar from "./FavStar";
import styles from "./SayBoard.module.css";
import { phraseText, slotKey, slotOf } from "./sayFavorites";
import { SAY_GROUPS } from "./sayGroups";

// 말풍선 탭: 정해진 문장을 상황별 묶음(sayGroups.ts)으로, 묶음마다 어울리는 이모티콘을 곁들인다.
// 맨 위에는 최근 보낸 것(이 기기에 기억). 문장은 서버가 정한 목록(PHRASES)만 보낼 수 있다.

const RECENT_KEY = "tomb.ui.recentSay";
const RECENT_MAX = 6;

/** "p:hi" = 문장, "e:heart" = 이모티콘, "a:wave" = 몸짓 */
type RecentKey = `p:${string}` | `e:${string}` | `a:${string}`;

function readRecent(): RecentKey[] {
  try {
    const v: unknown = JSON.parse(readItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? (v.filter((x) => typeof x === "string" && /^[pea]:/.test(x)) as RecentKey[]).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

function remember(key: RecentKey): void {
  writeItem(RECENT_KEY, JSON.stringify([key, ...readRecent().filter((k) => k !== key)].slice(0, RECENT_MAX)));
}

export default function SayBoard({ onSent }: { onSent: () => void }) {
  const [recent] = useState(readRecent);

  function sayPhrase(id: string) {
    remember(`p:${id}`);
    onSent();
    bridge.emit("input:say", { id });
  }

  function sendEmo(slot: EmoSlot) {
    remember(slot.kind === "act" ? `a:${slot.id}` : `e:${slot.id}`);
    onSent();
    if (slot.kind === "act") bridge.emit("input:act", { kind: slot.id });
    else bridge.emit("input:emo", { id: slot.id });
  }

  const emoButton = (slot: EmoSlot, star = false) => {
    const button = (
      <button key={`${slot.kind}-${slot.id}`} type="button" className={styles.emo} onClick={() => sendEmo(slot)} title={slot.label}>
        <img src={emoteDataUrl(slot.icon, 2)} width={26} height={26} alt="" aria-hidden="true" />
        <span>{slot.label}</span>
      </button>
    );
    return star ? (
      <span key={`${slot.kind}-${slot.id}`} className={styles.withStar}>
        {button}
        <FavStar favKey={slotKey(slot)} label={slot.label} />
      </span>
    ) : (
      button
    );
  };

  return (
    <div className={styles.board}>
      <section className={styles.recent} aria-label="최근 보낸 것">
        <h3 className={styles.heading}>최근 보낸 것</h3>
        {recent.length === 0 ? (
          <p className={styles.muted}>아직 없어요. 보낸 말풍선·이모티콘이 여기에 모여요.</p>
        ) : (
          <div className={styles.recentRow}>
            {recent.map((k) => {
              const id = k.slice(2);
              if (k.startsWith("p:"))
                return (
                  <button key={k} type="button" className={styles.recentPhrase} onClick={() => sayPhrase(id)}>
                    {phraseText(id)}
                  </button>
                );
              const slot = slotOf(id);
              return slot ? emoButton(slot) : null;
            })}
          </div>
        )}
      </section>

      <div className={styles.groups}>
        {SAY_GROUPS.map((g) => (
          <section key={g.title} className={styles.group} aria-label={g.title}>
            <h3 className={styles.heading}>
              {g.title}
              <span className={styles.desc}>{g.desc}</span>
            </h3>
            <div className={styles.phrases}>
              {g.phrases.map((id) => (
                <span key={id} className={styles.phraseCell}>
                  <button type="button" className={styles.phrase} onClick={() => sayPhrase(id)}>
                    {phraseText(id)}
                  </button>
                  <FavStar favKey={`p:${id}`} label={phraseText(id)} className={styles.phraseStar} />
                </span>
              ))}
            </div>
            <div className={styles.emos}>
              {g.emos
                .map((id) => slotOf(id))
                .filter((s): s is EmoSlot => !!s)
                .map((s) => emoButton(s, true))}
            </div>
          </section>
        ))}
      </div>
      <p className={styles.muted}>말풍선은 머리 위에 4초쯤 떠요. 같은 채널(또는 같은 방) 사람들에게만 보여요. 직접 쓰고 싶으면 맨 위 입력칸(데스크톱은 게임 화면에서 Enter)을 쓰세요.</p>
    </div>
  );
}
