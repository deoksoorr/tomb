import { bridge } from "@/game/bridge";
import { onVisibleAgain, tabHidden } from "./hooks/visibleAgain";
import { MAP_CONCEPT_NOTICE_PREFIX, normalizeConcept, type MapConceptResponse } from "./mapConcept";

// 11/17 마을 맵 컨셉 클라이언트 사본 (게임 화면). 마을 장면이 떠 있는 동안만 돈다 (WorldScene.bindBridge가 켜고 끈다).
//  - /api/map-concept(CDN 30초)을 처음에 한 번, 그 뒤 앞에 있는 탭만 1분마다
//  - 관리자가 바꾸면 마을 전체 공지(id가 MAP_CONCEPT_NOTICE_PREFIX)가 오니, 들은 즉시 캐시를 건너뛰고 다시 읽는다
//  - 값은 bridge map:concept(sticky)로 알린다 — 바뀔 때만

const POLL_MS = 60_000;
const STALE_MS = 30_000;

let users = 0;
let fetchedAt = 0;
let stop: (() => void) | null = null;

async function load(fresh = false): Promise<void> {
  fetchedAt = Date.now();
  try {
    const res = await fetch(fresh ? `/api/map-concept?fresh=${fetchedAt}` : "/api/map-concept", { cache: "no-store" });
    if (!res.ok) return;
    const concept = normalizeConcept(((await res.json()) as MapConceptResponse).concept);
    if (bridge.last("map:concept")?.concept !== concept) bridge.emit("map:concept", { concept });
  } catch {
    // 그림만 바뀌는 값이라 조용히 넘어간다 (다음 확인 때 다시)
  }
}

/** 확인을 시작한다 (여러 번 불러도 하나만 돈다). 해제 함수를 돌려준다 */
export function startMapConceptSync(): () => void {
  users++;
  if (users === 1) {
    void load();
    const timer = setInterval(() => {
      if (!tabHidden()) void load();
    }, POLL_MS);
    const offVisible = onVisibleAgain(() => {
      if (Date.now() - fetchedAt > STALE_MS) void load();
    });
    const offNotice = bridge.on("megaphone:heard", (m) => {
      if (m.system && m.id.startsWith(MAP_CONCEPT_NOTICE_PREFIX)) void load(true);
    });
    stop = () => {
      clearInterval(timer);
      offVisible();
      offNotice();
    };
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    users--;
    if (users > 0) return;
    stop?.();
    stop = null;
  };
}
