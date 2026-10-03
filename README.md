# RoleMatch and Pitch Perfect

Pitch Perfect is at `/pitch` in this Next.js app.

## Setup

1. Use Node.js 24 (matching the Vercel runtime pinned in `package.json`) and run `npm install`.
2. Copy `.env.example` to `.env.local` and set the API keys.
3. Run `npm run dev`.

Pitch reports use the OpenAI Responses API with `gpt-6.1-sol` by default. Set
`OPENAI_API_KEY` in the hosting project's **Production** and **Preview** environments
before deploying this change. Set `OPENAI_PITCH_REPORT_MODEL` to override the report
model with a Responses/Structured Outputs model that supports low reasoning effort
and live web search. The report key must allow the Responses API and web search.
The other existing AI endpoints still require `ANTHROPIC_API_KEY`.

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

## Saved reports

Report generation runs in OpenAI background mode and the page polls for completion,
so longer reports no longer depend on a single 45-second request. The key needs
Responses read and write permissions. Each session gets a report ID and a random
access token, stored before the first request. Refresh and Retry reuse that job.
OpenAI stores the background response so it can be retrieved; completed reports
are retained privately in Supabase.

Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` (or the legacy
`SUPABASE_SERVICE_ROLE_KEY`, only if legacy keys are enabled) in Vercel Production and Preview. These are server-only
variables. Apply the `pitch_report_archive` migration in `supabase/migrations`.
It is already applied to RoleMatch project `ryrseyvgfmrmiqngkvxs`.
Use a modern `sb_secret_` key for this project; its legacy keys are disabled.

The server creates the private `pitch-reports` Storage bucket on first use and
saves a PDF for every completed report, even if Download is never clicked. The
`pitch_reports` table stores the pitch, transcript, critique, model, token usage,
timestamps and PDF path. RLS is enabled, direct anon/authenticated access is revoked,
and guest access tokens are hashed. PDF downloads require the matching report ID
and secret access token; no public URLs or public listing policies are created.
Administrators can find the copies in Supabase Storage and the report table.

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

Cost controls: two web tool calls maximum, low search context, low reasoning effort,
6,500 output tokens maximum and 80,000 characters of report input. The default
report model is GPT-6.1 Sol. `pitch_reports.token_usage` records the usage, number of
web calls and an estimated USD cost for the report/research, using standard prices
checked on 2026-10-03 (input $2, cached input $0.10, cache writes $2.50 and output
$10 per million tokens; web search $0.01 per call). For other model overrides the
estimate is null. This estimate excludes the spoken interview, transcription,
hosting, taxes and exchange-rate effects; the £1 whole-process target is not a
guarantee for unlimited recording or repeated new generations.

Pricing references: https://developers.openai.com/api/docs/pricing and
https://elevenlabs.io/pricing/api. The existing voice models are preserved.

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
