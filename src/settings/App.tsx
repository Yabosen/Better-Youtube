import React, { useEffect, useState } from 'react';
import './App.css';

interface Plugin {
  name: string;
  description?: string;
  enabled: boolean;
}

interface PluginConfig {
  [key: string]: any;
}

function App() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPlugin, setSelectedPlugin] = useState<string | null>(null);
  const [pluginConfigs, setPluginConfigs] = useState<Record<string, PluginConfig>>({});

  useEffect(() => {
    loadPlugins();
  }, []);

  const loadPlugins = async () => {
    try {
      const pluginList = await window.electronAPI.getPlugins();
      setPlugins(pluginList);
      
      // Load configs for all plugins
      const configs: Record<string, PluginConfig> = {};
      for (const plugin of pluginList) {
        configs[plugin.name] = await window.electronAPI.getPluginConfig(plugin.name);
      }
      setPluginConfigs(configs);
    } catch (error) {
      console.error('Error loading plugins:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePlugin = async (pluginName: string, enabled: boolean) => {
    try {
      await window.electronAPI.togglePlugin(pluginName, enabled);
      setPlugins(prev =>
        prev.map(p => (p.name === pluginName ? { ...p, enabled } : p))
      );
    } catch (error) {
      console.error('Error toggling plugin:', error);
    }
  };

  const updatePluginConfig = async (pluginName: string, key: string, value: any) => {
    try {
      const currentConfig = pluginConfigs[pluginName] || {};
      const newConfig = { ...currentConfig, [key]: value };
      await window.electronAPI.setPluginConfig(pluginName, newConfig);
      setPluginConfigs(prev => ({
        ...prev,
        [pluginName]: newConfig,
      }));
    } catch (error) {
      console.error('Error updating plugin config:', error);
    }
  };

  const renderPluginSettings = (plugin: Plugin) => {
    const config = pluginConfigs[plugin.name] || {};
    
    switch (plugin.name) {
      case 'adblocker':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Blocks ads and trackers using filter lists</p>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.enabled !== false}
                  onChange={e => updatePluginConfig(plugin.name, 'enabled', e.target.checked)}
                />
                Enable AdBlocker
              </label>
            </div>
          </div>
        );

      case 'sponsorblock':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Automatically skips sponsored segments, intros, outros, and more</p>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.autoSkip !== false}
                  onChange={e => updatePluginConfig(plugin.name, 'autoSkip', e.target.checked)}
                />
                Auto-skip segments
              </label>
            </div>
            <div className="setting-item">
              <label>Categories to skip:</label>
              <div className="checkbox-group">
                {['sponsor', 'intro', 'outro', 'selfpromo', 'interaction'].map(cat => (
                  <label key={cat} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={(config.categories || []).includes(cat)}
                      onChange={e => {
                        const categories = config.categories || [];
                        const newCategories = e.target.checked
                          ? [...categories, cat]
                          : categories.filter(c => c !== cat);
                        updatePluginConfig(plugin.name, 'categories', newCategories);
                      }}
                    />
                    {cat}
                  </label>
                ))}
              </div>
            </div>
          </div>
        );

      case 'downloader':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Download YouTube videos and audio</p>
            <div className="setting-item">
              <label>Download Path:</label>
              <input
                type="text"
                value={config.downloadPath || ''}
                onChange={e => updatePluginConfig(plugin.name, 'downloadPath', e.target.value)}
                placeholder="Leave empty for default"
              />
            </div>
            <div className="setting-item">
              <label>Default Quality:</label>
              <select
                value={config.defaultQuality || 'highest'}
                onChange={e => updatePluginConfig(plugin.name, 'defaultQuality', e.target.value)}
              >
                <option value="highest">Highest</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        );

      case 'discord-rpc':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Show what you're watching on Discord</p>
            <div className="setting-item">
              <label>Discord Client ID:</label>
              <input
                type="text"
                value={config.clientId || ''}
                onChange={e => updatePluginConfig(plugin.name, 'clientId', e.target.value)}
                placeholder="Get from https://discord.com/developers/applications"
              />
              <small>Create a Discord application and paste your Client ID here</small>
            </div>
          </div>
        );

      case 'lastfm':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Scrobble YouTube videos to Last.fm</p>
            <div className="setting-item">
              <label>API Key:</label>
              <input
                type="text"
                value={config.apiKey || ''}
                onChange={e => updatePluginConfig(plugin.name, 'apiKey', e.target.value)}
                placeholder="Your Last.fm API key"
              />
            </div>
            <div className="setting-item">
              <label>API Secret:</label>
              <input
                type="password"
                value={config.apiSecret || ''}
                onChange={e => updatePluginConfig(plugin.name, 'apiSecret', e.target.value)}
                placeholder="Your Last.fm API secret"
              />
            </div>
            <small>Get your API credentials from https://www.last.fm/api/account/create</small>
          </div>
        );

      case 'visualizer':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Audio visualizer with customizable styles</p>
            <div className="setting-item">
              <label>Height (px):</label>
              <input
                type="number"
                value={config.height || 100}
                onChange={e => updatePluginConfig(plugin.name, 'height', parseInt(e.target.value))}
                min="50"
                max="300"
              />
            </div>
            <div className="setting-item">
              <label>Opacity:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.opacity || 0.7}
                onChange={e => updatePluginConfig(plugin.name, 'opacity', parseFloat(e.target.value))}
              />
              <span>{(config.opacity || 0.7).toFixed(1)}</span>
            </div>
            <div className="setting-item">
              <label>Start Color:</label>
              <input
                type="color"
                value={config.colorStart || '#ff0000'}
                onChange={e => updatePluginConfig(plugin.name, 'colorStart', e.target.value)}
              />
            </div>
            <div className="setting-item">
              <label>End Color:</label>
              <input
                type="color"
                value={config.colorEnd || '#00ff00'}
                onChange={e => updatePluginConfig(plugin.name, 'colorEnd', e.target.value)}
              />
            </div>
          </div>
        );

      case 'audio-compressor':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Audio compression and dynamic range control</p>
            <div className="setting-item">
              <label>Threshold (dB):</label>
              <input
                type="number"
                value={config.threshold || -24}
                onChange={e => updatePluginConfig(plugin.name, 'threshold', parseInt(e.target.value))}
                min="-60"
                max="0"
              />
            </div>
            <div className="setting-item">
              <label>Ratio:</label>
              <input
                type="number"
                value={config.ratio || 12}
                onChange={e => updatePluginConfig(plugin.name, 'ratio', parseInt(e.target.value))}
                min="1"
                max="20"
              />
            </div>
            <div className="setting-item">
              <label>Attack (ms):</label>
              <input
                type="number"
                value={(config.attack || 0.003) * 1000}
                onChange={e => updatePluginConfig(plugin.name, 'attack', parseFloat(e.target.value) / 1000)}
                min="0.1"
                max="100"
                step="0.1"
              />
            </div>
            <div className="setting-item">
              <label>Release (ms):</label>
              <input
                type="number"
                value={(config.release || 0.25) * 1000}
                onChange={e => updatePluginConfig(plugin.name, 'release', parseFloat(e.target.value) / 1000)}
                min="10"
                max="1000"
                step="10"
              />
            </div>
          </div>
        );

      case 'exponential-volume':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Logarithmic volume slider for better volume control</p>
            <div className="setting-item">
              <label>Curve Steepness:</label>
              <input
                type="range"
                min="1"
                max="10"
                step="0.5"
                value={config.curve || 3}
                onChange={e => updatePluginConfig(plugin.name, 'curve', parseFloat(e.target.value))}
              />
              <span>{config.curve || 3}</span>
            </div>
          </div>
        );

      case 'album-color-theme':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Extract colors from album art to theme the UI</p>
            <div className="setting-item">
              <label>Intensity:</label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={config.intensity || 0.3}
                onChange={e => updatePluginConfig(plugin.name, 'intensity', parseFloat(e.target.value))}
              />
              <span>{(config.intensity || 0.3).toFixed(1)}</span>
            </div>
          </div>
        );

      case 'better-fullscreen':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Enhanced fullscreen experience with better controls</p>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.autoHideControls !== false}
                  onChange={e => updatePluginConfig(plugin.name, 'autoHideControls', e.target.checked)}
                />
                Auto-hide controls
              </label>
            </div>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.keyboardShortcuts !== false}
                  onChange={e => updatePluginConfig(plugin.name, 'keyboardShortcuts', e.target.checked)}
                />
                Enable keyboard shortcuts
              </label>
            </div>
          </div>
        );

      case 'in-app-menu':
        return (
          <div className="plugin-settings">
            <p className="plugin-description">Custom title bar and in-app menu</p>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.hideTitleBar === true}
                  onChange={e => updatePluginConfig(plugin.name, 'hideTitleBar', e.target.checked)}
                />
                Hide title bar
              </label>
            </div>
            <div className="setting-item">
              <label>
                <input
                  type="checkbox"
                  checked={config.showMenuBar !== false}
                  onChange={e => updatePluginConfig(plugin.name, 'showMenuBar', e.target.checked)}
                />
                Show menu bar
              </label>
            </div>
          </div>
        );

      default:
        return (
          <div className="plugin-settings">
            <p className="plugin-description">{plugin.description || 'No additional settings available'}</p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">Loading plugins...</div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="settings-container">
        <div className="sidebar">
          <h1>Settings</h1>
          <div className="plugin-list">
            {plugins.map(plugin => (
              <div
                key={plugin.name}
                className={`plugin-item ${selectedPlugin === plugin.name ? 'active' : ''}`}
                onClick={() => setSelectedPlugin(plugin.name)}
              >
                <div className="plugin-header">
                  <span className="plugin-name">
                    {plugin.name.split('-').map(word => 
                      word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ')}
                  </span>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      onChange={e => {
                        e.stopPropagation();
                        togglePlugin(plugin.name, e.target.checked);
                      }}
                    />
                    <span className="slider"></span>
                  </label>
                </div>
                {plugin.description && (
                  <p className="plugin-desc-small">{plugin.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="main-content">
          {selectedPlugin ? (
            <>
              <h2>
                {selectedPlugin.split('-').map(word => 
                  word.charAt(0).toUpperCase() + word.slice(1)
                ).join(' ')} Settings
              </h2>
              {renderPluginSettings(plugins.find(p => p.name === selectedPlugin)!)}
            </>
          ) : (
            <div className="welcome">
              <h2>Welcome to Settings</h2>
              <p>Select a plugin from the sidebar to configure it.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
