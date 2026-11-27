# RoleMatch and Pitch Perfect

Pitch Perfect is at `/pitch` in this Next.js app.

## Setup

1. Use Node.js 24 (matching the Vercel runtime pinned in `package.json`) and run `npm install`.
2. Copy `.env.example` to `.env.local` and set the API keys.
3. Run `npm run dev`.

The hosted AI features in this project use one server-side OpenAI key. Both
interviewers use `gpt-6.2-astra` with medium reasoning to choose the next question
from the source document and the conversation. Set `OPENAI_INTERVIEW_MODEL` to
override it. Upload extraction and career recommendations default to `gpt-6.2-sol`
with low reasoning and use the separate `OPENAI_TEXT_MODEL` override. Both model
settings require Responses and strict Structured Outputs. Calls use bounded
output, no automatic retries, and `store: false`.

Pitch reports use the OpenAI Responses API with `gpt-6.1-sol` by default. Set
`OPENAI_API_KEY` in the hosting project's **Production** and **Preview** environments
before deploying this change. Set `OPENAI_PITCH_REPORT_MODEL` to override the report
model with a Responses/Structured Outputs model that supports low reasoning effort
and live web search. The report key must allow the Responses API and web search.
Spoken questions use the same key with OpenAI Realtime access. The server reads
the prepared question using `gpt-realtime-2.1-mini` (`OPENAI_VOICE_MODEL`), the
Cedar investor or Marin career adviser voice, and British English pronunciation.
Each utterance is bounded in input length, audio output and elapsed time.
If playback fails, an installed English device voice can read the same text.
If none is available, the question stays on screen and the interview continues.
The career interview also uses the shared OpenAI live/final recorder with career
vocabulary; users can review, edit or type answers without a browser dictation service.

Pitch Perfect records each answer with `MediaRecorder`, then sends the completed
audio to `/api/transcribe-pitch-audio` after Stop. It uses `gpt-4o-transcribe` and
the same server-side `OPENAI_API_KEY`; the key needs Audio transcription permission.
Set `OPENAI_PITCH_TRANSCRIPTION_MODEL` to override the model. This avoids Android
browser speech engines that emit repeated, cumulative recognition fragments.
Each recording is limited to three minutes and 3.5 MB. Audio is not saved by this
app and is released after transcription, Clear, a new recording, or navigation.
Failed uploads can be retried while the page remains open. Users can edit the
final transcript after Stop, add another recording, or type their whole answer.
Live words appear in the answer box through an OpenAI WebRTC transcription-only
session using `gpt-live-transcribe`. `/api/pitch-live-transcription` negotiates the
connection without exposing the API key. Live text is a preview; Stop replaces
that preview with the final recorded-audio transcript. The live connection closes
on Stop, Clear, recording errors and navigation. If live text is unavailable,
recording continues and the UI explains that the transcript will appear after Stop.

## Production credentials

Set `OPENAI_API_KEY`, `SUPABASE_SECRET_KEY` (or the legacy service-role key) and
`RESEND_API_KEY` as **Secret** variables in the project's Vercel settings. Never
use a `NEXT_PUBLIC_` name for a private credential. Use separate keys for Preview
and Production. Prefer a project-scoped OpenAI key and a sending-only Resend key
restricted to VoiceReach's verified sender domain. Non-secret settings such as
model names, sender addresses and email enablement flags can use Config.

Credential-bearing modules are server-only. The build checks public assets,
browser bundles/maps and prerendered page payloads for credential values and
known private-key formats. Error responses and logs omit raw provider details.
Restrict production deploy and environment-edit rights to trusted maintainers:
the server must still be able to use its configured credentials. To rotate,
save the replacement in Vercel, redeploy, verify a live request, then revoke the
old key at its provider. Moving an already shared key into Secret storage does
not revoke it.

The `protect_public_api_usage` migration adds a service-only atomic rate limiter
for paid requests and new sessions. It stores a daily keyed network alias, not
an IP address or credential. Public visitors cannot read or update the counters.
Unaffiliated origins are rejected, limits apply across function instances, and
paid requests pause if counting is unavailable. Saving answers to an existing
session, polling an existing report, and downloading a saved PDF do not consume a
generation allowance. Per-network limits reduce abuse but are not a billing cap.

