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

/** 마지막 곡 다음은 첫 곡 */
export function nextIndex(index: number, length: number): number {
  return length > 0 ? (index + 1) % length : 0;
}

/** CC BY 계열(CC BY, CC BY-SA …)만 저작자 표시 의무가 있다. CC0·Pixabay는 표시하지 않는다 */
export function needsAttribution(license: string): boolean {
  return /\bCC[\s-]*BY\b/i.test(license);
}
