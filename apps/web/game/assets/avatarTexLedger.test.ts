import { describe, expect, it } from "vitest";
import { hammockLieKey } from "../sprites/hammockArt";
import { indoorPoseKey } from "../sprites/indoorPose";
import { AvatarTexLedger, derivedBase, GRACE_MS, IDLE_KEEP, IDLE_MAX_MS, type TexHost } from "./avatarTexLedger";

// 11/22 아바타 시트 원장: 아무도 안 쓰는 옛 시트(와 거기서 만든 그림)를 잠깐 뒤 지운다. 쓰는 그림이 있으면 미룬다

function fakeHost() {
  const textures = new Set<string>();
  const anims = new Set<string>();
  const lists: { texture: { key: string } }[][] = [[]];
  let alive = true;
  const host: TexHost = {
    textures: { exists: (k) => textures.has(k), remove: (k) => textures.delete(k), getTextureKeys: () => [...textures] },
    anims: { keys: () => [...anims], remove: (k) => anims.delete(k) },
    displayLists: () => lists,
    alive: () => alive,
  };
  const sheet = (k: string) => {
    textures.add(k);
    for (const s of ["idle", "walk"]) for (const d of [0, 1]) anims.add(`${k}:${s}:${d}`);
  };
  return { host, textures, anims, lists, sheet, kill: () => (alive = false) };
}

function setup() {
  const f = fakeHost();
  let t = 1_000_000;
  let timers: { fn: () => void; at: number; id: number }[] = [];
  let ids = 0;
  const ledger = new AvatarTexLedger(
    f.host,
    () => t,
    (fn, ms) => {
      timers.push({ fn, at: t + ms, id: ++ids });
      return ids as unknown as ReturnType<typeof setTimeout>;
    },
    (id) => {
      timers = timers.filter((x) => x.id !== (id as unknown as number));
    },
  );
  /** 시각을 ms만큼 보내며 그때까지의 타이머를 돌린다 */
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      t = Math.max(t, next.at);
      next.fn();
    }
    t = end;
  };
  return { ...f, ledger, advance };
}

