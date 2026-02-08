const SETTINGS_STORAGE_KEY = "secretary_extension_settings_v1";
const SESSION_STORAGE_KEY = "session_id";
const APP_AUTH_TOKEN_KEYS = ["auth_token", "id_token", "access_token"];
const APP_TOKEN_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_BEARER_TOKEN = "dev_user";
const BROWSER_PROVIDERS = Object.freeze({
    LITELLM: "litellm",
    GEMINI_DIRECT: "gemini_direct",
    BEDROCK_DIRECT: "bedrock_direct"
});
const DEFAULT_PROVIDER_MODELS = Object.freeze({
    [BROWSER_PROVIDERS.LITELLM]: "gemini/gemini-1.5-pro",
    [BROWSER_PROVIDERS.GEMINI_DIRECT]: "gemini-2.5-flash",
    [BROWSER_PROVIDERS.BEDROCK_DIRECT]: "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
});
const MAX_BROWSER_RUN_HISTORY = 10;
const MAX_SKILL_STEP_LINES = 12;
const MAX_SKILL_SCREENSHOTS = 6;
const MAX_SKILL_CONTENT_LENGTH = 4900;

const DEFAULT_SETTINGS = Object.freeze({
    appBaseUrl: "http://localhost:3000",
    apiBaseUrl: "http://localhost:8000/api",
    authMode: "bearer",
    accessToken: DEFAULT_BEARER_TOKEN,
    browserProvider: BROWSER_PROVIDERS.GEMINI_DIRECT,
    browserModel: DEFAULT_PROVIDER_MODELS[BROWSER_PROVIDERS.GEMINI_DIRECT],
    browserModelByProvider: { ...DEFAULT_PROVIDER_MODELS },
    browserApiKey: "",
    browserApiBaseUrl: "http://localhost:4000",
    browserBedrockRegion: "us-east-1",
    browserBedrockAccessKeyId: "",
    browserBedrockSecretAccessKey: "",
    browserBedrockSessionToken: ""
});

let settings = { ...DEFAULT_SETTINGS };
let currentCapture = null;
let isThinking = false;
let currentSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
let browserPort = null;
let browserStatus = {
    running: false,
    step: 0
};
let appTokenCache = {
    origin: "",
    token: "",
    expiresAt: 0
};
let browserModelByProvider = { ...DEFAULT_PROVIDER_MODELS };
let browserRunHistory = [];
let currentBrowserRun = null;
let lastBrowserStatus = { running: false, step: 0 };

const messagesDiv = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const captureBtn = document.getElementById("capture-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const historyBtn = document.getElementById("history-btn");
const closeHistoryBtn = document.getElementById("close-history");
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings");
const thinkingIndicator = document.getElementById("thinking");
const previewContainer = document.getElementById("preview-container");
const screenshotPreview = document.getElementById("screenshot-preview");
const removeScreenshotBtn = document.getElementById("remove-screenshot");
const historyPanel = document.getElementById("history-panel");
const sessionList = document.getElementById("session-list");
const settingsPanel = document.getElementById("settings-panel");
const statusDot = document.getElementById("status");
const statusText = document.querySelector(".status-text");
const settingsHint = document.getElementById("settings-hint");

const appBaseUrlInput = document.getElementById("app-base-url");
const apiBaseUrlInput = document.getElementById("api-base-url");
const authModeSelect = document.getElementById("auth-mode");
const tokenField = document.getElementById("token-field");
const accessTokenInput = document.getElementById("access-token");
const browserProviderSelect = document.getElementById("browser-provider");
const browserModelInput = document.getElementById("browser-model");
const browserApiKeyField = document.getElementById("browser-api-key-field");
const browserApiKeyInput = document.getElementById("browser-api-key");
const browserApiBaseUrlField = document.getElementById("browser-api-base-url-field");
const browserApiBaseUrlInput = document.getElementById("browser-api-base-url");
const browserBedrockRegionField = document.getElementById("browser-bedrock-region-field");
const browserBedrockRegionInput = document.getElementById("browser-bedrock-region");
const browserBedrockAccessKeyField = document.getElementById("browser-bedrock-access-key-field");
const browserBedrockAccessKeyInput = document.getElementById("browser-bedrock-access-key-id");
const browserBedrockSecretKeyField = document.getElementById("browser-bedrock-secret-key-field");
const browserBedrockSecretKeyInput = document.getElementById("browser-bedrock-secret-access-key");
const browserBedrockSessionTokenField = document.getElementById("browser-bedrock-session-token-field");
const browserBedrockSessionTokenInput = document.getElementById("browser-bedrock-session-token");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const testConnectionBtn = document.getElementById("test-connection-btn");
const openLoginBtn = document.getElementById("open-login-btn");

const browserGoalInput = document.getElementById("browser-goal-input");
const browserRunBtn = document.getElementById("browser-run-btn");
const browserStopBtn = document.getElementById("browser-stop-btn");
const browserAgentBadge = document.getElementById("browser-agent-badge");
const activityLog = document.getElementById("activity-log");

void init();

async function init() {
    await loadSettings();
    applySettingsToUI();
    bindEvents();
    updateBrowserAgentBadge();
    connectBrowserPort();
    validateInput();

    const reachable = await checkConnection(false);
    if (!reachable) {
        addSystemMessage("API connection failed. Check Connection Settings.");
    }

    if (currentSessionId) {
        await loadHistory(currentSessionId);
    } else {
        clearView();
        addMessage("assistant", "Hello! I am your Secretary Agent. How can I help you today?");
    }
}

function bindEvents() {
    captureBtn.addEventListener("click", () => {
        void captureScreen();
    });

    removeScreenshotBtn.addEventListener("click", () => {
        currentCapture = null;
        hidePreview();
        validateInput();
    });

    newChatBtn.addEventListener("click", () => {
        if (!confirm("Start a new chat?")) {
            return;
        }
        clearView();
        currentSessionId = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
        addMessage("assistant", "New session started. How can I help you?");
    });

    historyBtn.addEventListener("click", () => {
        toggleHistory(true);
        void fetchSessions();
    });

    closeHistoryBtn.addEventListener("click", () => {
        toggleHistory(false);
    });

    settingsBtn.addEventListener("click", () => {
        toggleSettings(true);
    });

    closeSettingsBtn.addEventListener("click", () => {
        toggleSettings(false);
    });

    authModeSelect.addEventListener("change", () => {
        syncAuthModeUi();
        if (authModeSelect.value === "cookie") {
            clearAppTokenCache();
            void refreshCookieAuthHint();
        }
    });

    browserProviderSelect.addEventListener("change", () => {
        updateBrowserProviderUi({ retainCurrentModel: true });
    });

    browserModelInput.addEventListener("input", () => {
        const provider = normalizeBrowserProvider(browserProviderSelect.value);
        browserModelByProvider[provider] = String(browserModelInput.value || "").trim();
    });

    saveSettingsBtn.addEventListener("click", () => {
        void saveSettings();
    });

    testConnectionBtn.addEventListener("click", () => {
        void checkConnection(true);
    });

    openLoginBtn.addEventListener("click", () => {
        void openLoginPage();
    });

    sendBtn.addEventListener("click", () => {
        void sendMessage();
    });

    userInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            void sendMessage();
        }
    });

    userInput.addEventListener("input", () => {
        userInput.style.height = "auto";
        userInput.style.height = `${userInput.scrollHeight}px`;
        validateInput();
    });

    browserRunBtn.addEventListener("click", () => {
        void runBrowserGoalFromInput();
    });

    browserStopBtn.addEventListener("click", () => {
        void stopBrowserAgent();
    });
}

