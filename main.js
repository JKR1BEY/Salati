const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  Notification,
  ipcMain,
  nativeImage,
  nativeTheme,
  dialog,
  shell,
  screen
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const {
  Coordinates,
  PrayerTimes,
  CalculationMethod,
  Madhab,
  HighLatitudeRule,
  Qibla
} = require('adhan');
const tzlookup = require('tz-lookup');

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');
const TRAY_PATH = path.join(__dirname, 'assets', 'tray.png');
const SHOW_SCREENSHOTS = process.argv.includes('--screenshots');
const WIDGET_WIDTH = 300;
const WIDGET_HEIGHT = 388;
const CORNER_WIDTH = 210;
const CORNER_HEIGHT = 64;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const KAABA = { lat: 21.4225, lng: 39.8262 };

const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const PRAYER_NAMES = {
  fajr: 'الفجر',
  sunrise: 'الشروق',
  dhuhr: 'الظهر',
  asr: 'العصر',
  maghrib: 'المغرب',
  isha: 'العشاء'
};
const NEXT_KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

const METHOD_LABELS = {
  auto: 'تلقائي حسب البلد',
  Turkey: 'تركيا — ديانت',
  MuslimWorldLeague: 'رابطة العالم الإسلامي',
  Egyptian: 'الهيئة المصرية العامة للمساحة',
  Karachi: 'جامعة العلوم الإسلامية — كراتشي',
  UmmAlQura: 'أم القرى — مكة المكرمة',
  Dubai: 'دبي',
  Kuwait: 'الكويت',
  Qatar: 'قطر',
  Singapore: 'سنغافورة',
  Tehran: 'طهران',
  NorthAmerica: 'أمريكا الشمالية (ISNA)',
  MoonsightingCommittee: 'لجنة رؤية القمر',
  Other: 'حسب زاوية مخصّصة'
};

const COUNTRY_METHOD = {
  TR: 'Turkey',
  SA: 'UmmAlQura',
  AE: 'Dubai',
  KW: 'Kuwait',
  QA: 'Qatar',
  EG: 'Egyptian',
  PS: 'Egyptian',
  JO: 'Egyptian',
  SY: 'Egyptian',
  LB: 'Egyptian',
  IQ: 'Egyptian',
  YE: 'UmmAlQura',
  SD: 'Egyptian',
  LY: 'Egyptian',
  TN: 'Egyptian',
  DZ: 'Egyptian',
  MA: 'Egyptian',
  MR: 'Egyptian',
  SO: 'Egyptian',
  DJ: 'Egyptian',
  PK: 'Karachi',
  IN: 'Karachi',
  BD: 'Karachi',
  AF: 'Karachi',
  LK: 'Karachi',
  US: 'NorthAmerica',
  CA: 'NorthAmerica',
  GB: 'MoonsightingCommittee',
  SG: 'Singapore',
  IR: 'Tehran'
};

const DEFAULT_SETTINGS = {
  location: {
    name: 'أنقرة',
    country: 'تركيا',
    countryCode: 'TR',
    lat: 39.9199,
    lng: 32.8543,
    timezone: 'Europe/Istanbul',
    source: 'default'
  },
  method: 'auto',
  madhab: 'shafi',
  highLatitude: 'middle',
  notifications: true,
  preAdhanMinutes: 0,
  sound: 'chime',
  customSoundPath: null,
  volume: 0.85,
  theme: 'dark',
  timeFormat: '24',
  hijriOffset: 0,
  closeToTray: true,
  autoLaunch: false,
  widgetEnabled: true,
  cornerEnabled: true,
  trayHintShown: false
};

let settings = null;
let settingsPath = null;
let win = null;
let widget = null;
let corner = null;
let tray = null;
let widgetDismissed = false;
let mainShown = false;
let isQuitting = false;
let notified = new Set();
let notifiedDay = '';
let trayTimer = null;
let schedulerTimer = null;
let lastTraySignature = '';
let searchCache = new Map();

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return base;
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value) && base && typeof base[key] === 'object') {
      out[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function loadSettings() {
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  const loaded = readJsonFile(settingsPath);
  let merged = deepMerge(DEFAULT_SETTINGS, loaded || {});

  if (typeof merged.volume !== 'number' || Number.isNaN(merged.volume)) merged.volume = DEFAULT_SETTINGS.volume;
  merged.volume = clamp(merged.volume, 0, 1);
  if (!Number.isFinite(merged.location.lat) || !Number.isFinite(merged.location.lng)) {
    merged.location = { ...DEFAULT_SETTINGS.location };
  }
  merged.location.lat = clamp(Number(merged.location.lat), -90, 90);
  merged.location.lng = clamp(Number(merged.location.lng), -180, 180);
  if (!merged.location.timezone) {
    try { merged.location.timezone = tzlookup(merged.location.lat, merged.location.lng); } catch { merged.location.timezone = 'UTC'; }
  }
  return merged;
}

function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('تعذّر حفظ الإعدادات:', err.message);
  }
}

