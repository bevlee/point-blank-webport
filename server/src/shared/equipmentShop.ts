import { isEquipment, playerLevel, requiredLevel } from '../../../src/lobby/equipment/rules.ts';
import { ItemEquipType } from './items.ts';
import type { GoodsItem } from './shop.ts';

/** One permanent Credit offer per item; use its highest gold tier, or cash tier when no gold price existed. */
export function permanentEquipmentGoods(goods: GoodsItem[]): GoodsItem[] {
  const equipment = new Map<number, GoodsItem>();
  for (const g of goods) {
    if (!isEquipment(g.item.id) || g.visibility === 4) continue;
    const existing = equipment.get(g.item.id);
    if (g.priceGold <= 1 && g.priceCash <= 1) continue;
    if (!existing || (g.priceGold > 1 && existing.priceGold <= 1) || (g.priceGold > 1 && g.priceGold > existing.priceGold) || (g.priceGold <= 1 && existing.priceGold <= 1 && g.priceCash > existing.priceCash)) equipment.set(g.item.id, g);
  }
  const selected = new Set(equipment.values());
  return goods.filter(g => !isEquipment(g.item.id) || selected.has(g)).map(g => {
    if (!isEquipment(g.item.id)) return g;
    g.priceGold = g.priceGold > 1 ? g.priceGold : g.priceCash;
    g.priceCash = 0; g.starGold = 0; g.starCash = 0; g.authType = ItemEquipType.Permanent;
    g.buyType2 = 1; g.buyType3 = 1;
    g.item.equip = ItemEquipType.Permanent; g.item.count = 1;
    g.item.name = g.item.name.replace(/ \([^)]*(?:hours|qty)\)$/, '');
    return g;
  });
}

export function equipmentPurchaseAllowed(rank: number, goods: readonly GoodsItem[], owned: readonly { id: number; equip: number }[]): boolean {
  const equipment = goods.filter(g => isEquipment(g.item.id));
  return new Set(equipment.map(g => g.item.id)).size === equipment.length && equipment.every(g =>
    g.item.equip === ItemEquipType.Permanent && g.priceCash === 0 && playerLevel(rank) >= requiredLevel(g.item.id) && !owned.some(it => it.id === g.item.id && it.equip === ItemEquipType.Permanent));
}