async function loadSettings() {
    const stored = await storageGet([SETTINGS_STORAGE_KEY]);
    const merged = {
        ...DEFAULT_SETTINGS,
        ...(stored?.[SETTINGS_STORAGE_KEY] || {})
    };
    settings = normalizeSettings(merged);
}

function normalizeBrowserProvider(value) {
    const provider = String(value || "").trim().toLowerCase();
    if (provider === BROWSER_PROVIDERS.GEMINI_DIRECT) {
        return BROWSER_PROVIDERS.GEMINI_DIRECT;
    }
    if (provider === BROWSER_PROVIDERS.BEDROCK_DIRECT || provider === "bedrock") {
        return BROWSER_PROVIDERS.BEDROCK_DIRECT;
    }
    return BROWSER_PROVIDERS.LITELLM;
}

function normalizeProviderModelMap(input) {
    const normalized = { ...DEFAULT_PROVIDER_MODELS };
    if (!input || typeof input !== "object") {
        return normalized;
    }
    for (const provider of Object.values(BROWSER_PROVIDERS)) {
        const value = String(input[provider] || "").trim();
        if (value) {
            normalized[provider] = value;
        }
    }
    return normalized;
}

function getProviderModel(provider, modelMap) {
    const normalizedProvider = normalizeBrowserProvider(provider);
    const normalizedMap = normalizeProviderModelMap(modelMap);
    return normalizedMap[normalizedProvider] || DEFAULT_PROVIDER_MODELS[normalizedProvider];
}

function normalizeBedrockRegion(value) {
    const normalized = String(value || "").trim().toLowerCase();
    return normalized || DEFAULT_SETTINGS.browserBedrockRegion;
}

function normalizeSettings(input) {
    const next = { ...DEFAULT_SETTINGS, ...(input || {}) };
    next.appBaseUrl = normalizeBaseUrl(next.appBaseUrl, DEFAULT_SETTINGS.appBaseUrl);
    next.apiBaseUrl = normalizeBaseUrl(next.apiBaseUrl, DEFAULT_SETTINGS.apiBaseUrl);
    next.authMode = next.authMode === "cookie" ? "cookie" : "bearer";
    next.accessToken = String(next.accessToken || "").trim();
    next.browserProvider = normalizeBrowserProvider(next.browserProvider);
    next.browserModelByProvider = normalizeProviderModelMap(next.browserModelByProvider);
    const legacyModel = String(next.browserModel || "").trim();
    if (legacyModel) {
        next.browserModelByProvider[next.browserProvider] = legacyModel;
    }
    next.browserModel = getProviderModel(next.browserProvider, next.browserModelByProvider);
    next.browserApiKey = String(next.browserApiKey || "").trim();
    next.browserApiBaseUrl = normalizeBaseUrl(next.browserApiBaseUrl, DEFAULT_SETTINGS.browserApiBaseUrl);
    next.browserBedrockRegion = normalizeBedrockRegion(next.browserBedrockRegion);
    next.browserBedrockAccessKeyId = String(next.browserBedrockAccessKeyId || "").trim();
    next.browserBedrockSecretAccessKey = String(next.browserBedrockSecretAccessKey || "").trim();
    next.browserBedrockSessionToken = String(next.browserBedrockSessionToken || "").trim();
    return next;
}

function applySettingsToUI() {
    appBaseUrlInput.value = settings.appBaseUrl;
    apiBaseUrlInput.value = settings.apiBaseUrl;
    authModeSelect.value = settings.authMode;
    accessTokenInput.value = settings.accessToken;
    browserProviderSelect.value = settings.browserProvider;
    browserProviderSelect.dataset.prevProvider = settings.browserProvider;
    browserModelByProvider = normalizeProviderModelMap(settings.browserModelByProvider);
    browserModelInput.value = getProviderModel(settings.browserProvider, browserModelByProvider);
    browserApiKeyInput.value = settings.browserApiKey;
    browserApiBaseUrlInput.value = settings.browserApiBaseUrl;
    browserBedrockRegionInput.value = settings.browserBedrockRegion;
    browserBedrockAccessKeyInput.value = settings.browserBedrockAccessKeyId;
    browserBedrockSecretKeyInput.value = settings.browserBedrockSecretAccessKey;
    browserBedrockSessionTokenInput.value = settings.browserBedrockSessionToken;
    syncAuthModeUi();
    updateBrowserProviderUi({ retainCurrentModel: false });
}

function readSettingsFromUI() {
    const provider = normalizeBrowserProvider(browserProviderSelect.value);
    const providerModelMap = normalizeProviderModelMap({
        ...browserModelByProvider,
        [provider]: String(browserModelInput.value || "").trim()
    });

    return normalizeSettings({
        appBaseUrl: appBaseUrlInput.value,
        apiBaseUrl: apiBaseUrlInput.value,
        authMode: authModeSelect.value,
        accessToken: accessTokenInput.value,
        browserProvider: provider,
        browserModel: getProviderModel(provider, providerModelMap),
        browserModelByProvider: providerModelMap,
        browserApiKey: browserApiKeyInput.value,
        browserApiBaseUrl: browserApiBaseUrlInput.value,
        browserBedrockRegion: browserBedrockRegionInput.value,
        browserBedrockAccessKeyId: browserBedrockAccessKeyInput.value,
        browserBedrockSecretAccessKey: browserBedrockSecretKeyInput.value,
        browserBedrockSessionToken: browserBedrockSessionTokenInput.value
    });
}

function syncAuthModeUi() {
    const cookieMode = authModeSelect.value === "cookie";
    tokenField.classList.toggle("hidden", cookieMode);
}

