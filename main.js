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
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const {
  Coordinates,
  PrayerTimes,
  CalculationMethod,
  Madhab,
  HighLatitudeRule
} = require('adhan');
const tzlookup = require('tz-lookup');

const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');
const TRAY_PATH = path.join(__dirname, 'assets', 'tray.png');
const SHOW_SCREENSHOTS = process.argv.includes('--screenshots');
const TASKBAR_WIDTH = 320;
const TASKBAR_HEIGHT_FALLBACK = 48;
const TASKBAR_MARGIN = 4;
const POPUP_WIDTH = 392;
const POPUP_HEIGHT = 480;
const TITLEBAR_HEIGHT = 36;
const WINDOW_CHROME = {
  dark: { bg: '#07130f', symbol: '#d6b25e' },
  gold: { bg: '#080807', symbol: '#d9af4b' },
  light: { bg: '#f1ede2', symbol: '#a1762a' }
};

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const SOUND_FILES = {
  makkah: 'makkah.mp3',
  madinah: 'madinah.mp3',
  abdulbasit: 'abdulbasit.mp3'
};
const VALID_SOUNDS = [...Object.keys(SOUND_FILES), 'custom', 'none'];
const PRE_ADHAN_OPTIONS = [0, 5, 10, 15, 20];
// إزاحة بدء شاشة التركيز بالنسبة للأذان: موجب = قبل، صفر = معه، سالب = بعده.
const FOCUS_LEAD_OPTIONS = [30, 25, 20, 15, 10, 5, 0, -5, -10, -15, -20, -25, -30];
const FOCUS_DURATION_OPTIONS = [5, 10, 15, 30];

function soundAssetPath(sound) {
  const file = SOUND_FILES[sound];
  return file ? path.join(__dirname, 'assets', 'sounds', file) : null;
}

function soundAssetUrl(sound) {
  const filePath = soundAssetPath(sound);
  return filePath && fs.existsSync(filePath) ? pathToFileURL(filePath).href : null;
}
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
  preAdhanMinutes: 5,
  focusEnabled: false,
  focusLeadMinutes: 5,
  focusDurationMinutes: 5,
  focusDismissOnAdhan: true,
  focusCloseNotice: false,
  sound: 'makkah',
  customSoundPath: null,
  volume: 0.85,
  theme: 'dark',
  timeFormat: '12',
  timeFormatDefaultMigrated: false,
  hijriOffset: 0,
  closeToTray: true,
  autoLaunch: false,
  taskbarWidgetEnabled: true,
  popupPosition: 100,
  taskbarPosition: 100,
  trayHintShown: false,
  autoUpdateCheck: true
};

let settings = null;
let settingsPath = null;
let win = null;

function applyWindowChrome(theme) {
  const chrome = WINDOW_CHROME[theme] || WINDOW_CHROME.dark;
  if (!win || win.isDestroyed()) return;
  win.setBackgroundColor(chrome.bg);
  if (process.platform !== 'darwin' && typeof win.setTitleBarOverlay === 'function') {
    win.setTitleBarOverlay({
      color: chrome.bg,
      symbolColor: chrome.symbol,
      height: TITLEBAR_HEIGHT
    });
  }
}

let taskbar = null;
let tray = null;
let isQuitting = false;
let updaterState = { status: 'idle', current: null, version: null, notes: null, percent: 0, error: null };
let updaterConfigured = false;
let oneClickRunning = false;
let updateCheckRunning = false;
let taskbarProbe = null;
let taskbarProbeRestartTimer = null;
let taskbarNativeVisible = null;
let taskbarSystemLight = null;
let popup = null;
let popupReady = false;
let popupOpen = false;
let popupWarm = false;
let popupOpening = false;
let popupPendingShow = false;
let popupBlurTimer = null;
let taskbarZoomValue = 0;
let displaySyncTimer = null;
// screen.getPrimaryDisplay()/getDisplayMatching() are synchronous native calls.
// Cache them and refresh only on real display changes so the probe and the
// safety net never compete with the widget click path on the main thread.
let cachedPrimaryDisplay = null;
let lastProbeKey = '';
// Geometry comes from the docked appbar rect, never from the sliding auto-hide
// rect. Keeping it stable stops the widget from moving or resizing on every
// probe sample while Windows animates the taskbar.
let taskbarDockThickness = TASKBAR_HEIGHT_FALLBACK;
let taskbarEdge = 'bottom';
let focusFullScreenActive = false;
let focusRestoreFullScreen = false;
let focusGlassWin = null;
let focusGlassActive = false;
let focusLastPayload = null;
let focusTexts = { verse: '—', verseRef: '—', hadith: '—', hadithRef: '—', prayer: '—' };
let focusSession = 0;
let focusCloseNoticeTimer = null;
let focusNoticeCount = 0;
let lastFocusHideReason = '';
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

function normalizePreAdhanMinutes(value) {
  const minutes = Number(value);
  return PRE_ADHAN_OPTIONS.includes(minutes) ? minutes : DEFAULT_SETTINGS.preAdhanMinutes;
}

function normalizeFocusLeadMinutes(value) {
  const minutes = Number(value);
  return FOCUS_LEAD_OPTIONS.includes(minutes) ? minutes : DEFAULT_SETTINGS.focusLeadMinutes;
}

function normalizeFocusDurationMinutes(value) {
  const minutes = Number(value);
  return FOCUS_DURATION_OPTIONS.includes(minutes) ? minutes : DEFAULT_SETTINGS.focusDurationMinutes;
}

function normalizePopupPosition(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.popupPosition;
  return clamp(Math.round(number), 0, 100);
}

function normalizeTaskbarPosition(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_SETTINGS.taskbarPosition;
  return clamp(Math.round(number), 0, 100);
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
  merged.preAdhanMinutes = normalizePreAdhanMinutes(merged.preAdhanMinutes);
  merged.focusEnabled = !!merged.focusEnabled;
  merged.focusLeadMinutes = normalizeFocusLeadMinutes(merged.focusLeadMinutes);
  merged.focusDurationMinutes = normalizeFocusDurationMinutes(merged.focusDurationMinutes);
  merged.focusDismissOnAdhan = merged.focusDismissOnAdhan !== false;
  merged.focusCloseNotice = !!merged.focusCloseNotice;
  // Migrate the short-lived four-value popup settings into one simple slider.
  if (merged.popupPosition === undefined) {
    if (merged.popupAlign === 'center') {
      merged.popupPosition = 50;
    } else if (merged.popupAlign === 'right') {
      merged.popupPosition = 0;
    } else {
      const legacyOffset = Number(merged.popupOffsetX);
      merged.popupPosition = Number.isFinite(legacyOffset)
        ? clamp(Math.round(100 - (legacyOffset / 160) * 100), 0, 100)
        : DEFAULT_SETTINGS.popupPosition;
    }
  }
  merged.popupPosition = normalizePopupPosition(merged.popupPosition);
  merged.taskbarPosition = normalizeTaskbarPosition(merged.taskbarPosition);
  delete merged.popupAlign;
  delete merged.popupSide;
  delete merged.popupOffsetX;
  delete merged.popupOffsetY;
  if (!['12', '24'].includes(String(merged.timeFormat))) merged.timeFormat = '12';
  if (!merged.timeFormatDefaultMigrated) {
    merged.timeFormat = '12';
    merged.timeFormatDefaultMigrated = true;
  }
  delete merged.trayStatus;
  delete merged.collapseLocationSection;
  if (!VALID_SOUNDS.includes(merged.sound) || (merged.sound === 'custom' && !merged.customSoundPath)) {
    merged.sound = DEFAULT_SETTINGS.sound;
  }
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
  for (const target of [win, taskbar, popup]) {
    if (target && !target.isDestroyed()) {
      target.webContents.send(channel, payload);
    }
  }
}

