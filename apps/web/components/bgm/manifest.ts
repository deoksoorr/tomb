// public/bgm/tracks.json 형식과 재생 순서 규칙

export type Track = {
  file: string;
  title: string;
  artist: string;
  sourceUrl: string;
  license: string;
  durationSec: number;
};

export type Playlist = { id: string; title: string; tracks: Track[] };

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** 형식이 틀린 항목은 버린다. 외부 핫링크는 금지라 /bgm/ 아래 파일만 받는다 */
export function parseManifest(data: unknown): Playlist[] {
  const playlists = (data as { playlists?: unknown } | null)?.playlists;
  if (!Array.isArray(playlists)) return [];
  return playlists.flatMap((p): Playlist[] => {
    const id = str(p?.id);
    const title = str(p?.title);
    if (!id || !title) return [];
    const tracks = (Array.isArray(p.tracks) ? p.tracks : []).flatMap((t: Record<string, unknown>): Track[] => {
      const file = str(t?.file);
      if (!file.startsWith("/bgm/") || !str(t?.title)) return [];
      return [
        {
          file,
          title: str(t.title),
          artist: str(t.artist),
          sourceUrl: str(t.sourceUrl),
          license: str(t.license),
          durationSec: typeof t.durationSec === "number" ? t.durationSec : 0,
        },
      ];
    });
    return [{ id, title, tracks }];
  });
}

/** 처음 들어오면(입장 화면·마을 모두) 저장해 둔 목록과 상관없이 이 플레이리스트로 시작한다 */
export const FIRST_PLAYLIST_ID = "lofi";

/**
 * 처음 들어올 때 시작할 곡: firstId 플레이리스트(기본 로파이)의 아무 곡. 그 목록이 없으면 아무 플레이리스트의 아무 곡.
 * rand는 [0,1) (테스트에서 고정값을 넣는다)
 */
export function randomStart(
  playlists: readonly Playlist[],
  firstId: string | null = FIRST_PLAYLIST_ID,
  rand: () => number = Math.random,
): { playlistId: string | null; index: number } {
  const first = playlists.find((p) => p.id === firstId);
  const playlist = first ?? playlists[Math.floor(rand() * playlists.length)];
  if (!playlist) return { playlistId: null, index: 0 };
  return { playlistId: playlist.id, index: pickTrack(playlist.tracks.length, null, rand) };
}

/** 곡 수 length 중 아무 곡. avoid(지금 곡)가 있고 2곡 이상이면 그 곡은 빼고 고른다 */
export function pickTrack(length: number, avoid: number | null, rand: () => number = Math.random): number {
  if (length <= 0) return 0;
  if (avoid === null || avoid < 0 || avoid >= length || length === 1) return Math.min(length - 1, Math.floor(rand() * length));
  // avoid를 뺀 length-1곡 중에서 고르고, avoid 뒤쪽은 한 칸씩 민다
  const i = Math.min(length - 2, Math.floor(rand() * (length - 1)));
  return i >= avoid ? i + 1 : i;
}

/** 0..length-1을 섞은 재생 순서. first가 맨 앞이고 나머지는 무작위 (피셔-예이츠) */
export function shuffledOrder(length: number, first: number, rand: () => number = Math.random): number[] {
  const rest = Array.from({ length }, (_, i) => i).filter((i) => i !== first);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return first >= 0 && first < length ? [first, ...rest] : rest;
}

/**
 * 섞은 순서에서 index 다음 곡. 한 바퀴를 다 돌면 새로 섞되, 방금 곡이 연달아 나오지 않게 다른 곡으로 시작한다.
 * order가 이 플레이리스트 것이 아니면(길이가 다르거나 index가 없으면) index부터 새로 섞는다
 */
export function nextShuffled(
  order: readonly number[],
  index: number,
  length: number,
  rand: () => number = Math.random,
): { order: number[]; index: number } {
  if (length <= 0) return { order: [], index: 0 };
  const pos = order.length === length ? order.indexOf(index) : -1;
  if (pos < 0) {
    const fresh = shuffledOrder(length, Math.min(Math.max(index, 0), length - 1), rand);
    return { order: fresh, index: fresh[1] ?? fresh[0] };
  }
  if (pos + 1 < order.length) return { order: [...order], index: order[pos + 1] };
  const fresh = shuffledOrder(length, pickTrack(length, index, rand), rand);
  return { order: fresh, index: fresh[0] };
}

/** CC BY 계열(CC BY, CC BY-SA …)만 저작자 표시 의무가 있다. CC0·Pixabay는 표시하지 않는다 */
export function needsAttribution(license: string): boolean {
  return /\bCC[\s-]*BY\b/i.test(license);
}
