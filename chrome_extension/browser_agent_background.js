const DEFAULT_CONFIG = Object.freeze({
  provider: "litellm",
  apiBaseUrl: "http://localhost:4000",
  apiKeyLiteLLM: "",
  apiKeyGemini: "",
  bedrockRegion: "us-east-1",
  bedrockAccessKeyId: "",
  bedrockSecretAccessKey: "",
  bedrockSessionToken: "",
  model: "gemini/gemini-1.5-pro",
  providerModels: {
    litellm: "gemini/gemini-1.5-pro",
    gemini_direct: "gemini-2.5-flash",
    bedrock_direct: "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
  },
  responseLanguage: "Japanese",
  maxSteps: 20,
  settleDelayMs: 1200,
  maxStagnationSteps: 3,
  includeScreenshotsInPrompt: true,
  allowedDomains: "",
  temperature: 0.2,
  maxTokens: 900,
  blockHighRisk: true,
  keepTabFocused: true
});

const PROVIDERS = Object.freeze({
  LITELLM: "litellm",
  GEMINI_DIRECT: "gemini_direct",
  BEDROCK_DIRECT: "bedrock_direct"
});

const PROVIDER_MODEL_DEFAULTS = Object.freeze({
  [PROVIDERS.LITELLM]: "gemini/gemini-1.5-pro",
  [PROVIDERS.GEMINI_DIRECT]: "gemini-2.5-flash",
  [PROVIDERS.BEDROCK_DIRECT]: "us.anthropic.claude-3-5-sonnet-20241022-v2:0"
});

const MAX_CHAT_MESSAGES = 400;
const textEncoder = new TextEncoder();
const DECISION_RETRY_MAX = 2;
const DECISION_RETRY_DELAY_MS = 600;
const RPA_FALLBACK_DEFAULT_STEPS = 3;
const RPA_STEP_RETRY_DEFAULT = 1;
const RPA_SUPPORTED_STEP_TYPES = new Set([
  "navigate",
  "new_tab",
  "click",
  "type",
  "scroll",
  "wait",
  "keypress",
  "assert_text",
  "assert_url",
  "ai"
]);
const HIGH_RISK_KEYWORDS = [
  "delete",
  "remove",
  "destroy",
  "terminate",
  "cancel",
  "unsubscribe",
  "close account",
  "purchase",
  "buy",
  "checkout",
  "pay",
  "confirm order",
  "submit order",
  "transfer",
  "send money"
];

const panelPorts = new Set();
const state = {
  running: false,
  mode: "idle",
  sessionId: null,
  goal: "",
  step: 0,
  tabId: null,
  windowId: null,
  chat: [],
  config: { ...DEFAULT_CONFIG },
  lastAction: null,
  lastChangeSummary: null,
  stagnationCount: 0,
  scrollStallCount: 0,
  pendingApproval: null,
  pendingUserInstructions: [],
  activeRpa: null,
  activeRecording: null,
  updatedAt: Date.now()
};

const initPromise = initializeState();

chrome.runtime.onInstalled.addListener(() => {
  trySetPanelBehavior();
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "sidepanel") {
    return;
  }
  panelPorts.add(port);
  port.onDisconnect.addListener(() => {
    panelPorts.delete(port);
  });
  safePostMessage(port, { type: "chat.history", payload: state.chat });
  safePostMessage(port, { type: "agent.status", payload: getStatus() });
  safePostMessage(port, { type: "config.updated", payload: state.config });
  if (state.pendingApproval) {
    safePostMessage(port, {
      type: "approval.requested",
      payload: toApprovalPayload(state.pendingApproval)
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((payload) => {
      sendResponse(payload);
    })
    .catch((error) => {
      sendResponse({ ok: false, error: error.message || "Unexpected error." });
    });
  return true;
});

async function handleMessage(message, sender) {
  await initPromise;
  const type = message?.type;

  if (type === "ui.init") {
    return {
      ok: true,
      config: state.config,
      chat: state.chat,
      status: getStatus(),
      pendingApproval: state.pendingApproval
        ? toApprovalPayload(state.pendingApproval)
        : null
    };
  }

  if (type === "config.get") {
    return { ok: true, config: state.config };
  }

  if (type === "config.save") {
    const nextConfig = sanitizeConfig(message?.payload ?? {});
    state.config = normalizeConfigObject({ ...state.config, ...nextConfig });
    await persistConfig();
    broadcast({ type: "config.updated", payload: state.config });
    return { ok: true, config: state.config };
  }

  if (type === "agent.start") {
    return startAgent(message?.payload?.goal, message?.payload?.config, sender);
  }

  if (type === "rpa.start") {
    return startHybridRpa(
      message?.payload?.goal,
      message?.payload?.scenario,
      message?.payload?.config,
      sender
    );
  }

  if (type === "rpa.record.start") {
    return startRpaRecording(message?.payload, sender);
  }

  if (type === "rpa.record.stop") {
    return stopRpaRecording(message?.payload);
  }

  if (type === "rpa.record.event") {
    ingestRpaRecordingEvent(message?.payload, sender);
    return { ok: true };
  }

  if (type === "skill.suggest_metadata") {
    return suggestSkillMetadata(message?.payload);
  }

  if (type === "agent.stop") {
    if (state.activeRecording) {
      await stopRpaRecording({ discard: true });
    }
    await stopAgent("Stopped by user.");
    return { ok: true, status: getStatus() };
  }

  if (type === "agent.instruction") {
    const text = typeof message?.payload?.text === "string" ? message.payload.text.trim() : "";
    if (!text) {
      return { ok: false, error: "Instruction is empty." };
    }
    if (!state.running) {
      return { ok: false, error: "Agent is not running." };
    }
    state.pendingUserInstructions.push(text);
    pushChat("user", text, { kind: "instruction" });
    return { ok: true };
  }

  if (type === "approval.respond") {
    const approvalId =
      typeof message?.payload?.approvalId === "string"
        ? message.payload.approvalId.trim()
        : "";
    const decisionRaw =
      typeof message?.payload?.decision === "string"
        ? message.payload.decision.trim().toLowerCase()
        : "";

    if (!approvalId) {
      return { ok: false, error: "approvalId is empty." };
    }
    if (!state.pendingApproval || state.pendingApproval.id !== approvalId) {
      return { ok: false, error: "No pending approval matches approvalId." };
    }
    if (decisionRaw !== "approve" && decisionRaw !== "reject") {
      return { ok: false, error: "Decision must be approve or reject." };
    }

    state.pendingApproval.decision = decisionRaw === "approve" ? "approved" : "rejected";
    state.pendingApproval.decidedAt = Date.now();
    state.updatedAt = Date.now();
    broadcastStatus();
    return { ok: true };
  }

  return { ok: false, error: `Unsupported message type: ${String(type)}` };
}

async function startAgent(goal, incomingConfig, sender) {
  const cleanGoal = typeof goal === "string" ? goal.trim() : "";
  if (!cleanGoal) {
    return { ok: false, error: "Goal is empty." };
  }

  if (state.activeRecording) {
    await stopRpaRecording({ discard: true });
  }

  if (state.running) {
    await stopAgent("Previous session was stopped before starting a new one.", false);
  }

  const nextConfig = sanitizeConfig(incomingConfig ?? {});
  state.config = normalizeConfigObject({ ...state.config, ...nextConfig });
  await persistConfig();

  const tab = await findTargetTab(sender);
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, error: "No active tab was found." };
  }
  if (!isAutomatableUrl(tab.url)) {
    return { ok: false, error: "This page cannot be automated." };
  }
  if (!isAllowedDomain(tab.url, state.config.allowedDomains)) {
    return { ok: false, error: "Current domain is not in the allowlist." };
  }

  state.running = true;
  state.mode = "planner";
  state.sessionId = buildSessionId();
  state.goal = cleanGoal;
  state.step = 0;
  state.tabId = tab.id;
  state.windowId = tab.windowId ?? null;
  state.lastAction = null;
  state.lastChangeSummary = null;
  state.stagnationCount = 0;
  state.scrollStallCount = 0;
  clearPendingApproval();
  state.pendingUserInstructions = [];
  state.activeRpa = null;
  state.activeRecording = null;
  state.updatedAt = Date.now();

  await updateRunningIndicator(state.tabId, true, state.step);

  pushChat("system", `Session ${state.sessionId} started on ${safeUrl(tab.url)}.`);
  pushChat("user", cleanGoal, { kind: "goal" });
  pushChat("assistant", "Agent started.");
  broadcastStatus();

  runAgentLoop().catch(async (error) => {
    pushChat("system", `Agent runtime error: ${error.message}`);
    await stopAgent("Agent stopped due to error.", false);
  });

  return { ok: true, status: getStatus() };
}

function normalizeRpaScenario(rawScenario, fallbackGoal) {
  const source = rawScenario && typeof rawScenario === "object" ? rawScenario : {};
  const scenarioNameRaw = source.name || source.scenario_name || source.scenarioName || fallbackGoal;
  const scenarioName = truncate(String(scenarioNameRaw || "Hybrid RPA Scenario"), 120).trim();
  const startUrl = normalizeNavigationUrl(
    String(source.start_url || source.startUrl || "").trim()
  );
  const rawSteps = Array.isArray(source.steps) ? source.steps : [];
  const steps = rawSteps
    .map((step, index) => normalizeRpaStep(step, index))
    .filter((step) => Boolean(step));

  const aiFallbackMaxSteps = clampNumber(
    source.ai_fallback_max_steps ?? source.aiFallbackMaxSteps,
    1,
    10,
    RPA_FALLBACK_DEFAULT_STEPS
  );
  const stepRetryLimit = clampNumber(
    source.step_retry_limit ?? source.stepRetryLimit,
    0,
    3,
    RPA_STEP_RETRY_DEFAULT
  );

  return {
    name: scenarioName || "Hybrid RPA Scenario",
    startUrl,
    steps,
    aiFallback: source.ai_fallback !== false,
    aiFallbackMaxSteps,
    stepRetryLimit,
    stopOnFailure: source.stop_on_failure !== false,
    notes: String(source.notes || "").trim()
  };
}

function normalizeRpaStep(rawStep, index) {
  if (!rawStep || typeof rawStep !== "object") {
    return null;
  }
  const type = String(rawStep.type || "").trim().toLowerCase();
  if (!RPA_SUPPORTED_STEP_TYPES.has(type)) {
    return null;
  }

  const target =
    rawStep.target && typeof rawStep.target === "object" ? rawStep.target : {};
  const args =
    rawStep.args && typeof rawStep.args === "object" ? rawStep.args : {};

  const selector = String(
    rawStep.selector ||
      target.selector ||
      args.selector ||
      ""
  ).trim();
  const elementId = String(
    rawStep.element_id ||
      rawStep.elementId ||
      target.element_id ||
      target.elementId ||
      ""
  ).trim();
  const text = String(
    rawStep.text ??
      args.text ??
      ""
  );
  const textHint = String(
    rawStep.text_hint ||
      rawStep.textHint ||
      rawStep.label ||
      rawStep.target_text ||
      rawStep.targetText ||
      ""
  ).trim();
  const description = String(rawStep.description || "").trim();

  const step = {
    id: `rpa_${index + 1}`,
    index: index + 1,
    type,
    selector,
    elementId,
    text,
    textHint,
    key: String(rawStep.key || args.key || "").trim(),
    url: normalizeNavigationUrl(String(rawStep.url || args.url || "").trim()),
    dy: clampNumber(rawStep.dy ?? args.dy, -4000, 4000, 900),
    dx: clampNumber(rawStep.dx ?? args.dx, -4000, 4000, 0),
    waitMs: clampNumber(rawStep.ms ?? rawStep.wait_ms ?? args.ms, 200, 10000, 1000),
    assertText: String(
      rawStep.assert_text ||
        rawStep.expect_text ||
        args.assert_text ||
        ""
    ).trim(),
    assertUrlContains: String(
      rawStep.assert_url_contains ||
        rawStep.expect_url_contains ||
        rawStep.contains ||
        args.assert_url_contains ||
        ""
    ).trim(),
    aiGoal: String(rawStep.goal || args.goal || description || "").trim(),
    optional: Boolean(rawStep.optional),
    description
  };

  if (type === "type" && !step.text) {
    return null;
  }
  if (type === "navigate" || type === "new_tab") {
    if (!step.url) {
      return null;
    }
  }
  if (type === "assert_text" && !step.assertText && !step.text) {
    return null;
  }
  if (type === "assert_url" && !step.assertUrlContains && !step.url) {
    return null;
  }
  if (type === "ai" && !step.aiGoal) {
    return null;
  }
  return step;
}

