// A starting match whose leader drops out (roomHandlers.ts quitMatch / followLeader / isOpeningSpawn). The three paths are the
// counterexamples TLC found on a TLA+ model of the room lifecycle (3 seats: 0 and 2 FR, 1 CT, leader 0, Team Deathmatch):
// each step is one real handler call or one counter running out.
//   node --test server/test/matchLeader.test.ts
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { RoomState, SlotState } from "../src/game/roomModel.ts";
import { handleGiveUpBattle, handleLoadingStart, handlePreStartBattle, handleStartBattle } from "../src/game/roomHandlers.ts";
import { PacketReader, PacketWriter } from "../../src/net/packet.ts";
import { battleRoom } from "./fakeRoom.ts";
import type { GameClient } from "../src/game/gameServer.ts";

/** the leader pressed start: seats 0, 1, 2 LOAD, room LOADING */
function started() {
  const f = battleRoom(3);
  const r = f.room;
  r.state = RoomState.LOADING; r.leader = 0; r.countdownIG = 0;
  r.buildRoomInfo = () => Uint8Array.of(0x11, 0x0e);
  r.slots.forEach((s, i) => { s.state = i < 3 ? SlotState.LOAD : SlotState.CLOSE; });
  for (const a of f.accounts as unknown as Record<string, unknown>[]) { a.equipment = {}; a.mission = { clone: () => ({}) }; a.statistic = {}; a.exp = 0; a.gold = 0; }
  const c = (i: number) => ({ player: f.accounts[i], session: { send: () => {}, sendText: () => {} }, channelOf: () => r.channel }) as unknown as GameClient;
  return {
    r,
    loading: (i: number) => handleLoadingStart(c(i), new PacketReader(new PacketWriter().writeC(3).writeS("Map", 3).toBytes())),
    preStart: (i: number) => handlePreStartBattle(c(i), new PacketReader(new PacketWriter().writeC(r.mapId).writeC(r.rule).writeC(r.stage).writeC(r.roomType).toBytes())),
    startBattle: (i: number) => handleStartBattle(c(i)),
    giveUp: (i: number) => handleGiveUpBattle(c(i)),
    seat: (i: number) => r.slots[i].state,
  };
}

function withTimers(fn: () => void) {
  mock.timers.enable({ apis: ["setTimeout"] });
  try { fn(); } finally { mock.timers.reset(); }
}

test("the leader's loading counter runs out: the leadership moves to a seat still in the match", () => withTimers(() => {
  const m = started();
  m.loading(0);
  mock.timers.tick(90_000);
  assert.equal(m.seat(0), SlotState.NORMAL);
  assert.notEqual(m.r.leader, 0, "leadership moved");
  assert.ok(m.seat(m.r.leader) >= SlotState.LOAD, "the new leader is in the match");
}));

test("the leader quits after a guest's PRESTART: the guests' spawn opens the battle", () => withTimers(() => {
  const m = started();
  m.loading(0); m.loading(1); m.preStart(1);
  m.giveUp(0);
  assert.equal(m.r.leader, 1);
  m.startBattle(1);
  m.loading(2); m.preStart(2); m.startBattle(2);
  mock.timers.tick(1);
  assert.deepEqual([m.seat(1), m.seat(2)], [SlotState.BATTLE, SlotState.BATTLE]);
  assert.equal(m.r.state, RoomState.BATTLE, "kills and the clock count from here");
}));

test("the leader quits before loading: the new leader, already loaded as a guest, can still start the match", () => withTimers(() => {
  const m = started();
  m.r.leader = 2;
  m.loading(0);      // seat 0 loads as a guest: no UDP host yet
  m.giveUp(2);       // the leader quits before its LOADING_START
  assert.equal(m.r.leader, 0);
  assert.equal(m.r.state, RoomState.RENDEZVOUS, "the room caught up with the new leader");
  m.preStart(0);
  assert.equal(m.seat(0), SlotState.PRESTART, "PRESTART accepted");
  m.loading(1); m.preStart(1);
  m.startBattle(0); m.startBattle(1);
  mock.timers.tick(1);
  assert.deepEqual([m.seat(0), m.seat(1)], [SlotState.BATTLE, SlotState.BATTLE]);
  assert.equal(m.r.state, RoomState.BATTLE);
}));
