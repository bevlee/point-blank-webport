import { after, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.ts';
import { accountLoadouts } from '../src/web/loadouts.ts';
import { initialLoadouts } from '../../src/lobby/equipment/loadouts.ts';
after(async () => { await pool.end(); });
const kit = { primary: 103004, secondary: 202022, melee: 301001, grenade: 407001, special: 508002 };

test('loadout storage is scoped to the authenticated account and rejects unowned or cross-slot equipment', async () => {
  const writes: { sql: string; args: unknown[] }[] = [];
  const query = mock.method(pool, 'query', async (sql: string, args: unknown[] = []) => {
    if (sql.includes('SELECT player_id, username')) return { rows: args[1] === 'valid-token' ? [{ player_id: '42', username: 'fixture', token: args[0], access_level: 0, rank: 0, ban_object_id: 0, status: 0 }] : [] };
    if (sql.includes('FROM base_auto_ban') || sql.includes('FROM base_ban_history')) return { rows: [{ n: '0' }], rowCount: 1 };
    if (sql.includes('SELECT id FROM player_items')) return { rows: Object.values(kit).map(id => ({ id })) };
    if (sql.includes('INSERT INTO player_loadouts')) { writes.push({ sql, args }); return { rows: [] }; }
    if (sql.includes('SELECT data FROM player_loadouts')) { assert.deepEqual(args, ['42']); return { rows: [{ data: initialLoadouts(kit) }] }; }
    return { rows: [], rowCount: 0 };
  });
  try {
    const data = initialLoadouts(kit); data.presets[1].name = 'Night watch';
    assert.deepEqual(await accountLoadouts('valid-token', data), data);
    assert.equal(writes.length, 1); assert.equal(writes[0].args[0], '42');
    assert.equal((await accountLoadouts('valid-token'))?.presets[0].name, 'Assault');
    await assert.rejects(accountLoadouts('wrong-token'), /Session expired/);
    const bad = structuredClone(data); bad.presets[0].kit.primary = 103999;
    await assert.rejects(accountLoadouts('valid-token', bad), /owned equipment/);
    bad.presets[0].kit.primary = 202022;
    await assert.rejects(accountLoadouts('valid-token', bad), /Invalid loadouts/);
    assert.equal(writes.length, 1);
  } finally { query.mock.restore(); }
});
