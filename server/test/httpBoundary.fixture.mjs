import assert from 'node:assert/strict';
import net from 'node:net';
import {startWebServer} from '../src/web/webServer.ts';
const server=await startWebServer({},'127.0.0.1',0);
const address=server.address();
if(!address || typeof address==='string') throw new Error('Missing listener');
const request=(headers)=>new Promise((resolve,reject)=>{
 const socket=net.connect(address.port,'127.0.0.1',()=>socket.write(headers));
 let reply='';socket.on('data',b=>{reply+=b.toString()});socket.on('end',()=>resolve(reply));socket.on('error',reject);
 socket.setTimeout(2000,()=>socket.destroy(new Error('Request timed out')));
});
try {
 for(const upgrade of [false,true]) {
  const reply=await request('GET http://[ HTTP/1.1\r\nHost: localhost\r\n'+(upgrade?'Connection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n':'Connection: close\r\n')+'\r\n');
  assert.match(reply,/^HTTP\/1\.1 400 /);
  const health=await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(health.status,200);assert.equal((await health.json()).ok,true);
 }
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
