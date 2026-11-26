'use strict';

const api = window.salati;
const el = {
  bar: document.getElementById('bar'),
  currentName: document.getElementById('tbCurrentName'),
  currentTime: document.getElementById('tbCurrentTime'),
  nextName: document.getElementById('tbNextName'),
  countdown: document.getElementById('tbCountdown')
};

const state = {
  settings: null,
  today: null,
  systemLight: null,
  refreshing: false,
  lastSwitchAt: 0
};

let tickTimer = null;
let lastCountdownSecond = -1;
let currentTimeCache = { key: '', text: '—' };

function setText(node, value) {
  if (node.textContent !== value) node.textContent = value;
}

function use12Hour() {
  return String(state.settings?.timeFormat ?? '12') !== '24';
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: state.today?.timezone,
      hour: use12Hour() ? 'numeric' : '2-digit',
      minute: '2-digit',
      ...(use12Hour() ? { hour12: true } : { hourCycle: 'h23' })
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === 'hour')?.value || '--';
    const minute = parts.find((part) => part.type === 'minute')?.value || '--';
    return `${hour}:${minute}`;
  } catch {
    return '—';
  }
}

function countdownText(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

// Always derive the remaining time from the real target timestamp so the
// display cannot drift or freeze when the transparent window repaints.
function nextRemaining() {
  const iso = state.today?.next?.timeISO;
  if (!iso) return NaN;
  const ms = Date.parse(iso) - Date.now();
  return Number.isFinite(ms) ? ms : NaN;
}

// Match the Windows taskbar itself (SystemUsesLightTheme), not the app theme,
// so the item blends in seamlessly on both dark and light taskbars.
function applyTheme() {
  const light = state.systemLight === null
    ? !window.matchMedia('(prefers-color-scheme: dark)').matches
    : state.systemLight;
  el.bar.classList.toggle('light', light);
}

function refreshAppearance() {
  api.getTaskbarAppearance()
    .then((appearance) => {
      if (appearance && typeof appearance.light === 'boolean') {
        state.systemLight = appearance.light;
        applyTheme();
      }
    })
    .catch(() => {
      /* keep the media-query fallback */
    });
}

function renderStatus() {
  if (!state.today) return;
  const next = state.today.next || {};
  const currentName = next.prevName || '—';
  const nextName = next.tomorrow
    ? (next.name === 'الفجر' ? 'فجر الغد' : `${next.name || ''} غدًا`)
    : (next.name || '—');
  // The previous-prayer time only changes with the payload; format it once
  // per change instead of rebuilding an Intl formatter on every frame.
  const timeKey = `${next.prevTimeISO || ''}|${use12Hour() ? 12 : 24}|${state.today.timezone || ''}`;
  if (timeKey !== currentTimeCache.key) {
    currentTimeCache = { key: timeKey, text: formatTime(next.prevTimeISO) };
  }

  setText(el.currentName, currentName);
  setText(el.currentTime, currentTimeCache.text);
  setText(el.nextName, nextName);
  const remaining = nextRemaining();
  lastCountdownSecond = Number.isFinite(remaining) ? Math.ceil(remaining / 1000) : -1;
  setText(el.countdown, Number.isFinite(remaining) ? countdownText(remaining) : '00:00:00');
}

function refreshAll() {
  return Promise.all([api.getSettings(), api.getToday()])
    .then(([settings, today]) => {
      if (settings?.settings) state.settings = settings.settings;
      if (today) state.today = today;
      applyTheme();
      renderStatus();
    })
    .catch((error) => {
      console.error('taskbar: failed to initialise', error);
    });
}

function refreshToday() {
  return api.getToday()
    .then((today) => {
      if (today) {
        state.today = today;
        renderStatus();
      }
    })
    .catch((error) => {
      console.error('taskbar: failed to refresh today', error);
    });
}

// As soon as the countdown hits zero, swap to the new current/next prayer
// immediately instead of waiting for a slow periodic refresh.
function switchIfDue() {
  const iso = state.today?.next?.timeISO;
  if (!iso || state.refreshing) return;
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms > 0) return;
  if (Date.now() - state.lastSwitchAt < 900) return;

  state.lastSwitchAt = Date.now();
  state.refreshing = true;
  refreshToday()
    .catch(() => {})
    .finally(() => {
      state.refreshing = false;
      renderStatus();
      resync();
    });
}

// One cheap timestamp subtraction per displayed second: no 60 fps render loop,
// no IPC, no Intl formatting and no re-render while the second is unchanged.
function tick() {
  if (!state.today) return;
  const remaining = nextRemaining();
  if (Number.isFinite(remaining) && remaining <= 0) {
    switchIfDue();
    return;
  }
  if (!Number.isFinite(remaining)) return;
  const second = Math.ceil(remaining / 1000);
  if (second === lastCountdownSecond) return;
  lastCountdownSecond = second;
  setText(el.countdown, countdownText(remaining));
}

// Aligned to the wall clock so the countdown never drifts, with exactly one
// timer callback per second instead of a continuous animation-frame loop.
function resync() {
  clearTimeout(tickTimer);
  tick();
  const wait = 1000 - (Date.now() % 1000) + 4;
  tickTimer = setTimeout(resync, wait);
}

function bindEvents() {
  // pointerdown reacts on press (no click-release delay) and without any
  // throttle, so the popup opens/closes instantly.
  el.bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    api.toggleTaskbarPopup();
  });

  el.bar.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    api.toggleTaskbarPopup();
  });

  api.onSettingsChanged((settings) => {
    if (!settings) return;
    state.settings = settings;
    applyTheme();
    renderStatus();
    resync();
  });

  // Main pushes the day payload whenever the next prayer changes, so the
  // widget never needs a periodic times:today IPC poll.
  api.onDayChanged((payload) => {
    if (!payload) return;
    state.today = payload;
    renderStatus();
    resync();
  });

  api.onThemeChanged(() => {
    applyTheme();
  });

  api.onTaskbarAppearance((appearance) => {
    if (!appearance || typeof appearance.light !== 'boolean') return;
    state.systemLight = appearance.light;
    applyTheme();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshAppearance();
      resync();
    }
  });

  window.addEventListener('focus', resync);
}

function init() {
  bindEvents();
  refreshAll().then(refreshAppearance).then(resync);
}

init();