## Saved reports

Conversations are archived while they happen, not only on the results page.
`pitch_sessions` holds the reviewed pitch brief, source excerpts if available, conversation and in-progress draft,
question number, pending question state, timestamps and revision. Every accepted
answer is saved to Supabase before requesting the next question. Debounced draft
saves protect the closing statement before Send. Late requests cannot overwrite
newer accepted messages or undo completion. The session ID is also its report ID.

The browser mirrors the current session and its access token into session and local
storage, with a memory fallback for storage exceptions. The landing page offers
**Resume my pitch** or **View saved results**. Refresh restores the current question
and draft; interrupted question requests can be continued without adding the answer
twice. The results page reconnects to the saved session rather than resetting to
the beginning on a storage or parsing error.

The reviewed closing answer is saved immediately, without depending on the final
voice playback. The session endpoint starts the existing report job in background
after that durable save, even if the browser closes. Its stable ID prevents the
results page from starting a duplicate paid generation. Completed reports, PDFs and
conversations remain available to the platform owner in Supabase. Starting another
pitch clears only browser pitch keys and never deletes archived sessions.

Apply `pitch_sessions_and_email_outbox` alongside the earlier migrations before
deploying the session-saving endpoints. The new tables have RLS and server-only
access; guest requests must present the matching hashed-capability credentials.

### PDF email copies

The completed PDF queues one owner copy in `pitch_email_outbox`. An optional email
box before the interview and again at the closing question saves the participant's
request with the session, so their copy can be queued even if they leave the browser.
Only a session with the matching report access hash can supply that address.
Results also offer an **Email my PDF** form. Mail is sent from the stored
PDF rather than generating another report. Unique report/recipient-role records,
atomic delivery claims and Resend idempotency keys protect against duplicate sends.
Delivery failures keep the PDF and request available for retry.

This reuses VoiceReach's Resend configuration names: `RESEND_API_KEY` and
`RESEND_FROM_EMAIL` (existing sender fallback `outreach@voicereach.co.uk`). Owner
copies use `PITCH_REPORT_OWNER_EMAIL`, then `ADMIN_EMAIL`, then the existing
VoiceReach owner fallback `lee.nazari@gmail.com`. Sending is deliberately disabled
until the owner approves the automatic message templates and the existing Resend
configuration is attached: set `PITCH_REPORT_EMAIL_ENABLED=true` only then. Until
configured, requests remain `awaiting_configuration` and the UI says the request
is saved, never that an email has been sent. Do not put API keys in the browser.

Report generation runs in OpenAI background mode with a resumable stream. The page
shows complete feedback sections while the rest of the report is still generating,
so founders can start reading without waiting for the full document. Longer reports
do not depend on a single 45-second request. The key needs
Responses read and write permissions. Each session gets a report ID and a random
access token, stored before the first request. Refresh and Retry reuse that job.
OpenAI stores the background response so it can be retrieved; completed reports
are retained privately in Supabase.

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or the legacy
`SUPABASE_SERVICE_ROLE_KEY`, only if legacy keys are enabled) in Vercel Production and Preview. These are server-only
variables. Apply the `pitch_report_archive`, `pitch_report_progress`, `pitch_report_parts`
and `pitch_feedback_chunks` migrations in
`supabase/migrations`. They are applied to RoleMatch project `ryrseyvgfmrmiqngkvxs`.
Use a modern `sb_secret_` key for this project; its legacy keys are disabled.

The server creates the private `pitch-reports` Storage bucket on first use and
saves a PDF for every completed report, even if Download is never clicked. The
`pitch_reports` table stores the pitch, transcript, critique, model, token usage,
timestamps and PDF path. RLS is enabled, direct anon/authenticated access is revoked,
and guest access tokens are hashed. PDF downloads require the matching report ID
and secret access token; no public URLs or public listing policies are created.
Administrators can find the copies in Supabase Storage and the report table.

New generations start with `background: true, stream: true`. The creation stream
stays open in a Vercel `waitUntil` task after the initial request returns, with a
300-second function limit. It checkpoints the exact JSON prefix, sequence number
and complete validated fields in the private report row while the browser polls.
If progress becomes stale, polling resumes that same response from its saved
sequence number for at most eight seconds. Atomic cursor checks prevent slower
readers from overwriting newer progress. The worker also archives the final PDF
if the browser disconnects. Refresh resumes the same saved responses. Older
non-streaming jobs remain recoverable through normal polling.

