const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');
const { memoryDb } = require('./pitch-memory-db.cjs');
const id = 'd3b44258-de3d-4395-90d7-e90f014e1a66', token = 'ab'.repeat(32);
const first = { pitchData: { companyName: 'Archive test' }, messages: [{role:'ai',text:'Question one',questionNumber:1}],
 currentQuestion:1,followUpsThisQuestion:0,draftAnswer:'',hasStarted:true,finished:false,pendingQuestion:false,
 revision:1,startedAt:'2026-11-27T16:00:00Z',finishedAt:null };
function setup(){ const db=memoryDb(); const mocks={'@/lib/pitch-storage':db.storage}; return {db,mocks,lib:loadTs('src/lib/pitch-session.ts',mocks)}; }
test('accepted answers are archived incrementally, late drafts cannot erase them, and another token cannot retrieve them',async()=>{
 const s=setup(); await s.lib.savePitchSession(id,token,first);
 const answer={...first,revision:3,messages:[...first.messages,{role:'user',text:'Customer proof',questionNumber:1}],pendingQuestion:true};
 await s.lib.savePitchSession(id,token,answer);
 await s.lib.savePitchSession(id,token,{...first,revision:2,draftAnswer:'Older draft'});
 assert.deepEqual((await s.lib.loadPitchSession(id,token)).state.messages,answer.messages);
 assert.equal(await s.lib.loadPitchSession(id,'cd'.repeat(32)),null);
 await assert.rejects(s.lib.savePitchSession(id,'cd'.repeat(32),answer),/not found/);
 await assert.rejects(s.lib.savePitchSession(id,token,{...first,revision:4,messages:[{role:'ai',text:'Replacement'}]}),/another tab/);
 assert.notEqual(s.db.rows('pitch_sessions').get(id).access_token_hash,token);
});
test('completion starts the saved report exactly once and cannot be undone by a late autosave',async()=>{
 const s=setup(); await s.lib.savePitchSession(id,token,first);
 const finished={...first,currentQuestion:7,finished:true,finishedAt:'2026-11-27T16:02:00Z',revision:5,
 messages:[...first.messages,{role:'ai',text:'Your closing pitch?',questionNumber:7},{role:'user',text:'Why now, why us and why investment.',questionNumber:7}]};
 const tasks=[],calls=[];
 const {POST}=loadTs('src/app/api/pitch-session/route.ts',{...s.mocks,'@vercel/functions':{waitUntil:promise=>tasks.push(promise)},
 '@ /unused':{},'@/lib/pitch-report-job':{runPitchReportJob:async payload=>{calls.push(payload);return {ok:true,status:'processing'};}}});
 const request=state=>new Request('https://www.voicereach.io/api/pitch-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',reportId:id,accessToken:token,state})});
 const results=await Promise.all([POST(request(finished)),POST(request(finished))]);
 for(const response of results)assert.equal((await response.json()).ok,true);
 await Promise.all(tasks);assert.equal(calls.length,1);assert.equal(calls[0].id,id);assert.match(calls[0].input,/Why now, why us/);
 await s.lib.savePitchSession(id,token,{...first,revision:10});
 assert.equal((await s.lib.loadPitchSession(id,token)).status,'completed');
 assert.equal(s.db.rows('pitch_sessions').get(id).conversation.at(-1).questionNumber,7);
});
test('a mismatched browser origin cannot save a session or trigger paid report generation',async()=>{
 const s=setup();let calls=0;
 const {POST}=loadTs('src/app/api/pitch-session/route.ts',{...s.mocks,'@vercel/functions':{waitUntil(){}},'@/lib/pitch-report-job':{runPitchReportJob:async()=>calls++}});
 const response=await POST(new Request('https://www.voicereach.io/api/pitch-session',{method:'POST',headers:{origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({action:'save',reportId:id,accessToken:token,state:first})}));
 assert.equal(response.status,403);assert.equal(calls,0);assert.equal(s.db.rows('pitch_sessions').size,0);
});
