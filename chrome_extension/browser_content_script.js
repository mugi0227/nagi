(() => {
  if (window.__LLM_BROWSER_AGENT_CS_INSTALLED__) {
    return;
  }
  window.__LLM_BROWSER_AGENT_CS_INSTALLED__ = true;

  const elementRegistry = new Map();
  const INDICATOR_ID = "llm-browser-agent-indicator";
  const INDICATOR_STYLE_ID = "llm-browser-agent-indicator-style";
  const CURSOR_ID = "llm-browser-agent-virtual-cursor";
  const CURSOR_STYLE_ID = "llm-browser-agent-virtual-cursor-style";
  const indicatorState = {
    runningActive: false,
    step: 0,
    recordingActive: false
  };
  const cursorState = {
    x: Math.max(0, Math.round(window.innerWidth * 0.5)),
    y: Math.max(0, Math.round(window.innerHeight * 0.5)),
    visible: false
  };
  const recordingState = {
    active: false,
    recordingId: "",
    startedAt: 0,
    lastScrollY: Math.round(window.scrollY),
    lastScrollAt: 0,
    navTimerId: null,
    lastUrl: location.href
  };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handleMessage(message)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error) => {
        sendResponse({ ok: false, message: error.message || "Unexpected error." });
      });
    return true;
  });

  async function handleMessage(message) {
    const type = message?.type;

    if (type === "agent.ping") {
      return { ok: true };
    }
    if (type === "agent.getPageState") {
      return getPageState();
    }
    if (type === "agent.performAction") {
      return performAction(message?.action);
    }
    if (type === "agent.setRunningIndicator") {
      setRunningIndicator(Boolean(message?.active), Number(message?.step) || 0);
      return { ok: true };
    }
    if (type === "agent.recording.start") {
      startInteractionRecording(String(message?.recordingId || ""));
      return { ok: true };
    }
    if (type === "agent.recording.stop") {
      stopInteractionRecording();
      return { ok: true };
    }

    return { ok: false, message: `Unsupported message type: ${String(type)}` };
  }

  function getPageState() {
    const elements = collectInteractiveElements(60);
    const textSnippet = collectTextSnippet(1600);
    const scrollY = Math.round(window.scrollY);
    const maxScrollY = Math.max(0, Math.round((document.documentElement?.scrollHeight || 0) - window.innerHeight));
    const domSignature = hashString(
      [
        location.href,
        document.title,
        textSnippet.slice(0, 500),
        elements.map((entry) => `${entry.id}|${entry.tag}|${entry.type}|${entry.label}`).join(";")
      ].join("||")
    );

    return {
      ok: true,
      url: location.href,
      title: document.title,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      scroll: {
        x: Math.round(window.scrollX),
        y: scrollY,
        maxY: maxScrollY,
        atTop: scrollY <= 4,
        atBottom: maxScrollY - scrollY <= 8
      },
      elements,
      textSnippet,
      domSignature,
      timestamp: new Date().toISOString()
    };
  }

  async function performAction(action) {
    if (!action || typeof action !== "object") {
      return { ok: false, message: "Action payload is invalid." };
    }

    const type = String(action.type || "").toLowerCase().trim();
    if (!type) {
      return { ok: false, message: "Action type is empty." };
    }

    if (type === "scroll") {
      const dy = normalizeScrollDelta(action.args?.dy);
      const dx = clampNumber(action.args?.dx, -4000, 4000, 0);
      window.scrollBy({ top: dy, left: dx, behavior: "smooth" });
      await sleep(240);
      return { ok: true, message: `Scrolled by dy=${dy}, dx=${dx}` };
    }

    if (type === "click_at") {
      const point = resolveClickPoint(action.args);
      if (!point) {
        return { ok: false, message: "click_at requires valid x/y coordinates." };
      }

      await moveVirtualCursorTo(point.x, point.y, action.args?.moveMs, action.args?.moveSteps);
      const target = document.elementFromPoint(point.x, point.y);
      if (!(target instanceof Element)) {
        return { ok: false, message: "No element was found at target coordinates." };
      }

      dispatchPointerMove(target, point.x, point.y);
      if (target instanceof HTMLElement) {
        target.focus?.({ preventScroll: true });
      }
      dispatchMouseDownUp(target, point.x, point.y);
      if (target instanceof HTMLElement) {
        target.click();
      } else {
        target.dispatchEvent(
          new MouseEvent("click", {
            bubbles: true,
            cancelable: true,
            clientX: point.x,
            clientY: point.y
          })
        );
      }

      window.setTimeout(() => hideVirtualCursor(), 700);
      const label = describeElementShort(target);
      return {
        ok: true,
        message: `Clicked at (${Math.round(point.x)}, ${Math.round(point.y)})${label ? ` on ${label}` : ""}`
      };
    }

    if (type === "attach_file") {
      const element = resolveTargetElement(action.target);
      if (!(element instanceof HTMLInputElement)) {
        return { ok: false, message: "File target element was not found." };
      }
      if (String(element.type || "").toLowerCase() !== "file") {
        return { ok: false, message: "Target element is not file input." };
      }

      const fileResult = await resolveFileFromActionAsset(action.args?.asset, action.args);
      if (!fileResult.ok) {
        return { ok: false, message: fileResult.message || "Failed to prepare file for upload." };
      }

      if (typeof DataTransfer === "undefined") {
        return { ok: false, message: "DataTransfer is unavailable in this page context." };
      }
      const transfer = new DataTransfer();
      transfer.items.add(fileResult.file);
      element.files = transfer.files;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        ok: true,
        message: `Attached file "${fileResult.file.name}" (${fileResult.file.type || "application/octet-stream"})`
      };
    }

    if (type === "keypress") {
      const key = typeof action.args?.key === "string" && action.args.key.trim() ? action.args.key : "Enter";
      const target = resolveTargetElement(action.target) || document.activeElement || document.body;
      fireKeyboardEvent(target, "keydown", key);
      fireKeyboardEvent(target, "keyup", key);
      if (key === "Enter" && target instanceof HTMLElement) {
        if (target.tagName === "FORM") {
          target.requestSubmit?.();
        }
        if (target instanceof HTMLInputElement && target.form) {
          target.form.requestSubmit?.();
        }
      }
      return { ok: true, message: `Sent keypress "${key}"` };
    }

    const element = resolveTargetElement(action.target);
    if (!element) {
      return { ok: false, message: "Target element was not found." };
    }

    scrollIntoViewCenter(element);
    await sleep(80);

    if (type === "click") {
      element.focus?.({ preventScroll: true });
      element.click();
      return { ok: true, message: "Clicked target element." };
    }

    if (type === "type") {
      const text = typeof action.args?.text === "string" ? action.args.text : "";
      if (!text) {
        return { ok: false, message: "Type action requires args.text." };
      }
      setElementText(element, text);
      if (action.args?.pressEnter) {
        fireKeyboardEvent(element, "keydown", "Enter");
        fireKeyboardEvent(element, "keyup", "Enter");
      }
      return { ok: true, message: "Typed into target element." };
    }

    return { ok: false, message: `Unsupported action type: ${type}` };
  }

  function collectInteractiveElements(limit) {
    const selector = [
      "a[href]",
      "button",
      "input",
      "textarea",
      "select",
      "[role='button']",
      "[role='link']",
      "[contenteditable='true']",
      "[tabindex]"
    ].join(",");

    const nodes = Array.from(document.querySelectorAll(selector));
    const filtered = nodes
      .filter((node) => node instanceof HTMLElement)
      .filter((node) => isElementVisible(node))
      .filter((node) => !node.hasAttribute("disabled"));

    filtered.sort((left, right) => {
      const a = left.getBoundingClientRect();
      const b = right.getBoundingClientRect();
      if (Math.abs(a.top - b.top) > 4) {
        return a.top - b.top;
      }
      return a.left - b.left;
    });

    elementRegistry.clear();
    const elements = [];

    for (let i = 0; i < filtered.length && elements.length < limit; i += 1) {
      const element = filtered[i];
      const id = `e_${elements.length + 1}`;
      const selectorPath = buildCssPath(element);
      elementRegistry.set(id, selectorPath);

      const rect = element.getBoundingClientRect();
      elements.push({
        id,
        selector: selectorPath,
        tag: element.tagName.toLowerCase(),
        type: getElementType(element),
        label: getElementLabel(element),
        text: collapseWhitespace((element.innerText || "").slice(0, 120)),
        placeholder: collapseWhitespace((element.getAttribute("placeholder") || "").slice(0, 80)),
        ariaLabel: collapseWhitespace((element.getAttribute("aria-label") || "").slice(0, 80)),
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      });
    }

    return elements;
  }

  function resolveTargetElement(target) {
    if (!target || typeof target !== "object") {
      return null;
    }

    if (typeof target.selector === "string" && target.selector.trim()) {
      try {
        const bySelector = document.querySelector(target.selector.trim());
        if (bySelector instanceof HTMLElement) {
          return bySelector;
        }
      } catch {
        // no-op
      }
    }

    if (typeof target.element_id === "string") {
      const selector = elementRegistry.get(target.element_id);
      if (selector) {
        try {
          const byId = document.querySelector(selector);
          if (byId instanceof HTMLElement) {
            return byId;
          }
        } catch {
          // no-op
        }
      }
    }

    return null;
  }

  function setElementText(element, text) {
    element.focus?.({ preventScroll: true });

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      element.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    if (element.isContentEditable) {
      element.textContent = text;
      element.dispatchEvent(new Event("input", { bubbles: true }));
      return;
    }

    throw new Error("Element is not editable.");
  }

  function getElementType(element) {
    if (element instanceof HTMLInputElement) {
      return element.type || "input";
    }
    if (element instanceof HTMLTextAreaElement) {
      return "textarea";
    }
    if (element instanceof HTMLSelectElement) {
      return "select";
    }
    if (element.isContentEditable) {
      return "contenteditable";
    }
    return "generic";
  }

  function getElementLabel(element) {
    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim()) {
      return collapseWhitespace(ariaLabel.trim()).slice(0, 120);
    }

    const labelledBy = element.getAttribute("aria-labelledby");
    if (labelledBy) {
      const labelNode = document.getElementById(labelledBy);
      if (labelNode?.textContent?.trim()) {
        return collapseWhitespace(labelNode.textContent.trim()).slice(0, 120);
      }
    }

    const placeholder = element.getAttribute("placeholder");
    if (placeholder && placeholder.trim()) {
      return collapseWhitespace(placeholder.trim()).slice(0, 120);
    }

    if (element instanceof HTMLInputElement && element.value?.trim()) {
      return collapseWhitespace(element.value.trim()).slice(0, 120);
    }

    const textContent = element.innerText || element.textContent || "";
    if (textContent.trim()) {
      return collapseWhitespace(textContent.trim()).slice(0, 120);
    }

    const fallback = element.getAttribute("name") || element.getAttribute("title") || "";
    return collapseWhitespace(fallback).slice(0, 120);
  }

  function collectTextSnippet(limit) {
    const text = document.body?.innerText || "";
    return collapseWhitespace(text).slice(0, limit);
  }

  function scrollIntoViewCenter(element) {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "auto" });
  }

  function isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.05) {
      return false;
    }

    return true;
  }

  function buildCssPath(element) {
    if (!(element instanceof HTMLElement)) {
      return "";
    }
    if (element.id) {
      return `#${escapeCssToken(element.id)}`;
    }

    const parts = [];
    let current = element;
    let depth = 0;
    while (current && current instanceof HTMLElement && depth < 6) {
      let part = current.tagName.toLowerCase();

      if (current.classList.length > 0) {
        const classes = Array.from(current.classList)
          .filter((name) => name && !name.includes(":"))
          .slice(0, 2)
          .map((name) => escapeCssToken(name));
        if (classes.length > 0) {
          part += `.${classes.join(".")}`;
        }
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (entry) => entry.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          part += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(part);
      if (current.id) {
        parts[0] = `#${escapeCssToken(current.id)}`;
        break;
      }
      current = current.parentElement;
      depth += 1;
    }

    return parts.join(" > ");
  }

  function fireKeyboardEvent(target, type, key) {
    const event = new KeyboardEvent(type, {
      key,
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(event);
  }

  function collapseWhitespace(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function escapeCssToken(value) {
    if (typeof CSS !== "undefined" && CSS.escape) {
      return CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }

  function clampNumber(input, min, max, fallback) {
    const value = Number(input);
    if (!Number.isFinite(value)) {
      return fallback;
    }
    return Math.max(min, Math.min(max, value));
  }

  function normalizeScrollDelta(rawDy) {
    const viewportHeight = Math.max(window.innerHeight || 0, 400);
    const preferred = Math.round(viewportHeight * 0.82);
    const parsed = Number(rawDy);
    if (!Number.isFinite(parsed) || parsed === 0) {
      return clampNumber(preferred, -4000, 4000, 900);
    }

    const sign = parsed >= 0 ? 1 : -1;
    const magnitude = Math.abs(parsed);
    const minMagnitude = Math.round(preferred * 0.65);
    const adjustedMagnitude = magnitude < minMagnitude ? preferred : magnitude;
    return clampNumber(sign * adjustedMagnitude, -4000, 4000, sign * preferred);
  }

  function resolveClickPoint(args) {
    if (!args || typeof args !== "object") {
      return null;
    }

    const xRaw = Number(args.x);
    const yRaw = Number(args.y);
    if (!Number.isFinite(xRaw) || !Number.isFinite(yRaw)) {
      return null;
    }

    const normalized = Boolean(args.normalized);
    const viewportWidth = Math.max(window.innerWidth || 0, 1);
    const viewportHeight = Math.max(window.innerHeight || 0, 1);
    const x = normalized ? xRaw * viewportWidth : xRaw;
    const y = normalized ? yRaw * viewportHeight : yRaw;

    return {
      x: clampNumber(Math.round(x), 0, viewportWidth - 1, Math.floor(viewportWidth / 2)),
      y: clampNumber(Math.round(y), 0, viewportHeight - 1, Math.floor(viewportHeight / 2))
    };
  }

  async function moveVirtualCursorTo(targetX, targetY, moveMs, moveSteps) {
    ensureVirtualCursorStyle();
    const cursor = ensureVirtualCursorElement();
    if (!cursor) {
      return;
    }

    const steps = clampNumber(moveSteps, 2, 40, 14);
    const durationMs = clampNumber(moveMs, 80, 3000, 420);
    const stepDelay = Math.max(8, Math.round(durationMs / steps));
    const startX = Number.isFinite(cursorState.x) ? cursorState.x : targetX;
    const startY = Number.isFinite(cursorState.y) ? cursorState.y : targetY;

    cursor.style.display = "block";
    cursorState.visible = true;
    updateVirtualCursorPosition(cursor, startX, startY);

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      const x = Math.round(startX + (targetX - startX) * t);
      const y = Math.round(startY + (targetY - startY) * t);
      updateVirtualCursorPosition(cursor, x, y);
      await sleep(stepDelay);
    }
  }

  function hideVirtualCursor() {
    const cursor = document.getElementById(CURSOR_ID);
    if (!cursor) {
      return;
    }
    cursor.style.display = "none";
    cursorState.visible = false;
  }

  function updateVirtualCursorPosition(cursor, x, y) {
    cursor.style.left = `${x}px`;
    cursor.style.top = `${y}px`;
    cursorState.x = x;
    cursorState.y = y;
  }

  function ensureVirtualCursorStyle() {
    if (document.getElementById(CURSOR_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = CURSOR_STYLE_ID;
    style.textContent = `
      #${CURSOR_ID} {
        position: fixed;
        width: 18px;
        height: 18px;
        margin-left: -9px;
        margin-top: -9px;
        border-radius: 999px;
        border: 2px solid #ffffff;
        background: rgba(14, 126, 247, 0.85);
        box-shadow: 0 0 0 2px rgba(14, 126, 247, 0.5), 0 0 12px rgba(14, 126, 247, 0.9);
        pointer-events: none;
        z-index: 2147483647;
      }
      #${CURSOR_ID}::after {
        content: "";
        position: absolute;
        inset: -7px;
        border-radius: 999px;
        border: 1px solid rgba(14, 126, 247, 0.5);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureVirtualCursorElement() {
    let cursor = document.getElementById(CURSOR_ID);
    if (cursor) {
      return cursor;
    }
    cursor = document.createElement("div");
    cursor.id = CURSOR_ID;
    cursor.setAttribute("aria-hidden", "true");
    cursor.style.display = "none";
    document.documentElement.appendChild(cursor);
    return cursor;
  }

  function dispatchPointerMove(target, x, y) {
    const eventInit = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    };
    if (typeof PointerEvent !== "undefined") {
      target.dispatchEvent(
        new PointerEvent("pointermove", {
          ...eventInit,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 0
        })
      );
    }
    target.dispatchEvent(new MouseEvent("mousemove", eventInit));
  }

  function dispatchMouseDownUp(target, x, y) {
    const base = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0
    };
    if (typeof PointerEvent !== "undefined") {
      target.dispatchEvent(
        new PointerEvent("pointerdown", {
          ...base,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 1
        })
      );
    }
    target.dispatchEvent(new MouseEvent("mousedown", { ...base, buttons: 1 }));

    if (typeof PointerEvent !== "undefined") {
      target.dispatchEvent(
        new PointerEvent("pointerup", {
          ...base,
          pointerType: "mouse",
          isPrimary: true,
          buttons: 0
        })
      );
    }
    target.dispatchEvent(new MouseEvent("mouseup", { ...base, buttons: 0 }));
  }

  function describeElementShort(element) {
    if (!(element instanceof Element)) {
      return "";
    }
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : "";
    const className =
      element instanceof HTMLElement && element.classList.length > 0
        ? `.${Array.from(element.classList).slice(0, 1).join(".")}`
        : "";
    return `${tag}${id}${className}`;
  }

  function setRunningIndicator(active, step) {
    indicatorState.runningActive = Boolean(active);
    indicatorState.step = Number(step) || 0;
    renderIndicator();
  }

  function renderIndicator() {
    ensureIndicatorStyle();
    const indicator = ensureIndicatorElement();
    if (!indicator) {
      return;
    }

    const visible = indicatorState.runningActive || indicatorState.recordingActive;
    if (!visible) {
      indicator.style.display = "none";
      indicator.dataset.mode = "idle";
      return;
    }

    const mode =
      indicatorState.recordingActive && indicatorState.runningActive
        ? "recording_running"
        : indicatorState.recordingActive
          ? "recording"
          : "running";

    const badge = indicator.querySelector("[data-role='badge']");
    if (badge) {
      if (mode === "recording") {
        badge.textContent = "RPA Recording in Progress";
      } else if (mode === "recording_running") {
        badge.textContent =
          indicatorState.step > 0
            ? `RPA Recording + AI Running - step ${indicatorState.step}`
            : "RPA Recording + AI Running";
      } else {
        badge.textContent =
          indicatorState.step > 0
            ? `AI Agent Running - step ${indicatorState.step}`
            : "AI Agent Running";
      }
    }

    indicator.dataset.mode = mode;
    indicator.style.display = "block";
  }

  function ensureIndicatorStyle() {
    if (document.getElementById(INDICATOR_STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = INDICATOR_STYLE_ID;
    style.textContent = `
      #${INDICATOR_ID} {
        position: fixed;
        inset: 0;
        pointer-events: none;
        z-index: 2147483647;
        border: 4px solid rgba(34, 199, 255, 0.9);
        box-shadow:
          inset 0 0 24px rgba(34, 199, 255, 0.65),
          0 0 18px rgba(34, 199, 255, 0.55);
        animation: llm-agent-running-pulse 1.1s ease-in-out infinite alternate;
      }
      #${INDICATOR_ID}[data-mode='recording'] {
        border: 4px solid rgba(255, 76, 76, 0.92);
        box-shadow:
          inset 0 0 24px rgba(255, 76, 76, 0.55),
          0 0 20px rgba(255, 76, 76, 0.48);
        animation: llm-agent-recording-pulse 0.9s ease-in-out infinite alternate;
      }
      #${INDICATOR_ID}[data-mode='recording_running'] {
        border: 4px solid rgba(255, 117, 53, 0.95);
        box-shadow:
          inset 0 0 26px rgba(255, 117, 53, 0.58),
          0 0 22px rgba(255, 117, 53, 0.5);
        animation: llm-agent-mixed-pulse 0.85s ease-in-out infinite alternate;
      }
      #${INDICATOR_ID} [data-role='badge'] {
        position: fixed;
        top: 10px;
        right: 12px;
        padding: 6px 10px;
        border-radius: 999px;
        color: #ffffff;
        background: rgba(0, 100, 138, 0.9);
        font: 600 12px/1.1 "Segoe UI", system-ui, sans-serif;
        letter-spacing: 0.02em;
        box-shadow: 0 0 10px rgba(34, 199, 255, 0.7);
      }
      #${INDICATOR_ID}[data-mode='recording'] [data-role='badge'] {
        background: rgba(168, 21, 21, 0.9);
        box-shadow: 0 0 10px rgba(255, 83, 83, 0.75);
      }
      #${INDICATOR_ID}[data-mode='recording_running'] [data-role='badge'] {
        background: rgba(180, 74, 16, 0.92);
        box-shadow: 0 0 10px rgba(255, 130, 70, 0.75);
      }
      @keyframes llm-agent-running-pulse {
        from {
          border-color: rgba(34, 199, 255, 0.7);
          box-shadow:
            inset 0 0 18px rgba(34, 199, 255, 0.5),
            0 0 12px rgba(34, 199, 255, 0.45);
        }
        to {
          border-color: rgba(255, 126, 54, 0.95);
          box-shadow:
            inset 0 0 26px rgba(255, 126, 54, 0.68),
            0 0 22px rgba(255, 126, 54, 0.62);
        }
      }
      @keyframes llm-agent-recording-pulse {
        from {
          border-color: rgba(255, 76, 76, 0.7);
          box-shadow:
            inset 0 0 18px rgba(255, 76, 76, 0.42),
            0 0 12px rgba(255, 76, 76, 0.35);
        }
        to {
          border-color: rgba(255, 31, 31, 0.98);
          box-shadow:
            inset 0 0 28px rgba(255, 31, 31, 0.58),
            0 0 24px rgba(255, 31, 31, 0.52);
        }
      }
      @keyframes llm-agent-mixed-pulse {
        from {
          border-color: rgba(255, 117, 53, 0.74);
          box-shadow:
            inset 0 0 20px rgba(255, 117, 53, 0.48),
            0 0 14px rgba(255, 117, 53, 0.42);
        }
        to {
          border-color: rgba(255, 160, 33, 0.98);
          box-shadow:
            inset 0 0 30px rgba(255, 160, 33, 0.62),
            0 0 24px rgba(255, 160, 33, 0.55);
        }
      }
    `;
    document.documentElement.appendChild(style);
  }

  function ensureIndicatorElement() {
    let indicator = document.getElementById(INDICATOR_ID);
    if (indicator) {
      return indicator;
    }

    indicator = document.createElement("div");
    indicator.id = INDICATOR_ID;
    indicator.setAttribute("aria-hidden", "true");
    indicator.style.display = "none";
    indicator.dataset.mode = "idle";

    const badge = document.createElement("div");
    badge.setAttribute("data-role", "badge");
    badge.textContent = "AI Agent Running";
    indicator.appendChild(badge);

    document.documentElement.appendChild(indicator);
    return indicator;
  }

  function startInteractionRecording(recordingId) {
    stopInteractionRecording();
    recordingState.active = true;
    recordingState.recordingId = recordingId || "";
    recordingState.startedAt = Date.now();
    recordingState.lastScrollY = Math.round(window.scrollY);
    recordingState.lastScrollAt = 0;
    recordingState.lastUrl = location.href;
    setupRecordingNavigationWatcher();
    emitRecordingEvent({
      type: "navigate",
      url: location.href
    });
    indicatorState.recordingActive = true;
    renderIndicator();
    window.addEventListener("click", onRecordingClick, true);
    window.addEventListener("input", onRecordingInput, true);
    window.addEventListener("change", onRecordingFileChange, true);
    window.addEventListener("keydown", onRecordingKeydown, true);
    window.addEventListener("scroll", onRecordingScroll, { capture: true, passive: true });
  }

  function stopInteractionRecording() {
    if (!recordingState.active) {
      indicatorState.recordingActive = false;
      renderIndicator();
      return;
    }
    window.removeEventListener("click", onRecordingClick, true);
    window.removeEventListener("input", onRecordingInput, true);
    window.removeEventListener("change", onRecordingFileChange, true);
    window.removeEventListener("keydown", onRecordingKeydown, true);
    window.removeEventListener("scroll", onRecordingScroll, true);

    if (recordingState.navTimerId) {
      clearInterval(recordingState.navTimerId);
      recordingState.navTimerId = null;
    }

    recordingState.active = false;
    recordingState.recordingId = "";
    recordingState.startedAt = 0;
    indicatorState.recordingActive = false;
    renderIndicator();
  }

  function setupRecordingNavigationWatcher() {
    if (recordingState.navTimerId) {
      clearInterval(recordingState.navTimerId);
      recordingState.navTimerId = null;
    }
    recordingState.navTimerId = setInterval(() => {
      if (!recordingState.active) {
        return;
      }
      const currentUrl = location.href;
      if (currentUrl === recordingState.lastUrl) {
        return;
      }
      recordingState.lastUrl = currentUrl;
      emitRecordingEvent({
        type: "navigate",
        url: currentUrl
      });
    }, 450);
  }

  function emitRecordingEvent(eventData) {
    if (!recordingState.active || !eventData || typeof eventData !== "object") {
      return;
    }
    const payload = {
      ...eventData,
      recordingId: recordingState.recordingId,
      at: Date.now(),
      url: location.href
    };
    try {
      chrome.runtime.sendMessage({ type: "rpa.record.event", payload }, () => {
        void chrome.runtime.lastError;
      });
    } catch {
      // no-op
    }
  }

  function onRecordingClick(event) {
    if (!recordingState.active) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    const selector = buildCssPath(target);
    if (!selector) {
      return;
    }
    emitRecordingEvent({
      type: "click",
      selector,
      text_hint: getElementLabel(target)
    });
  }

  function onRecordingInput(event) {
    if (!recordingState.active) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      ["password", "hidden", "file"].includes(String(target.type || "").toLowerCase())
    ) {
      return;
    }

    const selector = buildCssPath(target);
    if (!selector) {
      return;
    }

    let text = "";
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      text = target.value || "";
    } else if (target.isContentEditable) {
      text = target.textContent || "";
    } else {
      return;
    }

    emitRecordingEvent({
      type: "type",
      selector,
      text: String(text || "").slice(0, 240)
    });
  }

  function onRecordingFileChange(event) {
    if (!recordingState.active) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    if (String(target.type || "").toLowerCase() !== "file") {
      return;
    }
    const selector = buildCssPath(target);
    if (!selector) {
      return;
    }
    const fileCount = target.files ? target.files.length : 0;
    if (fileCount <= 0) {
      return;
    }
    emitRecordingEvent({
      type: "file_select",
      selector,
      text_hint: getElementLabel(target),
      accept: String(target.accept || "").slice(0, 200),
      multiple: Boolean(target.multiple),
      file_count: fileCount
    });
  }

  function onRecordingKeydown(event) {
    if (!recordingState.active) {
      return;
    }
    const key = String(event?.key || "").trim();
    if (!key) {
      return;
    }
    const allowed = new Set(["Enter", "Tab", "Escape", "ArrowDown", "ArrowUp"]);
    if (!allowed.has(key)) {
      return;
    }
    emitRecordingEvent({
      type: "keypress",
      key
    });
  }

  function onRecordingScroll() {
    if (!recordingState.active) {
      return;
    }
    const now = Date.now();
    if (now - recordingState.lastScrollAt < 280) {
      return;
    }
    const currentY = Math.round(window.scrollY);
    const dy = currentY - recordingState.lastScrollY;
    recordingState.lastScrollY = currentY;
    recordingState.lastScrollAt = now;
    if (Math.abs(dy) < 12) {
      return;
    }
    emitRecordingEvent({
      type: "scroll",
      dy
    });
  }

  async function resolveFileFromActionAsset(asset, fallbackArgs) {
    const source = asset && typeof asset === "object" ? asset : {};
    const dataUrl = String(source.dataUrl || source.data_url || "").trim();
    const fileUrl = String(source.fileUrl || source.file_url || "").trim();
    const fallbackMime = String(
      source.mimeType ||
        source.mime_type ||
        fallbackArgs?.mime_type ||
        "application/octet-stream"
    ).trim();
    const fallbackName = String(
      source.fileName ||
        source.file_name ||
        fallbackArgs?.file_name ||
        `${String(fallbackArgs?.asset_slot || "input_file").trim() || "input_file"}.bin`
    ).trim();

    if (dataUrl.startsWith("data:")) {
      const parsed = dataUrlToBytes(dataUrl);
      if (!parsed.ok) {
        return parsed;
      }
      const file = new File([parsed.bytes], fallbackName, {
        type: parsed.mimeType || fallbackMime || "application/octet-stream"
      });
      return { ok: true, file };
    }

    if (fileUrl) {
      try {
        const response = await fetch(fileUrl, {
          method: "GET",
          credentials: "include"
        });
        if (!response.ok) {
          return { ok: false, message: `Failed to fetch file asset (${response.status}).` };
        }
        const buffer = await response.arrayBuffer();
        const contentType =
          String(response.headers.get("content-type") || "").trim() ||
          fallbackMime ||
          "application/octet-stream";
        const file = new File([buffer], fallbackName, { type: contentType });
        return { ok: true, file };
      } catch (error) {
        return { ok: false, message: `Failed to fetch file asset: ${error.message}` };
      }
    }

    return { ok: false, message: "No file asset was provided." };
  }

  function dataUrlToBytes(dataUrl) {
    const match = String(dataUrl || "").match(/^data:([^;,]+)?;base64,(.+)$/);
    if (!match) {
      return { ok: false, message: "Invalid data URL for file asset." };
    }
    const mimeType = String(match[1] || "").trim().toLowerCase();
    const encoded = String(match[2] || "").trim();
    if (!encoded) {
      return { ok: false, message: "File asset data is empty." };
    }
    try {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return { ok: true, mimeType, bytes };
    } catch (error) {
      return { ok: false, message: `Failed to decode file asset: ${error.message}` };
    }
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
})();
