# CREDITS

## 폰트
| 이름 | 제작 | 라이선스 | 위치 |
|---|---|---|---|
| Galmuri (Galmuri11, Galmuri11 Bold, Galmuri9, Galmuri14) | Lee Minseo (quiple) — https://github.com/quiple/galmuri | SIL Open Font License 1.1 | `apps/web/public/fonts/` (웹), `apps/web/assets/fonts/` (OG 이미지) — 라이선스 원문 `Galmuri-OFL.txt` 동봉 |

## 그래픽
- 모든 픽셀 스프라이트(캐릭터, 묘비, 소품, 타일)는 `apps/web/game/sprites/`의 코드로 생성한 자체 제작 플레이스홀더입니다. 외부 에셋을 쓰지 않았습니다.
- 외부 에셋으로 교체할 때는 **CC0만** 사용하고(예: Kenney), 이 표에 출처를 추가합니다. 교체 지점은 `apps/web/game/assets/manifest.ts`입니다.

## 음원 (BGM)
플레이리스트 9개, 175곡, 길이 합 약 6시간입니다. 순서는 로파이·오르골·빗소리·피아노·8비트·재즈·앰비언트·어쿠스틱 기타·레트로 RPG이고, 처음 들어오면 로파이로 시작합니다. 곡 목록·순서·길이·저작자는 `apps/web/public/bgm/tracks.json`에 있고(플레이어 ⓘ에 표시됨), 파일은 모두 `apps/web/public/bgm/{playlist}/*.mp3`에 직접 넣었습니다(외부 핫링크 없음). 형식은 MP3 44.1kHz 스테레오, 통합 라우드니스 약 -19 LUFS로 통일했습니다.

- 로파이·재즈·어쿠스틱 기타(55곡): 2026-11에 픽사베이 곡으로 바꿨습니다. 예전 로파이·재즈 카페·어쿠스틱 기타 60곡은 뺐고, 재즈가 재즈 카페 자리를 대신합니다.
- 오르골·빗소리·피아노·8비트·앰비언트·레트로 RPG(120곡): 예전 그대로입니다(자체 제작 103곡 + 외부 무료 음원 17곡).

### 픽사베이 (Pixabay Content License) — 55곡 (로파이 16·재즈 19·어쿠스틱 기타 20)
모두 **Pixabay Content License**(저작자 표시 의무 없음, 상업적 이용 가능)를 따릅니다. `scripts/gen-bgm.mjs`는 이 세 목록을 굽거나 지우지 않고, tracks.json을 다시 쓸 때도 지금 내용을 그대로 옮깁니다.

- 손질(2026-11): 받은 원본(256kbps)을 MP3 44.1kHz 스테레오 128kbps로 다시 인코딩했습니다. 앞뒤 무음은 0.5초만 남기고 다듬었고(-55dB 기준), 소리 크기는 loudnorm 2패스로 곡끼리 같은 약 -19 LUFS(true peak ≤ -1.5 dBTP, 효과음·환경음과 맞춰 온 예전 곡들과 같은 크기)로 맞췄으며, 메타데이터 태그는 지웠습니다.
- 화면 제목은 분위기에 맞춰 새로 붙인 한국어 이름입니다. 아래 표의 원본 파일 이름 끝 숫자가 픽사베이 곡 번호입니다.

