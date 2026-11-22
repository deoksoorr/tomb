import { nanoid } from "nanoid";
import { DYE_GEAR_SLOTS, isDyeableCosmetic, ITEMS, itemById, SEASON_SETS, wornDyeItems } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { QUEST_REWARDS } from "../forage/quests/catalog";
import { env } from "../env";
import { getAccounts } from ".";
import { kstDay, loadMe } from "./accounts";

// 11/22 운영자 결정: 등 뒤에 걸치는 망토 5종 · 어깨 걸친 재킷 · 체크 담요 숄은 「등」(pack) 칸. 옷(back)에는 몸에 입는 옷만 남는다.
// 슬롯을 쓰는 곳(가방·상점 칸 필터, 염색 칸 순서, 세트 판정, 수집 의뢰 교환소, 착용 옮기기)이 아이템 칸 정의를 그대로 따라오는지 본다.

const PACK_CAPES = ["back_cape", "back_milkcape", "xm_cape", "fr_cloak", "q_back_cape", "back_jacket", "back_shawl"];
// 11/22 잡화점 「옷」 다섯 벌(wr_*)도 옷 칸
const CLOTHES = ["kc_hoodie", "kd_coat", "kn_cable", "kn_fleece", "sc_padding", "staff_robe", "wr_shirt", "wr_puffer", "wr_robe", "wr_apron", "wr_coat"];
const DAY = 86_400_000;

describe("11/22 망토·걸친 재킷·숄 = 등(pack) 칸", () => {
  it("카탈로그: 망토류 일곱은 pack, 옷 칸에는 몸에 입는 옷만 (한정 여섯 + 잡화점 다섯)", () => {
    for (const id of PACK_CAPES) expect(itemById(id)?.slot, id).toBe("pack");
    for (const id of CLOTHES) expect(itemById(id)?.slot, id).toBe("back");
    const back = ITEMS.filter((i) => i.kind === "cosmetic" && i.slot === "back").map((i) => i.id);
    expect(back.sort()).toEqual([...CLOTHES].sort());
    // 수집 의뢰 교환소 목록도 같은 칸
    expect(QUEST_REWARDS.find((q) => q.id === "q_back_cape")?.slot).toBe("pack");
  });

  it("염색: 등 칸이어도 그대로 염색되고 (수집 의뢰 보상 채집왕 망토만 염색 불가), 염색 칸 순서(머리·목·옷·등)에서 롱패딩=옷 · 망토=등으로 따로 잡힌다", () => {
    for (const id of PACK_CAPES) expect(isDyeableCosmetic(id), id).toBe(id !== "q_back_cape");
    expect(DYE_GEAR_SLOTS).toEqual(["head", "neck", "back", "pack"]);
    expect(wornDyeItems(["sc_padding", "q_back_cape", "hat_beanie"]).map((w) => [w.slot, w.id])).toEqual([
      ["head", "hat_beanie"],
      ["back", "sc_padding"],
      ["pack", "q_back_cape"],
    ]);
  });

  it("세트 판정: 서리 내린 묘역 세트는 망토 칸이 바뀌어도 같은 다섯 점 (칸이 겹치지 않아 다 입을 수 있다)", () => {
    const set = SEASON_SETS.find((s) => s.id === "frost-yard")!;
    expect(set.items).toContain("fr_cloak");
    const slots = set.items.map((id) => itemById(id)?.slot);
    expect(new Set(slots).size).toBe(slots.length);
  });

  it.skipIf(!!env.redis())("착용 (메모리 저장소): 롱패딩(옷) + 망토(등)를 같이 입고, 옛 저장의 옷 칸 망토는 등 칸으로 · 등 칸이 차 있으면 벗어 둔 꾸미기로", async () => {
    const accounts = getAccounts();
    const make = async (items: string[]) => {
      const id = nanoid();
      await accounts.enter(id, { name: "망토", color: "#9fc5a8", body: "hood" }, Date.now() - 60_000);
      for (const it of items) {
        await accounts.adjustPoints(id, 2000);
        await accounts.buy(id, it, 2000);
      }
      return id;
    };
    const now = Date.now();
    const a = await make(["sc_padding", "q_back_cape"]);
    expect(await accounts.equip(a, "sc_padding", "back", now + DAY, now)).toBe(true);
    expect(await accounts.equip(a, "q_back_cape", "pack", now + DAY, now)).toBe(true);
    expect((await loadMe(accounts, a)).equipped.map((e) => e.itemId).sort()).toEqual(["q_back_cape", "sc_padding"]);

    // 옛 저장: 옷(back) 칸에 망토 → 읽을 때 등 칸으로
    const mem = accounts as unknown as { accts: Map<string, { look: Map<string, { itemId: string; until: number }>; stash?: Map<string, number> }> };
    const b = await make([]);
    mem.accts.get(b)!.look.set("back", { itemId: "xm_cape", until: now + DAY });
    const got = await accounts.get(b, kstDay(), now);
    expect(got.equipped.map((e) => e.itemId)).toEqual(["xm_cape"]);
    expect(mem.accts.get(b)!.look.get("pack")?.itemId).toBe("xm_cape");
    expect(mem.accts.get(b)!.look.has("back")).toBe(false);

    // 옛 저장인데 등 칸에도 이미 날개가 있으면: 날개는 그대로, 망토는 벗어 둔 꾸미기(남은 시간 그대로)
    const c = await make([]);
    mem.accts.get(c)!.look.set("back", { itemId: "back_cape", until: now + 2 * DAY });
    mem.accts.get(c)!.look.set("pack", { itemId: "back_wings_butterfly", until: now + DAY });
    const gc = await accounts.get(c, kstDay(), now);
    expect(gc.equipped.map((e) => e.itemId)).toEqual(["back_wings_butterfly"]);
    expect(gc.stash?.find((e) => e.itemId === "back_cape")?.until).toBe(now + 2 * DAY);
    expect(mem.accts.get(c)!.look.has("back")).toBe(false);
  });
});
