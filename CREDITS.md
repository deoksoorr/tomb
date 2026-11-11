# CREDITS

## 폰트
| 이름 | 제작 | 라이선스 | 위치 |
|---|---|---|---|
| Galmuri (Galmuri11, Galmuri11 Bold, Galmuri9, Galmuri14) | Lee Minseo (quiple) — https://github.com/quiple/galmuri | SIL Open Font License 1.1 | `apps/web/public/fonts/` (웹), `apps/web/assets/fonts/` (OG 이미지) — 라이선스 원문 `Galmuri-OFL.txt` 동봉 |

## 그래픽
- 모든 픽셀 스프라이트(캐릭터, 묘비, 소품, 타일)는 `apps/web/game/sprites/`의 코드로 생성한 자체 제작 플레이스홀더입니다. 외부 에셋을 쓰지 않았습니다.
- 외부 에셋으로 교체할 때는 **CC0만** 사용하고(예: Kenney), 이 표에 출처를 추가합니다. 교체 지점은 `apps/web/game/assets/manifest.ts`입니다.

## 음원 (BGM)
플레이리스트 9개, 180곡(플레이리스트마다 20곡)입니다. 곡 목록·순서·길이·저작자는 `apps/web/public/bgm/tracks.json`에 있고(플레이어 ⓘ에 표시됨), 파일은 모두 `apps/web/public/bgm/{playlist}/*.mp3`에 직접 넣었습니다(외부 핫링크 없음). 형식은 MP3 44.1kHz 스테레오(128kbps, 3차 보강 96곡만 64/80kbps), 통합 라우드니스 약 -19 LUFS, true peak ≤ -1 dBTP로 통일했습니다.

### 자체 제작 (CC0) — 151곡
외부 음원·샘플 없이 `scripts/gen-bgm.mjs`가 코드로 작곡·합성했습니다. 트랙마다 고정 시드를 써서 `node scripts/gen-bgm.mjs`를 다시 돌리면 같은 파일이 나옵니다(ffmpeg 필요).

| 플레이리스트 | 곡 수 | 파일 (`apps/web/public/bgm/…`) |
|---|---|---|
| 오르골 | 11 | `orgel/`: moonlit-orgel, unfinished-lullaby, first-commit-waltz, archived-dreams, hello-world, forgotten-readme, localhost-lullaby, sleeping-prototype, deprecated-star, version-zero-one, last-star-on-the-graph |
| 로파이 | 12 | `lofi/`: late-commit, todo-forever, debugging-at-3am, empty-repository, sleeping-server-room, stale-branch, cold-coffee-stack-trace, stashed-summer, expired-domain, sunday-side-project, merge-tomorrow, last-deploy, rubber-duck-at-midnight |
| 빗소리 앰비언트 | 8 | `rain/`: rain-on-stones, distant-thunder, rainy-night-etude, night-crickets, wind-in-the-trees, tin-roof, drizzle-far-bell, foggy-dawn |
| 잔잔한 피아노 | 5 | `piano/`: after-the-last-commit, closed-issues, commented-out-feelings, deprecated-docs, snow-on-the-server |
| 8비트 | 4 | `chiptune/`: pixel-graveyard-walk, save-point, no-extra-life, stuck-on-title-screen |
| 재즈 카페 | 5 | `jazz/`: cafe-refactoring, blue-screen-blues, closed-startup-cafe, pull-request-bossa, late-shift-ballad |
| 몽환 앰비언트 | 3 | `ambient/`: dreaming-in-the-cloud, garbage-collected-memories, sleep-mode |
| 어쿠스틱 기타 | 3 | `acoustic/`: campfire-standup, porch-of-the-old-repo, autumn-backlog |
| 레트로 RPG 마을 | 3 | `retro/`: item-shop-of-unfinished-swords, inn-at-version-zero, village-of-abandoned-quests |

**3차 보강 — 96곡** (플레이리스트마다 20곡을 채우려고 추가). 용량을 아끼려고 기존 곡(128kbps)과 달리 64kbps(잡음이 많은 빗소리·몽환 앰비언트는 80kbps)로, 길이는 66~84초로 구웠습니다. 기존 파일은 그대로 두고 `node scripts/gen-bgm.mjs --missing`으로 없는 파일만 굽습니다.

