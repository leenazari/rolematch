const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./load-ts.cjs');
const {memoryDb}=require('./pitch-memory-db.cjs');
const id='d3b44258-de3d-4395-90d7-e90f014e1a66';
function setup(t,enabled){
 const db=memoryDb(), original=global.fetch;
 const env={RESEND_API_KEY:'test-key',PITCH_REPORT_EMAIL_ENABLED:String(enabled),PITCH_REPORT_OWNER_EMAIL:'owner@example.invalid'};
 const old=new Map(Object.keys(env).map(k=>[k,process.env[k]]));Object.assign(process.env,env);
 t.after(()=>{global.fetch=original;for(const [k,v] of old){if(v===undefined)delete process.env[k];else process.env[k]=v;}});
 db.rows('pitch_reports').set(id,{id,company_name:'Archived demo',pdf_path:id+'/full.pdf'});
 db.pdfs.set(id+'/full.pdf',Buffer.from('%PDF-full-report'));
 db.rows('pitch_sessions').set(id,{id,state:{recipientEmail:'retired-founder@example.invalid'}});
 return {db,send:loadTs('src/lib/pitch-report-email.ts',{'@/lib/pitch-storage':db.storage}).queueOwnerPitchEmail};
}
test('a completed report queues only its owner and never sends while owner delivery is disabled',async t=>{
 const s=setup(t,false);global.fetch=async()=>assert.fail('No mail should be sent.');
 assert.equal(await s.send(id),'queued');assert.equal(await s.send(id),'queued');
 const rows=[...s.db.rows('pitch_email_outbox').values()];assert.equal(rows.length,1);
 assert.equal(rows[0].recipient_role,'owner');assert.equal(rows[0].status,'awaiting_configuration');
});
test('only the configured owner gets one PDF, without CC or BCC, even with a legacy founder opt-in',async t=>{
 const s=setup(t,true),sent=[];global.fetch=async(_,o)=>{sent.push(o);return Response.json({id:'test-only'});};
 await Promise.all([s.send(id),s.send(id)]);assert.equal(await s.send(id),'sent');
 assert.equal(sent.length,1);
 const body=JSON.parse(sent[0].body);assert.deepEqual(body.to,['owner@example.invalid']);
 assert.ok(!Object.hasOwn(body,'cc') && !Object.hasOwn(body,'bcc'));
 assert.equal(body.attachments.length,1);assert.equal(Buffer.from(body.attachments[0].content,'base64').toString(),'%PDF-full-report');
 assert.equal(sent[0].headers['Idempotency-Key'],'pitch-perfect/'+id+'/owner');
 assert.deepEqual([...s.db.rows('pitch_email_outbox').values()].map(r=>r.recipient_role),['owner']);
});
test('a failed owner delivery can retry the same archived PDF without readdressing it',async t=>{
 const s=setup(t,true),keys=[];global.fetch=async(_,o)=>{keys.push(o.headers['Idempotency-Key']);return Response.json({},{status:503})};
 await assert.rejects(s.send(id),/needs a retry/);
 global.fetch=async(_,o)=>{keys.push(o.headers['Idempotency-Key']);return Response.json({id:'retried'})};
 assert.equal(await s.send(id),'sent');assert.equal(keys[0],keys[1]);
});
test('the retired guest route returns Gone without reading an email or contacting a provider',async t=>{
 const old=global.fetch;t.after(()=>{global.fetch=old});global.fetch=async()=>assert.fail('Provider must not be called');
 const {POST}=loadTs('src/app/api/email-pitch-report/route.ts');
 const res=await POST({json(){assert.fail('Guest email must not be collected');}});assert.equal(res.status,410);
 assert.match((await res.json()).error,/download-only/);
});
