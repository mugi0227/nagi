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

  let els = {};
  let pendingQuestions = [];
  let pendingQuestionAnswers = {};

  function init() {
    els = {
      appRoot: document.getElementById('appRoot'),
      statusDot: document.getElementById('statusDot'),
      statusText: document.getElementById('statusText'),
      hintText: document.getElementById('hintText'),
      userLabel: document.getElementById('userLabel'),
      linkCode: document.getElementById('linkCode'),
      linkBtn: document.getElementById('linkBtn'),
      openLinkPage: document.getElementById('openLinkPage'),
      hotkeySelect: document.getElementById('hotkeySelect'),
      applyHotkey: document.getElementById('applyHotkey'),
      currentHotkey: document.getElementById('currentHotkey'),
      transcriptText: document.getElementById('transcriptText'),
      sendBtn: document.getElementById('sendBtn'),
      clearBtn: document.getElementById('clearBtn'),
      openWeb: document.getElementById('openWeb'),
      openTasks: document.getElementById('openTasks'),
      responseText: document.getElementById('responseText'),
      settingsBtn: document.getElementById('settingsBtn'),
      settingsCloseBtn: document.getElementById('settingsCloseBtn'),
      hideBtn: document.getElementById('hideBtn'),
      closeBtn: document.getElementById('closeBtn'),
      chatCard: document.getElementById('chatCard'),
      chatMessages: document.getElementById('chatMessages'),
      chatEmpty: document.getElementById('chatEmpty'),
      questionCard: document.getElementById('questionCard'),
      questionContext: document.getElementById('questionContext'),
      questionList: document.getElementById('questionList'),
      questionCancelBtn: document.getElementById('questionCancelBtn'),
      questionSendBtn: document.getElementById('questionSendBtn'),
    };

    bindEvents();
    autoResizeTranscript();
    clearPendingQuestionsUi();
  }

  function toggleSettings() {
    els.appRoot.classList.toggle('settings-open');
    els.settingsBtn.classList.toggle('active');
  }

  function closeSettings() {
    els.appRoot.classList.remove('settings-open');
    els.settingsBtn.classList.remove('active');
  }

  function bindEvents() {
    els.settingsBtn.addEventListener('click', toggleSettings);
    els.settingsCloseBtn.addEventListener('click', closeSettings);

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

    els.applyHotkey.addEventListener('click', async () => {
      await pywebview.api.apply_hotkey(els.hotkeySelect.value);
    });

    els.hotkeySelect.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') await pywebview.api.apply_hotkey(els.hotkeySelect.value);
    });

    els.transcriptText.addEventListener('input', () => {
      autoResizeTranscript();
    });

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

    els.hideBtn.addEventListener('click', async () => {
      await pywebview.api.hide_window();
    });

    els.closeBtn.addEventListener('click', async () => {
      await pywebview.api.close_app();
    });

    if (els.questionSendBtn) {
      els.questionSendBtn.addEventListener('click', async () => {
        const answer = formatPendingQuestionAnswers();
        if (!answer || !window.pywebview) return;
        await pywebview.api.submit_question_answers(answer);
      });
    }

    if (els.questionCancelBtn) {
      els.questionCancelBtn.addEventListener('click', async () => {
        if (!window.pywebview) return;
        await pywebview.api.cancel_question_prompt();
      });
    }

    // Resize grip
    (function () {
      var grip = document.getElementById('resizeGrip');
      if (!grip) return;
      var startX = 0, startY = 0;

      function onMouseMove(e) {
        var dx = e.screenX - startX;
        var dy = e.screenY - startY;
        startX = e.screenX;
        startY = e.screenY;
        if (window.pywebview) {
          pywebview.api.resize_main_window(dx, dy);
        }
      }

      function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }

      grip.addEventListener('mousedown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        startX = e.screenX;
        startY = e.screenY;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    })();
  }

  function autoResizeTranscript() {
    if (!els.transcriptText) return;
    const node = els.transcriptText;
    node.style.height = 'auto';
    const minHeight = 56;
    const maxHeight = 220;
    const next = Math.max(minHeight, Math.min(node.scrollHeight, maxHeight));
    node.style.height = `${next}px`;
    node.style.overflowY = node.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }

  function scrollChatToBottom() {
    if (!els.chatMessages) return;
    els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  }

  function createChatMessage(role, text) {
    const wrapper = document.createElement('div');
    wrapper.className = `chat-message ${role === 'user' ? 'user' : 'assistant'}`;

    const meta = document.createElement('span');
    meta.className = 'chat-meta';
    meta.textContent = role === 'user' ? 'You' : 'Secretary';

    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    if (role === 'assistant') {
      bubble.innerHTML = renderMarkdown(text);
    } else {
      bubble.textContent = text || '';
    }

    wrapper.appendChild(meta);
    wrapper.appendChild(bubble);
    return wrapper;
  }

  function initPendingQuestionState(questions) {
    pendingQuestionAnswers = {};
    questions.forEach((q) => {
      pendingQuestionAnswers[q.id] = { selectedOptions: [], freeText: '' };
    });
  }

  function setOptionSelection(questionId, option, allowMultiple) {
    const current = pendingQuestionAnswers[questionId];
    if (!current) return;
    if (allowMultiple) {
      if (current.selectedOptions.includes(option)) {
        current.selectedOptions = current.selectedOptions.filter((item) => item !== option);
      } else {
        current.selectedOptions = [...current.selectedOptions, option];
      }
    } else if (current.selectedOptions[0] === option) {
      current.selectedOptions = [];
    } else {
      current.selectedOptions = [option];
    }
    renderPendingQuestionCard();
  }

  function formatSingleQuestionAnswer(question, answerState) {
    const selected = answerState.selectedOptions || [];
    const freeText = (answerState.freeText || '').trim();
    if (selected.length > 0 && freeText) {
      return `${selected.join(', ')}, ${freeText}`;
    }
    if (selected.length > 0) {
      return selected.join(', ');
    }
    if (freeText) {
      return freeText;
    }
    return 'No answer';
  }

  function formatPendingQuestionAnswers() {
    if (!pendingQuestions.length) return '';
    const lines = pendingQuestions.map((question) => {
      const state = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
      const answer = formatSingleQuestionAnswer(question, state);
      return `${question.question}: ${answer}`;
    });
    return lines.join('\n');
  }

  function isQuestionAnswered(question, answerState) {
    const hasSelected = Array.isArray(answerState.selectedOptions) && answerState.selectedOptions.length > 0;
    const hasFreeText = !!(answerState.freeText || '').trim();
    if (!Array.isArray(question.options) || question.options.length === 0) {
      return hasFreeText;
    }
    return hasSelected || hasFreeText;
  }

  function updatePendingQuestionSubmitState() {
    if (!els.questionSendBtn) return;
    if (!pendingQuestions.length) {
      els.questionSendBtn.disabled = true;
      return;
    }
    const isValid = pendingQuestions.every((question) => {
      const answerState = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
      return isQuestionAnswered(question, answerState);
    });
    els.questionSendBtn.disabled = !isValid;
  }

  function renderPendingQuestionCard() {
    if (!els.questionList) return;
    els.questionList.innerHTML = '';

    pendingQuestions.forEach((question, index) => {
      const state = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
      const item = document.createElement('div');
      item.className = 'question-item';

      const label = document.createElement('div');
      label.className = 'question-label';
      label.textContent = `${index + 1}. ${question.question}`;
      item.appendChild(label);

      if (Array.isArray(question.options) && question.options.length > 0) {
        const optionsWrap = document.createElement('div');
        optionsWrap.className = 'question-options';
        question.options.forEach((option) => {
          const optionBtn = document.createElement('button');
          optionBtn.type = 'button';
          optionBtn.className = 'question-option-btn';
          if (state.selectedOptions.includes(option)) {
            optionBtn.classList.add('selected');
          }
          optionBtn.textContent = option;
          optionBtn.addEventListener('click', () => {
            setOptionSelection(question.id, option, !!question.allow_multiple);
          });
          optionsWrap.appendChild(optionBtn);
        });
        item.appendChild(optionsWrap);
      }

      const freeInput = document.createElement('input');
      freeInput.type = 'text';
      freeInput.className = 'question-free-input';
      freeInput.placeholder = question.placeholder || 'Add details if needed';
      freeInput.value = state.freeText || '';
      freeInput.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        const current = pendingQuestionAnswers[question.id] || { selectedOptions: [], freeText: '' };
        current.freeText = target.value;
        pendingQuestionAnswers[question.id] = current;
        updatePendingQuestionSubmitState();
      });
      item.appendChild(freeInput);

      els.questionList.appendChild(item);
    });

    updatePendingQuestionSubmitState();
  }

  function clearPendingQuestionsUi() {
    pendingQuestions = [];
    pendingQuestionAnswers = {};
    if (els.questionList) {
      els.questionList.innerHTML = '';
    }
    if (els.questionContext) {
      els.questionContext.textContent = '';
      els.questionContext.style.display = 'none';
    }
    if (els.questionCard) {
      els.questionCard.classList.remove('visible');
    }
    updatePendingQuestionSubmitState();
  }

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
    if (els.transcriptText) {
      els.transcriptText.value = text || '';
      autoResizeTranscript();
    }
  };

  window.getTranscriptText = function () {
    return els.transcriptText ? els.transcriptText.value : '';
  };

  window.updateResponse = function (text) {
    if (els.responseText) els.responseText.textContent = text || '';
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
    if (!els.transcriptText) return;
    els.transcriptText.focus();
    autoResizeTranscript();
  };

  window.showChatPanel = function () {
    if (els.appRoot) els.appRoot.classList.add('chat-mode');
    if (els.chatCard) els.chatCard.classList.add('visible');
  };

  window.showPendingQuestions = function (payload) {
    if (!payload || !Array.isArray(payload.questions) || payload.questions.length === 0) {
      clearPendingQuestionsUi();
      return;
    }

    pendingQuestions = payload.questions;
    initPendingQuestionState(pendingQuestions);
    if (els.questionContext) {
      const context = typeof payload.context === 'string' ? payload.context.trim() : '';
      els.questionContext.textContent = context;
      els.questionContext.style.display = context ? 'block' : 'none';
    }
    renderPendingQuestionCard();
    if (els.questionCard) {
      els.questionCard.classList.add('visible');
    }
  };

  window.clearPendingQuestions = function () {
    clearPendingQuestionsUi();
  };

  window.clearChatMessages = function () {
    if (els.chatMessages) els.chatMessages.innerHTML = '';
    if (els.chatEmpty) els.chatEmpty.style.display = 'block';
    if (els.chatCard) els.chatCard.classList.remove('visible');
    if (els.appRoot) els.appRoot.classList.remove('chat-mode');
    clearPendingQuestionsUi();
  };

  window.addChatMessage = function (role, text) {
    if (!els.chatMessages) return;
    window.showChatPanel();
    if (els.chatEmpty) els.chatEmpty.style.display = 'none';
    els.chatMessages.appendChild(createChatMessage(role, text));
    scrollChatToBottom();
  };

  window.addEventListener('pywebviewready', init);
  if (window.pywebview) init();
})();
