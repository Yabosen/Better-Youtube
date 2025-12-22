const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  getPluginConfig: (pluginName) => ipcRenderer.invoke('get-plugin-config', pluginName),
  setPluginConfig: (pluginName, config) => ipcRenderer.invoke('set-plugin-config', pluginName, config),
  togglePlugin: (pluginName, enabled) => ipcRenderer.invoke('toggle-plugin', pluginName, enabled),
  getReturnDislikeConfig: () => ipcRenderer.invoke('get-return-dislike-config'),
  toggleReturnDislike: (enabled) => ipcRenderer.invoke('toggle-return-dislike', enabled),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Navigation controls
  goBack: () => ipcRenderer.invoke('go-back'),
  goForward: () => ipcRenderer.invoke('go-forward'),
  refresh: () => ipcRenderer.invoke('refresh'),
  // Window controls
  minimize: () => ipcRenderer.invoke('minimize'),
  maximize: () => ipcRenderer.invoke('maximize'),
  close: () => ipcRenderer.invoke('close')
});

