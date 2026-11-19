// 장비창 칸 배치(grid-template-areas 문자열) 도우미

/** 칸 이름 → 말풍선 맞춤: 첫 열이면 start(왼쪽 끝 맞춤), 끝 열이면 end, 가운데는 center */
export function tipAlignOf(areas: string, area: string): "start" | "center" | "end" {
  const rows = [...areas.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/));
  for (const r of rows) {
    const i = r.indexOf(area);
    if (i < 0) continue;
    if (i === 0) return "start";
    if (i === r.length - 1) return "end";
    return "center";
  }
  return "center";
}

/** 11/19 칸 이름 → 말풍선 위·아래: 맨 윗줄 칸(머리·목 등)은 위로 띄우면 창 위쪽에 잘려서 아래로 */
export function tipPlaceOf(areas: string, area: string): "above" | "below" {
  const rows = [...areas.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim().split(/\s+/));
  return rows.length > 1 && rows[0].includes(area) ? "below" : "above";
}
