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

## Verification

- `npm test` runs speech-result and report-route regression tests with mocked speech
  events and OpenAI responses. It does not call paid AI services.
- `npx tsc --noEmit` checks TypeScript.
- `npm run build` checks the production build.

For a device check, open `/pitch` in Android Chrome, dictate one full answer,
stop, edit it, add more, and send it. Each phrase should appear once in the answer
and conversation history. Generate a new report and download its PDF. Previously
cached reports are not regenerated automatically; start a new pitch to test OpenAI.
