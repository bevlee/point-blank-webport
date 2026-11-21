// [web] Dedicated match host: the Server.Match port (src/host/matchCore.ts) runs in the server process, one core per running
// battle, instead of in the room leader's tab. Every player (the leader too) opens one WebSocket:
//   ws://HOST:<web port>/match?room=<uniqueRoomId hex>-<roomSeed hex>&slot=<0..17>
// 1st frame (text) {t:"auth", ticket} (the same /signal ticket Server.Game mints at PRESTARTBATTLE for that account and slot);
// then binary frames both ways = the Server.Match datagrams MatchLink already speaks. Text frame {t:"close", code, reason}
// from the server = why the link ends (1001 = match over).
// Authority: the core applies player hits (ObjectType.User, MatchCore.simpleDeath), keeps HP and declares deaths. Its "death"
// goes straight to Server.Game (applyCoreDeath in roomHandlers.ts) instead of a client DEATH_REQ.
// Not server-side yet: the AI seats. The room leader's client still simulates the bots and sends their records (hostPeer).
// PB_MATCH_MODE=p2p brings back the leader-hosted WebRTC match.
// [RECRIADO] Not in the original: Server.Match runs over UDP. A WebSocket is TCP, so a lost state packet delays the ones behind it.
import { readFileSync } from "node:fs";
import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type RawData, type WebSocket } from "ws";
import { MatchCore, type GameSyncOut, type MatchData, type RespawnSyncIn } from "../../../src/host/matchCore.ts";
import { serverEnv } from "../config.ts";
import { readSignalTicket } from "../web/signalTicket.ts";
import { signalGate } from "../web/signal.ts";

export type MatchMode = "server" | "p2p";
export const matchMode = (): MatchMode => (serverEnv("PB_MATCH_MODE", "server") === "p2p" ? "p2p" : "server");

const ROOM_RE = /^[0-9a-f]{1,8}-[0-9a-f]{1,8}$/;
const AUTH_MS = 5000;
/** the client caps a datagram at 8096 B (src/p2p/channels.ts MAX_DATAGRAM) */
const MAX_DGRAM = 8192;
/** datagrams per second per socket: the client sends ~20-60 state packets/s plus events, the leader also the bots' */
const RATE = 400, BURST = 800;

let data: MatchData | null = null;
function matchData(): MatchData {
  return (data ??= JSON.parse(readFileSync(new URL("../../../src/host/data/matchData.json", import.meta.url), "utf8")) as MatchData);
}

/** what Server.Game tells the match host (set by gameServer.ts, like signalGate) */
export const matchHooks: {
  /** the room leader's slot of the battle with this key, -1 = none / no such battle */
  leader: ((key: string) => number) | null;
  /** Match -> Game (SendMatchInfo): deaths, objective bars */
  game: ((key: string, m: GameSyncOut) => void) | null;
} = { leader: null, game: null };

interface Peer { id: number; ws: WebSocket; slot: number; tokens: number; last: number }

class HostedMatch {
  readonly core: MatchCore;
  readonly peers = new Map<number, Peer>();
  /** first RESPAWN of each slot this battle: EquipmentSync type 0, then 2 */
  readonly spawned = new Set<number>();
  /** each slot's last RespawnSync: a slot whose link dropped is reset by the core (peerClosed) and re-armed from it */
  readonly lastRespawn = new Map<number, RespawnSyncIn>();
  startTick = 0;
  readonly key: string;
  constructor(key: string, uid: number, seed: number, opts: { barefistOnly: boolean }, log: (l: string) => void) {
    this.key = key;
    this.core = new MatchCore({
      send: (peer, d) => {
        const p = this.peers.get(Number(peer.slice(1)));
        if (p && p.ws.readyState === p.ws.OPEN) p.ws.send(d);
      },
      game: (m) => matchHooks.game?.(key, m),
      log: (l) => log(`match ${key}: ${l}`),
      warn: (l) => log(`match ${key}: ${l}`),
      kick: (peer, reason) => queueMicrotask(() => {
        const p = this.peers.get(Number(peer.slice(1)));
        if (p) closeWith(p.ws, 4003, `anti-cheat: ${reason}`);
      }),
    }, {
      data: matchData(),
      ...(opts.barefistOnly ? { config: { barefistOnly: true } } : {}),
      allowRoom: (u, s) => u === uid && s === seed,
      // the leader's socket also carries the AI seats' records (its client runs the bots)
      hostPeer: (peer) => this.peers.get(Number(peer.slice(1)))?.slot === (matchHooks.leader?.(key) ?? -1),
    });
  }
}

