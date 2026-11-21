import { accountApiUrl } from '../../net/accountApi.ts';
import type { MetaSession } from '../state/MetaSession.ts';
import type { PlayerStore } from '../state/PlayerStore.ts';
import { Observable } from '../state/observable.ts';
import { availableKit, initialLoadouts, parseSavedLoadouts, type EquipmentKit, type SavedLoadouts } from './loadouts.ts';

const stores = new WeakMap<PlayerStore, LoadoutStore>();
export const playerLoadouts = (player: PlayerStore): LoadoutStore | undefined => stores.get(player);

export class LoadoutStore extends Observable<'change'> {
  data: SavedLoadouts;
  status: 'loading' | 'ready' | 'error' = 'loading';
  busy = false;
  error = '';
  constructor(private player: PlayerStore, private token: Uint8Array) {
    super(); this.data = initialLoadouts(player.weaponLoadout()); stores.set(player, this);
  }
  private async request(path: string, data?: SavedLoadouts): Promise<SavedLoadouts | null> {
    const response = await fetch(accountApiUrl(path), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: btoa(String.fromCharCode(...this.token)), ...(data ? { loadouts: data } : {}) }) });
    const body: unknown = await response.json();
    if (!response.ok) throw new Error('Could not save or load your loadouts. Please try again.');
    if (!body || typeof body !== 'object' || !('loadouts' in body)) throw new Error('Invalid loadout response');
    return body.loadouts === null ? null : parseSavedLoadouts(body.loadouts);
  }
  async load(): Promise<void> {
    this.status = 'loading'; this.error = ''; this.emit(['change']);
    try {
      const saved = await this.request('/api/loadouts/read');
      this.data = saved ?? initialLoadouts(this.player.weaponLoadout());
      this.status = 'ready';
    } catch (e) { this.status = 'error'; this.error = e instanceof Error ? e.message : String(e); }
    this.emit(['change']);
  }
  kit(index = this.data.active): EquipmentKit {
    const preset = this.data.presets[index] ?? this.data.presets[0];
    return availableKit(preset.kit, new Set(this.player.items().map(i => i.itemId)), this.player.weaponLoadout());
  }
  async save(next: SavedLoadouts): Promise<void> {
    if (this.busy || this.status !== 'ready') throw new Error('Wait for your loadouts to finish loading or saving.');
    this.busy = true; this.error = ''; this.emit(['change']);
    try {
      const normalized = { ...next, presets: next.presets.map(p => ({ ...p, kit: availableKit(p.kit, new Set(this.player.items().map(i => i.itemId)), this.player.weaponLoadout()) })) };
      const result = await this.request('/api/loadouts', parseSavedLoadouts(normalized));
      if (!result) throw new Error('Could not save loadouts');
      this.data = result;
    } catch (e) { this.error = e instanceof Error ? e.message : String(e); throw e; }
    finally { this.busy = false; this.emit(['change']); }
  }
  async apply(session: MetaSession, index = this.data.active): Promise<void> {
    if (this.status !== 'ready' || this.busy) throw new Error('Wait for your loadouts to finish saving.');
    await session.equipLoadout(this.kit(index));
  }
}
