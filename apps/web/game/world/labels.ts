// 이름표 겹침 풀기: 아래쪽(앞에 선) 사람 이름표는 그대로 두고, 겹치는 위쪽 이름표를 살짝 위로 비킨다.
// 이름표 위치만 다루는 순수 계산이라 테스트한다 (원점: 가운데 아래).

export type LabelBox = { x: number; y: number; w: number; h: number };

/** 앞의 n개 boxes의 y를 고친다 (프레임마다 호출, 할당 없음). order는 재사용 배열 */
export function declutter(boxes: LabelBox[], order: LabelBox[], n: number = boxes.length): void {
  order.length = 0;
  for (let i = 0; i < n; i++) order.push(boxes[i]);
  order.sort((a, b) => b.y - a.y);
  for (let i = 1; i < order.length; i++) {
    const a = order[i];
    // 이미 자리 잡은 이름표들과 겹치지 않을 때까지 위로
    for (let pass = 0; pass < order.length; pass++) {
      let moved = false;
      for (let j = 0; j < i; j++) {
        const b = order[j];
        if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2) {
          a.y = b.y - b.h;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }
}