| 플레이리스트 | 곡 수 | 비트레이트 | 파일 (`apps/web/public/bgm/…`) |
|---|---|---|---|
| 오르골 | 5 | 64kbps | `orgel/`: sunday-eleven-pm, payday-night-music-box, first-snow-commute, after-the-dishes, saturday-no-alarm |
| 로파이 | 3 | 64kbps | `lofi/`: friday-six-pm, cup-noodle-overtime, last-subway-home |
| 빗소리 앰비언트 | 12 | 80kbps | `rain/`: umbrella-crosswalk, bus-stop-downpour, cafe-window-seat, meeting-room-monsoon, rainy-monday-morning, wet-sneakers, waiting-under-the-eaves, no-umbrella-going-home, convenience-store-awning, thunder-overtime, foggy-bus-window, monsoon-office-afternoon |
| 잔잔한 피아노 | 12 | 64kbps | `piano/`: back-seat-of-the-bus, convenience-store-light, empty-elevator, ten-pm-laundry, payday-sunset, letter-back-in-the-drawer, holiday-train-home, ten-minutes-on-the-roof, month-end-closing, after-the-farewell-party, sunday-shirt-ironing, first-workday-of-the-year |
| 8비트 | 13 | 64kbps | `chiptune/`: lunch-menu-dilemma, last-meal-ticket, elevator-mind-game, coffee-ladder-game, afternoon-meeting-boss, pantry-snack-raid, clock-out-speedrun, punch-in-combo, weekly-report-quest, employee-badge-level-up, post-lunch-walk-stage, vending-machine-jackpot, parcel-arrived-alert |
| 재즈 카페 | 10 | 64kbps | `jazz/`: morning-americano, lunch-break-bossa, rainy-day-latte, friday-happy-hour, promotion-news-bossa, espresso-before-overtime, rooftop-sunset-swing, cancelled-field-meeting, year-end-party-ballad, monday-cafe-bossa |
| 몽환 앰비언트 | 14 | 80kbps | `ambient/`: first-morning-of-leave, rainy-day-off, four-pm-wake-up, waiting-for-the-parcel, saturday-sleep-in, sunny-window-sofa, after-work-bath, folding-laundry-sunday, payday-night-walk, no-meeting-friday, airplane-mode-day, dangerous-outside-the-blanket, last-night-of-leave, half-day-off-nap |
| 어쿠스틱 기타 | 14 | 64kbps | `acoustic/`: saturday-tent-morning, highway-to-the-campsite, toasted-marshmallow, weekend-farm-lettuce, riverside-picnic-mat, trailhead-gimbap, feet-in-the-stream, nap-in-the-camping-chair, stargazing-sunday-night, night-before-monday, sunday-bike-ride, car-camping-by-the-sea, autumn-leaves-drive, watering-the-garden |
| 레트로 RPG 마을 | 13 | 64kbps | `retro/`: first-login-after-work, guild-meetup-friday, pajama-dungeon, late-night-snack-buff, daily-login-reward, quest-do-the-dishes, weekend-raid-lobby, blacksmith-overtime, nap-at-the-inn, convenience-store-checkpoint, max-level-monday, alarm-before-the-boss, credits-and-cup-noodles |

### 외부 무료 음원 — 29곡
원본 페이지에서 라이선스를 직접 확인한 곡만 넣었습니다(2026-11 확인, 여러 라이선스가 걸린 곡은 CC0로 사용). 받은 원본을 44.1kHz 스테레오 128kbps로 다시 인코딩하고 음량을 다른 곡과 같은 -19 LUFS로 맞췄습니다(변경 사항). happy lofi day, Dimly lit, Apple Cider는 고역을 살짝 깎았습니다. 다시 받으려면 `node scripts/gen-bgm.mjs --fetch`(출처 목록은 스크립트의 `EXTERNAL`).

