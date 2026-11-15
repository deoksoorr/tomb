import { describe, expect, it } from "vitest";
import { keepOnTop } from "./topLayer";

// DOM 없이: top layer 순서를 흉내 내는 가짜 요소와 가짜 MutationObserver
type Fake = {
  tagName: string;
  open: boolean;
  popoverOpen: boolean;
  calls: string[];
  listeners: Map<string, () => void>;
  matches(sel: string): boolean;
  showModal(): void;
  close(): void;
  showPopover(): void;
  hidePopover(): void;
  addEventListener(t: string, fn: () => void): void;
  removeEventListener(t: string): void;
};

const layer: Fake[] = [];
function fake(tagName: string): Fake {
  const el: Fake = {
    tagName,
    open: false,
    popoverOpen: false,
    calls: [],
    listeners: new Map(),
    matches: (sel) => sel === ":modal" && el.open,
    showModal() {
      el.calls.push("showModal");
      el.open = true;
      layer.push(el);
    },
    close() {
      el.calls.push("close");
      el.open = false;
      layer.splice(layer.indexOf(el), 1);
    },
    showPopover() {
      el.calls.push("showPopover");
      el.popoverOpen = true;
      layer.push(el);
    },
    hidePopover() {
      el.calls.push("hidePopover");
      el.popoverOpen = false;
      layer.splice(layer.indexOf(el), 1);
    },
    addEventListener: (t, fn) => void el.listeners.set(t, fn),
    removeEventListener: (t) => void el.listeners.delete(t),
  };
  return el;
}

let observerCb: ((records: { target: unknown }[]) => void) | null = null;
let disconnected = false;
class FakeObserver {
  constructor(cb: (records: { target: unknown }[]) => void) {
    observerCb = cb;
    disconnected = false;
  }
  observe() {}
  disconnect() {
    disconnected = true;
  }
}

const root = {} as Node;
const opts = { root, Observer: FakeObserver as never };
const top = () => layer[layer.length - 1];

describe("keepOnTop", () => {
  it("업데이트 창(모달)이 먼저 떠 있어도, 나중에 열린 게임 창(사냥 결과 등) 위로 다시 올라온다", () => {
    layer.length = 0;
    const cover = fake("DIALOG");
    const off = keepOnTop(cover as unknown as HTMLElement, "modal", opts);
    expect(cover.open).toBe(true);
    // 사냥이 끝나 결과 창이 열림 → top layer 맨 위는 결과 창
    const result = fake("DIALOG");
    result.showModal();
    expect(top()).toBe(result);
    observerCb!([{ target: result }]);
    expect(top()).toBe(cover);
    expect(result.open).toBe(true); // 결과 창은 닫지 않는다 (업데이트 뒤 같은 자리로)
    off();
    expect(cover.open).toBe(false);
    expect(disconnected).toBe(true);
  });

  it("이미 열려 있던 게임 창 위에 뜬다", () => {
    layer.length = 0;
    const lobby = fake("DIALOG");
    lobby.showModal();
    const cover = fake("DIALOG");
    const off = keepOnTop(cover as unknown as HTMLElement, "modal", opts);
    expect(top()).toBe(cover);
    off();
  });

  it("배너(popover)도 나중에 열린 모달 위로 올라온다. 내 변화·닫힌 창·다른 요소는 무시", () => {
    layer.length = 0;
    const banner = fake("DIV");
    const off = keepOnTop(banner as unknown as HTMLElement, "popover", opts);
    expect(banner.popoverOpen).toBe(true);
    const bag = fake("DIALOG");
    bag.showModal();
    observerCb!([{ target: banner }, { target: fake("DETAILS") }]);
    expect(top()).toBe(bag);
    observerCb!([{ target: bag }]);
    expect(top()).toBe(banner);
    const before = banner.calls.length;
    bag.close();
    observerCb!([{ target: bag }]);
    expect(banner.calls.length).toBe(before);
    off();
    expect(banner.popoverOpen).toBe(false);
  });

  it("Esc 등으로 닫혀도 다시 연다, 내린 뒤에는 열지 않는다", async () => {
    layer.length = 0;
    const cover = fake("DIALOG");
    const off = keepOnTop(cover as unknown as HTMLElement, "modal", opts);
    cover.close();
    cover.listeners.get("close")!();
    await Promise.resolve();
    expect(cover.open).toBe(true);
    off();
    expect(cover.listeners.has("close")).toBe(false);
    expect(cover.open).toBe(false);
  });
});
