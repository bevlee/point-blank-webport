import './equipment.css';
import { KIT_SLOTS, parseSavedLoadouts, type KitSlot } from '../../equipment/loadouts.ts';
import { MAIN_BUTTONS } from '../../core/model.ts';
import { isEquipment, playerLevel, requiredLevel, weaponType, WEAPON_TYPES, type WeaponType } from '../../equipment/rules.ts';
import { fmtInt, inventoryData, isUnequippableSlot } from '../../screens/model.ts';
import { loadIconIndex, paintIcon } from '../../screens/icons.ts';
import { equipSlotOf, tabOf, type ItemTab } from '../../state/itemInfo.ts';
import { itemName } from '../../state/itemNames.ts';
import { isItemShown } from '../../state/weaponSupport.ts';
import { EquipSlot, ItemEquipType, type InventoryItem } from '../../types.ts';
import type { ShopOffer, ShopOption } from '../../state/ShopStore.ts';
import { weaponStats, type PageCtx } from './common.ts';
import { useCosmeticItem } from './inven.ts';

type Entry = { kind: 'owned'; item: InventoryItem } | { kind: 'offer'; offer: ShopOffer; option: ShopOption };
const idOf = (e: Entry): number => e.kind === 'owned' ? e.item.itemId : e.offer.itemId;
const keyOf = (e: Entry): number => e.kind === 'owned' ? e.item.objectId : e.offer.itemId;
const labelOf = (id: number): string => WEAPON_TYPES.find(t => t.key === weaponType(id))?.label ?? (tabOf(id) === 'chara' ? 'Character equipment' : 'Item');
function element<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.className = cls; el.textContent = text; return el;
}
function button(text: string, action: () => void, cls = 'eq-btn'): HTMLButtonElement {
  const el = element('button', cls, text); el.type = 'button'; el.onclick = action; return el;
}
function artwork(id: number, height: number, width: number): HTMLElement {
  const box = element('div', 'eq-art'), sprite = element('div', 'eq-sprite');
  box.dataset.itemId = String(id); box.setAttribute('role', 'img'); box.setAttribute('aria-label', itemName(id).name);
  box.append(sprite); paintIcon(sprite, id, width, height); return box;
}

export class EquipmentPage {
  private root = element('section', 'pb-equipment');
  private body = element('div', 'eq-body');
  private wallet = element('div', 'eq-wallet');
  private identity = element('div', 'eq-player');
  private nav: HTMLButtonElement[];
  private presetBar = element('div', 'eq-presets');
  private editing = 0;
  private slot: KitSlot = 'primary';
  private tab: ItemTab = 'weapon';
  private filter: WeaponType | 'all' = 'all';
  private search = '';
  private previousPage = '';
  private signature = '';
  private iconsReady = false;
  private entries: Entry[] = [];
  private redraw = (): void => this.ctx.ctl.draw();

  constructor(private ctx: PageCtx) {
    const c = ctx.ctl, header = element('header', 'eq-header');
    this.root.setAttribute('aria-label', 'Equipment menu'); this.root.hidden = true;
    header.append(element('div', 'eq-brand', 'BLACKOUT'));
    const nav = element('nav', 'eq-nav'); nav.setAttribute('aria-label', 'Equipment navigation');
    this.nav = [button('Loadouts', () => { this.tab = 'weapon'; c.click('main', MAIN_BUTTONS.inventory); }), button('Shop', () => c.click('main', MAIN_BUTTONS.shop)), button('Characters', () => { this.tab = 'chara'; c.click('main', MAIN_BUTTONS.inventory); })];
    nav.append(...this.nav); header.append(nav, this.wallet, this.identity, button('Back', () => c.click('main', MAIN_BUTTONS.back)));
    this.root.append(header, this.presetBar, this.body); ctx.layer.append(this.root);
    void loadIconIndex().then(() => { this.iconsReady = true; this.redraw(); });
  }

