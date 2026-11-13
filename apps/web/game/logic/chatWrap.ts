// 말풍선 자유 채팅: 긴 글을 말풍선 줄로 나눈다 (40자를 한 줄로 그리면 화면 밖으로 길어진다).
// 줄마다 perLine 글자까지, 가능하면 띄어쓰기에서 끊는다. 띄어쓰기 없는 긴 글은 글자 수로 자른다.

/** 말풍선 한 줄 글자 수 */
export const CHAT_LINE = 14;

export function wrapChat(text: string, perLine = CHAT_LINE): string {
  const chars = [...text];
  if (chars.length <= perLine) return text;
  const lines: string[] = [];
  let i = 0;
  while (i < chars.length) {
    if (chars.length - i <= perLine) {
      lines.push(chars.slice(i).join(""));
      break;
    }
    // 이번 줄 끝(perLine) 안에서 마지막 띄어쓰기를 찾는다 (줄 앞 절반보다 뒤에 있을 때만)
    let cut = -1;
    for (let k = i + perLine; k > i + Math.floor(perLine / 2); k--) {
      if (chars[k] === " ") {
        cut = k;
        break;
      }
    }
    if (cut > 0) {
      lines.push(chars.slice(i, cut).join(""));
      i = cut + 1;
    } else {
      lines.push(chars.slice(i, i + perLine).join(""));
      i += perLine;
    }
  }
  return lines.join("\n");
}
