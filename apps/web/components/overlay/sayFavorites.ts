import { useSyncExternalStore } from "react";
import { isEmoId, isPhraseId, PHRASES } from "@tomb/protocol";
import { bridge } from "@/game/bridge";
import { EMO_BOARD, type EmoSlot } from "@/game/logic/emoBoard";
import { readItem, writeItem } from "@/lib/storage";

// 표현 즐겨찾기: 표현 창(T)에서 별로 고르고, Y 키(폰은 표현 버튼 길게 누르기)로 내 캐릭터 둘레에 원형으로 펼친다.
// 이 기기에만 기억한다 (lib/storage — 저장소를 못 쓰면 기본값으로). 보내는 건 기존 이모티콘·말풍선과 같은 길(서버 도배 제한 그대로).

/** "p:hi" = 문장, "e:heart" = 이모티콘, "a:wave" = 몸짓 */
export type FavKey = `p:${string}` | `e:${string}` | `a:${string}`;

export const FAV_KEY = "tomb.ui.sayFavs";
export const FAV_MAX = 8;
/** 처음 쓰는 사람의 기본 즐겨찾기 */
export const FAV_DEFAULTS: readonly FavKey[] = ["a:wave", "p:hi", "e:heart", "p:thanks", "e:laugh", "a:cheer"];

export function isFavKey(v: unknown): v is FavKey {
  if (typeof v !== "string") return false;
  const id = v.slice(2);
  if (v.startsWith("p:")) return isPhraseId(id);
  if (v.startsWith("e:")) return isEmoId(id);
  if (v.startsWith("a:")) return id === "wave" || id === "cheer";
  return false;
}

/** 저장된 글 → 즐겨찾기 목록. 없으면(null) 기본값, 깨졌으면 기본값, 모르는 칸·중복은 버리고 최대 FAV_MAX개 */
export function parseFavs(raw: string | null): FavKey[] {
  if (raw === null) return [...FAV_DEFAULTS];
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v)) return [...FAV_DEFAULTS];
    return [...new Set(v.filter(isFavKey))].slice(0, FAV_MAX);
  } catch {
    return [...FAV_DEFAULTS];
  }
}

/** 별 누르기: 있으면 빼고, 없으면 뒤에 붙인다. 이미 FAV_MAX개면 null (더 못 넣는다) */
export function toggleFav(list: readonly FavKey[], key: FavKey): FavKey[] | null {
  if (list.includes(key)) return list.filter((k) => k !== key);
  return list.length >= FAV_MAX ? null : [...list, key];
}

// ── 이 기기 저장본 (창과 원형 목록이 같이 쓴다) ──

let cache: FavKey[] | null = null;
const listeners = new Set<() => void>();

function current(): FavKey[] {
  return (cache ??= parseFavs(readItem(FAV_KEY)));
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const SERVER: FavKey[] = [...FAV_DEFAULTS];

export function useFavs(): readonly FavKey[] {
  return useSyncExternalStore(subscribe, current, () => SERVER);
}

/** 별 누르기. 가득 차서 못 넣으면 false */
export function toggleFavStored(key: FavKey): boolean {
  const next = toggleFav(current(), key);
  if (!next) return false;
  cache = next;
  writeItem(FAV_KEY, JSON.stringify(next));
  listeners.forEach((fn) => fn());
  return true;
}

// ── 보여 주기·보내기 ──

export const phraseText = (id: string) => PHRASES.find((p) => p.id === id)?.text ?? id;
export const slotOf = (id: string): EmoSlot | undefined => EMO_BOARD.find((s) => s.id === id);
export const slotKey = (slot: EmoSlot): FavKey => (slot.kind === "act" ? `a:${slot.id}` : `e:${slot.id}`);

/** 원형 목록·안내에 쓰는 이름 */
export function favLabel(key: FavKey): string {
  return key.startsWith("p:") ? phraseText(key.slice(2)) : (slotOf(key.slice(2))?.label ?? key.slice(2));
}

/** 표현 보내기 (이모티콘 방송·몸짓·말풍선). 도배 제한은 게임·서버가 그대로 건다 */
export function sendFav(key: FavKey): void {
  const id = key.slice(2);
  if (key.startsWith("p:")) bridge.emit("input:say", { id });
  else if (key.startsWith("a:")) {
    if (id === "wave" || id === "cheer") bridge.emit("input:act", { kind: id });
  } else bridge.emit("input:emo", { id });
}
