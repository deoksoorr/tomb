import { describe, expect, it } from "vitest";
import { ENCODE_STEPS, fitWithin, ImageConvertError, SCREENSHOT_MAX_SIDE, shrinkToWebp } from "./image";

describe("fitWithin", () => {
  it("긴 변을 맞추고 비율을 지킨다", () => {
    expect(fitWithin(1920, 1080, SCREENSHOT_MAX_SIDE)).toEqual({ width: 960, height: 540 });
    expect(fitWithin(1080, 2400, SCREENSHOT_MAX_SIDE)).toEqual({ width: 432, height: 960 });
  });

  it("작은 이미지는 키우지 않는다", () => {
    expect(fitWithin(640, 480, SCREENSHOT_MAX_SIDE)).toEqual({ width: 640, height: 480 });
  });
});

describe("ENCODE_STEPS", () => {
  it("원래 크기·높은 품질에서 시작해 점점 줄어든다", () => {
    expect(ENCODE_STEPS[0]).toEqual({ scale: 1, quality: 0.82 });
    for (let i = 1; i < ENCODE_STEPS.length; i++) {
      const [a, b] = [ENCODE_STEPS[i - 1], ENCODE_STEPS[i]];
      expect(b.scale < a.scale || (b.scale === a.scale && b.quality < a.quality)).toBe(true);
    }
  });
});

describe("shrinkToWebp", () => {
  // 용량 = 그려진 크기 × 품질 로 흉내 낸다
  const fakeBlob = (scale: number, quality: number) => new Blob([new Uint8Array(Math.round(1000 * scale * quality))]);

  it("용량이 맞을 때까지 품질 → 크기 순으로 줄이고, 크기가 바뀔 때만 다시 그린다", async () => {
    let scale = 0;
    const renders: number[] = [];
    const tried: number[] = [];
    const blob = await shrinkToWebp(
      (s) => {
        scale = s;
        renders.push(s);
      },
      {
        native: async (q) => {
          tried.push(q);
          return fakeBlob(scale, q);
        },
        fallback: () => Promise.reject(new Error("쓰이면 안 됨")),
      },
      450,
    );
    expect(blob.size).toBeLessThanOrEqual(450);
    expect(renders).toEqual([1, 0.8]);
    expect(tried).toEqual([0.82, 0.68, 0.55, 0.82, 0.68, 0.55]);
  });

  it("브라우저가 WebP를 못 만들면 그 뒤로는 대체 인코더만 쓴다", async () => {
    let nativeCalls = 0;
    let fallbackCalls = 0;
    await shrinkToWebp(
      () => {},
      {
        native: async () => {
          nativeCalls++;
          return null;
        },
        fallback: async (q) => {
          fallbackCalls++;
          return fakeBlob(1, q);
        },
      },
      700,
    );
    expect(nativeCalls).toBe(1);
    expect(fallbackCalls).toBe(2);
  });

  it("끝까지 안 줄면 안내 오류", async () => {
    await expect(
      shrinkToWebp(() => {}, { native: async () => new Blob([new Uint8Array(10)]), fallback: async () => new Blob() }, 1),
    ).rejects.toBeInstanceOf(ImageConvertError);
  });

  it("대체 인코더도 실패하면 그 오류를 그대로 올린다", async () => {
    const unsupported = new ImageConvertError("지원 안 함");
    await expect(
      shrinkToWebp(() => {}, { native: async () => null, fallback: () => Promise.reject(unsupported) }),
    ).rejects.toBe(unsupported);
  });
});
