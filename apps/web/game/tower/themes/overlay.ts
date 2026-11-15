import * as Phaser from "phaser";

// 11/15 성능: 화면 전체를 덮는 곱하기(어둡게 하기) 층을 테마가 하나 더 두지 않고, 지도(arena)의 분위기 층 색에 곱해 넣는다.
// 곱하기 둘을 겹친 것 = 두 색을 곱한 색 하나 → 같은 그림인데 화면을 한 번 덜 칠한다 (내장 그래픽에서 프레임이 크게 오른다).

/** depth의 곱하기 사각형에 color를 곱해 넣는다. 그런 층이 없으면 새로 만든다 (만든 것을 돌려준다 — 없으면 null) */
export function foldMultiply(scene: Phaser.Scene, color: number, depth: number, make: () => Phaser.GameObjects.Rectangle): Phaser.GameObjects.Rectangle | null {
  const amb = scene.children.list.find((o): o is Phaser.GameObjects.Rectangle => o instanceof Phaser.GameObjects.Rectangle && o.blendMode === Phaser.BlendModes.MULTIPLY && o.depth === depth && o.visible);
  if (!amb) return make();
  const a = Phaser.Display.Color.IntegerToColor(amb.fillColor);
  const b = Phaser.Display.Color.IntegerToColor(color);
  amb.setFillStyle(Phaser.Display.Color.GetColor(Math.round((a.red * b.red) / 255), Math.round((a.green * b.green) / 255), Math.round((a.blue * b.blue) / 255)));
  return null;
}