| 플레이리스트 | 파일 (`apps/web/public/bgm/…`) | 화면 제목 | 작가 | 원본 파일 이름 | 길이(초) |
|---|---|---|---|---|---|
| 로파이 | `lofi/alex-morgan-chillhop-jazz-restaurant.mp3` | 회사 앞 식당 창가 자리 | Alex Morgan | `alex-morgan-chillhop-jazz-restaurant-552773.mp3` | 122 |
| 로파이 | `lofi/alex-morgan-chillhop-jazz-sunny-cafe.mp3` | 점심 먹고 들른 햇살 카페 | Alex Morgan | `alex-morgan-chillhop-jazz-sunny-cafe-552758.mp3` | 84 |
| 로파이 | `lofi/alex-morgan-lofi-christmas-music.mp3` | 연말 회식 끝나고 걷는 길 | Alex Morgan | `alex-morgan-lofi-christmas-music-552764.mp3` | 92 |
| 로파이 | `lofi/allworldmusic-lofi-chill-melancholic.mp3` | 막차 창문에 기댄 이마 | AllWorldMusic | `allworldmusic-lofi-chill-melancholic-259764.mp3` | 240 |
| 로파이 | `lofi/hitslab-lofi-chill-background-music.mp3` | 보고서 띄워 놓고 멍때리기 | HitsLab | `hitslab-lofi-chill-background-music-313055.mp3` | 594 |
| 로파이 | `lofi/htb-music-hermit-complex.mp3` | 주말 내내 집 밖에 안 나가기 | HTB Music | `htb-music-hermit-complex-481376.mp3` | 399 |
| 로파이 | `lofi/luminkai-dreamscape.mp3` | 퇴근 버스에서 깜빡 든 잠 | Luminkai | `luminkai-dreamscape-172259.mp3` | 313 |
| 로파이 | `lofi/nengjemping-lofi-music-background-hits.mp3` | 야근 모드 켜 두는 긴 밤 | Nengjemping | `nengjemping-lofi-music-background-hits-352712.mp3` | 1408 |
| 로파이 | `lofi/turning-pages-battle-flutes-in-the-field-lofi.mp3` | 월요일 아침 회의 들어가기 전 | Turning Pages | `turning_pages-battle-flutes-in-the-field-lofi-464420.mp3` | 209 |
| 로파이 | `lofi/turning-pages-battle-preparation-lofi.mp3` | 발표 자료 마지막 점검 | Turning Pages | `turning_pages-battle-preparation-lofi-464441.mp3` | 129 |
| 로파이 | `lofi/turning-pages-eevees-sundown-beat.mp3` | 해 질 녘 사무실 블라인드 | Turning Pages | `turning_pages-eevees-sundown-beat-462727.mp3` | 129 |
| 로파이 | `lofi/turning-pages-elms-sunny-desk-piano-lofi.mp3` | 햇살 드는 내 책상 | Turning Pages | `turning_pages-elmx27s-sunny-desk-piano-lofi-462747.mp3` | 150 |
| 로파이 | `lofi/turning-pages-new-bark-morning-light.mp3` | 알람 없이 깬 토요일 아침 | Turning Pages | `turning_pages-new-bark-morning-light-590775.mp3` | 163 |
| 로파이 | `lofi/turning-pages-subtle-pixel-glow.mp3` | 꺼진 모니터에 비친 얼굴 | Turning Pages | `turning_pages-subtle-pixel-glow-462740.mp3` | 159 |
| 로파이 | `lofi/vaitsez-chill-game-gaming-music.mp3` | 퇴근 후 게임 한 판만 | Vaitsez | `vaitsez-chill-game-gaming-music-620121.mp3` | 168 |
| 로파이 | `lofi/zephiramusic-lofi-gaming.mp3` | 한 판만 더 하고 잘게 | ZephiraMusic | `zephiramusic-lofi-gaming-606302.mp3` | 154 |
| 재즈 | `jazz/alex-morgan-jazz-coffee-shop-music.mp3` | 출근 전 테이크아웃 커피 | Alex Morgan | `alex-morgan-jazz-coffee-shop-music-571652.mp3` | 132 |
| 재즈 | `jazz/alex-morgan-jazz-midnight-club-music.mp3` | 2차는 조용한 바에서 | Alex Morgan | `alex-morgan-jazz-midnight-club-music-563583.mp3` | 189 |
| 재즈 | `jazz/alex-morgan-jazz-rainy-night-music.mp3` | 비 오는 퇴근길 우산 속 | Alex Morgan | `alex-morgan-jazz-rainy-night-music-571656.mp3` | 163 |
| 재즈 | `jazz/alex-morgan-jazz-restaurant-music.mp3` | 기념일 저녁 예약석 | Alex Morgan | `alex-morgan-jazz-restaurant-music-556244.mp3` | 169 |
| 재즈 | `jazz/alex-morgan-jazz-restaurant-music-2.mp3` | 팀장님이 사 주는 점심 | Alex Morgan | `alex-morgan-jazz-restaurant-music-563578.mp3` | 157 |
| 재즈 | `jazz/alex-morgan-jazz-song-sunny-cafe-nu-jazz.mp3` | 연차 낸 평일 오후 카페 | Alex Morgan | `alex-morgan-jazz-song-sunny-cafe-nu-jazz-587413.mp3` | 164 |
| 재즈 | `jazz/alex-morgan-jazz-study-music.mp3` | 자격증 공부 세 번째 다짐 | Alex Morgan | `alex-morgan-jazz-study-music-563581.mp3` | 183 |
| 재즈 | `jazz/alex-morgan-organ-jazz-rainy-night-music.mp3` | 빗소리 들으며 혼술 한 잔 | Alex Morgan | `alex-morgan-organ-jazz-rainy-night-music-564284.mp3` | 204 |
| 재즈 | `jazz/alex-morgan-samba-jazz-restaurant.mp3` | 금요일 저녁 맛집 웨이팅 | Alex Morgan | `alex-morgan-samba-jazz-restaurant-567538.mp3` | 112 |
| 재즈 | `jazz/alex-morgan-saxophone-jazz-restaurant.mp3` | 혼밥도 근사하게 먹는 날 | Alex Morgan | `alex-morgan-saxophone-jazz-restaurant-567542.mp3` | 123 |
| 재즈 | `jazz/atlasaudio-coffee-jazz.mp3` | 세 번째 아메리카노 리필 | AtlasAudio | `atlasaudio-coffee-jazz-617555.mp3` | 310 |
| 재즈 | `jazz/atlasaudio-jazz.mp3` | 칼퇴 성공한 목요일 | AtlasAudio | `atlasaudio-jazz-617585.mp3` | 156 |
| 재즈 | `jazz/atlasaudio-jazz-music.mp3` | 엘리베이터 안 짧은 침묵 | AtlasAudio | `atlasaudio-jazz-music-617577.mp3` | 98 |
| 재즈 | `jazz/aurec-jazz.mp3` | 결재 올리고 기다리는 중 | Aurec | `aurec-jazz-584847.mp3` | 114 |
| 재즈 | `jazz/aurec-jazz-trio.mp3` | 입사 동기 셋이 모인 술자리 | Aurec | `aurec-jazz-trio-613387.mp3` | 172 |
| 재즈 | `jazz/aurec-summer-jazz.mp3` | 여름휴가 비행기 표 예매 | Aurec | `aurec-summer-jazz-611129.mp3` | 140 |
| 재즈 | `jazz/studiokolomna-jazz-groove.mp3` | 월급날 저녁 가벼운 발걸음 | StudioKolomna | `studiokolomna-jazz-groove-632662.mp3` | 115 |
| 재즈 | `jazz/the-mountain-lofi-jazz.mp3` | 노트북 덮고 기지개 | The Mountain | `the_mountain-lofi-jazz-576575.mp3` | 170 |
| 재즈 | `jazz/velariomusic-smooth-jazz.mp3` | 야경 보이는 회의실 야근 | VelarioMusic | `velariomusic-smooth-jazz-610022.mp3` | 213 |
| 어쿠스틱 기타 | `acoustic/51604229-positive-acoustic-guitar-vibes.mp3` | 오늘은 왠지 일이 잘 풀리는 날 | 51604229 | `51604229-positive-acoustic-guitar-vibes-526510.mp3` | 162 |
| 어쿠스틱 기타 | `acoustic/alex-morgan-acoustic-guitar-sunrise-travel.mp3` | 연차 붙여 떠나는 새벽 기차 | Alex Morgan | `alex-morgan-acoustic-guitar-sunrise-travel-573651.mp3` | 149 |
| 어쿠스틱 기타 | `acoustic/andriig-acoustic-music.mp3` | 창문 열고 하는 주말 청소 | AndriiG | `andriig-acoustic-music-573235.mp3` | 138 |
| 어쿠스틱 기타 | `acoustic/apalonbeats-guitar-guitar-music.mp3` | 점심시간 회사 뒤 산책 | ApalonBeats | `apalonbeats-guitar-guitar-music-560416.mp3` | 121 |
| 어쿠스틱 기타 | `acoustic/apalonbeats-instrumental-guitar-guitar-music.mp3` | 공원 벤치에서 먹는 샌드위치 | ApalonBeats | `apalonbeats-instrumental-guitar-guitar-music-597091.mp3` | 140 |
| 어쿠스틱 기타 | `acoustic/dieu-anh-drifting-pines-acoustic-folk-guitar-instrumental.mp3` | 캠핑 의자에 기대앉은 오후 | Dieu Anh | `dieu_anh-drifting-pines-acoustic-folk-guitar-instrumental-545147.mp3` | 195 |
| 어쿠스틱 기타 | `acoustic/echoes-of-lumen-acoustic-guitar.mp3` | 옥상에서 마시는 캔커피 | Echoes of Lumen | `echoes_of_lumen-acoustic-guitar-584896.mp3` | 78 |
| 어쿠스틱 기타 | `acoustic/echoes-of-lumen-love-acoustic.mp3` | 사내 연애는 비밀로 | Echoes of Lumen | `echoes_of_lumen-love-acoustic-584895.mp3` | 68 |
| 어쿠스틱 기타 | `acoustic/echoes-of-lumen-love-acoustic-romantic-hindi-guitar.mp3` | 퇴근하고 만나는 우리 | Echoes of Lumen | `echoes_of_lumen-love-acoustic-romantic-hindi-guitar-589284.mp3` | 179 |
| 어쿠스틱 기타 | `acoustic/fidelfortune-gentle-acoustic-guitar.mp3` | 일요일 오후 빨래 개기 | FidelFortune | `fidelfortune-gentle-acoustic-guitar-319483.mp3` | 147 |
| 어쿠스틱 기타 | `acoustic/fingerstyle-strings-lab-spanish-guitar-acoustic.mp3` | 언젠가 갈 스페인 여행 적금 | Fingerstyle Strings Lab | `fingerstyle-strings-lab-spanish-guitar-acoustic-538756.mp3` | 179 |
| 어쿠스틱 기타 | `acoustic/folk-acoustic-the-beat-of-nature.mp3` | 주말 등산 다짐만 세 번째 | Folk Acoustic | `folk_acoustic-the-beat-of-nature-122841.mp3` | 173 |
| 어쿠스틱 기타 | `acoustic/mondamusic-guitar-guitar-music.mp3` | 자전거로 출근해 본 날 | MondaMusic | `mondamusic-guitar-guitar-music-512901.mp3` | 194 |
| 어쿠스틱 기타 | `acoustic/paulyudin-acoustic-acoustic-music.mp3` | 고향 집 가는 고속버스 | PaulYudin | `paulyudin-acoustic-acoustic-music-574005.mp3` | 143 |
| 어쿠스틱 기타 | `acoustic/sonican-acoustic-guitar-finger-picking-no2-loop.mp3` | 점심 먹고 졸린 오후 두 시 | Sonican | `sonican-acoustic-guitar-finger-picking-no2-loop-471821.mp3` | 80 |
| 어쿠스틱 기타 | `acoustic/starostin-instrumental-acoustic-guitar-music.mp3` | 베란다 화분에 물 주기 | Starostin | `starostin-instrumental-acoustic-guitar-music-401434.mp3` | 223 |
| 어쿠스틱 기타 | `acoustic/starostin-instrumental-acoustic-guitar-music-2.mp3` | 오랜만에 쓰는 손편지 | Starostin | `starostin-instrumental-acoustic-guitar-music-447306.mp3` | 199 |
| 어쿠스틱 기타 | `acoustic/surprising-media-romantic-acoustic-guitar-3.mp3` | 첫 월급으로 산 꽃다발 | Surprising Media | `surprising_media-romantic-acoustic-guitar-3-433551.mp3` | 152 |
| 어쿠스틱 기타 | `acoustic/tunetank-instrumental-acoustic-guitar-music.mp3` | 반차 쓰고 걷는 한낮 | Tunetank | `tunetank-instrumental-acoustic-guitar-music-349949.mp3` | 153 |
| 어쿠스틱 기타 | `acoustic/universfield-warm-acoustic-guitar.mp3` | 따뜻한 보리차 한 잔 | Universfield | `universfield-warm-acoustic-guitar-232912.mp3` | 94 |

