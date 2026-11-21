// Server-hosted match (server/src/match/serverMatch.ts), end to end with no browser:
//   node --test src/p2p/test/serverMatch.test.ts   (part of npm run test:p2p)
// A real /match WebSocket route in this process, three real client stacks (src/net/battle.ts PbBattleNet over
// src/net/serverMatch.ts) and Server.Game's RoomModel taking the core's deaths (roomHandlers.ts fromServerMatch).
// Checks: ticket admission, register, positions relayed, the server applying the attacker's damage (body / head caps of
// weapon 103004, base 27 x zone rate x the +10 % coupon, +1 rounding: torso 31 / limb 25 / head 46), over-cap hits refused, no team damage, the victim's HP and death coming from the server, the
// kill landing in Server.Game (5136, kills / deaths), a client DEATH_REQ ignored, a spoofed slot dropped, ENDBATTLE = 1001.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { PacketReader, PacketWriter } from "../../net/packet.ts";
import { buildGameData, encodeUserAction } from "../../net/matchUdp.ts";
import { PbBattleNet } from "../../net/battle.ts";
import type { ServerHpEvent, PlayerState } from "../../game/netAdapter.ts";
import { Account } from "../../../server/src/shared/account.ts";
import { PlayerEquipment } from "../../../server/src/shared/models.ts";
import { RoomModel, RoomState, SlotState } from "../../../server/src/game/roomModel.ts";
import { fromServerMatch, handleDeath } from "../../../server/src/game/roomHandlers.ts";
import type { ChannelModel } from "../../../server/src/game/channel.ts";
import type { GameClient } from "../../../server/src/game/gameServer.ts";
import { listenMatch, matchEnd, matchHooks, matchLife, matchOpen, matchRespawn } from "../../../server/src/match/serverMatch.ts";
import { mintSignalTicket } from "../../../server/src/web/signalTicket.ts";
import { ZONE_MULTIPLIER } from "../../host/matchCore.ts";
import { ZoneMultiplier } from "../../game/damage.ts";
import { signalKey } from "../../../server/src/web/signal.ts";

process.env.PB_MATCH_MODE = "server";
const WEAPON = 103004; // ItemStatistics damage 27, range 140
const TDM = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function until<T>(what: string, ms: number, probe: () => T | undefined | null | false): Promise<T> {
  return new Promise((res, rej) => {
    const t = setInterval(() => { const v = probe(); if (v) { clearInterval(t); clearTimeout(to); res(v); } }, 10);
    const to = setTimeout(() => { clearInterval(t); rej(new Error(`timeout: ${what}`)); }, ms);
  });
}
const opOf = (b: Uint8Array) => b[0] | (b[1] << 8);

/** Server.Game's side: room 7 in battle, slots 0..n-1 fighting (team = slot % 2), leader slot 0 */
function world(n: number, uid: number, seed: number) {
  const sent: { to: bigint; op: number }[] = [];
  const accounts: Account[] = [];
  const svc = {
    getAccount: (pid: bigint) => accounts.find((a) => a.playerId === pid) ?? null,
    send: (a: Account, b: Uint8Array) => { sent.push({ to: a.playerId, op: opOf(b) }); },
    updateStatus: async () => {},
  };
  const ch = { id: 0, type: 0, serverId: 1, lobbyPlayers: [] as Account[], rooms: [] } as unknown as ChannelModel;
  const r = new RoomModel(7, ch, svc);
  Object.assign(r, { state: RoomState.BATTLE, mapId: 36, rule: 1, stage: 1, roomType: TDM, killTime: 0, leader: 0, uniqueRoomId: uid, seed });
  r.battleStart = r.matchStart = Date.now() - 60000;
  const clients: GameClient[] = [];
  for (let i = 0; i < n; i++) {
    const a = new Account();
    Object.assign(a, { playerId: BigInt(0x100 + i), nickname: `P${i}`, rank: 10, slotId: i, room: r, isOnline: true });
    const c = { player: a, session: { send: (b: Uint8Array) => sent.push({ to: a.playerId, op: opOf(b) }), close: () => {} } };
    a.connection = c;
    accounts.push(a);
    clients.push(c as unknown as GameClient);
    const s = r.slots[i];
    s.playerId = a.playerId; s.state = SlotState.BATTLE; s.startTime = Date.now() - 60000;
    s.equipment = Object.assign(new PlayerEquipment(), { weaponPrimary: WEAPON });
  }
  return { r, accounts, clients, sent, ops: (op: number) => sent.filter((x) => x.op === op) };
}

