import './kitView.css';
import { paintIcon } from '../screens/icons.ts';
import { itemName } from '../state/itemNames.ts';
import { KIT_SLOTS, type EquipmentKit, type SavedLoadouts } from './loadouts.ts';

export function node<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.className = cls; el.textContent = text; return el;
}
export function control(text: string, fn: () => void, cls = 'kit-button'): HTMLButtonElement {
  const b = node('button', cls, text); b.type = 'button'; b.onclick = fn; return b;
}
export function kitTabs(data: SavedLoadouts, selected: number, pick: (index: number) => void): HTMLElement {
  const tabs = node('nav', 'kit-tabs'); tabs.setAttribute('aria-label', 'Loadout selection');
  data.presets.forEach((p, index) => { const b = control(p.name, () => pick(index), 'kit-tab'); b.setAttribute('aria-pressed', String(index === selected)); tabs.append(b); });
  return tabs;
}
export function kitCards(kit: EquipmentKit): HTMLElement {
  const root = node('div', 'kit-cards'), tactical = node('div', 'kit-tactical'); tactical.append(node('small', '', 'Tactical'));
  const pair = node('div', 'kit-tactical-pair');
  const labels = { primary: 'Primary', secondary: 'Secondary', melee: 'Melee', grenade: 'Grenade', special: 'Flash / Smoke' };
  for (const slot of KIT_SLOTS) {
    const id = kit[slot], card = node('div', 'kit-card');
    card.dataset.slot = slot;
    const title = node('div'); title.append(node('small', '', labels[slot]), node('b', '', id ? itemName(id).name : 'Empty'));
    card.append(title);
    if (id) { const box = node('div', 'kit-art'); box.dataset.item = String(id); box.setAttribute('role', 'img'); box.setAttribute('aria-label', itemName(id).name); box.append(node('div', 'kit-sprite')); card.append(box); }
    if (slot === 'grenade' || slot === 'special') pair.append(card); else root.append(card);
  }
  tactical.append(pair); root.append(tactical); return root;
}
export function paintKit(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.kit-art').forEach(box => { const sprite = box.firstElementChild; if (sprite instanceof HTMLElement) paintIcon(sprite, Number(box.dataset.item), box.clientWidth, box.clientHeight); });
}