| 플레이리스트 | 파일 | 곡 | 작가 | 출처 | 라이선스 |
|---|---|---|---|---|---|
| 오르골 | `orgel/moonlit-lullaby-for-the-lost.mp3` | Moonlit Lullaby for the Lost | Tsorthan Grove | https://opengameart.org/content/moonlit-lullaby-for-the-lost | CC0 |
| 오르골 | `orgel/music-box-sad-tune.mp3` | Sad Tune (4 Music Box Tracks 중 musicbox3_sad_tune) | Aureolus_Omicron | https://opengameart.org/content/4-music-box-tracks | CC0 |
| 오르골 | `orgel/music-box-cute-tune.mp3` | Cute Tune (4 Music Box Tracks 중 musicbox2_cute_tune) | Aureolus_Omicron | https://opengameart.org/content/4-music-box-tracks | CC0 |
| 오르골 | `orgel/frost-waltz.mp3` | Frost Waltz | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100516 | CC BY 4.0 |
| 로파이 | `lofi/chill-lofi-inspired.mp3` | Chill lofi inspired | omfgdude | https://opengameart.org/content/chill-lofi-inspired | CC0 |
| 로파이 | `lofi/happy-lofi-day.mp3` | happy lofi day | Tarush Singhal | https://opengameart.org/content/happy-lofi-day | CC0 |
| 로파이 | `lofi/in-the-lobby.mp3` | In the Lobby | Umplix | https://opengameart.org/content/in-the-lobby | CC0 |
| 로파이 | `lofi/dimly-lit.mp3` | Dimly lit | iamoneabe | https://opengameart.org/content/dimly-lit | CC0 |
| 잔잔한 피아노 | `piano/calm-piano-vaporware.mp3` | Calm Piano 1 (Vaporware) | The Cynic Project (cynicmusic.com / pixelsphere.org) | https://opengameart.org/content/calm-piano-1-vaporware | CC0 |
| 잔잔한 피아노 | `piano/calmant.mp3` | Calmant | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100859 | CC BY 4.0 |
| 잔잔한 피아노 | `piano/dreamer.mp3` | Dreamer | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600043 | CC BY 4.0 |
| 8비트 | `chiptune/apple-cider.mp3` | Apple Cider | Zane Little Music | https://opengameart.org/content/apple-cider | CC0 |
| 8비트 | `chiptune/napping-on-a-cloud.mp3` | Napping on a Cloud | congusbongus | https://opengameart.org/content/napping-on-a-cloud | CC0 |
| 8비트 | `chiptune/8bit-bossa.mp3` | 8bit Bossa | Joth | https://opengameart.org/content/bossa-nova | CC0 |
| 재즈 카페 | `jazz/mocha-frapp.mp3` | Mocha Frapp | Alex McCulloch (Pro Sensory) | https://opengameart.org/content/mocha-frapp | CC0 |
| 재즈 카페 | `jazz/blue-rain.mp3` | Blue Rain | Alex McCulloch (Pro Sensory) | https://opengameart.org/content/blue-rain | CC0 |
| 재즈 카페 | `jazz/once-in-a-while.mp3` | Once In a While | Alex McCulloch (Pro Sensory) | https://opengameart.org/content/once-in-a-while | CC0 |
| 재즈 카페 | `jazz/coffee-house-bump.mp3` | Coffee House Bump | OatCog | https://opengameart.org/content/coffee-house-bump | CC0 |
| 재즈 카페 | `jazz/lobby-time.mp3` | Lobby Time | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600054 | CC BY 4.0 |
| 몽환 앰비언트 | `ambient/waking-states.mp3` | Waking States | Tsorthan Grove | https://opengameart.org/content/waking-states | CC0 |
| 몽환 앰비언트 | `ambient/dream-ambience.mp3` | Dream (Ambience) | TokyoGeisha | https://opengameart.org/content/dream-ambience | CC0 |
| 몽환 앰비언트 | `ambient/contemplation.mp3` | Contemplation | Joth | https://opengameart.org/content/contemplation-0 | CC0 |
| 어쿠스틱 기타 | `acoustic/a-small-fire-will-do.mp3` | A Small Fire Will Do | Cal McEachern (Trex0n) | https://opengameart.org/content/a-small-fire-will-do-calming-loop | CC0 |
| 어쿠스틱 기타 | `acoustic/just-you-and-me.mp3` | Just You and Me (Guitar) | Alex McCulloch (Pro Sensory) | https://opengameart.org/content/just-you-and-me-guitar | CC0 |
| 어쿠스틱 기타 | `acoustic/ladada-guitar.mp3` | LaDaDa Guitar | Alex McCulloch (Pro Sensory) | https://opengameart.org/content/ladada-guitar | CC0 |
| 레트로 RPG 마을 | `retro/welcome-to-the-item-shop.mp3` | Welcome to the Item Shop | congusbongus | https://opengameart.org/content/welcome-to-the-item-shop | CC0 |
| 레트로 RPG 마을 | `retro/quaint-town.mp3` | Quaint Town | neonarkade | https://opengameart.org/content/quaint-town | CC0 |
| 레트로 RPG 마을 | `retro/a-new-town.mp3` | A New Town | The Cynic Project (cynicmusic.com / pixelsphere.org) | https://opengameart.org/content/a-new-town-rpg-theme | CC0 |
| 레트로 RPG 마을 | `retro/magic-town.mp3` | Magic Town | controllerhead | https://opengameart.org/content/magic-town | CC0 |

- Kevin MacLeod 곡 저작자 표시: "<곡명>" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
- CC0 곡이라도 작가가 표기를 부탁한 경우(The Cynic Project, Alex McCulloch 등)를 포함해 모든 외부 곡의 작가를 이 표와 tracks.json에 적어 둡니다.
- 외부 음원을 더 넣을 때도 원본 페이지에서 라이선스를 확인할 수 있는 CC0·CC BY 곡만 씁니다(Pixabay Content License도 가능). 출처가 불분명하거나 유튜브에서 뽑은 음원은 쓰지 않습니다.

## 효과음 (SFX)
- `apps/web/public/sfx/` 24개: campfire(모닥불 16초 루프, 약 -20 LUFS), say(말풍선 '뿅', 0.2초), firework-launch, firework-burst, coin, flower, bell(산사 종), splash, swim(물장구 루프), bubble(잠수), swing(삐걱), wave(휘파람), cheer, hit, crit, monster-die, levelup, potion, skill, coin-drop, defeat, victory, tick, miss
- 모두 `scripts/gen-bgm.mjs`가 코드로 합성한 자체 제작 음원이며 **CC0**입니다. 대부분 약 -16 LUFS(봉우리가 날카로운 splash·swing은 약 -17~-18, 아주 짧은 tick은 -21), true peak ≤ -1.6 dBTP로 맞췄습니다.
