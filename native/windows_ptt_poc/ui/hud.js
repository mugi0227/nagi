/* ============================================================
   Secretary Partner – HUD Overlay JS
   Waveform, animations, state management
   Bridges to Python via pywebview.api
   ============================================================ */

(function () {
  'use strict';

  const container = document.getElementById('hudContainer');
  const waveformCanvas = document.getElementById('waveformCanvas');
  const previewText = document.getElementById('previewText');
  const previewHint = document.getElementById('previewHint');
  const sentResponsePreview = document.getElementById('sentResponsePreview');
  const idleTitle = document.getElementById('idleTitle');
  const idleHint = document.getElementById('idleHint');
  const idlePreview = document.getElementById('idlePreview');

  // ── Waveform state ────────────────────────────────────────

  const NUM_BARS = 20;
  const BAR_WIDTH = 4;
  const BAR_GAP = 3;
  const BAR_MIN_H = 3;
  const BAR_MAX_H = 38;

  let audioRms = 0;
  let waveformAnimId = null;
  let currentState = 'hidden';

  // ── Waveform drawing ──────────────────────────────────────

  function drawWaveform(timestamp) {
    if (currentState !== 'recording') return;

    const ctx = waveformCanvas.getContext('2d');
    const w = waveformCanvas.width;
    const h = waveformCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const centerY = h / 2;
    const totalWidth = NUM_BARS * BAR_WIDTH + (NUM_BARS - 1) * BAR_GAP;
    const startX = (w - totalWidth) / 2;
    const t = timestamp / 1000;

    for (let i = 0; i < NUM_BARS; i++) {
      const phase = (t * 7 + i * 0.45) % (Math.PI * 2);
      const waveFactor = (Math.sin(phase) + 1) / 2;
      const rmsVal = Math.max(0.08, audioRms);
      let barH = BAR_MIN_H + (BAR_MAX_H - BAR_MIN_H) * rmsVal * waveFactor;
      barH = Math.max(BAR_MIN_H, Math.min(BAR_MAX_H, barH));

      const x = startX + i * (BAR_WIDTH + BAR_GAP);
      const y = centerY - barH / 2;

      // Color intensity based on height
      const intensity = 0.4 + 0.6 * (barH / BAR_MAX_H);
      const r = Math.round(51 + (239 - 51) * intensity);
      const g = Math.round(65 + (68 - 65) * intensity);
      const b = Math.round(85 + (68 - 85) * intensity);

      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.beginPath();
      ctx.roundRect(x, y, BAR_WIDTH, barH, 2);
      ctx.fill();
    }

    waveformAnimId = requestAnimationFrame(drawWaveform);
  }

  function startWaveform() {
    stopWaveform();
    audioRms = 0;
    waveformAnimId = requestAnimationFrame(drawWaveform);
  }

  function stopWaveform() {
    if (waveformAnimId !== null) {
      cancelAnimationFrame(waveformAnimId);
      waveformAnimId = null;
    }
  }

  // ── State transitions ─────────────────────────────────────

  function setState(state, glowClass) {
    currentState = state;
    container.setAttribute('data-state', state);
    container.className = 'hud-container';
    if (glowClass) {
      container.classList.add(glowClass);
    }
  }

  // ── Preview keyboard handling ─────────────────────────────

  previewText.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = previewText.innerText.trim();
      if (window.pywebview) {
        await pywebview.api.hud_send(text);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (window.pywebview) {
        await pywebview.api.hud_cancel();
      }
    }
  });

  // ── HUD click → show main window ─────────────────────────

  container.addEventListener('click', async (e) => {
    // Don't trigger on preview text editing
    if (currentState === 'preview' && previewText.contains(e.target)) return;
    if (window.pywebview) {
      await pywebview.api.hud_clicked();
    }
  });

  // ── Public functions (called from Python via evaluate_js) ─

  window.showRecording = function () {
    setState('recording', 'glow-red');
    startWaveform();
  };

  window.showProcessing = function () {
    stopWaveform();
    setState('processing', 'glow-blue');
  };

  window.showPreview = function (text, hotkeyLabel) {
    stopWaveform();
    setState('preview', '');
    previewText.textContent = text || '';
    const hotkeyHint = hotkeyLabel ? `  / ${hotkeyLabel} で追加録音` : '';
    previewHint.textContent = `Enter で送信 / Esc でキャンセル${hotkeyHint}`;
    // Focus the editable area after a small delay for DOM update
    setTimeout(() => {
      previewText.focus();
      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      if (previewText.childNodes.length > 0) {
        range.selectNodeContents(previewText);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    }, 50);
  };

  window.showSent = function (responsePreview) {
    stopWaveform();
    setState('sent', 'glow-green');
    sentResponsePreview.textContent = responsePreview || '';
  };

  window.showIdle = function (status, hint, preview) {
    stopWaveform();
    setState('idle', '');
    idleTitle.textContent = status || '';
    idleHint.textContent = hint || '';
    if (preview) {
      idlePreview.style.display = 'block';
      idlePreview.textContent = preview;
    } else {
      idlePreview.style.display = 'none';
    }
  };

  window.updateAudioLevel = function (rms) {
    audioRms = Math.min(1.0, rms);
  };

  window.getPreviewText = function () {
    return previewText.innerText.trim();
  };

  window.setPreviewText = function (text) {
    previewText.textContent = text || '';
  };
})();