function describeRpaStep(step) {
  if (!step || typeof step !== "object") {
    return "unknown step";
  }
  if (step.description) {
    return step.description;
  }
  if (step.type === "navigate") {
    return `navigate ${safeUrl(step.url)}`;
  }
  if (step.type === "new_tab") {
    return `open new tab ${safeUrl(step.url)}`;
  }
  if (step.type === "click") {
    if (step.selector) {
      return `click selector ${truncate(step.selector, 90)}`;
    }
    if (step.textHint) {
      return `click target containing "${truncate(step.textHint, 60)}"`;
    }
    return "click target";
  }
  if (step.type === "type") {
    const target = step.selector || step.textHint || step.elementId || "target";
    return `type "${truncate(step.text, 60)}" into ${truncate(target, 80)}`;
  }
  if (step.type === "scroll") {
    return `scroll dy=${step.dy}`;
  }
  if (step.type === "wait") {
    return `wait ${step.waitMs}ms`;
  }
  if (step.type === "keypress") {
    return `keypress "${step.key || "Enter"}"`;
  }
  if (step.type === "assert_text") {
    return `assert page contains "${truncate(step.assertText || step.text, 70)}"`;
  }
  if (step.type === "assert_url") {
    return `assert URL contains "${truncate(step.assertUrlContains || step.url || "", 90)}"`;
  }
  if (step.type === "ai") {
    return `AI step: ${truncate(step.aiGoal, 100)}`;
  }
  return step.type;
}

function resolveSelectorFromHint(step, observation) {
  if (!observation?.page?.elements || !Array.isArray(observation.page.elements)) {
    return null;
  }

  const hint = String(step.textHint || "").trim().toLowerCase();
  if (!hint) {
    return null;
  }

  for (const element of observation.page.elements) {
    const haystack = [
      element.label,
      element.text,
      element.ariaLabel,
      element.placeholder,
      element.selector
    ]
      .map((value) => String(value || "").toLowerCase())
      .join(" ");
    if (haystack.includes(hint)) {
      return {
        selector: typeof element.selector === "string" ? element.selector : "",
        elementId: typeof element.id === "string" ? element.id : ""
      };
    }
  }
  return null;
}

function toActionFromRpaStep(step, observation) {
  if (!step || typeof step !== "object") {
    return null;
  }

  const selectorFromHint = resolveSelectorFromHint(step, observation);
  const target = {};
  if (step.elementId) {
    target.element_id = step.elementId;
  }
  if (step.selector) {
    target.selector = step.selector;
  } else if (selectorFromHint?.selector) {
    target.selector = selectorFromHint.selector;
    if (!target.element_id && selectorFromHint.elementId) {
      target.element_id = selectorFromHint.elementId;
    }
  }

  if (step.type === "navigate") {
    return { type: "navigate", target: {}, args: { url: step.url } };
  }
  if (step.type === "new_tab") {
    return { type: "new_tab", target: {}, args: { url: step.url } };
  }
  if (step.type === "click") {
    if (!target.selector) {
      return null;
    }
    return { type: "click", target, args: {} };
  }
  if (step.type === "type") {
    if (!target.selector) {
      return null;
    }
    return {
      type: "type",
      target,
      args: {
        text: step.text,
        pressEnter: false
      }
    };
  }
  if (step.type === "scroll") {
    return {
      type: "scroll",
      target: {},
      args: {
        dy: step.dy,
        dx: step.dx
      }
    };
  }
  if (step.type === "wait") {
    return { type: "wait", target: {}, args: { ms: step.waitMs } };
  }
  if (step.type === "keypress") {
    return {
      type: "keypress",
      target,
      args: {
        key: step.key || "Enter"
      }
    };
  }
  return null;
}

function evaluateRpaStepAssertions(step, observation) {
  if (!observation || typeof observation !== "object") {
    return { ok: false, message: "No observation available." };
  }
  const url = String(observation.url || "");
  const textSnippet = String(observation?.page?.textSnippet || "");
  const normalizedText = textSnippet.toLowerCase();

  const assertText = String(step?.assertText || "").trim() || (step?.type === "assert_text" ? String(step?.text || "").trim() : "");
  if (assertText) {
    if (!normalizedText.includes(assertText.toLowerCase())) {
      return {
        ok: false,
        message: `Expected text not found: "${truncate(assertText, 120)}"`
      };
    }
  }

  const assertUrlContains =
    String(step?.assertUrlContains || "").trim() ||
    (step?.type === "assert_url" ? String(step?.url || "").trim() : "");
  if (assertUrlContains) {
    if (!url.includes(assertUrlContains)) {
      return {
        ok: false,
        message: `URL assertion failed. expected contains "${truncate(assertUrlContains, 120)}", actual ${safeUrl(url)}`
      };
    }
  }

  return { ok: true, message: "Assertions passed." };
}

async function runAiRecoveryForRpaStep(scenario, step, failureMessage) {
  const maxFallbackSteps = clampNumber(
    scenario?.aiFallbackMaxSteps,
    1,
    10,
    RPA_FALLBACK_DEFAULT_STEPS
  );
  const subGoal =
    step?.type === "ai"
      ? step.aiGoal
      : `Recover this RPA step and continue the business workflow: ${describeRpaStep(step)}`;
  const recoveryContext = [
    `Scenario: ${scenario?.name || "Hybrid RPA"}`,
    `RPA step: ${describeRpaStep(step)}`,
    `Failure: ${failureMessage || "unknown"}`
  ].join(" | ");
  let visualReason =
    step?.type === "ai" ? "" : String(failureMessage || "").trim();

  for (let attempt = 1; attempt <= maxFallbackSteps; attempt += 1) {
    if (!state.running) {
      return { ok: false, message: "Session stopped." };
    }
    if (state.step >= state.config.maxSteps) {
      return { ok: false, message: `Max steps reached (${state.config.maxSteps}).` };
    }

    state.step += 1;
    state.updatedAt = Date.now();
    broadcastStatus();
    await updateRunningIndicator(state.tabId, true, state.step);

    let before;
    let decision;
    try {
      before = await collectObservation(
        state.tabId,
        buildOnDemandScreenshotOptions(
          visualReason,
          `AI fallback context ${attempt}`
        )
      );
      const decisionRecoveryContext = [
        recoveryContext,
        visualReason ? `Visual hint: ${truncate(visualReason, 140)}` : "",
        `AI fallback attempt ${attempt}/${maxFallbackSteps}`
      ]
        .filter(Boolean)
        .join(" | ");
      decision = await requestDecision(before, {
        goal: subGoal,
        recoveryContext: decisionRecoveryContext
      });
      visualReason = "";
    } catch (error) {
      pushChat(
        "system",
        `[AI fallback] Attempt ${attempt}/${maxFallbackSteps} failed before action: ${error.message}`
      );
      visualReason = `Decision failed: ${error.message}`;
      continue;
    }
    const action = normalizeAction(decision?.action, before);
    if (!action) {
      visualReason = "Model action was not executable from DOM context.";
      continue;
    }

    const reasoning = typeof decision?.reasoning === "string" ? decision.reasoning.trim() : "";
    pushChat("assistant", `[AI fallback ${attempt}/${maxFallbackSteps}] ${describeAction(action)}${reasoning ? `\nReason: ${reasoning}` : ""}`);

    if (action.type === "finish") {
      const finalAnswer =
        typeof decision?.final_answer === "string" && decision.final_answer.trim()
          ? decision.final_answer.trim()
          : "AI fallback marked this step complete.";
      pushChat("assistant", finalAnswer);
      return { ok: true, message: "finish" };
    }

    const highRiskReason = getHighRiskReason(action, before);
    if (highRiskReason) {
      const approved = await requestHighRiskApproval(action, before, highRiskReason);
      if (!approved) {
        return { ok: false, message: "AI fallback action was not approved." };
      }
    }

    const execution = await executeAction(action);
    if (!execution.ok) {
      visualReason = `Action failed: ${execution.message || "unknown"}`;
      continue;
    }

    if (action.type !== "wait") {
      await sleep(state.config.settleDelayMs);
    }
    let after;
    try {
      after = await collectObservation(state.tabId);
    } catch (error) {
      pushChat("system", `[AI fallback] Observation failed: ${error.message}`);
      visualReason = `Post-action observation failed: ${error.message}`;
      continue;
    }
    const change = evaluateStateChange(before, after);
    pushChat("system", `[AI fallback] ${change.summary}`);

    const assertion = evaluateRpaStepAssertions(step, after);
    if (assertion.ok) {
      return {
        ok: true,
        message: execution.message || "AI fallback succeeded."
      };
    }
    visualReason = assertion.message || "Assertion failed after AI fallback action.";
  }

  return {
    ok: false,
    message: `AI fallback exceeded ${maxFallbackSteps} steps without satisfying the step.`
  };
}

async function executeHybridRpaStep(scenario, step, stepIndex) {
  try {
    const stepNumber = stepIndex + 1;
    const retries = clampNumber(scenario?.stepRetryLimit, 0, 3, RPA_STEP_RETRY_DEFAULT);

    if (step.type === "ai") {
      return runAiRecoveryForRpaStep(scenario, step, "AI step requested by scenario");
    }

    if (step.type === "assert_text" || step.type === "assert_url") {
      const observation = await collectObservation(state.tabId);
      return evaluateRpaStepAssertions(step, observation);
    }

    let lastFailure = "Unknown error";
    for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
      if (!state.running) {
        return { ok: false, message: "Session stopped." };
      }
      const before = await collectObservation(state.tabId);
      const action = toActionFromRpaStep(step, before);
      if (!action) {
        return { ok: false, message: "RPA step could not be mapped to an executable browser action." };
      }

      const highRiskReason = getHighRiskReason(action, before);
      if (highRiskReason) {
        const approved = await requestHighRiskApproval(action, before, highRiskReason);
        if (!approved) {
          return { ok: false, message: "Step was not approved." };
        }
      }

      const execution = await executeAction(action);
      if (!execution.ok) {
        lastFailure = execution.message || "Action failed.";
        if (attempt <= retries) {
          pushChat(
            "system",
            `RPA step ${stepNumber} retry ${attempt}/${retries}: ${lastFailure}`
          );
          await sleep(280);
          continue;
        }
        return { ok: false, message: lastFailure };
      }

      if (action.type !== "wait") {
        await sleep(state.config.settleDelayMs);
      }
      const after = await collectObservation(state.tabId);
      const change = evaluateStateChange(before, after);
      pushChat("system", `[RPA step ${stepNumber}] ${change.summary}`);

      const assertion = evaluateRpaStepAssertions(step, after);
      if (assertion.ok) {
        return { ok: true, message: execution.message || "Step completed." };
      }
      lastFailure = assertion.message || "Assertion failed.";
      if (attempt <= retries) {
        pushChat(
          "system",
          `RPA step ${stepNumber} assertion retry ${attempt}/${retries}: ${lastFailure}`
        );
        await sleep(280);
        continue;
      }
      return { ok: false, message: lastFailure };
    }

    return { ok: false, message: lastFailure };
  } catch (error) {
    return { ok: false, message: error.message || "RPA step execution error." };
  }
}

