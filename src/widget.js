(function () {
  'use strict';

  const api = window.salati;
  const PRAYERS = [
    ['fajr', 'الفجر'],
    ['sunrise', 'الشروق'],
    ['dhuhr', 'الظهر'],
    ['asr', 'العصر'],
    ['maghrib', 'المغرب'],
    ['isha', 'العشاء']
  ];
  const COUNTDOWN_PREFIX = {
    fajr: 'متبقٍ للفجر',
    sunrise: 'متبقٍ للشروق',
    dhuhr: 'متبقٍ للظهر',
    asr: 'متبقٍ للعصر',
    maghrib: 'متبقٍ للمغرب',
    isha: 'متبقٍ للعشاء'
  };

  const el = {
    widget: document.getElementById('widget'),
    hijri: document.getElementById('wHijri'),
    greg: document.getElementById('wGreg'),
    city: document.getElementById('wCity'),
    remain: document.getElementById('wRemain'),
    remainLabel: document.querySelector('.w-remaining span'),
    list: document.getElementById('wList'),
    currentName: document.getElementById('wCurrentName'),
    currentTime: document.getElementById('wCurrentTime'),
    nextName: document.getElementById('wNextName'),
    nextTime: document.getElementById('wNextTime'),
    settings: document.getElementById('wSettings'),
    close: document.getElementById('wClose')
  };

  const state = {
    settings: null,
    today: null,
    theme: null,
    openedAt: 0
  };

  function latinDigits(text) {
    return String(text).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  }

  function resolveTheme(settings) {
    if (!settings) return 'dark';
    if (settings.theme === 'light') return 'light';
    if (settings.theme === 'dark') return 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  function applyTheme() {
    state.theme = resolveTheme(state.settings);
    document.documentElement.dataset.theme = state.theme;
  }

  function cityDateParts(date, timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
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

  function dateFromKey(dateKey) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
    if (match) {
      return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
    }
    const parts = cityDateParts(new Date(), state.today?.timezone || 'UTC');
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12));
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * 86_400_000);
  }

  function formatHijri(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function formatGregorian(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function formatTime(iso) {
    if (!iso) return '—';
    const settings = state.settings;
    const timeZone = state.today?.timezone || settings?.location?.timezone || 'UTC';
    const use12 = settings?.timeFormat === '12';
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', {
          timeZone,
          hour: '2-digit',
          minute: '2-digit',
          hour12: use12
        }).format(new Date(iso))
      );
    } catch {
      return '—';
    }
  }

  function renderDates() {
    if (!state.today) return;
    const base = dateFromKey(state.today.dateKey);
    const offset = Number(state.settings?.hijriOffset) || 0;
    el.hijri.textContent = formatHijri(addDays(base, offset));
    el.greg.textContent = formatGregorian(base);
  }

  function renderStatus() {
    if (!state.today) return;
    const next = state.today.next || {};
    const nextName = next.name || '—';
    el.currentName.textContent = next.prevName || '—';
    el.currentTime.textContent = formatTime(next.prevTimeISO);
    el.nextName.textContent = next.tomorrow
      ? nextName === 'الفجر'
        ? 'فجر الغد'
        : `${nextName} غدًا`
      : nextName;
    el.nextTime.textContent = formatTime(next.timeISO);
  }

  function renderTimes() {
    if (!state.today) return;
    const times = state.today.times || {};
    const nextKey = state.today.next?.key;
    const nextTomorrow = !!state.today.next?.tomorrow;
    const now = Date.now();

    el.city.textContent = state.settings?.location?.name || state.today.location?.name || '—';
    el.list.innerHTML = '';

    for (const [key, label] of PRAYERS) {
      const iso = times[key];
      const ms = iso ? Date.parse(iso) : NaN;
      const passed = Number.isFinite(ms) && ms <= now;
      const isNext = !nextTomorrow && key === nextKey;

      const row = document.createElement('div');
      row.className = `w-row${passed ? ' passed' : ''}${isNext ? ' next' : ''}`;
      row.dataset.key = key;

      const check = document.createElement('span');
      check.className = 'w-check';

      const name = document.createElement('span');
      name.className = 'w-name';
      name.textContent = label;

      const time = document.createElement('span');
      time.className = 'w-time';
      time.textContent = formatTime(iso);

      row.append(check, name, time);
      el.list.appendChild(row);
    }

    renderStatus();
    updateCountdown();
  }

  function updateCountdown() {
    if (!state.today?.next?.timeISO) {
      el.remain.textContent = '--:--:--';
      return;
    }

    const target = Date.parse(state.today.next.timeISO);
    if (!Number.isFinite(target)) {
      el.remain.textContent = '--:--:--';
      return;
    }

    const diff = Math.max(0, target - Date.now());
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    el.remain.textContent = [hours, minutes, seconds]
      .map((value) => String(value).padStart(2, '0'))
      .join(':');

    const key = state.today.next.key;
    el.remainLabel.textContent = COUNTDOWN_PREFIX[key] || 'متبقٍ';

    if (diff <= 0) refreshToday();
  }

  async function refreshToday() {
    try {
      const today = await api.getToday();
      if (!today) return;
      state.today = today;
      renderDates();
      renderTimes();
    } catch (error) {
      console.error('widget: failed to load prayer times', error);
    }
  }

  async function refreshAll() {
    try {
      const [settings, today] = await Promise.all([api.getSettings(), api.getToday()]);
      if (settings?.settings) state.settings = settings.settings;
      if (today) state.today = today;
      applyTheme();
      renderDates();
      renderTimes();
    } catch (error) {
      console.error('widget: failed to initialise', error);
    }
  }

  async function openApp(view) {
    const now = Date.now();
    if (now - state.openedAt < 700) return;
    state.openedAt = now;
    try {
      await api.openApp(view);
    } catch (error) {
      console.error('widget: failed to open app', error);
    }
  }

  async function dismissWidget() {
    try {
      await api.dismissWidget();
    } catch (error) {
      console.error('widget: failed to hide widget', error);
    }
  }

  function bindEvents() {
    el.widget.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      openApp('home');
    });

    el.widget.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openApp('home');
    });

    el.settings.addEventListener('click', (event) => {
      event.stopPropagation();
      openApp('settings');
    });

    el.close.addEventListener('click', (event) => {
      event.stopPropagation();
      dismissWidget();
    });

    api.onSettingsChanged((settings) => {
      if (!settings) return;
      state.settings = settings;
      applyTheme();
      renderDates();
      renderTimes();
      refreshToday();
    });

    api.onThemeChanged(() => {
      if (state.settings?.theme === 'auto') applyTheme();
    });

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings?.theme === 'auto') applyTheme();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        refreshToday();
        updateCountdown();
      }
    });
  }

  bindEvents();
  refreshAll();
  setInterval(updateCountdown, 1000);
  setInterval(refreshToday, 30_000);
})();