function updateBrowserProviderUi(options = {}) {
    const retainCurrentModel = options.retainCurrentModel !== false;
    const provider = normalizeBrowserProvider(browserProviderSelect.value);
    const previousProvider = normalizeBrowserProvider(browserProviderSelect.dataset.prevProvider);

    if (retainCurrentModel && previousProvider) {
        const currentValue = String(browserModelInput.value || "").trim();
        if (currentValue) {
            browserModelByProvider[previousProvider] = currentValue;
        }
    }

    browserModelByProvider = normalizeProviderModelMap(browserModelByProvider);
    browserModelInput.value = getProviderModel(provider, browserModelByProvider);
    browserProviderSelect.dataset.prevProvider = provider;

    const isLiteLLM = provider === BROWSER_PROVIDERS.LITELLM;
    const isGemini = provider === BROWSER_PROVIDERS.GEMINI_DIRECT;
    const isBedrock = provider === BROWSER_PROVIDERS.BEDROCK_DIRECT;

    browserApiBaseUrlField.classList.toggle("hidden", !isLiteLLM);
    browserApiKeyField.classList.toggle("hidden", isBedrock);

    browserBedrockRegionField.classList.toggle("hidden", !isBedrock);
    browserBedrockAccessKeyField.classList.toggle("hidden", !isBedrock);
    browserBedrockSecretKeyField.classList.toggle("hidden", !isBedrock);
    browserBedrockSessionTokenField.classList.toggle("hidden", !isBedrock);

    const apiKeyLabel = browserApiKeyField?.querySelector("span");
    if (apiKeyLabel) {
        apiKeyLabel.textContent = isGemini ? "Gemini API Key" : "LiteLLM API Key";
    }
    browserApiKeyInput.placeholder = isGemini ? "Gemini API key" : "LiteLLM API key";

    if (isLiteLLM) {
        browserModelInput.placeholder = "openai/gpt-4o-mini";
    } else if (isBedrock) {
        browserModelInput.placeholder = DEFAULT_PROVIDER_MODELS[BROWSER_PROVIDERS.BEDROCK_DIRECT];
    } else {
        browserModelInput.placeholder = DEFAULT_PROVIDER_MODELS[BROWSER_PROVIDERS.GEMINI_DIRECT];
    }
}

async function saveSettings() {
    settings = readSettingsFromUI();
    clearAppTokenCache();
    await storageSet({ [SETTINGS_STORAGE_KEY]: settings });
    settingsHint.textContent = "Settings saved.";
    addActivity("settings", "Connection settings updated.");
    await checkConnection(false);
}

async function checkConnection(showHint = true) {
    const candidateSettings = readSettingsFromUI();

    try {
        const response = await apiFetch("/chat/sessions", {
            method: "GET",
            settingsOverride: candidateSettings
        });

        if (!response.ok) {
            if (response.status === 401 && candidateSettings.authMode === "cookie") {
                const authMeta = await resolveAppSessionTokenWithMeta(candidateSettings, {
                    forceRefresh: true
                });
                throw new Error(buildCookieAuthErrorMessage(authMeta, candidateSettings));
            }
            throw new Error(
                response.status === 401 ? "HTTP 401 (Invalid or expired token)" : `HTTP ${response.status}`
            );
        }

        setConnectionStatus(true, "Online");
        if (showHint) {
            settingsHint.textContent = "Connection OK.";
        }
        return true;
    } catch (error) {
        setConnectionStatus(false, "Offline");
        if (showHint) {
            settingsHint.textContent = `Connection failed: ${error.message}`;
        }
        return false;
    }
}

async function openLoginPage() {
    const base = normalizeBaseUrl(appBaseUrlInput.value, DEFAULT_SETTINGS.appBaseUrl);
    let loginUrl = base;
    try {
        loginUrl = new URL("/login", `${base}/`).toString();
    } catch {
        // Keep fallback value.
    }
    clearAppTokenCache();
    await chrome.tabs.create({ url: loginUrl });
    settingsHint.textContent = "Opened login page. After login, return and click Test.";
}

function toggleHistory(show) {
    historyPanel.classList.toggle("hidden", !show);
}

function toggleSettings(show) {
    settingsPanel.classList.toggle("hidden", !show);
    if (show && authModeSelect.value === "cookie") {
        void refreshCookieAuthHint();
    }
}

function setConnectionStatus(online, text) {
    statusDot.classList.toggle("online", online);
    statusText.textContent = text;
}

async function captureScreen() {
    try {
        setCaptureLoading(true);
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "jpeg", quality: 70 });

        currentCapture = {
            base64: dataUrl,
            url: tab?.url || "",
            title: tab?.title || ""
        };

        showPreview(dataUrl);
        validateInput();
        addActivity("capture", "Captured current tab screenshot.");
    } catch (error) {
        addSystemMessage(`Failed to capture screen: ${error.message}`);
    } finally {
        setCaptureLoading(false);
    }
}

async function sendMessage() {
    const text = userInput.value.trim();
    if ((!text && !currentCapture) || isThinking) {
        return;
    }

    addMessage("user", text, currentCapture ? currentCapture.base64 : null);

    const sendingCapture = currentCapture;
    const originalText = text;

    userInput.value = "";
    userInput.style.height = "auto";
    currentCapture = null;
    hidePreview();
    validateInput();
    setThinking(true);

    try {
        let imageUrl = null;

        if (sendingCapture) {
            const capturePayload = {
                content_type: "TEXT",
                base64_image: sendingCapture.base64,
                raw_text: JSON.stringify({
                    type: "EXT_CAPTURE",
                    url: sendingCapture.url,
                    title: sendingCapture.title
                })
            };

            const captureResp = await apiFetch("/captures", {
                method: "POST",
                body: capturePayload
            });

            if (captureResp.ok) {
                const captureData = await captureResp.json();
                imageUrl = captureData.content_url || null;
            }
        }

        const chatPayload = {
            text: originalText,
            image_base64: sendingCapture ? sendingCapture.base64 : null,
            image_url: imageUrl,
            mode: "dump",
            session_id: currentSessionId
        };

        const response = await apiFetch("/chat/stream", {
            method: "POST",
            body: chatPayload,
            stream: true
        });

        if (!response.ok || !response.body) {
            throw new Error(`Chat failed (${response.status})`);
        }

        setConnectionStatus(true, "Online");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let assistantContentDiv = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
                if (!line.startsWith("data: ")) {
                    continue;
                }

                const rawData = line.slice(6);
                let chunk;
                try {
                    chunk = JSON.parse(rawData);
                } catch {
                    continue;
                }

                if (!assistantContentDiv && (chunk.chunk_type === "text" || chunk.chunk_type === "tool_start")) {
                    setThinking(false);
                    assistantContentDiv = createAssistantMessageContainer();
                }

                await handleStreamingChunk(chunk, assistantContentDiv);
            }
        }
    } catch (error) {
        setConnectionStatus(false, "Offline");
        addSystemMessage(`Something went wrong: ${error.message}`);
    } finally {
        setThinking(false);
    }
}

