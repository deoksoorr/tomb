import { describe, expect, it, vi } from "vitest";
import { SEA_SCOPES } from "@tomb/protocol";

vi.mock("phaser", () => ({}));
vi.mock("../entities/RemoteAvatar", () => ({ STARGAZE_TAG: "stargaze" }));
vi.mock("../world/life/sounds", () => ({ playLife: () => undefined }));
vi.mock("../input/keyHint", () => ({ isTouchUi: () => false }));

// 11/16 바닷가 → 마을 버스에서 게임이 멈춘 원인: 장면이 닫힐 때(SHUTDOWN) Phaser가 맵 충돌 묶음을 먼저 지워 children이 없는데
// 망원경 정리가 그 묶음에서 remove를 불러 예외 → 다음 프레임 예약이 끊겨 창밖 연출이 그대로 멈췄어요.
describe("StarScopes.destroy (바닷가 망원경)", () => {
  function make() {
    const zones: { destroyed: boolean; destroy(): void }[] = [];
    const img = { setOrigin: () => img, setDepth: () => img, destroy: () => undefined };
    const scene = {
      textures: { exists: () => true, addCanvas: () => undefined },
      add: {
        image: () => img,
        zone: () => {
          const z = { destroyed: false, removeFromDisplayList: () => z, destroy: () => void (z.destroyed = true) };
          zones.push(z);
          return z;
        },
      },
    };
    const removed: unknown[] = [];
    const group: { children?: object; add(z: unknown): void; remove(z: unknown): void } = {
      children: {},
      add: () => undefined,
      remove: (z) => void removed.push(z),
    };
    return { scene, group, zones, removed };
  }

  it("장면이 닫혀 충돌 묶음이 먼저 지워졌어도 예외 없이 정리해요", async () => {
    const { StarScopes } = await import("./StarScopes");
    const { scene, group, zones } = make();
    const s = new StarScopes(scene as never, { spots: SEA_SCOPES, style: "coin", colliders: group as never } as never);
    expect(zones.length).toBe(SEA_SCOPES.length);
    delete group.children; // Phaser Group.destroy 뒤 모습
    group.remove = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'contains')");
    };
    expect(() => s.destroy()).not.toThrow();
    expect(zones.every((z) => z.destroyed)).toBe(true);
  });

  it("충돌 묶음이 살아 있으면 묶음에서 빼요", async () => {
    const { StarScopes } = await import("./StarScopes");
    const { scene, group, removed } = make();
    const s = new StarScopes(scene as never, { spots: SEA_SCOPES, style: "coin", colliders: group as never } as never);
    s.destroy();
    expect(removed.length).toBe(SEA_SCOPES.length);
  });
});
