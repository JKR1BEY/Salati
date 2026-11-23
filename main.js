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

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const PRAYER_KEYS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
const SOUND_FILES = {
  makkah: 'makkah.mp3',
  madinah: 'madinah.mp3',
  abdulbasit: 'abdulbasit.mp3'
};
const VALID_SOUNDS = [...Object.keys(SOUND_FILES), 'custom', 'none'];
const PRE_ADHAN_OPTIONS = [0, 5, 10, 15, 20];

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
  trayHintShown: false,
  autoUpdateCheck: true
};

let settings = null;
let settingsPath = null;
let win = null;
let taskbar = null;
let tray = null;
let isQuitting = false;
let updaterState = { status: 'idle', current: null, version: null, notes: null, percent: 0, error: null };
let updaterConfigured = false;
let oneClickRunning = false;
let updateCheckRunning = false;
let taskbarProbe = null;
let taskbarProbeRestartTimer = null;
let taskbarProbeSeenAt = 0;
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
    tray.setContextMenu(buildTrayMenu());
  } catch (err) {
    console.error('تعذّر تحديث شريط المهام:', err.message);
  }
}

function showWindow(view) {
  hidePopup();
  if (!win) {
    createWindow();
    return;
  }
  try { win.restore(); } catch {}
  win.show();
  win.focus();
  if (view && ['home', 'month', 'settings'].includes(view)) {
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
  taskbarProbeSeenAt = 0;
  taskbarNativeVisible = null;
  if (probe) {
    try { probe.kill(); } catch { /* ignore */ }
  }
}

// Shell_TrayWnd is the real Windows taskbar. Watching its rectangle instead of
// guessing from work areas lets the bar follow auto-hide, fullscreen apps and
// Explorer restarts exactly.
function applyTaskbarProbe(state) {
  taskbarProbeSeenAt = Date.now();
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const left = Number(state.left) || 0;
  const top = Number(state.top) || 0;
  const right = Number(state.right) || 0;
  const bottom = Number(state.bottom) || 0;
  // An auto-hidden taskbar keeps a 1-2px sliver on screen; require a real strip.
  const overlapX = Math.max(0, Math.min(right, bounds.x + bounds.width) - Math.max(left, bounds.x));
  const overlapY = Math.max(0, Math.min(bottom, bounds.y + bounds.height) - Math.max(top, bounds.y));
  const wasVisible = taskbarNativeVisible;
  taskbarNativeVisible = !!state.ok && !!state.visible && overlapX > 40 && overlapY > 40;

  // Windows can use a light taskbar independently from app theme, so mirror the
  // actual taskbar colour (SystemUsesLightTheme) instead of prefers-color-scheme.
  const light = state.systemLight === true;
  if (taskbarSystemLight !== light) {
    taskbarSystemLight = light;
    broadcast('taskbar:appearance', { light });
  }

  // Only touch the native window when its visibility actually changes; the
  // probe fires four times per second and every call into the window manager
  // competes with the click path.
  if (wasVisible !== taskbarNativeVisible) syncTaskbarVisibility();
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
    taskbarProbeSeenAt = 0;
    taskbarNativeVisible = null;
    if (isQuitting) return;
    clearTimeout(taskbarProbeRestartTimer);
    taskbarProbeRestartTimer = setTimeout(startTaskbarProbe, 1500);
  };
  taskbarProbe.on('error', restart);
  taskbarProbe.on('exit', restart);
}

function taskbarMetrics() {
  const display = screen.getPrimaryDisplay();
  const bounds = display.bounds;
  const workArea = display.workArea;
  let edge = 'bottom';
  let thickness = bounds.height - workArea.height;

  if (workArea.y > bounds.y) {
    edge = 'top';
    thickness = workArea.y - bounds.y;
  }

  // Taskbar auto-hide or an unusual layout: assume the standard Windows height.
  if (!Number.isFinite(thickness) || thickness < 24 || thickness > 120) {
    edge = 'bottom';
    thickness = TASKBAR_HEIGHT_FALLBACK;
  }

  return { display, bounds, edge, thickness };
}