### 자체 제작 (CC0) — 103곡 (오르골·빗소리·피아노·8비트·앰비언트·레트로 RPG)
외부 음원·샘플 없이 `scripts/gen-bgm.mjs`가 코드로 작곡·합성했습니다. 트랙마다 고정 시드를 써서 `node scripts/gen-bgm.mjs`를 다시 돌리면 같은 파일이 나옵니다(ffmpeg 필요).

| 플레이리스트 | 곡 수 | 파일 (`apps/web/public/bgm/…`) |
|---|---|---|
| 오르골 | 11 | `orgel/`: moonlit-orgel, unfinished-lullaby, first-commit-waltz, archived-dreams, hello-world, forgotten-readme, localhost-lullaby, sleeping-prototype, deprecated-star, version-zero-one, last-star-on-the-graph |
| 빗소리 | 8 | `rain/`: rain-on-stones, distant-thunder, rainy-night-etude, night-crickets, wind-in-the-trees, tin-roof, drizzle-far-bell, foggy-dawn |
| 피아노 | 5 | `piano/`: after-the-last-commit, closed-issues, commented-out-feelings, deprecated-docs, snow-on-the-server |
| 8비트 | 4 | `chiptune/`: pixel-graveyard-walk, save-point, no-extra-life, stuck-on-title-screen |
| 앰비언트 | 3 | `ambient/`: dreaming-in-the-cloud, garbage-collected-memories, sleep-mode |
| 레트로 RPG | 3 | `retro/`: item-shop-of-unfinished-swords, inn-at-version-zero, village-of-abandoned-quests |

