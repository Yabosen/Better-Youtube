const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const { loadPlugins, getPluginList, getPluginsDirectory } = require('./plugin-loader');
const { initializeAdBlocker } = require('./adblocker');

// Initialize electron-store (ESM module, use dynamic import)
let store;
async function initializeStore() {
  const Store = (await import('electron-store')).default;
  store = new Store();
}

let mainWindow;
let settingsWindow;

// Adblocker is initialized in adblocker.js module

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    autoHideMenuBar: true,
    frame: true,
    show: false // Don't show until ready
  });

  // Open DevTools for debugging (remove in production)
  mainWindow.webContents.openDevTools();

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Error handling
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.error('Failed to load:', errorCode, errorDescription, validatedURL);
    if (mainWindow && !mainWindow.isDestroyed()) {
      const errorHTML = `
        <div style="padding: 40px; text-align: center; font-family: sans-serif;">
          <h1>Failed to load YouTube</h1>
          <p>Error: ${errorCode} - ${errorDescription}</p>
          <p>URL: ${validatedURL}</p>
          <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">Retry</button>
        </div>
      `;
      mainWindow.webContents.executeJavaScript(`
        document.body.innerHTML = ${JSON.stringify(errorHTML)};
      `).catch(console.error);
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });

  // Load YouTube
  console.log('Loading YouTube...');
  mainWindow.loadURL('https://www.youtube.com').catch(err => {
    console.error('Error loading URL:', err);
  });

  // Inject plugins when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Page finished loading');
    injectPlugins(mainWindow);
    injectTitlebarOverlay(mainWindow);
  });

  // Handle navigation to ensure plugins are injected on YouTube pages
  mainWindow.webContents.on('did-navigate', () => {
    setTimeout(() => {
      injectPlugins(mainWindow);
      injectTitlebarOverlay(mainWindow);
    }, 1000);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function injectPlugins(window) {
  const plugins = loadPlugins();
  
  plugins.forEach((plugin, index) => {
    try {
      // Escape backticks and ${} in plugin content to prevent template literal issues
      const escapedContent = plugin.content
        .replace(/\\/g, '\\\\')
        .replace(/`/g, '\\`')
        .replace(/\$\{/g, '\\${');
      
      const escapedName = plugin.name.replace(/'/g, "\\'");
      
      // Wrap plugin code in an IIFE to avoid conflicts
      const wrappedCode = `(function() {
  try {
    ${escapedContent}
  } catch (error) {
    console.error('Plugin ${escapedName} error:', error);
  }
})();`;
      
      window.webContents.executeJavaScript(wrappedCode, true).catch(err => {
        console.error(`Error injecting plugin ${plugin.name}:`, err);
      });
    } catch (error) {
      console.error(`Error processing plugin ${plugin.name}:`, error);
    }
  });
  
  if (plugins.length > 0) {
    console.log(`Injected ${plugins.length} plugin(s)`);
  }
}

function injectTitlebarOverlay(window) {
  // Escape the HTML string for safe injection
  const overlayHTML = '<div id="better-youtube-overlay" style="position: fixed; top: 10px; right: 10px; z-index: 999999; background: rgba(0, 0, 0, 0.8); border-radius: 8px; padding: 8px 12px; cursor: pointer; font-family: -apple-system, BlinkMacSystemFont, \'Segoe UI\', Roboto, sans-serif; font-size: 12px; color: white; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); transition: background 0.2s;" onmouseover="this.style.background=\'rgba(0, 0, 0, 0.95)\'" onmouseout="this.style.background=\'rgba(0, 0, 0, 0.8)\'">⚙️ Settings</div>';

  const overlayScript = `
    (function() {
      // Remove existing overlay if present
      const existing = document.getElementById('better-youtube-overlay');
      if (existing) existing.remove();
      
      // Create and inject overlay
      const overlay = document.createElement('div');
      overlay.innerHTML = ${JSON.stringify(overlayHTML)};
      document.body.appendChild(overlay.firstElementChild);
      
      // Add click handler
      const settingsBtn = document.getElementById('better-youtube-overlay');
      if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
          if (window.electronAPI && window.electronAPI.openSettings) {
            window.electronAPI.openSettings();
          }
        });
      }
    })();
  `;

  window.webContents.executeJavaScript(overlayScript, true).catch(err => {
    console.error('Error injecting titlebar overlay:', err);
  });
}

function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 600,
    height: 500,
    parent: mainWindow,
    modal: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    autoHideMenuBar: true
  });

  // Create HTML content for settings window
  const plugins = getPluginList();
  const pluginsPath = getPluginsDirectory();
  
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Better YouTube - Settings</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #f5f5f5;
          padding: 20px;
          color: #333;
        }
        .header {
          margin-bottom: 20px;
        }
        .header h1 {
          font-size: 24px;
          margin-bottom: 8px;
        }
        .header p {
          color: #666;
          font-size: 14px;
        }
        .section {
          background: white;
          border-radius: 8px;
          padding: 20px;
          margin-bottom: 15px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
        }
        .section h2 {
          font-size: 18px;
          margin-bottom: 15px;
          color: #1a1a1a;
        }
        .plugin-item {
          padding: 12px;
          background: #f9f9f9;
          border-radius: 6px;
          margin-bottom: 8px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .plugin-name {
          font-weight: 500;
          color: #333;
        }
        .plugin-path {
          font-size: 12px;
          color: #666;
          margin-top: 4px;
        }
        .empty-state {
          text-align: center;
          padding: 40px 20px;
          color: #999;
        }
        .empty-state p {
          margin-bottom: 10px;
        }
        .path-info {
          background: #f0f0f0;
          padding: 12px;
          border-radius: 6px;
          font-size: 12px;
          font-family: 'Courier New', monospace;
          word-break: break-all;
          color: #555;
        }
        .status {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 500;
        }
        .status.active {
          background: #4caf50;
          color: white;
        }
        .status.inactive {
          background: #ccc;
          color: #666;
        }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Better YouTube Settings</h1>
        <p>Manage your plugins and preferences</p>
      </div>
      
      <div class="section">
        <h2>Loaded Plugins (${plugins.length})</h2>
        <div id="plugins-list">
          ${plugins.length === 0 
            ? '<div class="empty-state"><p>No plugins found</p><p>Add .js files to the plugins directory</p></div>'
            : plugins.map(plugin => `
                <div class="plugin-item">
                  <div>
                    <div class="plugin-name">${plugin}</div>
                    <div class="status active">Active</div>
                  </div>
                </div>
              `).join('')
          }
        </div>
      </div>
      
      <div class="section">
        <h2>Plugins Directory</h2>
        <div class="path-info">${pluginsPath}</div>
        <p style="margin-top: 10px; font-size: 12px; color: #666;">
          Add .js files to this directory to create plugins. They will be automatically loaded when YouTube loads.
        </p>
      </div>
    </body>
    </html>
  `;

  settingsWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`);

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// IPC Handlers
ipcMain.handle('open-settings', () => {
  createSettingsWindow();
});

ipcMain.handle('get-plugins', () => {
  return getPluginList();
});

// App lifecycle
app.whenReady().then(async () => {
  await initializeStore();
  // Initialize adblocker (currently disabled by default)
  // Enable it in settings if needed
  try {
    await initializeAdBlocker();
  } catch (error) {
    console.error('Adblocker initialization failed, continuing without it:', error);
  }
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