const matches = new Map<string, HostedMatch>();
let nextPeer = 1;
const keyOf = (uid: number, seed: number) => `${(uid >>> 0).toString(16)}-${(seed >>> 0).toString(16)}`;

function closeWith(ws: WebSocket, code: number, reason: string): void {
  try { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ t: "close", code, reason })); } catch { /* closing anyway */ }
  ws.close(code === 1001 ? 1000 : code, reason.slice(0, 120));
}

export const matchStats = () => ({ matches: matches.size, peers: [...matches.values()].reduce((n, m) => n + m.peers.size, 0) });

// ---------------------------------------------------------------------------------------------- Server.Game -> match

/** a battle abandoned without ENDBATTLE (every player gone, room closed): its core is dropped on the next sweep */
const SWEEP_MS = 30000;
let sweeper: ReturnType<typeof setInterval> | null = null;
function sweep(): void {
  for (const m of [...matches.values()]) {
    if ((matchHooks.leader?.(m.key) ?? 0) >= 0) continue;
    matches.delete(m.key);
    for (const p of m.peers.values()) closeWith(p.ws, 4004, "NO_MATCH");
  }
}

/** PRESTARTBATTLE of the battle: the core exists before any player links up (respawns may come first) */
export function matchOpen(uid: number, seed: number, opts: { barefistOnly: boolean }, log: (l: string) => void): void {
  if (matchMode() !== "server") return;
  sweeper ??= setInterval(sweep, SWEEP_MS);
  sweeper.unref?.();
  const key = keyOf(uid, seed);
  if (!matches.has(key)) { matches.set(key, new HostedMatch(key, uid >>> 0, seed >>> 0, opts, log)); log(`match ${key}: hosted on the server`); }
}

/** STARTBATTLE: the room's StartTick (only its increase matters to the core) */
export function matchStartTick(uid: number, seed: number): void {
  const m = matches.get(keyOf(uid, seed));
  if (m && !m.startTick) m.startTick = Date.now();
}

/** RESPAWN_ACK of a slot -> RespawnSync */
export function matchRespawn(uid: number, seed: number, s: Omit<RespawnSyncIn, "uniqueRoomId" | "roomSeed" | "startTick" | "type" | "round">): void {
  const m = matches.get(keyOf(uid, seed));
  if (!m) return;
  m.startTick ||= Date.now();
  const sync: RespawnSyncIn = { ...s, uniqueRoomId: uid >>> 0, roomSeed: seed >>> 0, startTick: m.startTick, type: m.spawned.has(s.slot) ? 2 : 0, round: 1 };
  m.core.respawnSync(sync);
  m.spawned.add(s.slot);
  m.lastRespawn.set(s.slot, sync);
}

/** the slot left the battle (give up, kick, disconnect): its link goes, its core slot is reset */
export function matchRemoveSlot(uid: number, seed: number, slot: number, code = 4004, reason = "NOT_IN_MATCH"): void {
  const m = matches.get(keyOf(uid, seed));
  if (!m) return;
  for (const p of [...m.peers.values()]) if (p.slot === slot) closeWith(p.ws, code, reason);
  const r = m.core.rooms[0];
  if (r) m.core.removePlayerSync(r.uniqueRoomId, r.roomSeed, slot, 1);
  m.spawned.delete(slot);
  m.lastRespawn.delete(slot);
}

/** ENDBATTLE: every link closes with 1001 (match over) and the core goes */
export function matchEnd(uid: number, seed: number, reason = "ENDBATTLE"): void {
  const key = keyOf(uid, seed), m = matches.get(key);
  if (!m) return;
  matches.delete(key);
  for (const p of m.peers.values()) closeWith(p.ws, 1001, reason);
}

/** server-authoritative HP of a slot (tests, /health debugging) */
export function matchLife(uid: number, seed: number, slot: number): { life: number; dead: boolean } | null {
  const p = matches.get(keyOf(uid, seed))?.core.rooms[0]?.players.find((x) => x.slot === slot && x.client);
  return p ? { life: p.life, dead: p.dead } : null;
}