**3차 보강** (플레이리스트마다 20곡을 채우려고 추가, 지금 남은 6개 목록에서 69곡). 용량을 아끼려고 기존 곡(128kbps)과 달리 64kbps(잡음이 많은 빗소리·몽환 앰비언트는 80kbps)로, 길이는 66~84초로 구웠습니다. 기존 파일은 그대로 두고 `node scripts/gen-bgm.mjs --missing`으로 없는 파일만 굽습니다.

| 플레이리스트 | 곡 수 | 비트레이트 | 파일 (`apps/web/public/bgm/…`) |
|---|---|---|---|
| 오르골 | 5 | 64kbps | `orgel/`: sunday-eleven-pm, payday-night-music-box, first-snow-commute, after-the-dishes, saturday-no-alarm |
| 빗소리 | 12 | 80kbps | `rain/`: umbrella-crosswalk, bus-stop-downpour, cafe-window-seat, meeting-room-monsoon, rainy-monday-morning, wet-sneakers, waiting-under-the-eaves, no-umbrella-going-home, convenience-store-awning, thunder-overtime, foggy-bus-window, monsoon-office-afternoon |
| 피아노 | 12 | 64kbps | `piano/`: back-seat-of-the-bus, convenience-store-light, empty-elevator, ten-pm-laundry, payday-sunset, letter-back-in-the-drawer, holiday-train-home, ten-minutes-on-the-roof, month-end-closing, after-the-farewell-party, sunday-shirt-ironing, first-workday-of-the-year |
| 8비트 | 13 | 64kbps | `chiptune/`: lunch-menu-dilemma, last-meal-ticket, elevator-mind-game, coffee-ladder-game, afternoon-meeting-boss, pantry-snack-raid, clock-out-speedrun, punch-in-combo, weekly-report-quest, employee-badge-level-up, post-lunch-walk-stage, vending-machine-jackpot, parcel-arrived-alert |
| 앰비언트 | 14 | 80kbps | `ambient/`: first-morning-of-leave, rainy-day-off, four-pm-wake-up, waiting-for-the-parcel, saturday-sleep-in, sunny-window-sofa, after-work-bath, folding-laundry-sunday, payday-night-walk, no-meeting-friday, airplane-mode-day, dangerous-outside-the-blanket, last-night-of-leave, half-day-off-nap |
| 레트로 RPG | 13 | 64kbps | `retro/`: first-login-after-work, guild-meetup-friday, pajama-dungeon, late-night-snack-buff, daily-login-reward, quest-do-the-dishes, weekend-raid-lobby, blacksmith-overtime, nap-at-the-inn, convenience-store-checkpoint, max-level-monday, alarm-before-the-boss, credits-and-cup-noodles |

