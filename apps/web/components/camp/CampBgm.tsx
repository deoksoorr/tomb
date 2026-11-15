"use client";

import { useEffect } from "react";
import { bgm } from "@/components/bgm/engine";
import { bridge } from "@/game/bridge";
import { campBgmPlaylist } from "@/game/camp/campTalk";
import { ambienceAt, parseAmbienceOverride } from "@/lib/ambience";

// 11/15 캠핑장 배경음: 캠핑장에 있는 동안은 앰비언트, 기타 캠퍼가 나와 있는 밤 9~11시(한국 시각)엔 어쿠스틱 기타.
// 마을로 돌아오면 원래 듣던 목록으로. 캠핑장에서 직접 다른 목록을 고르면 그대로 둔다 (그때부터는 건드리지 않는다).
// 그리는 것은 없다 (GameShell에 한 번 붙인다).

const CHECK_MS = 60_000;

export default function CampBgm() {
  useEffect(() => {
    let before: string | null = null;
    let mine: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    const hour = () => ambienceAt(Date.now(), parseAmbienceOverride(window.location.search)).kstHour;
    const apply = () => {
      const cur = bgm.getSnapshot();
      if (!cur.playlists.length) return;
      // 캠핑장에서 손으로 바꿨다 → 손대지 않는다
      if (mine !== null && cur.playlistId !== mine) return;
      const want = campBgmPlaylist(hour());
      if (!cur.playlists.some((p) => p.id === want) || cur.playlistId === want) {
        mine = cur.playlistId;
        return;
      }
      mine = want;
      bgm.setPlaylist(want);
    };
    const enter = () => {
      if (before !== null) return;
      before = bgm.getSnapshot().playlistId;
      mine = null;
      apply();
      timer = setInterval(apply, CHECK_MS);
    };
    const leave = () => {
      if (timer) clearInterval(timer);
      timer = null;
      const cur = bgm.getSnapshot();
      if (before !== null && mine !== null && cur.playlistId === mine && before !== mine) bgm.setPlaylist(before);
      before = null;
      mine = null;
    };
    if (bridge.last("map:changed")?.map === "camp") enter();
    const off = bridge.on("map:changed", ({ map }) => (map === "camp" ? enter() : leave()));
    return () => {
      off();
      if (timer) clearInterval(timer);
    };
  }, []);
  return null;
}
