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
  getMonth: (year, month) => ipcRenderer.invoke('times:month', { year, month }),
  getQibla: () => ipcRenderer.invoke('qibla:get'),
  detectLocation: () => ipcRenderer.invoke('location:detect'),
  searchCities: (query) => ipcRenderer.invoke('location:search', query),
  pickSound: () => ipcRenderer.invoke('sound:pick'),
  testNotification: () => ipcRenderer.invoke('notify:test'),
  exportCsv: (filename, content) => ipcRenderer.invoke('month:export', { filename, content }),
  openApp: (view) => ipcRenderer.invoke('app:open', view),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  checkUpdate: () => ipcRenderer.invoke('app:check-update'),
  dismissWidget: () => ipcRenderer.invoke('widget:dismiss'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data'),
  quit: () => ipcRenderer.invoke('app:quit'),
  onPlayAdhan: (callback) => subscribe('adhan:play', callback),
  onSettingsChanged: (callback) => subscribe('settings:changed', callback),
  onThemeChanged: (callback) => subscribe('theme:changed', callback),
  onToast: (callback) => subscribe('toast', callback),
  onNavigate: (callback) => subscribe('navigate', callback)
});