**중복 정리 (2026-11) — 42곡 다시 만듦(그중 로파이·재즈 카페·어쿠스틱 기타 곡은 뒤에 픽사베이 곡으로 바뀌어 빠졌습니다).** "이름만 다르고 같은 곡 같다"는 피드백에 따라 전체 180곡을 검사했습니다. tracks.json 파일 경로 중복 0건, mp3 해시 중복 0건, 시드 중복 0건이었고, 디코딩한 PCM 지문(앞 70초 크로마·대역 에너지, 마디 단위 크로마)과 생성 설정(진행의 근음열·조·템포·반주·드럼·빗소리 구성) 비교에서 '들으면 사실상 같은 곡'으로 판정된 곡만 새 설정(시드 1001 이상, 다른 진행·조·템포·패턴)으로 다시 구웠습니다. 파일 경로와 비트레이트(기존 128kbps, 3차 64/80kbps)는 그대로 두고 덮어썼고, 외부 곡은 건드리지 않았습니다.

| 플레이리스트 | 다시 만든 곡 (`apps/web/public/bgm/…`) |
|---|---|
| 오르골 | `orgel/`: last-star-on-the-graph, sunday-eleven-pm |
| 빗소리 | `rain/`: bus-stop-downpour, cafe-window-seat, wet-sneakers, convenience-store-awning, thunder-overtime, foggy-bus-window |
| 8비트 | `chiptune/`: save-point, weekly-report-quest, vending-machine-jackpot |
| 앰비언트 | `ambient/`: sunny-window-sofa, payday-night-walk, no-meeting-friday, airplane-mode-day, half-day-off-nap |
| 레트로 RPG | `retro/`: first-login-after-work, guild-meetup-friday, pajama-dungeon, late-night-snack-buff, nap-at-the-inn, convenience-store-checkpoint, credits-and-cup-noodles |

