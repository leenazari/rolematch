const {test}=require('node:test');
const assert=require('node:assert/strict');
const React=require('react');
const {create,act}=require('react-test-renderer');
const {loadTs}=require('./load-ts.cjs');
const fixture=require('./pitch-insights.fixture.cjs');
const access={reportId:'d3b44258-de3d-4395-90d7-e90f014e1a66',accessToken:'ab'.repeat(32)};
function browser(t){const original={sessionStorage:global.sessionStorage,localStorage:global.localStorage,fetch:global.fetch};
 const session=new Map(),local=new Map(),requests=[],destinations=[];let archived=null,failSave=false,quota=false;
 const store=map=>({getItem:key=>map.get(key)||null,setItem:(key,value)=>{if(quota&&map===session)throw Error('QuotaExceededError');map.set(key,value);},removeItem:key=>map.delete(key)});
 global.sessionStorage=store(session);global.localStorage=store(local);
 global.fetch=async(url,options)=>{const body=JSON.parse(options.body);requests.push({url,body});
  if(url!=='/api/pitch-session')throw Error('Closing must not depend on another question or voice request');
  if(body.action==='load')return{ok:true,json:async()=>({ok:true,session:archived?{state:archived}:null})};
  archived=structuredClone(body.state);if(failSave){failSave=false;throw Error('Connection interrupted after saving');}
  return{ok:true,json:async()=>({ok:true,session:{state:archived}})};};
 t.after(()=>Object.assign(global,original));
 const router={push:url=>destinations.push(url)};
 const client=()=>loadTs('src/lib/pitch-session-client.ts');
 function page(sessionClient){return loadTs('src/app/pitch/conversation/page.tsx',{
  'next/navigation':{useRouter:()=>router},'@vercel/analytics':{track(){throw Error('Analytics blocked');}},
  '@/lib/pitch-session-client':sessionClient,
  '@/hooks/useInterviewRecorder':{useInterviewRecorder:()=>({supported:false,status:'idle',liveText:'',liveStatus:'unavailable',reset(){}})},
  '@/hooks/usePitchSpeechSynthesis':{usePitchSpeechSynthesis:()=>({speaking:false,stopSpeaking(){},speak(){throw Error('Final speech must not gate saving');}})},
  '@/components/VoiceOrb':()=>null}).default;}
 const state={pitchData:{companyName:'Recovery demo'},messages:[{role:'ai',text:'Give your 30-second closing pitch.',questionNumber:7}],
 currentQuestion:7,followUpsThisQuestion:0,draftAnswer:'',hasStarted:true,finished:false,pendingQuestion:false,
 revision:6,startedAt:'2026-11-27T16:00:00Z',finishedAt:null};
 return{session,local,requests,destinations,router,client,page,state,set failSave(value){failSave=value;},set quota(value){quota=value;},get archived(){return archived;}};
}
const button=(view,label)=>view.root.findAllByType('button').find(node=>node.children.join('')===label);
test('closing is saved before navigation without voice callbacks, and a fresh tab resumes the finished report',async t=>{
 const b=browser(t),client=b.client();client.checkpointPitch(b.state,access);let view;
 await act(async()=>{view=create(React.createElement(b.page(client)));});
 await act(async()=>button(view,'Type my answer').props.onClick());
 const closing='Investment funds the next customer milestone. Our real evidence makes the product different.';
 act(()=>view.root.findByType('textarea').props.onChange({target:{value:closing}}));
 await act(async()=>button(view,'Send my answer').props.onClick());
 assert.equal(b.archived.finished,true);assert.equal(b.archived.messages.filter(m=>m.role==='user').length,1);
 assert.equal(b.archived.messages.find(m=>m.role==='user').text,closing);
 assert.deepEqual(b.destinations,['/pitch/results']);
 act(()=>view.unmount());b.session.clear();
 const reloaded=b.client();await act(async()=>{view=create(React.createElement(b.page(reloaded)));});
 assert.equal(reloaded.savedPitchSession().access.reportId,access.reportId);
 assert.equal(reloaded.savedPitchSession().state.messages.find(m=>m.role==='user').text,closing);
 assert.ok(!b.destinations.includes('/pitch'));assert.equal(b.destinations.at(-1),'/pitch/results');act(()=>view.unmount());
});
test('a reviewed closing draft survives a tab restart and storage quota errors without starting question one again',async t=>{
 const b=browser(t);const client=b.client();client.checkpointPitch({...b.state,draftAnswer:'My saved closing statement.'},access);
 b.session.clear();b.quota=true;const reloaded=b.client();let view;
 await act(async()=>{view=create(React.createElement(b.page(reloaded)));});
 assert.equal(view.root.findByType('textarea').props.value,'My saved closing statement.');
 assert.equal(button(view,'Start the conversation'),undefined);
 await act(async()=>button(view,'Send my answer').props.onClick());
 assert.equal(b.archived.messages.find(m=>m.role==='user').text,'My saved closing statement.');
 assert.equal(b.destinations.at(-1),'/pitch/results');act(()=>view.unmount());
});
test('a lost save acknowledgement can be retried without appending the closing answer twice',async t=>{
 const b=browser(t);b.client().checkpointPitch({...b.state,draftAnswer:'My complete closing answer.'},access);b.failSave=true;let view;
 await act(async()=>{view=create(React.createElement(b.page(b.client())));});
 await act(async()=>button(view,'Send my answer').props.onClick());
 assert.deepEqual(b.destinations,[]);assert.match(JSON.stringify(view.toJSON()),/Connection interrupted/);
 await act(async()=>button(view,'Continue saved pitch').props.onClick());
 assert.equal(b.archived.messages.filter(m=>m.role==='user').length,1);assert.equal(b.destinations.at(-1),'/pitch/results');act(()=>view.unmount());
});
test('results recover from the server despite missing tab data and a damaged cached report, without redirecting to the beginning',async t=>{
 const b=browser(t);const client=b.client();const saved=client.checkpointPitch({...b.state,finished:true,draftAnswer:'',revision:8,
 messages:[...b.state.messages,{role:'user',text:'The saved closing.',questionNumber:7}],finishedAt:'2026-11-27T16:02:00Z'},access);
 await client.persistPitchSession(saved);
 b.session.set('pitchperfect_data','{broken');b.session.set('pitchperfect_critique','{broken');b.quota=true;
 let started=0;const Page=loadTs('src/app/pitch/results/page.tsx',{'next/navigation':{useRouter:()=>b.router},
 '@/lib/pitch-session-client':b.client(),'@/lib/pitch-report-client':{...loadTs('src/lib/pitch-report-client.ts'),reportAccess:()=>access,claimReportView:async()=> 'open',loadPitchReport:async()=>{started++;return{data:fixture,generatedAt:'2026-11-27T16:03:00Z',pdfSaved:true};}}}).default;
 let view;await act(async()=>{view=create(React.createElement(Page));});
 assert.equal(started,1);assert.match(JSON.stringify(view.toJSON()),/Market and competitors/);assert.deepEqual(b.destinations,[]);
 act(()=>view.unmount());
});
test('an older recovery response cannot replace a closing draft typed while the request was in flight',async t=>{
 const b=browser(t),client=b.client();client.checkpointPitch(b.state,access);let release;
 global.fetch=async()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({ok:true,session:{state:b.state}})});});
 const recovery=client.recoverPitchSession();
 client.checkpointPitch({...b.state,revision:7,draftAnswer:'New words while reconnecting.'},access);
 release();const recovered=await recovery;
 assert.equal(recovered.state.draftAnswer,'New words while reconnecting.');
 assert.equal(client.savedPitchSession().state.revision,7);
});
test('a legacy founder email is ignored and never blocks or accompanies the closing answer',async t=>{
 const b=browser(t);b.client().checkpointPitch({...b.state,draftAnswer:'Only one closing answer.',recipientEmail:'not-an-email'},access);let view;
 await act(async()=>{view=create(React.createElement(b.page(b.client())));});
 assert.equal(view.root.findAllByType('input').filter(n=>n.props.type==='email').length,0);
 await act(async()=>button(view,'Send my answer').props.onClick());
 assert.equal(b.archived.messages.filter(m=>m.role==='user').length,1);
 assert.equal(Object.hasOwn(b.archived,'recipientEmail'),false);assert.deepEqual(b.destinations,['/pitch/results']);act(()=>view.unmount());
});
