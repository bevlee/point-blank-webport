// "/" commands (playerCommands.ts): parsing, quoted nicks, prefix resolution, replies only to the author. Offline: fake accounts and room.
// (/w and /r look at the mute table with banState: no DB row for these fake ids; if Postgres is down banState answers "no ban".)
//   node --test test/playerCommands.test.ts
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { BUG_POPUP_LINE, parseCommand, parseKind, playerCommands, resolveNick } from "../src/game/playerCommands.ts";
import { isClientCommand, social } from "../src/game/socialHandlers.ts";
import { activeVote } from "../src/game/voteCommon.ts";
import { fakeAccount, battleRoom, chatText, manualClock, type Sent } from "./fakeRoom.ts";
import { pool } from "../src/db.ts";

beforeEach(() => { manualClock(); });
after(() => { void pool.end(); });

const replies = (sent: Sent[], to: bigint) => sent.filter((s) => s.op === 2571 && s.to === to).map((s) => chatText(s.bytes));

test("parseCommand: name without accents, tokens, quoted nick, rest", () => {
  const c = parseCommand(`/denunciar "Nick Com Espaco" hack ele usa aimbot`)!;
  assert.equal(c.name, "denunciar");
  assert.deepEqual(c.args.map((a) => a.value).slice(0, 3), ["Nick Com Espaco", "hack", "ele"]);
  assert.equal(c.rest(1), "ele usa aimbot");
  assert.equal(parseCommand("/Votelíder P2")!.name, "votelider");
  assert.equal(parseCommand("/NÃO")!.name, "nao");
  assert.equal(parseCommand("/r oi tudo bem")!.rest(-1), "oi tudo bem");
  for (const s of ["/", "/ ola", "/o/", "ola /w", ":mute x 5", "", "// "]) assert.equal(parseCommand(s), null, JSON.stringify(s));
  assert.deepEqual(parseKind("HACK")?.kinds, { chat: false, hack: true });
  assert.equal(parseKind("chat")?.motive, 0);
  assert.equal(parseKind("hack")?.motive, 1);
  assert.equal(parseKind("outro"), null);
});

test("resolveNick: exact, unique prefix in the room, ambiguous = error, quoted names", () => {
  const f = battleRoom(4);
  const [a, b, c, d] = f.accounts;
  a.nickname = "Ana"; b.nickname = "Anderson"; c.nickname = "Bruno Silva"; d.nickname = "Bruna";
  social.online = new Map(f.accounts.map((x) => [x.playerId, x]));
  assert.equal((resolveNick(a, "ana") as { acc: typeof a }).acc, a, "exact beats the prefix of Anderson");
  assert.equal((resolveNick(a, "and") as { acc: typeof a }).acc, b);
  assert.equal((resolveNick(a, "Bruno Sil") as { acc: typeof a }).acc, c);
  const amb = resolveNick(a, "bru") as { err: string };
  assert.match(amb.err, /Ambiguous nickname.*Bruno Silva.*Bruna|Ambiguous nickname.*Bruna.*Bruno Silva/);
  assert.match((resolveNick(a, "zzz") as { err: string }).err, /not found/);
  assert.match((resolveNick(a, "") as { err: string }).err, /Enter/);
  const lobby = fakeAccount(900, "Fora", []);
  social.online.set(lobby.playerId, lobby);
  assert.equal((resolveNick(a, "fora") as { acc: typeof a }).acc, lobby, "outside the room: exact match among the online");
  assert.match((resolveNick(a, "fora", true) as { err: string }).err, /in the room/, "roomOnly");
  assert.match((resolveNick(a, "for") as { err: string }).err, /not found/, "no prefix outside the room");
});

test("/ajuda, /bug and unknown commands answer only the author; /bloquear is the client's", async () => {
  const f = battleRoom(3);
  const me = f.accounts[0];
  assert.equal(await playerCommands(me, "/ajuda"), true);
  const help = replies(f.sent, me.playerId);
  assert.equal(help.length >= 3 && help.every((l) => l.length > 10), true);
  assert.equal(f.sent.filter((s) => s.to !== me.playerId).length, 0, "nothing reaches the others");
  f.clear();
  assert.equal(await playerCommands(me, "/bug"), true);
  assert.deepEqual(replies(f.sent, me.playerId), [BUG_POPUP_LINE]);
  assert.equal(BUG_POPUP_LINE, "\u0001BUG");
  f.clear();
  assert.equal(await playerCommands(me, "/xyz"), true);
  assert.match(replies(f.sent, me.playerId)[0], /Unknown command/);
  f.clear();
  assert.equal(await playerCommands(me, "/bloquear Fulano"), false);
  assert.equal(await playerCommands(me, "/desbloquear Fulano"), false);
  assert.equal(f.sent.length, 0, "client-side commands reply nothing");
  assert.equal(isClientCommand("/BLOQUEAR x"), true);
  assert.equal(isClientCommand("/bloqueado"), false);
  assert.equal(await playerCommands(me, "oi gente"), false);
});