const servers: { close(): void }[] = [];
after(() => { for (const s of servers) s.close(); });

test("the server's zone caps use the client's balance (head / torso / limb)", () => {
  assert.deepEqual({ ...ZONE_MULTIPLIER }, { head: ZoneMultiplier.head, torso: ZoneMultiplier.torso, limb: ZoneMultiplier.limb });
});

test("server-hosted match: the server applies damage, declares the kill, Server.Game scores it", async () => {
  const httpServer = http.createServer();
  const stopMatch = listenMatch(httpServer);
  await new Promise<void>((r) => httpServer.listen(0, "127.0.0.1", () => r()));
  servers.push({ close: () => { stopMatch(); httpServer.close(); } });
  const port = (httpServer.address() as { port: number }).port;
  const GW = `ws://127.0.0.1:${port}`;

  // Metro TDM (map 36, rule 1, DeathMatch 4), server 1 channel 0 room 7
  const uid = (1 << 20) | 7, seed = (36 << 20) | (1 << 12) | 4;
  const key = signalKey(uid, seed);
  const w = world(3, uid, seed);
  matchHooks.leader = () => w.r.leader;
  const gameOut: string[] = [];
  matchHooks.game = (k, m) => { if (k === key) { gameOut.push(m.t); fromServerMatch(w.r, m); } };
  matchOpen(uid, seed, { barefistOnly: false }, () => {});

  const roster = [0, 1, 2].map((slot) => ({ slot, name: `P${slot}`, team: (slot % 2) as 0 | 1 }));
  const net = (slot: number, ticket = mintSignalTicket(key, slot, BigInt(0x100 + slot))) => new PbBattleNet({
    session: { uniqueRoomId: uid, roomSeed: seed, slot, accountId: (0x100 + slot) & 0xff, signalTicket: ticket, matchMode: "server" }, roster, serverUrl: GW,
  });

  // ---- admission: a ticket of another slot is refused
  const bad = net(1, mintSignalTicket(key, 2, 0x102n));
  await assert.rejects(bad.connect(), /BAD_TICKET/);
  bad.dispose();

  const A = net(0), B = net(1), C = net(2); // A (FR) shoots B (CT); C is A's team mate
  await Promise.all([A.connect(), B.connect(), C.connect()]);
  assert.ok(A.link.connected && B.link.connected && C.link.connected, "REGISTER 65 -> CONNECT 66 for every slot over /match");
  assert.equal(A.isBotHost, false, "no room client: nobody runs the AI seats");
  assert.equal(B.serverAuthoritative, true);

  // ---- Server.Game RESPAWN_ACK -> RespawnSync (what respawnSlot sends)
  const weapons = { primary: WEAPON, secondary: 202022, melee: 301001, explosive: 407001, special: 0 };
  for (const slot of [0, 1, 2]) matchRespawn(uid, seed, { slot, respawnCount: 1, accountId: (0x100 + slot) & 0xff, charaId: 602002, weapons });
  for (const n of [A, B, C]) n.setRespawnCount(1);

  const hpB: ServerHpEvent[] = [];
  B.onServerHp((e) => hpB.push(e));
  const seenByB: PlayerState[] = [];
  B.onRemoteState((s) => seenByB.push(s));
  const state = (id: string, team: 0 | 1, x: number): PlayerState => ({
    id, name: id, team, pos: [x, 0.5, -10], vel: [0, 0, 0], yaw: 0, pitch: 0, crouch: false, alive: true, hp: 100, weapon: "K-2", weaponId: WEAPON, firing: false, t: Date.now(),
  });
  const pump = setInterval(() => { A.sendState(state(A.localId, 0, 5)); B.sendState(state(B.localId, 1, -5)); C.sendState(state(C.localId, 0, 3)); }, 40);
  try {
    await until("B sees A move", 2000, () => seenByB.some((s) => s.id === "slot0"));

    // ---- hits as game.ts sends them: the attacker's computeDamage result rides as `dealt` (ObjectType.User)
    const hit = (from: PbBattleNet, victim: number, zone: "head" | "torso" | "limb", dealt: number) =>
      from.sendHit({ attackerId: from.localId, victimId: `slot${victim}`, weapon: "K-2", zone, baseDamage: 27, helmetPenetrate: 0, falloff: 1, point: [-5, 1.6, -10], t: Date.now(), dealt });

    const gap = () => sleep(120); // the fire rate cap: one K-2 bullet per 75 ms (+15 %)
    hit(A, 1, "torso", 32); // over the torso cap: trunc(27 x 1 x 1.1 + 0.5) + 1 = 31
    await sleep(300);
    assert.equal(matchLife(uid, seed, 1)?.life, 100, "an over-cap torso hit is refused");
    hit(A, 1, "torso", 30);
    await until("B hp 70", 2000, () => hpB.find((e) => e.hp === 70));
    assert.deepEqual(matchLife(uid, seed, 1), { life: 70, dead: false }, "the server holds B's HP");

    await gap();
    hit(A, 1, "limb", 26); // a limb hit claiming torso damage: over the limb cap trunc(27 x 0.8 x 1.1 + 0.5) + 1 = 25
    await sleep(300);
    assert.equal(matchLife(uid, seed, 1)?.life, 70, "a limb hit with torso damage is refused");
    hit(A, 1, "limb", 22); // 27 x 0.8 = 21.6 -> 22
    await until("B hp 48", 2000, () => hpB.find((e) => e.hp === 48));

    await gap();
    hit(A, 1, "head", 47); // over the head cap: trunc(27 x 1.5 x 1.1 + 0.5) + 1 = 46
    await sleep(300);
    assert.equal(matchLife(uid, seed, 1)?.life, 48, "an over-cap headshot is refused");

    hit(C, 0, "torso", 30); // C (FR) on A (FR): team damage
    await sleep(300);
    assert.equal(matchLife(uid, seed, 0)?.life, 100, "no team damage in a team room");

    hit(A, 1, "head", 41); // 27 x 1.5 = 40.5 -> 41: 48 -> 7
    await until("B hp 7", 2000, () => hpB.find((e) => e.hp === 7));
    await gap();
    hit(A, 1, "head", 41);
    const dead = await until("B death from the server", 2000, () => hpB.find((e) => e.hp === 0 && e.death));
    assert.deepEqual(dead.death, { killerId: "slot0", headshot: true }, "the server's death: killer A, headshot");
    assert.deepEqual(matchLife(uid, seed, 1), { life: 0, dead: true });

    // ---- the core's death is the kill in Server.Game: 5136 to the battle, A 1 kill, B 1 death
    await until("5136 DEATH_ACK", 1000, () => w.ops(5136).length >= 3);
    assert.ok(gameOut.includes("death"));
    assert.equal(w.r.slots[0].allKills, 1);
    assert.equal(w.r.slots[1].allDeaths, 1);
    assert.equal(w.r.frKills, 1);

    // ---- a client's DEATH_REQ for a player kill is not taken (the server owns kills): C claims B
    const req = new PacketWriter(64).writeC(0).writeC(1).writeC(2).writeD(WEAPON).writeT(0).writeT(0).writeT(0).writeC(0).writeC(0)
      .writeC(1).writeC(1).writeC(0x10).writeH(0).writeC(0).writeT(0).writeT(0).writeT(0).writeC(2).writeB(new Uint8Array(4));
    const acks = w.ops(5136).length;
    w.r.slots[1].deathState = 0; // even with B alive again on the server
    handleDeath(w.clients[2], new PacketReader(req.toBytes()));
    assert.equal(w.ops(5136).length, acks, "DEATH_REQ ignored");
    assert.equal(w.r.slots[2].allKills, 0);

    // ---- B speaking for slot 0 is dropped at the socket
    let spoofSeen = false;
    A.onRemoteState((s) => { if (s.pos[0] > 900) spoofSeen = true; });
    const spoof = buildGameData({ slot: 0, time: 1, round: 0, respawn: 1, roundNumber: 0, accountId: 0x00, unk1: 0 },
      encodeUserAction(0, { posRot: { x: 999, y: 999, z: 999, yaw: 0, pitch: 0, area: 0 } }), { uniqueRoomId: uid, roomSeed: seed });
    (B.link as unknown as { ws: { send(d: Uint8Array, r: boolean): void } }).ws.send(spoof, false);
    await sleep(300);
    assert.equal(spoofSeen, false, "a record for another slot is dropped");
  } finally {
    clearInterval(pump);
  }

  // ---- ENDBATTLE: every link ends with 1001 (match over, no reconnect)
  let closedB = "";
  const prev = B.link.onClose;
  B.link.onClose = (why) => { closedB = why; prev?.(why); };
  matchEnd(uid, seed);
  await until("B link closed", 2000, () => closedB);
  assert.match(closedB, /^1001/);
  for (const n of [A, B, C]) n.dispose();
  w.r.stopTimers();
});
