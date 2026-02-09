const SETTINGS_STORAGE_KEY = "secretary_extension_settings_v1";
const SESSION_STORAGE_KEY = "session_id";
const APPROVAL_MODE_STORAGE_KEY = "aiApprovalMode";
const APP_AUTH_TOKEN_KEYS = ["auth_token", "id_token", "access_token"];
const APP_TOKEN_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_BEARER_TOKEN = "dev_user";
const APPROVAL_MODES = Object.freeze({
    MANUAL: "manual",
    AUTO: "auto"
});
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
const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024;

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
let currentAttachment = null;
let isThinking = false;
let currentSessionId = localStorage.getItem(SESSION_STORAGE_KEY);
let browserPort = null;
let browserStatus = {
    running: false,
    step: 0,
    mode: "idle"
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
let approvalMode = normalizeApprovalMode(localStorage.getItem(APPROVAL_MODE_STORAGE_KEY));
let pendingProposals = [];
let pendingProposalIndex = 0;
let proposalApprovedBuffer = [];
let proposalProcessing = false;
let pendingQuestions = null;
let questionAnswers = {};
let captureLoading = false;

const messagesDiv = document.getElementById("messages");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const uploadFileBtn = document.getElementById("upload-file-btn");
const fileUploadInput = document.getElementById("file-upload-input");
const captureBtn = document.getElementById("capture-btn");
const newChatBtn = document.getElementById("new-chat-btn");
const historyBtn = document.getElementById("history-btn");
const closeHistoryBtn = document.getElementById("close-history");
const settingsBtn = document.getElementById("settings-btn");
const closeSettingsBtn = document.getElementById("close-settings");
const thinkingIndicator = document.getElementById("thinking");
const previewContainer = document.getElementById("preview-container");
const screenshotPreview = document.getElementById("screenshot-preview");
const filePreviewBadge = document.getElementById("file-preview-badge");
const previewTypeLabel = document.getElementById("preview-type");
const removeScreenshotBtn = document.getElementById("remove-screenshot");
const historyPanel = document.getElementById("history-panel");
const sessionList = document.getElementById("session-list");
const settingsPanel = document.getElementById("settings-panel");
const statusDot = document.getElementById("status");
const statusText = document.querySelector(".status-text");
const settingsHint = document.getElementById("settings-hint");
const approvalManualBtn = document.getElementById("approval-manual-btn");
const approvalAutoBtn = document.getElementById("approval-auto-btn");
const interactionPanel = document.getElementById("interaction-panel");
const proposalPanel = document.getElementById("proposal-panel");
const proposalTypeBadge = document.getElementById("proposal-type-badge");
const proposalDescription = document.getElementById("proposal-description");
const proposalPayload = document.getElementById("proposal-payload");
const proposalError = document.getElementById("proposal-error");
const proposalPrevBtn = document.getElementById("proposal-prev-btn");
const proposalNextBtn = document.getElementById("proposal-next-btn");
const proposalPageLabel = document.getElementById("proposal-page-label");
const proposalRejectBtn = document.getElementById("proposal-reject-btn");
const proposalApproveBtn = document.getElementById("proposal-approve-btn");
const proposalRejectAllBtn = document.getElementById("proposal-reject-all-btn");
const proposalApproveAllBtn = document.getElementById("proposal-approve-all-btn");
const questionsPanel = document.getElementById("questions-panel");
const questionsContext = document.getElementById("questions-context");
const questionsList = document.getElementById("questions-list");
const questionsSubmitBtn = document.getElementById("questions-submit-btn");
const questionsCancelBtn = document.getElementById("questions-cancel-btn");

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
const rpaRecordBtn = document.getElementById("rpa-record-btn");
const rpaRecordStopBtn = document.getElementById("rpa-record-stop-btn");
const browserAgentBadge = document.getElementById("browser-agent-badge");
const activityLog = document.getElementById("activity-log");
const defaultUserInputPlaceholder = userInput.getAttribute("placeholder") || "Type a message...";

void init();

async function init() {
    await loadSettings();
    applySettingsToUI();
    bindEvents();
    syncApprovalModeUI();
    renderInteractionPanel();
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
    approvalManualBtn.addEventListener("click", () => {
        setApprovalMode(APPROVAL_MODES.MANUAL);
    });

    approvalAutoBtn.addEventListener("click", () => {
        setApprovalMode(APPROVAL_MODES.AUTO);
    });

    uploadFileBtn.addEventListener("click", () => {
        fileUploadInput.click();
    });

    fileUploadInput.addEventListener("change", () => {
        void handleFileSelection();
    });

    captureBtn.addEventListener("click", () => {
        void captureScreen();
    });

    removeScreenshotBtn.addEventListener("click", () => {
        currentAttachment = null;
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

    userInput.addEventListener("paste", (event) => {
        void handleInputPaste(event);
    });

    browserRunBtn.addEventListener("click", () => {
        void runBrowserGoalFromInput();
    });

    browserStopBtn.addEventListener("click", () => {
        void stopBrowserAgent();
    });

    rpaRecordBtn.addEventListener("click", () => {
        void startRpaRecordingFromInput();
    });

    rpaRecordStopBtn.addEventListener("click", () => {
        void stopRpaRecordingAndSave();
    });

    proposalPrevBtn.addEventListener("click", () => {
        if (pendingProposalIndex > 0) {
            pendingProposalIndex -= 1;
            renderInteractionPanel();
        }
    });

    proposalNextBtn.addEventListener("click", () => {
        if (pendingProposalIndex < pendingProposals.length - 1) {
            pendingProposalIndex += 1;
            renderInteractionPanel();
        }
    });

    proposalApproveBtn.addEventListener("click", () => {
        void handleProposalDecision("approve", false);
    });

    proposalRejectBtn.addEventListener("click", () => {
        void handleProposalDecision("reject", false);
    });

    proposalApproveAllBtn.addEventListener("click", () => {
        void handleProposalDecision("approve", true);
    });

    proposalRejectAllBtn.addEventListener("click", () => {
        void handleProposalDecision("reject", true);
    });

    questionsSubmitBtn.addEventListener("click", () => {
        void handleQuestionsSubmit();
    });

    questionsCancelBtn.addEventListener("click", () => {
        handleQuestionsCancel();
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

function normalizeApprovalMode(value) {
    return value === APPROVAL_MODES.MANUAL ? APPROVAL_MODES.MANUAL : APPROVAL_MODES.AUTO;
}

function setApprovalMode(mode) {
    approvalMode = normalizeApprovalMode(mode);
    localStorage.setItem(APPROVAL_MODE_STORAGE_KEY, approvalMode);
    syncApprovalModeUI();
    addActivity("settings", `Approval mode: ${approvalMode}`);
    if (approvalMode === APPROVAL_MODES.MANUAL) {
        if (currentSessionId) {
            void refreshPendingProposalsForSession(currentSessionId);
        }
        return;
    }

    pendingProposals = [];
    pendingProposalIndex = 0;
    proposalApprovedBuffer = [];
    proposalProcessing = false;
    hideProposalError();
    renderInteractionPanel();
}

function syncApprovalModeUI() {
    const isManual = approvalMode === APPROVAL_MODES.MANUAL;
    approvalManualBtn.classList.toggle("active", isManual);
    approvalAutoBtn.classList.toggle("active", !isManual);
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

        currentAttachment = {
            kind: "image",
            source: "screenshot",
            dataUrl,
            fileName: `screenshot-${Date.now()}.jpg`,
            mimeType: "image/jpeg",
            fileSize: 0,
            pageUrl: tab?.url || "",
            pageTitle: tab?.title || ""
        };

        showPreview(currentAttachment);
        validateInput();
        addActivity("capture", "Captured current tab screenshot.");
    } catch (error) {
        addSystemMessage(`Failed to capture screen: ${error.message}`);
    } finally {
        setCaptureLoading(false);
    }
}

async function handleFileSelection() {
    const file = fileUploadInput.files && fileUploadInput.files[0] ? fileUploadInput.files[0] : null;
    fileUploadInput.value = "";
    if (!file) {
        return;
    }
    await attachFileToComposer(file, {
        source: "upload",
        allowPdf: true
    });
}

async function handleInputPaste(event) {
    const clipboard = event?.clipboardData;
    const items = clipboard?.items ? Array.from(clipboard.items) : [];
    if (!items.length) {
        return;
    }

    const imageItem = items.find((item) => item && item.kind === "file" && String(item.type || "").startsWith("image/"));
    if (!imageItem) {
        return;
    }

    const file = imageItem.getAsFile();
    if (!file) {
        return;
    }

    event.preventDefault();
    await attachFileToComposer(file, {
        source: "paste",
        allowPdf: false
    });
}

async function attachFileToComposer(file, options = {}) {
    if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
        addSystemMessage("File is too large. Limit is 15MB.");
        return;
    }

    const source = String(options.source || "upload");
    const allowPdf = options.allowPdf !== false;
    const defaultName = String(file.type || "").startsWith("image/")
        ? `clipboard-image-${Date.now()}.png`
        : "attachment";
    const name = String(file.name || "").trim() || defaultName;
    const mimeType = String(file.type || "").trim().toLowerCase();
    const normalizedMimeType = mimeType || (name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
    const isImage = normalizedMimeType.startsWith("image/");
    const isPdf = normalizedMimeType === "application/pdf";

    if (!isImage && !(allowPdf && isPdf)) {
        addSystemMessage("Only image files and PDF files are supported.");
        return;
    }

    try {
        const dataUrl = await readFileAsDataUrl(file);
        currentAttachment = {
            kind: isImage ? "image" : "pdf",
            source,
            dataUrl,
            fileName: name,
            mimeType: normalizedMimeType || (isImage ? "image/jpeg" : "application/pdf"),
            fileSize: Number(file.size) || 0
        };
        showPreview(currentAttachment);
        validateInput();
        const sourceLabel = source === "paste" ? "paste" : "upload";
        addActivity(sourceLabel, `${isPdf ? "PDF" : "Image"} attached: ${name}`);
    } catch (error) {
        addSystemMessage(`Failed to read selected file: ${error.message}`);
    }
}

function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("file_read_failed"));
        reader.readAsDataURL(file);
    });
}

function getAttachmentPreviewImage(attachment) {
    if (!attachment || attachment.kind !== "image") {
        return null;
    }
    return String(attachment.dataUrl || "");
}

function getAttachmentLabel(attachment) {
    if (!attachment) {
        return "";
    }
    const fileName = String(attachment.fileName || "").trim();
    if (attachment.kind === "pdf") {
        return fileName ? `PDF: ${fileName}` : "PDF attached";
    }
    if (attachment.source === "upload" && fileName) {
        return `Image: ${fileName}`;
    }
    return "";
}

function getAttachmentPreviewType(attachment) {
    if (!attachment) {
        return "Attachment";
    }
    const fileName = String(attachment.fileName || "").trim();
    if (attachment.kind === "pdf") {
        return fileName ? `PDF: ${truncateText(fileName, 32)}` : "PDF";
    }
    if (attachment.source === "upload" && fileName) {
        return `Image: ${truncateText(fileName, 32)}`;
    }
    return "Screenshot";
}

function truncateText(value, maxLength) {
    const text = String(value || "");
    if (text.length <= maxLength) {
        return text;
    }
    return `${text.slice(0, Math.max(0, maxLength - 3))}...`;
}

async function sendMessage() {
    if (hasPendingInteraction()) {
        addActivity("chat", "Resolve pending approvals/questions before sending a new message.");
        return;
    }

    const text = userInput.value.trim();
    if ((!text && !currentAttachment) || isThinking) {
        return;
    }

    addMessage(
        "user",
        text,
        getAttachmentPreviewImage(currentAttachment),
        getAttachmentLabel(currentAttachment)
    );

    const sendingAttachment = currentAttachment;
    const originalText = text;

    userInput.value = "";
    userInput.style.height = "auto";
    currentAttachment = null;
    hidePreview();
    validateInput();
    setThinking(true);

    try {
        let imageUrl = null;
        let fileUrl = null;

        if (sendingAttachment) {
            const captureMetadata = {
                type: sendingAttachment.kind === "pdf" ? "EXT_FILE_UPLOAD" : "EXT_CAPTURE",
                source: sendingAttachment.source || "",
                file_name: sendingAttachment.fileName || "",
                mime_type: sendingAttachment.mimeType || "",
                file_size: Number(sendingAttachment.fileSize) || 0
            };
            if (sendingAttachment.source === "screenshot") {
                captureMetadata.url = sendingAttachment.pageUrl || "";
                captureMetadata.title = sendingAttachment.pageTitle || "";
            }

            const capturePayload = {
                content_type: "TEXT",
                raw_text: JSON.stringify(captureMetadata)
            };
            if (sendingAttachment.kind === "image") {
                capturePayload.base64_image = sendingAttachment.dataUrl;
            } else {
                capturePayload.base64_file = sendingAttachment.dataUrl;
                capturePayload.file_name = sendingAttachment.fileName;
                capturePayload.file_content_type = sendingAttachment.mimeType;
            }

            const captureResp = await apiFetch("/captures", {
                method: "POST",
                body: capturePayload
            });

            if (captureResp.ok) {
                const captureData = await captureResp.json();
                const uploadedUrl = captureData.content_url || null;
                if (sendingAttachment.kind === "image") {
                    imageUrl = uploadedUrl;
                } else {
                    fileUrl = uploadedUrl;
                }
            }
        }

        const chatPayload = {
            text: originalText,
            image_base64: sendingAttachment?.kind === "image" ? sendingAttachment.dataUrl : null,
            image_url: imageUrl,
            file_base64: sendingAttachment?.kind === "pdf" && !fileUrl ? sendingAttachment.dataUrl : null,
            file_url: sendingAttachment?.kind === "pdf" ? fileUrl : null,
            file_name: sendingAttachment?.kind === "pdf" ? sendingAttachment.fileName : null,
            file_mime_type: sendingAttachment?.kind === "pdf" ? sendingAttachment.mimeType : null,
            mode: "dump",
            session_id: currentSessionId,
            approval_mode: approvalMode,
            proposal_mode: approvalMode === APPROVAL_MODES.MANUAL
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
        handleProposalChunk(chunk);
        return;
    }

    if (chunkType === "questions") {
        addActivity("questions", "Agent requested user input.");
        handleQuestionsChunk(chunk);
        return;
    }

    if (chunkType === "done") {
        if (chunk.session_id) {
            currentSessionId = chunk.session_id;
            localStorage.setItem(SESSION_STORAGE_KEY, chunk.session_id);
        }
        const hasActiveBrowserDelegation =
            Boolean(currentBrowserRun) &&
            (!currentBrowserRun.endedAt || browserStatus.running);
        if (hasActiveBrowserDelegation) {
            addActivity(
                "done",
                `Session ${chunk.session_id || "updated"} (chat response finished; browser delegation is still running)`
            );
            if (approvalMode === APPROVAL_MODES.MANUAL && currentSessionId) {
                void refreshPendingProposalsForSession(currentSessionId);
            }
            return;
        }
        addActivity("done", `Session ${chunk.session_id || "updated"}`);
        if (approvalMode === APPROVAL_MODES.MANUAL && currentSessionId) {
            void refreshPendingProposalsForSession(currentSessionId);
        }
        return;
    }

    if (chunkType === "error") {
        addActivity("error", chunk.content || "Unknown stream error");
        return;
    }

    addActivity("event", JSON.stringify(chunk));
}

function getProposalTypeLabel(proposalType) {
    const type = String(proposalType || "").trim().toLowerCase();
    if (type === "tool_action") {
        return "Approval Required";
    }
    if (type === "create_task") {
        return "Task Draft";
    }
    if (type === "create_skill") {
        return "Skill Draft";
    }
    if (type === "assign_task") {
        return "Assignment Draft";
    }
    if (type === "phase_breakdown") {
        return "Phase Plan";
    }
    if (type === "create_project") {
        return "Project Draft";
    }
    return "Proposal";
}

function normalizeProposalPayload(payload) {
    if (payload && typeof payload === "object") {
        return payload;
    }
    return {};
}

function normalizeProposalEntry(raw) {
    if (!raw || typeof raw !== "object") {
        return null;
    }
    const proposalId =
        String(raw.proposal_id || raw.id || "").trim();
    if (!proposalId) {
        return null;
    }
    return {
        proposalId,
        proposalType: String(raw.proposal_type || raw.proposalType || "tool_action").trim().toLowerCase(),
        description: String(raw.description || "").trim(),
        payload: normalizeProposalPayload(raw.payload),
        createdAt: raw.created_at || raw.createdAt || null
    };
}

function handleProposalChunk(chunk) {
    const proposal = normalizeProposalEntry(chunk);
    if (!proposal) {
        return;
    }
    const exists = pendingProposals.some((entry) => entry.proposalId === proposal.proposalId);
    if (!exists) {
        pendingProposals.push(proposal);
    }
    if (pendingProposalIndex >= pendingProposals.length) {
        pendingProposalIndex = Math.max(0, pendingProposals.length - 1);
    }
    hideProposalError();
    renderInteractionPanel();
}

function normalizePendingQuestions(rawQuestions, rawContext) {
    const questions = Array.isArray(rawQuestions) ? rawQuestions : [];
    const normalizedQuestions = questions
        .map((question, index) => {
            if (!question || typeof question !== "object") {
                return null;
            }
            const id = String(question.id || `q_${index + 1}`).trim();
            const text = String(question.question || "").trim();
            if (!id || !text) {
                return null;
            }
            const options = Array.isArray(question.options)
                ? question.options
                    .map((option) => String(option || "").trim())
                    .filter((option) => Boolean(option))
                : [];
            return {
                id,
                question: text,
                options,
                allowMultiple: Boolean(question.allow_multiple || question.allowMultiple),
                placeholder: String(question.placeholder || "").trim()
            };
        })
        .filter((question) => Boolean(question));

    if (normalizedQuestions.length === 0) {
        return null;
    }
    const context = String(rawContext || "").trim();
    return {
        questions: normalizedQuestions,
        context
    };
}

function handleQuestionsChunk(chunk) {
    const normalized = normalizePendingQuestions(
        chunk.questions,
        chunk.context || chunk.questions_context
    );
    if (!normalized) {
        return;
    }
    pendingQuestions = normalized;
    questionAnswers = {};
    for (const question of pendingQuestions.questions) {
        questionAnswers[question.id] = {
            selectedOptions: [],
            otherText: "",
            freeText: ""
        };
    }
    renderInteractionPanel();
}

function renderInteractionPanel() {
    const hasProposals = pendingProposals.length > 0;
    const hasQuestions = !hasProposals && Boolean(pendingQuestions?.questions?.length);

    interactionPanel.classList.toggle("hidden", !hasProposals && !hasQuestions);
    proposalPanel.classList.toggle("hidden", !hasProposals);
    questionsPanel.classList.toggle("hidden", !hasQuestions);

    if (hasProposals) {
        renderProposalPanel();
    } else {
        hideProposalError();
    }

    if (hasQuestions) {
        renderQuestionsPanel();
    } else {
        questionsList.innerHTML = "";
        questionsSubmitBtn.disabled = true;
        questionsContext.classList.add("hidden");
        questionsContext.textContent = "";
    }

    validateInput();
}

function hideProposalError() {
    proposalError.textContent = "";
    proposalError.classList.add("hidden");
}

function showProposalError(text) {
    proposalError.textContent = String(text || "Proposal action failed.");
    proposalError.classList.remove("hidden");
}

function renderProposalPanel() {
    if (pendingProposals.length === 0) {
        return;
    }
    const safeIndex = Math.max(0, Math.min(pendingProposalIndex, pendingProposals.length - 1));
    pendingProposalIndex = safeIndex;
    const proposal = pendingProposals[safeIndex];

    proposalTypeBadge.textContent = getProposalTypeLabel(proposal.proposalType);
    proposalDescription.textContent = proposal.description || "Approval proposal";
    proposalPayload.textContent = JSON.stringify(proposal.payload || {}, null, 2);
    proposalPageLabel.textContent = `${safeIndex + 1} / ${pendingProposals.length}`;
    proposalPrevBtn.disabled = proposalProcessing || safeIndex === 0;
    proposalNextBtn.disabled = proposalProcessing || safeIndex >= pendingProposals.length - 1;
    proposalApproveBtn.disabled = proposalProcessing;
    proposalRejectBtn.disabled = proposalProcessing;
    proposalApproveAllBtn.disabled = proposalProcessing || pendingProposals.length <= 1;
    proposalRejectAllBtn.disabled = proposalProcessing || pendingProposals.length <= 1;
}

async function handleProposalDecision(decision, all) {
    if (proposalProcessing || pendingProposals.length === 0) {
        return;
    }
    proposalProcessing = true;
    renderProposalPanel();
    hideProposalError();

    const targets = all
        ? pendingProposals.slice()
        : [pendingProposals[pendingProposalIndex]];
    const approved = [];

    try {
        for (const proposal of targets) {
            const endpoint = `/proposals/${encodeURIComponent(proposal.proposalId)}/${decision}`;
            const response = await apiFetch(endpoint, {
                method: "POST",
                body: {}
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            if (decision === "approve") {
                approved.push(proposal);
            }
            pendingProposals = pendingProposals.filter((entry) => entry.proposalId !== proposal.proposalId);
        }

        if (pendingProposalIndex >= pendingProposals.length) {
            pendingProposalIndex = Math.max(0, pendingProposals.length - 1);
        }

        if (decision === "approve" && approved.length > 0) {
            proposalApprovedBuffer = [...proposalApprovedBuffer, ...approved];
        }

        renderInteractionPanel();

        if (decision === "approve") {
            addActivity("proposal", all ? "Approved all proposals." : "Proposal approved.");
        } else {
            addActivity("proposal", all ? "Rejected all proposals." : "Proposal rejected.");
        }

        if (pendingProposals.length === 0 && proposalApprovedBuffer.length > 0) {
            const confirmation = buildProposalApprovalMessage(proposalApprovedBuffer);
            proposalApprovedBuffer = [];
            await sendAutomatedFollowup(confirmation);
        }
    } catch (error) {
        showProposalError(`Failed to ${decision}: ${error.message}`);
    } finally {
        proposalProcessing = false;
        renderInteractionPanel();
    }
}

function buildProposalApprovalMessage(approvedProposals) {
    if (!Array.isArray(approvedProposals) || approvedProposals.length === 0) {
        return "Approved.";
    }
    if (approvedProposals.length === 1) {
        return `Approved: ${approvedProposals[0].description || approvedProposals[0].proposalType}`;
    }
    const lines = approvedProposals.map((proposal) => `- ${proposal.description || proposal.proposalType}`);
    return `Approved proposals:\n${lines.join("\n")}`;
}

function renderQuestionsPanel() {
    if (!pendingQuestions || !Array.isArray(pendingQuestions.questions)) {
        return;
    }

    questionsList.innerHTML = "";
    const context = String(pendingQuestions.context || "").trim();
    questionsContext.textContent = context;
    questionsContext.classList.toggle("hidden", !context);

    for (const [index, question] of pendingQuestions.questions.entries()) {
        const item = document.createElement("div");
        item.className = "question-item";

        const label = document.createElement("div");
        label.className = "question-label";
        label.textContent = `${index + 1}. ${question.question}`;
        item.appendChild(label);

        if (!Array.isArray(question.options) || question.options.length === 0) {
            const input = document.createElement("input");
            input.type = "text";
            input.className = "question-freetext-input";
            input.placeholder = question.placeholder || "Type your answer";
            input.value = questionAnswers[question.id]?.freeText || "";
            input.addEventListener("input", () => {
                ensureQuestionAnswerState(question.id);
                questionAnswers[question.id].freeText = input.value;
                updateQuestionsSubmitState();
            });
            item.appendChild(input);
            questionsList.appendChild(item);
            continue;
        }

        const optionsWrap = document.createElement("div");
        optionsWrap.className = "question-options";
        const options = [...question.options, "Other (type manually)"];
        for (const option of options) {
            const optionLabel = document.createElement("label");
            optionLabel.className = "question-option";
            const input = document.createElement("input");
            input.type = question.allowMultiple ? "checkbox" : "radio";
            input.name = `question-${question.id}`;
            input.checked = Boolean(questionAnswers[question.id]?.selectedOptions?.includes(option));
            input.addEventListener("change", () => {
                ensureQuestionAnswerState(question.id);
                if (question.allowMultiple) {
                    const selected = questionAnswers[question.id].selectedOptions;
                    if (input.checked) {
                        if (!selected.includes(option)) {
                            selected.push(option);
                        }
                    } else {
                        questionAnswers[question.id].selectedOptions = selected.filter((entry) => entry !== option);
                    }
                } else {
                    questionAnswers[question.id].selectedOptions = input.checked ? [option] : [];
                }
                renderInteractionPanel();
            });
            const text = document.createElement("span");
            text.textContent = option;
            optionLabel.append(input, text);
            optionsWrap.appendChild(optionLabel);
        }
        item.appendChild(optionsWrap);

        const selected = questionAnswers[question.id]?.selectedOptions || [];
        const needsOtherText = selected.includes("Other (type manually)");
        if (needsOtherText) {
            const otherInput = document.createElement("input");
            otherInput.type = "text";
            otherInput.className = "question-other-input";
            otherInput.placeholder = "Type custom option";
            otherInput.value = questionAnswers[question.id]?.otherText || "";
            otherInput.addEventListener("input", () => {
                ensureQuestionAnswerState(question.id);
                questionAnswers[question.id].otherText = otherInput.value;
                updateQuestionsSubmitState();
            });
            item.appendChild(otherInput);
        }

        questionsList.appendChild(item);
    }

    updateQuestionsSubmitState();
}

function ensureQuestionAnswerState(questionId) {
    if (!questionAnswers[questionId]) {
        questionAnswers[questionId] = {
            selectedOptions: [],
            otherText: "",
            freeText: ""
        };
    }
}

function isQuestionAnswered(question) {
    const answer = questionAnswers[question.id];
    if (!answer) {
        return false;
    }
    if (!Array.isArray(question.options) || question.options.length === 0) {
        return String(answer.freeText || "").trim().length > 0;
    }
    if (!Array.isArray(answer.selectedOptions) || answer.selectedOptions.length === 0) {
        return false;
    }
    if (answer.selectedOptions.includes("Other (type manually)")) {
        return String(answer.otherText || "").trim().length > 0;
    }
    return true;
}

function updateQuestionsSubmitState() {
    if (!pendingQuestions || !Array.isArray(pendingQuestions.questions) || pendingQuestions.questions.length === 0) {
        questionsSubmitBtn.disabled = true;
        return;
    }
    questionsSubmitBtn.disabled = !pendingQuestions.questions.every((question) => isQuestionAnswered(question));
}

function buildQuestionsAnswerText() {
    if (!pendingQuestions || !Array.isArray(pendingQuestions.questions)) {
        return "";
    }
    const lines = [];
    for (const question of pendingQuestions.questions) {
        const answer = questionAnswers[question.id] || {
            selectedOptions: [],
            otherText: "",
            freeText: ""
        };
        let value = "";
        if (!Array.isArray(question.options) || question.options.length === 0) {
            value = String(answer.freeText || "").trim();
        } else {
            const selected = Array.isArray(answer.selectedOptions) ? answer.selectedOptions : [];
            const base = selected.filter((entry) => entry !== "Other (type manually)");
            if (selected.includes("Other (type manually)")) {
                const otherText = String(answer.otherText || "").trim();
                if (otherText) {
                    base.push(otherText);
                }
            }
            value = base.join(" / ");
        }
        if (!value) {
            value = "(no answer)";
        }
        lines.push(`${question.question}: ${value}`);
    }
    return lines.join("\n");
}

async function handleQuestionsSubmit() {
    if (!pendingQuestions) {
        return;
    }
    const message = buildQuestionsAnswerText();
    if (!message.trim()) {
        return;
    }
    pendingQuestions = null;
    questionAnswers = {};
    renderInteractionPanel();
    addActivity("questions", "Submitted answers to agent.");
    await sendAutomatedFollowup(message);
}

function handleQuestionsCancel() {
    pendingQuestions = null;
    questionAnswers = {};
    renderInteractionPanel();
    addActivity("questions", "Question prompt dismissed.");
}

async function sendAutomatedFollowup(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) {
        return;
    }
    if (isThinking) {
        addActivity("chat", "Auto follow-up skipped because chat stream is still active.");
        return;
    }

    const previousText = userInput.value;
    const previousAttachment = currentAttachment;
    currentAttachment = null;
    hidePreview();
    userInput.value = trimmed;
    userInput.style.height = "auto";
    await sendMessage();
    userInput.value = previousText;
    currentAttachment = previousAttachment;
    showPreview(previousAttachment);
}

async function refreshPendingProposalsForSession(sessionId) {
    const id = String(sessionId || "").trim();
    if (!id) {
        pendingProposals = [];
        pendingProposalIndex = 0;
        proposalApprovedBuffer = [];
        proposalProcessing = false;
        renderInteractionPanel();
        return;
    }
    try {
        const response = await apiFetch(
            `/proposals/pending?session_id=${encodeURIComponent(id)}`,
            { method: "GET" }
        );
        if (!response.ok) {
            pendingProposals = [];
            pendingProposalIndex = 0;
            proposalApprovedBuffer = [];
            proposalProcessing = false;
            hideProposalError();
            renderInteractionPanel();
            return;
        }
        const payload = await response.json();
        const proposals = Array.isArray(payload?.proposals) ? payload.proposals : [];
        pendingProposals = proposals
            .map((proposal) => normalizeProposalEntry({
                proposal_id: proposal.id,
                proposal_type: proposal.proposal_type,
                description: proposal.description,
                payload: proposal.payload,
                created_at: proposal.created_at
            }))
            .filter((proposal) => Boolean(proposal));
        pendingProposalIndex = 0;
        proposalApprovedBuffer = [];
        proposalProcessing = false;
        hideProposalError();
        renderInteractionPanel();
    } catch {
        // no-op
    }
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

    if (toolName === "run_hybrid_rpa") {
        await maybeDelegateHybridRpa(resultPayload);
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

    const startUrl = String(
        resultPayload?.start_url ||
        resultPayload?.startUrl ||
        resultPayload?.payload?.start_url ||
        resultPayload?.payload?.startUrl ||
        ""
    ).trim();
    const notes = String(
        resultPayload?.notes ||
        resultPayload?.payload?.notes ||
        ""
    ).trim();

    const matchedScenario = await resolveHybridRpaScenarioFromSkills(goal);
    if (matchedScenario?.scenario && Array.isArray(matchedScenario.scenario.steps)) {
        const scenario = matchedScenario.scenario;
        const scenarioName = (
            String(scenario?.name || "").trim() ||
            String(matchedScenario?.title || "").trim() ||
            goal
        );
        addActivity(
            "browser_delegate",
            `Matched skill scenario: ${scenarioName} (${scenario.steps.length} step${scenario.steps.length === 1 ? "" : "s"})`
        );
        await startHybridRpaTask({
            goal,
            scenarioName,
            startUrl: String(scenario.start_url || startUrl || "").trim(),
            steps: Array.isArray(scenario.steps) ? scenario.steps : [],
            aiFallback: scenario.ai_fallback !== false,
            aiFallbackMaxSteps: Number(scenario.ai_fallback_max_steps) || 3,
            stepRetryLimit: Number(scenario.step_retry_limit) >= 0
                ? Number(scenario.step_retry_limit)
                : 1,
            stopOnFailure: scenario.stop_on_failure !== false,
            notes: [notes, matchedScenario?.memoryId ? `skill_id=${matchedScenario.memoryId}` : ""]
                .filter((line) => Boolean(line))
                .join(" | ")
        });
        return;
    }

    addActivity("browser_delegate", "No matching RPA scenario found; falling back to planner mode.");
    addActivity("browser_delegate", `Delegating browser task: ${goal}`);
    await startBrowserAgent(goal);
}

function extractSkillTitleFromContent(content) {
    const text = String(content || "");
    const match = text.match(/^#\s+(.+)$/m);
    if (!match) {
        return "";
    }
    return String(match[1] || "").trim().slice(0, 120);
}

function normalizeTextForMatch(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim();
}

function hasGoalOverlapWithSkill(goal, title, content) {
    const normalizedGoal = normalizeTextForMatch(goal);
    if (!normalizedGoal) {
        return false;
    }
    const normalizedTitle = normalizeTextForMatch(title);
    const normalizedContent = normalizeTextForMatch(content).slice(0, 2200);

    if (normalizedTitle.length >= 4 && (
        normalizedTitle.includes(normalizedGoal) ||
        normalizedGoal.includes(normalizedTitle)
    )) {
        return true;
    }
    if (normalizedGoal.length >= 4 && normalizedContent.includes(normalizedGoal)) {
        return true;
    }

    const tokens = normalizedGoal
        .split(/[\s,.;:!?/\\|()[\]{}"'`]+/)
        .map((token) => token.trim())
        .filter((token) => token.length >= 3)
        .slice(0, 8);
    if (tokens.length === 0) {
        return false;
    }

    let hits = 0;
    for (const token of tokens) {
        if (normalizedTitle.includes(token) || normalizedContent.includes(token)) {
            hits += 1;
        }
    }
    return hits >= Math.min(2, tokens.length);
}

function parseJsonLooseText(raw) {
    if (!raw || typeof raw !== "string") {
        return null;
    }
    const content = raw.trim();
    if (!content) {
        return null;
    }

    try {
        return JSON.parse(content);
    } catch {
        // continue
    }

    const start = content.indexOf("{");
    if (start < 0) {
        return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < content.length; i += 1) {
        const ch = content[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === "\\") {
            escaped = true;
            continue;
        }
        if (ch === "\"") {
            inString = !inString;
            continue;
        }
        if (inString) {
            continue;
        }
        if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                const snippet = content.slice(start, i + 1);
                try {
                    return JSON.parse(snippet);
                } catch {
                    return null;
                }
            }
        }
    }

    return null;
}

function extractRpaScenarioFromSkillContent(content) {
    const text = String(content || "");
    if (!text) {
        return null;
    }

    const candidates = [];
    const explicitSectionRegex = /###\s*RPA Scenario\s*\(JSON\)[\s\S]*?```json\s*([\s\S]*?)```/gi;
    for (const match of text.matchAll(explicitSectionRegex)) {
        if (match && typeof match[1] === "string" && match[1].trim()) {
            candidates.push(match[1].trim());
        }
    }

    const genericJsonBlockRegex = /```json\s*([\s\S]*?)```/gi;
    for (const match of text.matchAll(genericJsonBlockRegex)) {
        if (match && typeof match[1] === "string" && match[1].trim()) {
            candidates.push(match[1].trim());
        }
    }

    if (candidates.length === 0) {
        return null;
    }

    for (const candidate of candidates) {
        const parsed = parseJsonLooseText(candidate);
        if (!parsed || typeof parsed !== "object") {
            continue;
        }
        const normalized = normalizeScenarioForSkill(parsed);
        if (Array.isArray(normalized?.steps) && normalized.steps.length > 0) {
            return normalized;
        }
    }
    return null;
}

async function resolveHybridRpaScenarioFromSkills(goal) {
    const query = String(goal || "").trim();
    if (!query) {
        return null;
    }

    const path = `/memories/search?query=${encodeURIComponent(query)}&scope=WORK&limit=8`;
    let response;
    try {
        response = await apiFetch(path, { method: "GET" });
    } catch (error) {
        addActivity("browser_delegate", `Skill search skipped: ${error.message}`);
        return null;
    }

    let entries = [];
    if (!response?.ok) {
        if (response?.status === 422) {
            addActivity("browser_delegate", "Skill search endpoint returned HTTP 422; trying fallback list filter.");
            entries = await fetchFallbackWorkSkillEntries();
        } else {
            addActivity("browser_delegate", `Skill search skipped (HTTP ${response?.status || "?"}).`);
            return null;
        }
    } else {
        let payload = [];
        try {
            payload = await response.json();
        } catch {
            return null;
        }
        if (Array.isArray(payload) && payload.length > 0) {
            entries = payload;
        }
    }

    if (!Array.isArray(entries) || entries.length === 0) {
        return null;
    }

    const matches = [];
    for (const entry of entries) {
        const memory = entry?.memory && typeof entry.memory === "object" ? entry.memory : entry;
        if (!memory || typeof memory !== "object") {
            continue;
        }
        const content = String(memory.content || "").trim();
        if (!content) {
            continue;
        }
        const scenario = extractRpaScenarioFromSkillContent(content);
        if (!scenario || !Array.isArray(scenario.steps) || scenario.steps.length === 0) {
            continue;
        }
        const title = extractSkillTitleFromContent(content);
        const relevanceScore = Number(entry?.relevance_score);
        const score = Number.isFinite(relevanceScore) ? relevanceScore : 0;
        const overlap = hasGoalOverlapWithSkill(query, title, content);
        if (!overlap && score < 0.55) {
            continue;
        }
        matches.push({
            scenario,
            title,
            memoryId: String(memory.id || "").trim(),
            score,
            overlap
        });
    }

    if (matches.length === 0) {
        return null;
    }

    matches.sort((a, b) => {
        if (a.overlap !== b.overlap) {
            return a.overlap ? -1 : 1;
        }
        if (b.score !== a.score) {
            return b.score - a.score;
        }
        return b.scenario.steps.length - a.scenario.steps.length;
    });
    return matches[0];
}

async function fetchFallbackWorkSkillEntries() {
    let response;
    try {
        response = await apiFetch("/memories?scope=WORK&limit=100", { method: "GET" });
    } catch (error) {
        addActivity("browser_delegate", `Fallback skill list failed: ${error.message}`);
        return [];
    }

    if (!response?.ok) {
        addActivity("browser_delegate", `Fallback skill list skipped (HTTP ${response?.status || "?"}).`);
        return [];
    }

    let payload = [];
    try {
        payload = await response.json();
    } catch {
        return [];
    }
    if (!Array.isArray(payload) || payload.length === 0) {
        return [];
    }

    return payload.map((memory) => ({
        memory,
        relevance_score: 0
    }));
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

function normalizeHybridRpaPayload(resultPayload) {
    const source = resultPayload?.payload && typeof resultPayload.payload === "object"
        ? { ...resultPayload.payload, ...resultPayload }
        : (resultPayload || {});

    const goal =
        String(
            source.goal ||
            source.instruction ||
            source.task ||
            source.scenario_name ||
            "Hybrid RPA Task"
        ).trim() || "Hybrid RPA Task";

    const scenarioName = String(source.scenario_name || source.scenarioName || "").trim();
    const startUrl = String(source.start_url || source.startUrl || "").trim();
    const steps = Array.isArray(source.steps) ? source.steps : [];
    const aiFallbackMaxRaw = Number(source.ai_fallback_max_steps ?? source.aiFallbackMaxSteps);
    const stepRetryRaw = Number(source.step_retry_limit ?? source.stepRetryLimit);

    return {
        goal,
        scenarioName,
        startUrl,
        steps,
        aiFallback: source.ai_fallback !== false,
        aiFallbackMaxSteps: Number.isFinite(aiFallbackMaxRaw)
            ? Math.max(1, Math.min(10, Math.round(aiFallbackMaxRaw)))
            : 3,
        stepRetryLimit: Number.isFinite(stepRetryRaw)
            ? Math.max(0, Math.min(3, Math.round(stepRetryRaw)))
            : 1,
        stopOnFailure: source.stop_on_failure !== false,
        notes: String(source.notes || "").trim()
    };
}

async function maybeDelegateHybridRpa(resultPayload) {
    const payload = normalizeHybridRpaPayload(resultPayload);
    if (!payload.goal) {
        addActivity("rpa", "Hybrid RPA request detected but no goal was found.");
        return;
    }

    const label = payload.scenarioName || payload.goal;
    addActivity(
        "rpa",
        `Delegating hybrid RPA: ${label} (${payload.steps.length} step${payload.steps.length === 1 ? "" : "s"})`
    );
    await startHybridRpaTask(payload);
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
        if (approvalMode === APPROVAL_MODES.MANUAL && currentSessionId) {
            await refreshPendingProposalsForSession(currentSessionId);
        } else {
            pendingProposals = [];
            pendingProposalIndex = 0;
            proposalApprovedBuffer = [];
            proposalProcessing = false;
            hideProposalError();
            renderInteractionPanel();
        }
        setThinking(false);
    }
}

function addMessage(role, text, imageBase64, attachmentLabel = "") {
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

    if (attachmentLabel) {
        const attachmentDiv = document.createElement("div");
        attachmentDiv.className = "message-attachment";
        attachmentDiv.textContent = attachmentLabel;
        contentDiv.appendChild(attachmentDiv);
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

function hasPendingInteraction() {
    return pendingProposals.length > 0 || Boolean(pendingQuestions?.questions?.length);
}

function validateInput() {
    const interactionLocked = hasPendingInteraction();
    const hasText = userInput.value.trim().length > 0;
    const hasAttachment = Boolean(currentAttachment);
    const composerLocked = isThinking || interactionLocked;
    const fileActionDisabled = composerLocked || captureLoading;

    sendBtn.disabled = composerLocked || !(hasText || hasAttachment);
    userInput.disabled = composerLocked;
    userInput.placeholder = interactionLocked
        ? "Resolve approval/questions first..."
        : defaultUserInputPlaceholder;
    uploadFileBtn.disabled = fileActionDisabled;
    captureBtn.disabled = fileActionDisabled;
    uploadFileBtn.style.opacity = fileActionDisabled ? "0.5" : "1";
    captureBtn.style.opacity = fileActionDisabled ? "0.5" : "1";
}

function showPreview(attachment) {
    if (!attachment) {
        hidePreview();
        return;
    }

    previewTypeLabel.textContent = getAttachmentPreviewType(attachment);
    if (attachment.kind === "image") {
        screenshotPreview.src = attachment.dataUrl || "";
        screenshotPreview.classList.remove("hidden");
        filePreviewBadge.classList.add("hidden");
    } else {
        screenshotPreview.src = "";
        screenshotPreview.classList.add("hidden");
        filePreviewBadge.textContent = "PDF";
        filePreviewBadge.classList.remove("hidden");
    }
    previewContainer.classList.remove("hidden");
    scrollToBottom();
}

function hidePreview() {
    screenshotPreview.src = "";
    screenshotPreview.classList.remove("hidden");
    filePreviewBadge.classList.add("hidden");
    previewTypeLabel.textContent = "Attachment";
    previewContainer.classList.add("hidden");
}

function setCaptureLoading(loading) {
    captureLoading = Boolean(loading);
    validateInput();
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

    pendingProposals = [];
    pendingProposalIndex = 0;
    proposalApprovedBuffer = [];
    proposalProcessing = false;
    pendingQuestions = null;
    questionAnswers = {};
    hideProposalError();
    renderInteractionPanel();

    userInput.value = "";
    userInput.style.height = "auto";
    currentAttachment = null;
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
        browserStatus.mode = String(payload.mode || "idle");
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

function beginBrowserRun(goal, source, options = {}) {
    const normalizedGoal = String(goal || "").trim() || "Browser task";
    currentBrowserRun = {
        id: buildBrowserRunId(),
        goal: normalizedGoal,
        source: source || "manual",
        startedAt: Date.now(),
        endedAt: null,
        messages: [],
        scenario: options?.scenario && typeof options.scenario === "object"
            ? normalizeScenarioForSkill(options.scenario)
            : null
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

async function startHybridRpaTask(task) {
    const payload = {
        goal: task.goal,
        scenario: {
            name: task.scenarioName || task.goal,
            start_url: task.startUrl || "",
            steps: Array.isArray(task.steps) ? task.steps : [],
            ai_fallback: task.aiFallback !== false,
            ai_fallback_max_steps: task.aiFallbackMaxSteps,
            step_retry_limit: task.stepRetryLimit,
            stop_on_failure: task.stopOnFailure !== false,
            notes: task.notes || ""
        },
        config: buildBrowserAgentConfig()
    };

    beginBrowserRun(task.scenarioName || task.goal, "hybrid_rpa", {
        scenario: payload.scenario
    });
    const response = await sendRuntimeMessage({
        type: "rpa.start",
        payload
    });

    if (!response?.ok) {
        finalizeCurrentBrowserRun("rpa_start_failed");
        addActivity("rpa", `Start failed: ${response?.error || "unknown error"}`);
        return;
    }

    addActivity("rpa", `Started hybrid RPA: ${task.scenarioName || task.goal}`);
}

async function startRpaRecordingFromInput() {
    const scenarioName = String(browserGoalInput.value || "").trim() || "Demo Browser Workflow";
    const response = await sendRuntimeMessage({
        type: "rpa.record.start",
        payload: {
            scenarioName,
            goal: scenarioName
        }
    });

    if (!response?.ok) {
        addActivity("rpa.record", `Start failed: ${response?.error || "unknown error"}`);
        return;
    }

    addActivity("rpa.record", `Recording started: ${scenarioName}`);
}

function convertScenarioStepToSkillLine(step) {
    const type = String(step?.type || "").trim().toLowerCase();
    if (!type) {
        return "";
    }
    if (type === "navigate") {
        return `Open ${String(step.url || "").trim()}`;
    }
    if (type === "new_tab") {
        return `Open a new tab: ${String(step.url || "").trim()}`;
    }
    if (type === "click") {
        const hint = String(step.text_hint || step.textHint || step.selector || "").trim();
        return hint ? `Click ${hint}` : "Click the target element";
    }
    if (type === "type") {
        const selector = String(step.selector || "").trim();
        const value = String(step.text || "").trim();
        if (selector) {
            return `Type "${value}" into ${selector}`;
        }
        return `Type "${value}"`;
    }
    if (type === "scroll") {
        const dy = Number(step.dy) || 0;
        return `Scroll ${dy >= 0 ? "down" : "up"} by ${Math.abs(dy)} px`;
    }
    if (type === "wait") {
        return `Wait ${Number(step.ms || step.wait_ms || 0) || 1000} ms`;
    }
    if (type === "keypress") {
        return `Press ${String(step.key || "Enter")}`;
    }
    if (type === "assert_text") {
        return `Confirm page contains "${String(step.assert_text || "").trim()}"`;
    }
    if (type === "assert_url") {
        return `Confirm URL includes "${String(step.assert_url_contains || "").trim()}"`;
    }
    if (type === "ai") {
        return `Use AI fallback for: ${String(step.goal || "").trim()}`;
    }
    return type;
}

function normalizeScenarioForSkill(rawScenario) {
    const source = rawScenario && typeof rawScenario === "object" ? rawScenario : {};
    const steps = Array.isArray(source.steps) ? source.steps : [];
    const normalizedSteps = [];
    for (const rawStep of steps) {
        if (!rawStep || typeof rawStep !== "object") {
            continue;
        }
        const type = String(rawStep.type || "").trim().toLowerCase();
        if (!type) {
            continue;
        }
        const step = { type };
        if (typeof rawStep.selector === "string" && rawStep.selector.trim()) {
            step.selector = rawStep.selector.trim();
        }
        if (typeof rawStep.text_hint === "string" && rawStep.text_hint.trim()) {
            step.text_hint = rawStep.text_hint.trim().slice(0, 180);
        }
        if (typeof rawStep.text === "string" && rawStep.text) {
            step.text = rawStep.text.slice(0, 240);
        }
        if (typeof rawStep.key === "string" && rawStep.key.trim()) {
            step.key = rawStep.key.trim().slice(0, 40);
        }
        if (typeof rawStep.url === "string" && rawStep.url.trim()) {
            step.url = rawStep.url.trim().slice(0, 400);
        }
        if (rawStep.dy !== undefined && rawStep.dy !== null) {
            step.dy = Number(rawStep.dy) || 0;
        }
        if (rawStep.dx !== undefined && rawStep.dx !== null) {
            step.dx = Number(rawStep.dx) || 0;
        }
        if (rawStep.ms !== undefined && rawStep.ms !== null) {
            step.ms = Number(rawStep.ms) || 0;
        }
        if (typeof rawStep.assert_text === "string" && rawStep.assert_text.trim()) {
            step.assert_text = rawStep.assert_text.trim().slice(0, 240);
        }
        if (
            typeof rawStep.assert_url_contains === "string" &&
            rawStep.assert_url_contains.trim()
        ) {
            step.assert_url_contains = rawStep.assert_url_contains.trim().slice(0, 240);
        }
        if (typeof rawStep.goal === "string" && rawStep.goal.trim()) {
            step.goal = rawStep.goal.trim().slice(0, 300);
        }
        if (rawStep.optional === true) {
            step.optional = true;
        }
        normalizedSteps.push(step);
        if (normalizedSteps.length >= 40) {
            break;
        }
    }

    const name = String(source.name || source.scenario_name || source.scenarioName || "RPA Scenario")
        .trim()
        .slice(0, 120);
    return {
        name: name || "RPA Scenario",
        start_url: String(source.start_url || source.startUrl || "").trim().slice(0, 400),
        ai_fallback: source.ai_fallback !== false,
        ai_fallback_max_steps: Number(source.ai_fallback_max_steps) > 0 ? Number(source.ai_fallback_max_steps) : 3,
        step_retry_limit: Number(source.step_retry_limit) >= 0 ? Number(source.step_retry_limit) : 1,
        stop_on_failure: source.stop_on_failure !== false,
        steps: normalizedSteps
    };
}

function buildScenarioFromRun(run) {
    const candidate = run?.scenario || run?.meta?.scenario || null;
    if (!candidate || typeof candidate !== "object") {
        return null;
    }
    return normalizeScenarioForSkill(candidate);
}

async function saveScenarioAsSkill(options = {}) {
    const scenario = normalizeScenarioForSkill(options.scenario || {});
    if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) {
        return { ok: false, error: "Scenario has no steps." };
    }

    const run = options.run || {
        goal: String(options.goal || scenario.name || "RPA scenario"),
        startedAt: Date.now(),
        source: String(options.source || "rpa_recording")
    };
    const baseTitle = buildSkillTitle(run, options.title || `RPA SOP: ${scenario.name}`);
    const baseWhenToUse = buildWhenToUse(
        run,
        options.whenToUse || `Use this when repeating scenario: ${scenario.name}`
    );
    const baseDescription = buildSkillDescription(
        run,
        options.description || `RPA scenario focused on: ${scenario.name}`
    );
    const tags = normalizeSkillTags(options.tags || ["browser", "automation", "rpa", "skill"]);
    const steps = scenario.steps
        .map((step) => convertScenarioStepToSkillLine(step))
        .filter((line) => Boolean(line))
        .slice(0, MAX_SKILL_STEP_LINES);
    const metadata = await suggestSkillMetadataForSkill({
        run,
        steps,
        scenario,
        title: baseTitle,
        whenToUse: baseWhenToUse,
        description: baseDescription
    });
    const title = metadata.title;
    const whenToUse = metadata.whenToUse;
    const description = metadata.description;

    const content = composeSkillContent({
        title,
        whenToUse,
        description,
        run,
        steps,
        screenshotUrls: [],
        scenario
    });

    const response = await apiFetch("/memories", {
        method: "POST",
        body: {
            content,
            scope: "WORK",
            memory_type: "RULE",
            tags,
            source: "agent"
        }
    });

    if (!response.ok) {
        return { ok: false, error: `Skill creation failed (HTTP ${response.status})` };
    }

    const memory = await response.json();
    return {
        ok: true,
        memoryId: String(memory?.id || ""),
        title
    };
}

async function stopRpaRecordingAndSave() {
    const response = await sendRuntimeMessage({
        type: "rpa.record.stop",
        payload: { saveAsSkill: true }
    });
    if (!response?.ok) {
        addActivity("rpa.record", `Stop failed: ${response?.error || "unknown error"}`);
        return;
    }

    const scenario = response?.scenario;
    const stepCount = Array.isArray(scenario?.steps) ? scenario.steps.length : 0;
    addActivity("rpa.record", `Recording stopped. Generated ${stepCount} scenario steps.`);

    const saveResult = await saveScenarioAsSkill({
        scenario,
        goal: response?.goal || scenario?.name || "Recorded scenario",
        source: "rpa_recording",
        title: `Demo SOP: ${scenario?.name || "Recorded Browser Workflow"}`,
        whenToUse: "Use this SOP for recurring browser operations demonstrated by a human."
    });

    if (!saveResult.ok) {
        addActivity("skill", `Scenario skill save failed: ${saveResult.error}`);
        return;
    }

    addActivity("skill", `Scenario skill saved (${saveResult.memoryId}).`);
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

function buildSkillDescription(run, preferredDescription) {
    const base = String(preferredDescription || "").trim();
    if (base) {
        return base.slice(0, 260);
    }
    const goal = String(run?.goal || "").trim();
    if (!goal) {
        return "Reusable browser automation skill for recurring operational tasks.";
    }
    return `Reusable browser automation skill to complete: ${goal}`.slice(0, 260);
}

function normalizeSuggestedSkillMetadata(raw, fallback) {
    const source = raw && typeof raw === "object" ? raw : {};
    const title = String(source.title || "").trim().slice(0, 120) || fallback.title;
    const whenToUse = (
        String(source.whenToUse || source.when_to_use || "").trim().slice(0, 360) ||
        fallback.whenToUse
    );
    const description = (
        String(source.description || source.summary || "").trim().slice(0, 260) ||
        fallback.description
    );
    return {
        title,
        whenToUse,
        description
    };
}

async function suggestSkillMetadataForSkill(options = {}) {
    const run = options.run || {};
    const fallback = {
        title: String(options.title || buildSkillTitle(run)).trim().slice(0, 120),
        whenToUse: String(options.whenToUse || buildWhenToUse(run)).trim().slice(0, 360),
        description: String(options.description || buildSkillDescription(run)).trim().slice(0, 260)
    };
    const steps = Array.isArray(options.steps)
        ? options.steps
            .map((step) => String(step || "").trim())
            .filter((step) => Boolean(step))
            .slice(0, 10)
        : [];
    const scenario = options.scenario && typeof options.scenario === "object" ? options.scenario : null;

    const response = await sendRuntimeMessage({
        type: "skill.suggest_metadata",
        payload: {
            config: buildBrowserAgentConfig(),
            draft: {
                goal: String(run?.goal || "").trim().slice(0, 260),
                source: String(run?.source || "").trim().slice(0, 60),
                title: fallback.title,
                whenToUse: fallback.whenToUse,
                description: fallback.description,
                scenarioName: String(scenario?.name || "").trim().slice(0, 120),
                steps
            }
        }
    });

    if (!response?.ok) {
        if (response?.error) {
            addActivity("skill", `AI metadata skipped: ${response.error}`);
        }
        return fallback;
    }

    const normalized = normalizeSuggestedSkillMetadata(response?.metadata, fallback);
    const provider = String(response?.provider || "").trim();
    addActivity("skill", provider ? `AI metadata refined (${provider}).` : "AI metadata refined.");
    return normalized;
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

function composeSkillContentRaw({ title, whenToUse, description, run, steps, screenshotUrls, scenario }) {
    const lines = [
        `# ${title}`,
        "",
        "## When to use",
        whenToUse,
        "",
        "## Description",
        description,
        "",
        "## Content",
        "### Goal",
        String(run?.goal || "Browser task"),
        "",
        "### Procedure",
        ...steps.map((step, index) => `${index + 1}. ${step}`)
    ];

    if (scenario && Array.isArray(scenario.steps) && scenario.steps.length > 0) {
        lines.push("");
        lines.push("### RPA Scenario (JSON)");
        lines.push("```json");
        lines.push(JSON.stringify(scenario, null, 2));
        lines.push("```");
    }

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

function composeSkillContent({ title, whenToUse, description, run, steps, screenshotUrls, scenario = null }) {
    let trimmedShots = [...screenshotUrls];
    let trimmedSteps = [...steps];
    let trimmedScenario = scenario ? normalizeScenarioForSkill(scenario) : null;

    let content = composeSkillContentRaw({
        title,
        whenToUse,
        description,
        run,
        steps: trimmedSteps,
        screenshotUrls: trimmedShots,
        scenario: trimmedScenario
    });
    if (content.length <= MAX_SKILL_CONTENT_LENGTH) {
        return content;
    }

    while (trimmedShots.length > 0 && content.length > MAX_SKILL_CONTENT_LENGTH) {
        trimmedShots = trimmedShots.slice(0, -1);
        content = composeSkillContentRaw({
            title,
            whenToUse,
            description,
            run,
            steps: trimmedSteps,
            screenshotUrls: trimmedShots,
            scenario: trimmedScenario
        });
    }

    while (trimmedSteps.length > 2 && content.length > MAX_SKILL_CONTENT_LENGTH) {
        trimmedSteps = trimmedSteps.slice(0, -1);
        content = composeSkillContentRaw({
            title,
            whenToUse,
            description,
            run,
            steps: trimmedSteps,
            screenshotUrls: [],
            scenario: trimmedScenario
        });
    }

    if (trimmedScenario && content.length > MAX_SKILL_CONTENT_LENGTH) {
        trimmedScenario = null;
        content = composeSkillContentRaw({
            title,
            whenToUse,
            description,
            run,
            steps: trimmedSteps,
            screenshotUrls: [],
            scenario: null
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

    const baseTitle = buildSkillTitle(run, options.title);
    const baseWhenToUse = buildWhenToUse(run, options.whenToUse);
    const baseDescription = buildSkillDescription(run, options.description);
    const steps = extractSkillStepsFromRun(run);
    const scenario = buildScenarioFromRun(run);
    const tags = scenario
        ? normalizeSkillTags([...(Array.isArray(options.tags) ? options.tags : []), "rpa", "hybrid"])
        : normalizeSkillTags(options.tags);
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

    const metadata = await suggestSkillMetadataForSkill({
        run,
        steps,
        scenario,
        title: baseTitle,
        whenToUse: baseWhenToUse,
        description: baseDescription
    });
    const title = metadata.title;
    const whenToUse = metadata.whenToUse;
    const description = metadata.description;

    const content = composeSkillContent({
        title,
        whenToUse,
        description,
        run,
        steps,
        screenshotUrls,
        scenario
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
    const isRecording = browserStatus.mode === "recording";
    browserAgentBadge.classList.toggle("running", browserStatus.running);
    browserAgentBadge.classList.toggle("recording", isRecording);
    browserAgentBadge.classList.toggle("idle", !browserStatus.running && !isRecording);
    browserStopBtn.disabled = !browserStatus.running;
    rpaRecordBtn.disabled = browserStatus.running || isRecording;
    rpaRecordStopBtn.disabled = !isRecording;

    if (isRecording) {
        browserAgentBadge.textContent = "Recording";
        return;
    }

    if (!browserStatus.running) {
        browserAgentBadge.textContent = "Idle";
        return;
    }
    if (browserStatus.mode === "hybrid_rpa") {
        browserAgentBadge.textContent = `RPA step ${browserStatus.step}`;
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

