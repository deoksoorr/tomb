import type { MapConcept } from "@/lib/mapConcept";
import { GEAR_HEAD, GEAR_NECK } from "../../sprites/avatarGear";
import { registerNpcWear, type NpcWear } from "../../sprites/npcWear";

// 11/17 돌아다니는 주민(마을 Residents·바닷가·캠핑장 Folk)의 겨울·크리스마스 옷 한 벌과 계절 한마디 (순수 데이터 → npcOutfits.test.ts).
//  그림은 sprites/npcWear (착용 목록에 "nw.{주민 id}.{w|x}"를 넣으면 시트에 같이 그린다). 플레이어 꾸미기와는 따로.
//  원래 옷 색·성격에 맞춰 한 사람씩 다르게: 겨울 = 털모자·귀마개·목도리·외투·장갑·장화, 크리스마스 = 그 위에 산타 모자·루돌프 머리띠·요정 모자·호랑가시.
//  상인(얼음 총각·캠핑카 아빠)은 앞치마·선물 상자, 유령 같은 이불 주민(불씨·달마중)은 반투명 산타 모자.
//  계절 한마디는 원래 대사(5~8줄 제한)와 따로 둔다 — 말 걸면 가끔 이 중에서.

type Outfit = { winter: NpcWear; christmas: NpcWear; say: { winter: readonly string[]; christmas: readonly string[] } };

// ── 자주 쓰는 색 ──
const RED = 0xd23a44;
const RED_DEEP = 0xa8283a;
const GREEN = 0x2e8a4e;
const GREEN_DEEP = 0x1f6a3c;
const CREAM = 0xf4ecd8;
const SNOW = 0xf8f8f4;
const BROWN = 0x6a4a34;
const BLACK_BOOT = 0x34303a;
const FUR_CUFF = 0xf2ead8;

