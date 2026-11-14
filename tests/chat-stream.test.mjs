import test from 'node:test';
import assert from 'node:assert/strict';
import {readChatStream} from '../lib/chat-stream.ts';
const stream=(...parts)=>new ReadableStream({start(c){for(const part of parts)c.enqueue(new TextEncoder().encode(part));c.close();}});
test('only done commits a complete reply including a final line without newline',async()=>{let language='';assert.equal(await readChatStream(stream('{"language":"ru","token":"Привет"}\n','{"done":true}'),code=>language=code),'Привет');assert.equal(language,'ru');});
test('partial, empty, malformed and explicit error replies never succeed',async()=>{for(const parts of [['{"token":"partial"}\n'],['{"done":true}\n'],['{"token":"part"}\n{"done":'],['{"token":"part"}\n{"error":"Failed"}\n']])await assert.rejects(readChatStream(stream(...parts)));});
test('split chunks preserve the message and completion signal',async()=>{assert.equal(await readChatStream(stream('{"tok','en":"Hello"}\n{"do','ne":true}\n')),'Hello');});
