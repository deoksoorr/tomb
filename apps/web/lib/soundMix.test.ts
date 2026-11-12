import { describe, expect, it } from "vitest";
import { busGain, DEFAULT_BUS_VOLUME, parseSoundMix } from "./soundMix";

describe("13번 소리 따로 조절", () => {
  it("처음이면 예전 BGM 볼륨·음소거를 이어받는다 (업데이트 뒤 소리 크기가 그대로)", () => {
    expect(parseSoundMix(null, { volume: "0.25", muted: null })).toEqual({ amb: { volume: 0.25, muted: false }, sfx: { volume: 0.25, muted: false } });
    expect(parseSoundMix(null, { volume: "0.4", muted: "1" }).sfx).toEqual({ volume: 0.4, muted: true });
    expect(parseSoundMix(null).amb).toEqual({ volume: DEFAULT_BUS_VOLUME, muted: false });
  });

  it("저장값은 버스마다 따로, 범위 밖·깨진 값은 고친다", () => {
    const m = parseSoundMix(JSON.stringify({ amb: { volume: 0.2, muted: true }, sfx: { volume: 3 } }));
    expect(m).toEqual({ amb: { volume: 0.2, muted: true }, sfx: { volume: 1, muted: false } });
    expect(parseSoundMix("{깨짐", { volume: "0.5", muted: "0" }).amb.volume).toBe(0.5);
    expect(parseSoundMix(JSON.stringify({ amb: "x" })).amb.volume).toBe(DEFAULT_BUS_VOLUME);
  });

  it("끄면 크기 0, 아니면 볼륨", () => {
    const m = parseSoundMix(JSON.stringify({ amb: { volume: 0.6, muted: true }, sfx: { volume: 0.3, muted: false } }));
    expect(busGain(m, "amb")).toBe(0);
    expect(busGain(m, "sfx")).toBe(0.3);
  });
});