async function handleStreamingChunk(chunk, contentDiv) {
    const chunkType = String(chunk?.chunk_type || "");

    if (chunkType === "text") {
        if (contentDiv) {
            contentDiv.textContent += chunk.content || "";
            scrollToBottom();
        }
        return;
    }

    if (chunkType === "tool_start") {
        if (contentDiv) {
            const toolDiv = document.createElement("div");
            toolDiv.className = "tool-usage";
            toolDiv.innerHTML = `<span>Tool</span><span>${chunk.tool_name || "unknown"}</span>`;
            contentDiv.parentElement.appendChild(toolDiv);
        }
        addActivity("tool_start", `${chunk.tool_name || "unknown"}`);
        scrollToBottom();
        return;
    }

    if (chunkType === "tool_end") {
        addActivity("tool_end", `${chunk.tool_name || "unknown"}`);
        await handleExtensionDelegation(chunk);
        return;
    }

    if (chunkType === "tool_error") {
        addActivity("tool_error", `${chunk.tool_name || "unknown"}: ${chunk.error_message || "error"}`);
        return;
    }

    if (chunkType === "proposal") {
        addActivity("proposal", `${chunk.description || "Approval proposal"}`);
        return;
    }

    if (chunkType === "questions") {
        addActivity("questions", "Agent requested user input.");
        return;
    }

    if (chunkType === "done") {
        if (chunk.session_id) {
            currentSessionId = chunk.session_id;
            localStorage.setItem(SESSION_STORAGE_KEY, chunk.session_id);
        }
        addActivity("done", `Session ${chunk.session_id || "updated"}`);
        return;
    }

    if (chunkType === "error") {
        addActivity("error", chunk.content || "Unknown stream error");
        return;
    }

    addActivity("event", JSON.stringify(chunk));
}

function parseToolResultPayload(chunk) {
    if (typeof chunk?.tool_result === "string" && chunk.tool_result.trim()) {
        try {
            return JSON.parse(chunk.tool_result);
        } catch {
            return null;
        }
    }
    if (chunk?.tool_result && typeof chunk.tool_result === "object") {
        return chunk.tool_result;
    }
    return null;
}

async function handleExtensionDelegation(chunk) {
    const toolName = String(chunk?.tool_name || "").trim();
    const resultPayload = parseToolResultPayload(chunk);

    if (toolName === "run_browser_task" || toolName === "delegate_browser_task") {
        await maybeDelegateBrowserTask(resultPayload);
        return;
    }

    if (toolName === "register_browser_skill") {
        await maybeRegisterBrowserSkill(resultPayload);
    }
}

async function maybeDelegateBrowserTask(resultPayload) {
    const goal =
        resultPayload?.goal ||
        resultPayload?.instruction ||
        resultPayload?.task ||
        resultPayload?.payload?.goal ||
        "";

    if (!goal) {
        addActivity("browser_delegate", "Browser task request detected but no goal was found.");
        return;
    }

    addActivity("browser_delegate", `Delegating browser task: ${goal}`);
    await startBrowserAgent(goal);
}

async function maybeRegisterBrowserSkill(resultPayload) {
    const registration = resultPayload?.payload && typeof resultPayload.payload === "object"
        ? { ...resultPayload.payload, ...resultPayload }
        : (resultPayload || {});

    const response = await saveLatestBrowserRunAsSkill({
        title: registration.title,
        whenToUse: registration.when_to_use || registration.whenToUse,
        tags: registration.tags,
        targetGoal: registration.target_goal || registration.targetGoal,
        force: Boolean(registration.force)
    });

    if (!response.ok) {
        addActivity("skill", `Skill registration failed: ${response.error}`);
        return;
    }

    addActivity("skill", `Skill saved (${response.memoryId}).`);
}

async function fetchSessions() {
    sessionList.innerHTML = '<div class="loading-item">Fetching conversations...</div>';
    try {
        const response = await apiFetch("/chat/sessions", { method: "GET" });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const sessions = await response.json();
        sessionList.innerHTML = "";

        if (!Array.isArray(sessions) || sessions.length === 0) {
            sessionList.innerHTML = '<div class="loading-item">No recent chats found.</div>';
            return;
        }

        for (const session of sessions) {
            const item = document.createElement("div");
            item.className = `session-item ${session.session_id === currentSessionId ? "active" : ""}`;

            const dateStr = session.updated_at ? new Date(session.updated_at).toLocaleString() : "Recent";
            item.innerHTML = `
                <span class="session-title">${session.title || "Untitled Chat"}</span>
                <span class="session-date">${dateStr}</span>
            `;

            item.addEventListener("click", () => {
                toggleHistory(false);
                if (session.session_id !== currentSessionId) {
                    void loadHistory(session.session_id);
                }
            });

            sessionList.appendChild(item);
        }
    } catch (error) {
        sessionList.innerHTML = `<div class="loading-item">Error: ${error.message}</div>`;
    }
}

