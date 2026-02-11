/* ============================================================
   Secretary Partner – Main Window JS
   Bridges HTML UI ↔ Python via pywebview.api
   ============================================================ */

(function () {
  'use strict';

  // DOM refs (populated on init)
  let els = {};

  function init() {
    els = {
      statusDot:    document.getElementById('statusDot'),
      statusText:   document.getElementById('statusText'),
      hintText:     document.getElementById('hintText'),
      userLabel:    document.getElementById('userLabel'),
      linkCode:     document.getElementById('linkCode'),
      linkBtn:      document.getElementById('linkBtn'),
      openLinkPage: document.getElementById('openLinkPage'),
      hotkeySelect: document.getElementById('hotkeySelect'),
      applyHotkey:  document.getElementById('applyHotkey'),
      currentHotkey:document.getElementById('currentHotkey'),
      transcriptText: document.getElementById('transcriptText'),
      sendBtn:      document.getElementById('sendBtn'),
      clearBtn:     document.getElementById('clearBtn'),
      openWeb:      document.getElementById('openWeb'),
      openTasks:    document.getElementById('openTasks'),
      responseText: document.getElementById('responseText'),
      hideBtn:      document.getElementById('hideBtn'),
      closeBtn:     document.getElementById('closeBtn'),
    };

    bindEvents();
  }

  function bindEvents() {
    // Auth
    els.linkBtn.addEventListener('click', async () => {
      const code = els.linkCode.value.trim();
      if (!code) return;
      await pywebview.api.start_link_flow(code);
    });
    els.linkCode.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        const code = els.linkCode.value.trim();
        if (code) await pywebview.api.start_link_flow(code);
      }
    });
    els.openLinkPage.addEventListener('click', async () => {
      await pywebview.api.open_link_page();
    });

    // Hotkey
    els.applyHotkey.addEventListener('click', async () => {
      await pywebview.api.apply_hotkey(els.hotkeySelect.value);
    });
    els.hotkeySelect.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') await pywebview.api.apply_hotkey(els.hotkeySelect.value);
    });

    // Transcript
    els.transcriptText.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        await pywebview.api.send_message();
      }
    });
    els.sendBtn.addEventListener('click', async () => {
      await pywebview.api.send_message();
    });
    els.clearBtn.addEventListener('click', async () => {
      await pywebview.api.clear_transcript();
    });
    els.openWeb.addEventListener('click', async () => {
      await pywebview.api.open_web_app();
    });
    els.openTasks.addEventListener('click', async () => {
      await pywebview.api.open_tasks();
    });

    // Window controls
    els.hideBtn.addEventListener('click', async () => {
      await pywebview.api.hide_window();
    });
    els.closeBtn.addEventListener('click', async () => {
      await pywebview.api.close_app();
    });
  }

  // ── Functions called from Python via evaluate_js ─────────

  window.updateStatus = function (text, hint) {
    if (els.statusText) els.statusText.textContent = text;
    if (els.hintText) els.hintText.textContent = hint || '';
  };

  window.updateStatusDot = function (state) {
    if (!els.statusDot) return;
    els.statusDot.className = 'status-dot';
    if (state && state !== 'idle') {
      els.statusDot.classList.add(state);
    }
  };

  window.updateAuthLabel = function (label) {
    if (els.userLabel) els.userLabel.textContent = label;
  };

  window.updateTranscript = function (text) {
    if (els.transcriptText) els.transcriptText.value = text;
  };

  window.getTranscriptText = function () {
    return els.transcriptText ? els.transcriptText.value : '';
  };

  window.updateResponse = function (text) {
    if (els.responseText) els.responseText.textContent = text;
  };

  window.updateHotkeyDisplay = function (key, currentLabel) {
    if (els.hotkeySelect) els.hotkeySelect.value = key;
    if (els.currentHotkey) els.currentHotkey.textContent = currentLabel;
  };

  window.setSendEnabled = function (enabled) {
    if (els.sendBtn) els.sendBtn.disabled = !enabled;
  };

  window.clearLinkCode = function () {
    if (els.linkCode) els.linkCode.value = '';
  };

  window.focusTranscript = function () {
    if (els.transcriptText) els.transcriptText.focus();
  };

  // ── Init on pywebview ready ─────────────────────────────

  window.addEventListener('pywebviewready', init);

  // Fallback: if pywebview event already fired
  if (window.pywebview) {
    init();
  }
})();