  paint(): void {
    const c = this.ctx.ctl, p = c.player, mode = c.page;
    const visible = (mode === 'inventory' || mode === 'shop') && !!p;
    this.root.hidden = !visible;
    this.root.inert = !!(c.msg || c.menu.busy || c.loading || c.buy || c.missionDone || c.loadouts?.busy);
    if (!visible || !p) { this.previousPage = ''; return; }
    if (this.previousPage !== mode) { this.signature = ''; this.previousPage = mode; c.menu.selected = null; }
    const loadoutView = mode === 'inventory' && this.tab === 'weapon';
    this.root.className = `pb-equipment ${mode}${loadoutView ? ' loadout-editor' : ''}`;
    this.presetBar.hidden = !loadoutView;
    this.nav.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 1 ? mode === 'shop' : mode === 'inventory' && (i === 0 ? this.tab === 'weapon' : this.tab !== 'weapon'))));
    const profile = p.state.profile, level = playerLevel(profile?.rankHigh ?? 0), credits = p.state.wallet?.gold ?? profile?.gold ?? 0;
    this.wallet.replaceChildren(element('small', '', 'CREDITS'), document.createTextNode(fmtInt(credits)));
    this.identity.replaceChildren(document.createTextNode(profile?.nickname ?? ''), element('small', '', `Level ${level}`));
    const q = this.search.trim().toLowerCase();
    const all: Entry[] = mode === 'inventory'
      ? p.items().map(item => ({ kind: 'owned', item }))
      : (c.session?.shop.offers ?? []).flatMap(offer => {
        const option = offer.options.find(o => o.priceGold > 1);
        return option && isEquipment(offer.itemId) && isItemShown(offer.itemId) ? [{ kind: 'offer', offer, option }] : [];
      });
    this.entries = all.filter(e => (!loadoutView || Math.trunc(idOf(e) / 100000) === KIT_SLOTS.indexOf(this.slot) + 1) && tabOf(idOf(e)) === this.tab && (this.filter === 'all' || weaponType(idOf(e)) === this.filter) && (!q || itemName(idOf(e)).name.toLowerCase().includes(q)));
    const first = this.entries[0];
    if (!this.entries.some(e => keyOf(e) === c.menu.selected)) c.menu.selected = first ? keyOf(first) : null;
    c.menu.tab = this.tab;
    const selected = this.entries.find(e => keyOf(e) === c.menu.selected);
    const stats = selected && this.tab === 'weapon' ? weaponStats(idOf(selected), this.redraw) : null;
    const signature = JSON.stringify([c.loadouts?.data, c.loadouts?.status, c.loadouts?.busy, c.loadouts?.error, this.editing, this.slot, this.iconsReady, mode, this.tab, this.filter, this.search, level, credits, c.menu.selected, c.menu.busy, c.buy?.busy, c.session?.shop.status, c.session?.shop.error, this.entries.map(e => [keyOf(e), idOf(e), e.kind === 'offer' ? e.option.priceGold : p.isEquipped(e.item)]), p.equipPairs(), stats]);
    if (signature === this.signature) return;
    this.signature = signature;
    const oldScroll = this.body.querySelector('.eq-list')?.scrollTop ?? 0;
    const detailScroll = this.body.querySelector('.eq-detail')?.scrollTop ?? 0;
    const input = this.body.querySelector('input');
    const focused = document.activeElement === input, caret = input?.selectionStart ?? 0;
    const active = document.activeElement;
    const activeButton = active instanceof HTMLButtonElement && this.body.contains(active) ? active : null;
    const activeKey = activeButton?.dataset.equipmentKey;
    const actionFocused = activeButton?.classList.contains('eq-action');
    const activeFilter = activeButton?.classList.contains('eq-btn') ? activeButton.textContent : null;
    const catalogue = this.catalogue(mode), detail = this.detail(selected, level, credits, stats);
    if (loadoutView) {
      this.paintPresets();
      catalogue.classList.add('eq-picker');
      detail.classList.remove('eq-panel');
      detail.querySelector('.eq-art')?.remove(); detail.querySelector('.eq-kind')?.remove(); detail.querySelector('.eq-permanent')?.remove();
      const action = detail.querySelector('.eq-action'); if (action) detail.append(action);
      catalogue.append(detail);
      this.body.replaceChildren(this.loadoutSlots(), catalogue);
    } else this.body.replaceChildren(...(mode === 'inventory' ? [this.loadout(), catalogue, detail] : [catalogue, detail]));
    this.body.querySelectorAll<HTMLElement>('.eq-art').forEach(box => { const sprite = box.firstElementChild; if (sprite instanceof HTMLElement) paintIcon(sprite, Number(box.dataset.itemId), box.clientWidth, box.clientHeight); });
    const list = this.body.querySelector('.eq-list'); if (list) list.scrollTop = oldScroll;
    const detailEl = this.body.querySelector('.eq-detail'); if (detailEl) detailEl.scrollTop = detailScroll;
    if (activeKey) this.body.querySelector<HTMLButtonElement>(`[data-equipment-key="${activeKey}"]`)?.focus();
    else if (actionFocused) this.body.querySelector<HTMLButtonElement>('.eq-action:not(:disabled)')?.focus();
    else if (activeFilter) Array.from(this.body.querySelectorAll<HTMLButtonElement>('.eq-btn')).find(b => b.textContent === activeFilter)?.focus();
    if (focused) { const next = this.body.querySelector('input'); next?.focus(); next?.setSelectionRange(caret, caret); }
  }

  private catalogue(mode: 'inventory' | 'shop'): HTMLElement {
    const panel = element('section', 'eq-panel eq-catalogue'), tools = element('div', 'eq-tools'), tabs = element('div', 'eq-tabs');
    panel.setAttribute('aria-label', mode === 'shop' ? 'Available equipment' : 'Owned equipment');
    const setFilter = (filter: WeaponType | 'all'): void => { this.filter = filter; this.ctx.ctl.menu.selected = null; this.redraw(); };
    for (const [tab, label] of (mode === 'inventory' && this.tab === 'weapon' ? [] : [['weapon', 'Weapons'], ['chara', 'Characters'], ['item', 'Items']]) satisfies [ItemTab, string][]) {
      if (mode === 'shop' && tab === 'item') continue;
      const b = button(label, () => { this.tab = tab; this.filter = 'all'; this.ctx.ctl.menu.selected = null; this.redraw(); });
      b.setAttribute('aria-pressed', String(this.tab === tab)); tabs.append(b);
    }
    tools.append(tabs);
    if (this.tab === 'weapon') {
      const all = button('All', () => setFilter('all')); all.setAttribute('aria-pressed', String(this.filter === 'all')); tools.append(all);
      for (const t of WEAPON_TYPES.filter(t => mode === 'shop' || this.slot === 'primary' && ['rifle','smg','sniper','shotgun','machinegun'].includes(t.key))) { const b = button(t.label, () => setFilter(t.key)); b.setAttribute('aria-pressed', String(this.filter === t.key)); tools.append(b); }
    }
    const search = element('input', 'eq-search'); search.type = 'search'; search.placeholder = 'Search equipment'; search.setAttribute('aria-label', 'Search equipment'); search.value = this.search;
    search.oninput = () => { this.search = search.value; this.ctx.ctl.menu.selected = null; this.redraw(); }; tools.append(search);
    const list = element('div', `eq-list${mode === 'inventory' && this.tab !== 'weapon' ? ' eq-grid' : ''}`);
    for (const entry of this.entries) {
      const id = idOf(entry), row = button('', () => { this.ctx.ctl.menu.selected = keyOf(entry); this.redraw(); }, 'eq-row');
      row.dataset.equipmentKey = String(keyOf(entry));
      row.setAttribute('aria-pressed', String(this.ctx.ctl.menu.selected === keyOf(entry)));
      row.append(artwork(id, mode === 'inventory' ? 50 : 44, mode === 'inventory' ? 160 : 112));
      const info = element('span'); info.append(element('b', '', itemName(id).name), element('small', '', `${labelOf(id)}${mode === 'shop' ? ` · Level ${requiredLevel(id)}` : ''}`)); row.append(info);
      if (entry.kind === 'offer') {
        const owned = this.ctx.ctl.player?.items().some(it => it.itemId === id && it.equip === ItemEquipType.Permanent);
        row.append(element('span', owned ? 'eq-badge' : 'eq-price', owned ? 'Owned' : `${fmtInt(entry.option.priceGold)} Credits`));
      } else if (this.tab === 'weapon' ? this.ctx.ctl.loadouts?.kit(this.editing)[this.slot] === id : this.ctx.ctl.player?.isEquipped(entry.item)) row.append(element('span', 'eq-badge', this.tab === 'weapon' ? 'Assigned' : 'Equipped'));
      list.append(row);
    }
    if (!this.entries.length) {
      const shop = this.ctx.ctl.session?.shop;
      const text = mode === 'shop' && shop?.status === 'loading' ? 'Loading equipment…' : mode === 'shop' && shop?.status === 'error' ? 'Could not load equipment. Try again.' : 'No equipment matches these filters.';
      list.append(element('div', 'eq-empty', text));
      if (mode === 'shop' && shop?.status === 'error') list.append(button('Retry', () => { void this.ctx.ctl.session?.loadShop().catch(e => this.ctx.ctl.say(String(e), true)); }));
    }
    panel.append(tools, list, element('div', 'eq-footnote', `${this.entries.length} ${mode === 'inventory' ? 'owned' : 'available'} items`)); return panel;
  }

  private async savePreset(next: ReturnType<typeof parseSavedLoadouts>, apply: boolean): Promise<void> {
    const c = this.ctx.ctl, store = c.loadouts;
    if (!store) return;
    c.menu.busy = true; c.draw();
    try { await store.save(next); if (apply && c.session) await store.apply(c.session); }
    catch (e) { c.say(e instanceof Error ? e.message : String(e), true); }
    finally { c.menu.busy = false; }
    c.draw();
  }

  private paintPresets(): void {
    const c = this.ctx.ctl, store = c.loadouts;
    this.presetBar.replaceChildren();
    if (!store || store.status === 'loading') { this.presetBar.append(element('div', 'eq-footnote', 'Loading loadouts…')); return; }
    if (store.status === 'error') { this.presetBar.append(button('Retry loading loadouts', () => { void store.load(); })); return; }
    const tabs = element('nav', 'eq-preset-tabs'); tabs.setAttribute('aria-label', 'Saved loadouts');
    store.data.presets.forEach((p, i) => {
      const b = button(p.name + (store.data.active === i ? ' · Active' : ''), () => { this.editing = i; this.search = ''; this.filter = 'all'; c.menu.selected = null; this.redraw(); }, 'eq-preset-tab');
      b.setAttribute('aria-pressed', String(this.editing === i)); tabs.append(b);
    });
    const row = element('div', 'eq-preset-title');
    row.append(element('b', '', store.data.presets[this.editing].name));
    row.append(button('Rename', () => {
      const form = element('form', 'eq-rename'), input = element('input'); input.value = store.data.presets[this.editing].name; input.maxLength = 24; input.required = true; input.setAttribute('aria-label', 'Loadout name');
      const save = element('button', 'eq-btn', 'Save'); save.type = 'submit'; form.append(input, save, button('Cancel', () => this.paintPresets()));
      form.onsubmit = e => { e.preventDefault(); if (!input.value.trim()) return; void this.savePreset(parseSavedLoadouts({ ...store.data, presets: store.data.presets.map((p, i) => i === this.editing ? { ...p, name: input.value.trim() } : p) }), false); };
      row.replaceChildren(form); input.focus(); input.select();
    }, 'eq-rename-button'));
    if (this.editing !== store.data.active) row.append(button('Use loadout', () => { void this.savePreset({ ...store.data, active: this.editing }, true); }, 'eq-use-loadout'));
    this.presetBar.append(tabs, row);
  }

  private loadoutSlots(): HTMLElement {
    const c = this.ctx.ctl, store = c.loadouts, panel = element('section', 'eq-slots');
    panel.setAttribute('aria-label', 'Loadout slots');
    const kit = store?.kit(this.editing) ?? c.player?.weaponLoadout();
    if (!kit) return panel;
    const labels: Record<KitSlot, string> = { primary: 'Primary', secondary: 'Secondary', melee: 'Melee', grenade: 'Grenade', special: 'Flash / Smoke' };
    const mount = (slot: KitSlot): HTMLButtonElement => {
      const id = kit[slot], b = button('', () => { this.slot = slot; this.filter = 'all'; this.search = ''; const own = c.player?.items().find(i => i.itemId === id); c.menu.selected = own?.objectId ?? null; this.redraw(); }, 'eq-slot');
      b.setAttribute('aria-pressed', String(slot === this.slot)); b.setAttribute('aria-label', labels[slot]);
      const info = element('span'); info.append(element('small', '', labels[slot]), element('b', '', id ? itemName(id).name : 'Empty')); b.append(info); if (id) b.append(artwork(id, 50, 180)); return b;
    };
    panel.append(mount('primary'), mount('secondary'), mount('melee'));
    const tactical = element('div', 'eq-tactical'), pair = element('div', 'eq-tactical-pair'); pair.append(mount('grenade'), mount('special')); tactical.append(element('small', '', 'Tactical'), pair); panel.append(tactical);
    panel.append(element('div', 'eq-save-status', store?.busy ? 'Saving…' : store?.error || '✓ All changes saved'));
    return panel;
  }

  private loadout(): HTMLElement {
    const p = this.ctx.ctl.player, panel = element('aside', 'eq-panel'); panel.append(element('div', 'eq-heading', 'Appearance'));
    if (!p) return panel;
    const body = element('div', 'eq-loadout');
    const pairs = p.equipPairs();
    const mounts = this.tab === 'chara'
      ? [{ slot: EquipSlot.Chara, label: 'Red team', id: p.teamCharas().red, team: 0 }, { slot: EquipSlot.Chara, label: 'Blue team', id: p.teamCharas().blue, team: 1 }, { slot: EquipSlot.Head, label: 'Head', id: pairs[EquipSlot.Head].itemId, team: 0 }, { slot: EquipSlot.Face, label: 'Face', id: pairs[EquipSlot.Face].itemId, team: 0 }, { slot: EquipSlot.Beret, label: 'Beret', id: pairs[EquipSlot.Beret].itemId, team: 0 }]
      : ['Primary', 'Sidearm', 'Melee', 'Thrown', 'Special'].map((label, slot) => ({ slot, label, id: pairs[slot].itemId, team: 0 }));
    for (const m of mounts) {
      const row = button('', () => {
        const own = p.items().find(it => it.itemId === m.id); if (!own) return;
        this.ctx.ctl.menu.team = m.team; this.tab = tabOf(m.id); this.filter = 'all'; this.search = ''; this.ctx.ctl.menu.selected = own.objectId; this.redraw();
      }, 'eq-mount');
      row.append(element('small', '', m.label)); if (m.id) row.append(artwork(m.id, 30, 112)); row.append(element('b', '', m.id ? itemName(m.id).name : 'Empty')); body.append(row);
    }
    panel.append(body); return panel;
  }

  private detail(entry: Entry | undefined, level: number, credits: number, stats: ReturnType<typeof weaponStats>): HTMLElement {
    const c = this.ctx.ctl, panel = element('section', 'eq-panel eq-detail'); panel.setAttribute('aria-label', 'Equipment details');
    if (!entry) { panel.append(element('div', 'eq-empty', 'Select equipment to see its details.')); return panel; }
    const id = idOf(entry);
    panel.append(artwork(id, 112, c.page === 'inventory' ? 266 : 316), element('div', 'eq-name', itemName(id).name), element('div', 'eq-kind', labelOf(id)));
    if (entry.kind === 'offer') {
      const required = requiredLevel(id), met = level >= required;
      const requirements = element('section', `eq-requirements${met ? ' met' : ''}`); requirements.append(element('div', 'eq-section-title', 'Requirements'));
      for (const [label, value] of [['Player level', required], ['Your level', level]] satisfies [string, number][]) {
        const row = element('div', 'eq-requirement'); row.append(element('span', '', label), element('b', '', `Level ${value}`)); requirements.append(row);
      }
      requirements.append(element('div', 'eq-status', met ? '✓ Level requirement met' : `Locked · Reach Level ${required} to unlock`)); panel.append(requirements);
      const owned = c.player?.items().some(it => it.itemId === id && it.equip === ItemEquipType.Permanent);
      const price = entry.option.priceGold, busy = c.buy?.busy || c.menu.busy;
      panel.append(element('div', 'eq-cost', `${fmtInt(price)} Credits`));
      const buy = button(busy ? 'Buying…' : owned ? 'Owned' : !met ? `Requires Level ${required}` : credits < price ? 'Not enough Credits' : `Buy · ${fmtInt(price)} Credits`, () => this.buy(entry), 'eq-action');
      buy.disabled = !!busy || !!owned || !met || credits < price; panel.append(buy, element('div', 'eq-permanent', 'Permanent equipment'));
    } else {
      const data = c.player ? inventoryData(c.player, c.menu) : null, slot = equipSlotOf(id);
      if (this.tab === 'weapon') {
        const store = c.loadouts, assigned = store?.kit(this.editing)[this.slot] === id;
        const assign = button(assigned ? 'Already assigned' : `Assign to ${store?.data.presets[this.editing]?.name ?? 'loadout'}`, () => {
          if (!store) return;
          const next = parseSavedLoadouts({ ...store.data, presets: store.data.presets.map((p, i) => i === this.editing ? { ...p, kit: { ...store.kit(i), [this.slot]: id } } : p) });
          void this.savePreset(next, store.data.active === this.editing);
        }, 'eq-action');
        assign.disabled = !!assigned || !store || store.status !== 'ready' || store.busy;
        panel.append(assign);
      } else {
      const isUse = slot === null;
      const equipped = c.player?.isEquipped(entry.item);
      const action = button(c.menu.busy ? 'Saving…' : isUse ? 'Use item' : equipped && slot !== null && isUnequippableSlot(slot) ? 'Unequip' : equipped ? 'Equipped' : 'Equip', () => {
        if (useCosmeticItem(this.ctx, entry.item)) return;
        if (isUse) { c.msg = { text: `Use ${itemName(id).name}?`, onOk: () => { c.menu.confirming = true; void c.equip(); }, onCancel: () => {} }; c.draw(); }
        else void c.equip();
      }, 'eq-action');
      action.disabled = c.menu.busy || (!isUse && !data?.actionEnabled); panel.append(action, element('div', 'eq-permanent', 'Owned equipment'));
      }
    }
    const section = element('section', 'eq-stats'); section.append(element('div', 'eq-section-title', this.tab === 'weapon' ? 'Weapon stats' : 'Equipment'));
    if (stats) {
      for (const [key, label] of [['damage', 'Damage'], ['rate', 'Fire rate'], ['hit', 'Accuracy'], ['vRecoil', 'V. recoil'], ['hRecoil', 'H. recoil'], ['speed', 'Mobility']] satisfies [keyof typeof stats.gauge, string][]) {
        const row = element('div', 'eq-stat'), track = element('i'), fill = element('em'); fill.style.width = `${Math.max(0, stats.gauge[key])}%`; track.append(fill);
        row.append(element('span', '', label), track, element('b', '', stats.text[key])); section.append(row);
      }
      const specs = element('div', 'eq-specs');
      for (const [label, text] of [['Ammo', stats.text.ammo], ['Range', stats.text.range]]) { const spec = element('div', '', label); spec.append(element('b', '', text)); specs.append(spec); }
      section.append(specs);
    } else section.append(element('div', 'eq-empty', this.tab === 'weapon' ? 'No weapon stats available.' : labelOf(id)));
    panel.append(section); return panel;
  }

  private buy(entry: Extract<Entry, { kind: 'offer' }>): void {
    const c = this.ctx.ctl;
    c.msg = { text: `Buy ${itemName(entry.offer.itemId).name} for ${fmtInt(entry.option.priceGold)} Credits?\nThis equipment is yours permanently.`, onCancel: () => {}, onOk: () => {
      c.menu.selected = entry.offer.itemId;
      c.buy = { currency: 'gold', option: entry.offer.options.indexOf(entry.option), busy: false };
      void c.doBuy().finally(() => { c.buy = null; c.draw(); });
    } }; c.draw();
  }
}
