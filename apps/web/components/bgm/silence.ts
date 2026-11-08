/** 무음 WAV (8kHz 모노 8비트). iOS에서 <audio>를 사용자 제스처 안에서 한 번 재생해 "깨워" 두는 데 쓴다 */
export function silentWav(durationSec = 0.1): Uint8Array<ArrayBuffer> {
  const rate = 8000;
  const samples = Math.max(1, Math.round(rate * durationSec));
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt 청크 크기
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // 모노
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true); // 초당 바이트
  view.setUint16(32, 1, true); // 블록 정렬
  view.setUint16(34, 8, true); // 비트
  ascii(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44); // 8비트 PCM의 0 레벨
  return bytes;
}