function broadcast(channel, payload) {
  for (const target of [win, widget, corner]) {
    if (target && !target.isDestroyed()) {
      target.webContents.send(channel, payload);
    }
  }
}

function resolveMethodId() {
  if (settings.method && settings.method !== 'auto' && CalculationMethod[settings.method]) {
    return settings.method;
  }
  const cc = (settings.location.countryCode || '').toUpperCase();
  return COUNTRY_METHOD[cc] || 'MuslimWorldLeague';
}

function buildParams() {
  const methodId = resolveMethodId();
  const params = CalculationMethod[methodId]();
  params.madhab = settings.madhab === 'hanafi' ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule =
    settings.highLatitude === 'seventh'
      ? HighLatitudeRule.SeventhOfTheNight
      : settings.highLatitude === 'twilight'
        ? HighLatitudeRule.TwilightAngle
        : HighLatitudeRule.MiddleOfTheNight;
  return params;
}

function tzDateParts(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).formatToParts(date);
    const get = (type) => Number(parts.find((p) => p.type === type)?.value);
    return { year: get('year'), month: get('month'), day: get('day') };
  } catch {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
}

function anchorForDate(timeZone, addDays = 0) {
  const { year, month, day } = tzDateParts(new Date(), timeZone);
  return new Date(year, month - 1, day + addDays, 12, 0, 0, 0);
}

function monthAnchor(year, month, day) {
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

function calculateForAnchor(anchor) {
  const coords = new Coordinates(settings.location.lat, settings.location.lng);
  const params = buildParams();
  const times = new PrayerTimes(coords, anchor, params);
  const out = {};
  for (const key of PRAYER_KEYS) {
    const value = times[key];
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      out[key] = value.toISOString();
    } else {
      out[key] = null;
    }
  }
  return out;
}