export const NPC_OUTFITS: Readonly<Record<string, Outfit>> = {
  // ── 마을 ──
  kimdr: {
    // 겁 많은 귀신의집 안내원: 남색 롱코트 + 하늘 귀마개, 크리스마스엔 겁먹은 루돌프
    winter: { hat: { kind: "earmuff", c: 0xc8d8f0, c2: 0x4a5a7a }, scarf: { c: 0x8fb3d9, c2: 0xe8ecf4, pat: "check", thick: true }, coat: { kind: "long", c: 0x3a4660 }, mitt: 0x5a6a8a, boot: { c: BLACK_BOOT } },
    christmas: { hat: { kind: "antler", c: RED }, nose: true, scarf: { c: RED, c2: SNOW, pat: "stripe" }, coat: { kind: "long", c: 0x2e5a48 }, mitt: RED, boot: { c: BLACK_BOOT }, brooch: true },
    say: { winter: ["귀신보다 칼바람이 더 무서워요", "귀마개 하니까 비명이 덜 들려요"], christmas: ["루돌프 코 달았어요, 안 무섭죠?", "메리 크리스마스! 깜짝 놀랐죠?"] },
  },
  parkjj: {
    winter: { hat: { kind: "beanie", c: 0x8a6a4a, c2: CREAM }, scarf: { c: 0xc8463c, pat: "rib", tail: true }, coat: { kind: "duffle", c: 0xb88a5a }, mitt: 0xc8463c, boot: { c: BROWN, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "sweater", c: 0xc8343e, c2: GREEN }, mitt: GREEN, boot: { c: BROWN, cuff: SNOW } },
    say: { winter: ["동물 친구들도 털이 복슬해졌어요", "오늘은 손이 꽁꽁 얼었어요"], christmas: ["펭귄들한테도 선물 줄 거예요", "메리 크리스마스! 멍멍!"] },
  },
  firekeeper: {
    winter: { hat: { kind: "beanie", c: 0xe08a3a, c2: 0xfff0c0 }, scarf: { c: 0xb8402e, pat: "rib" }, coat: { kind: "poncho", c: 0xd8743a, c2: 0xf6dca0 } },
    christmas: { hat: { kind: "ghostSanta", c: 0xf07a7a }, scarf: { c: GREEN, c2: SNOW, pat: "dots" }, coat: { kind: "poncho", c: RED_DEEP, c2: 0x3a9a5a } },
    say: { winter: ["불씨 곁으로 와요, 따뜻해요", "눈 오는 날엔 불이 더 예뻐요"], christmas: ["모닥불에 군밤 굽고 있어요", "메리 크리스마스, 손 녹이고 가요"] },
  },
  leegj: {
    winter: { hat: { kind: "bobble", c: 0xe88aa0, c2: SNOW }, scarf: { c: CREAM, c2: 0xe8b8c0, pat: "rib", thick: true }, cup: "knit", mitt: 0xe88aa0 },
    christmas: { hat: { kind: "elf" }, scarf: { c: RED, c2: GREEN, pat: "check", thick: true }, cup: "candy", mitt: RED },
    say: { winter: ["이불 밖은 너무 추워요", "코코아 한 잔이면 충분해요"], christmas: ["트리 앞에서 뒹굴 거예요", "메리 크리스마스! 집이 최고예요"] },
  },
  choisw: {
    winter: { hat: { kind: "earmuff", c: 0xf0a0c0, c2: 0x5a3a7a }, scarf: { c: 0xb89ad8, c2: SNOW, pat: "dots", tail: true }, coat: { kind: "puffer", c: 0x8a6ab8 }, mitt: 0xb89ad8, boot: { c: 0x5a4a6a, cuff: SNOW } },
    christmas: { hat: { kind: "holly" }, scarf: { c: RED, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "sweater", c: GREEN_DEEP, c2: RED }, mitt: RED, boot: { c: 0x5a4a6a, cuff: SNOW } },
    say: { winter: ["보따리에 핫팩도 챙겼어요", "눈길은 천천히 걸어요"], christmas: ["보따리 가득 선물이에요", "메리 크리스마스! 하나 줄까요?"] },
  },
  jungcj: {
    // 후광 친구: 겨울엔 후광 위로 귀마개, 크리스마스엔 빨간 롱코트로 산타 흉내
    winter: { hat: { kind: "earmuff", c: 0xf8e08a, c2: 0x6a7aa8 }, scarf: { c: 0x8fb3d9, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "long", c: 0xc8ccd8 }, mitt: 0x8fb3d9, boot: { c: 0x5a6a8a } },
    christmas: { hat: { kind: "santa" }, scarf: { c: SNOW, pat: "rib" }, coat: { kind: "long", c: 0xc0303c }, mitt: SNOW, boot: { c: BLACK_BOOT } },
    say: { winter: ["후광도 꽁꽁 얼 것 같아요", "눈길도 총총총 걸어요"], christmas: ["오늘은 제가 산타예요", "메리 크리스마스! 착한 아이죠?"] },
  },
  handr: {
    // 우산 주민: 우산은 그대로 펴고 (눈 우산) 귀마개 + 흰 패딩
    winter: { hat: { kind: "earmuff", c: 0xf06a6a, c2: 0x8a3a3a }, scarf: { c: 0xf0c040, c2: SNOW, pat: "stripe" }, coat: { kind: "puffer", c: 0xeef0f4 }, mitt: 0xf06a6a, boot: { c: 0xa8303a } },
    christmas: { hat: { kind: "earmuff", c: 0x6ac08a, c2: 0x2e6a48 }, scarf: { c: RED, c2: GREEN, pat: "check" }, coat: { kind: "puffer", c: 0xc8343e }, mitt: GREEN, brooch: true, boot: { c: 0xa8303a } },
    say: { winter: ["오늘은 눈 우산이에요", "우산 위에 눈이 소복해요"], christmas: ["우산에 방울 달까 고민 중이에요", "메리 크리스마스! 눈 맞지 마요"] },
  },
  ohbj: {
    winter: { hat: { kind: "trapper", c: 0x5a6a3a, c3: FUR_CUFF }, scarf: { c: 0xe08a3a, pat: "rib", thick: true }, box: "snow", mitt: 0xe08a3a, boot: { c: 0x3a5a7a } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, c2: SNOW, pat: "stripe", thick: true }, box: "gift", mitt: RED, boot: { c: 0x3a5a7a } },
    say: { winter: ["얼음 낚시 하기 딱 좋아요", "물고기도 추워서 숨었나 봐요"], christmas: ["저 오늘은 선물 상자예요", "메리 크리스마스! 풀어 볼래요?"] },
  },
  yoonjj: {
    winter: { hat: { kind: "beanie", c: 0xe0b040, c2: 0xfff0c8 }, scarf: { c: 0xd8644a, c2: CREAM, pat: "stripe" }, coat: { kind: "vest", c: 0xd8644a }, boot: { c: BROWN, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "antler", c: GREEN }, nose: true, scarf: { c: RED, c2: SNOW, pat: "stripe" }, coat: { kind: "sweater", c: 0xb8303c, c2: GREEN }, boot: { c: BROWN, cuff: SNOW } },
    say: { winter: ["등불이 손난로 대신이에요", "입김이 동글동글 나와요"], christmas: ["빨간 코로 길을 밝혀요", "메리 크리스마스! 반짝반짝!"] },
  },
  seogj: {
    winter: { hat: { kind: "beanie", c: 0x8a8a94, c2: SNOW }, scarf: { c: 0x3a4a6a, c2: 0x9aa4b8, pat: "check", tail: true }, coat: { kind: "long", c: 0xc8a878 }, mitt: 0x4a4a54, boot: { c: BLACK_BOOT } },
    christmas: { hat: { kind: "elf" }, scarf: { c: RED, pat: "rib", tail: true }, coat: { kind: "long", c: 0x2e6a4a }, mitt: RED, brooch: true, boot: { c: BLACK_BOOT } },
    say: { winter: ["출근길이 꽁꽁 얼었어요", "서류 가방 손잡이가 차가워요"], christmas: ["오늘은 칼퇴하고 파티해요", "메리 크리스마스! 야근은 없어요"] },
  },
  jangin: {
    winter: { hat: { kind: "bobble", c: 0x5a6ab8, c2: SNOW }, scarf: { c: 0xe8d0f0, c2: 0x8a6ab8, pat: "stripe", tail: true }, coat: { kind: "duffle", c: 0x3a4a7a }, mitt: 0xa88ad0, boot: { c: 0x4a3a5a, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, c2: SNOW, pat: "dots", tail: true }, coat: { kind: "duffle", c: 0xb8303c }, mitt: SNOW, boot: { c: 0x4a3a5a, cuff: SNOW } },
    say: { winter: ["한때는 눈사람 장인이었어요", "털모자 쓰니 귀가 따뜻해요"], christmas: ["한때는 산타 조수였어요", "메리 크리스마스! 냐옹"] },
  },
  kangdr: {
    winter: { hat: { kind: "trapper", c: 0x6a6a72, c3: 0xe8e4dc }, scarf: { c: 0xc8a050, pat: "rib" }, coat: { kind: "puffer", c: 0x3e6a4a }, mitt: 0x8a6a4a, boot: { c: BROWN, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "elf", c: 0x2e9a4e }, scarf: { c: RED, c2: SNOW, pat: "stripe" }, coat: { kind: "sweater", c: GREEN_DEEP, c2: RED }, mitt: RED, boot: { c: BROWN, cuff: SNOW } },
    say: { winter: ["등불 들고 눈길 순찰 중이에요", "발밑 얼음 조심해요"], christmas: ["요정 모자 잘 어울려요?", "메리 크리스마스! 길 밝혀 줄게요"] },
  },
  limtj: {
    winter: { hat: { kind: "beanie", c: 0x2e2c34, c2: 0xc8463c }, scarf: { c: 0xc8463c, pat: "rib", thick: true }, coat: { kind: "long", c: 0x4a3a32 }, mitt: 0x2e2c34, boot: { c: BLACK_BOOT } },
    christmas: { hat: { kind: "antler", c: 0x2e2c34 }, scarf: { c: GREEN, c2: RED, pat: "stripe", thick: true }, coat: { kind: "long", c: 0x4a3a32 }, mitt: RED, brooch: true, boot: { c: BLACK_BOOT } },
    say: { winter: ["까만 코트가 볕을 먹어요", "오늘은 목도리를 두 번 감았어요"], christmas: ["뿔 머리띠 좀 멋있죠?", "메리 크리스마스! 케이크 먹었어요?"] },
  },
  songjj: {
    // 호박 주민: 주황 조끼 + 호박 꼭지 같은 초록 털모자
    winter: { hat: { kind: "bobble", c: 0x5a9a4a, c2: 0xf6dca0 }, scarf: { c: 0xf6dca0, c2: 0xe08a3a, pat: "stripe", tail: true }, coat: { kind: "vest", c: 0xe08a3a }, boot: { c: BROWN } },
    christmas: { hat: { kind: "santa" }, scarf: { c: RED, c2: SNOW, pat: "dots", tail: true }, coat: { kind: "sweater", c: 0x2e7a4a, c2: RED }, boot: { c: BROWN, cuff: SNOW } },
    say: { winter: ["호박죽 먹으면 몸이 녹아요", "밭이 하얗게 덮였어요"], christmas: ["호박 파이 구웠어요", "메리 크리스마스! 통통 굴러가요"] },
  },
  baeksw: {
    winter: { hat: { kind: "beanie", c: 0xf0a0b8, c2: SNOW }, scarf: { c: 0x9fc5a8, c2: 0xf0a0b8, pat: "dots", tail: true }, coat: { kind: "duffle", c: 0xf0e6d0 }, mitt: 0xf0a0b8, boot: { c: 0x8a5a4a, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "holly" }, scarf: { c: GREEN, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "sweater", c: 0xc8343e, c2: GREEN }, mitt: GREEN, boot: { c: 0x8a5a4a, cuff: SNOW } },
    say: { winter: ["꽃들이 눈 이불 덮고 자요", "봄까지 꽃씨를 지켜요"], christmas: ["포인세티아 꽃 예쁘죠?", "메리 크리스마스! 꽃 한 송이 줄게요"] },
  },

  // ── 캠핑장 ──
  woodman: {
    // 장작 아재: 빨간 체크 목도리 + 벌목꾼 털모자
    winter: { hat: { kind: "trapper", c: 0xb83a32, c3: FUR_CUFF }, scarf: { c: 0xb83a32, c2: 0x2a2626, pat: "check" }, coat: { kind: "duffle", c: 0x6a4a34 }, mitt: 0x9a6a3a, boot: { c: BROWN, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, c2: SNOW, pat: "stripe" }, coat: { kind: "duffle", c: 0x8a2a2a }, mitt: 0x9a6a3a, brooch: true, boot: { c: BROWN, cuff: SNOW } },
    say: { winter: ["장작 많이 패 뒀어요", "도끼 손잡이가 꽁꽁 얼었어요"], christmas: ["트리용 나무 골라 왔어요", "메리 크리스마스! 불 쬐고 가요"] },
  },
  griller: {
    // 캠핑카 아빠: 요리사 모자는 그대로 (겨울), 크리스마스엔 산타 모자 + 호랑가시 앞치마
    winter: { scarf: { c: 0x3a5a8a, c2: CREAM, pat: "stripe" }, coat: { kind: "vest", c: 0x3a5a8a }, boot: { c: BLACK_BOOT } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, pat: "rib" }, coat: { kind: "vest", c: 0x3a5a8a }, apron: { c: SNOW, trim: RED, holly: true }, boot: { c: BLACK_BOOT } },
    say: { winter: ["고구마 구워요, 기다려요", "숯불 앞이 제일 따뜻해요"], christmas: ["칠면조 대신 꼬치 구워요", "메리 크리스마스! 한 입 줄까요?"] },
  },
  kid: {
    winter: { hat: { kind: "bobble", c: 0xf08a3a, c2: 0xf0d040 }, scarf: { c: 0xf0d040, c2: 0xf08a3a, pat: "stripe", tail: true }, coat: { kind: "puffer", c: 0xe0503c }, mitt: 0xf0d040, boot: { c: 0xe0503c, cuff: SNOW } },
    christmas: { hat: { kind: "elf" }, scarf: { c: RED, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "sweater", c: GREEN, c2: RED }, mitt: RED, boot: { c: 0xe0503c, cuff: SNOW } },
    say: { winter: ["눈싸움 할래요? 저 잘해요", "눈사람 코는 당근이에요"], christmas: ["산타 할아버지 오시겠죠?", "메리 크리스마스! 양말 걸었어요"] },
  },
  hiker: {
    winter: { hat: { kind: "trapper", c: 0xe0702a, c3: FUR_CUFF }, scarf: { c: 0x3a4a7a, pat: "rib" }, coat: { kind: "puffer", c: 0xe0702a }, mitt: 0x3a4a7a, boot: { c: 0x5a3a24, cuff: 0xc8a050 } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, c2: SNOW, pat: "stripe" }, coat: { kind: "puffer", c: 0xc0303c }, mitt: GREEN, boot: { c: 0x5a3a24, cuff: SNOW } },
    say: { winter: ["겨울 산은 아이젠 필수예요", "정상에 눈꽃이 피었어요"], christmas: ["산꼭대기 트리 보고 왔어요", "메리 크리스마스! 영차영차"] },
  },
  angler: {
    winter: { hat: { kind: "trapper", c: 0x7a5236, c3: 0xe8dcc4 }, scarf: { c: 0x8a8a94, pat: "rib", thick: true }, box: "snow", mitt: 0x7a5236, boot: { c: 0x3a5a3a } },
    christmas: { hat: { kind: "santa" }, scarf: { c: RED, c2: GREEN, pat: "check", thick: true }, box: "gift", mitt: GREEN, boot: { c: 0x3a5a3a } },
    say: { winter: ["얼음 구멍에 낚싯줄 내렸어요", "계곡물이 반쯤 얼었어요"], christmas: ["선물로 월척 하나 낚을 거예요", "메리 크리스마스! 허허"] },
  },
  stargirl: {
    winter: { hat: { kind: "earmuff", c: 0xf0d878, c2: 0x2e3a6a }, scarf: { c: 0xf0d040, c2: 0x2e3a6a, pat: "dots", tail: true }, coat: { kind: "duffle", c: 0x2e3a6a }, mitt: 0xf0d040, boot: { c: 0x2e3a6a, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "antler", c: 0xf0c040 }, scarf: { c: RED, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "sweater", c: 0x2e3a6a, c2: 0xf0c040 }, mitt: RED, boot: { c: 0x2e3a6a, cuff: SNOW } },
    say: { winter: ["겨울 별자리가 제일 또렷해요", "오리온자리 찾았어요?"], christmas: ["트리 꼭대기 별을 찾고 있어요", "메리 크리스마스! 별똥별 봤어요?"] },
  },

  // ── 바닷가 ──
  haenyeo: {
    // 해녀 할망: 물에 들어가니 외투 없이 테왁 색 털모자만
    winter: { hat: { kind: "beanie", c: 0xf0903c, c2: SNOW } },
    christmas: { hat: { kind: "santa" } },
    say: { winter: ["겨울 바다는 손이 찡해요", "물질 끝나면 불턱에서 몸 녹여요"], christmas: ["바닷속에도 크리스마스 왔어요", "메리 크리스마스! 소라 하나 줄게요"] },
  },
  clamgran: {
    // 조개 할매: 분홍 꽃무늬 패딩 + 고무 장화
    winter: { hat: { kind: "bobble", c: 0x9a6ab8, c2: 0xf0a0b8 }, scarf: { c: 0xf0a0b8, c2: SNOW, pat: "dots" }, coat: { kind: "puffer", c: 0xd86a8a }, mitt: 0x9a6ab8, boot: { c: 0x3a6a9a } },
    christmas: { hat: { kind: "santa" }, scarf: { c: GREEN, c2: SNOW, pat: "dots" }, coat: { kind: "puffer", c: 0xc0303c }, mitt: GREEN, boot: { c: 0x3a6a9a } },
    say: { winter: ["갯벌이 꽁꽁, 호미가 안 들어가요", "아이고 추워라, 손 좀 녹여요"], christmas: ["조개 목걸이 선물할 거예요", "메리 크리스마스! 우리 강아지"] },
  },
  icecream: {
    // 얼음 총각 (아이스크림 상인): 겨울엔 눈 덮인 상자, 크리스마스엔 리본 두른 선물 상자 + 요정 모자
    winter: { hat: { kind: "beanie", c: 0x8ec8e6, c2: SNOW }, scarf: { c: 0x8ec8e6, c2: SNOW, pat: "stripe", tail: true }, box: "snow", mitt: 0x8ec8e6, boot: { c: 0x4a6a8a } },
    christmas: { hat: { kind: "elf" }, scarf: { c: RED, c2: SNOW, pat: "stripe", tail: true }, box: "gift", mitt: RED, boot: { c: 0x4a6a8a } },
    say: { winter: ["겨울엔 군고구마도 팔아요", "아이스크림은 겨울에 먹어야 제맛이죠"], christmas: ["트리 모양 아이스크림 있어요", "메리 크리스마스! 하나 덤이에요"] },
  },
  lifeguard: {
    winter: { hat: { kind: "beanie", c: 0xd8463a, c2: SNOW }, scarf: { c: 0xf0c040, pat: "rib" }, coat: { kind: "puffer", c: 0xd8463a }, mitt: 0xf0c040, boot: { c: BLACK_BOOT } },
    christmas: { hat: { kind: "elf" }, scarf: { c: SNOW, c2: RED, pat: "stripe" }, coat: { kind: "puffer", c: 0xd8463a }, mitt: GREEN, brooch: true, boot: { c: BLACK_BOOT } },
    say: { winter: ["겨울 바다엔 들어가면 안 돼요", "호루라기도 얼었어요, 삐익"], christmas: ["오늘은 산타도 지켜 줄게요", "메리 크리스마스! 삐삐익!"] },
  },
  tourA: {
    winter: { hat: { kind: "earmuff", c: 0xf0b0c8, c2: 0xc3a6d9 }, scarf: { c: 0xc3a6d9, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "duffle", c: 0xb8a0d8 }, mitt: 0xf0b0c8, boot: { c: 0x6a5a7a, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "antler", c: RED }, nose: true, scarf: { c: GREEN, c2: SNOW, pat: "stripe", tail: true }, coat: { kind: "sweater", c: 0xc8343e, c2: GREEN }, mitt: GREEN, boot: { c: 0x6a5a7a, cuff: SNOW } },
    say: { winter: ["눈 오는 바다 사진 찍었어요", "입김까지 사진에 나왔어요"], christmas: ["루돌프 머리띠로 사진 찍어요", "메리 크리스마스! 김치!"] },
  },
  tourB: {
    winter: { hat: { kind: "bobble", c: 0x5aa87a, c2: SNOW }, scarf: { c: SNOW, c2: 0x5aa87a, pat: "stripe" }, coat: { kind: "puffer", c: 0x6ab89a }, mitt: 0x5aa87a, boot: { c: BROWN, cuff: FUR_CUFF } },
    christmas: { hat: { kind: "santa" }, scarf: { c: RED, pat: "rib" }, coat: { kind: "sweater", c: GREEN, c2: RED }, mitt: RED, boot: { c: BROWN, cuff: SNOW } },
    say: { winter: ["겨울 바다도 운치 있네요", "핫초코 파는 데 없을까요?"], christmas: ["산타 모자 샀어요, 어때요?", "메리 크리스마스! 여행 최고예요"] },
  },
  moonwalker: {
    // 달마중 (이불 유령): 달빛 판초 + 달빛 귀마개, 크리스마스엔 반투명 산타 모자
    winter: { hat: { kind: "earmuff", c: 0xf0d070, c2: 0x5a5a7a }, scarf: { c: 0xd8e4f4, c2: 0x3a4a7a, pat: "dots" }, coat: { kind: "poncho", c: 0x3a4a7a, c2: 0xc8d4ec } },
    christmas: { hat: { kind: "ghostSanta", c: 0xf08a9a }, scarf: { c: RED, c2: SNOW, pat: "stripe" }, coat: { kind: "poncho", c: 0x2e4a6a, c2: 0xe0303c } },
    say: { winter: ["겨울 달은 유난히 하얘요", "눈밭에 달빛이 반짝여요"], christmas: ["달님한테 소원 빌었어요", "메리 크리스마스! 조용한 밤이에요"] },
  },
};

