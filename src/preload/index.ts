import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  openSettings: () => ipcRenderer.invoke('open-settings'),
  getPlugins: () => ipcRenderer.invoke('get-plugins'),
  togglePlugin: (pluginName: string, enabled: boolean) => 
    ipcRenderer.invoke('toggle-plugin', pluginName, enabled),
  getPluginConfig: (pluginName: string) => 
    ipcRenderer.invoke('get-plugin-config', pluginName),
  setPluginConfig: (pluginName: string, config: any) => 
    ipcRenderer.invoke('set-plugin-config', pluginName, config),
  windowAction: (action: string) => 
    ipcRenderer.invoke('window-action', action)
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      openSettings: () => Promise<void>;
      getPlugins: () => Promise<Array<{ name: string; description?: string; enabled: boolean }>>;
      togglePlugin: (pluginName: string, enabled: boolean) => Promise<boolean>;
      getPluginConfig: (pluginName: string) => Promise<any>;
      setPluginConfig: (pluginName: string, config: any) => Promise<boolean>;
      windowAction: (action: string) => Promise<void>;
    };
  }
}