function formatTime(iso, timeZone = settings.location.timezone, hour12 = settings.timeFormat === '12') {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('ar-u-nu-latn', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function formatShortTime(iso) {
  return formatTime(iso, settings.location.timezone, false).replace(/\s/g, '');
}

function buildDayPayload() {
  const tz = settings.location.timezone;
  const todayAnchor = anchorForDate(tz, 0);
  const times = calculateForAnchor(todayAnchor);
  const now = Date.now();

  let nextKey = null;
  let prevKey = null;
  let nextIso = null;
  let prevIso = null;
  let nextIsTomorrow = false;

  for (const key of NEXT_KEYS) {
    const ms = times[key] ? Date.parse(times[key]) : NaN;
    if (Number.isNaN(ms)) continue;
    if (ms > now && !nextKey) {
      nextKey = key;
      nextIso = times[key];
    }
    if (ms <= now) {
      prevKey = key;
      prevIso = times[key];
    }
  }

  if (!nextKey) {
    const tomorrow = calculateForAnchor(anchorForDate(tz, 1));
    nextKey = 'fajr';
    nextIso = tomorrow.fajr;
    prevKey = 'isha';
    prevIso = times.isha;
    nextIsTomorrow = true;
  } else if (!prevIso) {
    const yesterday = calculateForAnchor(anchorForDate(tz, -1));
    prevKey = 'isha';
    prevIso = yesterday.isha;
    nextIsTomorrow = false;
  }

  const parts = tzDateParts(new Date(), tz);
  const dateKey = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;

  return {
    now,
    dateKey,
    timezone: tz,
    location: { ...settings.location },
    methodId: resolveMethodId(),
    methodLabel: METHOD_LABELS[resolveMethodId()] || METHOD_LABELS.MuslimWorldLeague,
    madhab: settings.madhab,
    times,
    next: {
      key: nextKey,
      name: PRAYER_NAMES[nextKey],
      timeISO: nextIso,
      prevKey,
      prevName: PRAYER_NAMES[prevKey],
      prevTimeISO: prevIso,
      tomorrow: nextIsTomorrow
    }
  };
}

function distanceToKaaba(lat, lng) {
  const R = 6371;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(KAABA.lat - lat);
  const dLng = toRad(KAABA.lng - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat)) * Math.cos(toRad(KAABA.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function notificationTimeText(iso) {
  return `${formatTime(iso, settings.location.timezone, false)} — ${settings.location.name}`;
}

function showNotification(title, body) {
  if (!Notification.isSupported()) return false;
  try {
    const notification = new Notification({
      title,
      body,
      icon: ICON_PATH,
      silent: true,
      timeoutType: 'default'
    });
    notification.on('click', () => {
      showWindow();
      broadcast('navigate', 'home');
    });
    notification.show();
    return true;
  } catch (err) {
    console.error('تعذّر إظهار التنبيه:', err.message);
    return false;
  }
}

function adhanPayload(kind, prayerKey, timeISO, extra = {}) {
  let customUrl = null;
  if (settings.sound === 'custom' && settings.customSoundPath && fs.existsSync(settings.customSoundPath)) {
    customUrl = pathToFileURL(settings.customSoundPath).href;
  }
  return {
    kind,
    prayerKey,
    prayerName: PRAYER_NAMES[prayerKey] || '',
    timeISO,
    sound: settings.sound,
    customUrl,
    volume: settings.volume,
    ...extra
  };
}

function playAdhan(kind, prayerKey, timeISO, extra = {}) {
  broadcast('adhan:play', adhanPayload(kind, prayerKey, timeISO, extra));
}

function checkNotifications() {
  if (!settings.notifications) return;
  const payload = buildDayPayload();
  if (notifiedDay !== payload.dateKey) {
    notifiedDay = payload.dateKey;
    notified = new Set();
  }
  const now = Date.now();

  for (const key of NEXT_KEYS) {
    const iso = payload.times[key];
    if (!iso) continue;
    const adhanMs = Date.parse(iso);
    if (Number.isNaN(adhanMs)) continue;

    const preMinutes = Number(settings.preAdhanMinutes) || 0;
    if (preMinutes > 0) {
      const preMs = adhanMs - preMinutes * 60_000;
      const preId = `${payload.dateKey}:${key}:pre`;
      if (now >= preMs && now - preMs < 90_000 && !notified.has(preId)) {
        notified.add(preId);
        showNotification(
          `بعد ${preMinutes} دقائق: صلاة ${PRAYER_NAMES[key]}`,
          notificationTimeText(iso)
        );
        playAdhan('pre', key, iso);
      }
    }

    const adhanId = `${payload.dateKey}:${key}:adhan`;
    if (now >= adhanMs && now - adhanMs < 90_000 && !notified.has(adhanId)) {
      notified.add(adhanId);
      showNotification(`حان وقت صلاة ${PRAYER_NAMES[key]}`, notificationTimeText(iso));
      playAdhan('adhan', key, iso);
    }
  }
}

function buildTrayMenu(payload) {
  const p = payload || buildDayPayload();
  const nextTime = formatShortTime(p.next.timeISO);
  const todayItems = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'].map((key) => ({
    label: `${PRAYER_NAMES[key]}   ${formatShortTime(p.times[key])}`,
    enabled: false
  }));

  return Menu.buildFromTemplate([
    { label: `صلاتي — ${settings.location.name}`, enabled: false },
    { label: `الصلاة القادمة: ${PRAYER_NAMES[p.next.key]} ${nextTime}`, enabled: false },
    { type: 'separator' },
    ...todayItems,
    { type: 'separator' },
    { label: 'فتح واجهة صلاتي', click: () => showWindow() },
    {
      label: 'تفعيل التنبيهات',
      type: 'checkbox',
      checked: !!settings.notifications,
      click: (item) => applySettings({ notifications: item.checked })
    },
    {
      label: 'إظهار الأداة المصغرة',
      type: 'checkbox',
      checked: settings.widgetEnabled !== false,
      click: (item) => applySettings({ widgetEnabled: item.checked })
    },
    {
      label: 'إظهار مؤشر الصلاة في زاوية الشاشة',
      type: 'checkbox',
      checked: settings.cornerEnabled === true,
      click: (item) => applySettings({ cornerEnabled: item.checked })
    },
    {
      label: settings.sound === 'none' ? 'الصوت: مكتوم' : 'الصوت: مفعّل',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'إغلاق صلاتي',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
}

function updateTray(force = false) {
  if (!tray) return;
  try {
    const payload = buildDayPayload();
    const signature = [
      payload.dateKey,
      payload.next.key,
      payload.next.timeISO,
      settings.location.name,
      settings.notifications,
      settings.widgetEnabled,
      settings.cornerEnabled,
      settings.sound
    ].join('|');
    if (!force && signature === lastTraySignature) {
      tray.setToolTip(`صلاتي — ${settings.location.name}\n${payload.next.name} ${formatShortTime(payload.next.timeISO)}`);
      return;
    }
    lastTraySignature = signature;
    tray.setToolTip(
      `صلاتي — ${settings.location.name}\n${payload.next.name} ${formatShortTime(payload.next.timeISO)}`
    );
    tray.setContextMenu(buildTrayMenu(payload));
  } catch (err) {
    console.error('تعذّر تحديث شريط المهام:', err.message);
  }
}

function showWindow(view) {
  widgetDismissed = false;
  if (!win) {
    createWindow();
    return;
  }
  mainShown = true;
  try { win.restore(); } catch {}
  win.show();
  win.focus();
  hideWidget();
  if (view && ['home', 'month', 'qibla', 'settings'].includes(view)) {
    broadcast('navigate', view);
  }
}

function showTrayHintOnce() {
  if (settings.trayHintShown || !tray) return;
  settings.trayHintShown = true;
  saveSettings();
  try {
    tray.displayBalloon({
      title: 'صلاتي يعمل في الخلفية',
      content:
        settings.widgetEnabled !== false
          ? 'الأداة المصغرة أسفل الشاشة تعرض مواقيت الصلاة، واضغط عليها لفتح صلاتي. لإيقاف التطبيق نهائيًا استخدم قائمة شريط المهام.'
          : 'ستصلك تنبيهات الصلاة حتى بعد إغلاق النافذة. لإيقاف التطبيق نهائيًا استخدم قائمة شريط المهام.',
      iconType: 'info'
    });
  } catch {
    /* ignore */
  }
}

let widgetReady = false;
let mainReady = false;

function widgetBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  return {
    x: workArea.x + 20,
    y: workArea.y + workArea.height - WIDGET_HEIGHT - 20,
    width: WIDGET_WIDTH,
    height: WIDGET_HEIGHT
  };
}

function positionWidget() {
  if (!widget || widget.isDestroyed()) return;
  widget.setBounds(widgetBounds());
}

function shouldShowWidget() {
  if (!settings || settings.widgetEnabled === false) return false;
  if (widgetDismissed) return false;
  if (!win || win.isDestroyed()) return true;
  return !win.isVisible() || win.isMinimized();
}

function syncWidgetVisibility() {
  if (!widgetReady || !widget || widget.isDestroyed()) return;
  if (!shouldShowWidget()) {
    if (widget.isVisible()) widget.hide();
  } else {
    positionWidget();
    if (!widget.isVisible()) widget.showInactive();
  }
  syncCornerVisibility();
}

function hideWidget() {
  if (widget && !widget.isDestroyed() && widget.isVisible()) {
    widget.hide();
  }
  syncCornerVisibility();
}

function createWidget() {
  if (widget && !widget.isDestroyed()) return;
  widgetReady = false;
  widget = new BrowserWindow({
    ...widgetBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    title: 'صلاتي — الأداة المصغرة',
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  widget.loadFile(path.join(__dirname, 'src', 'widget.html'));
  widget.setAlwaysOnTop(true, 'floating');

  widget.once('ready-to-show', () => {
    widgetReady = true;
    syncWidgetVisibility();
  });

  widget.on('closed', () => {
    widget = null;
    widgetReady = false;
  });

  widget.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

let cornerReady = false;

function cornerBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  let y = workArea.y + workArea.height - CORNER_HEIGHT - 20;
  // stack above the large mini widget when both are visible
  if (widget && !widget.isDestroyed() && widget.isVisible()) {
    const wb = widget.getBounds();
    y = wb.y - CORNER_HEIGHT - 8;
    if (y < workArea.y + 8) y = workArea.y + 8;
  }
  return {
    x: workArea.x + 20,
    y,
    width: CORNER_WIDTH,
    height: CORNER_HEIGHT
  };
}

function positionCorner() {
  if (!corner || corner.isDestroyed()) return;
  corner.setBounds(cornerBounds());
}

function shouldShowCorner() {
  if (!settings || settings.cornerEnabled !== true) return false;
  // on-demand: only show while the main window is open
  if (!win || win.isDestroyed()) return false;
  return mainShown;
}

function syncCornerVisibility() {
  if (!cornerReady || !corner || corner.isDestroyed()) return;
  if (!shouldShowCorner()) {
    if (corner.isVisible()) corner.hide();
    return;
  }
  positionCorner();
  if (!corner.isVisible()) corner.showInactive();
}

function hideCorner() {
  if (corner && !corner.isDestroyed() && corner.isVisible()) corner.hide();
}

function createCorner() {
  if (corner && !corner.isDestroyed()) return;
  cornerReady = false;
  corner = new BrowserWindow({
    ...cornerBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: false,
    title: 'صلاتي — مؤشر الصلاة',
    type: 'toolbar',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  corner.loadFile(path.join(__dirname, 'src', 'corner.html'));
  corner.setAlwaysOnTop(true, 'floating');

  corner.once('ready-to-show', () => {
    cornerReady = true;
    syncCornerVisibility();
  });

  corner.on('closed', () => {
    corner = null;
    cornerReady = false;
  });

  corner.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createWindow() {
  const light =
    settings.theme === 'light' ||
    (settings.theme === 'auto' && !nativeTheme.shouldUseDarkColors);
  const startHidden = true;

  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 940,
    minHeight: 660,
    show: false,
    backgroundColor: light ? '#f4f1e8' : '#081410',
    autoHideMenuBar: true,
    title: 'صلاتي — مواقيت الصلاة',
    icon: ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));

  win.once('ready-to-show', () => {
    mainReady = true;
    if (!startHidden) win.show();
    hideWidget();
    setTimeout(() => {
      if (isQuitting) return;
      syncWidgetVisibility();
      syncCornerVisibility();
    }, 300);
  });

  win.on('show', () => {
    mainShown = true;
    widgetDismissed = false;
    hideWidget();
    syncCornerVisibility();
  });
  win.on('hide', () => {
    mainShown = false;
    if (!isQuitting) syncWidgetVisibility();
    syncCornerVisibility();
  });
  win.on('minimize', () => {
    mainShown = false;
    syncWidgetVisibility();
    syncCornerVisibility();
  });
  win.on('restore', () => {
    mainShown = true;
    widgetDismissed = false;
    hideWidget();
    syncCornerVisibility();
  });

  win.on('close', (event) => {
    if (isQuitting) return;
    if (!settings.closeToTray) {
      isQuitting = true;
      setImmediate(() => app.quit());
      return;
    }
    event.preventDefault();
    win.hide();
    showTrayHintOnce();
  });

  win.on('closed', () => {
    win = null;
    mainReady = false;
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });

  win.webContents.on('did-finish-load', () => {
    broadcast('theme:changed', resolveTheme());
    if (SHOW_SCREENSHOTS) {
      captureScreenshots().catch((error) => {
        console.error('فشل التقاط اللقطات:', error);
        app.quit();
      });
    }
  });
}

async function captureScreenshots() {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(2800);
  for (const view of ['home', 'month', 'qibla', 'settings']) {
    await win.webContents.executeJavaScript(
      `document.querySelector('.nav-item[data-view="${view}"]')?.click();`
    );
    await wait(view === 'month' ? 1600 : 900);
    const image = await win.webContents.capturePage();
    fs.writeFileSync(path.join(__dirname, `shot-${view}.png`), image.toPNG());
  }
  app.quit();
}

function resolveTheme() {
  if (settings.theme === 'auto') {
    return nativeTheme.shouldUseDarkColors ? 'dark' : 'light';
  }
  return settings.theme === 'light' ? 'light' : 'dark';
}

function applyTheme() {
  const theme = resolveTheme();
  if (win && !win.isDestroyed()) {
    win.setBackgroundColor(theme === 'light' ? '#f4f1e8' : '#081410');
    broadcast('theme:changed', theme);
  }
}

function applyAutoLaunch() {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: !!settings.autoLaunch,
      path: process.execPath,
      args: ['--hidden']
    });
  } catch (err) {
    console.error('تعذّر تفعيل التشغيل التلقائي:', err.message);
  }
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format();
    return true;
  } catch {
    return false;
  }
}

function sanitizePatch(patch) {
  const clean = {};
  const allowed = [
    'method',
    'madhab',
    'highLatitude',
    'notifications',
    'preAdhanMinutes',
    'sound',
    'customSoundPath',
    'volume',
    'theme',
    'timeFormat',
    'hijriOffset',
    'closeToTray',
    'autoLaunch',
    'widgetEnabled',
    'cornerEnabled'
  ];
  for (const key of allowed) {
    if (patch[key] !== undefined) clean[key] = patch[key];
  }
  if (clean.method && clean.method !== 'auto' && !CalculationMethod[clean.method]) {
    delete clean.method;
  }
  if (clean.madhab && !['shafi', 'hanafi'].includes(clean.madhab)) delete clean.madhab;
  if (clean.highLatitude && !['middle', 'seventh', 'twilight'].includes(clean.highLatitude)) {
    delete clean.highLatitude;
  }
  if (clean.preAdhanMinutes !== undefined) {
    clean.preAdhanMinutes = [0, 5, 10, 15, 20, 30].includes(Number(clean.preAdhanMinutes))
      ? Number(clean.preAdhanMinutes)
      : 0;
  }
  if (clean.sound && !['chime', 'custom', 'none'].includes(clean.sound)) delete clean.sound;
  if (clean.volume !== undefined) clean.volume = clamp(Number(clean.volume) || 0, 0, 1);
  if (clean.theme && !['dark', 'light', 'auto'].includes(clean.theme)) delete clean.theme;
  if (clean.timeFormat && !['24', '12'].includes(String(clean.timeFormat))) delete clean.timeFormat;
  if (clean.hijriOffset !== undefined) clean.hijriOffset = clamp(Number(clean.hijriOffset) || 0, -3, 3);
  if (clean.widgetEnabled !== undefined) clean.widgetEnabled = !!clean.widgetEnabled;
  if (clean.cornerEnabled !== undefined) clean.cornerEnabled = !!clean.cornerEnabled;

  if (patch.location && typeof patch.location === 'object') {
    const loc = patch.location;
    const lat = Number(loc.lat);
    const lng = Number(loc.lng);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      let timezone = typeof loc.timezone === 'string' ? loc.timezone : null;
      if (!timezone || !isValidTimeZone(timezone)) {
        try { timezone = tzlookup(lat, lng); } catch { timezone = 'UTC'; }
      }
      clean.location = {
        name: String(loc.name || 'موقعي').slice(0, 120),
        country: String(loc.country || '').slice(0, 120),
        countryCode: String(loc.countryCode || '').toUpperCase().slice(0, 2),
        lat,
        lng,
        timezone,
        source: ['ip', 'manual', 'search', 'default'].includes(loc.source) ? loc.source : 'manual'
      };
    }
  }
  return clean;
}

function applySettings(patch, options = {}) {
  const clean = sanitizePatch(patch || {});
  const previous = settings;
  settings = deepMerge(settings, clean);
  saveSettings();

  if (clean.location || clean.method !== undefined || clean.madhab) {
    lastTraySignature = '';
  }
  if (clean.autoLaunch !== undefined) applyAutoLaunch();
  if (clean.theme !== undefined) applyTheme();
  if (clean.widgetEnabled !== undefined) {
    if (clean.widgetEnabled) widgetDismissed = false;
    syncWidgetVisibility();
  }
  if (clean.cornerEnabled !== undefined) syncCornerVisibility();
  updateTray(true);
  broadcast('settings:changed', settings);
  return settings;
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Salati/1.0 (Windows desktop prayer times app)',
        Accept: 'application/json'
      }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function reverseGeocode(lat, lng, fallbackCity, fallbackCountry) {
  try {
    const data = await fetchJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&accept-language=ar&zoom=10`,
      6000
    );
    const address = data.address || {};
    const city =
      address.city ||
      address.town ||
      address.village ||
      address.municipality ||
      address.county ||
      fallbackCity;
    const country = address.country || fallbackCountry;
    return { city, country };
  } catch {
    return { city: fallbackCity, country: fallbackCountry };
  }
}

async function detectLocation() {
  let data = null;
  try {
    data = await fetchJson('https://ipwho.is/', 8000);
    if (!data || data.success === false) data = null;
  } catch {
    data = null;
  }

  if (!data) {
    try {
      const fallback = await fetchJson('https://ipapi.co/json/', 8000);
      if (fallback && fallback.latitude) {
        data = {
          city: fallback.city,
          country: fallback.country_name,
          country_code: fallback.country_code,
          latitude: fallback.latitude,
          longitude: fallback.longitude,
          timezone: { id: fallback.timezone }
        };
      }
    } catch {
      data = null;
    }
  }

  if (!data || !Number.isFinite(Number(data.latitude)) || !Number.isFinite(Number(data.longitude))) {
    throw new Error('تعذّر تحديد الموقع تلقائيًا. تحقّق من اتصال الإنترنت أو اختر مدينتك يدويًا.');
  }

  const lat = Number(data.latitude);
  const lng = Number(data.longitude);
  const countryCode = String(data.country_code || '').toUpperCase();
  const geo = await reverseGeocode(lat, lng, data.city || data.region || 'موقعي', data.country || '');
  let timezone = data.timezone?.id || data.timezone || null;
  if (!timezone || !isValidTimeZone(timezone)) {
    try { timezone = tzlookup(lat, lng); } catch { timezone = 'UTC'; }
  }

  return {
    name: geo.city || data.city || 'موقعي',
    country: geo.country || data.country || '',
    countryCode,
    lat,
    lng,
    timezone,
    source: 'ip'
  };
}

async function searchCities(query) {
  const q = String(query || '').trim().slice(0, 100);
  if (q.length < 2) return [];
  const cacheKey = q.toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached.results;

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&accept-language=ar&q=' +
      encodeURIComponent(q);
    const data = await fetchJson(url, 9000);
    if (!Array.isArray(data)) return [];

    const results = [];
    const seen = new Set();
    for (const item of data) {
      const address = item.address || {};
      const name =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        (item.display_name || '').split(',')[0];
      const country = address.country || '';
      const countryCode = String(address.country_code || '').toUpperCase();
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const key = `${name}|${country}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      let timezone = 'UTC';
      try { timezone = tzlookup(lat, lng); } catch { /* ignore */ }
      results.push({
        name,
        country,
        countryCode,
        lat,
        lng,
        timezone,
        source: 'search'
      });
    }
    searchCache.set(cacheKey, { at: Date.now(), results });
    return results;
  } catch {
    return [];
  }
}

