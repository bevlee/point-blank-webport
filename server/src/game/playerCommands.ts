// Player commands, called by handleChat before the broadcast. The GM commands (":name",
// gmCommands.ts) are a different prefix and untouched. The reply goes only to the author, as a line from "Server" (lobbyChatAck(0, "Server", 5)).
// Everything is validated here again: the client only parses to open the right popup.
//   /ajuda  /w <nick> <texto>  /r <texto>  /ping  /denunciar <nick> <hack|chat> [detalhe]  /votekick <nick> <hack|chat>
//   /votelider [nick]  /sim  /nao  /bug
//   /bloquear <nick>, /desbloquear <nick>: CLIENT-side filters, playerCommands returns false for them (handleChat drops them, isClientCommand)
// A nick with spaces goes "in quotes". A nick is resolved by unique prefix among the players of the sender's room (exact match wins; an
// ambiguous prefix is an error line), then by exact match among the players online.
// /bug answers the line "\u0001BUG" (SOH + BUG): the client sees the prefix and opens the bug popup instead of printing it.
import { config } from "../config.ts";
import type { Account } from "../shared/account.ts";
import { RoomState } from "./roomModel.ts";
import * as rp from "./roomPackets.ts";
import { handleRequestMain } from "./roomHandlers.ts";
import { banState, lastWhisperPartner, sendWhisper, serverReply, social } from "./socialHandlers.ts";
import { PLAYER_HELP as HELP, cleanChatText, tokenize, type Token } from "./chatGuard.ts";
import { KICK_ERR, castKickVote, startKickVote } from "./voteKick.ts";
import { LEADER_ERR, LEADER_MIN_HUMANS, castLeaderVote, pingOf, startLeaderVote } from "./voteLeader.ts";
import { activeVote, roomOf } from "./voteCommon.ts";
import { REPORT_ERR, submitReport, type ReportKinds } from "./reports.ts";
import type { GameClient } from "./gameServer.ts";

/** The first line of the reply to /bug: the marker the client turns into the bug popup. */
export const BUG_POPUP_LINE = "\u0001BUG";

export { tokenize, type Token };

const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export interface ParsedCommand { name: string; args: Token[]; /** the text after token <n> (n = -1: after the name) */ rest(n: number): string }

/** "/name rest" -> the lower-case accent-free name and its tokens; null when the text is not a command ("/", "/o/", ":x"). */
export function parseCommand(text: string): ParsedCommand | null {
  const m = /^\/(\p{L}+)(?=\s|$)/u.exec(text.trim());
  if (!m) return null;
  const t = text.trim(), after = t.slice(m[0].length);
  const args = tokenize(after);
  return { name: fold(m[1]), args, rest: (n) => (n < 0 ? after : after.slice(args[n]?.end ?? after.length)).trim() };
}

export type TargetResult = { acc: Account } | { err: string };

/** Unique prefix inside the room, then exact among the online players (see the header). roomOnly: only the room counts. */
export function resolveNick(p: Account, query: string, roomOnly = false): TargetResult {
  const q = fold(query);
  if (!q) return { err: "Enter the player's nickname." };
  const room = roomOf(p);
  if (room) {
    // a hidden GM observer is not a room mate for a normal account: no prefix match, no name in the "ambiguous" list
    const mates = room.getAllPlayers().filter((a) => p.isGM() || !room.slots[a.slotId]?.stealth);
    const exact = mates.filter((a) => fold(a.nickname) === q);
    if (exact.length === 1) return { acc: exact[0] };
    const pref = mates.filter((a) => fold(a.nickname).startsWith(q));
    if (pref.length === 1) return { acc: pref[0] };
    if (pref.length > 1) return { err: `Ambiguous nickname: ${pref.slice(0, 5).map((a) => a.nickname).join(", ")}${pref.length > 5 ? "..." : ""}. Enter more characters.` };
  }
  if (!roomOnly) {
    const a = [...social.online.values()].find((x) => x.isOnline && fold(x.nickname) === q);
    if (a) return { acc: a };
  }
  return { err: `Player '${query}' not found${roomOnly ? " in the room" : ""}.` };
}

