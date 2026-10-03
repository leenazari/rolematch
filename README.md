# RoleMatch and Pitch Perfect

Pitch Perfect is at `/pitch` in this Next.js app.

## Setup

1. Run `npm install`.
2. Copy `.env.example` to `.env.local` and set the API keys.
3. Run `npm run dev`.

Pitch reports use the OpenAI Responses API with `gpt-6.1-sol` by default. Set
`OPENAI_API_KEY` in the hosting project's **Production** and **Preview** environments
before deploying this change. Set `OPENAI_PITCH_REPORT_MODEL` to override the report
model with a Responses/Structured Outputs model that supports low reasoning effort.
The other existing AI endpoints still require `ANTHROPIC_API_KEY`.

Pitch Perfect records each answer with `MediaRecorder`, then sends the completed
audio to `/api/transcribe-pitch-audio` after Stop. It uses `gpt-4o-transcribe` and
the same server-side `OPENAI_API_KEY`; the key needs Audio transcription permission.
Set `OPENAI_PITCH_TRANSCRIPTION_MODEL` to override the model. This avoids Android
browser speech engines that emit repeated, cumulative recognition fragments.
Each recording is limited to three minutes and 3.5 MB. Audio is not saved by this
app and is released after transcription, Clear, a new recording, or navigation.
Failed uploads can be retried while the page remains open. Text appears after
Stop, and users can edit it, add another recording, or type their whole answer.
Live words appear in the answer box through an OpenAI WebRTC transcription-only
session using `gpt-live-transcribe`. `/api/pitch-live-transcription` negotiates the
connection without exposing the API key. Live text is a preview; Stop replaces
that preview with the final recorded-audio transcript. The live connection closes
on Stop, Clear, recording errors and navigation. If live text is unavailable,
recording continues and the UI explains that the transcript will appear after Stop.

## Verification

- `npm test` runs speech-result and report-route regression tests with mocked speech
  events and OpenAI responses. It does not call paid AI services.
- `npx tsc --noEmit` checks TypeScript.
- `npm run build` checks the production build.

For a device check, open `/pitch` in Android Chrome, dictate one full answer,
stop, edit it, add more, and send it. Each phrase should appear once in the answer
and conversation history. Generate a new report and download its PDF. Previously
cached reports are not regenerated automatically; start a new pitch to test OpenAI.
