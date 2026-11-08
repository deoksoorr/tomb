import { MAX_MESSAGE_BYTES } from "./constants";
import { isDirId, isStateId, type DirId, type PeerState, type StateId } from "./types";

// 위치 관련 메시지는 바이너리(little-endian). 그 밖의 드문 이벤트는 JSON(events.ts).

export const MSG_MOVE = 0x01;
export const MSG_SNAPSHOT = 0x02;

export const MOVE_BYTES = 9; // u8 type, u16 x, u16 y, u8 state, u8 dir, u16 seq
export const SNAPSHOT_HEADER_BYTES = 4; // u8 type, u16 tick, u8 n
export const SNAPSHOT_ENTRY_BYTES = 8; // u16 sid, u16 x, u16 y, u8 state, u8 dir
/** 512바이트 제한 안에 들어가는 최대 엔트리 수 = (512-4)/8 = 63 */
export const SNAPSHOT_MAX_ENTRIES = Math.floor((MAX_MESSAGE_BYTES - SNAPSHOT_HEADER_BYTES) / SNAPSHOT_ENTRY_BYTES);

export type MoveMsg = {
  x: number;
  y: number;
  state: StateId;
  dir: DirId;
  seq: number;
};

const u16 = (n: number) => Math.max(0, Math.min(0xffff, Math.round(n)));

export function encodeMove(m: MoveMsg): ArrayBuffer {
  const buf = new ArrayBuffer(MOVE_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, MSG_MOVE);
  v.setUint16(1, u16(m.x), true);
  v.setUint16(3, u16(m.y), true);
  v.setUint8(5, m.state);
  v.setUint8(6, m.dir);
  v.setUint16(7, m.seq & 0xffff, true);
  return buf;
}

/** 형식이 맞지 않으면 null */
export function decodeMove(data: ArrayBuffer | ArrayBufferView): MoveMsg | null {
  const v = toView(data);
  if (v.byteLength !== MOVE_BYTES || v.getUint8(0) !== MSG_MOVE) return null;
  const state = v.getUint8(5);
  const dir = v.getUint8(6);
  if (!isStateId(state) || !isDirId(dir)) return null;
  return { x: v.getUint16(1, true), y: v.getUint16(3, true), state, dir, seq: v.getUint16(7, true) };
}

export type Snapshot = { tick: number; entries: PeerState[] };

/** entries가 SNAPSHOT_MAX_ENTRIES를 넘으면 호출하는 쪽에서 나눠 보내야 한다. */
export function encodeSnapshot(tick: number, entries: readonly PeerState[]): ArrayBuffer {
  if (entries.length > SNAPSHOT_MAX_ENTRIES) throw new RangeError("snapshot too large");
  const buf = new ArrayBuffer(SNAPSHOT_HEADER_BYTES + entries.length * SNAPSHOT_ENTRY_BYTES);
  const v = new DataView(buf);
  v.setUint8(0, MSG_SNAPSHOT);
  v.setUint16(1, tick & 0xffff, true);
  v.setUint8(3, entries.length);
  let o = SNAPSHOT_HEADER_BYTES;
  for (const e of entries) {
    v.setUint16(o, e.sid & 0xffff, true);
    v.setUint16(o + 2, u16(e.x), true);
    v.setUint16(o + 4, u16(e.y), true);
    v.setUint8(o + 6, e.state);
    v.setUint8(o + 7, e.dir);
    o += SNAPSHOT_ENTRY_BYTES;
  }
  return buf;
}

export function decodeSnapshot(data: ArrayBuffer | ArrayBufferView): Snapshot | null {
  const v = toView(data);
  if (v.byteLength < SNAPSHOT_HEADER_BYTES || v.getUint8(0) !== MSG_SNAPSHOT) return null;
  const n = v.getUint8(3);
  if (v.byteLength !== SNAPSHOT_HEADER_BYTES + n * SNAPSHOT_ENTRY_BYTES) return null;
  const entries: PeerState[] = [];
  let o = SNAPSHOT_HEADER_BYTES;
  for (let i = 0; i < n; i++) {
    const state = v.getUint8(o + 6);
    const dir = v.getUint8(o + 7);
    if (!isStateId(state) || !isDirId(dir)) return null;
    entries.push({ sid: v.getUint16(o, true), x: v.getUint16(o + 2, true), y: v.getUint16(o + 4, true), state, dir });
    o += SNAPSHOT_ENTRY_BYTES;
  }
  return { tick: v.getUint16(1, true), entries };
}

/** 바이너리 메시지의 type 바이트 (빈 버퍼면 -1) */
export function peekType(data: ArrayBuffer | ArrayBufferView): number {
  const v = toView(data);
  return v.byteLength > 0 ? v.getUint8(0) : -1;
}

function toView(data: ArrayBuffer | ArrayBufferView): DataView {
  return data instanceof ArrayBuffer
    ? new DataView(data)
    : new DataView(data.buffer, data.byteOffset, data.byteLength);
}
