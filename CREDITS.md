# CREDITS

## 폰트
| 이름 | 제작 | 라이선스 | 위치 |
|---|---|---|---|
| Galmuri (Galmuri11, Galmuri11 Bold, Galmuri9, Galmuri14) | Lee Minseo (quiple) — https://github.com/quiple/galmuri | SIL Open Font License 1.1 | `apps/web/public/fonts/` (웹), `apps/web/assets/fonts/` (OG 이미지) — 라이선스 원문 `Galmuri-OFL.txt` 동봉 |

## 그래픽
- 모든 픽셀 스프라이트(캐릭터, 묘비, 소품, 타일)는 `apps/web/game/sprites/`의 코드로 생성한 자체 제작 플레이스홀더입니다. 외부 에셋을 쓰지 않았습니다.
- 외부 에셋으로 교체할 때는 **CC0만** 사용하고(예: Kenney), 이 표에 출처를 추가합니다. 교체 지점은 `apps/web/game/assets/manifest.ts`입니다.

## 음원 (BGM)
모든 BGM(30곡)은 외부 음원·샘플 없이 `scripts/gen-bgm.mjs`가 코드로 작곡·합성한 자체 제작 음원이며 **CC0**로 배포합니다. 트랙마다 고정 시드를 써서 `node scripts/gen-bgm.mjs`를 다시 돌리면 같은 파일이 나옵니다(ffmpeg 필요). 곡 목록·길이는 `apps/web/public/bgm/tracks.json`에 있습니다.

| 플레이리스트 | 곡 수 | 파일 (`apps/web/public/bgm/…`) | 제작 | 라이선스 |
|---|---|---|---|---|
| 오르골 | 10 | `orgel/`: moonlit-orgel, unfinished-lullaby, first-commit-waltz, archived-dreams, hello-world, forgotten-readme, localhost-lullaby, sleeping-prototype, deprecated-star, version-zero-one | 자체 제작 (`scripts/gen-bgm.mjs`) | CC0 |
| 로파이 | 12 | `lofi/`: late-commit, todo-forever, debugging-at-3am, empty-repository, sleeping-server-room, stale-branch, cold-coffee-stack-trace, stashed-summer, expired-domain, sunday-side-project, merge-tomorrow, last-deploy | 자체 제작 (`scripts/gen-bgm.mjs`) | CC0 |
| 빗소리 앰비언트 | 8 | `rain/`: rain-on-stones, distant-thunder, rainy-night-etude, night-crickets, wind-in-the-trees, tin-roof, drizzle-far-bell, foggy-dawn | 자체 제작 (`scripts/gen-bgm.mjs`) | CC0 |

- 형식: MP3 128kbps 44.1kHz 스테레오, 100~134초, 통합 라우드니스 약 -19 LUFS, true peak ≤ -2 dBTP로 맞췄습니다.
- 외부 음원을 추가할 때는 **Pixabay Content License** 트랙을 1순위로 씁니다(상업적 이용 가능, 저작자 표시 의무 없음).
- CC-BY 트랙을 넣으면 이 표와 `apps/web/public/bgm/tracks.json`에 저작자를 기록합니다(플레이어 ⓘ에 표시됨).
- 외부 핫링크는 쓰지 않습니다. 파일은 `apps/web/public/bgm/{playlist}/*.mp3`(128kbps)에 직접 넣습니다.
