/* ============================================================
   nagi - HUD Overlay JS
   Waveform, animations, state management
   Bridges to Python via pywebview.api
   ============================================================ */

(function () {
  'use strict';

  if (typeof marked !== 'undefined') {
    marked.setOptions({ gfm: true, breaks: true });
  }

  function renderMarkdown(text) {
    if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
      return DOMPurify.sanitize(marked.parse(text || ''));
    }
    var div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  const container = document.getElementById('hudContainer');
  const waveformCanvas = document.getElementById('waveformCanvas');
  const previewText = document.getElementById('previewText');
  const previewHint = document.getElementById('previewHint');
  const sentResponsePreview = document.getElementById('sentResponsePreview');
  const idleTitle = document.getElementById('idleTitle');
  const idleHint = document.getElementById('idleHint');
  const idlePreview = document.getElementById('idlePreview');
  const hudChatMessages = document.getElementById('hudChatMessages');
  const hudQuestionsCard = document.getElementById('hudQuestionsCard');
  const hudQuestionsContext = document.getElementById('hudQuestionsContext');
  const hudQuestionsList = document.getElementById('hudQuestionsList');
  const hudQuestionCancelBtn = document.getElementById('hudQuestionCancelBtn');
  const hudQuestionSendBtn = document.getElementById('hudQuestionSendBtn');
  const hudChatInput = document.getElementById('hudChatInput');
  const hudChatSendBtn = document.getElementById('hudChatSendBtn');
  const hudChatExpand = document.getElementById('hudChatExpand');
  const hudChatMinimize = document.getElementById('hudChatMinimize');
  const hudChatClose = document.getElementById('hudChatClose');
  const chatInputRow = document.getElementById('chatInputRow');
  const chatRecordingArea = document.getElementById('chatRecordingArea');
  const chatProcessingArea = document.getElementById('chatProcessingArea');
  const chatWaveformCanvas = document.getElementById('chatWaveformCanvas');
  const resizeGrip = document.getElementById('resizeGrip');

  // Drag logic (header areas only)

  (function initDrag() {
    var noDragSelectors = [
      '.chat-hud-messages', '.chat-hud-questions', '.chat-hud-input-row',
      '.chat-hud-input-recording', '.chat-hud-input-processing',
      '.preview-text-area', '.idle-preview', '.response-preview',
      '.resize-grip',
      'input', 'button', 'textarea', 'select', '[contenteditable]', 'canvas'
    ];

    function isNoDrag(el) {
      for (var i = 0; i < noDragSelectors.length; i++) {
        if (el.closest(noDragSelectors[i])) return true;
      }
      return false;
    }

    var dragging = false;
    var startX = 0, startY = 0;

    function onMove(e) {
      if (!dragging) return;
      var dx = e.screenX - startX;
      var dy = e.screenY - startY;
      startX = e.screenX;
      startY = e.screenY;
      if (window.pywebview) {
        pywebview.api.hud_move(dx, dy);
      }
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }

    container.addEventListener('mousedown', function (e) {
      if (isNoDrag(e.target)) return;
      e.preventDefault();
      dragging = true;
      startX = e.screenX;
      startY = e.screenY;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  })();

  // Resize grip logic

  (function initResize() {
    let startX = 0;
    let startY = 0;

    function onMouseMove(e) {
      var dx = e.screenX - startX;
      var dy = e.screenY - startY;
      startX = e.screenX;
      startY = e.screenY;
      if (window.pywebview) {
        pywebview.api.hud_resize(dx, dy);
      }
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    resizeGrip.addEventListener('mousedown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      startX = e.screenX;
      startY = e.screenY;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });
  })();

  // Waveform state

  const NUM_BARS = 20;
  const BAR_WIDTH = 4;
  const BAR_GAP = 3;
  const BAR_MIN_H = 3;
  const BAR_MAX_H = 38;

  const rmsBuffer = new Float32Array(NUM_BARS);
  let audioRms = 0;
  let targetRms = 0;
  let waveformAnimId = null;
  let currentState = 'hidden';
  let isRecordingInChat = false;
  let activeCanvas = waveformCanvas;
  let pendingQuestions = [];
  let pendingQuestionAnswers = {};

  // Waveform drawing

  function drawWaveform() {
    if (currentState !== 'recording' && !isRecordingInChat) return;

    const ctx = activeCanvas.getContext('2d');
    const w = activeCanvas.width;
    const h = activeCanvas.height;
    ctx.clearRect(0, 0, w, h);

    const centerY = h / 2;
    const totalWidth = NUM_BARS * BAR_WIDTH + (NUM_BARS - 1) * BAR_GAP;
    const startX = (w - totalWidth) / 2;

    for (let i = 0; i < NUM_BARS; i++) {
      const rmsVal = rmsBuffer[i];
      let barH = BAR_MIN_H + (BAR_MAX_H - BAR_MIN_H) * rmsVal;
      barH = Math.max(BAR_MIN_H, Math.min(BAR_MAX_H, barH));

      const x = startX + i * (BAR_WIDTH + BAR_GAP);
      const y = centerY - barH / 2;

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
    targetRms = 0;
    rmsBuffer.fill(0);
    waveformAnimId = requestAnimationFrame(drawWaveform);
  }

  function stopWaveform() {
    if (waveformAnimId !== null) {
      cancelAnimationFrame(waveformAnimId);
      waveformAnimId = null;
    }
  }

  // State transitions

  function setState(state, glowClass) {
    currentState = state;
    container.setAttribute('data-state', state);
    container.className = 'hud-container';
    if (glowClass) {
      container.classList.add(glowClass);
    }
  }

  // Preview keyboard handling

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

  // HUD click -> show main window

  container.addEventListener('click', async (e) => {
    if (currentState === 'preview' && previewText.contains(e.target)) return;
    if (currentState === 'chat') return;
    if (window.pywebview) {
      await pywebview.api.hud_clicked();
    }
  });

  // Floating chat event listeners

  hudChatInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      var text = hudChatInput.value.trim();
      if (text && window.pywebview) {
        hudChatInput.value = '';
        await pywebview.api.hud_chat_send(text);
      }
    }
  });

  hudChatSendBtn.addEventListener('click', async () => {
    var text = hudChatInput.value.trim();
    if (text && window.pywebview) {
      hudChatInput.value = '';
      await pywebview.api.hud_chat_send(text);
    }
  });

  hudChatExpand.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.pywebview) {
      await pywebview.api.hud_chat_expand();
    }
  });

  hudChatMinimize.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.pywebview) {
      await pywebview.api.hud_chat_minimize();
    }
  });

  hudChatClose.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (window.pywebview) {
      await pywebview.api.hud_chat_close();
    }
  });

  hudQuestionSendBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const answer = formatPendingQuestionAnswers();
    if (!answer || !window.pywebview) return;
    await pywebview.api.hud_question_submit(answer);
  });

  hudQuestionCancelBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!window.pywebview) return;
    await pywebview.api.hud_question_cancel();
  });

  // Public functions (called from Python via evaluate_js)

  window.showRecording = function () {
    isRecordingInChat = false;
    activeCanvas = waveformCanvas;
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
    const hotkeyHint = hotkeyLabel ? `  / ${hotkeyLabel} to append recording` : '';
    previewHint.textContent = `Press Enter to send / Esc to cancel${hotkeyHint}`;
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

  // Floating chat public functions

  function createHudChatBubble(role, text) {
    var wrapper = document.createElement('div');
    wrapper.className = 'chat-hud-msg ' + (role === 'user' ? 'user' : 'assistant');
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text || '';
    }
    wrapper.appendChild(bubble);
    return wrapper;
  }

  function clearPendingQuestionsHudUi() {
    pendingQuestions = [];
    pendingQuestionAnswers = {};
    hudQuestionsList.innerHTML = '';
    hudQuestionsCard.classList.remove('visible');
    hudQuestionsContext.textContent = '';
    hudQuestionsContext.style.display = 'none';
    hudQuestionSendBtn.disabled = true;
    if (currentState === 'chat' && !chatRecordingArea.classList.contains('active')
      && !chatProcessingArea.classList.contains('active')) {
      chatInputRow.style.display = 'flex';
      hudChatInput.disabled = false;
      hudChatSendBtn.disabled = false;
    }
  }

  function initPendingQuestionState(questions) {
    pendingQuestionAnswers = {};
    questions.forEach(function (q) {
      pendingQuestionAnswers[q.id] = { selectedOptions: [], freeText: '' };
    });
  }

  function setQuestionOption(questionId, option, allowMultiple) {
    var current = pendingQuestionAnswers[questionId];
    if (!current) return;
    if (allowMultiple) {
      if (current.selectedOptions.includes(option)) {
        current.selectedOptions = current.selectedOptions.filter(function (item) { return item !== option; });
      } else {
        current.selectedOptions = current.selectedOptions.concat(option);
      }
    } else if (current.selectedOptions[0] === option) {
      current.selectedOptions = [];
    } else {
      current.selectedOptions = [option];
    }
    renderPendingQuestionsHud();
  }

  function isQuestionAnswered(question, answerState) {
    var selected = Array.isArray(answerState.selectedOptions) ? answerState.selectedOptions : [];
    var freeText = (answerState.freeText || '').trim();
    if (!Array.isArray(question.options) || question.options.length === 0) {
      return freeText.length > 0;
    }
    return selected.length > 0 || freeText.length > 0;
  }

  function formatQuestionAnswer(question, answerState) {
    var selected = Array.isArray(answerState.selectedOptions) ? answerState.selectedOptions : [];
    var freeText = (answerState.freeText || '').trim();
    if (selected.length > 0 && freeText) {
      return selected.join(', ') + ', ' + freeText;
    }
    if (selected.length > 0) return selected.join(', ');
    if (freeText) return freeText;
    return 'No answer';
  }

  function formatPendingQuestionAnswers() {
    if (!pendingQuestions.length) return '';
    var lines = pendingQuestions.map(function (question) {
      var state = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
      return question.question + ': ' + formatQuestionAnswer(question, state);
    });
    return lines.join('\n');
  }

  function updatePendingQuestionSendState() {
    if (!pendingQuestions.length) {
      hudQuestionSendBtn.disabled = true;
      return;
    }
    var isValid = pendingQuestions.every(function (question) {
      var state = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
      return isQuestionAnswered(question, state);
    });
    hudQuestionSendBtn.disabled = !isValid;
  }

  function renderPendingQuestionsHud() {
    hudQuestionsList.innerHTML = '';
    pendingQuestions.forEach(function (question, index) {
      var state = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
      var item = document.createElement('div');
      item.className = 'chat-hud-question-item';

      var label = document.createElement('div');
      label.className = 'chat-hud-question-label';
      label.textContent = (index + 1) + '. ' + question.question;
      item.appendChild(label);

      if (Array.isArray(question.options) && question.options.length > 0) {
        var optionsWrap = document.createElement('div');
        optionsWrap.className = 'chat-hud-question-options';
        question.options.forEach(function (option) {
          var optionBtn = document.createElement('button');
          optionBtn.type = 'button';
          optionBtn.className = 'chat-hud-question-option';
          if (state.selectedOptions.includes(option)) {
            optionBtn.classList.add('selected');
          }
          optionBtn.textContent = option;
          optionBtn.addEventListener('click', function (event) {
            event.stopPropagation();
            setQuestionOption(question.id, option, !!question.allow_multiple);
          });
          optionsWrap.appendChild(optionBtn);
        });
        item.appendChild(optionsWrap);
      }

      var freeInput = document.createElement('input');
      freeInput.type = 'text';
      freeInput.className = 'chat-hud-question-input';
      freeInput.placeholder = question.placeholder || 'Add details if needed';
      freeInput.value = state.freeText || '';
      freeInput.addEventListener('click', function (event) { event.stopPropagation(); });
      freeInput.addEventListener('input', function (event) {
        var target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        var current = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
        current.freeText = target.value;
        pendingQuestionAnswers[question.id] = current;
        updatePendingQuestionSendState();
      });
      item.appendChild(freeInput);

      hudQuestionsList.appendChild(item);
    });
    updatePendingQuestionSendState();
  }

  window.showChat = function (messages) {
    isRecordingInChat = false;
    stopWaveform();
    setState('chat', '');
    clearPendingQuestionsHudUi();
    chatRecordingArea.classList.remove('active');
    chatProcessingArea.classList.remove('active');
    chatInputRow.style.display = 'flex';
    hudChatMessages.innerHTML = '';
    if (Array.isArray(messages)) {
      messages.forEach(function (msg) {
        hudChatMessages.appendChild(createHudChatBubble(msg.role, msg.text));
      });
    }
    hudChatMessages.scrollTop = hudChatMessages.scrollHeight;
    hudChatInput.disabled = false;
    hudChatSendBtn.disabled = false;
    hudChatInput.value = '';
    setTimeout(function () { hudChatInput.focus(); }, 50);
  };

  window.addChatMessageHud = function (role, text) {
    if (currentState !== 'chat') return;
    hudChatMessages.appendChild(createHudChatBubble(role, text));
    hudChatMessages.scrollTop = hudChatMessages.scrollHeight;
  };

  window.showChatSending = function () {
    if (currentState !== 'chat') return;
    var old = document.getElementById('chatTypingIndicator');
    if (old) old.remove();
    var indicator = document.createElement('div');
    indicator.className = 'chat-hud-msg assistant';
    indicator.id = 'chatTypingIndicator';
    var bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = 'Thinking...';
    bubble.style.fontStyle = 'italic';
    bubble.style.color = 'var(--text-muted)';
    indicator.appendChild(bubble);
    hudChatMessages.appendChild(indicator);
    hudChatMessages.scrollTop = hudChatMessages.scrollHeight;
    hudChatInput.disabled = true;
    hudChatSendBtn.disabled = true;
  };

  window.showChatRecording = function () {
    if (currentState !== 'chat') return;
    isRecordingInChat = true;
    activeCanvas = chatWaveformCanvas;
    chatInputRow.style.display = 'none';
    chatProcessingArea.classList.remove('active');
    chatRecordingArea.classList.add('active');
    hudChatInput.disabled = true;
    hudChatSendBtn.disabled = true;
    startWaveform();
  };

  window.showChatProcessing = function () {
    if (currentState !== 'chat') return;
    isRecordingInChat = false;
    stopWaveform();
    chatRecordingArea.classList.remove('active');
    chatProcessingArea.classList.add('active');
  };

  window.showChatInputReady = function (text) {
    if (currentState !== 'chat') return;
    isRecordingInChat = false;
    stopWaveform();
    chatRecordingArea.classList.remove('active');
    chatProcessingArea.classList.remove('active');
    var hasPendingQuestions = pendingQuestions.length > 0;
    chatInputRow.style.display = hasPendingQuestions ? 'none' : 'flex';
    hudChatInput.disabled = hasPendingQuestions;
    hudChatSendBtn.disabled = hasPendingQuestions;
    if (!hasPendingQuestions && text) {
      hudChatInput.value = text;
    }
    if (!hasPendingQuestions) {
      setTimeout(function () { hudChatInput.focus(); }, 50);
    }
  };

  window.showPendingQuestionsHud = function (payload) {
    if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
      clearPendingQuestionsHudUi();
      return;
    }

    pendingQuestions = payload.questions;
    initPendingQuestionState(pendingQuestions);
    var context = typeof payload.context === 'string' ? payload.context.trim() : '';
    hudQuestionsContext.textContent = context;
    hudQuestionsContext.style.display = context ? 'block' : 'none';
    renderPendingQuestionsHud();
    hudQuestionsCard.classList.add('visible');
    chatInputRow.style.display = 'none';
    hudChatInput.disabled = true;
    hudChatSendBtn.disabled = true;
  };

  window.clearPendingQuestionsHud = function () {
    clearPendingQuestionsHudUi();
  };

  window.getChatInputText = function () {
    return hudChatInput.value.trim();
  };

  window.updateAudioLevel = function (rms) {
    targetRms = Math.min(1.0, rms);
    audioRms += (targetRms - audioRms) * 0.35;
    for (let i = 0; i < NUM_BARS - 1; i++) {
      rmsBuffer[i] = rmsBuffer[i + 1] * 0.97;
    }
    rmsBuffer[NUM_BARS - 1] = audioRms;
  };

  window.getPreviewText = function () {
    return previewText.innerText.trim();
  };

  window.setPreviewText = function (text) {
    previewText.textContent = text || '';
  };

  clearPendingQuestionsHudUi();
})();