function monthData(year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const anchor = monthAnchor(year, month, day);
    days.push({ day, times: calculateForAnchor(anchor) });
  }
  return {
    year,
    month,
    timezone: settings.location.timezone,
    methodId: resolveMethodId(),
    methodLabel: METHOD_LABELS[resolveMethodId()],
    location: { ...settings.location },
    days
  };
}

function registerIpc() {
  ipcMain.handle('settings:get', () => ({
    settings,
    meta: {
      version: app.getVersion(),
      platform: process.platform,
      isPackaged: app.isPackaged,
      theme: resolveTheme(),
      notificationSupported: Notification.isSupported()
    }
  }));

  ipcMain.handle('settings:save', (_event, patch) => {
    const next = applySettings(patch || {});
    return { settings: next };
  });

  ipcMain.handle('settings:reset', () => {
    const location = { ...settings.location };
    const trayHintShown = settings.trayHintShown;
    settings = deepMerge(DEFAULT_SETTINGS, { location, trayHintShown });
    saveSettings();
    applyAutoLaunch();
    applyTheme();
    updateTray(true);
    syncWidgetVisibility();
    broadcast('settings:changed', settings);
    return { settings };
  });

  ipcMain.handle('times:today', () => buildDayPayload());
  ipcMain.handle('times:month', (_event, args) => {
    const year = clamp(Number(args?.year) || new Date().getFullYear(), 1900, 2200);
    const month = clamp(Number(args?.month) || new Date().getMonth() + 1, 1, 12);
    return monthData(year, month);
  });

  ipcMain.handle('qibla:get', () => {
    const coords = new Coordinates(settings.location.lat, settings.location.lng);
    return {
      degrees: Qibla(coords),
      distanceKm: distanceToKaaba(settings.location.lat, settings.location.lng),
      location: { ...settings.location }
    };
  });

  ipcMain.handle('location:detect', async () => {
    const location = await detectLocation();
    return location;
  });

  ipcMain.handle('location:search', async (_event, query) => searchCities(query));

  ipcMain.handle('sound:pick', async () => {
    const result = await dialog.showOpenDialog(win || null, {
      title: 'اختر ملف الأذان',
      properties: ['openFile'],
      filters: [
        { name: 'ملفات صوتية', extensions: ['mp3', 'wav', 'm4a', 'ogg', 'aac', 'opus'] },
        { name: 'كل الملفات', extensions: ['*'] }
      ]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const ext = path.extname(source).toLowerCase() || '.mp3';
    const dir = path.join(app.getPath('userData'), 'sounds');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `adhan${ext}`);
    fs.copyFileSync(source, target);
    return { path: target, url: pathToFileURL(target).href, name: path.basename(source) };
  });

  ipcMain.handle('notify:test', () => {
    const payload = buildDayPayload();
    const ok = showNotification(
      'تجربة التنبيه',
      `هكذا سيصلك تنبيه الصلاة القادمة: ${payload.next.name} ${formatShortTime(payload.next.timeISO)}`
    );
    playAdhan('pre', payload.next.key, payload.next.timeISO, { test: true });
    return ok;
  });

  ipcMain.handle('month:export', async (_event, payload) => {
    const { canceled, filePath } = await dialog.showSaveDialog(win || null, {
      title: 'تصدير جدول المواقيت',
      defaultPath: path.join(app.getPath('downloads'), payload?.filename || 'salati.csv'),
      filters: [{ name: 'ملف CSV', extensions: ['csv'] }]
    });
    if (canceled || !filePath) return { ok: false, canceled: true };
    fs.writeFileSync(filePath, `\uFEFF${payload?.content || ''}`, 'utf8');
    return { ok: true, path: filePath };
  });

  ipcMain.handle('app:open', (_event, view) => {
    showWindow(view);
    return true;
  });

  ipcMain.handle('app:open-external', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('app:check-update', async () => {
    const current = app.getVersion();
    const githubUrl = 'https://github.com/JKR1BEY?tab=repositories';
    let latest = null;
    let releaseUrl = githubUrl;
    let hasUpdate = false;
    // Try to find a salati repo with releases
    const candidateRepos = ['salati', 'Salati', 'صلاتي'];
    for (const repo of candidateRepos) {
      try {
        const res = await fetch(`https://api.github.com/repos/JKR1BEY/${repo}/releases/latest`, {
          headers: { 'User-Agent': 'Salati/1.0', Accept: 'application/vnd.github+json' }
        });
        if (!res.ok) continue;
        const data = await res.json();
        if (data && data.tag_name) {
          latest = String(data.tag_name).replace(/^v/i, '');
          releaseUrl = data.html_url || `https://github.com/JKR1BEY/${repo}/releases`;
          break;
        }
      } catch {
        /* ignore */
      }
    }
    if (latest) {
      hasUpdate = compareVersions(latest, current) > 0;
    }
    return { current, latest, hasUpdate, releaseUrl, githubUrl };
  });

  ipcMain.handle('widget:dismiss', () => {
    widgetDismissed = true;
    hideWidget();
    return true;
  });

  ipcMain.handle('app:open-data', () => shell.openPath(app.getPath('userData')));
  ipcMain.handle('app:quit', () => {
    isQuitting = true;
    app.quit();
  });
}

function createTray() {
  let image = nativeImage.createFromPath(TRAY_PATH);
  if (process.platform === 'win32') {
    image = image.resize({ width: 16, height: 16 });
  }
  tray = new Tray(image);
  tray.setToolTip('صلاتي — مواقيت الصلاة');
  tray.setContextMenu(buildTrayMenu());
  tray.on('click', () => showWindow());
  tray.on('double-click', () => showWindow());
}

async function firstRunDetection() {
  if (!settings || settings.location.source !== 'default') return;
  try {
    const detected = await detectLocation();
    settings.location = { ...detected };
    saveSettings();
    lastTraySignature = '';
    updateTray(true);
    broadcast('settings:changed', settings);
    broadcast('toast', { message: `تم تحديد موقعك تلقائيًا: ${detected.name}` });
  } catch {
    /* keep fallback silently */
  }
}

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    showWindow();
  });

  app.whenReady().then(() => {
    app.setAppUserModelId('app.salati.prayer');
    settings = loadSettings();
    registerIpc();
    createTray();
    createWindow();
    createWidget();
    createCorner();

    updateTray(true);
    setTimeout(firstRunDetection, 900);

    schedulerTimer = setInterval(checkNotifications, 15_000);
    trayTimer = setInterval(() => updateTray(false), 30_000);
    setTimeout(checkNotifications, 2500);

    for (const eventName of ['display-metrics-changed', 'display-added', 'display-removed']) {
      screen.on(eventName, () => positionWidget());
    }

    nativeTheme.on('updated', () => {
      if (settings.theme === 'auto') {
        applyTheme();
      }
    });

    app.on('activate', () => {
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) return;
    win.focus();
  });
  });

  app.on('before-quit', () => {
    isQuitting = true;
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !settings.closeToTray) {
      app.quit();
    }
  });
}