async function loadHistory(sessionId) {
    clearView();
    currentSessionId = sessionId;
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    setThinking(true);

    try {
        const response = await apiFetch(`/chat/history/${encodeURIComponent(sessionId)}`, {
            method: "GET"
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const messages = await response.json();
        if (!Array.isArray(messages) || messages.length === 0) {
            addMessage("assistant", "This session is empty. How can I help?");
            return;
        }

        for (const message of messages) {
            addMessage(message.role || "assistant", message.content || "");
        }
    } catch {
        addSystemMessage("Could not restore conversation. Starting fresh.");
        currentSessionId = null;
        localStorage.removeItem(SESSION_STORAGE_KEY);
    } finally {
        setThinking(false);
    }
}

function addMessage(role, text, imageBase64) {
    const messageDiv = document.createElement("div");
    messageDiv.className = `message ${role}`;

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    if (imageBase64) {
        const img = document.createElement("img");
        img.src = imageBase64;
        img.className = "message-image";
        contentDiv.appendChild(img);
    }

    if (text) {
        contentDiv.appendChild(document.createTextNode(text));
    }

    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
    return contentDiv;
}

function createAssistantMessageContainer() {
    const messageDiv = document.createElement("div");
    messageDiv.className = "message assistant";

    const contentDiv = document.createElement("div");
    contentDiv.className = "message-content";

    messageDiv.appendChild(contentDiv);
    messagesDiv.appendChild(messageDiv);
    scrollToBottom();
    return contentDiv;
}

function addSystemMessage(text) {
    const div = document.createElement("div");
    div.className = "message system";
    div.textContent = text;
    messagesDiv.appendChild(div);
    scrollToBottom();
}

function setThinking(value) {
    isThinking = value;
    if (value) {
        messagesDiv.appendChild(thinkingIndicator);
        thinkingIndicator.classList.remove("hidden");
    } else {
        thinkingIndicator.classList.add("hidden");
    }
    validateInput();
    scrollToBottom();
}

function validateInput() {
    const hasText = userInput.value.trim().length > 0;
    const hasImage = Boolean(currentCapture);
    sendBtn.disabled = !(hasText || hasImage) || isThinking;
}

function showPreview(dataUrl) {
    screenshotPreview.src = dataUrl;
    previewContainer.classList.remove("hidden");
    scrollToBottom();
}

function hidePreview() {
    screenshotPreview.src = "";
    previewContainer.classList.add("hidden");
}

function setCaptureLoading(loading) {
    captureBtn.disabled = loading;
    captureBtn.style.opacity = loading ? "0.5" : "1";
}

function scrollToBottom() {
    const stream = document.getElementById("chat-stream");
    stream.scrollTop = stream.scrollHeight;
}

function clearView() {
    const messages = Array.from(messagesDiv.children).filter((child) => child.id !== "thinking");
    for (const message of messages) {
        message.remove();
    }

    userInput.value = "";
    userInput.style.height = "auto";
    currentCapture = null;
    hidePreview();
    validateInput();
}

function connectBrowserPort() {
    try {
        const port = chrome.runtime.connect({ name: "sidepanel" });
        browserPort = port;

        port.onMessage.addListener((message) => {
            handleBrowserPortMessage(message);
        });

        port.onDisconnect.addListener(() => {
            browserPort = null;
            window.setTimeout(connectBrowserPort, 1200);
        });
    } catch (error) {
        addActivity("browser", `Port connection failed: ${error.message}`);
    }
}

function handleBrowserPortMessage(message) {
    if (!message || typeof message !== "object") {
        return;
    }

    if (message.type === "agent.status") {
        const payload = message.payload || {};
        browserStatus.running = Boolean(payload.running);
        browserStatus.step = Number(payload.step) || 0;
        handleBrowserStatusTransition(browserStatus);
        updateBrowserAgentBadge();
        return;
    }

    if (message.type === "chat.history") {
        const payload = Array.isArray(message.payload) ? message.payload : [];
        syncBrowserRunFromHistory(payload);
        return;
    }

    if (message.type === "chat.message") {
        const payload = message.payload || {};
        const role = payload.role || "system";
        const text = payload.text || "";
        const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : {};

        appendBrowserRunMessage(payload);

        if (meta.kind === "screenshot" && typeof meta.imageDataUrl === "string") {
            addMessage("assistant", text || "Screenshot captured.", meta.imageDataUrl);
            addActivity(`browser:${role}`, text || "Screenshot captured");
            return;
        }

        if (text) {
            addActivity(`browser:${role}`, text);
        }
        return;
    }

    if (message.type === "approval.requested") {
        addActivity("browser:approval", "Manual approval required in browser agent.");
        return;
    }
}

function buildBrowserRunId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return `br-${crypto.randomUUID()}`;
    }
    return `br-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function beginBrowserRun(goal, source) {
    const normalizedGoal = String(goal || "").trim() || "Browser task";
    currentBrowserRun = {
        id: buildBrowserRunId(),
        goal: normalizedGoal,
        source: source || "manual",
        startedAt: Date.now(),
        endedAt: null,
        messages: []
    };
}

function finalizeCurrentBrowserRun(reason = "") {
    if (!currentBrowserRun) {
        return;
    }
    currentBrowserRun.endedAt = Date.now();
    if (reason) {
        currentBrowserRun.endReason = reason;
    }
    browserRunHistory.push(currentBrowserRun);
    if (browserRunHistory.length > MAX_BROWSER_RUN_HISTORY) {
        browserRunHistory = browserRunHistory.slice(-MAX_BROWSER_RUN_HISTORY);
    }
    currentBrowserRun = null;
}

function handleBrowserStatusTransition(status) {
    const running = Boolean(status?.running);

    if (running && !lastBrowserStatus.running && !currentBrowserRun) {
        beginBrowserRun("Browser task", "external");
    }
    if (!running && lastBrowserStatus.running) {
        finalizeCurrentBrowserRun("stopped");
    }

    lastBrowserStatus = {
        running,
        step: Number(status?.step) || 0
    };
}

function normalizeBrowserRunMessage(payload) {
    const safePayload = payload && typeof payload === "object" ? payload : {};
    const meta = safePayload.meta && typeof safePayload.meta === "object" ? safePayload.meta : {};

    return {
        role: String(safePayload.role || "system"),
        text: String(safePayload.text || ""),
        at: Number(safePayload.at) || Date.now(),
        kind: String(meta.kind || ""),
        imageDataUrl: typeof meta.imageDataUrl === "string" ? meta.imageDataUrl : "",
        meta
    };
}

function appendBrowserRunMessage(payload) {
    if (!currentBrowserRun) {
        beginBrowserRun("Browser task", "recovered");
    }
    if (!currentBrowserRun) {
        return;
    }
    currentBrowserRun.messages.push(normalizeBrowserRunMessage(payload));
}

function syncBrowserRunFromHistory(historyMessages) {
    if (!Array.isArray(historyMessages) || historyMessages.length === 0) {
        return;
    }

    const normalized = historyMessages
        .map((message) => normalizeBrowserRunMessage(message))
        .filter((message) => message.text || message.imageDataUrl);

    if (normalized.length === 0) {
        return;
    }

    if (!currentBrowserRun) {
        beginBrowserRun("Recovered browser task", "history");
    }
    if (currentBrowserRun && currentBrowserRun.messages.length === 0) {
        currentBrowserRun.messages = normalized.slice(-200);
    }
}

async function runBrowserGoalFromInput() {
    const goal = browserGoalInput.value.trim();
    if (!goal) {
        return;
    }

    browserGoalInput.value = "";
    await startBrowserAgent(goal);
}

async function startBrowserAgent(goal) {
    const payload = {
        goal,
        config: buildBrowserAgentConfig()
    };

    let response;
    if (browserStatus.running) {
        response = await sendRuntimeMessage({
            type: "agent.instruction",
            payload: { text: goal }
        });
        if (response?.ok) {
            appendBrowserRunMessage({
                role: "user",
                text: goal,
                at: Date.now(),
                meta: { kind: "instruction" }
            });
            addActivity("browser", `Instruction sent: ${goal}`);
            return;
        }
    }

    beginBrowserRun(goal, "start");
    response = await sendRuntimeMessage({
        type: "agent.start",
        payload
    });

    if (!response?.ok) {
        finalizeCurrentBrowserRun("start_failed");
        addActivity("browser", `Start failed: ${response?.error || "unknown error"}`);
        return;
    }

    addActivity("browser", `Started browser task: ${goal}`);
}

async function stopBrowserAgent() {
    const response = await sendRuntimeMessage({ type: "agent.stop" });
    if (!response?.ok) {
        addActivity("browser", `Stop failed: ${response?.error || "unknown error"}`);
        return;
    }
    finalizeCurrentBrowserRun("user_stop");
    addActivity("browser", "Browser agent stopped.");
}

function buildBrowserAgentConfig() {
    const normalizedSettings = normalizeSettings(settings);
    const provider = normalizeBrowserProvider(normalizedSettings.browserProvider);
    const providerModelMap = normalizeProviderModelMap(normalizedSettings.browserModelByProvider);
    const config = {
        provider,
        model: getProviderModel(provider, providerModelMap),
        providerModels: providerModelMap,
        responseLanguage: "Japanese",
        apiBaseUrl: normalizedSettings.browserApiBaseUrl,
        bedrockRegion: normalizedSettings.browserBedrockRegion,
        bedrockAccessKeyId: normalizedSettings.browserBedrockAccessKeyId,
        bedrockSecretAccessKey: normalizedSettings.browserBedrockSecretAccessKey,
        bedrockSessionToken: normalizedSettings.browserBedrockSessionToken,
        includeScreenshotsInPrompt: true,
        blockHighRisk: false,
        keepTabFocused: true
    };

    if (provider === BROWSER_PROVIDERS.GEMINI_DIRECT) {
        config.apiKeyGemini = normalizedSettings.browserApiKey;
        config.apiKeyLiteLLM = "";
    } else if (provider === BROWSER_PROVIDERS.LITELLM) {
        config.apiKeyLiteLLM = normalizedSettings.browserApiKey;
        config.apiKeyGemini = "";
    } else {
        config.apiKeyLiteLLM = "";
        config.apiKeyGemini = "";
    }

    return config;
}

function normalizeSkillTags(rawTags) {
    if (!Array.isArray(rawTags)) {
        return ["browser", "automation", "skill"];
    }

    const deduped = [];
    for (const rawTag of rawTags) {
        const tag = String(rawTag || "").trim();
        if (!tag) {
            continue;
        }
        if (!deduped.includes(tag)) {
            deduped.push(tag);
        }
    }
    if (deduped.length === 0) {
        return ["browser", "automation", "skill"];
    }
    return deduped.slice(0, 12);
}

function buildSkillTitle(run, preferredTitle) {
    const base = String(preferredTitle || "").trim();
    if (base) {
        return base.slice(0, 120);
    }
    const goal = String(run?.goal || "").trim();
    if (!goal) {
        return "Browser Operation Skill";
    }
    return `Browser SOP: ${goal}`.slice(0, 120);
}

function buildWhenToUse(run, preferredWhenToUse) {
    const base = String(preferredWhenToUse || "").trim();
    if (base) {
        return base.slice(0, 360);
    }
    const goal = String(run?.goal || "").trim();
    if (!goal) {
        return "Use this skill when a browser workflow must be executed reliably.";
    }
    return `Use this when you need to complete: ${goal}`.slice(0, 360);
}

function findBrowserRunByGoal(targetGoal) {
    const normalizedTarget = String(targetGoal || "").trim().toLowerCase();
    if (!normalizedTarget) {
        return null;
    }

    const candidates = [];
    if (currentBrowserRun) {
        candidates.push(currentBrowserRun);
    }
    for (let i = browserRunHistory.length - 1; i >= 0; i -= 1) {
        candidates.push(browserRunHistory[i]);
    }

    for (const run of candidates) {
        const goal = String(run?.goal || "").trim().toLowerCase();
        if (!goal) {
            continue;
        }
        if (goal.includes(normalizedTarget) || normalizedTarget.includes(goal)) {
            return run;
        }
    }
    return null;
}

function getLatestBrowserRunForSkill(options = {}) {
    if (options.targetGoal) {
        const matched = findBrowserRunByGoal(options.targetGoal);
        if (matched) {
            return matched;
        }
    }

    if (currentBrowserRun && currentBrowserRun.messages.length > 0 && !browserStatus.running) {
        return currentBrowserRun;
    }

    for (let i = browserRunHistory.length - 1; i >= 0; i -= 1) {
        const run = browserRunHistory[i];
        if (run && Array.isArray(run.messages) && run.messages.length > 0) {
            return run;
        }
    }

    if (options.force && currentBrowserRun && currentBrowserRun.messages.length > 0) {
        return currentBrowserRun;
    }

    return null;
}

function extractSkillStepsFromRun(run) {
    const steps = [];
    const seen = new Set();
    const messages = Array.isArray(run?.messages) ? run.messages : [];

    for (const message of messages) {
        const role = String(message?.role || "");
        if (role !== "assistant" && role !== "system") {
            continue;
        }
        if (String(message?.kind || "") === "screenshot") {
            continue;
        }

        const text = String(message?.text || "").trim();
        if (!text) {
            continue;
        }

        const firstLine = text
            .split(/\r?\n/)
            .map((line) => String(line || "").trim())
            .find((line) => line);
        if (!firstLine) {
            continue;
        }

        if (firstLine.startsWith("Session ") || firstLine === "Agent started.") {
            continue;
        }
        if (firstLine.startsWith("State change:")) {
            continue;
        }
        if (firstLine.startsWith("Scroll progress is too small")) {
            continue;
        }

        let normalized = firstLine.replace(/^Step\s+\d+\s*:\s*/i, "").trim();
        normalized = normalized.replace(/^Reason:\s*/i, "").trim();
        if (!normalized) {
            continue;
        }
        if (normalized.length > 220) {
            normalized = `${normalized.slice(0, 217)}...`;
        }

        const key = normalized.toLowerCase();
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        steps.push(normalized);

        if (steps.length >= MAX_SKILL_STEP_LINES) {
            break;
        }
    }

    if (steps.length === 0) {
        steps.push(`Open the target page and complete the goal: ${String(run?.goal || "Browser task")}`);
    }
    return steps;
}

function extractSkillScreenshotsFromRun(run) {
    const screenshots = [];
    const seenDataUrl = new Set();
    const messages = Array.isArray(run?.messages) ? run.messages : [];

    for (const message of messages) {
        if (String(message?.kind || "") !== "screenshot") {
            continue;
        }
        const dataUrl = String(message?.imageDataUrl || "").trim();
        if (!dataUrl || !dataUrl.startsWith("data:image/")) {
            continue;
        }
        if (seenDataUrl.has(dataUrl)) {
            continue;
        }
        seenDataUrl.add(dataUrl);

        screenshots.push({
            label: String(message?.text || `Screenshot ${screenshots.length + 1}`),
            dataUrl
        });

        if (screenshots.length >= MAX_SKILL_SCREENSHOTS) {
            break;
        }
    }

    return screenshots;
}

function composeSkillContentRaw({ title, whenToUse, run, steps, screenshotUrls }) {
    const lines = [
        `# ${title}`,
        "",
        "## When to use",
        whenToUse,
        "",
        "## Content",
        "### Goal",
        String(run?.goal || "Browser task"),
        "",
        "### Procedure",
        ...steps.map((step, index) => `${index + 1}. ${step}`)
    ];

    if (screenshotUrls.length > 0) {
        lines.push("");
        lines.push("### Visual checkpoints");
        for (const shot of screenshotUrls) {
            lines.push(`- ${shot.label}: ![${shot.alt}](${shot.url})`);
        }
    }

    lines.push("");
    lines.push("### Notes");
    lines.push(`- Recorded from browser run on ${new Date(run?.startedAt || Date.now()).toISOString()}`);
    if (run?.source) {
        lines.push(`- Source: ${run.source}`);
    }

    return lines.join("\n");
}

