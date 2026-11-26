import { beforeAll, describe, expect, it, vi } from "vitest";

// 11/26 운영 오류 (sourceSize null · setFrame null 'get'): 손 흔들기·환호 몸짓 중에 갈아입으면 새 시트로 그림만 바꾸고
// 옛 시트 몸짓 애니메이션은 그대로 돌았다. 탭이 뒤에 있어 게임 루프가 멈춘 사이 원장이 옛 시트를 지우면
// Phaser가 지운 프레임으로 되돌리다 터지고 스프라이트 텍스처가 null로 남아, 다음 눈덩이 몸짓(gesture)에서 또 터졌다.
// 시트를 바꿀 때는 옛 애니메이션을 먼저 멈춘다.

const stub: unknown = new Proxy(function () {}, {
  get: (_t, k) => (k === Symbol.toPrimitive ? () => 0 : k === "then" ? undefined : stub),
  apply: () => stub,
});

type FakeSprite = { tex: string; playing: string | null; frame: { name: number }; scene: unknown };
const sprites: FakeSprite[] = [];
function fakeSprite(tex: string): unknown {
  const s: FakeSprite & Record<string, unknown> = {
    tex,
    playing: null,
    frame: { name: 0 },
    scene: {},
    play(k: string) {
      // Phaser: destroy한 스프라이트는 anims가 undefined라 play가 터진다
      if (!s.scene) throw new TypeError("Cannot read properties of undefined (reading 'play')");
      s.playing = k;
      return p;
    },
    stop() {
      s.playing = null;
      return p;
    },
    setTexture(k: string) {
      s.tex = k;
      return p;
    },
  };
  sprites.push(s);
  const p: unknown = new Proxy(s, { get: (t, k) => (k in t ? t[k as string] : k === "then" ? undefined : () => p) });
  return p;
}
const scene: unknown = new Proxy(
  {},
  {
    get: (_t, k) =>
      k === "add" ? new Proxy({}, { get: (_a, m) => (m === "sprite" ? (_x: number, _y: number, tex: string) => fakeSprite(tex) : () => stub) }) : k === "then" ? undefined : stub,
  },
);

vi.mock("phaser", () => ({ BlendModes: {}, default: {} }));
vi.mock("../assets/manifest", () => ({
  TEX: new Proxy({}, { get: (_t, k) => String(k) }),
  addCanvasTexture: () => {},
  avatarActAnimKey: (tex: string, act: string, dir: number) => `${tex}:act-${act}:${dir}`,
  avatarAnimKey: (tex: string, state: string, dir: number) => `${tex}:${state}:${dir}`,
  avatarFrame: () => 0,
  avatarTexLedger: () => ({ hold() {}, release() {}, onRemoved() {} }),
  ensureAvatarTexture: (_s: unknown, _color: string, look: readonly string[]) => `av~${look.join(",")}`,
}));
vi.mock("./StaffFxView", () => ({ StaffFxView: class { sync() {} setVisible() {} destroy() {} } }));
vi.mock("./CosmeticFxView", () => ({ CosmeticFxView: class { setLook() {} setDye() {} labelTop() { return 0; } destroy() {} } }));
vi.mock("./TitleView", () => ({ TitleView: class { setStaff() {} set() {} destroy() {} } }));

type View = {
  playAct(kind: "wave", now: number): void;
  changeLook(look: string[] | null, extra: undefined): void;
  apply(state: string, dir: number, now: number): void;
};
let AvatarView: new (scene: unknown, atlas: unknown, x: number, y: number, color: string, name: string, isMe: boolean, look?: string[], body?: string) => View;

beforeAll(async () => {
  ({ AvatarView } = (await import("./AvatarView")) as unknown as { AvatarView: typeof AvatarView });
});

describe("갈아입을 때 옛 시트 애니메이션을 남기지 않는다", () => {
  it("손 흔드는 중에 갈아입어도 옛 시트 몸짓 애니메이션은 멈추고 그림은 새 시트", () => {
    const v = new AvatarView(scene, { ensure() {} }, 0, 0, "#c9b6e4", "남", false, []);
    const s = sprites.at(-1)!;
    v.playAct("wave", 1000);
    expect(s.playing).toBe("av~:act-wave:0");
    v.changeLook(["hat_straw"], undefined);
    expect(s.tex).toBe("av~hat_straw");
    // 몸짓이 끝날 때까지는 새 시트의 같은 프레임에 멈춰 있다 (끝나면 sync가 새 시트 애니메이션을 고른다)
    expect(s.playing === null || s.playing.startsWith("av~hat_straw:")).toBe(true);
  });
});

describe("장면이 내려간 뒤(스프라이트가 이미 지워짐)에는 자세를 바꾸지 않는다", () => {
  it("11/20 운영 오류: 바닷가 장면 정리 중 카약에서 내리기(leaveBoat → apply)가 지운 스프라이트에 play를 불러 정리가 멈췄다", () => {
    const v = new AvatarView(scene, { ensure() {} }, 0, 0, "#c9b6e4", "나", true, []);
    const s = sprites.at(-1)!;
    v.apply("boat", 0, 100);
    // Phaser 장면 종료: 화면 목록이 먼저 스프라이트를 지우고(scene = undefined) 그 뒤 장면 정리가 카약 내리기를 부른다
    s.scene = undefined;
    expect(() => v.apply("idle", 0, 200)).not.toThrow();
  });
});
