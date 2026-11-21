/** Shared by the shop UI and server purchase validation. Rank zero is player level one. */
export const playerLevel = (rank: number): number => Math.max(1, rank + 1);
export const isEquipment = (id: number): boolean => {
  const group = Math.trunc(id / 100000);
  return (group >= 1 && group <= 14) || group === 27;
};
export type WeaponType = "rifle" | "smg" | "sniper" | "shotgun" | "machinegun" | "sidearm" | "melee" | "tactical";
export function weaponType(id: number): WeaponType | null {
  const group = Math.trunc(id / 100000), kind = Math.trunc(id % 100000 / 1000);
  if (group === 1) {
    if (kind === 4 || kind === 18) return "smg";
    if (kind === 5) return "sniper";
    if (kind === 6 || kind === 35) return "shotgun";
    if (kind === 8 || kind === 10) return "machinegun";
    return "rifle";
  }
  if (group === 2) return "sidearm";
  if (group === 3) return "melee";
  if (group === 4 || group === 5) return "tactical";
  return null;
}
export const WEAPON_TYPES: readonly { key: WeaponType; label: string; level: number }[] = [
  { key: "rifle", label: "Rifle", level: 5 },
  { key: "smg", label: "SMG", level: 3 },
  { key: "sniper", label: "Sniper", level: 10 },
  { key: "shotgun", label: "Shotgun", level: 8 },
  { key: "machinegun", label: "Machine gun", level: 12 },
  { key: "sidearm", label: "Sidearm", level: 1 },
  { key: "melee", label: "Melee", level: 1 },
  { key: "tactical", label: "Tactical", level: 1 },
];
export const requiredLevel = (id: number): number => WEAPON_TYPES.find((t) => t.key === weaponType(id))?.level ?? 1;