function composeSkillContent({ title, whenToUse, run, steps, screenshotUrls }) {
    let trimmedShots = [...screenshotUrls];
    let trimmedSteps = [...steps];

    let content = composeSkillContentRaw({
        title,
        whenToUse,
        run,
        steps: trimmedSteps,
        screenshotUrls: trimmedShots
    });
    if (content.length <= MAX_SKILL_CONTENT_LENGTH) {
        return content;
    }

    while (trimmedShots.length > 0 && content.length > MAX_SKILL_CONTENT_LENGTH) {
        trimmedShots = trimmedShots.slice(0, -1);
        content = composeSkillContentRaw({
            title,
            whenToUse,
            run,
            steps: trimmedSteps,
            screenshotUrls: trimmedShots
        });
    }

    while (trimmedSteps.length > 2 && content.length > MAX_SKILL_CONTENT_LENGTH) {
        trimmedSteps = trimmedSteps.slice(0, -1);
        content = composeSkillContentRaw({
            title,
            whenToUse,
            run,
            steps: trimmedSteps,
            screenshotUrls: []
        });
    }

    if (content.length <= MAX_SKILL_CONTENT_LENGTH) {
        return content;
    }

    return `${content.slice(0, MAX_SKILL_CONTENT_LENGTH - 3)}...`;
}

