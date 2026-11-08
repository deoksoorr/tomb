import { DEFAULT_MAX_CHANNELS } from "@tomb/protocol";

/** 묘비를 세울 수 있는 채널 1..GRAVE_CHANNELS (채널마다 묘지가 따로다) */
export const GRAVE_CHANNELS = DEFAULT_MAX_CHANNELS;
export const isGraveChannel = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= GRAVE_CHANNELS;
