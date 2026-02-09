# Secretary Chrome Extension

This extension now supports:

- Secretary chat (streaming) from side panel
- Connection settings for deployed app/API
- Auth mode switching (manual Bearer token or app-session auto token)
- Chat attachments: image upload, image paste (`Ctrl+V`), and PDF upload
  - PDF handling: extract text layer first; if text is insufficient, the backend auto-renders PDF pages into images and continues OCR from those images
- Browser automation agent execution inside the same extension
- Approval workflow parity with web app:
  - Manual/Auto toggle in header
  - Proposal panel with approve/reject and approve-all/reject-all
  - Pending proposal restore for current session
- `ask_user_questions` support in side panel:
  - dynamic question form rendering (single, multiple, free text)
  - answer submission back to chat stream as follow-up
- Hybrid RPA + AI execution:
  - deterministic step scenario runs first
  - failed step can be recovered with bounded AI fallback
- Human demo to RPA:
  - record your manual browser operation from side panel
  - auto-generate structured RPA scenario steps
  - save the scenario as a normal WORK/RULE skill
- Activity log for tool and browser-agent events

## Load Extension

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `C:\Users\shuhe\apps\Secretary_Partner_AI\chrome_extension`

## Connect To Deployed App

1. Open side panel
2. Click settings (gear icon)
3. Set:
   - `App Base URL` (example: `https://app.your-domain.com`)
   - `API Base URL` (example: `https://api.your-domain.com/api`)
4. Select auth mode:
   - `Bearer Token`: paste access token
   - `Use App Login Session (Auto Token)`: extension reads app tab localStorage token and sends Bearer header automatically
5. Click `Test`
6. If needed, click `Open Login` and sign in on web app

## Browser Provider

- `Gemini API (Direct)`: set Gemini API key + Gemini model
- `AWS Bedrock (Direct)`: set Region, Access Key ID, Secret Access Key (Session Token is optional)
- `LiteLLM`: set LiteLLM API key/base URL + model

The extension remembers browser model names per provider.

## App Session Mode Notes

`Use App Login Session (Auto Token)` requires an open app tab on the same origin as `App Base URL` so the extension can read the login token.

- `chrome-extension://<your-extension-id>`
- No cookie dependency: backend still receives `Authorization: Bearer ...`

## Browser Agent

- Use the `Browser Agent` box in side panel to run browser tasks directly.
- While running, progress appears in `Agent Activity`.
- Tool events from secretary stream are also logged there.
- While proposal/questions interaction is pending, the normal chat composer is locked
  to match web behavior and prevent conflicting inputs.
- Screenshot policy is `DOM-first / on-demand`:
  - normal planning and successful deterministic RPA steps use DOM/text only
  - screenshot is captured only when DOM-only execution is stuck/fails and visual context is needed

## Auto Delegation Hook

The side panel is ready to auto-delegate when stream tool output includes:

- tool name: `run_browser_task` or `delegate_browser_task`
- payload with `goal` (or `instruction` / `task`)

Then the extension starts the browser agent automatically.

For structured hybrid execution:

- tool name: `run_hybrid_rpa`
- payload with `steps` and optional fallback settings (`ai_fallback`, `ai_fallback_max_steps`)

Then the extension runs deterministic RPA steps and only invokes AI when a step cannot be completed directly.

When `run_browser_task` is delegated, the sidepanel first attempts to resolve a matching WORK/RULE skill
that contains `RPA Scenario (JSON)`. If found, it auto-switches to hybrid RPA execution.

## Demo To RPA Scenario

1. Open the target website tab.
2. In side panel Browser Agent box, click `Record Demo`.
3. Perform the workflow manually.
4. While recording, the page border glows in red and shows `RPA Recording in Progress`.
5. Click `Stop & Save Skill`.
6. The extension generates a structured scenario and saves it to `/api/memories` as a standard skill.

Saved skill content includes an `RPA Scenario (JSON)` section, so the scenario can be reused later.

## Save Browser Run As Skill (With Screenshots)

When the secretary agent calls `register_browser_skill`, the extension:

1. Finds the latest browser run logs
2. Collects captured browser screenshots from that run
3. Uploads screenshots to `/api/captures`
4. Uses the configured browser LLM provider to refine skill metadata (title / when-to-use / description)
5. Creates a WORK/RULE memory via `/api/memories` with:
   - Goal
   - Step list
   - Description and use timing
   - Visual checkpoints (image links)

You can trigger this by asking in chat, for example:

- "Save this browser workflow as a reusable skill."
- "Register this browser SOP with screenshots."
