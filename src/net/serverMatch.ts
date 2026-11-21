// The server-hosted match (server/src/match/serverMatch.ts): a MatchTransport over one WebSocket to the server's /match route.
// Every player, the room leader too, links this way when the battle's ticket frame says match "server". Datagrams are the
// Server.Match ones MatchLink speaks; the server's text frame {t:"close", code, reason} says why the link ends (1001 = match over).
// [RECRIADO] A WebSocket is ordered and reliable, so `reliable` is ignored: every datagram arrives, in order.
import type { MatchTransport } from "./matchTransport.ts";
import type { MatchSession } from "./matchUdpLink.ts";

const key = (s: MatchSession) => `${(s.uniqueRoomId >>> 0).toString(16)}-${(s.roomSeed >>> 0).toString(16)}`;
/** state packets are dropped (not queued) while this much is still unsent: a slow link must not fall seconds behind */
const STATE_HIGH_WATER = 64 * 1024;

export class ServerMatchTransport implements MatchTransport {
  onopen: (() => void) | null = null;
  onmessage: ((data: Uint8Array, reliable: boolean) => void) | null = null;
  onclose: ((reason: string) => void) | null = null;
  onerror: ((err: Error) => void) | null = null;
  private ready = false;
  private done = false;
  private closeWhy: string | null = null;
  private readonly ws: WebSocket;

  private constructor(ws: WebSocket) { this.ws = ws; }

  /** Opens /match and authenticates with the battle ticket; resolves once the server bound the link to our slot. */
  static connect(serverUrl: string, session: MatchSession, opts: { signal?: AbortSignal; timeoutMs?: number; WebSocket?: typeof WebSocket } = {}): Promise<ServerMatchTransport> {
    opts.signal?.throwIfAborted();
    if (!session.signalTicket) return Promise.reject(new Error("server match: no battle ticket"));
    const WS = opts.WebSocket ?? globalThis.WebSocket;
    const url = `${serverUrl.replace(/\/+$/, "")}/match?room=${key(session)}&slot=${session.slot}`;
    const t = new ServerMatchTransport(new WS(url));
    t.ws.binaryType = "arraybuffer";
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => fail("timed out"), opts.timeoutMs ?? 10000);
      const abort = () => fail("match start cancelled");
      opts.signal?.addEventListener("abort", abort, { once: true });
      const cleanup = () => { clearTimeout(timer); opts.signal?.removeEventListener("abort", abort); };
      const fail = (why: string) => { if (t.ready) return; cleanup(); t.done = true; try { t.ws.close(); } catch { /* ignore */ } reject(new Error(`server match: ${why}`)); };
      t.ws.onopen = () => t.ws.send(JSON.stringify({ t: "auth", ticket: session.signalTicket }));
      t.ws.onmessage = (e) => {
        if (typeof e.data !== "string") {
          if (t.ready) t.onmessage?.(new Uint8Array(e.data as ArrayBuffer), true);
          return;
        }
        let m: { t?: unknown; code?: unknown; reason?: unknown };
        try { m = JSON.parse(e.data); } catch { return; }
        if (m.t === "ready" && !t.ready) { t.ready = true; cleanup(); resolve(t); }
        else if (m.t === "close") t.closeWhy = `${typeof m.code === "number" ? m.code : 1000} ${typeof m.reason === "string" ? m.reason : ""}`;
      };
      t.ws.onclose = (e) => {
        if (!t.ready) { fail(`refused (${e.code} ${e.reason})`); return; }
        t.finish(t.closeWhy ?? `${e.code} ${e.reason || "link closed"}`);
      };
      t.ws.onerror = () => { if (!t.ready) fail("connection error"); };
    });
  }

  get isOpen(): boolean { return this.ready && !this.done && this.ws.readyState === 1; }

  send(data: Uint8Array, reliable: boolean): void {
    if (!this.isOpen) return;
    if (!reliable && this.ws.bufferedAmount > STATE_HIGH_WATER) return;
    this.ws.send(data as Uint8Array<ArrayBuffer>);
  }

  private finish(why: string): void {
    if (this.done) return;
    this.done = true;
    this.onclose?.(why);
  }

  close(): void {
    // let a queued UNREGISTER (67) leave before the socket goes
    setTimeout(() => { try { this.ws.close(1000, "closed"); } catch { /* ignore */ } this.finish("closed"); }, 200);
  }
}