async function uploadSkillScreenshotCapture(entry, run, index) {
    const capturePayload = {
        content_type: "TEXT",
        raw_text: JSON.stringify({
            type: "BROWSER_SKILL_SCREENSHOT",
            goal: String(run?.goal || ""),
            run_id: String(run?.id || ""),
            index,
            label: entry.label
        }),
        base64_image: entry.dataUrl
    };

    const response = await apiFetch("/captures", {
        method: "POST",
        body: capturePayload
    });

    if (!response.ok) {
        throw new Error(`Screenshot upload failed (HTTP ${response.status})`);
    }

    const capture = await response.json();
    const contentUrl = String(capture?.content_url || "").trim();
    if (!contentUrl) {
        throw new Error("Screenshot upload succeeded but content_url is empty.");
    }
    return contentUrl;
}

async function saveLatestBrowserRunAsSkill(options = {}) {
    const run = getLatestBrowserRunForSkill(options);
    if (!run) {
        return { ok: false, error: "No completed browser run with logs was found." };
    }

    const title = buildSkillTitle(run, options.title);
    const whenToUse = buildWhenToUse(run, options.whenToUse);
    const tags = normalizeSkillTags(options.tags);
    const steps = extractSkillStepsFromRun(run);
    const screenshotEntries = extractSkillScreenshotsFromRun(run);

    const screenshotUrls = [];
    for (let i = 0; i < screenshotEntries.length; i += 1) {
        const entry = screenshotEntries[i];
        try {
            const url = await uploadSkillScreenshotCapture(entry, run, i + 1);
            screenshotUrls.push({
                label: entry.label || `Screenshot ${i + 1}`,
                alt: `Browser step ${i + 1}`,
                url
            });
        } catch (error) {
            addActivity("skill", `Screenshot ${i + 1} skipped: ${error.message}`);
        }
    }

    const content = composeSkillContent({
        title,
        whenToUse,
        run,
        steps,
        screenshotUrls
    });

    const memoryPayload = {
        content,
        scope: "WORK",
        memory_type: "RULE",
        tags,
        source: "agent"
    };

    const response = await apiFetch("/memories", {
        method: "POST",
        body: memoryPayload
    });

    if (!response.ok) {
        return { ok: false, error: `Skill creation failed (HTTP ${response.status})` };
    }

    const memory = await response.json();
    return {
        ok: true,
        memoryId: String(memory?.id || ""),
        title,
        screenshots: screenshotUrls.length
    };
}

function updateBrowserAgentBadge() {
    browserAgentBadge.classList.toggle("running", browserStatus.running);
    browserAgentBadge.classList.toggle("idle", !browserStatus.running);
    browserStopBtn.disabled = !browserStatus.running;

    if (!browserStatus.running) {
        browserAgentBadge.textContent = "Idle";
        return;
    }
    browserAgentBadge.textContent = `Running step ${browserStatus.step}`;
}

function addActivity(type, message) {
    const line = document.createElement("div");
    line.className = "activity-item";
    line.textContent = `[${new Date().toLocaleTimeString()}] ${type}: ${message}`;
    activityLog.appendChild(line);

    const maxItems = 120;
    while (activityLog.children.length > maxItems) {
        activityLog.removeChild(activityLog.firstElementChild);
    }

    activityLog.scrollTop = activityLog.scrollHeight;
}