function normalizeReleaseNotes(notes) {
  if (!notes) return '';
  if (Array.isArray(notes)) {
    return notes
      .map((item) => (typeof item === 'string' ? item : item?.note || ''))
      .filter(Boolean)
      .join('\n');
  }
  return String(notes);
}

function setUpdaterState(patch) {
  updaterState = { ...updaterState, current: app.getVersion(), ...patch };
  broadcast('updater:state', updaterState);
}

function configureUpdater() {
  if (updaterConfigured) return;
  updaterConfigured = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowPrerelease = false;

  if (!app.isPackaged) {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'JKR1BEY',
      repo: 'Salati',
      releaseType: 'release'
    });
  }

  autoUpdater.on('checking-for-update', () => {
    setUpdaterState({ status: 'checking', error: null });
  });
  autoUpdater.on('update-available', (info) => {
    setUpdaterState({
      status: 'available',
      version: info?.version || null,
      notes: normalizeReleaseNotes(info?.releaseNotes),
      percent: 0,
      error: null
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    setUpdaterState({
      status: 'up-to-date',
      version: info?.version || app.getVersion(),
      notes: null,
      percent: 0,
      error: null
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    setUpdaterState({
      status: 'downloading',
      percent: Math.round(progress?.percent || 0),
      transferred: progress?.transferred || 0,
      total: progress?.total || 0,
      error: null
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setUpdaterState({
      status: 'ready',
      version: info?.version || null,
      notes: normalizeReleaseNotes(info?.releaseNotes),
      percent: 100,
      error: null
    });
  });
  autoUpdater.on('error', (error) => {
    setUpdaterState({
      status: 'error',
      error: String(error?.message || error || 'Unknown updater error')
    });
  });
}

async function waitForUpdaterStatus(targets, timeoutMs = 10000) {
  const started = Date.now();
  const wanted = Array.isArray(targets) ? targets : [targets];
  while (Date.now() - started < timeoutMs) {
    if (wanted.includes(updaterState.status)) return updaterState.status;
    if (updaterState.status === 'error') return null;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

async function checkForUpdatesOnce() {
  if (updateCheckRunning) return updaterState.status;
  updateCheckRunning = true;
  try {
    await autoUpdater.checkForUpdates();
    return updaterState.status;
  } finally {
    updateCheckRunning = false;
  }
}

function launchSilentInstaller(installerPath) {
  setUpdaterState({ status: 'installing', error: null });
  isQuitting = true;
  setTimeout(() => {
    try {
      const child = spawn(installerPath, ['/S'], {
        detached: true,
        windowsHide: true,
        creationflags: process.platform === 'win32' ? 0x08000000 : 0,
        stdio: 'ignore'
      });
      child.unref();
      app.quit();
    } catch (error) {
      isQuitting = false;
      setUpdaterState({ status: 'error', error: String(error?.message || error) });
    }
  }, 150);
  return true;
}

async function downloadReleaseSilently(releaseUrl, version) {
  const match = /github\.com\/([^/]+)\/([^/]+)\/releases/i.exec(releaseUrl || '');
  const owner = match ? match[1] : 'JKR1BEY';
  const repo = match ? match[2] : 'Salati';
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/releases/latest`, {
    headers: { 'User-Agent': 'Salati/1.0', Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`GitHub release lookup failed (${res.status})`);
  const data = await res.json();
  const wantedName = `Salati-Setup-${String(version).replace(/^v/i, '')}.exe`;
  const asset = (data.assets || []).find((item) => item.name === wantedName)
    || (data.assets || []).find((item) => /^Salati-Setup-.*\.exe$/i.test(item.name || ''));
  if (!asset || !asset.browser_download_url) throw new Error('No installer asset found in the GitHub release.');

  setUpdaterState({ status: 'downloading', version, percent: 0, error: null });
  const download = await fetch(asset.browser_download_url, {
    headers: { 'User-Agent': 'Salati/1.0' }
  });
  if (!download.ok || !download.body) throw new Error(`Installer download failed (${download.status})`);
  const total = Number(download.headers.get('content-length')) || 0;
  const target = path.join(app.getPath('temp'), path.basename(asset.name || wantedName));
  const file = fs.createWriteStream(target);
  const reader = download.body.getReader();
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.length;
      if (!file.write(value)) await new Promise((resolve) => file.once('drain', resolve));
      if (total) setUpdaterState({ percent: Math.min(100, Math.round((received * 100) / total)) });
    }
    await new Promise((resolve, reject) => {
      file.once('error', reject);
      file.end(resolve);
    });
  } catch (error) {
    file.destroy();
    throw error;
  } finally {
    if (typeof reader.releaseLock === 'function') reader.releaseLock();
  }
  setUpdaterState({ status: 'ready', version, percent: 100, error: null });
  return launchSilentInstaller(target);
}

async function handleUpdateFailure(error) {
  try {
    const fallback = await checkGitHubReleasesFallback();
    if (fallback.hasUpdate) return await downloadReleaseSilently(fallback.releaseUrl, fallback.latest);
  } catch (fallbackError) {
    error = fallbackError || error;
  }
  setUpdaterState({ status: 'error', error: String(error?.message || error || 'Update failed') });
  return false;
}

function applyPreparedUpdate() {
  setUpdaterState({ status: 'installing', error: null });
  isQuitting = true;
  // One renderer paint is enough; keep the handoff fast and lock-free.
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(true, true);
    } catch (error) {
      setUpdaterState({ status: 'error', error: String(error?.message || error) });
    }
  }, 150);
  return true;
}

async function runOneClickUpdate() {
  configureUpdater();
  if (oneClickRunning) return true;
  if (updaterState.status === 'downloading' || updaterState.status === 'installing') return true;

  oneClickRunning = true;
  try {
    // A downloaded update is the only state where a fresh check is pointless.
    if (updaterState.status === 'ready') return applyPreparedUpdate();

    setUpdaterState({ status: 'checking', error: null });
    let status;
    try {
      status = await checkForUpdatesOnce();
    } catch (error) {
      return await handleUpdateFailure(error);
    }
    if (status === 'up-to-date') return false;
    if (status === 'error') return await handleUpdateFailure(new Error(updaterState.error || 'Update check failed'));

    if (status !== 'available' && status !== 'ready') {
      status = await waitForUpdaterStatus(['available', 'ready'], 8000);
    }
    if (!status) return await handleUpdateFailure(new Error('Update check did not report an available release.'));

    if (status === 'available') {
      try {
        setUpdaterState({ status: 'downloading', percent: 0, error: null });
        await autoUpdater.downloadUpdate();
      } catch (error) {
        return await handleUpdateFailure(error);
      }
      const ready = await waitForUpdaterStatus('ready', 30000);
      if (!ready) return await handleUpdateFailure(new Error('Update download did not complete.'));
    }
    return applyPreparedUpdate();
  } finally {
    oneClickRunning = false;
  }
}

async function checkGitHubReleasesFallback() {
  const current = app.getVersion();
  const githubUrl = 'https://github.com/JKR1BEY/Salati/releases';
  let latest = null;
  let releaseUrl = githubUrl;
  for (const repo of ['Salati', 'salati']) {
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
      /* offline or rate limited — keep the manual link */
    }
  }
  return {
    current,
    latest,
    hasUpdate: latest ? compareVersions(latest, current) > 0 : false,
    releaseUrl,
    githubUrl
  };
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

function formatTime(iso, timeZone = settings.location.timezone, hour12 = String(settings.timeFormat ?? '12') !== '24') {
  if (!iso) return '—';
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: hour12 ? 'numeric' : '2-digit',
      minute: '2-digit',
      ...(hour12 ? { hour12: true } : { hourCycle: 'h23' })
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === 'hour')?.value || '--';
    const minute = parts.find((part) => part.type === 'minute')?.value || '--';
    return `${hour}:${minute}`;
  } catch {
    return '—';
  }
}

function formatShortTime(iso) {
  return formatTime(iso);
}

function formatCountdown(iso) {
  if (!iso) return '';
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes <= 0) return 'الآن';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours > 0 && rest > 0) return `${hours}س ${rest}د`;
  if (hours > 0) return `${hours}س`;
  return `${rest}د`;
}

function trayCityLabel() {
  const name = String(settings.location.name || '');
  return name.length > 32 ? `${name.slice(0, 30)}…` : name;
}

function trayPrayerSummary(payload) {
  const p = payload || buildDayPayload();
  const currentName = p.next.prevName || '—';
  const nextName = p.next.tomorrow ? `${p.next.name} (غدًا)` : p.next.name;
  const nextTime = formatShortTime(p.next.timeISO);
  const countdown = formatCountdown(p.next.timeISO);
  const countdownLabel = countdown === 'الآن' ? 'الآن' : `متبقي ${countdown}`;
  return {
    currentName,
    nextName,
    nextTime,
    countdown,
    tooltipLine: `الحالية: ${currentName} · القادمة: ${nextName} ${nextTime} (${countdownLabel})`,
    menuNext: `القادمة: ${nextName} ${nextTime} — ${countdownLabel}`
  };
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

function notificationTimeText(iso) {
  return `${formatTime(iso)} — ${settings.location.name}`;
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
    soundUrl: soundAssetUrl(settings.sound),
    customUrl,
    volume: settings.volume,
    ...extra
  };
}

function playAdhan(kind, prayerKey, timeISO, extra = {}) {
  broadcast('adhan:play', adhanPayload(kind, prayerKey, timeISO, extra));
}

function checkNotifications() {
  if (!settings) return;
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

    if (settings.notifications) {
      const preMinutes = normalizePreAdhanMinutes(settings.preAdhanMinutes);
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

    // شاشة التركيز مستقلة عن تنبيهات الصلاة، وتعمل حتى لو كانت التنبيهات مكتومة.
    // المعاينة لا تخضع لجدول الأذان الحي كي لا تُلغى تنبيهاتها أو تُستبدل أثناء الاختبار.
    if (settings.focusEnabled && !focusLastPayload?.preview) {
      const leadMinutes = normalizeFocusLeadMinutes(settings.focusLeadMinutes);
      // موجب = قبل الأذان، صفر = معه، سالب = بعده (adhan - leadMinutes).
      const focusStartMs = adhanMs - leadMinutes * 60_000;
      const focusId = `${payload.dateKey}:${key}:focus:${leadMinutes}`;
      if (now >= focusStartMs && now - focusStartMs < 90_000 && !notified.has(focusId)) {
        notified.add(focusId);
        showFocusGlass({
          prayerKey: key,
          prayerName: PRAYER_NAMES[key] || '',
          timeISO: iso,
          leadMinutes,
          durationMinutes: normalizeFocusDurationMinutes(settings.focusDurationMinutes),
          dismissOnAdhan: settings.focusDismissOnAdhan !== false && leadMinutes > 0
        }, payload);
      }

      // الإخفاء عند الأذان يخصّ البداية قبل الأذان فقط؛ عنده أو بعده تنتهي بالمدة.
      if (settings.focusDismissOnAdhan !== false && leadMinutes > 0) {
        const focusHideId = `${payload.dateKey}:${key}:focus-hide`;
        if (now >= adhanMs && now - adhanMs < 90_000 && !notified.has(focusHideId)) {
          notified.add(focusHideId);
          hideFocusGlass('adhan');
        }
      }
    }
  }
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
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
  if (!tray || !settings) return;
  try {
    const payload = buildDayPayload();
    const showStatus = settings.taskbarWidgetEnabled !== false;
    const summary = showStatus ? trayPrayerSummary(payload) : null;
    const signature = [
      payload.dateKey,
      payload.next.key,
      payload.next.timeISO,
      settings.location.name,
      settings.notifications,
      settings.taskbarWidgetEnabled,
      settings.sound
    ].join('|');
    const tooltip = showStatus
      ? `صلاتي — ${trayCityLabel()}\n${summary.tooltipLine}`
      : `صلاتي — ${trayCityLabel()}`;

    tray.setToolTip(tooltip);

    if (!force && signature === lastTraySignature) return;
    lastTraySignature = signature;
    // Push the fresh day to the widget/menu directly so they never have to poll
    // the main process with an expensive times:today IPC round-trip.
    broadcast('day:changed', payload);
    tray.setContextMenu(buildTrayMenu());
  } catch (err) {
    console.error('تعذّر تحديث شريط المهام:', err.message);
  }
}

function showWindow(view) {
  hidePopup();
  if (focusGlassActive) hideFocusGlass('show-window');
  if (!win) {
    createWindow();
    return;
  }
  if (!focusFullScreenActive) {
    try { win.restore(); } catch {}
  }
  win.show();
  win.focus();
  if (view && ['home', 'month', 'settings'].includes(view)) {
    broadcast('navigate', view);
  }
}

// شاشة التركيز تعمل بملء الشاشة داخل نافذة صلاتي، ثم تعيد النافذة
// إلى حالتها السابقة فور الإغلاق. لا نغيّر إعدادات العرض على مستوى النظام،
// لذا تبقى أداة شريط المهام (نافذة منفصلة دائمة الظهور) مستجابة.
function setFocusFullScreen(active) {
  if (!win || win.isDestroyed()) return;
  if (active) {
    if (focusFullScreenActive) return;
    focusRestoreFullScreen = win.isFullScreen();
    focusFullScreenActive = true;
    try { win.setFullScreen(true); } catch { focusFullScreenActive = false; }
    return;
  }
  if (!focusFullScreenActive) return;
  focusFullScreenActive = false;
  try { win.setFullScreen(focusRestoreFullScreen); } catch { /* ignore */ }
}

// الاسم الفعّال للصلاة من المواقيت نفسها (نفس منطق الواجهة الرئيسية).
function currentPrayerName(day) {
  const times = day?.times || {};
  const now = Date.now();
  let key = null;
  let latest = -Infinity;
  for (const candidate of ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha']) {
    const ms = Date.parse(times[candidate]);
    if (Number.isFinite(ms) && ms <= now && ms > latest) {
      latest = ms;
      key = candidate;
    }
  }
  if (key && PRAYER_NAMES[key]) return PRAYER_NAMES[key];
  const prev = day?.next?.prevKey;
  return (prev && PRAYER_NAMES[prev]) || 'بين الصلوات';
}

// نافذة زجاجية شفافة مستقلة: سطح المكتب يظهر من خلالها مشوّشاً ومُعتمماً
// عبر acrylic الأصلية على Windows + طبقة backdrop-filter في الصفحة.
// نُبقيها مخفية ومجهّزة مسبقاً حتى يكن الظهور فورياً بلا إنشاء نافذة على المسار.
function createFocusGlassWindow() {
  if (focusGlassWin && !focusGlassWin.isDestroyed()) return focusGlassWin;
  const anchor = win && !win.isDestroyed() ? win.getBounds() : null;
  const display = anchor ? screen.getDisplayMatching(anchor) : screen.getPrimaryDisplay();
  const bounds = display.bounds;
  focusGlassWin = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    resizable: false,
    movable: false,
    fullscreenable: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false
    }
  });
  if (typeof focusGlassWin.setBackgroundMaterial === 'function') {
    try { focusGlassWin.setBackgroundMaterial('acrylic'); } catch { /* older Windows */ }
  }
  // أقل مستوى من always-on-top كي تبقى أداة شريط المهام فوق الشاشة وقابلة للنقر.
  try { focusGlassWin.setAlwaysOnTop(true, 'screen-saver', 0); } catch { /* ignore */ }
  focusGlassWin.loadFile(path.join(__dirname, 'src', 'focus.html'));
  focusGlassWin.webContents.on('did-finish-load', () => {
    sendToFocusGlass('theme:changed', resolveTheme());
  });
  focusGlassWin.on('closed', () => {
    focusGlassWin = null;
    if (focusGlassActive) {
      focusGlassActive = false;
      if (win && !win.isDestroyed() && !win.isVisible()) win.show();
    }
  });
  return focusGlassWin;
}

function sendToFocusGlass(channel, payload) {
  if (!focusGlassWin || focusGlassWin.isDestroyed()) return;
  const target = focusGlassWin;
  if (target.webContents.isLoadingMainFrame()) {
    target.webContents.once('did-finish-load', () => {
      if (!target.isDestroyed()) target.webContents.send(channel, payload);
    });
  } else {
    target.webContents.send(channel, payload);
  }
}

function scheduleFocusCloseNotice(closeAt, session) {
  clearTimeout(focusCloseNoticeTimer);
  focusCloseNoticeTimer = null;
  if (!settings.focusCloseNotice || !Number.isFinite(closeAt)) return;
  const delay = closeAt - Date.now() - 30_000;
  if (delay <= 0) return;
  focusCloseNoticeTimer = setTimeout(() => {
    focusCloseNoticeTimer = null;
    if (focusSession !== session || !focusGlassActive) return;
    const prayer = focusLastPayload?.currentPrayerName || focusLastPayload?.prayerName || '';
    const shown = showNotification(
      'شاشة التركيز تنتهي بعد ٣٠ ثانية',
      prayer
        ? `تنتهي شاشة التركيز لصلاة ${prayer} بعد ٣٠ ثانية.`
        : 'سيعود التطبيق إلى الواجهة الطبيعية بعد ٣٠ ثانية.'
    );
    if (shown) focusNoticeCount += 1;
  }, delay);
}

function showFocusGlass(payload, day) {
  const adhanMs = Date.parse(payload.timeISO || '');
  const requestedDuration = Number(payload.durationMinutes ?? settings.focusDurationMinutes);
  // المعاينة تسمح بمدة قصيرة لاختبار تنبيه الـ ٣٠ ثانية، وبقية المسارات تستخدم الخيارات الثابتة.
  const durationMinutes = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? (payload.preview ? clamp(requestedDuration, 0.1, 30) : normalizeFocusDurationMinutes(requestedDuration))
    : normalizeFocusDurationMinutes(settings.focusDurationMinutes);
  const endsAt = Date.now() + durationMinutes * 60_000;
  // الإخفاء عند الأذان له معنى فقط حين تبدأ الشاشة قبل الأذان فعلاً.
  const dismissAtAdhan =
    payload.dismissOnAdhan !== false && Number.isFinite(adhanMs) && adhanMs > Date.now();
  const closeAt = dismissAtAdhan ? Math.min(endsAt, adhanMs) : endsAt;
  const session = ++focusSession;

  focusLastPayload = {
    ...payload,
    leadMinutes: normalizeFocusLeadMinutes(payload.leadMinutes ?? settings.focusLeadMinutes),
    durationMinutes,
    dismissOnAdhan: dismissAtAdhan,
    currentPrayerName: currentPrayerName(day),
    timeZone: day?.timezone,
    timeFormat: settings.timeFormat
  };
  clearTimeout(focusCloseNoticeTimer);
  focusCloseNoticeTimer = null;
  // النافذة الرئيسية تتحدّث أيضاً (احتياطي إن تعذّرت النافذة الشفافة).
  broadcast('focus:show', focusLastPayload);
  try {
    createFocusGlassWindow();
    if (!focusGlassWin) throw new Error('focus glass window unavailable');
    if (win && !win.isDestroyed() && !win.isMinimized() && win.isVisible()) win.hide();
    sendToFocusGlass('theme:changed', resolveTheme());
    sendToFocusGlass('focus:show', focusLastPayload);
    sendToFocusGlass('focus:texts', focusTexts);
    focusGlassWin.show();
    focusGlassWin.focus();
    focusGlassActive = true;
    scheduleFocusCloseNotice(closeAt, session);
    return true;
  } catch {
    lastFocusHideReason = 'setup-error';
    focusSession += 1;
    showWindow();
    setFocusFullScreen(true);
    return false;
  }
}

function hideFocusGlass(reason = 'manual') {
  lastFocusHideReason = reason || 'manual';
  clearTimeout(focusCloseNoticeTimer);
  focusCloseNoticeTimer = null;
  focusSession += 1;
  // انتهت المعاينة؛ يُعاد الجدول الحي للعمل من جديد بعدها.
  if (focusLastPayload?.preview) focusLastPayload = null;
  if (focusGlassActive && focusGlassWin && !focusGlassWin.isDestroyed()) {
    focusGlassActive = false;
    focusGlassWin.hide();
  }
  setFocusFullScreen(false);
  if (win && !win.isDestroyed() && !win.isVisible()) win.show();
  broadcast('focus:hide', { reason });
}

function showTrayHintOnce() {
  if (settings.trayHintShown || !tray) return;
  settings.trayHintShown = true;
  saveSettings();
  try {
    tray.displayBalloon({
      title: 'صلاتي يعمل في الخلفية',
      content:
        settings.taskbarWidgetEnabled !== false
          ? 'أداة شريط المهام تعرض الصلاة الحالية والقادمة واضغط عليها لفتح صلاتي. لإيقاف التطبيق نهائيًا استخدم قائمة شريط المهام.'
          : 'ستصلك تنبيهات الصلاة حتى بعد إغلاق النافذة. لإيقاف التطبيق نهائيًا استخدم قائمة شريط المهام.',
      iconType: 'info'
    });
  } catch {
    /* ignore */
  }
}

let taskbarReady = false;
let mainReady = false;

function taskbarProbePath() {
  const script = path.join(__dirname, 'scripts', 'taskbar-watch.ps1');
  if (!app.isPackaged) return script;
  return script.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

function stopTaskbarProbe() {
  clearTimeout(taskbarProbeRestartTimer);
  taskbarProbeRestartTimer = null;
  const probe = taskbarProbe;
  taskbarProbe = null;
  taskbarNativeVisible = null;
  lastProbeKey = '';
  taskbarDockThickness = TASKBAR_HEIGHT_FALLBACK;
  taskbarEdge = 'bottom';
  if (probe) {
    try { probe.kill(); } catch { /* ignore */ }
  }
}

function primaryDisplay() {
  if (!cachedPrimaryDisplay) cachedPrimaryDisplay = screen.getPrimaryDisplay();
  return cachedPrimaryDisplay;
}

// Shell_TrayWnd is the real Windows taskbar. Watching its rectangle instead of
// guessing from work areas lets the bar follow auto-hide, fullscreen apps and
// Explorer restarts exactly.
function applyTaskbarProbe(state) {
  // The helper emits only real state changes; a signature guard prevents any
  // duplicate reading from triggering native work.
  const key = [
    state.ok, state.visible, state.autoHide, state.left, state.top,
    state.right, state.bottom, state.dockOk, state.dockTop,
    state.dockBottom, state.dockLeft, state.dockRight, state.systemLight
  ].join('|');
  if (key === lastProbeKey) return;
  lastProbeKey = key;

  const display = primaryDisplay();
  const bounds = display.bounds;
  const left = Number(state.left) || 0;
  const top = Number(state.top) || 0;
  const right = Number(state.right) || 0;
  const bottom = Number(state.bottom) || 0;
  const overlapX = Math.max(0, Math.min(right, bounds.x + bounds.width) - Math.max(left, bounds.x));
  const overlapY = Math.max(
    0,
    Math.min(bottom, bounds.y + bounds.height) - Math.max(top, bounds.y)
  );

  // ABM_GETTASKBARPOS is in physical pixels; scaleFactor converts it to the
  // DIP coordinates used by BrowserWindow and the probe's virtualised rect.
  // Keep this docked geometry fixed while auto-hide slides, so the widget
  // never moves, resizes or changes zoom on every probe sample.
  const dockEdge = Number(state.dockEdge);
  if (state.dockOk && (dockEdge === 1 || dockEdge === 3)) {
    const dockThicknessPx = Number(state.dockBottom) - Number(state.dockTop);
    if (dockThicknessPx >= 24 && dockThicknessPx <= 240) {
      taskbarDockThickness = clamp(
        Math.round(dockThicknessPx / (display.scaleFactor || 1)),
        24,
        120
      );
      taskbarEdge = dockEdge === 1 ? 'top' : 'bottom';
    }
  }

  const usable = !!state.ok && !!state.visible && overlapX > 4;
  let visible = false;
  if (usable) {
    // IsWindowVisible() stays true for a hidden auto-hide bar, leaving only a
    // thin sliver. A cursor parked at the edge makes Windows repeatedly slide
    // the bar up and down; two thresholds stop show/hide thrashing without any
    // timer or extra IPC on the click path.
    const showAt = Math.max(14, Math.round(taskbarDockThickness * 0.5));
    const hideAt = Math.max(6, Math.round(taskbarDockThickness * 0.18));
    visible = taskbarNativeVisible === true ? overlapY > hideAt : overlapY >= showAt;
  }

  const wasVisible = taskbarNativeVisible;
  taskbarNativeVisible = visible;

  // Windows can use a light taskbar independently from app theme, so mirror the
  // actual taskbar colour (SystemUsesLightTheme) instead of prefers-color-scheme.
  const light = state.systemLight === true;
  if (taskbarSystemLight !== light) {
    taskbarSystemLight = light;
    broadcast('taskbar:appearance', { light });
  }

  // Only a real state flip touches the native window. Sliding rect changes are
  // deliberately ignored for geometry; that was the up/down bounce source.
  if (wasVisible !== visible) syncTaskbarVisibility();
}

function startTaskbarProbe() {
  if (process.platform !== 'win32' || taskbarProbe || isQuitting) return;
  const script = taskbarProbePath();
  if (!fs.existsSync(script)) return;

  try {
    taskbarProbe = spawn('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy', 'Bypass',
      '-WindowStyle', 'Hidden',
      '-File', script
    ], {
      windowsHide: true,
      creationflags: process.platform === 'win32' ? 0x08000000 : 0,
      stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch {
    taskbarProbe = null;
    return;
  }

  const lines = readline.createInterface({ input: taskbarProbe.stdout });
  lines.on('line', (line) => {
    const text = line.trim();
    if (!text.startsWith('{')) return;
    try {
      applyTaskbarProbe(JSON.parse(text));
    } catch {
      /* ignore malformed probe output */
    }
  });

  const restart = () => {
    taskbarProbe = null;
    // Keep the last known taskbar state and dock geometry until the replacement
    // probe reports; silence is not evidence that the taskbar came back.
    lastProbeKey = '';
    if (isQuitting) return;
    clearTimeout(taskbarProbeRestartTimer);
    taskbarProbeRestartTimer = setTimeout(startTaskbarProbe, 1500);
  };
  taskbarProbe.on('error', restart);
  taskbarProbe.on('exit', restart);
}

function taskbarMetrics() {
  const display = primaryDisplay();
  // Never derive geometry from the sliding Shell_TrayWnd rect: during auto-hide
  // that changes every sample and makes the widget jump up/down and rescale.
  // The docked thickness/edge from ABM_GETTASKBARPOS stay constant instead.
  return {
    display,
    bounds: display.bounds,
    edge: taskbarEdge === 'top' ? 'top' : 'bottom',
    thickness: clamp(taskbarDockThickness, 24, 120)
  };
}

function taskbarBaseBounds() {
  const { bounds, edge, thickness } = taskbarMetrics();
  const height = Math.max(30, Math.min(thickness - TASKBAR_MARGIN, 60));
  const width = Math.min(TASKBAR_WIDTH, Math.max(180, bounds.width - 16));
  const y = edge === 'top'
    ? bounds.y + Math.round((thickness - height) / 2)
    : bounds.y + bounds.height - thickness + Math.round((thickness - height) / 2);

  return {
    x: bounds.x + 8,
    y,
    width,
    height
  };
}

function taskbarBounds() {
  const base = taskbarBaseBounds();
  // The widget is anchored to the primary taskbar, so the cached primary
  // display is equivalent to a fresh getDisplayMatching() without the call.
  const display = primaryDisplay();
  const position = normalizeTaskbarPosition((settings || DEFAULT_SETTINGS).taskbarPosition);

  // The slider spans the full usable taskbar width: 0 = right, 100 = left.
  const minX = display.bounds.x + 8;
  const maxX = Math.max(minX, display.bounds.x + display.bounds.width - base.width - 8);
  const x = maxX - Math.round(((maxX - minX) * position) / 100);

  return {
    ...base,
    x: Math.round(x)
  };
}

function taskbarZoom(height) {
  return clamp(height / 40, 0.85, 1.45);
}

function positionTaskbar() {
  if (!taskbar || taskbar.isDestroyed()) return;
  const next = taskbarBounds();
  const current = taskbar.getBounds();
  let moved = false;
  if (
    current.x !== next.x ||
    current.y !== next.y ||
    current.width !== next.width ||
    current.height !== next.height
  ) {
    taskbar.setBounds(next);
    moved = true;
  }
  const zoom = taskbarZoom(next.height);
  if (Math.abs(taskbarZoomValue - zoom) > 0.02) {
    try {
      taskbar.webContents.setZoomFactor(zoom);
      taskbarZoomValue = zoom;
    } catch {
      /* ignore */
    }
  }
  // Only a real bounds change needs to move the anchored menu. Realigning it
  // on every show/focus event made the popup shift under the cursor.
  if (moved && popupOpen) positionPopup();
}

function shouldShowTaskbar() {
  if (!settings || settings.taskbarWidgetEnabled === false) return false;
  if (process.platform !== 'win32') return true;
  // The probe reports on change only, so silence is normal. Only the last real
  // reading may decide visibility; treating a quiet probe as "visible" made the
  // widget linger over open windows after an auto-hide taskbar slid away.
  if (taskbarNativeVisible === null) return true;
  return taskbarNativeVisible;
}

function syncTaskbarVisibility() {
  if (!taskbarReady || !taskbar || taskbar.isDestroyed()) return;
  if (!shouldShowTaskbar()) {
    if (taskbar.isVisible()) taskbar.hide();
    return;
  }
  positionTaskbar();
  if (!taskbar.isVisible()) {
    // Clicks must land even when another app owns the foreground; the widget
    // stays above it and never becomes mouse-transparent on a show cycle.
    try { taskbar.setIgnoreMouseEvents(false); } catch { /* ignore */ }
    taskbar.showInactive();
    try {
      taskbar.setAlwaysOnTop(true, 'screen-saver', 1);
    } catch {
      /* ignore */
    }
  }
}

function createTaskbar() {
  if (taskbar && !taskbar.isDestroyed()) return;
  taskbarReady = false;
  taskbarZoomValue = 0;
  taskbar = new BrowserWindow({
    ...taskbarBounds(),
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
    // Focusable so clicking the widget gives this process foreground rights,
    // which lets the popup take focus immediately and hand it back on close.
    focusable: true,
    title: 'صلاتي — أداة شريط المهام',
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

  taskbar.loadFile(path.join(__dirname, 'src', 'taskbar.html'));
  taskbar.setAlwaysOnTop(true, 'screen-saver', 1);

  taskbar.once('ready-to-show', () => {
    taskbarReady = true;
    try { taskbar.setIgnoreMouseEvents(false); } catch { /* ignore */ }
    positionTaskbar();
    syncTaskbarVisibility();
  });

  taskbar.on('closed', () => {
    taskbar = null;
    taskbarReady = false;
  });

  taskbar.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  taskbar.webContents.on('did-finish-load', () => positionTaskbar());
}

function popupBounds() {
  // The menu follows the real inline widget bounds, including the slider offset.
  const bar = taskbarBounds();
  const display = primaryDisplay();

  // Center above the strip, then clamp so the wider menu never clips off-screen.
  const minX = display.bounds.x + 8;
  const maxX = Math.max(minX, display.bounds.x + display.bounds.width - POPUP_WIDTH - 8);
  const centeredX = bar.x + Math.round((bar.width - POPUP_WIDTH) / 2);
  const x = clamp(centeredX, minX, maxX);

  // Keep the original vertical behavior: above the taskbar when possible.
  const minY = display.bounds.y + 8;
  const maxY = Math.max(minY, display.bounds.y + display.bounds.height - POPUP_HEIGHT - 8);
  let y = bar.y - POPUP_HEIGHT - 8;
  if (y < minY) y = bar.y + bar.height + 8;
  y = clamp(y, minY, maxY);

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT
  };
}

function positionPopup() {
  if (!popup || popup.isDestroyed()) return;
  const next = popupBounds();
  const current = popup.getBounds();
  if (
    current.x !== next.x ||
    current.y !== next.y ||
    current.width !== next.width ||
    current.height !== next.height
  ) {
    popup.setBounds(next);
  }
}

function clearPopupBlurTimer() {
  if (popupBlurTimer) {
    clearTimeout(popupBlurTimer);
    popupBlurTimer = null;
  }
}

function setPopupAlpha(alpha, verify = false) {
  if (!popup || popup.isDestroyed()) return false;
  try {
    popup.setOpacity(alpha);
    // Verification costs an extra native call, so only do it while warming.
    return !verify || Math.abs(popup.getOpacity() - alpha) < 0.01;
  } catch {
    return false;
  }
}

function setPopupClickThrough(enabled) {
  if (!popup || popup.isDestroyed()) return;
  try {
    popup.setIgnoreMouseEvents(enabled, { forward: false });
  } catch {
    /* ignore */
  }
}

function notifyPopupVisibility(visible) {
  if (!popup || popup.isDestroyed()) return;
  try {
    popup.webContents.send('popup:visibility', visible);
  } catch {
    /* the renderer may not be ready yet; it starts closed anyway */
  }
}

// Keep a fully rendered popup window alive behind an invisible, click-through
// layer. Opening then only flips native opacity and mouse pass-through, so no
// BrowserWindow is created/shown on the click path.
function warmPopup() {
  if (!popup || popup.isDestroyed() || popupWarm) return;
  setPopupClickThrough(true);
  const opacityOk = setPopupAlpha(0, true);
  try { popup.setFocusable(false); } catch { /* ignore */ }
  try {
    popup.showInactive();
  } catch {
    /* ignore */
  }
  // Position once while warm; the click path never queries the window manager.
  positionPopup();
  if (opacityOk) {
    popupWarm = true;
  } else {
    // Extremely defensive fallback for a platform without window opacity.
    popupWarm = false;
    try { popup.hide(); } catch { /* ignore */ }
  }
  try { popup.blur(); } catch { /* ignore */ }
  notifyPopupVisibility(false);
}

function hidePopup(returnFocus = false) {
  clearPopupBlurTimer();
  if (!popup || popup.isDestroyed() || !popupOpen) return;
  // Mark it closed before blurring so the blur handler cannot re-enter.
  popupOpen = false;
  if (popupWarm) {
    setPopupClickThrough(true);
    if (!setPopupAlpha(0)) {
      popupWarm = false;
      try { popup.hide(); } catch { /* ignore */ }
    }
  } else {
    try { popup.hide(); } catch { /* ignore */ }
  }
  // A hidden window must not keep keyboard focus: WS_EX_NOACTIVATE drops it
  // immediately, so no keystrokes go to an invisible menu.
  try { popup.setFocusable(false); } catch { /* ignore */ }
  try { popup.blur(); } catch { /* ignore */ }
  notifyPopupVisibility(false);
  // A widget-initiated close should hand keyboard focus back to the widget.
  // Outside-click closes must not steal it back from the window just clicked.
  if (returnFocus && taskbar && !taskbar.isDestroyed()) {
    try { taskbar.focus(); } catch { /* ignore */ }
  }
}

function focusPopup() {
  // The widget press already gave this process foreground rights, so focusing
  // the menu is enough. Never call app.focus({ steal: true }): it yanks the
  // foreground back from the user's other app and adds a visible delay, and it
  // is unnecessary when the main window is hidden in the tray. Focus work is
  // deferred so it cannot delay the menu becoming visible and clickable.
  setImmediate(() => {
    if (!popupOpen || !popup || popup.isDestroyed()) {
      popupOpening = false;
      return;
    }
    try { popup.setFocusable(true); } catch { /* ignore */ }
    try { popup.focus(); } catch { /* ignore */ }
    // Keep blur suppression until activation events have settled; clearing it
    // before focus lands let a transient blur hide the menu we just opened.
    setImmediate(() => { popupOpening = false; });
  });
}

function showPopup() {
  if (!popup || popup.isDestroyed()) return;
  if (!popupReady) {
    popupPendingShow = true;
    return;
  }
  if (popupOpen) return;
  clearPopupBlurTimer();
  popupOpen = true;
  popupOpening = true;
  // Align the menu with the widget's stable bounds before making it visible.
  // focusPopup() clears popupOpening once activation has completed.
  positionPopup();
  if (popupWarm) {
    if (!setPopupAlpha(1)) {
      popupWarm = false;
      try { popup.show(); } catch { /* ignore */ }
    }
    setPopupClickThrough(false);
  } else {
    try { popup.show(); } catch { /* ignore */ }
  }
  notifyPopupVisibility(true);
  focusPopup();
}

function togglePopup() {
  if (!popup || popup.isDestroyed()) return;
  if (!popupReady) {
    popupPendingShow = true;
    return;
  }
  if (popupOpen) {
    hidePopup(true);
    return;
  }
  showPopup();
}

function createPopup() {
  if (popup && !popup.isDestroyed()) return;
  popupReady = false;
  popup = new BrowserWindow({
    ...popupBounds(),
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#01000000',
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    focusable: true,
    title: 'صلاتي — المواقيت',
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

  popup.loadFile(path.join(__dirname, 'src', 'popup.html'));
  popup.setAlwaysOnTop(true, 'screen-saver', 2);

  popup.once('ready-to-show', () => {
    popupReady = true;
    // Render and position the window once now, then keep it warm behind an
    // invisible click-through layer. Clicks never touch the window lifecycle.
    warmPopup();
    if (popupPendingShow) {
      popupPendingShow = false;
      showPopup();
    }
  });

  popup.on('blur', () => {
    if (!popupReady || !popupOpen || isQuitting || popupOpening) return;
    // The widget is focusable, so pressing it moves focus before its pointerdown
    // IPC arrives. Let that click close the menu itself; hiding here would race
    // with the IPC and swallow or immediately reopen the click.
    if (taskbar && !taskbar.isDestroyed() && taskbar.isFocused()) return;
    // Outside clicks close on the next tick: no fixed wait, no stale state.
    clearPopupBlurTimer();
    popupBlurTimer = setTimeout(() => {
      popupBlurTimer = null;
      if (popupOpen && popup && !popup.isDestroyed() && !popup.isFocused()) {
        hidePopup();
      }
    }, 0);
  });

  popup.on('closed', () => {
    clearPopupBlurTimer();
    popup = null;
    popupReady = false;
    popupOpen = false;
    popupWarm = false;
  });

  popup.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      event.preventDefault();
      hidePopup();
    }
  });

  popup.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function createWindow() {
  const theme = resolveTheme();
  const chrome = WINDOW_CHROME[theme] || WINDOW_CHROME.dark;
  const startHidden = true;

  win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 940,
    minHeight: 660,
    show: false,
    backgroundColor: chrome.bg,
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: chrome.bg,
      symbolColor: chrome.symbol,
      height: TITLEBAR_HEIGHT
    },
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
    // Taskbar visibility depends on the taskbar itself, not on the main window.
    // Re-syncing on every show/hide/minimize/restore fought the auto-hide probe
    // and repositioned the widget/menu repeatedly; remove that feedback loop.
    syncTaskbarVisibility();
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
  for (const view of ['home', 'month', 'settings']) {
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
  if (settings.theme === 'gold') return 'gold';
  return settings.theme === 'light' ? 'light' : 'dark';
}

function applyTheme() {
  const theme = resolveTheme();
  applyWindowChrome(theme);
  if (win && !win.isDestroyed()) broadcast('theme:changed', theme);
  sendToFocusGlass('theme:changed', theme);
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
    'focusEnabled',
    'focusLeadMinutes',
    'focusDurationMinutes',
    'focusDismissOnAdhan',
    'focusCloseNotice',
    'sound',
    'customSoundPath',
    'volume',
    'theme',
    'timeFormat',
    'hijriOffset',
    'closeToTray',
    'autoLaunch',
    'taskbarWidgetEnabled',
    'popupPosition',
    'taskbarPosition',
    'autoUpdateCheck'
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
    clean.preAdhanMinutes = normalizePreAdhanMinutes(clean.preAdhanMinutes);
  }
  if (clean.focusEnabled !== undefined) clean.focusEnabled = !!clean.focusEnabled;
  if (clean.focusLeadMinutes !== undefined) {
    clean.focusLeadMinutes = normalizeFocusLeadMinutes(clean.focusLeadMinutes);
  }
  if (clean.focusDurationMinutes !== undefined) {
    clean.focusDurationMinutes = normalizeFocusDurationMinutes(clean.focusDurationMinutes);
  }
  if (clean.focusDismissOnAdhan !== undefined) clean.focusDismissOnAdhan = !!clean.focusDismissOnAdhan;
  if (clean.focusCloseNotice !== undefined) clean.focusCloseNotice = !!clean.focusCloseNotice;
  if (clean.sound && !VALID_SOUNDS.includes(clean.sound)) delete clean.sound;
  if (clean.volume !== undefined) clean.volume = clamp(Number(clean.volume) || 0, 0, 1);
  if (clean.theme && !['dark', 'gold', 'light', 'auto'].includes(clean.theme)) delete clean.theme;
  if (clean.timeFormat !== undefined && !['12', '24'].includes(String(clean.timeFormat))) delete clean.timeFormat;
  if (clean.hijriOffset !== undefined) clean.hijriOffset = clamp(Number(clean.hijriOffset) || 0, -3, 3);
  if (clean.taskbarWidgetEnabled !== undefined) clean.taskbarWidgetEnabled = !!clean.taskbarWidgetEnabled;
  if (clean.popupPosition !== undefined) clean.popupPosition = normalizePopupPosition(clean.popupPosition);
  if (clean.taskbarPosition !== undefined) clean.taskbarPosition = normalizeTaskbarPosition(clean.taskbarPosition);

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
  if (clean.taskbarWidgetEnabled !== undefined) {
    if (!clean.taskbarWidgetEnabled) hidePopup();
    syncTaskbarVisibility();
  }
  if (clean.taskbarPosition !== undefined) {
    positionTaskbar();
    positionPopup();
  }
  if (clean.popupPosition !== undefined) positionPopup();
  if (clean.focusEnabled === false) hideFocusGlass('disabled');
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
      notificationSupported: Notification.isSupported(),
      soundUrls: {
        makkah: soundAssetUrl('makkah'),
        madinah: soundAssetUrl('madinah'),
        abdulbasit: soundAssetUrl('abdulbasit')
      }
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
    syncTaskbarVisibility();
    positionPopup();
    broadcast('settings:changed', settings);
    return { settings };
  });

  ipcMain.handle('times:today', () => buildDayPayload());
  ipcMain.handle('taskbar:appearance', () => ({ light: taskbarSystemLight === true }));
  ipcMain.handle('times:month', (_event, args) => {
    const year = clamp(Number(args?.year) || new Date().getFullYear(), 1900, 2200);
    const month = clamp(Number(args?.month) || new Date().getMonth() + 1, 1, 12);
    return monthData(year, month);
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

  ipcMain.handle('focus:dismiss', () => {
    hideFocusGlass('ipc-dismiss');
    return true;
  });

  // النافذة الرئيسية ترسل الآية/الحديث الفعّالين إلى نافذة الزجاج.
  ipcMain.handle('focus:texts', (_event, payload) => {
    if (payload && typeof payload === 'object') {
      focusTexts = {
        verse: String(payload.verse || '—'),
        verseRef: String(payload.verseRef || '—'),
        hadith: String(payload.hadith || '—'),
        hadithRef: String(payload.hadithRef || '—'),
        prayer: String(payload.prayer || '—')
      };
      sendToFocusGlass('focus:texts', focusTexts);
    }
    return true;
  });

  ipcMain.handle('focus:get-state', () => ({
    payload: focusLastPayload,
    texts: focusTexts,
    closeNoticeCount: focusNoticeCount,
    focusActive: focusGlassActive,
    session: focusSession,
    closeNoticeScheduled: !!focusCloseNoticeTimer,
    lastFocusHideReason
  }));

  // override يستخدمه زر المعاينة، ويسمح بمدة قصيرة للتحقق من تنبيه الـ ٣٠ ثانية.
  ipcMain.handle('focus:test', (_event, override = {}) => {
    const day = buildDayPayload();
    const next = day.next || {};
    const requested = Number(override?.durationMinutes);
    const durationMinutes = Number.isFinite(requested) && requested > 0
      ? clamp(requested, 0.1, 30)
      : normalizeFocusDurationMinutes(settings.focusDurationMinutes);
    showFocusGlass({
      prayerKey: next.key || 'isha',
      prayerName: next.name || '',
      timeISO: next.timeISO || new Date().toISOString(),
      leadMinutes: normalizeFocusLeadMinutes(settings.focusLeadMinutes),
      durationMinutes,
      dismissOnAdhan: false,
      preview: true
    }, day);
    return true;
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

  ipcMain.on('popup:toggle', () => {
    togglePopup();
  });

  ipcMain.on('popup:hide', () => {
    hidePopup();
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

  ipcMain.handle('app:reset-zoom', () => {
    for (const target of [win, popup]) {
      try {
        if (target && !target.isDestroyed()) target.webContents.setZoomFactor(1);
      } catch { /* ignore destroyed or unready views */ }
    }
    return true;
  });

  ipcMain.handle('updater:state', () => ({ ...updaterState }));

  ipcMain.handle('updater:check', async () => {
    try {
      configureUpdater();
      if (oneClickRunning) return true;
      await checkForUpdatesOnce();
      return true;
    } catch (error) {
      const fallback = await checkGitHubReleasesFallback();
      if (fallback.hasUpdate) {
        setUpdaterState({
          status: 'manual-update',
          version: fallback.latest,
          notes: null,
          error: null
        });
      } else {
        setUpdaterState({ status: 'error', error: String(error?.message || error) });
      }
      return false;
    }
  });

  ipcMain.handle('updater:download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      setUpdaterState({ status: 'error', error: String(error?.message || error) });
      return false;
    }
  });

  ipcMain.handle('updater:install', () => {
    if (updaterState.status !== 'ready') return false;
    return applyPreparedUpdate();
  });

  ipcMain.handle('updater:one-click', () => runOneClickUpdate());

  ipcMain.handle('app:check-update', () => checkGitHubReleasesFallback());

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
    // Persist migrations (reminder options, 12-hour default, retired settings).
    saveSettings();
    registerIpc();
    createTray();
    createWindow();
    createTaskbar();
    createPopup();
    startTaskbarProbe();
    configureUpdater();

    updateTray(true);
    setTimeout(firstRunDetection, 900);

    schedulerTimer = setInterval(checkNotifications, 15_000);
    trayTimer = setInterval(() => updateTray(false), 30_000);
    setTimeout(checkNotifications, 2500);
    setTimeout(() => {
      if (settings.autoUpdateCheck === false || oneClickRunning) return;
      checkForUpdatesOnce().catch((error) => {
        setUpdaterState({ status: 'error', error: String(error?.message || error) });
      });
    }, 9000);

    const scheduleDisplaySync = () => {
      cachedPrimaryDisplay = null;
      lastProbeKey = '';
      taskbarDockThickness = TASKBAR_HEIGHT_FALLBACK;
      taskbarEdge = 'bottom';
      clearTimeout(displaySyncTimer);
      displaySyncTimer = setTimeout(() => {
        positionTaskbar();
        syncTaskbarVisibility();
        positionPopup();
      }, 120);
    };
    for (const eventName of ['display-metrics-changed', 'display-added', 'display-removed']) {
      screen.on(eventName, scheduleDisplaySync);
    }

    // The fast probe drives show/hide directly and emits only on real changes;
    // nothing needs a per-second re-check while it is running. This only covers
    // the brief gap before it starts or after it restarts.
    setInterval(() => {
      if (!isQuitting && !taskbarProbe) syncTaskbarVisibility();
    }, 1000);

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
    stopTaskbarProbe();
    try { if (tray && !tray.isDestroyed()) tray.destroy(); } catch { /* ignore */ }
    tray = null;
    for (const w of [win, taskbar, popup, focusGlassWin]) {
      try { if (w && !w.isDestroyed()) w.close(); } catch { /* ignore */ }
    }
  });

  app.on('window-all-closed', () => {
    // The widget/menu are separate long-lived windows; closing the main window
    // to the tray must never take the background process (and them) down.
    if (isQuitting) return;
    if (process.platform !== 'darwin' && !settings.closeToTray) {
      app.quit();
    }
  });
}