New reports run fast feedback and market research independently. The opening call
has no search tools and only generates `first`: a short verdict, category and
strengths. Once that chunk is saved, one atomically claimed detail call generates
`second`: fixes, the revised pitch, actions, questions, glossary and practical AI
pilots, using the saved opening as context. This does not rely on the model choosing
to write JSON keys in a particular order. The market call runs alongside the opening
and details, with at most two searches. All three response IDs, results and usage
are saved in the same private row. Retrying failed details keeps the saved opening.
Research never changes the pitch scoring. A failed research part can be retried
without regenerating the saved feedback. An atomic claim prevents duplicate starts.

Incomplete strings or arrays stay hidden. The competitor section appears only after
the completed response's source URLs are verified. The page keeps readable feedback
if the connection is interrupted and offers **Resume report**. **Download as PDF**
is enabled when the complete validated report is available; it includes all sections,
including AI opportunities and market research. The final critique and PDF are
archived only when both parts have completed. Existing single-response jobs retain
their original path and are never automatically regenerated.

If PDF storage fails, the critique remains visible and saved. Retry saving PDF
only retries rendering/uploading the copy. It does not generate a new critique.
Older reports cached in the browser are archived without being regenerated.
Starting a new pitch clears the previous session's report access and cached results.

## AI opportunities and market research

New reports include up to three business-specific AI pilots with the example from
the pitch, a practical workflow, first step, proposed success measure and human check.
They also include a short live market scan of up to three relevant competitors or
substitutes, primary-source links, differentiation hypotheses and next research steps.
Sources are checked against URLs actually retrieved by the response's web search.
Unverified competitor entries are removed; unavailable evidence is labelled honestly.
Both sections appear on screen and in the automatically saved PDF.

For older reports, **Add AI and market insights** creates a separate, resumable
enhanced report from the saved conversation. The previous report stays available
until the upgrade succeeds. Refreshing/retrying the upgrade reuses its job rather
than starting another paid generation. No upgrade runs automatically.

Cost controls: two web tool calls maximum across the report, low search context,
low reasoning effort, 1,400 opening output tokens, 3,600 detail output tokens and
1,800 research output tokens maximum, and 80,000 input characters per part. Earlier
two-response jobs retain their 4,200 feedback token budget. Single-response jobs use
6,500 output tokens maximum. The default
report model is GPT-6.1 Sol. `pitch_reports.token_usage` records the usage, number of
web calls and an estimated USD cost for both parts together, using standard prices
checked on 2026-10-03 (input $2, cached input $0.10, cache writes $2.50 and output
$10 per million tokens; web search $0.01 per call). For other model overrides the
estimate is null. This estimate excludes the spoken interview, transcription,
hosting, taxes and exchange-rate effects; the £1 whole-process target is not a
guarantee for unlimited recording or repeated new generations.

Pricing reference: https://developers.openai.com/api/docs/pricing.

## Verification

- `npm test` runs speech-result and report-route regression tests with mocked speech
  events and OpenAI responses. It does not call paid AI services.
  Install Poppler for the optional PDF text-content check (`pdftotext`).
- `npx tsc --noEmit` checks TypeScript.
- `npm run build` checks the production build.

For a device check, open `/pitch` in Android Chrome, dictate one full answer,
stop, edit it, add more, and send it. Each phrase should appear once in the answer
and conversation history. Generate a new report and download its PDF. Previously
cached reports are not regenerated automatically; use the insights upgrade button
or start a new pitch to test the enhanced report.

### Pitch documents

Founders can upload a searchable PDF (100 pages, 20 MB and 240,000 extracted characters maximum) or paste a plan. The reader processes all pages, including appendices, in one OpenAI extraction. The interview and report reuse the reviewed brief and exact page excerpts, not the entire plan. Pages without readable text are listed before the interview; the founder can add missing chart figures. The original PDF is not archived. For PDFs over 4 MB, the browser reads the file locally using the bundled PDF.js reader and sends only the text to the API.
