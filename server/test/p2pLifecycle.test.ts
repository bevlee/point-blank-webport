// Real signaling sockets: failed match starts must release them so Ready/Start can be retried.
import { test } from "node:test";
import assert from "node:assert/strict";
import { WebSocketServer } from "ws";
import { WebSignaling } from "../../src/p2p/signaling.ts";
import { openP2P } from "../../src/p2p/session.ts";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function signalServer() {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  server.on("connection", (ws) => ws.once("message", () => ws.send(JSON.stringify({ t: "ready", ice: [], hostOnline: false }))));
  const address = server.address();
  if (typeof address === "string" || !address) throw new Error("missing test listener");
  return { server, url: `ws://127.0.0.1:${address.port}`, close: async () => {
    for (const ws of server.clients) ws.terminate();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  } };
}

test("host wait rejects with the signaling close instead of waiting for its deadline", async (t) => {
  const fixture = await signalServer(); t.after(fixture.close);
  const sig = new WebSignaling(fixture.url, "1-1", "guest", 1);
  await sig.ready;
  const waiting = sig.hostReady(200);
  for (const ws of fixture.server.clients) ws.close(4004, "NOT_IN_MATCH");
  await assert.rejects(waiting, /signaling closed.*NOT_IN_MATCH/);
});

test("failed guest start releases its signaling socket", async (t) => {
  const fixture = await signalServer(); t.after(fixture.close);
  await assert.rejects(openP2P({ serverUrl: fixture.url, session: { uniqueRoomId: 1, roomSeed: 1, slot: 1, accountId: 1 }, room: null, leader: false, hostWaitMs: 40 }), /not hosting/);
  await sleep(50);
  assert.equal(fixture.server.clients.size, 0, "no abandoned socket after a failed start");
});


test("an accepted but silent signaling connection has a bounded authentication wait", async (t) => {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.once("listening", resolve));
  t.after(async () => { for (const ws of server.clients) ws.terminate(); await new Promise<void>((resolve) => server.close(() => resolve())); });
  const address = server.address();
  if (typeof address === "string" || !address) throw new Error("missing test listener");
  const sig = new WebSignaling(`ws://127.0.0.1:${address.port}`, "1-1", "guest", 1, "", { readyTimeoutMs: 40 });
  await assert.rejects(sig.ready, /authentication timed out/);
  await sleep(50);
  assert.equal(server.clients.size, 0);
});

test("cancelling a pending guest start releases its signaling socket", async (t) => {
  const fixture = await signalServer(); t.after(fixture.close);
  const abort = new AbortController();
  const start = openP2P({ serverUrl: fixture.url, session: { uniqueRoomId: 1, roomSeed: 1, slot: 1, accountId: 1 }, room: null, leader: false, hostWaitMs: 2000, signal: abort.signal });
  setTimeout(() => abort.abort(), 30);
  await assert.rejects(start, /signaling closed|aborted/);
  await sleep(50);
  assert.equal(fixture.server.clients.size, 0);
});
