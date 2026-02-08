const SETTINGS_STORAGE_KEY = "secretary_extension_settings_v1";
const SESSION_STORAGE_KEY = "session_id";
const APP_AUTH_TOKEN_KEYS = ["auth_token", "id_token", "access_token"];
const APP_TOKEN_CACHE_TTL_MS = 60 * 1000;

const DEFAULT_SETTINGS = Object.freeze({
    appBaseUrl: "http://localhost:3000",
    apiBaseUrl: "http://localhost:8000/api",
    authMode: "bearer",
    accessToken: "dev_user",
    browserProvider: "gemini_direct",
    browserModel: "gemini-2.5-flash",
    browserApiKey: "",
    browserApiBaseUrl: "http://localhost:4000"
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
const browserApiKeyInput = document.getElementById("browser-api-key");
const browserApiBaseUrlInput = document.getElementById("browser-api-base-url");
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

function normalizeSettings(input) {
    const next = { ...DEFAULT_SETTINGS, ...(input || {}) };
    next.appBaseUrl = normalizeBaseUrl(next.appBaseUrl, DEFAULT_SETTINGS.appBaseUrl);
    next.apiBaseUrl = normalizeBaseUrl(next.apiBaseUrl, DEFAULT_SETTINGS.apiBaseUrl);
    next.authMode = next.authMode === "cookie" ? "cookie" : "bearer";
    next.accessToken = String(next.accessToken || "").trim();

    const provider = String(next.browserProvider || "").trim().toLowerCase();
    if (provider === "litellm" || provider === "gemini_direct") {
        next.browserProvider = provider;
    } else {
        next.browserProvider = DEFAULT_SETTINGS.browserProvider;
    }

    next.browserModel = String(next.browserModel || DEFAULT_SETTINGS.browserModel).trim();
    next.browserApiKey = String(next.browserApiKey || "").trim();
    next.browserApiBaseUrl = normalizeBaseUrl(next.browserApiBaseUrl, DEFAULT_SETTINGS.browserApiBaseUrl);
    return next;
}

function applySettingsToUI() {
    appBaseUrlInput.value = settings.appBaseUrl;
    apiBaseUrlInput.value = settings.apiBaseUrl;
    authModeSelect.value = settings.authMode;
    accessTokenInput.value = settings.accessToken;
    browserProviderSelect.value = settings.browserProvider;
    browserModelInput.value = settings.browserModel;
    browserApiKeyInput.value = settings.browserApiKey;
    browserApiBaseUrlInput.value = settings.browserApiBaseUrl;
    syncAuthModeUi();
}

function readSettingsFromUI() {
    return normalizeSettings({
        appBaseUrl: appBaseUrlInput.value,
        apiBaseUrl: apiBaseUrlInput.value,
        authMode: authModeSelect.value,
        accessToken: accessTokenInput.value,
        browserProvider: browserProviderSelect.value,
        browserModel: browserModelInput.value,
        browserApiKey: browserApiKeyInput.value,
        browserApiBaseUrl: browserApiBaseUrlInput.value
    });
}

function syncAuthModeUi() {
    const cookieMode = authModeSelect.value === "cookie";
    tokenField.classList.toggle("hidden", cookieMode);
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
                throw new Error("HTTP 401 (App token not found. Keep app tab open, log in, then Test again)");
            }
            throw new Error(`HTTP ${response.status}`);
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
    await chrome.tabs.create({ url: loginUrl });
    settingsHint.textContent = "Opened login page. After login, return and click Test.";
}

function toggleHistory(show) {
    historyPanel.classList.toggle("hidden", !show);
}

function toggleSettings(show) {
    settingsPanel.classList.toggle("hidden", !show);
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
        await maybeDelegateBrowserTask(chunk);
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

async function maybeDelegateBrowserTask(chunk) {
    const toolName = String(chunk?.tool_name || "").trim();
    if (toolName !== "run_browser_task" && toolName !== "delegate_browser_task") {
        return;
    }

    let resultPayload = null;
    if (typeof chunk.tool_result === "string" && chunk.tool_result.trim()) {
        try {
            resultPayload = JSON.parse(chunk.tool_result);
        } catch {
            resultPayload = null;
        }
    } else if (chunk.tool_result && typeof chunk.tool_result === "object") {
        resultPayload = chunk.tool_result;
    }

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
        updateBrowserAgentBadge();
        return;
    }

    if (message.type === "chat.message") {
        const payload = message.payload || {};
        const role = payload.role || "system";
        const text = payload.text || "";
        if (!text) {
            return;
        }
        addActivity(`browser:${role}`, text);
        return;
    }

    if (message.type === "approval.requested") {
        addActivity("browser:approval", "Manual approval required in browser agent.");
        return;
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
            addActivity("browser", `Instruction sent: ${goal}`);
            return;
        }
    }

    response = await sendRuntimeMessage({
        type: "agent.start",
        payload
    });

    if (!response?.ok) {
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
    addActivity("browser", "Browser agent stopped.");
}

function buildBrowserAgentConfig() {
    const provider = settings.browserProvider;
    const config = {
        provider,
        model: settings.browserModel,
        responseLanguage: "Japanese",
        apiBaseUrl: settings.browserApiBaseUrl,
        includeScreenshotsInPrompt: true,
        blockHighRisk: false,
        keepTabFocused: true
    };

    if (provider === "gemini_direct") {
        config.apiKeyGemini = settings.browserApiKey;
        config.apiKeyLiteLLM = "";
    } else {
        config.apiKeyLiteLLM = settings.browserApiKey;
        config.apiKeyGemini = "";
    }

    return config;
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

    if (currentSettings.authMode === "bearer") {
        const token = currentSettings.accessToken || "dev_user";
        request.headers.Authorization = `Bearer ${token}`;
    } else {
        request.credentials = "include";
        const sessionToken = await resolveAppSessionToken(currentSettings);
        if (sessionToken) {
            request.headers.Authorization = `Bearer ${sessionToken}`;
        }
    }

    if (options.body !== undefined) {
        request.headers["Content-Type"] = "application/json";
        request.body = JSON.stringify(options.body);
    }

    return fetch(url, request);
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

async function resolveAppSessionToken(currentSettings) {
    const explicit = String(currentSettings.accessToken || "").trim();
    if (explicit) {
        return explicit;
    }

    const appOrigin = extractOrigin(currentSettings.appBaseUrl);
    if (!appOrigin) {
        return "";
    }

    const now = Date.now();
    if (
        appTokenCache.origin === appOrigin &&
        appTokenCache.expiresAt > now &&
        appTokenCache.token
    ) {
        return appTokenCache.token;
    }

    const appTab = await findAppTab(appOrigin);
    if (!appTab || !appTab.id) {
        return "";
    }

    const token = await readAuthTokenFromTab(appTab.id);
    if (!token) {
        return "";
    }

    appTokenCache = {
        origin: appOrigin,
        token,
        expiresAt: now + APP_TOKEN_CACHE_TTL_MS
    };
    return token;
}

async function findAppTab(appOrigin) {
    const tabs = await new Promise((resolve) => {
        chrome.tabs.query({}, (results) => {
            resolve(Array.isArray(results) ? results : []);
        });
    });

    const matchingTabs = tabs.filter((tab) => {
        if (!tab || !tab.url) {
            return false;
        }
        try {
            return new URL(tab.url).origin === appOrigin;
        } catch {
            return false;
        }
    });

    if (matchingTabs.length === 0) {
        return null;
    }

    const activeTab = matchingTabs.find((tab) => tab.active);
    return activeTab || matchingTabs[0] || null;
}

async function readAuthTokenFromTab(tabId) {
    return new Promise((resolve) => {
        chrome.scripting.executeScript(
            {
                target: { tabId },
                func: (keys) => {
                    try {
                        for (const key of keys) {
                            const value = window.localStorage.getItem(key);
                            if (typeof value === "string" && value.trim()) {
                                return value.trim();
                            }
                        }
                    } catch {
                        return "";
                    }
                    return "";
                },
                args: [APP_AUTH_TOKEN_KEYS]
            },
            (result) => {
                const err = chrome.runtime.lastError;
                if (err) {
                    resolve("");
                    return;
                }
                const value = result?.[0]?.result;
                resolve(typeof value === "string" ? value : "");
            }
        );
    });
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
