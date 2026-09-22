// ── Support live chat (direct messages with staff) ────────────────────────────

let chatLastId = 0;
let chatPollTimer = null;
let chatStream = null;
let chatSending = false;
let chatPollMs = 1500;

function setLiveChatActive(active) {
  document.body.classList.toggle('support-live-chat-active', !!active);
}

function chatLogoUrl() {
  return document.querySelector('.support-chat-wrap')?.dataset.logo || '/images/logo-icon.png';
}

function chatEsc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function chatFormatTime(iso) {
  if (typeof formatShopDateTime === 'function') return formatShopDateTime(iso);
  return iso || '';
}

function chatStaffAvatarHtml() {
  return `<div class="support-chat-avatar"><img src="${chatEsc(chatLogoUrl())}" alt="" class="support-chat-logo"></div>`;
}

function renderChatBubble(msg, animate) {
  const isUser = msg.sender === 'user';
  const enter = animate ? ' chat-bubble-enter' : '';
  return `
    <div class="support-chat-bubble-row ${isUser ? 'is-user' : 'is-staff'}${enter}" data-msg-id="${msg.id}">
      ${!isUser ? chatStaffAvatarHtml() : ''}
      <div class="support-chat-bubble">
        <div class="support-chat-bubble-text">${chatEsc(msg.message)}</div>
        <div class="support-chat-bubble-time">${chatEsc(chatFormatTime(msg.created_at))}</div>
      </div>
    </div>
  `;
}

function typingDotsHtml() {
  return '<span class="chat-typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>';
}

function renderPendingBubble(side) {
  const isUser = side === 'user';
  return `
    <div class="support-chat-bubble-row ${isUser ? 'is-user' : 'is-staff'} is-pending chat-bubble-enter" data-pending="1">
      ${!isUser ? chatStaffAvatarHtml() : ''}
      <div class="support-chat-bubble">
        <div class="support-chat-bubble-text">${typingDotsHtml()}</div>
      </div>
    </div>
  `;
}

function bindBubbleEnter(row) {
  if (!row) return;
  row.addEventListener('animationend', () => row.classList.remove('chat-bubble-enter'), { once: true });
}

function mountChatHtml(container, html) {
  container.insertAdjacentHTML('beforeend', html);
  const row = container.lastElementChild;
  bindBubbleEnter(row);
  scrollChatToBottom();
  return row;
}

function minTypingDelay(startedAt, ms = 500) {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms - (Date.now() - startedAt)));
  });
}

function scrollChatToBottom() {
  const el = document.getElementById('supportChatMessages');
  if (el) el.scrollTop = el.scrollHeight;
}

function appendChatMessages(messages) {
  const container = document.getElementById('supportChatMessages');
  if (!container || !messages.length) return;

  const fresh = messages.filter((m) => m.id > chatLastId);
  if (!fresh.length) return;

  const empty = container.querySelector('.support-chat-empty');
  if (empty) empty.remove();
  container.querySelector('.loading')?.remove();

  container.querySelector('.loading')?.remove();

  fresh.forEach((m) => {
    mountChatHtml(container, renderChatBubble(m, true));
    if (m.id > chatLastId) chatLastId = m.id;
  });
}

async function loadChatMessages(initial) {
  const container = document.getElementById('supportChatMessages');
  if (!container) return;

  if (initial) {
    chatLastId = 0;
    container.innerHTML = '<div class="loading"></div>';
  }

  try {
    const params = chatLastId ? `?after=${chatLastId}` : '';
    const d = await apiFetch('/api/support/chat/messages' + params);
    const messages = d.messages || [];

    if (initial && !messages.length) {
      container.innerHTML = `
        <div class="support-chat-empty">
          <img src="${chatEsc(chatLogoUrl())}" alt="" class="support-chat-empty-logo">
          <p>No messages yet. Say hi, we're here to help!</p>
        </div>
      `;
      return;
    }

    if (initial) {
      container.innerHTML = messages.map(renderChatBubble).join('');
      messages.forEach((m) => { if (m.id > chatLastId) chatLastId = m.id; });
      scrollChatToBottom();
    } else {
      appendChatMessages(messages);
    }
  } catch (err) {
    if (/too many/i.test(err.message || '')) {
      chatPollMs = Math.min(chatPollMs * 2, 10000);
      startChatPolling();
    }
    if (initial) {
      container.innerHTML = `<p class="text-danger text-center py-3">${chatEsc(err.message)}</p>`;
    }
  }
}

function handleChatPush(data) {
  if (data?.type === 'message' && data.message?.sender === 'admin') {
    appendChatMessages([data.message]);
  }
}

function startChatStream() {
  stopChatStream();
  if (typeof EventSource === 'undefined') return;

  chatStream = new EventSource('/api/support/chat/stream');
  chatStream.onmessage = (e) => {
    try {
      handleChatPush(JSON.parse(e.data));
    } catch (_) {}
  };
  chatStream.onerror = () => {
    stopChatStream();
    startChatPolling();
  };
}

function stopChatStream() {
  if (chatStream) {
    chatStream.close();
    chatStream = null;
  }
}

async function sendChatMessage(e) {
  e.preventDefault();
  if (chatSending) return;

  const form = document.getElementById('supportChatForm');
  const input = document.getElementById('supportChatInput');
  const btn = document.getElementById('supportChatSendBtn');
  const message = input?.value.trim();
  if (!message) return;

  chatSending = true;
  if (btn) btn.disabled = true;
  form?.classList.add('is-sending');

  const container = document.getElementById('supportChatMessages');
  container?.querySelector('.support-chat-empty')?.remove();
  input.value = '';

  const startedAt = Date.now();
  const pending = container ? mountChatHtml(container, renderPendingBubble('user')) : null;

  try {
    const d = await apiFetch('/api/support/chat/send', {
      method: 'POST',
      body: { message },
    });
    await minTypingDelay(startedAt);
    if (pending) {
      pending.classList.add('chat-bubble-leave');
      await new Promise((r) => setTimeout(r, 180));
      pending.remove();
    }
    if (d.message) appendChatMessages([d.message]);
  } catch (err) {
    if (pending) {
      pending.classList.add('chat-bubble-leave');
      setTimeout(() => pending.remove(), 180);
    }
    showToast(err.message, 'error');
  } finally {
    chatSending = false;
    if (btn) btn.disabled = false;
    form?.classList.remove('is-sending');
    input?.focus();
  }
}

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(() => loadChatMessages(false), chatPollMs);
}

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

function initSupportChat() {
  const tab = document.getElementById('tabLiveChatLabel');
  const form = document.getElementById('supportChatForm');
  if (!tab || !form) return;

  form.addEventListener('submit', sendChatMessage);

  tab.addEventListener('shown.bs.tab', () => {
    chatPollMs = 1500;
    setLiveChatActive(true);
    loadChatMessages(true);
    startChatStream();
    startChatPolling();
  });

  tab.addEventListener('hidden.bs.tab', () => {
    setLiveChatActive(false);
    stopChatStream();
    stopChatPolling();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.body.classList.contains('support-live-chat-active')) return;
    if (document.visibilityState === 'visible') {
      loadChatMessages(false);
      if (!chatStream) startChatStream();
    }
  });

  document.getElementById('supportChatInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  if (window.location.hash === '#live-chat') {
    bootstrap.Tab.getOrCreateInstance(tab).show();
  }
}

initSupportChat();
