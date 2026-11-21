import { readFileSync, writeFileSync } from 'node:fs';
import { pbHitDamage } from '../src/game/damage.ts';
import { charaMaxHp } from '../src/gameplay/charaHp.ts';
const catalog = JSON.parse(readFileSync(new URL('../public/assets/cross/weapons/weapons.json', import.meta.url)));
const rows = [];
for (const w of catalog.weapons) {
  if (!['AR','SMG','MG','SR','HG','SG','KNIFE'].includes(w.family)) continue;
  const base = w.pb?.damage ?? w.damage;
  const modes = w.family === 'KNIFE' ? Object.entries(w.pb?.melee ?? {}).filter(([k]) => /^damage[AB][12]$/.test(k)) : [['bullet',base]];
  if (!modes.length) modes.push(['base',base]);
  for (const [mode, damage] of modes) {
    const range = w.pb?.range ?? w.range;
    const dpdRate = w.pb?.dpdRate ?? 0;
    const head = pbHitDamage({base:damage,zone:'head'}).damage;
    const atRange = pbHitDamage({base:damage,zone:'head',distance:range,range,dpdRate}).damage;
    const maxDistance = head < 100 ? '' : dpdRate <= 0 ? range : Math.max(0,Math.min(range,range * (1 - 99.5/(damage*1.5))/dpdRate));
    rows.push([w.id,w.name,w.family,mode,damage,head,head>=charaMaxHp(),atRange,maxDistance]);
  }
}
const csv = [['id','name','family','attack','base','head_damage','one_head_hit_kills','head_damage_at_range','max_one_hit_distance_m'],...rows].map(r=>r.map(v=>JSON.stringify(v)).join(',')).join('\n');
writeFileSync(new URL('../review/headshot-balance.csv', import.meta.url),csv+'\n');
console.log(`${rows.length} weapon/attack rows written to review/headshot-balance.csv (unblocked head hits, no wall, ordinary room).`);
