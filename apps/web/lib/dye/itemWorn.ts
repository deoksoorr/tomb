import type { AvatarDye } from "@tomb/protocol";

// 11/22 아이템마다 「지금 입는 색」 = 색 보관함에서 고른 칸의 색 (서버 style.ts styleDyeOf와 화면이 같은 규칙).
// /api/me는 dye.items(입은 색)를 보내지 않고 색 보관함(itemDyes)만 보낸다 → 화면(meStore)이 여기서 다시 계산한다 (응답 중복을 뺐다)

export type ItemDyeSlots = { colors: readonly (string | null)[]; sel: number };

/** 색 보관함 → 아이템마다 지금 입는 색 (원래 색으로 고른 아이템·빈 칸은 없다) */
export function wornItemDyes(itemDyes: Readonly<Record<string, ItemDyeSlots>> | null | undefined): Record<string, string> {
  const worn: Record<string, string> = {};
  for (const [item, st] of Object.entries(itemDyes ?? {})) {
    const c = st.sel >= 0 ? st.colors[st.sel] : null;
    if (c) worn[item] = c;
  }
  return worn;
}

/** 내 정보의 dye에 입은 아이템 색을 채운다 (이미 있으면 그대로 — 다른 응답은 아직 dye.items를 싣는다) */
export function withWornItemDyes<T extends { dye?: AvatarDye; itemDyes?: Readonly<Record<string, ItemDyeSlots>> }>(me: T): T {
  if (me.dye?.items || !me.itemDyes) return me;
  const items = wornItemDyes(me.itemDyes);
  return Object.keys(items).length ? { ...me, dye: { ...(me.dye ?? {}), items } } : me;
}

/** /api/me 응답용: dye.items를 뺀다 (itemDyes에서 다시 계산할 수 있다) */
export function withoutWornItemDyes<T extends { dye?: AvatarDye }>(me: T): T {
  if (!me.dye?.items) return me;
  const { items: _items, ...dye } = me.dye;
  void _items;
  return { ...me, dye };
}