async function runHybridRpaLoop(scenario) {
  const totalSteps = Array.isArray(scenario?.steps) ? scenario.steps.length : 0;
  if (scenario?.startUrl && normalizeNavigationUrl(scenario.startUrl)) {
    pushChat("assistant", `Hybrid RPA start URL: ${safeUrl(scenario.startUrl)}`);
    const nav = await executeAction({
      type: "navigate",
      target: {},
      args: { url: scenario.startUrl }
    });
    if (!nav.ok) {
      pushChat("system", `Failed to open start URL: ${nav.message}`);
      if (scenario.stopOnFailure) {
        const tabId = state.tabId;
        state.running = false;
        state.mode = "idle";
        state.activeRpa = null;
        state.updatedAt = Date.now();
        state.scrollStallCount = 0;
        clearPendingApproval();
        await updateRunningIndicator(tabId, false, state.step);
        broadcastStatus();
        await persistChat();
        return;
      }
    } else {
      await sleep(state.config.settleDelayMs);
    }
  }

  if (totalSteps === 0) {
    pushChat("assistant", "Hybrid RPA scenario has no deterministic steps, so no action was executed.");
  }

  for (let i = 0; i < totalSteps && state.running; i += 1) {
    if (state.step >= state.config.maxSteps) {
      pushChat("assistant", `Stopped: reached max steps (${state.config.maxSteps}).`);
      break;
    }

    state.step += 1;
    state.updatedAt = Date.now();
    broadcastStatus();
    await updateRunningIndicator(state.tabId, true, state.step);

    const step = scenario.steps[i];
    pushChat("assistant", `RPA step ${i + 1}/${totalSteps}: ${describeRpaStep(step)}`);
    const result = await executeHybridRpaStep(scenario, step, i);

    if (result.ok) {
      if (state.activeRpa && typeof state.activeRpa.completedSteps === "number") {
        state.activeRpa.completedSteps += 1;
      }
      continue;
    }

    if (step.optional) {
      pushChat("system", `Optional RPA step failed and was skipped: ${result.message}`);
      continue;
    }

    const canFallback = Boolean(scenario.aiFallback) && step.type !== "ai";
    if (!canFallback) {
      try {
        await collectObservation(
          state.tabId,
          buildOnDemandScreenshotOptions(
            `RPA step ${i + 1} failed: ${result.message}`,
            `RPA failure step ${i + 1}`
          )
        );
      } catch {
        // no-op
      }
      pushChat("assistant", `Stopped: RPA step failed (${result.message}).`);
      if (scenario.stopOnFailure) {
        break;
      }
      continue;
    }

    pushChat("assistant", `RPA step failed, trying AI fallback: ${result.message}`);
    const fallbackResult = await runAiRecoveryForRpaStep(scenario, step, result.message);
    if (fallbackResult.ok) {
      if (state.activeRpa && typeof state.activeRpa.fallbacks === "number") {
        state.activeRpa.fallbacks += 1;
      }
      continue;
    }

    pushChat("assistant", `AI fallback failed: ${fallbackResult.message}`);
    if (scenario.stopOnFailure) {
      break;
    }
  }

  const tabId = state.tabId;
  state.running = false;
  state.mode = "idle";
  state.activeRpa = null;
  state.updatedAt = Date.now();
  state.scrollStallCount = 0;
  clearPendingApproval();
  await updateRunningIndicator(tabId, false, state.step);
  broadcastStatus();
  await persistChat();
}

async function startHybridRpa(goal, rawScenario, incomingConfig, sender) {
  const cleanGoal = typeof goal === "string" ? goal.trim() : "";
  if (!cleanGoal) {
    return { ok: false, error: "Goal is empty." };
  }

  if (state.activeRecording) {
    await stopRpaRecording({ discard: true });
  }

  if (state.running) {
    await stopAgent("Previous session was stopped before starting a new one.", false);
  }

  const nextConfig = sanitizeConfig(incomingConfig ?? {});
  state.config = normalizeConfigObject({ ...state.config, ...nextConfig });
  await persistConfig();

  const tab = await findTargetTab(sender);
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, error: "No active tab was found." };
  }
  if (!isAutomatableUrl(tab.url)) {
    return { ok: false, error: "This page cannot be automated." };
  }
  if (!isAllowedDomain(tab.url, state.config.allowedDomains)) {
    return { ok: false, error: "Current domain is not in the allowlist." };
  }

  const scenario = normalizeRpaScenario(rawScenario, cleanGoal);

  state.running = true;
  state.mode = "hybrid_rpa";
  state.sessionId = buildSessionId();
  state.goal = cleanGoal;
  state.step = 0;
  state.tabId = tab.id;
  state.windowId = tab.windowId ?? null;
  state.lastAction = null;
  state.lastChangeSummary = null;
  state.stagnationCount = 0;
  state.scrollStallCount = 0;
  state.pendingUserInstructions = [];
  state.activeRpa = {
    name: scenario.name,
    totalSteps: scenario.steps.length,
    completedSteps: 0,
    fallbacks: 0,
    startedAt: Date.now()
  };
  state.activeRecording = null;
  clearPendingApproval();
  state.updatedAt = Date.now();

  await updateRunningIndicator(state.tabId, true, state.step);
  pushChat("system", `Hybrid RPA session ${state.sessionId} started on ${safeUrl(tab.url)}.`);
  pushChat("user", cleanGoal, { kind: "goal" });
  pushChat(
    "assistant",
    `Hybrid RPA started: ${scenario.name} (${scenario.steps.length} step${scenario.steps.length === 1 ? "" : "s"})`
  );
  if (scenario.notes) {
    pushChat("system", `Scenario notes: ${scenario.notes}`);
  }
  broadcastStatus();

  runHybridRpaLoop(scenario).catch(async (error) => {
    pushChat("system", `Hybrid RPA runtime error: ${error.message}`);
    await stopAgent("Hybrid RPA stopped due to error.", false);
  });

  return { ok: true, status: getStatus() };
}

