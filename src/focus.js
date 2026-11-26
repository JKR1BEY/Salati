(() => {
  'use strict';

  const api = window.salati;
  const $ = (id) => document.getElementById(id);
  const actionWrap = $('focusActionWrap');
  const actionBtn = $('focusClose');
  const actionMenu = $('focusActionMenu');
  const turnOffBtn = $('focusTurnOff');
  let focus = { active: false, endsAt: 0, adhanAt: 0, dismissOnAdhan: true, timeZone: 'UTC', timeFormat: '12' };
  let rafId = 0;
  let lastSecond = -1;
  let lastClock = '';

  // القائمة الصغيرة تفتح وتُغلق فوراً بلا انتظار، مع الحفاظ على التركيز داخل الزر.
  function setActionMenu(open, moveFocus = true) {
    if (!actionMenu || !actionBtn || actionMenu.hidden === !open) return;
    actionMenu.hidden = !open;
    actionBtn.setAttribute('aria-expanded', String(open));
    if (!moveFocus) return;
    const target = open ? turnOffBtn : actionBtn;
    try { target?.focus({ preventScroll: true }); } catch { /* ignore */ }
  }

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

  // الحساب دائماً من الهدف الزمني الحقيقي، لا من عدّاد محلي يُنقَص كل ثانية.
  // rAF يمنع تجمد setInterval حين تنشغل طبقات الزجاج بإعادة الرسم.
  function remainingMs(now) {
    let remaining = focus.endsAt - now;
    if (focus.dismissOnAdhan && focus.adhanAt > now) {
      remaining = Math.min(remaining, focus.adhanAt - now);
    }
    return remaining;
  }

  function tick() {
    if (!focus.active) return;
    const now = Date.now();
    const remaining = remainingMs(now);
    if (remaining <= 0) {
      dismiss();
      return;
    }

    // لا نكتب في DOM إلا إذا تغيّر الرقم المعروض فعلاً؛ لا re-render ولا layout ثقيل.
    const second = Math.ceil(remaining / 1000);
    if (second !== lastSecond) {
      lastSecond = second;
      write('focusCountdown', formatCountdown(remaining));
      // الساعة لا تتغيّر إلا كل دقيقة؛ حسابها مع تغيّر الثانية يكفي ويمنع بناء Intl كل إطار.
      const clock = clockText();
      if (clock !== lastClock) {
        lastClock = clock;
        write('focusClock', clock);
      }
    }
  }

  function frame() {
    rafId = 0;
    if (!focus.active) return;
    tick();
    if (focus.active) rafId = requestAnimationFrame(frame);
  }

  function startTicker() {
    if (!rafId && focus.active) rafId = requestAnimationFrame(frame);
  }

  function stopTicker() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    lastSecond = -1;
    lastClock = '';
  }

  // نبض خفيف يُعيد تشغيل rAF إذا أوقفت النافذة الإطارات مؤقتاً أثناء إخفاء/ظهور طبقة.
  setInterval(() => {
    if (focus.active && !rafId) startTicker();
  }, 250);

  function openOverlay(payload) {
    if (!payload) return;
    setActionMenu(false, false);
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
    stopTicker();
    tick();
    startTicker();
    requestAnimationFrame(() => {
      try { actionBtn?.focus({ preventScroll: true }); } catch { /* ignore */ }
    });
  }

  function closeOverlay() {
    focus.active = false;
    stopTicker();
    setActionMenu(false, false);
    $('focusOverlay').hidden = true;
  }

  function dismiss() {
    closeOverlay();
    if (api.dismissFocus) api.dismissFocus().catch(() => {});
  }

  api.onFocusShow(openOverlay);
  api.onFocusHide(closeOverlay);
  api.onFocusTexts(paintTexts);
  api.onThemeChanged(setTheme);
  api.getSettings()
    .then((result) => setTheme(result?.settings?.theme || 'dark'))
    .catch(() => {});
  actionBtn?.addEventListener('click', () => setActionMenu(actionMenu.hidden));
  turnOffBtn?.addEventListener('click', dismiss);
  document.addEventListener('pointerdown', (event) => {
    if (!actionMenu.hidden && !actionWrap.contains(event.target)) setActionMenu(false, false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!actionMenu.hidden) {
      event.stopPropagation();
      setActionMenu(false);
      return;
    }
    dismiss();
  });

  api.getFocusState()
    .then((state) => {
      if (state && state.texts) paintTexts(state.texts);
      if (state && state.payload) openOverlay(state.payload);
    })
    .catch(() => {});
})();
