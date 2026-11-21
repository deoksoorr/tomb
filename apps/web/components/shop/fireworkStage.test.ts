import { isFireworkId, ITEMS } from "@tomb/protocol";
import { describe, expect, it } from "vitest";
import { FireworkStage, stillScene } from "./fireworkStage";

const FIREWORKS = ITEMS.filter((i) => isFireworkId(i.id));

describe("폭죽 미리보기 무대", () => {
  it("모든 폭죽이 무대에서 터지고, 정지 그림은 활짝 핀 장면을 고른다", () => {
    for (const f of FIREWORKS) {
      const s = stillScene(f.id, "달빛");
      expect(s.sparks.length + s.heads.length, f.id).toBeGreaterThan(5);
    }
  });

  it("꼬리 있는 폭죽(버드나무)은 무대에서도 꼬리 불티가 생긴다 (게임과 같은 sparkTrail)", () => {
    const st = new FireworkStage("fw_willow", false, "");
    let most = 0;
    for (let t = 0; t < 2500; t += 16) {
      st.step(16);
      most = Math.max(most, st.sparks.length);
    }
    // 원래 불티 34개 + 로켓 꼬리보다 훨씬 많다
    expect(most).toBeGreaterThan(150);
  });

  it("다 터지면 잠깐 쉬었다가 다시 쏜다", () => {
    const st = new FireworkStage("fw_small", false, "");
    let emptied = false;
    let again = false;
    for (let t = 0; t < 6000; t += 16) {
      st.step(16);
      if (!st.sparks.length && t > 1000) emptied = true;
      if (emptied && st.sparks.length) again = true;
    }
    expect(again).toBe(true);
  });

  it("11/20 새 폭죽·오로라·광역 불꽃쇼도 미리보기 무대에서 터진다 (한도 안)", () => {
    for (const id of ["fw_crackle", "fw_emoji", "fw_parachute", "fw_whistle", "fw_fish", "fw_pinwheel", "fw_rainbow", "fw_kiku", "fw_cascade", "fw_fountainrow", "fw_aurora", "fw_kamuro", "fw_niagara", "fw_town", "fw_hangang"]) {
      const st = new FireworkStage(id, false, "");
      let most = 0;
      for (let t = 0; t < 6000; t += 16) {
        st.step(16);
        most = Math.max(most, st.sparks.length);
      }
      expect(most, id).toBeGreaterThan(20);
      expect(most, id).toBeLessThanOrEqual(700);
    }
  });
});