같은 정리 때 플레이리스트 이름을 장르명(오르골·로파이·빗소리·피아노·8비트·재즈 카페·앰비언트·어쿠스틱 기타·레트로 RPG)으로 되돌리고, 자체 제작곡 제목을 목록 분위기에 맞는 회사원 일상 이름으로 바꿨습니다(외부 곡은 원제 유지).

### 외부 무료 음원 — 17곡
원본 페이지에서 라이선스를 직접 확인한 곡만 넣었습니다(2026-11 확인, 여러 라이선스가 걸린 곡은 CC0로 사용). 받은 원본을 44.1kHz 스테레오 128kbps로 다시 인코딩하고 음량을 다른 곡과 같은 -19 LUFS로 맞췄습니다(변경 사항). happy lofi day, Dimly lit, Apple Cider는 고역을 살짝 깎았습니다. 다시 받으려면 `node scripts/gen-bgm.mjs --fetch`(출처 목록은 스크립트의 `EXTERNAL`).

| 플레이리스트 | 파일 | 곡 | 작가 | 출처 | 라이선스 |
|---|---|---|---|---|---|
| 오르골 | `orgel/moonlit-lullaby-for-the-lost.mp3` | Moonlit Lullaby for the Lost | Tsorthan Grove | https://opengameart.org/content/moonlit-lullaby-for-the-lost | CC0 |
| 오르골 | `orgel/music-box-sad-tune.mp3` | Sad Tune (4 Music Box Tracks 중 musicbox3_sad_tune) | Aureolus_Omicron | https://opengameart.org/content/4-music-box-tracks | CC0 |
| 오르골 | `orgel/music-box-cute-tune.mp3` | Cute Tune (4 Music Box Tracks 중 musicbox2_cute_tune) | Aureolus_Omicron | https://opengameart.org/content/4-music-box-tracks | CC0 |
| 오르골 | `orgel/frost-waltz.mp3` | Frost Waltz | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100516 | CC BY 4.0 |
| 피아노 | `piano/calm-piano-vaporware.mp3` | Calm Piano 1 (Vaporware) | The Cynic Project (cynicmusic.com / pixelsphere.org) | https://opengameart.org/content/calm-piano-1-vaporware | CC0 |
| 피아노 | `piano/calmant.mp3` | Calmant | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1100859 | CC BY 4.0 |
| 피아노 | `piano/dreamer.mp3` | Dreamer | Kevin MacLeod (incompetech.com) | https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1600043 | CC BY 4.0 |
| 8비트 | `chiptune/apple-cider.mp3` | Apple Cider | Zane Little Music | https://opengameart.org/content/apple-cider | CC0 |
| 8비트 | `chiptune/napping-on-a-cloud.mp3` | Napping on a Cloud | congusbongus | https://opengameart.org/content/napping-on-a-cloud | CC0 |
| 8비트 | `chiptune/8bit-bossa.mp3` | 8bit Bossa | Joth | https://opengameart.org/content/bossa-nova | CC0 |
| 앰비언트 | `ambient/waking-states.mp3` | Waking States | Tsorthan Grove | https://opengameart.org/content/waking-states | CC0 |
| 앰비언트 | `ambient/dream-ambience.mp3` | Dream (Ambience) | TokyoGeisha | https://opengameart.org/content/dream-ambience | CC0 |
| 앰비언트 | `ambient/contemplation.mp3` | Contemplation | Joth | https://opengameart.org/content/contemplation-0 | CC0 |
| 레트로 RPG | `retro/welcome-to-the-item-shop.mp3` | Welcome to the Item Shop | congusbongus | https://opengameart.org/content/welcome-to-the-item-shop | CC0 |
| 레트로 RPG | `retro/quaint-town.mp3` | Quaint Town | neonarkade | https://opengameart.org/content/quaint-town | CC0 |
| 레트로 RPG | `retro/a-new-town.mp3` | A New Town | The Cynic Project (cynicmusic.com / pixelsphere.org) | https://opengameart.org/content/a-new-town-rpg-theme | CC0 |
| 레트로 RPG | `retro/magic-town.mp3` | Magic Town | controllerhead | https://opengameart.org/content/magic-town | CC0 |

