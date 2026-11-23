(() => {
  'use strict';

  const api = window.salati;
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const RING_CIRCUMFERENCE = 2 * Math.PI * 104;

  const PRAYERS = [
    { key: 'fajr', name: 'الفجر' },
    { key: 'sunrise', name: 'الشروق' },
    { key: 'dhuhr', name: 'الظهر' },
    { key: 'asr', name: 'العصر' },
    { key: 'maghrib', name: 'المغرب' },
    { key: 'isha', name: 'العشاء' }
  ];
  const PRAYER_NAMES = Object.fromEntries(PRAYERS.map((p) => [p.key, p.name]));

  const SOUND_FILES = {
    makkah: '../assets/sounds/makkah.mp3',
    madinah: '../assets/sounds/madinah.mp3',
    abdulbasit: '../assets/sounds/abdulbasit.mp3'
  };
  const SOUND_LABELS = {
    makkah: 'أذان مكة',
    madinah: 'أذان المدينة',
    abdulbasit: 'أذان عبد الباسط عبد الصمد'
  };

  const state = {
    settings: null,
    meta: null,
    today: null,
    view: 'home',
    month: { year: null, month: null, data: null, seq: 0, loading: false },
    theme: 'dark',
    refreshing: false,
    lastAutoRefresh: 0,
    searchSeq: 0,
    searchTimer: null,
    searchResults: [],
    locationExpanded: false,
    toastTimer: null,
    bannerTimer: null,
    chime: null,
    audio: null,
    audioCtx: null,
    impulse: null,
    updaterStatus: null
  };

  /* ---------------- أدوات مساعدة ---------------- */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function latinDigits(value) {
    return String(value).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  }

  function arabicDigits(value) {
    return String(value).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
  }

  function normalizeArabic(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ى/g, 'ي')
      .replace(/ة/g, 'ه')
      .replace(/[ًٌٍَُِّْـ]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
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

  function timeZone() {
    return state.settings?.location?.timezone || 'UTC';
  }

  function dateAtUtcNoon(parts) {
    return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0));
  }

  function addDays(date, days) {
    return new Date(date.getTime() + days * 86_400_000);
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

  function formatHijriDay(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura-nu-latn', {
          day: 'numeric',
          timeZone: 'UTC'
        }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function formatMonthYear(year, month) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC'
        }).format(new Date(Date.UTC(year, month - 1, 15, 12)))
      );
    } catch {
      return `${month}/${year}`;
    }
  }

  function weekdayName(date) {
    try {
      return latinDigits(
        new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', timeZone: 'UTC' }).format(date)
      );
    } catch {
      return '—';
    }
  }

  function timeParts(iso) {
    if (!iso) return { text: '—', period: '' };
    const use12 = state.settings?.timeFormat !== '24';
    try {
      const options = use12
        ? { timeZone: timeZone(), hour: 'numeric', minute: '2-digit', hour12: true }
        : { timeZone: timeZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
      const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(new Date(iso));
      const hour = parts.find((part) => part.type === 'hour')?.value || '--';
      const minute = parts.find((part) => part.type === 'minute')?.value || '--';
      return { text: `${hour}:${minute}`, period: '' };
    } catch {
      return { text: '—', period: '' };
    }
  }

  function displayTime(iso) {
    return timeParts(iso).text;
  }

  function time24(iso) {
    if (!iso) return '—';
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timeZone(),
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      }).formatToParts(new Date(iso));
      const hour = parts.find((part) => part.type === 'hour')?.value || '--';
      const minute = parts.find((part) => part.type === 'minute')?.value || '--';
      return `${hour}:${minute}`;
    } catch {
      return '—';
    }
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function humanRemaining(ms) {
    const totalMinutes = Math.max(0, Math.ceil(ms / 60_000));
    if (totalMinutes <= 0) return 'أقل من دقيقة';
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const hourText =
      hours === 0
        ? ''
        : hours === 1
          ? 'ساعة'
          : hours === 2
            ? 'ساعتان'
            : hours <= 10
              ? `${hours} ساعات`
              : `${hours} ساعة`;
    const minuteText =
      minutes === 0
        ? ''
        : minutes === 1
          ? 'دقيقة'
          : minutes === 2
            ? 'دقيقتان'
            : minutes <= 10
              ? `${minutes} دقائق`
              : `${minutes} دقيقة`;
    return [hourText, minuteText].filter(Boolean).join(' و ') || 'أقل من دقيقة';
  }

  function basename(filePath) {
    if (!filePath) return '';
    return String(filePath).split(/[\\/]/).pop() || '';
  }

  function fileUrl(filePath) {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (/^[a-zA-Z]:\//.test(normalized)) {
      return `file:///${normalized
        .split('/')
        .map((segment, index) => (index === 0 ? segment : encodeURIComponent(segment)))
        .join('/')}`;
    }
    return `file://${encodeURI(normalized)}`;
  }

  function soundAssetUrl(sound) {
    const packaged = state.meta?.soundUrls?.[sound];
    if (packaged) return packaged;
    const relative = SOUND_FILES[sound];
    if (!relative) return null;
    try {
      return new URL(relative, window.location.href).href;
    } catch {
      return relative;
    }
  }

  function soundLabel(sound) {
    if (sound === 'custom') return basename(state.settings?.customSoundPath) || 'ملف خاص';
    return SOUND_LABELS[sound] || 'صوت الأذان';
  }

  function extractError(error) {
    const message = String(error?.message || error || 'حدث خطأ غير متوقع');
    const parts = message.split('Error:');
    return (parts[parts.length - 1] || message).trim();
  }

  function sameCoords(a, b) {
    return (
      a &&
      b &&
      Math.abs(a.lat - b.lat) < 0.02 &&
      Math.abs(a.lng - b.lng) < 0.02
    );
  }

  function showToast(message) {
    const toast = $('toast');
    $('toastText').textContent = message;
    clearTimeout(state.toastTimer);
    if (toast.hidden) {
      toast.hidden = false;
      requestAnimationFrame(() => toast.classList.add('show'));
    } else {
      toast.classList.add('show');
    }
    state.toastTimer = setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        toast.hidden = true;
      }, 260);
    }, 3200);
  }

  function hideSplash() {
    const splash = $('splash');
    splash.classList.add('hide');
  }

  /* ---------------- المظهر ---------------- */

  function applyTheme() {
    if (!state.settings) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const resolved =
      state.settings.theme === 'auto'
        ? media.matches
          ? 'dark'
          : 'light'
        : state.settings.theme === 'light'
          ? 'light'
          : 'dark';
    state.theme = resolved;
    document.documentElement.dataset.theme = resolved;
    const themeUse = $('themeIcon').querySelector('use');
    if (themeUse) themeUse.setAttribute('href', resolved === 'dark' ? '#i-moon' : '#i-sun');
    $('themeLabel').textContent = resolved === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح';
  }

  /* ---------------- التاريخ ---------------- */

  function renderDates() {
    if (!state.settings) return;
    const parts = cityDateParts(new Date(), timeZone());
    const base = dateAtUtcNoon(parts);
    const offset = Number(state.settings.hijriOffset) || 0;
    const gregorian = formatGregorian(base);
    const hijri = formatHijri(addDays(base, offset));

    $('topHijri').textContent = hijri;
    $('topGreg').textContent = gregorian;
    $('heroHijri').textContent = hijri.replace(/\s*هـ\s*$/, '');
  }

  /* ---------------- بطاقات الصلوات ---------------- */

  function renderPrayerGrid() {
    if (!state.today) return;
    const grid = $('prayerGrid');
    const now = Date.now();
    const nextKey = state.today.next?.key;
    const prevKey = state.today.next?.prevKey;
    const prevIso = state.today.next?.prevTimeISO;
    const prevIsToday =
      !!prevIso &&
      dateKey(cityDateParts(new Date(prevIso), timeZone())) === state.today.dateKey;

    grid.innerHTML = PRAYERS.map((prayer) => {
      const iso = state.today.times[prayer.key];
      const ms = iso ? Date.parse(iso) : NaN;
      const isNext = prayer.key === nextKey;
      const isCurrent = !isNext && prayer.key === prevKey && prevIsToday;
      const isPassed = !isNext && !isCurrent && Number.isFinite(ms) && ms <= now;
      const classes = ['prayer-card'];
      if (isNext) classes.push('next');
      if (isCurrent) classes.push('current');
      if (isPassed) classes.push('passed');

      let status = '';
      if (prayer.key !== 'sunrise') {
        if (isNext) status = 'القادمة';
        else if (isCurrent) status = 'الآن';
        else if (isPassed) status = 'انتهت';
      }

      return `
        <article class="${classes.join(' ')}" data-prayer="${prayer.key}">
          <span class="p-name">${prayer.name}</span>
          <span class="p-time">${displayTime(iso)}</span>
          <span class="p-status">${status}</span>
        </article>`;
    }).join('');
  }

  function dateKey(parts) {
    return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
  }

  function renderNotificationStatus() {
    if (!state.settings) return;
    const enabled = !!state.settings.notifications;
    $('muteBtn').classList.toggle('muted', !enabled);
    $('muteIcon').querySelector('use').setAttribute('href', enabled ? '#i-bell' : '#i-bell-off');
    $('muteBtn').title = enabled ? 'كتم التنبيهات' : 'تفعيل التنبيهات';
  }

  function renderToday() {
    if (!state.today) return;
    const data = state.today;
    const next = data.next;
    const parts = timeParts(next.timeISO);

    $('nextName').textContent = next.name;
    $('nextTime').textContent = parts.text;
    $('ringPrayer').textContent = next.name;
    $('heroCity').textContent = data.location.name;
    $('ringArc').style.strokeDasharray = String(RING_CIRCUMFERENCE);
    renderPrayerGrid();
    renderDates();
    renderNotificationStatus();
    updateCountdown(true);
  }

  function updateCountdown(force = false) {
    if (!state.today?.next?.timeISO) return;
    const nextMs = Date.parse(state.today.next.timeISO);
    const prevMs = state.today.next.prevTimeISO ? Date.parse(state.today.next.prevTimeISO) : NaN;
    const now = Date.now();
    const remaining = nextMs - now;

    $('countdown').textContent = formatCountdown(Math.max(0, remaining));
    $('remainingText').textContent = humanRemaining(Math.max(0, remaining));

    if (Number.isFinite(prevMs) && nextMs > prevMs) {
      const fraction = clamp((now - prevMs) / (nextMs - prevMs), 0, 1);
      $('ringArc').style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - fraction));
    }

    if (remaining <= 0 && !state.refreshing && now - state.lastAutoRefresh > 8000) {
      state.lastAutoRefresh = now;
      refreshToday();
    }
  }

  /* ---------------- الإعدادات والواجهة ---------------- */

  function hasSavedLocation() {
    const location = state.settings?.location;
    return !!(
      location &&
      location.name &&
      Number.isFinite(Number(location.lat)) &&
      Number.isFinite(Number(location.lng))
    );
  }

  function isLocationCollapsed() {
    return hasSavedLocation() && !state.locationExpanded;
  }

  function applyLocationCollapse() {
    const card = $('locationCard');
    if (!card) return;
    const collapsed = isLocationCollapsed();
    card.classList.toggle('collapsed', collapsed);
    card.setAttribute('aria-expanded', String(!collapsed));
  }

  function syncSettingsUI() {
    if (!state.settings) return;
    const s = state.settings;
    const location = s.location;

    applyLocationCollapse();
    $('notifToggle').checked = !!s.notifications;
    $('themeSelect').value = s.theme;
    $('timeFormat').value = String(s.timeFormat);
    $('trayToggle').checked = !!s.closeToTray;
    $('taskbarToggle').checked = s.taskbarWidgetEnabled !== false;
    $('autoStartToggle').checked = !!s.autoLaunch;
    $('volumeRange').value = String(Math.round((s.volume ?? 0.85) * 100));
    $('volumeValue').textContent = `${Math.round((s.volume ?? 0.85) * 100)}%`;

    $('setCity').textContent = location.name;
    $('setCountry').textContent = [location.country, location.source === 'ip' ? 'تحديد تلقائي' : null]
      .filter(Boolean)
      .join(' • ');
    $('setCoords').textContent = `${Number(location.lat).toFixed(4)}, ${Number(location.lng).toFixed(4)} • ${location.timezone}`;

    $('topCity').textContent = location.name;
    $('topCountry').textContent = location.country || location.timezone;

    if ($('soundSelect')) $('soundSelect').value = s.sound;
    $('customSoundRow').hidden = s.sound !== 'custom';
    $('customSoundName').textContent = s.customSoundPath
      ? basename(s.customSoundPath)
      : 'لم يتم اختيار ملف';
  }

  async function refreshToday() {
    if (!state.settings) return;
    try {
      state.today = await api.getToday();
      renderToday();
      syncSettingsUI();
    } catch (error) {
      console.error(error);
    }
  }

  async function refreshView() {
    const button = $('refreshBtn');
    if (!button || button.disabled) return;
    const previousRefreshing = state.refreshing;
    const startedAt = Date.now();
    button.disabled = true;
    button.classList.add('spinning');
    state.refreshing = true;
    try {
      await api.resetZoom();
      state.today = await api.getToday();
      renderToday();
      syncSettingsUI();
      const month = currentMonth();
      await loadMonth(month.year, month.month, { scroll: 'today', silent: true });
      const elapsed = Date.now() - startedAt;
      if (elapsed < 450) {
        await new Promise((resolve) => setTimeout(resolve, 450 - elapsed));
      }
      showToast('تم تحديث العرض والمواقيت.');
    } catch (error) {
      console.error(error);
      showToast('تعذّر تحديث العرض والمواقيت.');
    } finally {
      state.refreshing = previousRefreshing;
      button.classList.remove('spinning');
      button.disabled = false;
    }
  }

  async function saveSettings(patch, options = {}) {
    if (!state.settings) return;
    const previous = state.settings;
    try {
      const response = await api.saveSettings(patch);
      const next = response.settings;
      const timesChanged =
        previous.location.lat !== next.location.lat ||
        previous.location.lng !== next.location.lng ||
        previous.location.timezone !== next.location.timezone ||
        previous.method !== next.method ||
        previous.madhab !== next.madhab ||
        previous.highLatitude !== next.highLatitude;

      state.settings = next;
      applyTheme();
      syncSettingsUI();

      if (timesChanged) {
        await refreshToday();
        if (state.month.data) {
          await loadMonth(state.month.year, state.month.month, { silent: true });
        }
      } else {
        renderPrayerGrid();
        renderDates();
        renderNotificationStatus();
        if (state.month.data) renderMonth();
      }

      if (options.toast) showToast(options.toast);
    } catch (error) {
      console.error(error);
      showToast('تعذّر حفظ الإعدادات. حاول مرة أخرى.');
    }
  }

  function applyExternalSettings(next) {
    if (!state.settings) {
      state.settings = next;
      applyTheme();
      syncSettingsUI();
      return;
    }
    if (JSON.stringify(next) === JSON.stringify(state.settings)) return;
    state.settings = next;
    applyTheme();
    syncSettingsUI();
    refreshToday();
    if (state.month.data) loadMonth(state.month.year, state.month.month, { silent: true });
  }

  /* ---------------- الشهر ---------------- */

  function initMonthState() {
    const parts = cityDateParts(new Date(), timeZone());
    state.month.year = parts.year;
    state.month.month = parts.month;
  }

  async function loadMonth(year, month, options = {}) {
    if (!state.settings) return;
    const seq = ++state.month.seq;
    state.month.loading = true;
    state.month.year = year;
    state.month.month = month;
    $('monthSub').textContent = 'جارٍ حساب مواقيت الشهر…';

    try {
      const data = await api.getMonth(year, month);
      if (seq !== state.month.seq) return;
      state.month.data = data;
      state.month.year = data.year;
      state.month.month = data.month;
      renderMonth();
      if (options.scroll) setMonthScroll(options.scroll);
    } catch (error) {
      if (seq === state.month.seq) {
        $('monthSub').textContent = 'تعذّر تحميل المواقيت';
        if (!options.silent) showToast('تعذّر تحميل جدول الشهر.');
      }
    } finally {
      if (seq === state.month.seq) state.month.loading = false;
    }
  }

  function renderMonth() {
    const data = state.month.data;
    if (!data) return;
    const body = $('monthTable').querySelector('tbody');
    const todayParts = cityDateParts(new Date(), timeZone());
    const todayKey = dateKey(todayParts);
    const fragment = document.createDocumentFragment();

    for (const item of data.days) {
      const date = new Date(Date.UTC(data.year, data.month - 1, item.day, 12));
      const weekday = weekdayName(date);
      const key = `${data.year}-${String(data.month).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
      const row = document.createElement('tr');
      if (key === todayKey) row.classList.add('today');
      else if (date.getUTCDay() === 5) row.classList.add('friday');

      const values = [
        weekday,
        formatHijriDay(date),
        ...PRAYERS.map((prayer) => displayTime(item.times[prayer.key]))
      ];
      const cells = [
        `<td><div class="day-cell"><b>${item.day}</b><span>${weekday}</span></div></td>`,
        `<td class="hijri-cell">${values[1]}</td>`,
        ...values.slice(2).map((value) => `<td>${value}</td>`)
      ];
      row.innerHTML = cells.join('');
      fragment.appendChild(row);
    }

    body.replaceChildren(fragment);
    $('monthLabel').textContent = formatMonthYear(data.year, data.month);
    $('monthSub').textContent = `${data.location.name} • ${data.days.length} يومًا • بتوقيت المدينة`;
    $('monthMethod').textContent = `${data.methodLabel} • ${data.location.name}`;
  }

  function setMonthScroll(position) {
    const box = document.querySelector('.table-scroll');
    if (!box) return;
    if (position !== 'today') {
      box.scrollTop = 0;
      return;
    }
    requestAnimationFrame(() => {
      const row = $('monthTable').querySelector('tbody tr.today');
      if (!row) {
        box.scrollTop = 0;
        return;
      }
      const boxRect = box.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const target =
        box.scrollTop + rowRect.top - boxRect.top - (box.clientHeight - rowRect.height) / 2;
      box.scrollTop = Math.max(0, Math.min(target, box.scrollHeight - box.clientHeight));
    });
  }

  function currentMonth() {
    const parts = cityDateParts(new Date(), timeZone());
    return { year: parts.year, month: parts.month };
  }

  function changeMonth(delta) {
    const base = state.month.data
      ? { year: state.month.data.year, month: state.month.data.month }
      : currentMonth();
    let month = base.month + delta;
    let year = base.year;
    if (month < 1) {
      month = 12;
      year -= 1;
    } else if (month > 12) {
      month = 1;
      year += 1;
    }
    loadMonth(year, month, { scroll: 'top' });
  }

  /* ---------------- البحث عن المدن ---------------- */

  function localCities(query) {
    const q = normalizeArabic(query);
    if (!q) return [];
    return (window.SALATI_CITIES || [])
      .filter((city) => normalizeArabic(`${city.name} ${city.en} ${city.country}`).includes(q))
      .slice(0, 6)
      .map((city) => ({
        name: city.name,
        country: city.country,
        countryCode: city.cc,
        lat: city.lat,
        lng: city.lng,
        timezone: city.tz,
        source: 'search'
      }));
  }

  function dedupeCities(cities) {
    const seen = new Set();
    const out = [];
    for (const city of cities) {
      const key = `${normalizeArabic(city.name)}|${normalizeArabic(city.country)}|${Number(city.lat).toFixed(2)}|${Number(city.lng).toFixed(2)}`;
      const keyLoose = `${normalizeArabic(city.name)}|${normalizeArabic(city.country)}`;
      if (seen.has(key) || seen.has(keyLoose)) continue;
      seen.add(key);
      seen.add(keyLoose);
      out.push(city);
    }
    return out;
  }

  function renderCityResults(results, loading = false) {
    const container = $('cityResults');
    container.replaceChildren();
    if (!results.length) {
      container.hidden = false;
      if (loading) {
        const div = document.createElement('div');
        div.className = 'search-empty';
        div.textContent = 'جارٍ البحث…';
        container.appendChild(div);
      } else {
        const div = document.createElement('div');
        div.className = 'search-empty';
        div.textContent = 'لم نجد هذه المدينة. جرّب كتابة الاسم بالعربية أو الإنجليزية.';
        container.appendChild(div);
      }
      state.searchResults = [];
      return;
    }

    state.searchResults = results;
    const current = state.settings?.location;
    results.forEach((city, index) => {
      const button = document.createElement('button');
      button.className = 'city-result';
      button.type = 'button';
      button.innerHTML =
        '<svg class="icon"><use href="#i-pin"/></svg><span class="city-result-text"><b></b><span></span></span>';
      button.querySelector('b').textContent = city.name;
      button.querySelector('.city-result-text span').textContent = [city.country, city.timezone]
        .filter(Boolean)
        .join(' • ');
      if (sameCoords(current, city)) {
        const check = document.createElement('svg');
        check.setAttribute('class', 'icon result-check');
        check.innerHTML = '<use href="#i-check"/>';
        button.appendChild(check);
      }
      button.addEventListener('click', () => selectCity(city));
      container.appendChild(button);
    });
    container.hidden = false;
  }

  async function runSearch(query) {
    const clean = query.trim();
    const seq = ++state.searchSeq;
    if (clean.length < 2) {
      $('cityResults').hidden = true;
      $('searchSpinner').hidden = true;
      return;
    }
    const local = localCities(clean);
    renderCityResults(local, true);
    $('searchSpinner').hidden = false;
    try {
      const remote = await api.searchCities(clean);
      if (seq !== state.searchSeq) return;
      const merged = dedupeCities([...local, ...(Array.isArray(remote) ? remote : [])]);
      renderCityResults(merged, false);
    } catch {
      if (seq === state.searchSeq) renderCityResults(local, false);
    } finally {
      if (seq === state.searchSeq) $('searchSpinner').hidden = true;
    }
  }

  async function selectCity(city) {
    const location = {
      name: city.name,
      country: city.country || '',
      countryCode: String(city.countryCode || city.cc || '').toUpperCase(),
      lat: Number(city.lat),
      lng: Number(city.lng),
      timezone: city.timezone || city.tz,
      source: 'search'
    };
    $('cityResults').hidden = true;
    $('citySearch').value = '';
    state.searchSeq += 1;
    state.locationExpanded = false;
    await saveSettings({ location }, { toast: `تم اختيار ${location.name}` });
  }

  async function detectLocation(button) {
    if (!button) return;
    const original = button.innerHTML;
    button.disabled = true;
    button.textContent = 'جارٍ تحديد الموقع…';
    try {
      const location = await api.detectLocation();
      state.locationExpanded = false;
      await saveSettings({ location }, { toast: `تم تحديد موقعك: ${location.name}` });
    } catch (error) {
      showToast(extractError(error));
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  }

  /* ---------------- الصوت ---------------- */

  function getAudioContext() {
    if (!state.audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      state.audioCtx = new Ctx();
    }
    if (state.audioCtx.state === 'suspended') state.audioCtx.resume();
    return state.audioCtx;
  }

  function impulseResponse(ctx) {
    if (state.impulse) return state.impulse;
    const seconds = 2.6;
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
      }
    }
    state.impulse = buffer;
    return buffer;
  }

  function stopChime() {
    if (!state.chime || !state.audioCtx) return;
    const { master, nodes, ctx } = state.chime;
    try {
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(master.gain.value || 0.0001, now);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.25);
    } catch {
      /* ignore */
    }
    const toStop = nodes;
    setTimeout(() => {
      for (const node of toStop) {
        try {
          node.stop();
        } catch {
          /* ignore */
        }
      }
    }, 320);
    state.chime = null;
  }

  function stopAudio() {
    stopChime();
    if (state.audio) {
      try {
        state.audio.pause();
        state.audio.currentTime = 0;
      } catch {
        /* ignore */
      }
      state.audio = null;
    }
  }

  function playChime(volume = 0.8, short = false) {
    stopAudio();
    const ctx = getAudioContext();
    if (!ctx) return;
    const start = ctx.currentTime + 0.06;
    const master = ctx.createGain();
    master.gain.value = clamp(volume, 0, 1) * 0.75;
    master.connect(ctx.destination);

    const convolver = ctx.createConvolver();
    convolver.buffer = impulseResponse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.5;
    convolver.connect(wet);
    wet.connect(master);

    const dry = ctx.createGain();
    dry.gain.value = 0.7;
    dry.connect(master);

    const nodes = [];

    function note(frequency, offset, duration, level) {
      const envelope = ctx.createGain();
      envelope.gain.setValueAtTime(0.0001, start + offset);
      envelope.gain.exponentialRampToValueAtTime(level, start + offset + 0.035);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + offset + duration);
      envelope.connect(dry);
      envelope.connect(convolver);

      const fundamental = ctx.createOscillator();
      fundamental.type = 'sine';
      fundamental.frequency.value = frequency;
      fundamental.connect(envelope);
      fundamental.start(start + offset);
      fundamental.stop(start + offset + duration + 0.05);
      nodes.push(fundamental);

      const harmonic = ctx.createOscillator();
      harmonic.type = 'triangle';
      harmonic.frequency.value = frequency * 2;
      const harmonicGain = ctx.createGain();
      harmonicGain.gain.value = 0.055;
      harmonic.connect(harmonicGain);
      harmonicGain.connect(envelope);
      harmonic.start(start + offset);
      harmonic.stop(start + offset + duration + 0.05);
      nodes.push(harmonic);
    }

    const melody = short
      ? [
          [392.0, 0.0, 2.2, 0.17],
          [523.25, 0.45, 2.8, 0.14]
        ]
      : [
          [293.66, 0.0, 3.0, 0.15],
          [349.23, 0.85, 2.6, 0.12],
          [440.0, 1.7, 3.0, 0.14],
          [392.0, 2.65, 3.0, 0.12],
          [349.23, 3.55, 2.8, 0.11],
          [293.66, 4.45, 3.6, 0.14],
          [440.0, 5.5, 3.4, 0.12]
        ];

    for (const [frequency, offset, duration, level] of melody) {
      note(frequency, offset, duration, level);
    }

    const drone = ctx.createOscillator();
    drone.type = 'sine';
    drone.frequency.value = 146.83;
    const droneGain = ctx.createGain();
    droneGain.gain.setValueAtTime(0.0001, start);
    droneGain.gain.exponentialRampToValueAtTime(0.035, start + 0.8);
    droneGain.gain.exponentialRampToValueAtTime(0.0001, start + (short ? 4.5 : 8.5));
    drone.connect(droneGain);
    droneGain.connect(master);
    drone.start(start);
    drone.stop(start + (short ? 4.8 : 9));
    nodes.push(drone);

    state.chime = { ctx, master, nodes };
  }

  function playCustom(url, volume, { showBanner = true, title = '', subtitle = '' } = {}) {
    if (!url) {
      playChime(volume, false);
      return;
    }
    stopAudio();
    try {
      const audio = new Audio(url);
      audio.volume = clamp(volume, 0, 1);
      state.audio = audio;
      audio.addEventListener('ended', () => {
        state.audio = null;
        hideAdhanBanner();
      });
      audio.play().catch(() => {
        state.audio = null;
        playChime(volume, false);
      });
      if (showBanner) showAdhanBanner(title || 'حان وقت الصلاة', subtitle, true, 0);
    } catch {
      playChime(volume, false);
    }
  }

  function previewSound() {
    if (!state.settings) return;
    const { sound, volume, customSoundPath } = state.settings;
    if (sound === 'none') {
      showToast('خيار «إشعار فقط» لا يشغّل صوتًا. اختر أذانًا أو «ملف خاص» لمعاينة الصوت.');
      return;
    }
    showAdhanBanner('معاينة صوت الأذان', soundLabel(sound), true, 10_000);
    const url = sound === 'custom'
      ? customSoundPath
        ? fileUrl(customSoundPath)
        : null
      : soundAssetUrl(sound);
    playCustom(url, volume, { showBanner: false });
  }

  /* ---------------- شريط الأذان ---------------- */

  function showAdhanBanner(title, subtitle, canStop = true, autoHideMs = 0) {
    const banner = $('adhanBanner');
    $('adhanTitle').textContent = title;
    $('adhanSub').textContent = subtitle;
    $('stopAdhan').hidden = !canStop;
    banner.hidden = false;
    clearTimeout(state.bannerTimer);
    if (autoHideMs > 0) {
      state.bannerTimer = setTimeout(hideAdhanBanner, autoHideMs);
    }
  }

  function hideAdhanBanner() {
    clearTimeout(state.bannerTimer);
    $('adhanBanner').hidden = true;
  }

  function handleAdhan(payload) {
    if (!payload) return;
    const pre = payload.kind === 'pre';
    const isTest = payload.test === true;
    const time = displayTime(payload.timeISO);
    const title = isTest
      ? 'تجربة التنبيه'
      : pre
        ? `اقتربت صلاة ${payload.prayerName}`
        : `حان وقت صلاة ${payload.prayerName}`;
    const subtitle = isTest
      ? `هكذا سيصلك تنبيه الصلاة القادمة: ${payload.prayerName} ${time}`
      : `${time} • ${state.settings?.location?.name || ''}`.trim();
    const volume = Number.isFinite(payload.volume) ? payload.volume : state.settings?.volume ?? 0.85;

    if (payload.sound === 'none') {
      showAdhanBanner(title, subtitle, false, 8000);
      return;
    }

    if (payload.sound === 'custom' && payload.customUrl) {
      showAdhanBanner(title, subtitle, true, 0);
      playCustom(payload.customUrl, volume, { showBanner: false });
      return;
    }

    if (!pre) {
      const url = payload.soundUrl || soundAssetUrl(payload.sound);
      if (url) {
        showAdhanBanner(title, subtitle, true, 0);
        playCustom(url, volume, { showBanner: false });
        return;
      }
    }

    showAdhanBanner(title, subtitle, true, pre ? 7000 : 11000);
    playChime(volume, pre);
  }

  /* ---------------- التنقل ---------------- */

  function switchView(view) {
    if (!view || !document.getElementById(`view-${view}`)) return;
    state.view = view;
    $('views').classList.toggle('month-view', view === 'month');
    for (const item of $$('.nav-item')) {
      item.classList.toggle('active', item.dataset.view === view);
    }
    for (const section of $$('.view')) {
      section.classList.toggle('active', section.id === `view-${view}`);
    }
    $('views').scrollTop = 0;
    if (view === 'settings') applyLocationCollapse();
    if (view === 'month') {
      if (state.month.data) {
        renderMonth();
        setMonthScroll('today');
      } else if (state.month.year) {
        loadMonth(state.month.year, state.month.month, { scroll: 'today' });
      }
    }
  }

  /* ---------------- الأحداث ---------------- */

  const UPDATE_LABELS = {
    idle: 'محدّث',
    'up-to-date': 'محدّث',
    checking: 'جاري التحقق...',
    available: 'تحديث متاح',
    'manual-update': 'تحديث متاح',
    downloading: 'جاري التحميل...',
    ready: 'تحديث متاح',
    installing: 'جاري التثبيت...',
    error: 'تعذّر التحقق'
  };
  let updatePillBusy = false;

  function setUpdatePillVersion(version) {
    const el = $('updatePillVersion');
    if (!el || !version) return;
    el.textContent = `v${String(version).replace(/^v/i, '')}`;
  }

  function renderUpdaterState(info) {
    if (!info) return;
    const status = info.status || 'idle';
    const pill = $('updatePill');
    const labelEl = $('updatePillLabel');
    const label = UPDATE_LABELS[status] || UPDATE_LABELS.idle;
    const version = info.current || (state.meta && state.meta.version) || null;
    const percent = Math.round(clamp(Number(info.percent) || 0, 0, 100));

    if (version) setUpdatePillVersion(version);
    if (labelEl) labelEl.textContent = label;

    if (pill) {
      pill.dataset.state = status;
      pill.disabled = ['checking', 'downloading', 'installing'].includes(status);
      let detail = label;
      if (info.version) detail += ` · ${info.version}`;
      if (status === 'downloading') detail += ` · ${arabicDigits(percent)}٪`;
      if (status === 'error' && info.error) detail += ` · ${String(info.error).slice(0, 120)}`;
      pill.title = status === 'available' || status === 'ready' || status === 'manual-update'
        ? `${detail} — اضغط لتثبيت التحديث`
        : status === 'idle' || status === 'up-to-date' || status === 'error'
          ? `${detail} — اضغط للتحقق من التحديثات`
          : detail;
      pill.setAttribute('aria-label', pill.title);
    }

    if ((status === 'available' || status === 'ready') && state.updaterStatus !== status) {
      const toast = status === 'ready' ? `التحديث ${info.version || ''} جاهز للتثبيت` : `يتوفر تحديث جديد: ${info.version || ''}`;
      showToast(toast.trim());
    }
    state.updaterStatus = status;
  }

  async function handleUpdatePillClick() {
    if (updatePillBusy) return;
    const status = state.updaterStatus || 'idle';
    if (['checking', 'downloading', 'installing'].includes(status)) return;
    const pill = $('updatePill');
    if (pill && pill.disabled) return;

    updatePillBusy = true;
    if (pill) pill.disabled = true;
    try {
      await api.oneClickUpdate();
    } catch {
      renderUpdaterState({
        status: 'error',
        current: (state.meta && state.meta.version) || null,
        error: 'تعذّر إكمال طلب التحديث.'
      });
    } finally {
      updatePillBusy = false;
      // The main process owns the state machine; resync instead of guessing stages here.
      try {
        const info = await api.getUpdaterState();
        if (info) renderUpdaterState(info);
      } catch {
        if (pill) pill.disabled = false;
      }
    }
  }

  function bindEvents() {
    document.addEventListener('click', (event) => {
      const viewTarget = event.target.closest('[data-view]');
      if (viewTarget) {
        switchView(viewTarget.dataset.view);
        return;
      }
      if (!event.target.closest('.search-box') && !event.target.closest('.search-results')) {
        if (!$('cityResults').hidden) $('cityResults').hidden = true;
      }
    });

    $('locationPill').addEventListener('click', () => {
      const alreadyOpen = state.view === 'settings' && !isLocationCollapsed();
      state.locationExpanded = !alreadyOpen;
      switchView('settings');
      applyLocationCollapse();
      if (!isLocationCollapsed()) {
        setTimeout(() => $('citySearch').focus(), 260);
      }
    });

    $('themeToggle').addEventListener('click', () => {
      const next = state.theme === 'dark' ? 'light' : 'dark';
      saveSettings({ theme: next }, { toast: next === 'dark' ? 'تم تفعيل الوضع الداكن' : 'تم تفعيل الوضع الفاتح' });
    });

    $('muteBtn').addEventListener('click', () => {
      if (!state.settings) return;
      const enabled = !state.settings.notifications;
      saveSettings(
        { notifications: enabled },
        { toast: enabled ? 'تم تفعيل تنبيهات الصلاة' : 'تم كتم تنبيهات الصلاة' }
      );
    });

    $('refreshBtn').addEventListener('click', refreshView);

    $('testNotifBtn2').addEventListener('click', testNotification);

    $('prevMonth').addEventListener('click', () => changeMonth(-1));
    $('nextMonth').addEventListener('click', () => changeMonth(1));
    $('todayMonth').addEventListener('click', () => {
      const now = currentMonth();
      loadMonth(now.year, now.month, { scroll: 'today' });
    });

    $('notifToggle').addEventListener('change', (event) => {
      saveSettings({ notifications: event.target.checked });
    });
    $('themeSelect').addEventListener('change', (event) => {
      saveSettings({ theme: event.target.value });
    });
    $('timeFormat').addEventListener('change', (event) => {
      saveSettings({ timeFormat: event.target.value });
    });
    $('trayToggle').addEventListener('change', (event) => {
      saveSettings({ closeToTray: event.target.checked });
    });
    $('taskbarToggle').addEventListener('change', (event) => {
      const enabled = event.target.checked;
      saveSettings(
        { taskbarWidgetEnabled: enabled },
        {
          toast: enabled
            ? 'ستظهر أداة الصلاة داخل شريط المهام'
            : 'تم إخفاء أداة الصلاة من شريط المهام'
        }
      );
    });
    $('autoStartToggle').addEventListener('change', (event) => {
      saveSettings(
        { autoLaunch: event.target.checked },
        { toast: event.target.checked ? 'سيبدأ صلاتي مع Windows بعد التثبيت' : 'تم إيقاف التشغيل التلقائي' }
      );
    });

    const updatePill = $('updatePill');
    if (updatePill) updatePill.addEventListener('click', handleUpdatePillClick);

    $('volumeRange').addEventListener('input', (event) => {
      const value = Number(event.target.value);
      $('volumeValue').textContent = `${value}%`;
      clearTimeout(state.volumeTimer);
      state.volumeTimer = setTimeout(() => {
        saveSettings({ volume: value / 100 });
      }, 300);
    });

    $('soundSelect').addEventListener('change', async (event) => {
      const sound = event.target.value;
      if (sound === 'custom' && !state.settings?.customSoundPath) {
        const picked = await pickSound();
        if (!picked) syncSettingsUI();
        return;
      }
      saveSettings({ sound });
    });

    $('pickSoundBtn').addEventListener('click', pickSound);
    $('previewSound').addEventListener('click', previewSound);
    $('stopAdhan').addEventListener('click', () => {
      stopAudio();
      hideAdhanBanner();
    });

    $('detectBtn').addEventListener('click', (event) => detectLocation(event.currentTarget));

    $('citySearch').addEventListener('input', (event) => {
      const value = event.target.value;
      clearTimeout(state.searchTimer);
      state.searchTimer = setTimeout(() => runSearch(value), 380);
    });
    $('citySearch').addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && state.searchResults.length) {
        event.preventDefault();
        selectCity(state.searchResults[0]);
      }
      if (event.key === 'Escape') {
        $('cityResults').hidden = true;
      }
    });
    $('cityResults').addEventListener('click', (event) => {
      if (event.target.closest('.city-result')) {
        $('cityResults').hidden = true;
      }
    });

    $('resetBtn').addEventListener('click', async () => {
      if (!window.confirm('هل تريد استعادة الإعدادات الافتراضية؟ سيتم الاحتفاظ بموقعك الحالي.')) return;
      try {
        const response = await api.resetSettings();
        state.settings = response.settings;
        applyTheme();
        syncSettingsUI();
        await refreshToday();
        initMonthState();
        state.month.data = null;
        if (state.view === 'month') {
          await loadMonth(state.month.year, state.month.month, { scroll: 'today' });
        }
        showToast('تمت استعادة الإعدادات الافتراضية.');
      } catch {
        showToast('تعذّر استعادة الإعدادات.');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        $('cityResults').hidden = true;
      }
    });

    setInterval(() => {
      updateCountdown();
      watchDay();
    }, 1000);

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (state.settings?.theme === 'auto') applyTheme();
    });

    api.onPlayAdhan(handleAdhan);
    api.onSettingsChanged(applyExternalSettings);
    api.onToast((payload) => {
      if (payload?.message) showToast(payload.message);
    });
    api.onNavigate((view) => {
      switchView(view || 'home');
    });
    api.onThemeChanged(() => {
      if (state.settings?.theme === 'auto') applyTheme();
    });

    document.addEventListener(
      'pointerdown',
      () => {
        if (state.audioCtx?.state === 'suspended') state.audioCtx.resume();
      },
      { once: true }
    );
  }

  function watchDay() {
    if (!state.settings || !state.today) return;
    const parts = cityDateParts(new Date(), timeZone());
    if (dateKey(parts) !== state.today.dateKey) {
      renderDates();
      refreshToday();
      if (state.month.data) {
        const now = currentMonth();
        if (now.year !== state.month.data.year || now.month !== state.month.data.month) {
          loadMonth(now.year, now.month, { silent: true });
        } else {
          renderMonth();
        }
      }
    }
  }

  async function pickSound() {
    try {
      const result = await api.pickSound();
      if (!result) return false;
      await saveSettings(
        { customSoundPath: result.path, sound: 'custom' },
        { toast: 'تم اختيار ملف الأذان.' }
      );
      return true;
    } catch {
      showToast('تعذّر اختيار الملف.');
      return false;
    }
  }

  async function testNotification() {
    try {
      const ok = await api.testNotification();
      if (!ok) showToast('التنبيهات غير مدعومة على هذا الجهاز.');
    } catch {
      showToast('تعذّر إظهار التنبيه التجريبي.');
    }
  }

  /* ---------------- البدء ---------------- */

  async function init() {
    bindEvents();

    const failsafe = setTimeout(hideSplash, 6000);

    try {
      const { settings, meta } = await api.getSettings();
      state.settings = settings;
      state.meta = meta;
      setUpdatePillVersion(meta.version);
      applyTheme();
      syncSettingsUI();
      initMonthState();

      if (api.onUpdaterState) api.onUpdaterState(renderUpdaterState);
      if (api.getUpdaterState) {
        try {
          renderUpdaterState(await api.getUpdaterState());
        } catch {}
      }

      await refreshToday();
      renderDates();
      if (state.settings.notifications === false) renderNotificationStatus();

      setTimeout(hideSplash, 450);
    } catch (error) {
      console.error(error);
      hideSplash();
      showToast('تعذّر تحميل بيانات التطبيق. أعد تشغيل صلاتي.');
    } finally {
      clearTimeout(failsafe);
    }
  }

  init();
})();
