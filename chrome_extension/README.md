# Secretary Chrome Extension

This extension now supports:

- Secretary chat (streaming) from side panel
- Connection settings for deployed app/API
- Auth mode switching (manual Bearer token or app-session auto token)
- Browser automation agent execution inside the same extension
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

## Auto Delegation Hook

The side panel is ready to auto-delegate when stream tool output includes:

- tool name: `run_browser_task` or `delegate_browser_task`
- payload with `goal` (or `instruction` / `task`)

Then the extension starts the browser agent automatically.

## Save Browser Run As Skill (With Screenshots)

When the secretary agent calls `register_browser_skill`, the extension:

1. Finds the latest browser run logs
2. Collects captured browser screenshots from that run
3. Uploads screenshots to `/api/captures`
4. Creates a WORK/RULE memory via `/api/memories` with:
   - Goal
   - Step list
   - Visual checkpoints (image links)

You can trigger this by asking in chat, for example:

- "Save this browser workflow as a reusable skill."
- "Register this browser SOP with screenshots."
