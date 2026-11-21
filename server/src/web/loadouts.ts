import { pool, accountByToken, isBanned } from '../db.ts';
import { data } from '../shared/data.ts';
import { AccountApiError } from './accounts/accounts.ts';
import { KIT_SLOTS, parseSavedLoadouts, type SavedLoadouts } from '../../../src/lobby/equipment/loadouts.ts';

export async function accountLoadouts(token: string, value?: unknown): Promise<SavedLoadouts | null> {
  const account = await accountByToken(token);
  if (!account || await isBanned(account)) throw new AccountApiError(401, 'Session expired. Please log in again.');
  if (value !== undefined) {
    let loadouts: SavedLoadouts;
    try { loadouts = parseSavedLoadouts(value); } catch { throw new AccountApiError(400, 'Invalid loadouts'); }
    const rows = await pool.query('SELECT id FROM player_items WHERE owner_id=$1', [String(account.playerId)]);
    const owned = new Set<number>([...data.basics.map(i => i.id), ...rows.rows.map(r => Number(r.id))]);
    if (loadouts.presets.some(p => KIT_SLOTS.some(s => p.kit[s] !== 0 && !owned.has(p.kit[s])))) throw new AccountApiError(400, 'Loadouts may only contain owned equipment');
    await pool.query(`INSERT INTO player_loadouts(owner_id, data) VALUES($1,$2::jsonb)
      ON CONFLICT(owner_id) DO UPDATE SET data=EXCLUDED.data`, [String(account.playerId), JSON.stringify(loadouts)]);
    return loadouts;
  }
  const row = (await pool.query('SELECT data FROM player_loadouts WHERE owner_id=$1', [String(account.playerId)])).rows[0];
  return row ? parseSavedLoadouts(row.data) : null;
}
