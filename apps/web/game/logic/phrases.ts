import { PHRASES } from "@tomb/protocol";

// 말풍선 문장표: id만 주고받고 문장은 여기서 그린다

const phraseText = new Map<string, string>(PHRASES.map((p) => [p.id, p.text]));
/** PHRASES id → 문장 (모르는 id면 null) */
export function phraseOf(id: string): string | null {
  return phraseText.get(id) ?? null;
}
