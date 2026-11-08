import { describe, expect, it } from "vitest";
import { silentWav } from "./silence";

describe("silentWav", () => {
  it("올바른 RIFF/WAVE 헤더와 무음 데이터", () => {
    const wav = silentWav(0.1);
    const text = (from: number, to: number) => String.fromCharCode(...wav.subarray(from, to));
    const view = new DataView(wav.buffer);
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 16)).toBe("WAVEfmt ");
    expect(text(36, 40)).toBe("data");
    expect(view.getUint32(40, true)).toBe(800);
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(wav.subarray(44).every((b) => b === 128)).toBe(true);
  });
});