function buildRecordingId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `rec-${crypto.randomUUID()}`;
  }
  return `rec-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function normalizeRecordingName(input, fallback = "Demo Browser Workflow") {
  const text = String(input || "").trim();
  if (!text) {
    return fallback;
  }
  return truncate(text, 120);
}

function toRecordingPayload(recording) {
  if (!recording || typeof recording !== "object") {
    return null;
  }
  return {
    id: recording.id,
    name: recording.name,
    goal: recording.goal,
    tabId: recording.tabId,
    startedAt: recording.startedAt,
    eventCount: Array.isArray(recording.events) ? recording.events.length : 0
  };
}

function ingestRpaRecordingEvent(rawEvent, sender) {
  if (!state.activeRecording || !sender?.tab || sender.tab.id !== state.activeRecording.tabId) {
    return;
  }
  const event = normalizeRecordedEvent(rawEvent);
  if (!event) {
    return;
  }
  const events = Array.isArray(state.activeRecording.events) ? state.activeRecording.events : [];
  const previous = events.length > 0 ? events[events.length - 1] : null;
  if (previous) {
    const sameType = previous.type === event.type;
    const sameSelector = String(previous.selector || "") === String(event.selector || "");
    const sameText = String(previous.text || "") === String(event.text || "");
    const closeInTime = Math.abs((event.at || 0) - (previous.at || 0)) <= 180;
    if (sameType && sameSelector && sameText && closeInTime) {
      return;
    }
  }
  events.push(event);
  if (events.length > 2000) {
    events.splice(0, events.length - 2000);
  }
  state.activeRecording.events = events;
  state.activeRecording.lastEventAt = Date.now();
  state.updatedAt = Date.now();
}

function normalizeRecordedEvent(rawEvent) {
  if (!rawEvent || typeof rawEvent !== "object") {
    return null;
  }
  const type = String(rawEvent.type || rawEvent.kind || "").trim().toLowerCase();
  if (!type) {
    return null;
  }

  const base = {
    type,
    at: Number(rawEvent.at) > 0 ? Number(rawEvent.at) : Date.now()
  };

  if (type === "navigate") {
    const url = normalizeNavigationUrl(String(rawEvent.url || "").trim());
    if (!url) {
      return null;
    }
    return { ...base, url };
  }

  if (type === "click") {
    const selector = String(rawEvent.selector || "").trim();
    if (!selector) {
      return null;
    }
    return {
      ...base,
      selector: truncate(selector, 300),
      textHint: truncate(String(rawEvent.text_hint || rawEvent.textHint || "").trim(), 160)
    };
  }

  if (type === "type") {
    const selector = String(rawEvent.selector || "").trim();
    if (!selector) {
      return null;
    }
    return {
      ...base,
      selector: truncate(selector, 300),
      text: truncate(String(rawEvent.text || ""), 240)
    };
  }

  if (type === "scroll") {
    const dy = Number(rawEvent.dy);
    if (!Number.isFinite(dy) || Math.abs(dy) < 8) {
      return null;
    }
    return {
      ...base,
      dy: clampNumber(dy, -5000, 5000, 0)
    };
  }

  if (type === "keypress") {
    const key = String(rawEvent.key || "").trim();
    if (!key) {
      return null;
    }
    return {
      ...base,
      key: truncate(key, 30)
    };
  }

  return null;
}

function buildScenarioFromRecording(recording) {
  const events = Array.isArray(recording?.events) ? recording.events : [];
  const steps = [];
  let startUrl = normalizeNavigationUrl(String(recording?.startUrl || "").trim()) || "";
  let lastKnownUrl = startUrl;

  const appendStep = (nextStep) => {
    if (!nextStep || typeof nextStep !== "object") {
      return;
    }
    const previous = steps.length > 0 ? steps[steps.length - 1] : null;
    if (previous && previous.type === "type" && nextStep.type === "type") {
      if (String(previous.selector || "") === String(nextStep.selector || "")) {
        previous.text = nextStep.text;
        return;
      }
    }
    if (previous && previous.type === "scroll" && nextStep.type === "scroll") {
      const prevDy = Number(previous.dy) || 0;
      const nextDy = Number(nextStep.dy) || 0;
      if (prevDy === 0 || nextDy === 0) {
        // keep separate
      } else if ((prevDy > 0 && nextDy > 0) || (prevDy < 0 && nextDy < 0)) {
        previous.dy = clampNumber(prevDy + nextDy, -5000, 5000, nextDy);
        return;
      }
    }
    steps.push(nextStep);
  };

  for (const event of events) {
    const type = String(event?.type || "").trim().toLowerCase();
    if (!type) {
      continue;
    }

    if (type === "navigate") {
      const url = normalizeNavigationUrl(String(event?.url || "").trim());
      if (!url) {
        continue;
      }
      if (!startUrl) {
        startUrl = url;
        lastKnownUrl = url;
        continue;
      }
      if (url !== lastKnownUrl) {
        appendStep({ type: "navigate", url });
        lastKnownUrl = url;
      }
      continue;
    }

    if (type === "click") {
      const selector = String(event?.selector || "").trim();
      if (!selector) {
        continue;
      }
      appendStep({
        type: "click",
        selector,
        text_hint: String(event?.textHint || "").trim()
      });
      continue;
    }

    if (type === "type") {
      const selector = String(event?.selector || "").trim();
      if (!selector) {
        continue;
      }
      appendStep({
        type: "type",
        selector,
        text: String(event?.text || "")
      });
      continue;
    }

    if (type === "scroll") {
      appendStep({
        type: "scroll",
        dy: clampNumber(event?.dy, -5000, 5000, 0)
      });
      continue;
    }

    if (type === "keypress") {
      const key = String(event?.key || "").trim();
      if (!key) {
        continue;
      }
      appendStep({ type: "keypress", key });
      continue;
    }
  }

  const limitedSteps = steps.slice(0, 60);
  if (limitedSteps.length === 0) {
    limitedSteps.push({
      type: "ai",
      goal: String(recording?.goal || recording?.name || "Complete the demonstrated workflow")
    });
  }

  return {
    name: normalizeRecordingName(recording?.name, "Demo Browser Workflow"),
    start_url: startUrl || "",
    steps: limitedSteps,
    ai_fallback: true,
    ai_fallback_max_steps: RPA_FALLBACK_DEFAULT_STEPS,
    step_retry_limit: RPA_STEP_RETRY_DEFAULT,
    stop_on_failure: true,
    notes: String(recording?.notes || "").trim()
  };
}

async function startRpaRecording(payload, sender) {
  if (state.running) {
    await stopAgent("Stopped running session to start demonstration recording.", false);
  }

  if (state.activeRecording) {
    await stopRpaRecording({ discard: true });
  }

  const tab = await findTargetTab(sender);
  if (!tab || typeof tab.id !== "number") {
    return { ok: false, error: "No active tab was found." };
  }
  if (!isAutomatableUrl(tab.url)) {
    return { ok: false, error: "This page cannot be recorded." };
  }
  if (!isAllowedDomain(tab.url, state.config.allowedDomains)) {
    return { ok: false, error: "Current domain is not in the allowlist." };
  }

  await ensureContentScript(tab.id);
  const recordingId = buildRecordingId();
  const startResponse = await tabsSendMessage(tab.id, {
    type: "agent.recording.start",
    recordingId
  });
  if (!startResponse?.ok) {
    return { ok: false, error: startResponse?.message || "Failed to start recording in content script." };
  }

  const scenarioName = normalizeRecordingName(
    payload?.scenarioName || payload?.name || payload?.goal,
    "Demo Browser Workflow"
  );
  const goal = normalizeRecordingName(payload?.goal || scenarioName, scenarioName);

  state.mode = "recording";
  state.activeRecording = {
    id: recordingId,
    name: scenarioName,
    goal,
    tabId: tab.id,
    startedAt: Date.now(),
    startUrl: String(tab.url || ""),
    notes: String(payload?.notes || "").trim(),
    events: [],
    lastEventAt: Date.now()
  };
  state.tabId = tab.id;
  state.windowId = tab.windowId ?? state.windowId;
  state.updatedAt = Date.now();
  pushChat("system", `RPA demo recording started: ${scenarioName}`);
  broadcastStatus();
  return {
    ok: true,
    recording: toRecordingPayload(state.activeRecording),
    status: getStatus()
  };
}

async function stopRpaRecording(payload = {}) {
  if (!state.activeRecording) {
    return { ok: false, error: "No active recording session." };
  }

  const recording = { ...state.activeRecording, events: [...(state.activeRecording.events || [])] };
  try {
    await ensureContentScript(recording.tabId);
    await tabsSendMessage(recording.tabId, { type: "agent.recording.stop" });
  } catch {
    // no-op
  }

  state.activeRecording = null;
  if (!state.running) {
    state.mode = "idle";
  }
  state.updatedAt = Date.now();
  broadcastStatus();

  if (payload?.discard) {
    pushChat("system", "RPA demo recording discarded.");
    return { ok: true, discarded: true, status: getStatus() };
  }

  const scenario = buildScenarioFromRecording(recording);
  const stepCount = Array.isArray(scenario?.steps) ? scenario.steps.length : 0;
  pushChat(
    "assistant",
    `Generated RPA scenario from demo: ${scenario.name} (${stepCount} step${stepCount === 1 ? "" : "s"})`
  );

  return {
    ok: true,
    goal: recording.goal,
    scenario,
    eventCount: recording.events.length,
    status: getStatus()
  };
}

async function stopAgent(reason, appendMessage = true) {
  const wasRunning = state.running;
  const tabId = state.tabId;
  state.running = false;
  state.mode = "idle";
  state.activeRpa = null;
  state.activeRecording = null;
  state.updatedAt = Date.now();
  state.scrollStallCount = 0;
  clearPendingApproval();
  if (reason && (appendMessage || wasRunning)) {
    pushChat("system", reason);
  }
  await updateRunningIndicator(tabId, false, state.step);
  broadcastStatus();
}

async function runAgentLoop() {
  let nextDecisionVisualReason = "";

  while (state.running) {
    if (state.step >= state.config.maxSteps) {
      pushChat("assistant", `Stopped: reached max steps (${state.config.maxSteps}).`);
      break;
    }

    state.step += 1;
    state.updatedAt = Date.now();
    broadcastStatus();
    await updateRunningIndicator(state.tabId, true, state.step);

    const visualReason = nextDecisionVisualReason;
    nextDecisionVisualReason = "";
    let before = await collectObservation(
      state.tabId,
      buildOnDemandScreenshotOptions(
        visualReason,
        `Decision context step ${state.step}`
      )
    );
    if (!state.running) {
      break;
    }

    let decision = await requestDecision(
      before,
      visualReason
        ? {
            recoveryContext: `Visual context required because: ${truncate(visualReason, 160)}`
          }
        : {}
    );
    if (!state.running) {
      break;
    }

    let action = normalizeAction(decision?.action, before);

    if (!action && !before.screenshotDataUrl && state.config.includeScreenshotsInPrompt) {
      const fallbackReason = "DOM-only planning did not produce an executable action.";
      pushChat(
        "system",
        "Planner action was not executable from DOM context, retrying with screenshot."
      );
      before = await collectObservation(
        state.tabId,
        buildOnDemandScreenshotOptions(
          fallbackReason,
          `Decision retry step ${state.step}`
        )
      );
      decision = await requestDecision(before, {
        recoveryContext: fallbackReason
      });
      action = normalizeAction(decision?.action, before);
    }

    if (!action) {
      pushChat("system", "Stopped: model response could not be parsed as an action.");
      break;
    }

    const reasoning = typeof decision?.reasoning === "string" ? decision.reasoning.trim() : "";
    pushChat("assistant", formatActionAnnouncement(state.step, action, reasoning));

    if (action.type === "finish") {
      const finalAnswer =
        typeof decision?.final_answer === "string" && decision.final_answer.trim()
          ? decision.final_answer.trim()
          : "Model decided the task is complete.";
      pushChat("assistant", finalAnswer);
      break;
    }

    const highRiskReason = getHighRiskReason(action, before);
    if (highRiskReason) {
      const approved = await requestHighRiskApproval(action, before, highRiskReason);
      if (!approved) {
        pushChat("assistant", "High-risk action was not approved, so I stopped.");
        break;
      }
    }

    const execution = await executeAction(action);
    if (!execution.ok) {
      pushChat("system", `Action failed: ${execution.message}`);
      state.lastAction = action;
      state.lastChangeSummary = `Action failed: ${execution.message || "unknown"}`;
      nextDecisionVisualReason = `Action execution failed (${truncate(
        execution.message || "unknown",
        140
      )})`;
      continue;
    }
    if (!state.running) {
      break;
    }

    state.lastAction = action;
    if (action.type !== "wait") {
      await sleep(state.config.settleDelayMs);
    }
    if (!state.running) {
      break;
    }

    const after = await collectObservation(state.tabId);
    if (!state.running) {
      break;
    }

    const change = evaluateStateChange(before, after);
    state.lastChangeSummary = change.summary;
    pushChat("system", change.summary);

    const scrollGuard = evaluateScrollGuard(action, before, after);
    if (scrollGuard.checked) {
      if (scrollGuard.stuck) {
        state.scrollStallCount += 1;
        if (!nextDecisionVisualReason) {
          nextDecisionVisualReason = `Scroll progress was too small (${scrollGuard.deltaY}px).`;
        }
        pushChat(
          "system",
          `Scroll progress is too small (moved ${scrollGuard.deltaY}px). stall=${state.scrollStallCount}`
        );
      } else {
        state.scrollStallCount = 0;
      }

      if (state.scrollStallCount >= 2) {
        pushChat(
          "assistant",
          "Scroll no longer makes progress, so the agent stopped to avoid an infinite scroll loop."
        );
        break;
      }
    } else {
      state.scrollStallCount = 0;
    }

    if (!change.changed) {
      state.stagnationCount += 1;
      if (!nextDecisionVisualReason) {
        nextDecisionVisualReason = "No meaningful state change was detected.";
      }

      if (decision?.fallback_action) {
        const fallback = normalizeAction(decision.fallback_action, before);
        if (fallback) {
          pushChat("assistant", `Low change detected; running fallback: ${describeAction(fallback)}`);
          await executeAction(fallback);
          await sleep(state.config.settleDelayMs);
        }
      }

      if (state.stagnationCount >= state.config.maxStagnationSteps) {
        pushChat(
          "assistant",
          `Stopped: no meaningful state change for ${state.stagnationCount} consecutive steps.`
        );
        break;
      }
    } else {
      state.stagnationCount = 0;
    }
  }

  const tabId = state.tabId;
  state.running = false;
  state.mode = "idle";
  state.activeRpa = null;
  state.updatedAt = Date.now();
  state.scrollStallCount = 0;
  clearPendingApproval();
  await updateRunningIndicator(tabId, false, state.step);
  broadcastStatus();
  await persistChat();
}

async function collectObservation(tabId, options = {}) {
  let tab = await tabsGet(tabId);
  if (!tab) {
    throw new Error("Tab not found.");
  }
  if (!isAutomatableUrl(tab.url)) {
    throw new Error("Current URL is not automatable.");
  }
  if (!isAllowedDomain(tab.url, state.config.allowedDomains)) {
    throw new Error("Current domain is not in the allowlist.");
  }

  if (state.config.keepTabFocused && !tab.active) {
    await tabsUpdate(tab.id, { active: true });
    await sleep(200);
    tab = await tabsGet(tab.id);
  }

  state.windowId = tab.windowId ?? state.windowId;
  await ensureContentScript(tab.id);
  await updateRunningIndicator(tab.id, state.running, state.step);

  const pageState = await tabsSendMessage(tab.id, { type: "agent.getPageState" });
  if (!pageState?.ok) {
    throw new Error(pageState?.message || "Failed to collect page state.");
  }

  let screenshotDataUrl = null;
  let screenshotHash = null;
  const shouldCaptureScreenshot = Boolean(options.captureScreenshot || options.screenshotToChat);
  if (shouldCaptureScreenshot && typeof state.windowId === "number") {
    try {
      screenshotDataUrl = await captureVisibleTab(state.windowId, {
        format: "jpeg",
        quality: 55
      });
      screenshotHash = hashString(screenshotDataUrl);
      if (options.screenshotToChat) {
        pushScreenshotMessage(screenshotDataUrl, options.screenshotLabel);
      }
    } catch (error) {
      pushChat("system", `Screenshot capture failed: ${error.message}`);
    }
  }

  return {
    url: pageState.url || tab.url || "",
    title: pageState.title || tab.title || "",
    timestamp: new Date().toISOString(),
    viewport: {
      width: Number(pageState?.viewport?.width) || 0,
      height: Number(pageState?.viewport?.height) || 0
    },
    scroll: {
      x: Number(pageState?.scroll?.x) || 0,
      y: Number(pageState?.scroll?.y) || 0,
      maxY: Number(pageState?.scroll?.maxY) || 0,
      atTop: Boolean(pageState?.scroll?.atTop),
      atBottom: Boolean(pageState?.scroll?.atBottom)
    },
    page: {
      elements: Array.isArray(pageState.elements) ? pageState.elements : [],
      textSnippet: typeof pageState.textSnippet === "string" ? pageState.textSnippet : "",
      domSignature: typeof pageState.domSignature === "string" ? pageState.domSignature : ""
    },
    screenshotDataUrl,
    screenshotHash
  };
}

function buildOnDemandScreenshotOptions(reason, labelPrefix = "Screenshot") {
  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason) {
    return {};
  }
  const normalizedReason = trimmedReason.replace(/\s+/g, " ");
  return {
    captureScreenshot: true,
    screenshotToChat: true,
    screenshotLabel: `${labelPrefix}: ${truncate(normalizedReason, 120)}`
  };
}

async function suggestSkillMetadata(payload = {}) {
  const source = payload && typeof payload === "object" ? payload : {};
  const draftSource = source.draft && typeof source.draft === "object" ? source.draft : {};
  const configOverride = sanitizeConfig(source.config ?? {});
  const effectiveConfig = normalizeConfigObject({ ...state.config, ...configOverride });
  const fallbackTitle = truncate(
    String(draftSource.title || draftSource.base_title || draftSource.goal || "Browser Skill")
      .trim() || "Browser Skill",
    120
  );
  const fallbackWhenToUse = truncate(
    String(
      draftSource.whenToUse ||
        draftSource.when_to_use ||
        `Use this skill when you need to complete: ${draftSource.goal || fallbackTitle}`
    )
      .trim() || `Use this skill when you need to complete: ${fallbackTitle}`,
    360
  );
  const fallbackDescription = truncate(
    String(draftSource.description || draftSource.summary || "").trim(),
    260
  );
  const draft = {
    title: fallbackTitle,
    whenToUse: fallbackWhenToUse,
    description: fallbackDescription,
    goal: truncate(String(draftSource.goal || "").trim(), 260),
    source: truncate(String(draftSource.source || "browser").trim(), 60),
    scenarioName: truncate(String(draftSource.scenarioName || "").trim(), 120),
    steps: Array.isArray(draftSource.steps)
      ? draftSource.steps
          .map((step) => truncate(String(step || "").trim(), 180))
          .filter((step) => Boolean(step))
          .slice(0, 10)
      : []
  };

  try {
    const totalAttempts = 2;
    let retryHint = "";
    let lastError = null;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      const promptText = buildSkillMetadataPromptText(
        draft,
        effectiveConfig.responseLanguage,
        retryHint
      );
      const rawContent = await requestSkillMetadataFromProvider(promptText, effectiveConfig);
      const parsed = parseJsonLoose(rawContent);
      if (parsed && typeof parsed === "object") {
        const metadata = normalizeSkillMetadataSuggestion(parsed, draft);
        return {
          ok: true,
          provider: effectiveConfig.provider,
          metadata
        };
      }
      lastError = new Error("Skill metadata response was not valid JSON.");
      if (attempt < totalAttempts) {
        retryHint =
          "The previous response was invalid. Return exactly one JSON object with title, when_to_use, description.";
        await sleep(320 * attempt);
      }
    }
    throw lastError || new Error("Skill metadata response was not valid JSON.");
  } catch (error) {
    return {
      ok: false,
      provider: effectiveConfig.provider,
      error: error?.message || "Failed to suggest skill metadata."
    };
  }
}

function buildSkillMetadataPromptText(draft, language, retryHint = "") {
  const responseLanguage = normalizeResponseLanguage(language || DEFAULT_CONFIG.responseLanguage);
  const promptData = {
    goal: draft.goal || draft.title,
    source: draft.source,
    scenario_name: draft.scenarioName,
    base_title: draft.title,
    base_when_to_use: draft.whenToUse,
    base_description: draft.description,
    steps: draft.steps
  };

  const lines = [
    "Return strict JSON only.",
    "Schema:",
    "{",
    '  "title": "string",',
    '  "when_to_use": "string",',
    '  "description": "string"',
    "}",
    "",
    "Rules:",
    `1. Write all fields in ${responseLanguage}.`,
    "2. title must be concise and action-oriented (max 80 chars preferred).",
    "3. when_to_use must clearly describe trigger/timing and expected outcome (1-2 sentences).",
    "4. description must summarize what the skill does and key constraints (1 sentence).",
    "5. Keep wording reusable for future runs, not tied to one-time context.",
    "6. Do not add markdown, prose, or code fences.",
    "",
    "Input JSON:",
    JSON.stringify(promptData, null, 2)
  ];

  if (retryHint) {
    lines.push("");
    lines.push("Retry correction:");
    lines.push(retryHint);
  }

  return lines.join("\n");
}

function normalizeSkillMetadataSuggestion(raw, fallback) {
  const titleCandidate = String(raw.title || raw.skill_title || raw.name || "").trim();
  const whenToUseCandidate = String(
    raw.when_to_use || raw.whenToUse || raw.use_case || raw.when || ""
  ).trim();
  const descriptionCandidate = String(
    raw.description || raw.summary || raw.note || ""
  ).trim();

  const title = truncate(titleCandidate || fallback.title || "Browser Skill", 120);
  const whenToUse = truncate(
    whenToUseCandidate || fallback.whenToUse || `Use this skill when you need to run: ${title}`,
    360
  );
  const description = truncate(
    descriptionCandidate ||
      fallback.description ||
      `This skill automates browser steps for ${fallback.goal || title}.`,
    260
  );

  return {
    title,
    whenToUse,
    description
  };
}

async function requestSkillMetadataFromProvider(promptText, config) {
  const provider = normalizeProvider(config?.provider);
  if (provider === PROVIDERS.GEMINI_DIRECT) {
    return requestSkillMetadataViaGemini(promptText, config);
  }
  if (provider === PROVIDERS.BEDROCK_DIRECT) {
    return requestSkillMetadataViaBedrock(promptText, config);
  }
  return requestSkillMetadataViaLiteLLM(promptText, config);
}

async function requestSkillMetadataViaLiteLLM(promptText, config) {
  const endpoint = normalizeApiBase(config.apiBaseUrl);
  const model = getModelForProvider(PROVIDERS.LITELLM, config.providerModels);
  const language = normalizeResponseLanguage(config.responseLanguage);
  const requestBody = {
    model,
    temperature: clampNumber(config.temperature, 0, 1.2, 0.2),
    max_tokens: clampNumber(Math.min(config.maxTokens, 800), 180, 1000, 420),
    messages: [
      {
        role: "system",
        content: `You generate reusable automation skill metadata. Return strict JSON only in ${language}.`
      },
      { role: "user", content: promptText }
    ]
  };

  const headers = { "Content-Type": "application/json" };
  if (config.apiKeyLiteLLM) {
    headers.Authorization = `Bearer ${config.apiKeyLiteLLM}`;
  }

  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }
  const payload = await response.json();
  return extractAssistantContent(payload);
}

async function requestSkillMetadataViaGemini(promptText, config) {
  if (!config.apiKeyGemini) {
    throw new Error("Gemini direct mode requires API key.");
  }

  const model = normalizeGeminiModel(getModelForProvider(PROVIDERS.GEMINI_DIRECT, config.providerModels));
  if (!model) {
    throw new Error("Gemini model is empty.");
  }
  const language = normalizeResponseLanguage(config.responseLanguage);
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const requestBody = {
    systemInstruction: {
      parts: [
        {
          text: `You generate reusable automation skill metadata. Return strict JSON only in ${language}.`
        }
      ]
    },
    contents: [{ role: "user", parts: [{ text: promptText }] }],
    generationConfig: {
      temperature: clampNumber(config.temperature, 0, 1.2, 0.2),
      maxOutputTokens: clampNumber(Math.min(config.maxTokens, 800), 180, 1000, 420)
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": config.apiKeyGemini
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  return extractGeminiContent(payload);
}

async function requestSkillMetadataViaBedrock(promptText, config) {
  const region = normalizeBedrockRegion(config.bedrockRegion);
  const model = normalizeBedrockModel(getModelForProvider(PROVIDERS.BEDROCK_DIRECT, config.providerModels));
  const accessKeyId = String(config.bedrockAccessKeyId || "").trim();
  const secretAccessKey = String(config.bedrockSecretAccessKey || "").trim();
  const sessionToken = String(config.bedrockSessionToken || "").trim();

  if (!region) {
    throw new Error("Bedrock region is empty.");
  }
  if (!model) {
    throw new Error("Bedrock model is empty.");
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Bedrock direct mode requires AWS access key ID and secret access key.");
  }

  const language = normalizeResponseLanguage(config.responseLanguage);
  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(model)}/converse`;
  const endpoint = `https://${host}${path}`;
  const requestBody = {
    system: [
      {
        text: `You generate reusable automation skill metadata. Return strict JSON only in ${language}.`
      }
    ],
    messages: [{ role: "user", content: [{ text: promptText }] }],
    inferenceConfig: {
      temperature: clampNumber(config.temperature, 0, 1.2, 0.2),
      maxTokens: clampNumber(Math.min(config.maxTokens, 800), 180, 1000, 420)
    }
  };
  const bodyText = JSON.stringify(requestBody);
  const signedHeaders = await buildBedrockSigV4Headers({
    region,
    host,
    path,
    bodyText,
    accessKeyId,
    secretAccessKey,
    sessionToken
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: signedHeaders,
    body: bodyText
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bedrock API request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  return extractBedrockContent(payload);
}

async function requestDecision(observation, options = {}) {
  const goalOverride =
    typeof options?.goal === "string" && options.goal.trim() ? options.goal.trim() : state.goal;
  const recoveryContext =
    typeof options?.recoveryContext === "string" && options.recoveryContext.trim()
      ? options.recoveryContext.trim()
      : "";
  const pendingInstructions = state.pendingUserInstructions.splice(0, 3);

  const promptData = {
    goal: goalOverride,
    step: state.step,
    response_language: state.config.responseLanguage,
    current_url: observation.url,
    page_title: observation.title,
    viewport: observation.viewport,
    scroll: observation.scroll,
    last_action: state.lastAction,
    last_change_summary: state.lastChangeSummary,
    pending_user_instructions: pendingInstructions,
    text_snippet: observation.page.textSnippet.slice(0, 1200),
    elements: observation.page.elements.slice(0, 40).map((element) => ({
      id: element.id,
      tag: element.tag,
      type: element.type,
      label: element.label,
      text: element.text,
      placeholder: element.placeholder,
      ariaLabel: element.ariaLabel
    })),
    recovery_context: recoveryContext
  };

  const totalAttempts = DECISION_RETRY_MAX + 1;
  let retryHint = "";
  let lastError = null;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    const promptText = buildDecisionPromptText(promptData, retryHint);
    try {
      return await requestDecisionFromProvider(promptText, observation);
    } catch (error) {
      lastError = error;
      const retryable = isDecisionRetryableError(error);
      if (!retryable || attempt >= totalAttempts) {
        break;
      }
      pushChat(
        "system",
        `Planner response was invalid JSON. Retrying (${attempt + 1}/${totalAttempts})...`
      );
      retryHint = buildDecisionRetryHint(error);
      await sleep(DECISION_RETRY_DELAY_MS * attempt);
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("Planner failed unexpectedly.");
}

async function requestDecisionFromProvider(promptText, observation) {
  if (state.config.provider === PROVIDERS.GEMINI_DIRECT) {
    return requestDecisionViaGemini(promptText, observation);
  }
  if (state.config.provider === PROVIDERS.BEDROCK_DIRECT) {
    return requestDecisionViaBedrock(promptText, observation);
  }
  return requestDecisionViaLiteLLM(promptText, observation);
}

function buildDecisionPromptText(promptData, retryHint = "") {
  const lines = [
    "Return strict JSON only.",
    "Schema:",
    "{",
    '  "reasoning": "string",',
    '  "action": {',
    '    "type": "click|click_at|type|scroll|keypress|navigate|new_tab|wait|finish",',
    '    "target": { "element_id": "e_1", "selector": "optional css selector" },',
    '    "args": { "text": "for type", "key": "for keypress", "dy": 800, "url": "for navigate/new_tab", "ms": 1000, "x": 0.5, "y": 0.7, "normalized": true }',
    "  },",
    '  "success_criteria": [{"type":"url_contains|text_visible|title_contains","value":"..."}],',
    '  "fallback_action": {"type":"scroll","args":{"dy":500}},',
    '  "final_answer": "optional for finish"',
    "}",
    "",
    "Rules:",
    "1. Use element_id when possible.",
    "2. Choose one action only.",
    "3. If goal is already achieved, use finish.",
    "4. Do not include markdown fences.",
    "5. For scroll-down, prefer large movement (roughly 75-90% of viewport) to reduce overlap.",
    "6. If scroll is already at bottom/top and no progress, do not keep scrolling forever.",
    `7. Write reasoning and final_answer in ${state.config.responseLanguage}.`,
    "8. If the target is visible in screenshot but not reliably present in elements, use click_at with normalized coordinates (0 to 1).",
    "9. Use new_tab when the user asks to open a page in a new tab."
  ];

  if (promptData?.recovery_context) {
    lines.push("", `Recovery context: ${promptData.recovery_context}`);
  }

  if (retryHint) {
    lines.push("", "Retry correction:", retryHint);
  }

  lines.push("", "Current observation JSON:", JSON.stringify(promptData, null, 2));
  return lines.join("\n");
}

function isDecisionRetryableError(error) {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = typeof error.code === "string" ? error.code : "";
  return code === "INVALID_ACTION_JSON";
}

function buildDecisionRetryHint(error) {
  const rawSnippet = typeof error?.rawContent === "string" ? error.rawContent.trim() : "";
  const lines = [
    "The previous response was invalid.",
    "Return exactly one JSON object and include action.",
    "Do not add markdown, prose, or code fences."
  ];
  if (rawSnippet) {
    lines.push(`Previous invalid output (truncated): ${rawSnippet}`);
  }
  return lines.join("\n");
}

async function requestDecisionViaLiteLLM(promptText, observation) {
  const endpoint = normalizeApiBase(state.config.apiBaseUrl);
  const model = getModelForProvider(PROVIDERS.LITELLM);

  const messages = [{ role: "system", content: plannerSystemPrompt(state.config.responseLanguage) }];
  if (state.config.includeScreenshotsInPrompt && observation.screenshotDataUrl) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: promptText },
        { type: "image_url", image_url: { url: observation.screenshotDataUrl } }
      ]
    });
  } else {
    messages.push({ role: "user", content: promptText });
  }

  const requestBody = {
    model,
    temperature: state.config.temperature,
    max_tokens: state.config.maxTokens,
    messages
  };

  const headers = { "Content-Type": "application/json" };
  if (state.config.apiKeyLiteLLM) {
    headers.Authorization = `Bearer ${state.config.apiKeyLiteLLM}`;
  }

  const response = await fetch(`${endpoint}/v1/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const rawContent = extractAssistantContent(payload);
  return parseDecisionPayload(rawContent, "LiteLLM");
}

async function requestDecisionViaGemini(promptText, observation) {
  if (!state.config.apiKeyGemini) {
    throw new Error("Gemini direct mode requires API key.");
  }

  const model = normalizeGeminiModel(getModelForProvider(PROVIDERS.GEMINI_DIRECT));
  if (!model) {
    throw new Error("Gemini model is empty.");
  }

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const parts = [{ text: promptText }];

  if (state.config.includeScreenshotsInPrompt && observation.screenshotDataUrl) {
    const inlineImage = dataUrlToGeminiInlineData(observation.screenshotDataUrl);
    if (inlineImage) {
      parts.push({
        inline_data: {
          mime_type: inlineImage.mimeType,
          data: inlineImage.base64
        }
      });
    }
  }

  const requestBody = {
    systemInstruction: {
      parts: [{ text: plannerSystemPrompt(state.config.responseLanguage) }]
    },
    contents: [
      {
        role: "user",
        parts
      }
    ],
    generationConfig: {
      temperature: state.config.temperature,
      maxOutputTokens: state.config.maxTokens
    }
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": state.config.apiKeyGemini
    },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const rawContent = extractGeminiContent(payload);
  return parseDecisionPayload(rawContent, "Gemini");
}

async function requestDecisionViaBedrock(promptText, observation) {
  const region = normalizeBedrockRegion(state.config.bedrockRegion);
  const model = normalizeBedrockModel(getModelForProvider(PROVIDERS.BEDROCK_DIRECT));
  const accessKeyId = String(state.config.bedrockAccessKeyId || "").trim();
  const secretAccessKey = String(state.config.bedrockSecretAccessKey || "").trim();
  const sessionToken = String(state.config.bedrockSessionToken || "").trim();

  if (!region) {
    throw new Error("Bedrock region is empty.");
  }
  if (!model) {
    throw new Error("Bedrock model is empty.");
  }
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Bedrock direct mode requires AWS access key ID and secret access key.");
  }

  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(model)}/converse`;
  const endpoint = `https://${host}${path}`;

  const userContent = [{ text: promptText }];
  if (state.config.includeScreenshotsInPrompt && observation.screenshotDataUrl) {
    const inlineImage = dataUrlToBedrockImage(observation.screenshotDataUrl);
    if (inlineImage) {
      userContent.push({
        image: {
          format: inlineImage.format,
          source: { bytes: inlineImage.base64 }
        }
      });
    }
  }

  const requestBody = {
    system: [{ text: plannerSystemPrompt(state.config.responseLanguage) }],
    messages: [{ role: "user", content: userContent }],
    inferenceConfig: {
      temperature: state.config.temperature,
      maxTokens: state.config.maxTokens
    }
  };
  const bodyText = JSON.stringify(requestBody);
  const signedHeaders = await buildBedrockSigV4Headers({
    region,
    host,
    path,
    bodyText,
    accessKeyId,
    secretAccessKey,
    sessionToken
  });

  const response = await fetch(endpoint, {
    method: "POST",
    headers: signedHeaders,
    body: bodyText
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Bedrock API request failed (${response.status}): ${errorText.slice(0, 300)}`);
  }

  const payload = await response.json();
  const rawContent = extractBedrockContent(payload);
  return parseDecisionPayload(rawContent, "Bedrock");
}

function normalizeAction(rawAction, observation) {
  if (!rawAction || typeof rawAction !== "object") {
    return null;
  }

  const type = String(rawAction.type || "").toLowerCase().trim();
  const allowed = new Set([
    "click",
    "click_at",
    "type",
    "scroll",
    "keypress",
    "navigate",
    "new_tab",
    "wait",
    "finish"
  ]);
  if (!allowed.has(type)) {
    return null;
  }

  const target = rawAction.target && typeof rawAction.target === "object" ? rawAction.target : {};
  const args = rawAction.args && typeof rawAction.args === "object" ? rawAction.args : {};

  const normalized = {
    type,
    target: {},
    args: {}
  };

  const elementId =
    typeof target.element_id === "string" && target.element_id.trim()
      ? target.element_id.trim()
      : null;

  const elementById = elementId
    ? observation.page.elements.find((entry) => entry.id === elementId) || null
    : null;

  if (elementId) {
    normalized.target.element_id = elementId;
  }

  if (elementById?.selector) {
    normalized.target.selector = elementById.selector;
  } else if (typeof target.selector === "string" && target.selector.trim()) {
    normalized.target.selector = target.selector.trim();
  }

  if (type === "click") {
    if (!normalized.target.selector) {
      return null;
    }
    return normalized;
  }

  if (type === "click_at") {
    const viewportWidth = Number(observation?.viewport?.width) || 0;
    const viewportHeight = Number(observation?.viewport?.height) || 0;
    const xRaw = args.x ?? rawAction.x;
    const yRaw = args.y ?? rawAction.y;
    const normalizedXRaw = args.normalized_x;
    const normalizedYRaw = args.normalized_y;

    const x = Number.isFinite(Number(xRaw))
      ? Number(xRaw)
      : Number.isFinite(Number(normalizedXRaw))
        ? Number(normalizedXRaw)
        : NaN;
    const y = Number.isFinite(Number(yRaw))
      ? Number(yRaw)
      : Number.isFinite(Number(normalizedYRaw))
        ? Number(normalizedYRaw)
        : NaN;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const normalizedFlag =
      typeof args.normalized === "boolean"
        ? args.normalized
        : x >= 0 && x <= 1 && y >= 0 && y <= 1;

    if (normalizedFlag) {
      normalized.args.x = clampNumber(x, 0, 1, 0.5);
      normalized.args.y = clampNumber(y, 0, 1, 0.5);
      normalized.args.normalized = true;
    } else {
      const maxX = Math.max(1, viewportWidth - 1);
      const maxY = Math.max(1, viewportHeight - 1);
      normalized.args.x = clampNumber(x, 0, maxX, Math.floor(maxX / 2));
      normalized.args.y = clampNumber(y, 0, maxY, Math.floor(maxY / 2));
      normalized.args.normalized = false;
    }

    normalized.args.moveMs = clampNumber(args.moveMs ?? args.move_ms, 80, 3000, 420);
    normalized.args.moveSteps = clampNumber(args.moveSteps ?? args.move_steps, 2, 40, 14);
    return normalized;
  }

  if (type === "type") {
    if (!normalized.target.selector) {
      return null;
    }
    const text = typeof args.text === "string" ? args.text : "";
    if (!text) {
      return null;
    }
    normalized.args.text = text;
    normalized.args.pressEnter = Boolean(args.pressEnter);
    return normalized;
  }

  if (type === "scroll") {
    const suggestedDy = suggestScrollDy(args.dy, observation);
    normalized.args.dy = clampNumber(suggestedDy, -4000, 4000, 900);
    normalized.args.dx = clampNumber(args.dx, -4000, 4000, 0);
    return normalized;
  }

  if (type === "keypress") {
    normalized.args.key =
      typeof args.key === "string" && args.key.trim() ? args.key.trim() : "Enter";
    if (normalized.target.selector) {
      return normalized;
    }
    return { ...normalized, target: {} };
  }

  if (type === "navigate") {
    const candidate =
      typeof args.url === "string"
        ? args.url
        : typeof rawAction.url === "string"
          ? rawAction.url
          : "";
    const url = normalizeNavigationUrl(candidate);
    if (!url) {
      return null;
    }
    normalized.args.url = url;
    normalized.target = {};
    return normalized;
  }

  if (type === "new_tab") {
    const candidate =
      typeof args.url === "string"
        ? args.url
        : typeof rawAction.url === "string"
          ? rawAction.url
          : "";
    const url = normalizeNavigationUrl(candidate);
    if (!url) {
      return null;
    }
    normalized.args.url = url;
    normalized.target = {};
    return normalized;
  }

  if (type === "wait") {
    normalized.args.ms = clampNumber(args.ms, 200, 10000, 1000);
    normalized.target = {};
    return normalized;
  }

  return normalized;
}

async function executeAction(action) {
  try {
    if (action.type === "new_tab") {
      const previousTabId = state.tabId;
      await updateRunningIndicator(previousTabId, false, state.step);

      const createdTab = await tabsCreate({
        url: action.args.url,
        active: true
      });
      if (!createdTab || typeof createdTab.id !== "number") {
        return { ok: false, message: "Failed to open new tab." };
      }

      state.tabId = createdTab.id;
      state.windowId = createdTab.windowId ?? state.windowId;
      state.updatedAt = Date.now();
      await updateRunningIndicator(state.tabId, true, state.step);
      return { ok: true, message: `Opened new tab: ${safeUrl(action.args.url)}` };
    }

    if (action.type === "navigate") {
      await tabsUpdate(state.tabId, { url: action.args.url });
      return { ok: true, message: `Navigated to ${action.args.url}` };
    }

    if (action.type === "wait") {
      await sleep(action.args.ms);
      return { ok: true, message: `Waited for ${action.args.ms} ms` };
    }

    await ensureContentScript(state.tabId);
    const response = await tabsSendMessage(state.tabId, {
      type: "agent.performAction",
      action
    });
    if (!response?.ok) {
      return { ok: false, message: response?.message || "Action failed." };
    }
    return { ok: true, message: response?.message || "Action executed." };
  } catch (error) {
    return { ok: false, message: error.message };
  }
}

function evaluateStateChange(before, after) {
  const reasons = [];

  if (before.url !== after.url) {
    reasons.push(`URL changed: ${safeUrl(before.url)} -> ${safeUrl(after.url)}`);
  }
  if (before.title !== after.title) {
    reasons.push(`Title changed: "${before.title}" -> "${after.title}"`);
  }
  const beforeY = Number(before?.scroll?.y);
  const afterY = Number(after?.scroll?.y);
  if (Number.isFinite(beforeY) && Number.isFinite(afterY) && beforeY !== afterY) {
    reasons.push(`ScrollY changed: ${beforeY} -> ${afterY}`);
  }
  if (before.page.domSignature && after.page.domSignature && before.page.domSignature !== after.page.domSignature) {
    reasons.push("DOM signature changed");
  }
  if (
    before.screenshotHash &&
    after.screenshotHash &&
    before.screenshotHash !== after.screenshotHash
  ) {
    reasons.push("Screenshot changed");
  }

  const changed = reasons.length > 0;
  return {
    changed,
    reasons,
    summary: changed ? `State change: ${reasons.join(" / ")}` : "State change: none"
  };
}

function evaluateScrollGuard(action, before, after) {
  if (action?.type !== "scroll") {
    return { checked: false };
  }

  const requestedDy = Number(action?.args?.dy);
  const beforeY = Number(before?.scroll?.y);
  const afterY = Number(after?.scroll?.y);
  if (!Number.isFinite(beforeY) || !Number.isFinite(afterY)) {
    return { checked: true, stuck: false, deltaY: 0 };
  }

  const deltaY = Math.round(afterY - beforeY);
  const viewportHeight = Number(after?.viewport?.height || before?.viewport?.height) || 800;
  const minMeaningfulMove = Math.max(18, Math.round(viewportHeight * 0.04));
  const movingDown = !Number.isFinite(requestedDy) || requestedDy >= 0;
  const movingUp = Number.isFinite(requestedDy) && requestedDy < 0;
  const atBottom = Boolean(after?.scroll?.atBottom);
  const atTop = Boolean(after?.scroll?.atTop);

  const lowProgress = Math.abs(deltaY) < minMeaningfulMove;
  const stuckDown = movingDown && (atBottom || deltaY < minMeaningfulMove);
  const stuckUp = movingUp && (atTop || -deltaY < minMeaningfulMove);
  const stuck = lowProgress || stuckDown || stuckUp;

  return {
    checked: true,
    stuck,
    deltaY,
    atBottom,
    atTop
  };
}

function formatActionAnnouncement(step, action, reasoning) {
  if (reasoning) {
    return `Step ${step}: ${describeAction(action)}\nReason: ${reasoning}`;
  }
  return `Step ${step}: ${describeAction(action)}`;
}

function describeAction(action) {
  if (!action || typeof action !== "object") {
    return "invalid action";
  }
  const idPart = action.target?.element_id ? ` ${action.target.element_id}` : "";
  if (action.type === "click") {
    return `click${idPart}`;
  }
  if (action.type === "click_at") {
    if (action.args?.normalized) {
      return `click_at (${action.args.x.toFixed(3)}, ${action.args.y.toFixed(3)})`;
    }
    return `click_at (${Math.round(action.args?.x || 0)}, ${Math.round(action.args?.y || 0)})`;
  }
  if (action.type === "type") {
    return `type${idPart} "${truncate(action.args.text, 40)}"`;
  }
  if (action.type === "scroll") {
    return `scroll dy=${action.args.dy}`;
  }
  if (action.type === "keypress") {
    return `keypress "${action.args.key}"`;
  }
  if (action.type === "navigate") {
    return `navigate ${safeUrl(action.args.url)}`;
  }
  if (action.type === "new_tab") {
    return `new_tab ${safeUrl(action.args.url)}`;
  }
  if (action.type === "wait") {
    return `wait ${action.args.ms}ms`;
  }
  if (action.type === "finish") {
    return "finish";
  }
  return action.type;
}

function getHighRiskReason(action, observation) {
  if (!state.config.blockHighRisk) {
    return null;
  }

  if (action.type === "click_at") {
    return "Coordinate click requires manual confirmation because element semantics are ambiguous.";
  }

  if (action.type === "type") {
    const typed = String(action.args?.text || "").toLowerCase();
    const matchedKeyword = HIGH_RISK_KEYWORDS.find((keyword) => typed.includes(keyword));
    if (matchedKeyword) {
      return `Typed text matched high-risk keyword "${matchedKeyword}".`;
    }
  }

  if (!["click", "keypress"].includes(action.type)) {
    return null;
  }

  let label = "";
  if (action.target?.element_id) {
    const element = observation.page.elements.find((entry) => entry.id === action.target.element_id);
    if (element) {
      label = `${element.label || ""} ${element.text || ""}`.toLowerCase();
    }
  }
  if (action.target?.selector) {
    label += ` ${action.target.selector.toLowerCase()}`;
  }

  const matchedKeyword = HIGH_RISK_KEYWORDS.find((keyword) => label.includes(keyword));
  if (!matchedKeyword) {
    return null;
  }
  return `Element context matched high-risk keyword "${matchedKeyword}".`;
}

async function findTargetTab(sender) {
  const senderTabId = sender?.tab?.id;
  if (typeof senderTabId === "number") {
    try {
      const senderTab = await tabsGet(senderTabId);
      if (senderTab && isAutomatableUrl(senderTab.url)) {
        return senderTab;
      }
    } catch {
      // no-op
    }
  }

  const currentWindowTabs = await tabsQuery({ active: true, currentWindow: true });
  const activeCurrent = currentWindowTabs.find((tab) => isAutomatableUrl(tab.url));
  if (activeCurrent) {
    return activeCurrent;
  }

  const lastFocusedTabs = await tabsQuery({ active: true, lastFocusedWindow: true });
  return lastFocusedTabs.find((tab) => isAutomatableUrl(tab.url)) || null;
}

async function ensureContentScript(tabId) {
  try {
    await tabsSendMessage(tabId, { type: "agent.ping" });
    return;
  } catch {
    await executeScript(tabId, ["browser_content_script.js"]);
    await tabsSendMessage(tabId, { type: "agent.ping" });
  }
}

async function updateRunningIndicator(tabId, active, step) {
  if (typeof tabId !== "number") {
    return;
  }
  try {
    await tabsSendMessage(tabId, {
      type: "agent.setRunningIndicator",
      active: Boolean(active),
      step: Number(step) || 0
    });
  } catch {
    try {
      await ensureContentScript(tabId);
      await tabsSendMessage(tabId, {
        type: "agent.setRunningIndicator",
        active: Boolean(active),
        step: Number(step) || 0
      });
    } catch {
      // no-op
    }
  }
}

async function requestHighRiskApproval(action, observation, reason) {
  const approval = {
    id: buildApprovalId(),
    step: state.step,
    action,
    actionText: describeAction(action),
    reason: String(reason || "High-risk operation detected."),
    targetText: extractApprovalTargetText(action, observation),
    requestedAt: Date.now(),
    decision: null,
    decidedAt: null
  };

  state.pendingApproval = approval;
  state.updatedAt = Date.now();
  broadcast({ type: "approval.requested", payload: toApprovalPayload(approval) });
  broadcastStatus();

  pushChat(
    "system",
    `Manual approval required before executing: ${approval.actionText}\nReason: ${approval.reason}`
  );

  const timeoutMs = 120000;
  const startedAt = Date.now();
  while (state.running && state.pendingApproval?.id === approval.id && !state.pendingApproval.decision) {
    if (Date.now() - startedAt > timeoutMs) {
      state.pendingApproval.decision = "timeout";
      break;
    }
    await sleep(250);
  }

  const decision =
    state.pendingApproval?.id === approval.id ? state.pendingApproval.decision : null;
  clearPendingApproval();

  if (decision === "approved") {
    pushChat("system", "Manual approval granted.");
    return true;
  }

  if (decision === "rejected") {
    pushChat("system", "Manual approval rejected.");
    return false;
  }

  pushChat("system", "Manual approval timed out.");
  return false;
}

function extractApprovalTargetText(action, observation) {
  if (!action || !observation || !Array.isArray(observation.page?.elements)) {
    return "";
  }
  if (!action.target?.element_id) {
    return "";
  }
  const element = observation.page.elements.find((entry) => entry.id === action.target.element_id);
  if (!element) {
    return "";
  }
  const pieces = [element.label, element.text, element.placeholder, element.ariaLabel]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return truncate(pieces.join(" | "), 140);
}

function toApprovalPayload(approval) {
  if (!approval || typeof approval !== "object") {
    return null;
  }
  return {
    id: approval.id,
    step: approval.step,
    actionText: approval.actionText,
    reason: approval.reason,
    targetText: approval.targetText,
    requestedAt: approval.requestedAt
  };
}

function clearPendingApproval() {
  if (!state.pendingApproval) {
    return;
  }
  state.pendingApproval = null;
  state.updatedAt = Date.now();
  broadcast({ type: "approval.cleared" });
  broadcastStatus();
}

function pushChat(role, text, meta = {}) {
  const message = {
    id: buildMessageId(),
    role: normalizeRole(role),
    text: String(text || ""),
    at: Date.now(),
    meta
  };
  state.chat.push(message);
  if (state.chat.length > MAX_CHAT_MESSAGES) {
    state.chat = state.chat.slice(-MAX_CHAT_MESSAGES);
  }
  state.updatedAt = Date.now();
  broadcast({ type: "chat.message", payload: message });
  void persistChat();
}

function pushScreenshotMessage(dataUrl, label) {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return;
  }
  pushChat("system", label || "Screenshot captured.", {
    kind: "screenshot",
    imageDataUrl: dataUrl
  });
}

function getStatus() {
  return {
    running: state.running,
    mode: state.mode,
    sessionId: state.sessionId,
    goal: state.goal,
    step: state.step,
    tabId: state.tabId,
    activeRpa: state.activeRpa,
    activeRecording: toRecordingPayload(state.activeRecording),
    pendingApproval: state.pendingApproval ? toApprovalPayload(state.pendingApproval) : null,
    updatedAt: state.updatedAt
  };
}

function broadcastStatus() {
  broadcast({ type: "agent.status", payload: getStatus() });
}

function broadcast(message) {
  for (const port of Array.from(panelPorts)) {
    const ok = safePostMessage(port, message);
    if (!ok) {
      panelPorts.delete(port);
    }
  }
}

function safePostMessage(port, message) {
  try {
    port.postMessage(message);
    return true;
  } catch {
    return false;
  }
}

async function initializeState() {
  const persisted = await storageGet(["agentConfig", "agentChat"]);
  const persistedConfig = sanitizeConfig(persisted.agentConfig ?? {});
  state.config = normalizeConfigObject({ ...DEFAULT_CONFIG, ...persistedConfig });
  state.chat = Array.isArray(persisted.agentChat)
    ? persisted.agentChat.slice(-MAX_CHAT_MESSAGES)
    : [];
  state.updatedAt = Date.now();
}

async function persistConfig() {
  await storageSet({ agentConfig: state.config });
}

async function persistChat() {
  const safeChat = state.chat.map(stripTransientMetaForStorage);
  await storageSet({ agentChat: safeChat });
}

function sanitizeConfig(input) {
  if (!input || typeof input !== "object") {
    return {};
  }

  const next = {};
  const provider =
    typeof input.provider === "string" ? normalizeProvider(input.provider) : null;
  if (provider) {
    next.provider = provider;
  }

  if (typeof input.apiBaseUrl === "string") {
    const trimmed = input.apiBaseUrl.trim();
    if (trimmed) {
      next.apiBaseUrl = trimmed;
    }
  }
  if (typeof input.apiKeyLiteLLM === "string") {
    next.apiKeyLiteLLM = input.apiKeyLiteLLM.trim();
  }
  if (typeof input.apiKeyGemini === "string") {
    next.apiKeyGemini = input.apiKeyGemini.trim();
  }
  if (typeof input.apiKey === "string") {
    const legacyApiKey = input.apiKey.trim();
    if ((provider || state.config.provider) === PROVIDERS.GEMINI_DIRECT) {
      next.apiKeyGemini = legacyApiKey;
    } else {
      next.apiKeyLiteLLM = legacyApiKey;
    }
  }

  if (typeof input.bedrockRegion === "string") {
    const normalizedRegion = normalizeBedrockRegion(input.bedrockRegion);
    if (normalizedRegion) {
      next.bedrockRegion = normalizedRegion;
    }
  }
  if (typeof input.bedrockAccessKeyId === "string") {
    next.bedrockAccessKeyId = input.bedrockAccessKeyId.trim();
  }
  if (typeof input.bedrockSecretAccessKey === "string") {
    next.bedrockSecretAccessKey = input.bedrockSecretAccessKey.trim();
  }
  if (typeof input.bedrockSessionToken === "string") {
    next.bedrockSessionToken = input.bedrockSessionToken.trim();
  }

  const hasProviderModelsInput = Boolean(
    input.providerModels && typeof input.providerModels === "object"
  );
  if (hasProviderModelsInput) {
    next.providerModels = normalizeProviderModels(input.providerModels);
  }

  if (typeof input.model === "string") {
    const trimmed = input.model.trim();
    if (trimmed) {
      next.model = trimmed;
      const activeProvider = provider || state.config.provider || DEFAULT_CONFIG.provider;
      const providerModels = hasProviderModelsInput
        ? { ...next.providerModels }
        : normalizeProviderModels(state.config.providerModels);
      providerModels[activeProvider] = trimmed;
      next.providerModels = providerModels;
    }
  }
  if (typeof input.responseLanguage === "string") {
    next.responseLanguage = normalizeResponseLanguage(input.responseLanguage);
  }
  if (typeof input.allowedDomains === "string") {
    next.allowedDomains = input.allowedDomains.trim();
  }
  if (typeof input.includeScreenshotsInPrompt === "boolean") {
    next.includeScreenshotsInPrompt = input.includeScreenshotsInPrompt;
  }
  if (typeof input.blockHighRisk === "boolean") {
    next.blockHighRisk = input.blockHighRisk;
  }
  if (typeof input.keepTabFocused === "boolean") {
    next.keepTabFocused = input.keepTabFocused;
  }

  const numericFields = [
    ["maxSteps", 1, 100, DEFAULT_CONFIG.maxSteps],
    ["settleDelayMs", 200, 10000, DEFAULT_CONFIG.settleDelayMs],
    ["maxStagnationSteps", 1, 20, DEFAULT_CONFIG.maxStagnationSteps],
    ["temperature", 0, 1.5, DEFAULT_CONFIG.temperature],
    ["maxTokens", 200, 4000, DEFAULT_CONFIG.maxTokens]
  ];

  for (const [key, min, max, fallback] of numericFields) {
    if (input[key] === undefined || input[key] === null || input[key] === "") {
      continue;
    }
    next[key] = clampNumber(input[key], min, max, fallback);
  }

  return next;
}

function normalizeConfigObject(input) {
  const merged = { ...DEFAULT_CONFIG, ...(input || {}) };
  merged.provider = normalizeProvider(merged.provider);
  merged.providerModels = normalizeProviderModels(merged.providerModels);
  merged.model = getModelForProvider(merged.provider, merged.providerModels);

  merged.apiBaseUrl = normalizeApiBase(merged.apiBaseUrl);
  merged.apiKeyLiteLLM = String(merged.apiKeyLiteLLM || "").trim();
  merged.apiKeyGemini = String(merged.apiKeyGemini || "").trim();
  merged.bedrockRegion = normalizeBedrockRegion(merged.bedrockRegion) || DEFAULT_CONFIG.bedrockRegion;
  merged.bedrockAccessKeyId = String(merged.bedrockAccessKeyId || "").trim();
  merged.bedrockSecretAccessKey = String(merged.bedrockSecretAccessKey || "").trim();
  merged.bedrockSessionToken = String(merged.bedrockSessionToken || "").trim();
  merged.responseLanguage = normalizeResponseLanguage(merged.responseLanguage);
  merged.allowedDomains = String(merged.allowedDomains || "").trim();
  merged.includeScreenshotsInPrompt = Boolean(merged.includeScreenshotsInPrompt);
  merged.blockHighRisk = Boolean(merged.blockHighRisk);
  merged.keepTabFocused = Boolean(merged.keepTabFocused);
  merged.maxSteps = clampNumber(merged.maxSteps, 1, 100, DEFAULT_CONFIG.maxSteps);
  merged.settleDelayMs = clampNumber(merged.settleDelayMs, 200, 10000, DEFAULT_CONFIG.settleDelayMs);
  merged.maxStagnationSteps = clampNumber(
    merged.maxStagnationSteps,
    1,
    20,
    DEFAULT_CONFIG.maxStagnationSteps
  );
  merged.temperature = clampNumber(merged.temperature, 0, 1.5, DEFAULT_CONFIG.temperature);
  merged.maxTokens = clampNumber(merged.maxTokens, 200, 4000, DEFAULT_CONFIG.maxTokens);
  return merged;
}

function normalizeProvider(value) {
  const provider = String(value || "").trim().toLowerCase();
  if (provider === PROVIDERS.GEMINI_DIRECT) {
    return PROVIDERS.GEMINI_DIRECT;
  }
  if (provider === PROVIDERS.BEDROCK_DIRECT || provider === "bedrock") {
    return PROVIDERS.BEDROCK_DIRECT;
  }
  return PROVIDERS.LITELLM;
}

function normalizeProviderModels(input) {
  const normalized = { ...PROVIDER_MODEL_DEFAULTS };
  if (!input || typeof input !== "object") {
    return normalized;
  }
  for (const provider of Object.values(PROVIDERS)) {
    const raw = input[provider];
    if (typeof raw !== "string") {
      continue;
    }
    const trimmed = raw.trim();
    if (trimmed) {
      normalized[provider] = trimmed;
    }
  }
  return normalized;
}

function getModelForProvider(provider, providerModels = state.config.providerModels) {
  const normalizedProvider = normalizeProvider(provider);
  const models = normalizeProviderModels(providerModels);
  return models[normalizedProvider] || PROVIDER_MODEL_DEFAULTS[normalizedProvider];
}

function normalizeApiBase(apiBaseUrl) {
  const value = typeof apiBaseUrl === "string" ? apiBaseUrl.trim() : "";
  const normalized = value || DEFAULT_CONFIG.apiBaseUrl;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizeGeminiModel(model) {
  const value = typeof model === "string" ? model.trim() : "";
  if (!value) {
    return "";
  }

  if (value.startsWith("models/")) {
    return value.slice("models/".length);
  }
  if (value.startsWith("gemini/")) {
    return value.slice("gemini/".length);
  }
  return value;
}

function normalizeBedrockModel(model) {
  return typeof model === "string" ? model.trim() : "";
}

function normalizeBedrockRegion(region) {
  const value = typeof region === "string" ? region.trim() : "";
  if (!value) {
    return "";
  }
  return value.toLowerCase();
}

function normalizeResponseLanguage(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    return DEFAULT_CONFIG.responseLanguage;
  }
  return truncate(raw, 40);
}

function plannerSystemPrompt(responseLanguage) {
  const language = normalizeResponseLanguage(responseLanguage || DEFAULT_CONFIG.responseLanguage);
  return [
    "You are a browser automation planner.",
    "You must return strict JSON only.",
    "Think about the current page and choose one next action.",
    "Use safe, reversible actions first.",
    "When the goal appears completed, return action.type=finish.",
    `Write reasoning and final_answer in ${language}.`
  ].join(" ");
}

function parseJsonLoose(raw) {
  if (!raw) {
    return null;
  }
  if (typeof raw === "object") {
    return raw;
  }

  const content = String(raw).trim();
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
  let escape = false;
  for (let i = start; i < content.length; i += 1) {
    const char = content[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
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

function parseDecisionPayload(rawContent, providerLabel) {
  const parsed = parseJsonLoose(rawContent);
  if (parsed && typeof parsed === "object" && parsed.action) {
    return parsed;
  }

  const error = new Error(`${providerLabel} response did not contain a valid action JSON.`);
  error.code = "INVALID_ACTION_JSON";
  error.rawContent = truncate(rawContent, 320);
  throw error;
}

function extractAssistantContent(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (Array.isArray(content)) {
    return content
      .map((chunk) => {
        if (typeof chunk === "string") {
          return chunk;
        }
        if (chunk && typeof chunk.text === "string") {
          return chunk.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }
  if (typeof content === "string") {
    return content.trim();
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  return "";
}

function extractGeminiContent(payload) {
  const parts = payload?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    return parts
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("\n")
      .trim();
  }
  return "";
}

function extractBedrockContent(payload) {
  const content = payload?.output?.message?.content;
  if (!Array.isArray(content)) {
    return "";
  }
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();
}

function dataUrlToGeminiInlineData(dataUrl) {
  if (typeof dataUrl !== "string") {
    return null;
  }

  const matched = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!matched) {
    return null;
  }

  const mimeType = matched[1] || "image/jpeg";
  const base64 = matched[2] || "";
  if (!base64) {
    return null;
  }

  return { mimeType, base64 };
}

function dataUrlToBedrockImage(dataUrl) {
  const inline = dataUrlToGeminiInlineData(dataUrl);
  if (!inline) {
    return null;
  }

  const mimeType = inline.mimeType.toLowerCase();
  let format = "";
  if (mimeType.includes("png")) {
    format = "png";
  } else if (mimeType.includes("jpeg") || mimeType.includes("jpg")) {
    format = "jpeg";
  } else if (mimeType.includes("webp")) {
    format = "webp";
  } else if (mimeType.includes("gif")) {
    format = "gif";
  }
  if (!format) {
    return null;
  }

  return { format, base64: inline.base64 };
}

async function buildBedrockSigV4Headers(params) {
  const host = params.host;
  const path = params.path;
  const region = params.region;
  const accessKeyId = params.accessKeyId;
  const secretAccessKey = params.secretAccessKey;
  const sessionToken = params.sessionToken;
  const bodyText = params.bodyText;

  const amzDate = toAwsAmzDate(new Date());
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = await sha256Hex(bodyText);

  const canonicalHeaderMap = {
    "content-type": "application/json",
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate
  };
  if (sessionToken) {
    canonicalHeaderMap["x-amz-security-token"] = sessionToken;
  }

  const signedHeaderKeys = Object.keys(canonicalHeaderMap).sort();
  const canonicalHeaders = signedHeaderKeys
    .map((key) => `${key}:${normalizeAwsHeaderValue(canonicalHeaderMap[key])}`)
    .join("\n")
    .concat("\n");
  const signedHeaders = signedHeaderKeys.join(";");
  const canonicalRequest = [
    "POST",
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash
  ].join("\n");

  const credentialScope = `${dateStamp}/${region}/bedrock/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest)
  ].join("\n");

  const signingKey = await deriveAwsSigningKey(secretAccessKey, dateStamp, region, "bedrock");
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const authorization = [
    "AWS4-HMAC-SHA256",
    `Credential=${accessKeyId}/${credentialScope},`,
    `SignedHeaders=${signedHeaders},`,
    `Signature=${signature}`
  ].join(" ");

  const headers = {
    "Content-Type": "application/json",
    "X-Amz-Date": amzDate,
    "X-Amz-Content-Sha256": payloadHash,
    Authorization: authorization
  };
  if (sessionToken) {
    headers["X-Amz-Security-Token"] = sessionToken;
  }
  return headers;
}

function toAwsAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function normalizeAwsHeaderValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

async function sha256Hex(value) {
  const bytes = valueToUint8Array(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return toHex(new Uint8Array(digest));
}

async function hmacSha256(key, message) {
  const keyBytes = valueToUint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, valueToUint8Array(message));
  return new Uint8Array(signature);
}

async function deriveAwsSigningKey(secretAccessKey, dateStamp, region, service) {
  const kDate = await hmacSha256(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, service);
  return hmacSha256(kService, "aws4_request");
}

function valueToUint8Array(value) {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  return textEncoder.encode(String(value ?? ""));
}

function toHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function isAllowedDomain(url, allowlistRaw) {
  const allowlist = String(allowlistRaw || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  if (allowlist.length === 0) {
    return true;
  }
  try {
    const host = new URL(url).hostname.toLowerCase();
    return allowlist.some((domain) => host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function isAutomatableUrl(url) {
  if (typeof url !== "string") {
    return false;
  }
  return url.startsWith("http://") || url.startsWith("https://");
}

function normalizeNavigationUrl(candidate) {
  if (typeof candidate !== "string" || !candidate.trim()) {
    return null;
  }
  const value = candidate.trim();
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function safeUrl(url) {
  if (typeof url !== "string" || !url) {
    return "(no-url)";
  }
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return url;
  }
}

function truncate(value, maxLen) {
  const text = String(value || "");
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen - 1)}...`;
}

function normalizeRole(role) {
  if (role === "assistant" || role === "user" || role === "system") {
    return role;
  }
  return "system";
}

function stripTransientMetaForStorage(message) {
  const base = message && typeof message === "object" ? message : {};
  const meta = base.meta && typeof base.meta === "object" ? { ...base.meta } : {};
  delete meta.imageDataUrl;
  return {
    ...base,
    meta
  };
}

function suggestScrollDy(rawDy, observation) {
  const viewportHeight = Number(observation?.viewport?.height) || 0;
  const preferred = Math.max(320, Math.round((viewportHeight || 900) * 0.82));
  const parsed = Number(rawDy);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return preferred;
  }

  const sign = parsed >= 0 ? 1 : -1;
  const magnitude = Math.abs(parsed);
  const minMagnitude = Math.round(preferred * 0.65);
  if (magnitude < minMagnitude) {
    return sign * preferred;
  }
  return sign * magnitude;
}

function clampNumber(input, min, max, fallback) {
  const number = Number(input);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function buildSessionId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `s-${stamp}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildMessageId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildApprovalId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `a-${crypto.randomUUID()}`;
  }
  return `a-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function hashString(value) {
  let hash = 5381;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function trySetPanelBehavior() {
  try {
    const maybePromise = chrome.sidePanel?.setPanelBehavior?.({
      openPanelOnActionClick: true
    });
    if (maybePromise && typeof maybePromise.then === "function") {
      maybePromise.catch(() => {
        // no-op
      });
    }
  } catch {
    // no-op
  }
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

function tabsQuery(queryInfo) {
  return new Promise((resolve) => {
    chrome.tabs.query(queryInfo, (tabs) => {
      resolve(tabs || []);
    });
  });
}

function tabsGet(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.get(tabId, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(tab || null);
    });
  });
}

function tabsUpdate(tabId, updateProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.update(tabId, updateProperties, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(tab || null);
    });
  });
}

function tabsCreate(createProperties) {
  return new Promise((resolve, reject) => {
    chrome.tabs.create(createProperties, (tab) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(tab || null);
    });
  });
}

function executeScript(tabId, files) {
  return new Promise((resolve, reject) => {
    chrome.scripting.executeScript({ target: { tabId }, files }, (result) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(result || []);
    });
  });
}

function tabsSendMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(response);
    });
  });
}

function captureVisibleTab(windowId, options) {
  return new Promise((resolve, reject) => {
    chrome.tabs.captureVisibleTab(windowId, options, (dataUrl) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      resolve(dataUrl);
    });
  });
}

