'use strict';

const api = window.salati;

const PRAYERS = [
  { key: 'fajr', name: 'الفجر' },
  { key: 'sunrise', name: 'الشروق' },
  { key: 'dhuhr', name: 'الظهر' },
  { key: 'asr', name: 'العصر' },
  { key: 'maghrib', name: 'المغرب' },
  { key: 'isha', name: 'العشاء' }
];

const ICONS = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  active: '<span class="next-dot" aria-hidden="true"></span>'
};

const el = {
  card: document.getElementById('card'),
  method: document.getElementById('popMethod'),
  weekday: document.getElementById('popWeekday'),
  hijri: document.getElementById('popHijri'),
  location: document.getElementById('popLocation'),
  list: document.getElementById('prayerList'),
  viewAllBtn: document.getElementById('viewAllBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  refreshBtn: document.getElementById('refreshBtn')
};

const state = {
  settings: null,
  today: null,
  refreshing: false,
  open: false,
  lastStatus: ''
};

let tickTimer = null;
let lastRefreshAt = 0;
const timeCache = new Map();

function timeZone() {
  return state.settings?.location?.timezone || state.today?.timezone || 'UTC';
}

function use12Hour() {
  return String(state.settings?.timeFormat ?? '12') !== '24';
}

function formatTime(iso) {
  if (!iso) return '—';
  const twelve = use12Hour();
  const cacheKey = `${iso}|${twelve ? 12 : 24}|${timeZone()}`;
  const cached = timeCache.get(cacheKey);
  if (cached) return cached;
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone(),
      hour: twelve ? 'numeric' : '2-digit',
      minute: '2-digit',
      ...(twelve ? { hour12: true } : { hourCycle: 'h23' })
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === 'hour')?.value || '--';
    const minute = parts.find((part) => part.type === 'minute')?.value || '--';
    const text = `${hour}:${minute}`;
    if (timeCache.size > 48) timeCache.clear();
    timeCache.set(cacheKey, text);
    return text;
  } catch {
    return '—';
  }
}

function cityDateParts(date, timeZoneId) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  } catch {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
}

function weekdayLabel() {
  try {
    const weekday = new Intl.DateTimeFormat('ar-u-nu-latn', {
      weekday: 'long',
      timeZone: timeZone()
    }).format(new Date());
    const day = new Intl.DateTimeFormat('ar-u-nu-latn', {
      day: 'numeric',
      month: 'long',
      timeZone: timeZone()
    }).format(new Date());
    return `${weekday} · ${day}`;
  } catch {
    return '—';
  }
}

function hijriLabel() {
  try {
    const offset = Number(state.settings?.hijriOffset) || 0;
    const parts = cityDateParts(new Date(), timeZone());
    const noon = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
    const adjusted = new Date(noon.getTime() + offset * 86_400_000);
    return new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC'
    }).format(adjusted);
  } catch {
    return '—';
  }
}

function locationLabel() {
  const location = state.settings?.location || state.today?.location || {};
  const parts = [location.name, location.country].filter(Boolean);
  return parts.join('، ') || '—';
}

