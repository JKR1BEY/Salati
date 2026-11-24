(() => {
  'use strict';

  const api = window.salati;
  const $ = (id) => document.getElementById(id);
  let focus = { active: false, endsAt: 0, adhanAt: 0, dismissOnAdhan: true, timeZone: 'UTC', timeFormat: '12' };

  // نفس كود السمة المستخدم في النافذة الرئيسية والقائمة (داكن / ذهبي / فاتح).
  function setTheme(theme) {
    const value = theme === 'auto'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.dataset.theme =
      ['dark', 'gold', 'light'].includes(value) ? value : 'dark';
  }

  function formatCountdown(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    return [hours, minutes, seconds].map((v) => String(v).padStart(2, '0')).join(':');
  }

  function write(id, value) {
    const el = $(id);
    if (el && el.textContent !== value) el.textContent = value;
  }

  // نفس تنسيق الواجهة الرئيسية تماماً (12/24 ساعة بحسب إعداد المستخدم).
  function formatAt(iso) {
    if (!iso) return '';
    try {
      const options = focus.timeFormat === '24'
        ? { timeZone: focus.timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }
        : { timeZone: focus.timeZone, hour: 'numeric', minute: '2-digit', hour12: true };
      const parts = new Intl.DateTimeFormat('en-GB', options).formatToParts(new Date(iso));
      const hour = parts.find((part) => part.type === 'hour')?.value || '--';
      const minute = parts.find((part) => part.type === 'minute')?.value || '--';
      return `${hour}:${minute}`;
    } catch {
      return '';
    }
  }

  function clockText() {
    return formatAt(new Date().toISOString());
  }

  function paintTexts(texts) {
    if (!texts) return;
    write('focusVerse', texts.verse || '—');
    write('focusVerseRef', texts.verseRef || '—');
    write('focusHadith', texts.hadith || '—');
    write('focusHadithRef', texts.hadithRef || '—');
    // الواجهة الرئيسية ترسل الاسم الفعّال عند كل انتقال فترة أثناء عرض الشاشة.
    if (texts.prayer && texts.prayer !== '—') write('focusPrayer', texts.prayer);
  }

  function tick() {
    if (!focus.active) return;
    const now = Date.now();
    let remaining = focus.endsAt - now;
    if (focus.dismissOnAdhan && focus.adhanAt) {
      remaining = Math.min(remaining, focus.adhanAt - now);
    }
    if (remaining <= 0) {
      dismiss();
      return;
    }
    write('focusCountdown', formatCountdown(remaining));
    write('focusClock', clockText());
  }

  function openOverlay(payload) {
    if (!payload) return;
    const adhanMs = Date.parse(payload.timeISO);
    focus = {
      active: true,
      endsAt: Date.now() + (Number(payload.durationMinutes) || 5) * 60_000,
      adhanAt: Number.isFinite(adhanMs) ? adhanMs : 0,
      dismissOnAdhan: payload.dismissOnAdhan !== false,
      timeZone: payload.timeZone || 'UTC',
      timeFormat: payload.timeFormat || '12'
    };
    write('focusPrayer', payload.currentPrayerName || '—');
    write('focusSub', payload.preview
      ? 'معاينة • تعود الشاشة بعد انتهاء المدة'
      : `موعد الأذان ${formatAt(payload.timeISO)}`);
    if (payload.texts) paintTexts(payload.texts);
    $('focusOverlay').hidden = false;
    tick();
    requestAnimationFrame(() => {
      try { $('focusClose').focus({ preventScroll: true }); } catch { /* ignore */ }
    });
  }

  function closeOverlay() {
    focus.active = false;
    $('focusOverlay').hidden = true;
  }

  function dismiss() {
    closeOverlay();
    if (api.dismissFocus) api.dismissFocus().catch(() => {});
  }

  setInterval(tick, 1000);
  api.onFocusShow(openOverlay);
  api.onFocusHide(closeOverlay);
  api.onFocusTexts(paintTexts);
  api.onThemeChanged(setTheme);
  api.getSettings()
    .then((result) => setTheme(result?.settings?.theme || 'dark'))
    .catch(() => {});
  $('focusClose').addEventListener('click', dismiss);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') dismiss();
  });

  api.getFocusState()
    .then((state) => {
      if (state && state.texts) paintTexts(state.texts);
      if (state && state.payload) openOverlay(state.payload);
    })
    .catch(() => {});
})();
