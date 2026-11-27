const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadTs}=require('./load-ts.cjs');
const {memoryDb}=require('./pitch-memory-db.cjs');
const id='d3b44258-de3d-4395-90d7-e90f014e1a66',token='ab'.repeat(32);
function setup(t,enabled){const db=memoryDb();const original={fetch:global.fetch,key:process.env.RESEND_API_KEY,enabled:process.env.PITCH_REPORT_EMAIL_ENABLED};
 process.env.RESEND_API_KEY='test-key';process.env.PITCH_REPORT_EMAIL_ENABLED=String(enabled);
 t.after(()=>{global.fetch=original.fetch;for(const [key,value]of [['RESEND_API_KEY',original.key],['PITCH_REPORT_EMAIL_ENABLED',original.enabled]]){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
 const {tokenHash}=loadTs('src/lib/pitch-access.ts');db.rows('pitch_reports').set(id,{id,company_name:'Archived demo',access_token_hash:tokenHash(token),pdf_path:id+'/full.pdf'});db.pdfs.set(id+'/full.pdf',Buffer.from('%PDF-full-report'));
 return{db,lib:loadTs('src/lib/pitch-report-email.ts',{'@/lib/pitch-storage':db.storage})};}
test('email requests are durable while sending is unconfigured and never claim to have sent',async t=>{
 const s=setup(t,false);global.fetch=async()=>{throw Error('Should not send before approval/configuration');};
 assert.equal(await s.lib.emailPitchReport(id,token,'founder@example.invalid'),'queued');
 assert.equal(await s.lib.emailPitchReport(id,token,'founder@example.invalid'),'queued');
 assert.equal(s.db.rows('pitch_email_outbox').size,1);assert.equal([...s.db.rows('pitch_email_outbox').values()][0].status,'awaiting_configuration');
 await assert.rejects(s.lib.emailPitchReport(id,'cd'.repeat(32),'founder@example.invalid'),/not found/);
 await assert.rejects(s.lib.emailPitchReport(id,token,'someone-else@example.invalid'),/already been requested/);
});
test('simultaneous delivery requests send the archived PDF once with an idempotency key',async t=>{
 const s=setup(t,true);const sent=[];global.fetch=async(url,options)=>{sent.push({url,options});return{ok:true,json:async()=>({id:'mail_accepted'})};};
 await Promise.all([s.lib.emailPitchReport(id,token,'founder@example.invalid'),s.lib.emailPitchReport(id,token,'founder@example.invalid')]);
 assert.equal(sent.length,1);const body=JSON.parse(sent[0].options.body);assert.equal(body.attachments.length,1);
 assert.equal(Buffer.from(body.attachments[0].content,'base64').toString(),'%PDF-full-report');assert.equal(body.to[0],'founder@example.invalid');
 assert.equal(sent[0].options.headers['Idempotency-Key'],'pitch-perfect/'+id+'/participant');
 assert.equal(await s.lib.emailPitchReport(id,token,'founder@example.invalid'),'sent');assert.equal(sent.length,1);
});
test('failed delivery keeps the PDF and retries only the same mail delivery',async t=>{
 const s=setup(t,true);const keys=[];global.fetch=async(_,options)=>{keys.push(options.headers['Idempotency-Key']);return{ok:false,json:async()=>({message:'Unavailable'})};};
 await assert.rejects(s.lib.emailPitchReport(id,token,'founder@example.invalid'),/needs a retry/);
 assert.equal([...s.db.rows('pitch_email_outbox').values()][0].status,'failed');assert.ok(s.db.pdfs.has(id+'/full.pdf'));
 global.fetch=async(_,options)=>{keys.push(options.headers['Idempotency-Key']);return{ok:true,json:async()=>({id:'mail_retry'})};};
 assert.equal(await s.lib.emailPitchReport(id,token,'founder@example.invalid'),'sent');assert.equal(keys[0],keys[1]);
});
test('a saved opt-in queues separate owner and participant copies even without a results-page request',async t=>{
 const s=setup(t,false);const {tokenHash}=loadTs('src/lib/pitch-access.ts');
 s.db.rows('pitch_sessions').set(id,{id,access_token_hash:tokenHash(token),state:{recipientEmail:'founder@example.invalid'}});
 await s.lib.queuePitchReportEmails(id);await s.lib.queuePitchReportEmails(id);
 const rows=[...s.db.rows('pitch_email_outbox').values()];assert.equal(rows.length,2);
 assert.deepEqual(rows.map(row=>row.recipient_role).sort(),['owner','participant']);
 assert.equal(rows.find(row=>row.recipient_role==='participant').recipient_email,'founder@example.invalid');
 assert.ok(rows.every(row=>row.status==='awaiting_configuration'));
});
test('a session with the same ID but another access token cannot redirect someone else’s report email',async t=>{
 const s=setup(t,false);const {tokenHash}=loadTs('src/lib/pitch-access.ts');
 s.db.rows('pitch_sessions').set(id,{id,access_token_hash:tokenHash('cd'.repeat(32)),state:{recipientEmail:'other@example.invalid'}});
 await s.lib.queuePitchReportEmails(id);
 const rows=[...s.db.rows('pitch_email_outbox').values()];assert.equal(rows.length,1);assert.equal(rows[0].recipient_role,'owner');
});
