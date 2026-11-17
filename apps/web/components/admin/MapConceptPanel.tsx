"use client";

import { useState } from "react";
import { ApiRequestError, errorMessage, request } from "@/lib/api";
import { MAP_CONCEPT_LABELS, MAP_CONCEPTS, type MapConcept, type MapConceptResponse } from "@/lib/mapConcept";
import { cx } from "../ui/cx";
import ui from "./AdminUi.module.css";
import styles from "./Admin.module.css";
import { usePanelData } from "./usePanelData";

type Props = { toast: (message: string) => void; onAuthLost: () => void };

const api = {
  get: () => request<MapConceptResponse>("/api/admin/map-concept", { cache: "no-store" }),
  set: (concept: MapConcept) =>
    request<MapConceptResponse>("/api/admin/map-concept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ concept }) }),
};

const DESC: Record<MapConcept, string> = {
  default: "늦가을 마을 그대로예요.",
  winter: "눈 덮인 바닥과 지붕, 얼어붙은 연못, 앙상한 나무와 입김이 나와요.",
  christmas: "겨울 위에 광장 트리와 전구 줄, 리스와 눈사람이 더해져요.",
};

/**
 * 11/17 마을 맵 컨셉 탭: 기본·겨울·크리스마스 중 하나를 고른다 (lib/mapConcept). 길·건물·충돌은 그대로이고 그림만 바뀐다.
 * 바꾸면 마을 전체 공지가 한 번 나가고, 게임 화면은 그 공지를 듣고 바로 그림을 바꾼다 (못 들은 화면도 1분 안에 따라온다)
 */
export default function MapConceptPanel({ toast, onAuthLost }: Props) {
  const loaded = usePanelData(() => api.get(), [], toast, onAuthLost);
  const [saved, setSaved] = useState<MapConceptResponse | null>(null);
  const [pending, setPending] = useState(false);
  const cur = (saved ?? loaded)?.concept ?? null;

  const pick = async (c: MapConcept) => {
    setPending(true);
    try {
      const r = await api.set(c);
      setSaved(r);
      toast(`마을을 ${MAP_CONCEPT_LABELS[r.concept]} 모습으로 바꿨어요.`);
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) onAuthLost();
      else toast(errorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <section className={styles.notices} aria-label="마을 맵 컨셉">
      <div className={styles.notice}>
        <p className={styles.noticeTitle}>
          <strong>마을 맵 컨셉</strong>
        </p>
        {cur === null ? (
          <p className={ui.hint}>불러오는 중…</p>
        ) : (
          <>
            <p role="status">지금은 {MAP_CONCEPT_LABELS[cur]} 모습이에요.</p>
            <div className={styles.pointsForm} role="group" aria-label="컨셉 고르기">
              {MAP_CONCEPTS.map((c) => (
                <button key={c} type="button" className={cx(ui.button, c === cur && ui.primary)} onClick={() => void pick(c)} disabled={pending || c === cur} aria-pressed={c === cur}>
                  {MAP_CONCEPT_LABELS[c]}
                </button>
              ))}
            </div>
            <p className={ui.hint}>{DESC[cur]}</p>
          </>
        )}
        <p className={ui.hint}>
          길과 건물, 부딪히는 자리는 그대로이고 그림만 바뀌어요. 바꾸면 마을 전체 공지가 한 번 나가고, 접속한 화면도 바로 바뀌어요. 공지를 놓친 화면도 1분 안에 따라와요.
        </p>
      </div>
    </section>
  );
}