function taskbarBounds() {
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

function taskbarZoom(height) {
  return clamp(height / 40, 0.85, 1.45);
}

function positionTaskbar() {
  if (!taskbar || taskbar.isDestroyed()) return;
  const next = taskbarBounds();
  const current = taskbar.getBounds();
  if (
    current.x !== next.x ||
    current.y !== next.y ||
    current.width !== next.width ||
    current.height !== next.height
  ) {
    taskbar.setBounds(next);
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
}

function shouldShowTaskbar() {
  if (!settings || settings.taskbarWidgetEnabled === false) return false;
  if (process.platform !== 'win32') return true;
  // Before the first probe reading (or if the helper stops responding) keep the
  // widget visible rather than hiding it forever.
  if (!taskbarProbeSeenAt || Date.now() - taskbarProbeSeenAt > 1200) return true;
  return taskbarNativeVisible !== false;
}

function syncTaskbarVisibility() {
  if (!taskbarReady || !taskbar || taskbar.isDestroyed()) return;
  if (!shouldShowTaskbar()) {
    if (taskbar.isVisible()) taskbar.hide();
    return;
  }
  positionTaskbar();
  if (!taskbar.isVisible()) {
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
    backgroundColor: '#01000000',
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
  const bar = taskbarBounds();
  const display = screen.getDisplayMatching(bar) || screen.getPrimaryDisplay();
  const x = clamp(
    bar.x,
    display.bounds.x + 8,
    display.bounds.x + display.bounds.width - POPUP_WIDTH - 8
  );
  let y = bar.y - POPUP_HEIGHT - 8;
  if (y < display.bounds.y + 8) y = bar.y + bar.height + 8;
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
  // Focus must never delay the visible flip. Everything that can touch the
  // Windows foreground lock runs after the current tick, once the menu is up.
  setImmediate(() => {
    if (!popupOpen || !popup || popup.isDestroyed()) return;
    try { popup.setFocusable(true); } catch { /* ignore */ }
    try { popup.focus(); } catch { /* ignore */ }
    setImmediate(() => {
      if (!popupOpen || !popup || popup.isDestroyed() || popup.isFocused()) return;
      try { app.focus({ steal: true }); } catch { /* ignore */ }
      try { popup.focus(); } catch { /* ignore */ }
    });
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
  // Ignore only the transient blur raised while the window is being activated.
  setImmediate(() => { popupOpening = false; });
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
    syncTaskbarVisibility();
    setTimeout(() => {
      if (isQuitting) return;
      syncTaskbarVisibility();
    }, 300);
  });

  win.on('show', () => {
    syncTaskbarVisibility();
  });
  win.on('hide', () => {
    syncTaskbarVisibility();
  });
  win.on('minimize', () => {
    syncTaskbarVisibility();
  });
  win.on('restore', () => {
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
    'taskbarWidgetEnabled',
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
  if (clean.sound && !VALID_SOUNDS.includes(clean.sound)) delete clean.sound;
  if (clean.volume !== undefined) clean.volume = clamp(Number(clean.volume) || 0, 0, 1);
  if (clean.theme && !['dark', 'light', 'auto'].includes(clean.theme)) delete clean.theme;
  if (clean.timeFormat !== undefined && !['12', '24'].includes(String(clean.timeFormat))) delete clean.timeFormat;
  if (clean.hijriOffset !== undefined) clean.hijriOffset = clamp(Number(clean.hijriOffset) || 0, -3, 3);
  if (clean.taskbarWidgetEnabled !== undefined) clean.taskbarWidgetEnabled = !!clean.taskbarWidgetEnabled;

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

    // Cheap safety net: getBounds/isVisible are only applied when they change.
    setInterval(() => {
      positionTaskbar();
      syncTaskbarVisibility();
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
    for (const w of [win, taskbar, popup]) {
      try { if (w && !w.isDestroyed()) w.close(); } catch { /* ignore */ }
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' && !settings.closeToTray) {
      app.quit();
    }
  });
}