- Kevin MacLeod 곡 저작자 표시: "<곡명>" Kevin MacLeod (incompetech.com), Licensed under Creative Commons: By Attribution 4.0 License — http://creativecommons.org/licenses/by/4.0/
- CC0 곡이라도 작가가 표기를 부탁한 경우(The Cynic Project, Alex McCulloch 등)를 포함해 모든 외부 곡의 작가를 이 표와 tracks.json에 적어 둡니다.
- 외부 음원을 더 넣을 때도 원본 페이지에서 라이선스를 확인할 수 있는 CC0·CC BY 곡만 씁니다(Pixabay Content License도 가능). 출처가 불분명하거나 유튜브에서 뽑은 음원은 쓰지 않습니다.

## 효과음 (SFX)
- `apps/web/public/sfx/` 26개: campfire(모닥불 16초 루프, 약 -20 LUFS), say(말풍선 '뿅', 0.2초), firework-launch, firework-burst, coin, flower, bell(산사 종), splash, swim(물장구 루프), bubble(잠수), swing(삐걱), wave(휘파람), cheer, hit, crit, monster-die, levelup, potion, skill, coin-drop, defeat, victory, tick, miss, rain-loop(날씨 비 12초 루프, 약 -21 LUFS, 56kbps), thunder(천둥 한 번 8초, 56kbps)
- 사냥 손맛(NEXT 2·16·40번) 11개: kill(처치), swish·thud·stab·clack·twang·flick·ink(무기 방식마다 공격 소리), warn(몬스터 경고), slam(몬스터 내려찍기·폭발), roar(우두머리 단계) — 64kbps, 각 1.5~10KB. hit·crit·miss·levelup은 같은 때 다시 만들었다.
- 모두 `scripts/gen-bgm.mjs`가 코드로 합성한 자체 제작 음원이며 **CC0**입니다. 대부분 약 -16 LUFS(봉우리가 날카로운 splash·swing은 약 -17~-18, 아주 짧은 tick은 -21), true peak ≤ -1.6 dBTP로 맞췄습니다.