// ---------------------------------------------------------------------------------------------- /match sockets

/** A bare /match route on `server` (the P2P-style tests; the real front is web/webServer.ts with its origin / IP checks). */
export function listenMatch(server: HttpServer, log: (msg: string) => void = () => {}): () => void {
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 64 * 1024 });
  server.on("upgrade", (req, socket, head) => {
    const url = URL.parse(req.url ?? "/", "http://x");
    if (url?.pathname !== "/match") { socket.end("HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n"); return; }
    wss.handleUpgrade(req, socket, head, (ws) => handleMatch(ws, url, log));
  });
  return () => wss.close();
}

export function handleMatch(ws: WebSocket, url: URL, log: (msg: string) => void): void {
  const key = url.searchParams.get("room") ?? "";
  const slot = Number(url.searchParams.get("slot"));
  ws.on("error", () => ws.close());
  if (!ROOM_RE.test(key) || !Number.isInteger(slot) || slot < 0 || slot > 17) { ws.close(4000, "bad room / slot"); return; }
  const timer = setTimeout(() => ws.close(4005, "NO_TICKET"), AUTH_MS);
  timer.unref?.();
  ws.once("close", () => clearTimeout(timer));
  ws.once("message", (raw: RawData, isBinary: boolean) => {
    clearTimeout(timer);
    let msg: { t?: unknown; ticket?: unknown } | null = null;
    try { msg = isBinary ? null : JSON.parse(String(raw)); } catch { /* refused below */ }
    const t = msg?.t === "auth" ? readSignalTicket(msg.ticket) : null;
    if (!t || t.key !== key || t.slot !== slot) { ws.close(4005, "BAD_TICKET"); return; }
    if (signalGate.allow && !signalGate.allow(key, "guest", slot, t.playerId)) { ws.close(4004, "NOT_IN_MATCH"); return; }
    const m = matches.get(key);
    if (!m) { ws.close(4004, "NO_MATCH"); return; }
    attach(m, ws, slot, log);
  });
}

function attach(m: HostedMatch, ws: WebSocket, slot: number, log: (msg: string) => void): void {
  // one link per slot: a reconnect replaces the old one
  for (const old of [...m.peers.values()]) if (old.slot === slot) { m.peers.delete(old.id); m.core.peerClosed(`p${old.id}`); closeWith(old.ws, 4001, "replaced"); }
  const p: Peer = { id: nextPeer++, ws, slot, tokens: BURST, last: Date.now() };
  m.peers.set(p.id, p);
  // a reconnect: the core parks this until the slot's REGISTER (65) lands (MatchCore pendingRespawn)
  const last = m.lastRespawn.get(slot);
  if (last) m.core.respawnSync({ ...last, type: 2 });
  ws.send(JSON.stringify({ t: "ready" }));
  log(`match ${m.key}: slot ${slot} linked (${m.peers.size} peer(s))`);
  ws.on("message", (raw: RawData, isBinary: boolean) => {
    if (!isBinary) return;
    const now = Date.now();
    p.tokens = Math.min(BURST, p.tokens + ((now - p.last) / 1000) * RATE);
    p.last = now;
    if (--p.tokens < 0) { closeWith(ws, 1008, "RATE_LIMITED"); return; }
    const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw as ArrayBuffer);
    if (buf.length > MAX_DGRAM) { closeWith(ws, 1009, "datagram too big"); return; }
    const d = new Uint8Array(buf.buffer, buf.byteOffset, buf.length);
    // a player speaks for its own slot; only the leader's link may carry other slots (its bots: MatchCore.hostPeer)
    if (d.length > 1 && d[1] !== slot && (matchHooks.leader?.(m.key) ?? -1) !== slot) return;
    try { m.core.receive(`p${p.id}`, d); } catch (e) { log(`match ${m.key}: slot ${slot} datagram failed: ${(e as Error).message}`); }
  });
  ws.on("close", () => {
    if (m.peers.get(p.id) !== p) return;
    m.peers.delete(p.id);
    m.core.peerClosed(`p${p.id}`);
    log(`match ${m.key}: slot ${slot} unlinked`);
  });
}
