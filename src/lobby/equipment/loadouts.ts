export const KIT_SLOTS = ['primary', 'secondary', 'melee', 'grenade', 'special'] as const;
export type KitSlot = typeof KIT_SLOTS[number];
export type EquipmentKit = Record<KitSlot, number>;
export interface SavedLoadout { name: string; kit: EquipmentKit }
export interface SavedLoadouts { active: number; presets: [SavedLoadout, SavedLoadout, SavedLoadout] }

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function parseSavedLoadouts(value: unknown): SavedLoadouts {
  if (!record(value) || !Number.isInteger(value.active) || typeof value.active !== 'number' || value.active < 0 || value.active > 2 || !Array.isArray(value.presets) || value.presets.length !== 3) throw new Error('Invalid saved loadouts');
  const preset = (raw: unknown): SavedLoadout => {
    if (!record(raw) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.trim().length > 24 || !record(raw.kit)) throw new Error('Invalid loadout name or equipment');
    const id = (slot: KitSlot, index: number): number => {
      const n = raw.kit && record(raw.kit) ? raw.kit[slot] : undefined;
      if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || (n !== 0 && Math.trunc(n / 100000) !== index + 1)) throw new Error(`Invalid ${slot} equipment`);
      return n;
    };
    return { name: raw.name.trim(), kit: { primary: id('primary', 0), secondary: id('secondary', 1), melee: id('melee', 2), grenade: id('grenade', 3), special: id('special', 4) } };
  };
  return { active: value.active, presets: [preset(value.presets[0]), preset(value.presets[1]), preset(value.presets[2])] };
}
export function initialLoadouts(kit: EquipmentKit): SavedLoadouts {
  return { active: 0, presets: [{ name: 'Assault', kit: { ...kit } }, { name: 'Marksman', kit: { ...kit } }, { name: 'Close quarters', kit: { ...kit } }] };
}
export function availableKit(kit: EquipmentKit, owned: ReadonlySet<number>, fallback: EquipmentKit): EquipmentKit {
  const choose = (slot: KitSlot): number => kit[slot] === 0 || owned.has(kit[slot]) ? kit[slot] : fallback[slot];
  return { primary: choose('primary'), secondary: choose('secondary'), melee: choose('melee'), grenade: choose('grenade'), special: choose('special') };
}
