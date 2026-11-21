import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {isAllowedOrigin} from '../src/web/webServer.ts';

test('malformed HTTP and upgrade targets return 400 and leave the listener healthy',()=>{
 const child=spawnSync(process.execPath,[fileURLToPath(new URL('./httpBoundary.fixture.mjs',import.meta.url))],{encoding:'utf8',timeout:6000});
 assert.equal(child.status,0,child.stderr || String(child.error));
});
test('explicit origin allowlist excludes development exceptions',()=>{
 const allowed=['https://game.example'];
 assert.equal(isAllowedOrigin('https://game.example',allowed),true);
 for(const origin of ['https://untrusted.example:8000','http://localhost:8000','https://game.example.evil.test']) assert.equal(isAllowedOrigin(origin,allowed),false,origin);
});
test('default development origins are loopback only',()=>{
 for(const origin of ['http://localhost:8000','http://127.0.0.1:8001','http://[::1]:8000']) assert.equal(isAllowedOrigin(origin,[]),true,origin);
 for(const origin of ['https://untrusted.example:8000','http://192.168.0.5:8001','null']) assert.equal(isAllowedOrigin(origin,[]),false,origin);
});
