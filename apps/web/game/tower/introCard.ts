import * as Phaser from "phaser";
import { MONSTERS, type MonsterId } from "@/lib/rpg/catalog";

// 11/15 야근 빌딩: 그 판에서 처음 나온 몬스터를 화면 위쪽에 작은 카드로 알린다 ("새 몬스터: 엉킨 랜선" + 그림 + 한 줄 설명).
// 한 번에 하나씩 차례로 (여럿이 한꺼번에 나오면 줄을 선다). 카드는 하나를 만들어 두고 내용만 바꿔 쓴다.
// 시간은 씬의 게임 시간(멈춤 제외).

const FONT = '"Galmuri11", "Galmuri9", monospace';
const SHOW_MS = 2300;
const DEPTH = 1_500_000;

/** 설명 첫 문장 (카드 한 줄) */
const brief = (id: MonsterId) => {
  const d = MONSTERS[id].desc.replace(/^"[^"]*"\s*/, "");
  const cut = d.search(/[.—]/);
  return (cut > 0 ? d.slice(0, cut) : d).trim();
};

export class MonsterIntro {
  private queue: MonsterId[] = [];
  private cur: { id: MonsterId; at: number } | null = null;
  private readonly box: Phaser.GameObjects.Graphics;
  private readonly pic: Phaser.GameObjects.Image;
  private readonly title: Phaser.GameObjects.Text;
  private readonly desc: Phaser.GameObjects.Text;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly tex: (id: MonsterId) => string,
  ) {
    this.box = scene.add.graphics().setDepth(DEPTH).setVisible(false);
    this.pic = scene.add.image(0, 0, "__DEFAULT").setDepth(DEPTH + 1).setVisible(false);
    const style = { fontFamily: FONT, color: "#f2ead3", stroke: "#0a0b10", strokeThickness: 3, resolution: 1 };
    this.title = scene.add.text(0, 0, "", { ...style, fontSize: "13px", color: "#ffd04a" }).setDepth(DEPTH + 1).setVisible(false);
    this.desc = scene.add.text(0, 0, "", { ...style, fontSize: "11px" }).setDepth(DEPTH + 1).setVisible(false);
  }

  /** 처음 본 몬스터를 줄 세운다 */
  push(id: MonsterId): void {
    if (this.cur?.id === id || this.queue.includes(id)) return;
    this.queue.push(id);
  }

  update(now: number): void {
    if (this.cur && now - this.cur.at > SHOW_MS) this.cur = null;
    if (!this.cur && this.queue.length) {
      const id = this.queue.shift()!;
      this.cur = { id, at: now };
      this.pic.setTexture(this.tex(id), 0);
      this.title.setText(`새 몬스터 · ${MONSTERS[id].name}`);
      this.desc.setText(brief(id));
    }
    const on = !!this.cur;
    for (const o of [this.box, this.pic, this.title, this.desc]) o.setVisible(on);
    if (!this.cur) return;
    const cam = this.scene.cameras.main;
    const v = cam.worldView;
    const z = cam.zoom;
    const t = now - this.cur.at;
    // 위에서 미끄러져 내려왔다가 사라진다
    const k = t < 180 ? t / 180 : t > SHOW_MS - 260 ? Math.max(0, (SHOW_MS - t) / 260) : 1;
    const s = 1 / z;
    const tw = Math.max(this.title.width, this.desc.width) * s;
    const size = MONSTERS[this.cur.id].size;
    const ps = Math.min(1.6, 26 / Math.max(10, size));
    const w = Math.round(size * ps + 18 + tw);
    const h = Math.round(Math.max(size * ps + 8, 38 * s + 6));
    const x = Math.round(v.x + v.width / 2 - w / 2);
    const y = Math.round(v.y + 30 * s - (1 - k) * 12);
    this.box.clear().setAlpha(k);
    this.box.fillStyle(0x0a0e18, 0.86).fillRect(x, y, w, h);
    this.box.lineStyle(1, 0xffd04a, 0.9).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    this.pic.setPosition(x + 6 + (size * ps) / 2 + 2, y + h / 2).setScale(ps).setAlpha(k);
    this.title.setScale(s).setPosition(x + 14 + size * ps, y + 4 * s).setAlpha(k);
    this.desc.setScale(s).setPosition(x + 14 + size * ps, y + 21 * s).setAlpha(k);
  }

  destroy(): void {
    for (const o of [this.box, this.pic, this.title, this.desc]) o.destroy();
    this.queue = [];
    this.cur = null;
  }
}