test("/w and /r: whisper by prefix, errors, reply to the last partner", async () => {
  const f = battleRoom(3);
  const [a, b] = f.accounts;
  a.nickname = "Alice"; b.nickname = "Beto";
  social.online = new Map(f.accounts.map((x) => [x.playerId, x]));
  assert.equal(await playerCommands(a, "/w"), true);
  assert.match(replies(f.sent, a.playerId)[0], /Usage: \/w/);
  f.clear();
  assert.equal(await playerCommands(a, "/w be oi tudo bem?"), true);
  const w = f.sent.find((s) => s.op === 1830 && s.to === b.playerId);
  assert.ok(w, "1830 whisper to Beto");
  assert.match(replies(f.sent, a.playerId)[0], /Whisper to Beto: oi tudo bem\?/);
  f.clear();
  assert.equal(await playerCommands(b, "/r valeu"), true);
  assert.ok(f.sent.find((s) => s.op === 1830 && s.to === a.playerId), "Beto answers Alice");
  f.clear();
  assert.equal(await playerCommands(a, "/w nobody oi"), true);
  assert.match(replies(f.sent, a.playerId)[0], /not found/);
  f.clear();
  assert.equal(await playerCommands(a, `/w Beto ${"x".repeat(61)}`), true);
  assert.match(replies(f.sent, a.playerId)[0], /too long/);
  const lone = fakeAccount(901, "Sozinho", f.sent);
  f.clear();
  assert.equal(await playerCommands(lone, "/r oi"), true);
  assert.match(replies(f.sent, lone.playerId)[0], /Nobody/);
});

test("/votekick, /sim, /nao, /ping, /votelider and /denunciar: usage and state errors", async () => {
  const f = battleRoom(6);
  const me = f.accounts[0];
  f.accounts.forEach((x, i) => { x.nickname = ["Zero", "Um", "Dois", "Tres", "Quatro", "Cinco"][i]; });
  social.online = new Map(f.accounts.map((x) => [x.playerId, x]));
  const say = async (p: typeof me, s: string) => { f.clear(); await playerCommands(p, s); return replies(f.sent, p.playerId); };
  assert.match((await say(me, "/votekick"))[0], /Usage: \/votekick/);
  assert.match((await say(me, "/votekick Um barulho"))[0], /Invalid reason/);
  assert.match((await say(me, "/votekick Fulano hack"))[0], /not found in the room/);
  assert.match((await say(me, "/sim"))[0], /No vote/);
  assert.match((await say(me, "/denunciar"))[0], /Usage: \/denunciar/);
  assert.match((await say(me, "/denunciar Um xyz"))[0], /Invalid type/);
  // a real kick vote through the command: 5191 ack to the author + 5193 to the others, and the text reply
  const r = await say(me, "/votekick um chat");
  assert.match(r[0], /Kick vote started against Um/);
  assert.equal(f.sent.filter((s) => s.op === 5191 && s.to === me.playerId).length, 1);
  assert.equal(f.sent.filter((s) => s.op === 5193).length, 4);
  assert.ok(activeVote(f.room));
  assert.match((await say(f.accounts[2], "/votekick tres hack"))[0], /A vote is already/);
  assert.match((await say(f.accounts[2], "/sim"))[0], /Vote recorded/);
  assert.match((await say(f.accounts[2], "/nao"))[0], /You have already voted/);
  assert.match((await say(f.accounts[1], "/sim"))[0], /You have already voted/, "the target already counts as voted");
  const ping = await say(me, "/ping");
  assert.match(ping[0], /Host: Zero \(slot 1, you\)/);
  assert.match((await say(f.accounts[3], "/votelider"))[0], /A vote is already/);
});