const KICK_TEXT = (): Record<number, string> => ({
  [KICK_ERR.fail]: "Could not start the vote.",
  [KICK_ERR.active]: "A vote is already in progress.",
  [KICK_ERR.cooldown]: "Wait 1 minute between votes.",
  [KICK_ERR.rank]: `You must hold rank ${config.voteMinRank} or more to start a kick vote.`,
  [KICK_ERR.voted]: "You have already voted.",
  [KICK_ERR.fewPlayers]: "At least 4 human players are required in the match.",
  [KICK_ERR.protectedTarget]: "This player cannot be kicked by vote.",
});
const LEADER_TEXT = (): Record<number, string> => ({
  [LEADER_ERR.fail]: "Could not start the vote.",
  [LEADER_ERR.active]: "A vote is already in progress.",
  [LEADER_ERR.cooldown]: "Wait 2 minutes between host votes.",
  [LEADER_ERR.rank]: `You must hold rank ${config.voteMinRank} or more to vote for a new host.`,
  [LEADER_ERR.voted]: "You have already voted.",
  [LEADER_ERR.fewPlayers]: `Requires at least ${LEADER_MIN_HUMANS} human players in the match.`,
  [LEADER_ERR.badTarget]: "This player cannot become the new host.",
  [LEADER_ERR.highPing]: "This player's ping is too high to become host.",
  [LEADER_ERR.rejected]: "Vote rejected.",
});
const REPORT_TEXT = (): Record<number, string> => ({
  [REPORT_ERR.noTickets]: `No report tickets (${config.reportTickets} every 24 h).`,
  [REPORT_ERR.rank]: `You must hold rank ${config.reportMinRank} or higher to submit a report.`,
  [REPORT_ERR.duplicate]: "You have already reported this player.",
  [REPORT_ERR.fail]: "Could not submit the report.",
});

/** "hack" / "chat" -> report kinds + the vote motive (0 chat, 1 hack [INFERIDO]); null when it is neither. */
export function parseKind(w: string | undefined): { kinds: ReportKinds; motive: number } | null {
  const k = fold(w ?? "");
  if (k === "hack") return { kinds: { chat: false, hack: true }, motive: 1 };
  if (k === "chat") return { kinds: { chat: true, hack: false }, motive: 0 };
  return null;
}

