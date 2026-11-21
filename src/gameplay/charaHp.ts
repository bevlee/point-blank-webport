import { PB_CHARA } from "./pbConfig.ts";

/** All characters use the same health pool. */
export function charaMaxHp(_charaId?: number): number {
  return PB_CHARA.hp;
}