describe("아바타 시트 원장", () => {
  it("만든 그림 키 → 시트 키 (해먹·집 안 자세·특수 색 가면 — 키 모양이 바뀌면 여기서 잡힌다)", () => {
    const base = "avatar-9fb8d8_ff0000__~hat_straw";
    expect(derivedBase(hammockLieKey(base))).toBe(base);
    expect(derivedBase(hammockLieKey(base, "sea"))).toBe(base);
    for (const k of ["lie", "read", "bath"] as const) expect(derivedBase(indoorPoseKey(base, k))).toBe(base);
    expect(derivedBase(indoorPoseKey(base, "lie", "towel"))).toBe(base);
    // 11/26 캠핑장 침대 덮개 (침대·방향마다)
    for (const c of ["cvbed0", "cvbed3", "pnbed1", "pnbed2"] as const) expect(derivedBase(indoorPoseKey(base, "lie", c))).toBe(base);
    expect(derivedBase(`${base}#dye-head`)).toBe(base);
    expect(derivedBase(`${base}#dye-wr_shirt`)).toBe(base);
    expect(derivedBase(base)).toBeNull();
  });

  it("쓰는 동안은 안 지우고, 안 쓰게 돼도 한동안(남겨 둘 수 안이면 1분) 남겨 둔다", () => {
    const { ledger, sheet, textures, advance } = setup();
    sheet("avatar-a");
    ledger.hold("avatar-a");
    advance(IDLE_MAX_MS * 2);
    expect(textures.has("avatar-a")).toBe(true);
    ledger.release("avatar-a");
    advance(GRACE_MS + 10);
    expect(textures.has("avatar-a")).toBe(true);
    advance(IDLE_MAX_MS);
    expect(textures.has("avatar-a")).toBe(false);
  });

  it("1분 타이머가 걸려 있어도 나중에 넘친 시트는 유예 뒤 바로 지운다 (천천히 갈아입기)", () => {
    const { ledger, sheet, textures, advance } = setup();
    let cur = "";
    for (let i = 0; i < 30; i++) {
      const k = `avatar-s${i}`;
      sheet(k);
      ledger.hold(k);
      if (cur) ledger.release(cur);
      cur = k;
      advance(GRACE_MS * 2); // 첫 정리 때는 남겨 둘 수 안 → 1분 뒤 타이머
    }
    advance(GRACE_MS + 10);
    expect([...textures].length).toBe(1 + IDLE_KEEP);
  });

  it("다시 잡으면 지우지 않는다 (같은 생김새가 다시 보임)", () => {
    const { ledger, sheet, textures, advance } = setup();
    sheet("avatar-a");
    ledger.hold("avatar-a");
    ledger.release("avatar-a");
    advance(1000);
    ledger.hold("avatar-a");
    advance(IDLE_MAX_MS * 2);
    expect(textures.has("avatar-a")).toBe(true);
  });

  it("여럿이 같은 시트를 쓰면 마지막 하나가 놓을 때까지 남는다", () => {
    const { ledger, sheet, textures, advance } = setup();
    sheet("avatar-a");
    ledger.hold("avatar-a");
    ledger.hold("avatar-a");
    ledger.release("avatar-a");
    advance(IDLE_MAX_MS * 2);
    expect(textures.has("avatar-a")).toBe(true);
    ledger.release("avatar-a");
    ledger.release("avatar-a"); // 두 번 놓아도 괜찮다
    advance(IDLE_MAX_MS + GRACE_MS);
    expect(textures.has("avatar-a")).toBe(false);
  });

  it("색 칸 50번 바꾸기: 남겨 둘 수(IDLE_KEEP)를 넘는 옛 시트는 유예 뒤 오래된 것부터 지운다 — 시트·만든 그림·애니메이션까지", () => {
    const { ledger, sheet, textures, anims, advance } = setup();
    let cur = "";
    for (let i = 0; i < 50; i++) {
      const k = `avatar-c${i}`;
      sheet(k);
      textures.add(`${k}#dye-head`);
      textures.add(`${k}-hammock`);
      ledger.hold(k);
      if (cur) ledger.release(cur);
      cur = k;
      advance(100);
    }
    advance(GRACE_MS + 100);
    const sheets = [...textures].filter((k) => derivedBase(k) === null);
    // 입은 것 하나 + 남겨 둔 IDLE_KEEP개
    expect(sheets.length).toBe(1 + IDLE_KEEP);
    expect(textures.has(cur)).toBe(true);
    expect(textures.has("avatar-c0")).toBe(false);
    expect(textures.has("avatar-c0#dye-head")).toBe(false);
    expect(textures.has("avatar-c0-hammock")).toBe(false);
    expect([...anims].some((a) => a.startsWith("avatar-c0:"))).toBe(false);
    expect([...anims].some((a) => a.startsWith(`${cur}:`))).toBe(true);
    advance(IDLE_MAX_MS + GRACE_MS);
    expect([...textures].filter((k) => derivedBase(k) === null)).toEqual([cur]);
    expect(ledger.stats()).toMatchObject({ held: 1, idle: 0 });
  });

  it("화면의 그림(컨테이너 안 잔상 포함)이 아직 쓰면 미룬다", () => {
    const { ledger, sheet, textures, lists, advance } = setup();
    sheet("avatar-a");
    textures.add("avatar-a-lie");
    ledger.hold("avatar-a");
    ledger.release("avatar-a");
    const trail = { texture: { key: "avatar-a-lie" } };
    lists[0].push({ texture: { key: "x" }, list: [trail] } as unknown as { texture: { key: string } });
    advance(IDLE_MAX_MS + GRACE_MS);
    expect(textures.has("avatar-a")).toBe(true);
    trail.texture.key = "other";
    advance(60_000);
    expect(textures.has("avatar-a")).toBe(false);
    expect(textures.has("avatar-a-lie")).toBe(false);
  });

  it("만든 그림 키가 다른 잡힌 시트와 같아도 그 시트는 지우지 않는다", () => {
    const { ledger, sheet, textures, advance } = setup();
    sheet("avatar-a");
    sheet("avatar-a-read");
    ledger.hold("avatar-a-read");
    ledger.hold("avatar-a");
    ledger.release("avatar-a");
    advance(IDLE_MAX_MS * 3);
    expect(textures.has("avatar-a-read")).toBe(true);
  });

  it("지운 키를 알린다 · 게임이 끝났으면 아무것도 안 한다", () => {
    const { ledger, sheet, textures, advance, kill } = setup();
    const gone: string[] = [];
    ledger.onRemoved((k) => gone.push(k));
    sheet("avatar-a");
    textures.add("avatar-a-hammock");
    ledger.hold("avatar-a");
    ledger.release("avatar-a");
    advance(IDLE_MAX_MS + GRACE_MS);
    expect(gone.sort()).toEqual(["avatar-a", "avatar-a-hammock"]);
    sheet("avatar-b");
    ledger.hold("avatar-b");
    ledger.release("avatar-b");
    kill();
    advance(IDLE_MAX_MS * 2);
    expect(textures.has("avatar-b")).toBe(true);
  });
});