/** true = the text was a command and was answered (do not broadcast); false = not for us (normal chat, or client-side commands). */
export async function playerCommands(p: Account, text: string): Promise<boolean> {
  const cmd = parseCommand(text);
  if (!cmd) return false;
  const say = (m: string) => serverReply(p, m);
  const client = p.connection as GameClient | null;
  const room = roomOf(p);
  const a = cmd.args;
  switch (cmd.name) {
    case "bloquear": case "desbloquear": return false;
    case "ajuda": case "help": for (const l of HELP) say(l); return true;
    case "bug": say(BUG_POPUP_LINE); return true;
    case "w": {
      if (a.length < 2) { say("Usage: /w <nick> <text>"); return true; }
      const t = cleanChatText(cmd.rest(0));
      if (!t) { say("Usage: /w <nick> <text>"); return true; }
      if (t.length > 60) { say("Text too long (maximum 60 characters)."); return true; }
      if (await banState(p)) { say("You are muted."); return true; }
      const r = resolveNick(p, a[0].value);
      if ("err" in r) { say(r.err); return true; }
      if (r.acc.playerId === p.playerId) { say("You cannot whisper to yourself."); return true; }
      say(sendWhisper(p, r.acc, t) ? `Whisper to ${r.acc.nickname}: ${t}` : `${r.acc.nickname} is unavailable.`);
      return true;
    }
    case "r": {
      const t = cleanChatText(cmd.rest(-1));
      if (!t) { say("Usage: /r <text>"); return true; }
      if (t.length > 60) { say("Text too long (maximum 60 characters)."); return true; }
      const nick = lastWhisperPartner(p);
      if (!nick) { say("Nobody to reply to."); return true; }
      if (await banState(p)) { say("You are muted."); return true; }
      const to = [...social.online.values()].find((x) => x.nickname === nick) ?? null;
      say(sendWhisper(p, to, t) ? `Whisper to ${nick}: ${t}` : `${nick} is unavailable.`);
      return true;
    }
    case "ping": {
      if (!room || room.state < RoomState.BATTLE_READY) { say("/ping is only available during a match."); return true; }
      const host = room.getSlot(room.leader), hostAcc = host && host.playerId > 0n ? room.svc.getAccount(host.playerId) : null;
      const me = pingOf(room, p.slotId), h = pingOf(room, room.leader);
      say(`Host: ${hostAcc?.nickname ?? "?"} (slot ${room.leader + 1}${room.leader === p.slotId ? ", you" : ""}). Ping: you ${me === 255 ? "?" : me}, host ${h === 255 ? "?" : h}.`);
      return true;
    }
    case "denunciar": {
      if (a.length < 2) { say("Usage: /denunciar <nick> <hack|chat> [details]"); return true; }
      const k = parseKind(a[1].value);
      if (!k) { say("Invalid type: use hack or chat."); return true; }
      const r = resolveNick(p, a[0].value);
      if ("err" in r) { say(r.err); return true; }
      const res = await submitReport(p, r.acc, k.kinds, cmd.rest(1));
      if (res.err !== 0) say(REPORT_TEXT()[res.err] ?? REPORT_TEXT()[REPORT_ERR.fail]);
      else say(res.ignored ? "Report ignored: you cannot report yourself or a GM." : `Report submitted against ${r.acc.nickname}. Reports remaining: ${res.left}.`);
      return true;
    }
    case "votekick": {
      if (!room || room.state !== RoomState.BATTLE) { say("Kick voting is only available during a match."); return true; }
      if (a.length < 2) { say("Usage: /votekick <nick> <hack|chat>"); return true; }
      const k = parseKind(a[1].value);
      if (!k) { say("Invalid reason: use hack or chat."); return true; }
      const r = resolveNick(p, a[0].value, true);
      if ("err" in r) { say(r.err); return true; }
      let acked = false;
      const err = startKickVote(p, r.acc.slotId, k.motive, () => { acked = true; client?.session.send(rp.errAck(5191, 0)); });
      if (!acked) client?.session.send(rp.errAck(5191, err));
      say(err === 0 ? `Kick vote started against ${r.acc.nickname}. Vote with /sim or /nao.` : KICK_TEXT()[err] ?? KICK_TEXT()[KICK_ERR.fail]);
      return true;
    }
    case "votelider": {
      if (!room) { say("You must be in a room."); return true; }
      if (room.state === RoomState.READY) {
        // out of battle: 3611 REQUEST_MAIN, a vote to take the leadership for yourself
        const r = a.length ? resolveNick(p, a[0].value, true) : { acc: p };
        if ("err" in r) { say(r.err); return true; }
        if (r.acc.playerId !== p.playerId) { say("In a room, /votelider requests host status for yourself."); return true; }
        if (room.leader === p.slotId) { say("You are already the host."); return true; }
        if (client) handleRequestMain(client);
        say("Host request sent to the room.");
        return true;
      }
      if (room.state !== RoomState.BATTLE) { say("Host voting is only available in a room or during a match."); return true; }
      let slot = 255;
      if (a.length) { const r = resolveNick(p, a[0].value, true); if ("err" in r) { say(r.err); return true; } slot = r.acc.slotId; }
      let acked = false;
      const err = startLeaderVote(p, slot, () => { acked = true; client?.session.send(rp.errAck(9011, 0)); });
      if (!acked) client?.session.send(rp.errAck(9011, err));
      say(err === 0 ? "Host vote started. Vote with /sim or /nao." : LEADER_TEXT()[err] ?? LEADER_TEXT()[LEADER_ERR.fail]);
      return true;
    }
    case "sim": case "nao": {
      const v = room ? activeVote(room) : null;
      if (!room || !v) { say("No vote in progress."); return true; }
      const yes = cmd.name === "sim";
      const err = v.kind === "kick" ? castKickVote(p, yes) : castLeaderVote(p, yes);
      say(err === 0 ? "Vote recorded." : err === KICK_ERR.voted ? "You have already voted." : "You cannot vote now.");
      return true;
    }
    default:
      say("Unknown command. Type /ajuda.");
      return true;
  }
}
