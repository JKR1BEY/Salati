'use strict';

const api = window.salati;
const el = {
  corner: document.getElementById('corner'),
  currentName: document.getElementById('cCurrentName'),
  currentTime: document.getElementById('cCurrentTime'),
  nextName: document.getElementById('cNextName'),
  nextTime: document.getElementById('cNextTime')
};

const state = { settings: null, today: null, theme: null, openedAt: 0 };

function formatTime(iso) {
  if (!iso) return '—';
  try {
    const use12 = String(state.settings?.timeFormat) === '12';
    return new Intl.DateTimeFormat('ar', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: use12
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function applyTheme() {
  const theme = state.settings?.theme || 'dark';
  const resolved = theme === 'auto'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  el.corner.classList.toggle('light', resolved === 'light');
}

function renderStatus() {
  if (!state.today) return;
  const next = state.today.next || {};
  const nextName = next.name || '—';
  el.currentName.textContent = next.prevName || '—';
  el.currentTime.textContent = formatTime(next.prevTimeISO);
  el.nextName.textContent = next.tomorrow
    ? (nextName === 'الفجر' ? 'فجر الغد' : `${nextName} غدًا`)
    : nextName;
  el.nextTime.textContent = formatTime(next.timeISO);
}

async function refreshAll() {
  try {
    const [settings, today] = await Promise.all([api.getSettings(), api.getToday()]);
    if (settings?.settings) state.settings = settings.settings;
    if (today) state.today = today;
    applyTheme();
    renderStatus();
  } catch (error) {
    console.error('corner: failed to initialise', error);
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
    console.error('corner: failed to refresh today', error);
  }
}

function bindEvents() {
  el.corner.addEventListener('click', (event) => {
    const now = Date.now();
    if (now - state.openedAt < 700) return;
    state.openedAt = now;
    api.openApp('home').catch(() => {});
  });

  el.corner.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    api.openApp('home').catch(() => {});
  });

  api.onSettingsChanged((settings) => {
    if (!settings) return;
    state.settings = settings;
    applyTheme();
    renderStatus();
    refreshToday();
  });

  api.onThemeChanged(() => {
    if (state.settings?.theme === 'auto') applyTheme();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (state.settings?.theme === 'auto') applyTheme();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshToday();
  });
}

async function init() {
  bindEvents();
  await refreshAll();
  setInterval(refreshToday, 30000);
  setInterval(() => {
    if (state.today) renderStatus();
  }, 1000);
}

init();