const HEAD_IDS: ReadonlySet<string> = new Set<string>([...GEAR_HEAD, "hat_straw", "hat_cat", "hat_flower", "hat_halo"]);
const NECK_IDS: ReadonlySet<string> = new Set<string>([...GEAR_NECK, "neck_scarf"]);

/** 이 판의 옷 한 벌 (기본판·옷이 없는 주민이면 null) */
export function npcOutfit(id: string, concept: MapConcept): NpcWear | null {
  if (concept === "default") return null;
  return NPC_OUTFITS[id]?.[concept] ?? null;
}

/** 원래 착용 목록 → 이 판의 착용 목록 (모자·목도리는 계절 것으로 바꾸고, 손에 든 것은 그대로) */
export function conceptLook(id: string, look: readonly string[], concept: MapConcept): readonly string[] {
  const wear = npcOutfit(id, concept);
  if (!wear) return look;
  // 귀마개는 후광 위로 그대로 쓴다
  const keepHalo = wear.hat?.kind === "earmuff";
  const out = look.filter((x) => !(wear.hat && HEAD_IDS.has(x) && !(keepHalo && x === "hat_halo")) && !(wear.scarf && NECK_IDS.has(x)));
  out.push(registerNpcWear(`${id}.${concept === "winter" ? "w" : "x"}`, wear));
  return out;
}

/** 이 판에서 가끔 하는 계절 한마디 (기본판이면 빈 목록) */
export function conceptLines(id: string, concept: MapConcept): readonly string[] {
  if (concept === "default") return [];
  return NPC_OUTFITS[id]?.say[concept] ?? [];
}

/** 계절 한마디를 할 확률 */
export const CONCEPT_LINE_CHANCE = 0.35;

/** 말 걸 때 계절 한마디 하나 (안 하면 null — 원래 대사에서 고른다). 바로 전 줄은 피한다 */
export function pickConceptLine(id: string, concept: MapConcept, r: () => number, last: string | null = null): string | null {
  const pool = conceptLines(id, concept).filter((t) => t !== last);
  if (!pool.length || r() >= CONCEPT_LINE_CHANCE) return null;
  return pool[Math.min(pool.length - 1, Math.floor(r() * pool.length))];
}
