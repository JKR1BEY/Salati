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

function use12Hour() {
  return String(state.settings?.timeFormat ?? '12') !== '24';
}

function formatTime(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ar-u-nu-latn', {
      timeZone: state.today?.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: use12Hour()
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function formatCountdown(iso) {
  if (!iso) return '00:00:00';
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return '00:00:00';
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

// Match the Windows taskbar itself (SystemUsesLightTheme), not the app theme,
// so the item blends in seamlessly on both dark and light taskbars.
function applyTheme() {
  const light = state.systemLight === null
    ? !window.matchMedia('(prefers-color-scheme: dark)').matches
    : state.systemLight;
  el.bar.classList.toggle('light', light);
}

async function refreshAppearance() {
  try {
    const appearance = await api.getTaskbarAppearance();
    if (appearance && typeof appearance.light === 'boolean') {
      state.systemLight = appearance.light;
      applyTheme();
    }
  } catch {
    /* keep the media-query fallback */
  }
}

function renderStatus() {
  if (!state.today) return;
  const next = state.today.next || {};
  el.currentName.textContent = next.prevName || '—';
  el.currentTime.textContent = formatTime(next.prevTimeISO);
  el.nextName.textContent = next.tomorrow
    ? (next.name === 'الفجر' ? 'فجر الغد' : `${next.name || ''} غدًا`)
    : (next.name || '—');

  const countdown = formatCountdown(next.timeISO);
  if (el.countdown.textContent !== countdown) {
    el.countdown.textContent = countdown;
  }
}

async function refreshAll() {
  try {
    const [settings, today] = await Promise.all([api.getSettings(), api.getToday()]);
    if (settings?.settings) state.settings = settings.settings;
    if (today) state.today = today;
    applyTheme();
    renderStatus();
  } catch (error) {
    console.error('taskbar: failed to initialise', error);
  }
}

async function refreshToday() {
  try {
    const today = await api.getToday();
    if (today) {
      state.today = today;
      renderStatus();
    }
  } catch (error) {
    console.error('taskbar: failed to refresh today', error);
  }
}

// As soon as the countdown hits zero, swap to the new current/next prayer
// immediately instead of waiting for the next slow refresh.
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
      scheduleTick();
    });
}

function tick() {
  if (!state.today) return;
  renderStatus();
  switchIfDue();
}

// Align every tick to the system clock second so the countdown flips in sync
// with the Windows clock instead of drifting with a plain 1s interval.
function scheduleTick() {
  clearTimeout(tickTimer);
  const wait = 1000 - (Date.now() % 1000) + 6;
  tickTimer = setTimeout(() => {
    tick();
    scheduleTick();
  }, wait);
}

function resync() {
  tick();
  scheduleTick();
}

function bindEvents() {
  // pointerdown reacts on press (no click-release delay) and without any
  // throttle, so the popup opens/closes instantly.
  el.bar.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    api.toggleTaskbarPopup().catch(() => {});
  });

  el.bar.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    api.toggleTaskbarPopup().catch(() => {});
  });

  api.onSettingsChanged((settings) => {
    if (!settings) return;
    state.settings = settings;
    applyTheme();
    renderStatus();
    refreshToday();
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
      refreshToday();
      refreshAppearance();
      resync();
    }
  });

  window.addEventListener('focus', resync);
}

async function init() {
  bindEvents();
  await Promise.all([refreshAll(), refreshAppearance()]);
  resync();
  setInterval(refreshToday, 30000);
}

init();
