# CREDITS

## 폰트
| 이름 | 제작 | 라이선스 | 위치 |
|---|---|---|---|
| Galmuri (Galmuri11, Galmuri11 Bold, Galmuri9, Galmuri14) | Lee Minseo (quiple) — https://github.com/quiple/galmuri | SIL Open Font License 1.1 | `apps/web/public/fonts/` (웹), `apps/web/assets/fonts/` (OG 이미지) — 라이선스 원문 `Galmuri-OFL.txt` 동봉 |

## 그래픽
- 모든 픽셀 스프라이트(캐릭터, 묘비, 소품, 타일)는 `apps/web/game/sprites/`의 코드로 생성한 자체 제작 플레이스홀더입니다. 외부 에셋을 쓰지 않았습니다.
- 외부 에셋으로 교체할 때는 **CC0만** 사용하고(예: Kenney), 이 표에 출처를 추가합니다. 교체 지점은 `apps/web/game/assets/manifest.ts`입니다.

## 음원 (BGM)
| 플레이리스트 | 파일 | 제작 | 라이선스 |
|---|---|---|---|
| 오르골 | `moonlit-orgel.mp3`, `unfinished-lullaby.mp3` | 자체 제작 (`scripts/gen-bgm.mjs`로 코드 합성) | CC0 |
| 로파이 | `late-commit.mp3`, `todo-forever.mp3` | 자체 제작 (`scripts/gen-bgm.mjs`) | CC0 |
| 빗소리 앰비언트 | `rain-on-stones.mp3` | 자체 제작 (`scripts/gen-bgm.mjs`) | CC0 |

- 실제 음원은 **Pixabay Content License** 트랙을 1순위로 씁니다(상업적 이용 가능, 저작자 표시 의무 없음).
- CC-BY 트랙을 넣으면 이 표와 `apps/web/public/bgm/tracks.json`에 저작자를 기록합니다(플레이어 ⓘ에 표시됨).
- 외부 핫링크는 쓰지 않습니다. 파일은 `apps/web/public/bgm/{playlist}/*.mp3`(128kbps)에 직접 넣습니다.
