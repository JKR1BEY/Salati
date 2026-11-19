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
  exportCsv: (filename, content) => ipcRenderer.invoke('month:export', { filename, content }),
  openApp: (view) => ipcRenderer.invoke('app:open', view),
  toggleTaskbarPopup: () => ipcRenderer.invoke('popup:toggle'),
  hideTaskbarPopup: () => ipcRenderer.invoke('popup:hide'),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onPlayAdhan: (callback) => subscribe('adhan:play', callback),
  onSettingsChanged: (callback) => subscribe('settings:changed', callback),
  onThemeChanged: (callback) => subscribe('theme:changed', callback),
  onTaskbarAppearance: (callback) => subscribe('taskbar:appearance', callback),
  onToast: (callback) => subscribe('toast', callback),
  onNavigate: (callback) => subscribe('navigate', callback)
});
