import { describe, expect, it } from "vitest";
import { ambienceAt } from "@/lib/ambience";
import { photoAmbience } from "@/lib/photo/photoRules";
import { ambiencePreview, ambiencePreviewVersion, setAmbiencePreview } from "./ambiencePreview";

// 11/19 촬영 모드 시간대·날씨 미리보기: 켜고 끄면 판이 올라 장면이 바로 다시 잡고, 끄면 평소 하늘로 돌아가요

describe("ambiencePreview", () => {
  it("밤 필터 → 밤 하늘, 끄면 미리보기 없음", () => {
    const v0 = ambiencePreviewVersion();
    setAmbiencePreview(photoAmbience({ time: "night", weather: null }));
    expect(ambiencePreviewVersion()).toBe(v0 + 1);
    const pv = ambiencePreview();
    expect(pv).toEqual({ hour: 22 });
    // 낮 12시(KST 03:00 UTC)여도 미리보기를 얹으면 밤
    const noon = Date.UTC(2026, 10, 19, 3, 0, 0);
    expect(ambienceAt(noon).phase).toBe("day");
    expect(ambienceAt(noon, { ...pv }).phase).toBe("night");
    setAmbiencePreview(null);
    expect(ambiencePreview()).toBeNull();
    expect(ambiencePreviewVersion()).toBe(v0 + 2);
  });

  it("같은 값을 또 넣으면 판이 그대로 (매 프레임 다시 잡지 않게)", () => {
    setAmbiencePreview({ weather: "snow" });
    const v = ambiencePreviewVersion();
    setAmbiencePreview({ weather: "snow" });
    expect(ambiencePreviewVersion()).toBe(v);
    setAmbiencePreview(null);
    setAmbiencePreview(null);
    expect(ambiencePreviewVersion()).toBe(v + 1);
  });

  it("밖에서 넘긴 값을 바꿔도 미리보기는 그대로", () => {
    const o = { hour: 6 };
    setAmbiencePreview(o);
    o.hour = 12;
    expect(ambiencePreview()).toEqual({ hour: 6 });
    setAmbiencePreview(null);
  });
});
