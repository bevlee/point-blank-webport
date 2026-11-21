import { lockPointer } from '../lockPointer.ts';
import { Stage } from '../lobby/ui/LayoutRenderer.ts';
import { UI_BASE } from '../lobby/ui/assets.ts';
import { I3Gui, cloneNode, findNode, type GNode } from '../lobby/ui/i3Gui.ts';
import { loadCrossIcons } from '../lobby/screens/icons.ts';
import { loadStrings, tOr } from '../lobby/ui/i18n.ts';
import { itemName, loadItemNames } from '../lobby/state/itemNames.ts';
import { initialLoadouts, type SavedLoadouts } from '../lobby/equipment/loadouts.ts';
import { control, kitCards, kitTabs, node, paintKit } from '../lobby/equipment/kitView.ts';
import { BAREFIST_ID, CHANGE_WEAPON_KEY, KNUCKLE_STAGE, RESPAWN_SLOTS, RespawnSelection, catalogFromWeapons, type RespawnInventory, type WeaponCatalog, type RespawnSlot } from './respawnSelect.ts';
import { testInventory } from './testLoadout.ts';
import { jsonOnce } from '../jsonOnce.ts';

interface WeaponsJson { defaultLoadout: { primary: number; secondary: number; melee: number; grenade: number }; weapons: { id: number; slot: number; className: string; name: string }[] }
export interface RespawnHudState { dead: boolean; respawnLeft: number; respawnTotal: number; invincibleSec: number; canOpen: boolean }
const CROSS = `${UI_BASE}/cross`;

export class RespawnMenu {
  readonly sel: RespawnSelection;
  readonly catalog: WeaponCatalog;
  private stage: Stage;
  private gui: I3Gui;
  private abort = new AbortController();
  private canOpen = false;
  private overlay = node('div', 'pb-kit-view pb-match-loadout');
  private dialog = node('section', 'kit-dialog compact');
  private preset: number;
  private changedSlot: RespawnSlot | null = null;
  private signature = '';

  private constructor(host: HTMLElement, sel: RespawnSelection, catalog: WeaponCatalog, tree: GNode, private saved: SavedLoadouts) {
    this.sel = sel; this.catalog = catalog; this.preset = saved.active;
    this.stage = new Stage(host); this.stage.el.style.cssText = 'background:transparent;pointer-events:none;z-index:30';
    this.gui = new I3Gui({ base: CROSS }); this.gui.build(tree, this.stage.design, 0, 0);
    for (const name of ['Respawn_Text','Respawn_Seconds','Respawn_Wep_SelectBG','Respawn_Wait']) this.gui.hide(name);
    this.overlay.hidden = true; this.dialog.setAttribute('role', 'dialog'); this.dialog.setAttribute('aria-modal', 'true'); this.dialog.setAttribute('aria-label', 'Change loadout'); this.overlay.append(this.dialog); document.body.append(this.overlay);
    const signal = this.abort.signal;
    window.addEventListener('keydown', e => {
      if ((e.target instanceof HTMLElement && e.target.closest('input,textarea,select')) || e.repeat) return;
      if (e.code === CHANGE_WEAPON_KEY.code) {
        if (this.sel.isOpen) this.close(false); else if (this.canOpen) this.open();
        e.preventDefault(); e.stopPropagation(); return;
      }
      if (this.sel.isOpen && e.code === 'Enter' && e.target instanceof HTMLElement && e.target.closest('button')) return;
      if (this.sel.isOpen && this.sel.key(e.code)) {
        e.preventDefault(); e.stopPropagation(); if (!this.sel.isOpen) this.afterClose(); else this.renderPanel();
      }
    }, { signal, capture: true });
    document.addEventListener('pointerlockchange', () => { if (this.sel.isOpen) document.getElementById('blocker')?.classList.add('hidden'); }, { signal });
  }

