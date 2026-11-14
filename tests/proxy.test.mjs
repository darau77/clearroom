import test from 'node:test';
import assert from 'node:assert/strict';
import {engineProxy} from '../lib/engine-proxy.ts';
const env={BREV_API_URL:'https://engine.example',BREV_API_KEY:'server-only-secret'};
test('unconfigured backend is explicitly sample mode',async()=>{
 const r=await engineProxy(new Request('https://app.example/api/status'),{});
 assert.deepEqual(await r.json(),{ready:false,mode:'sample'});
});
test('cross-origin inference rejected',async()=>{
 const r=await engineProxy(new Request('https://app.example/api/engine/chat',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(r.status,403);
});
test('request cannot choose upstream URL or route',async()=>{
 const r=await engineProxy(new Request('https://app.example/api/engine/arbitrary',{method:'POST',body:'{}'}),env);
 assert.equal(r.status,404);
});
test('oversized bodies are rejected even without length header',async()=>{
 const r=await engineProxy(new Request('https://app.example/api/engine/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(64001)}),env);
 assert.equal(r.status,413);
});
test('credential is sent only upstream; stream stays unbuffered',async()=>{
 const original=globalThis.fetch;
 try{
 globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://engine.example/chat');
 assert.equal(options.headers.Authorization,'Bearer server-only-secret');
 return new Response('{"token":"Hello"}\n',{headers:{'Content-Type':'application/x-ndjson'}});
 };
 const r=await engineProxy(new Request('https://app.example/api/engine/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(await r.text(),'{"token":"Hello"}\n');
 assert.equal(r.headers.get('Authorization'),null);
 }finally{globalThis.fetch=original;}
});

test('original browser host is accepted behind the local Next server and busy retry is preserved',async()=>{
 const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response(JSON.stringify({detail:'Busy; retry.'}),{status:429,headers:{'Retry-After':'5'}});
 const r=await engineProxy(new Request('http://localhost:3101/api/engine/chat',{method:'POST',headers:{Host:'127.0.0.1:3101',Origin:'http://127.0.0.1:3101','Content-Type':'application/json'},body:'{}'}),env);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'5');
 }finally{globalThis.fetch=original;}
});