function resolveTheme(explicit) {
  const theme = explicit || state.settings?.theme || 'dark';
  if (theme === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return theme === 'light' || theme === 'gold' ? theme : 'dark';
}

function applyTheme(explicit) {
  const theme = resolveTheme(explicit);
  document.documentElement.dataset.theme = theme;
  el.card.classList.toggle('light', theme === 'light');
}

function renderPrayers() {
  if (!state.today) return;
  const next = state.today.next || {};
  const nextKey = next.key;
  const now = Date.now();

  const rows = PRAYERS.map((prayer) => {
    const iso = state.today.times?.[prayer.key] || null;
    const ms = iso ? Date.parse(iso) : NaN;
    const isNext = prayer.key === nextKey;
    const passed = !isNext && Number.isFinite(ms) && ms <= now;
    const status = isNext ? 'next' : passed ? 'passed' : 'upcoming';
    const icon = isNext ? ICONS.active : passed ? ICONS.check : ICONS.clock;
    const tomorrow = isNext && next.tomorrow
      ? '<em class="tomorrow">غدًا</em>'
      : '';
    const label = isNext
      ? 'الصلاة القادمة'
      : passed
        ? 'انتهى وقتها'
        : 'قادمة';

    return `
      <button class="row ${status}" type="button" data-prayer="${prayer.key}" aria-label="${prayer.name} ${label} — عرض جميع المواقيت" title="عرض جميع المواقيت">
        <span class="mark">${icon}</span>
        <span class="p-main"><b>${prayer.name}</b>${tomorrow}</span>
        <span class="time">${formatTime(iso)}</span>
      </button>`;
  }).join('');

  const signature = `${nextKey}|${next.tomorrow ? 1 : 0}|${rows}`;
  if (signature === state.lastStatus) return;
  state.lastStatus = signature;
  el.list.innerHTML = rows;
}

function renderDates() {
  el.weekday.textContent = weekdayLabel();
  el.hijri.textContent = hijriLabel();
  el.location.textContent = locationLabel();
  el.method.textContent = state.today?.methodLabel || 'مواقيت الصلاة';
  el.location.title = locationLabel();
}

function renderAll() {
  applyTheme();
  renderDates();
  renderPrayers();
}

async function refresh(force = false) {
  if (state.refreshing) return;
  if (!force && Date.now() - lastRefreshAt < 350) return;
  lastRefreshAt = Date.now();
  state.refreshing = true;
  try {
    const [settingsResponse, today] = await Promise.all([
      api.getSettings(),
      api.getToday()
    ]);
    if (settingsResponse?.settings) state.settings = settingsResponse.settings;
    if (today) state.today = today;
    // Keep the rendered rows in memory: renderPrayers only rebuilds the list
    // when the row signature actually changes, so opening stays instant.
    renderAll();
  } catch (error) {
    console.error('popup: failed to refresh', error);
  } finally {
    state.refreshing = false;
  }
}

function checkDue() {
  if (!state.today || state.refreshing) return;
  const ms = Date.parse(state.today.next?.timeISO) - Date.now();
  if (Number.isFinite(ms) && ms <= 0) refresh();
}

function startTicker() {
  stopTicker();
  const schedule = () => {
    const wait = 1000 - (Date.now() % 1000) + 6;
    tickTimer = setTimeout(() => {
      // Rows are already rendered while the window is warm. Only detect a
      // prayer rollover here; rebuilding the list every second was wasted work.
      if (!document.hidden && state.open) checkDue();
      schedule();
    }, wait);
  };
  schedule();
}

function stopTicker() {
  clearTimeout(tickTimer);
  tickTimer = null;
}

function showCard() {
  el.card.classList.add('open');
}

function openMain(view) {
  api.openApp(view).catch(() => {});
  api.hideTaskbarPopup();
}

// The window stays warm; main signals real open/close instead of relying on
// document visibility, so no timers run while the menu is closed.
function setOpen(open) {
  state.open = !!open;
  document.documentElement.classList.toggle('is-open', state.open);
  if (!state.open) {
    stopTicker();
    return;
  }
  // Everything is already rendered while the window is warm; opening must not
  // perform IPC or Intl work before the first visible frame.
  showCard();
  startTicker();
}

function flashRefresh() {
  el.refreshBtn.classList.add('spinning');
  const started = Date.now();
  refresh().finally(() => {
    const wait = Math.max(0, 620 - (Date.now() - started));
    setTimeout(() => el.refreshBtn.classList.remove('spinning'), wait);
  });
}

function bindEvents() {
  el.viewAllBtn.addEventListener('click', () => openMain('home'));

  el.settingsBtn.addEventListener('click', () => openMain('settings'));

  el.list.addEventListener('click', (event) => {
    const row = event.target.closest('.row');
    if (!row) return;
    openMain('home');
  });

  el.refreshBtn.addEventListener('click', flashRefresh);

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    api.hideTaskbarPopup();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopTicker();
      return;
    }
    if (state.open) {
      showCard();
      startTicker();
    }
  });

  window.addEventListener('focus', () => {
    if (!state.open) return;
    showCard();
    startTicker();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    applyTheme();
  });

  api.onPopupVisibility(setOpen);

  // Main pushes the day payload on prayer changes; no polling IPC needed.
  api.onDayChanged((payload) => {
    if (!payload) return;
    state.today = payload;
    state.lastStatus = '';
    renderAll();
  });

  api.onSettingsChanged((settings) => {
    if (!settings) return;
    state.settings = settings;
    state.lastStatus = '';
    timeCache.clear();
    applyTheme();
    renderAll();
  });

  // التبديل من الإعدادات يصل فورًا حتى لو كانت القائمة مفتوحة أو لم تُحدَّث بعد.
  api.onThemeChanged((theme) => applyTheme(theme));
}

async function init() {
  bindEvents();
  await refresh();
  showCard();
}

init();