  static async create(host: HTMLElement, opts: { inventory?: RespawnInventory; equippedOnly?: boolean; weaponsFlag?: number; stage?: number; savedLoadouts?: SavedLoadouts } = {}): Promise<RespawnMenu> {
    const [pack, weapons] = await Promise.all([
      jsonOnce<{ root: GNode }>(`${CROSS}/UI_Project_HUD.json`),
      jsonOnce<WeaponsJson>(`${UI_BASE.replace(/\/ui$/, '')}/cross/weapons/weapons.json`),
      loadCrossIcons(), loadStrings(), loadItemNames(),
    ]);
    const root = findNode(pack.root, 'Respawn_BG'); if (!root) throw new Error('Respawn HUD is unavailable');
    const inv = opts.inventory ?? (opts.equippedOnly ? { items: [], equipped: { ...weapons.defaultLoadout, special: 0 } } : testInventory());
    const catalog = catalogFromWeapons(weapons.weapons), selection = new RespawnSelection(catalog, inv, opts.weaponsFlag, opts.stage === KNUCKLE_STAGE ? BAREFIST_ID : null);
    return new RespawnMenu(host, selection, catalog, cloneNode(root), opts.savedLoadouts ?? initialLoadouts(inv.equipped));
  }
  get isOpen(): boolean { return this.sel.isOpen; }
  open(): void { this.sel.open(); this.preset = this.saved.presets.findIndex(p => RESPAWN_SLOTS.every(slot => p.kit[slot] === this.sel.current()[slot])); this.overlay.hidden = false; this.changedSlot = null; this.renderPanel(); this.dialog.querySelector<HTMLButtonElement>('.kit-tab[aria-pressed=true]')?.focus(); this.gui.hide('Respawn_Wait'); if (document.pointerLockElement) document.exitPointerLock(); }
  close(confirm: boolean): void { this.sel.close(confirm); this.afterClose(); }
  private afterClose(): void {
    this.overlay.hidden = true;
    if (document.pointerLockElement !== document.body) { try { void lockPointer().catch(() => { document.getElementById('blocker')?.classList.remove('hidden'); }); } catch { document.getElementById('blocker')?.classList.remove('hidden'); } }
  }
  update(s: RespawnHudState): void {
    this.canOpen = s.canOpen; if (!s.canOpen && this.sel.isOpen) this.close(false);
    if (!this.sel.isOpen && !this.overlay.hidden) this.afterClose();
    this.gui.show('Respawn_Wait', s.dead && !this.sel.isOpen);
    if (s.dead) {
      const notice = tOr('STR_TBL_BATTLEGUI_NOTICE_RESPAWN', '').replace(/\{col:[^}]*\}|\{\/col\}/g, '').replace('%d', String(Math.round(s.invincibleSec))).replace('%s', CHANGE_WEAPON_KEY.name);
      this.gui.setText('Respawn_Notice', notice);
      const frac = s.respawnTotal > 0 ? Math.min(1, Math.max(0, 1 - s.respawnLeft / s.respawnTotal)) : 1, bar = this.gui.get('Respawn_Time_Bar');
      if (bar) bar.el.style.clipPath = `inset(0 ${((1 - frac) * 100).toFixed(2)}% 0 0)`;
    }
    if (this.sel.isOpen) { const signature = JSON.stringify([this.sel.current(), this.sel.weaponsFlag, this.sel.focus]); if (signature !== this.signature) this.renderPanel(); }
  }
  private renderPanel(): void {
    this.signature = JSON.stringify([this.sel.current(), this.sel.weaponsFlag, this.sel.focus]);
    const header = node('div', 'kit-dialog-header'); header.append(node('b', '', 'BLACKOUT'), node('span', '', 'Applies on next respawn'));
    const title = node('div', 'kit-dialog-title', 'Choose your loadout');
    const tabs = kitTabs(this.saved, this.preset, index => { this.preset = index; this.sel.selectKit(this.saved.presets[index].kit); this.changedSlot = null; this.renderPanel(); });
    const cards = kitCards(this.sel.current());
    cards.querySelectorAll<HTMLElement>('[data-slot]').forEach(card => {
      const slot = RESPAWN_SLOTS.find(s => s === card.dataset.slot); if (!slot) return;
      const view = this.sel.view(RESPAWN_SLOTS.indexOf(slot)); card.setAttribute('role', 'button'); card.setAttribute('aria-label', `Change ${slot}`); card.setAttribute('aria-disabled', String(!view.enabled)); card.tabIndex = view.enabled ? 0 : -1;
      const choose = (): void => { if (!view.enabled) return; this.changedSlot = slot; this.renderPanel(); };
      card.onclick = choose; card.onkeydown = e => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); choose(); } };
    });
    this.dialog.replaceChildren(header, title, tabs, cards);
    if (this.changedSlot) {
      const slot = this.changedSlot, label = node('label', 'kit-item-picker', `Change ${slot}`), select = node('select'); select.setAttribute('aria-label', `Choose ${slot}`);
      for (const id of this.sel.view(RESPAWN_SLOTS.indexOf(slot)).list) { const option = node('option', '', id ? itemName(id).name : 'Empty'); option.value = String(id); option.selected = this.sel.current()[slot] === id; select.append(option); }
      select.onchange = () => { this.sel.selectItem(slot, Number(select.value)); this.preset = -1; this.renderPanel(); }; label.append(select); this.dialog.append(label);
    }
    if (this.sel.limited()) this.dialog.append(node('div', 'kit-error', 'Room weapon restrictions apply.'));
    const footer = node('div', 'kit-dialog-footer'); footer.append(control('Cancel', () => this.close(false)), control('Confirm loadout', () => this.close(true), 'kit-confirm')); this.dialog.append(footer); paintKit(this.dialog);
  }
  dispose(): void { this.abort.abort(); this.overlay.remove(); this.stage.destroy(); }
}
