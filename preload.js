const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const handler = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('salati', {
  platform: process.platform,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  getToday: () => ipcRenderer.invoke('times:today'),
  getTaskbarAppearance: () => ipcRenderer.invoke('taskbar:appearance'),
  getMonth: (year, month) => ipcRenderer.invoke('times:month', { year, month }),
  detectLocation: () => ipcRenderer.invoke('location:detect'),
  searchCities: (query) => ipcRenderer.invoke('location:search', query),
  pickSound: () => ipcRenderer.invoke('sound:pick'),
  testNotification: () => ipcRenderer.invoke('notify:test'),
  testFocus: () => ipcRenderer.invoke('focus:test'),
  dismissFocus: () => ipcRenderer.invoke('focus:dismiss'),
  exportCsv: (filename, content) => ipcRenderer.invoke('month:export', { filename, content }),
  openApp: (view) => ipcRenderer.invoke('app:open', view),
  toggleTaskbarPopup: () => ipcRenderer.send('popup:toggle'),
  hideTaskbarPopup: () => ipcRenderer.send('popup:hide'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  resetZoom: () => ipcRenderer.invoke('app:reset-zoom'),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  getUpdaterState: () => ipcRenderer.invoke('updater:state'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  downloadUpdate: () => ipcRenderer.invoke('updater:download'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  oneClickUpdate: () => ipcRenderer.invoke('updater:one-click'),
  onUpdaterState: (callback) => subscribe('updater:state', callback),
  quit: () => ipcRenderer.invoke('app:quit'),
  onPlayAdhan: (callback) => subscribe('adhan:play', callback),
  onFocusShow: (callback) => subscribe('focus:show', callback),
  onFocusHide: (callback) => subscribe('focus:hide', callback),
  onSettingsChanged: (callback) => subscribe('settings:changed', callback),
  onThemeChanged: (callback) => subscribe('theme:changed', callback),
  onTaskbarAppearance: (callback) => subscribe('taskbar:appearance', callback),
  onPopupVisibility: (callback) => subscribe('popup:visibility', callback),
  onToast: (callback) => subscribe('toast', callback),
  onNavigate: (callback) => subscribe('navigate', callback)
});