async function apiFetch(path, options = {}) {
    const currentSettings = normalizeSettings(options.settingsOverride || settings);
    const base = currentSettings.apiBaseUrl.replace(/\/$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${base}${cleanPath}`;

    const headers = {
        ...(options.headers || {})
    };

    const request = {
        method: options.method || "GET",
        headers
    };

    let cookieAuthMeta = null;

    if (currentSettings.authMode === "bearer") {
        const token = currentSettings.accessToken || DEFAULT_BEARER_TOKEN;
        request.headers.Authorization = `Bearer ${token}`;
    } else {
        request.credentials = "include";
        cookieAuthMeta = await resolveAppSessionTokenWithMeta(currentSettings);
        if (cookieAuthMeta.token) {
            request.headers.Authorization = `Bearer ${cookieAuthMeta.token}`;
        }
    }

    if (options.body !== undefined) {
        request.headers["Content-Type"] = "application/json";
        request.body = JSON.stringify(options.body);
    }

    let response = await fetch(url, request);

    if (currentSettings.authMode === "cookie" && response.status === 401) {
        const previousToken = cookieAuthMeta?.token || "";
        clearAppTokenCache();

        const refreshedAuthMeta = await resolveAppSessionTokenWithMeta(currentSettings, {
            forceRefresh: true
        });
        const refreshedToken = refreshedAuthMeta.token || "";

        if (refreshedToken && refreshedToken !== previousToken) {
            const retryRequest = {
                ...request,
                headers: {
                    ...request.headers,
                    Authorization: `Bearer ${refreshedToken}`
                }
            };
            response = await fetch(url, retryRequest);
        }
    }

    return response;
}

function normalizeBaseUrl(value, fallback) {
    const text = String(value || "").trim();
    if (!text) {
        return fallback;
    }
    try {
        const parsed = new URL(text);
        return parsed.toString().replace(/\/$/, "");
    } catch {
        return fallback;
    }
}

function clearAppTokenCache() {
    appTokenCache = {
        origin: "",
        token: "",
        expiresAt: 0
    };
}

function extractOrigin(urlText) {
    try {
        return new URL(urlText).origin;
    } catch {
        return "";
    }
}

function isHttpUrl(urlText) {
    return typeof urlText === "string" && /^https?:\/\//i.test(urlText);
}

function getManualFallbackToken(currentSettings) {
    const token = String(currentSettings.accessToken || "").trim();
    if (!token) {
        return "";
    }
    if (token === DEFAULT_BEARER_TOKEN) {
        return "";
    }
    return token;
}

function decodeBase64Url(base64Url) {
    const normalized = String(base64Url || "")
        .replace(/-/g, "+")
        .replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return atob(padded);
}

function parseJwtExpiryMs(token) {
    try {
        const parts = String(token || "").split(".");
        if (parts.length < 2) {
            return 0;
        }
        const payloadRaw = decodeBase64Url(parts[1]);
        const payload = JSON.parse(payloadRaw);
        const expSeconds = Number(payload?.exp);
        if (!Number.isFinite(expSeconds) || expSeconds <= 0) {
            return 0;
        }
        return expSeconds * 1000;
    } catch {
        return 0;
    }
}

function computeTokenCacheExpiry(token, nowMs) {
    const ttlExpiry = nowMs + APP_TOKEN_CACHE_TTL_MS;
    const jwtExpiry = parseJwtExpiryMs(token);

    if (!jwtExpiry) {
        return ttlExpiry;
    }

    const safetyMs = 5 * 1000;
    return Math.max(nowMs + 1, Math.min(ttlExpiry, jwtExpiry - safetyMs));
}

async function resolveAppSessionTokenWithMeta(currentSettings, options = {}) {
    const appOrigin = extractOrigin(currentSettings.appBaseUrl);
    const manualFallback = getManualFallbackToken(currentSettings);

    if (!appOrigin) {
        return {
            token: manualFallback,
            source: manualFallback ? "manual_fallback" : "none",
            reason: "invalid_app_base_url",
            appOrigin: "",
            candidateCount: 0
        };
    }

    const now = Date.now();
    if (
        !options.forceRefresh &&
        appTokenCache.origin === appOrigin &&
        appTokenCache.expiresAt > now &&
        appTokenCache.token
    ) {
        return {
            token: appTokenCache.token,
            source: "cache",
            reason: "",
            appOrigin,
            candidateCount: 0
        };
    }

    const candidateTabs = await listCandidateAppTabs(appOrigin);

    for (const tab of candidateTabs) {
        const tokenResult = await readAuthTokenFromTab(tab.id);
        if (!tokenResult.token) {
            continue;
        }

        appTokenCache = {
            origin: appOrigin,
            token: tokenResult.token,
            expiresAt: computeTokenCacheExpiry(tokenResult.token, now)
        };

        return {
            token: tokenResult.token,
            source: "app_tab",
            reason: "",
            appOrigin,
            candidateCount: candidateTabs.length,
            tabId: tab.id,
            tabUrl: tab.url || "",
            storage: tokenResult.storage || "",
            key: tokenResult.key || ""
        };
    }

    if (manualFallback) {
        return {
            token: manualFallback,
            source: "manual_fallback",
            reason: "manual_fallback",
            appOrigin,
            candidateCount: candidateTabs.length
        };
    }

    return {
        token: "",
        source: "none",
        reason: candidateTabs.length === 0 ? "no_candidate_tabs" : "token_not_found",
        appOrigin,
        candidateCount: candidateTabs.length
    };
}

function buildCookieAuthErrorMessage(authMeta, candidateSettings) {
    const appOrigin = extractOrigin(candidateSettings.appBaseUrl) || candidateSettings.appBaseUrl || "(invalid)";

    if (!authMeta) {
        return "HTTP 401 (App session auth failed)";
    }

    if (authMeta.reason === "invalid_app_base_url") {
        return "HTTP 401 (Invalid App Base URL. Update settings and retry)";
    }

    if (authMeta.reason === "no_candidate_tabs") {
        return `HTTP 401 (No open app tab for ${appOrigin}. Open/login app tab, then retry)`;
    }

    if (authMeta.reason === "token_not_found") {
        return "HTTP 401 (App tab found but no auth token in storage. Keep logged-in app tab open, then retry)";
    }

    if (
        authMeta.source === "cache" ||
        authMeta.source === "app_tab" ||
        authMeta.source === "manual_fallback"
    ) {
        return "HTTP 401 (Session token was sent but rejected. Please log in again)";
    }

    return "HTTP 401 (App session auth failed)";
}

async function listCandidateAppTabs(appOrigin) {
    const tabs = await queryTabs();
    const appUrl = new URL(appOrigin);
    const candidates = [];

    for (const tab of tabs) {
        if (!tab || !tab.id || !isHttpUrl(tab.url)) {
            continue;
        }

        let parsed;
        try {
            parsed = new URL(tab.url);
        } catch {
            continue;
        }

        let score = -1;
        if (parsed.origin === appOrigin) {
            score = 300;
        } else if (parsed.host === appUrl.host) {
            score = 200;
        } else if (parsed.hostname === appUrl.hostname) {
            score = 100;
        } else {
            continue;
        }

        if (tab.active) {
            score += 30;
        }
        if (parsed.pathname.startsWith("/login")) {
            score += 10;
        }

        candidates.push({
            tab,
            score,
            lastAccessed: Number(tab.lastAccessed) || 0
        });
    }

    candidates.sort((a, b) => {
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return b.lastAccessed - a.lastAccessed;
    });

    return candidates.map((item) => item.tab);
}

async function queryTabs() {
    return new Promise((resolve) => {
        chrome.tabs.query({}, (results) => {
            const err = chrome.runtime.lastError;
            if (err) {
                resolve([]);
                return;
            }
            resolve(Array.isArray(results) ? results : []);
        });
    });
}

async function readAuthTokenFromTab(tabId) {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: (keys) => {
                    const stores = [
                        ["localStorage", window.localStorage],
                        ["sessionStorage", window.sessionStorage]
                    ];

                    for (const [storageName, storage] of stores) {
                        try {
                            for (const key of keys) {
                                const value = storage.getItem(key);
                                if (typeof value === "string" && value.trim()) {
                                    return {
                                        token: value.trim(),
                                        key,
                                        storage: storageName
                                    };
                                }
                            }
                        } catch {
                            // Continue to next storage bucket.
                        }
                    }

                    return {
                        token: "",
                        key: "",
                        storage: ""
                    };
                },
                args: [APP_AUTH_TOKEN_KEYS]
            },
            (result) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    resolve({ token: "", key: "", storage: "" });
                    return;
                }

                const payload = result?.[0]?.result;
                if (!payload || typeof payload !== "object") {
                    resolve({ token: "", key: "", storage: "" });
                    return;
                }

                resolve({
                    token: typeof payload.token === "string" ? payload.token : "",
                    key: typeof payload.key === "string" ? payload.key : "",
                    storage: typeof payload.storage === "string" ? payload.storage : ""
                });
            }
        );
    });
}

async function refreshCookieAuthHint() {
    const candidateSettings = readSettingsFromUI();
    if (candidateSettings.authMode !== "cookie") {
        return;
    }

    const authMeta = await resolveAppSessionTokenWithMeta(candidateSettings, {
        forceRefresh: true
    });

    if (authMeta.token) {
        const sourceLabel =
            authMeta.source === "app_tab"
                ? `app tab (${authMeta.storage || "storage"}:${authMeta.key || "token"})`
                : authMeta.source;
        settingsHint.textContent = `Session token ready from ${sourceLabel}.`;
        return;
    }

    settingsHint.textContent = buildCookieAuthErrorMessage(authMeta, candidateSettings);
}

function storageGet(keys) {
    return new Promise((resolve) => {
        chrome.storage.local.get(keys, (result) => {
            resolve(result || {});
        });
    });
}

function storageSet(value) {
    return new Promise((resolve) => {
        chrome.storage.local.set(value, () => {
            resolve();
        });
    });
}

function sendRuntimeMessage(message) {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage(message, (response) => {
            const err = chrome.runtime.lastError;
            if (err) {
                resolve({ ok: false, error: err.message });
                return;
            }
            resolve(response);
        });
    });
}
