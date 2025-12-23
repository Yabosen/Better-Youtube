const { app, BrowserWindow, ipcMain, session, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const {
  loadPlugins,
  getPluginList,
  getPluginsDirectory,
} = require("./plugin-loader");
const { initializeAdBlocker } = require("./adblocker");

// Configure logging for electron-updater
autoUpdater.logger = require("electron-log");
autoUpdater.logger.transports.file.level = "info";

// Initialize electron-store (ESM module, use dynamic import)
let store;
async function initializeStore() {
  const Store = (await import("electron-store")).default;
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
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    autoHideMenuBar: true,
    frame: false,
    show: false, // Don't show until ready
  });

  // Open DevTools for debugging (remove in production)
  mainWindow.webContents.openDevTools();

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  // Error handling
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription, validatedURL) => {
      console.error(
        "Failed to load:",
        errorCode,
        errorDescription,
        validatedURL,
      );
      if (mainWindow && !mainWindow.isDestroyed()) {
        const errorHTML = `
        <div style="padding: 40px; text-align: center; font-family: sans-serif;">
          <h1>Failed to load YouTube</h1>
          <p>Error: ${errorCode} - ${errorDescription}</p>
          <p>URL: ${validatedURL}</p>
          <button onclick="location.reload()" style="padding: 10px 20px; margin-top: 20px; cursor: pointer;">Retry</button>
        </div>
      `;
        mainWindow.webContents
          .executeJavaScript(
            `
        document.body.innerHTML = ${JSON.stringify(errorHTML)};
      `,
          )
          .catch(console.error);
      }
    },
  );

  mainWindow.webContents.on("console-message", (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });

  // Load YouTube
  console.log("Loading YouTube...");
  mainWindow.loadURL("https://www.youtube.com").catch((err) => {
    console.error("Error loading URL:", err);
  });

  // Inject plugins when page finishes loading
  mainWindow.webContents.on("did-finish-load", () => {
    console.log("Page finished loading");
    injectPlugins(mainWindow);
    injectTitlebarOverlay(mainWindow);
  });

  // Handle navigation to ensure plugins are injected on YouTube pages
  mainWindow.webContents.on("did-navigate", () => {
    setTimeout(() => {
      injectPlugins(mainWindow);
      injectTitlebarOverlay(mainWindow);
    }, 1000);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function injectPlugins(window) {
  const plugins = loadPlugins();

  plugins.forEach((plugin, index) => {
    try {
      // Escape backticks and ${} in plugin content to prevent template literal issues
      const escapedContent = plugin.content
        .replace(/\\/g, "\\\\")
        .replace(/`/g, "\\`")
        .replace(/\$\{/g, "\\${");

      const escapedName = plugin.name.replace(/'/g, "\\'");

      // Wrap plugin code in an IIFE to avoid conflicts
      const wrappedCode = `(function() {
  try {
    ${escapedContent}
  } catch (error) {
    console.error('Plugin ${escapedName} error:', error);
  }
})();`;

      window.webContents.executeJavaScript(wrappedCode, true).catch((err) => {
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
  const overlayScript = `
    (function() {
      // Remove existing overlay if present
      const existing = document.getElementById('better-youtube-topbar');
      if (existing) existing.remove();
      const existingStyles = document.getElementById('better-youtube-topbar-styles');
      if (existingStyles) existingStyles.remove();

      // Inject styles
      const style = document.createElement('style');
      style.id = 'better-youtube-topbar-styles';
      style.textContent = \`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

        #better-youtube-topbar {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          height: 48px;
          background: rgba(15, 15, 20, 0.85);
          backdrop-filter: blur(20px) saturate(180%);
          -webkit-backdrop-filter: blur(20px) saturate(180%);
          z-index: 999999;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 12px;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          -webkit-app-region: drag;
        }

        #better-youtube-topbar .nav-controls,
        #better-youtube-topbar .window-controls {
          display: flex;
          align-items: center;
          gap: 2px;
          -webkit-app-region: no-drag;
        }

        #better-youtube-topbar .topbar-btn {
          width: 40px;
          height: 36px;
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.6);
          cursor: pointer;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
        }

        #better-youtube-topbar .topbar-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at center, rgba(255, 255, 255, 0.15), transparent 70%);
          opacity: 0;
          transition: opacity 0.2s;
        }

        #better-youtube-topbar .topbar-btn:hover {
          background: rgba(255, 255, 255, 0.08);
          color: rgba(255, 255, 255, 0.95);
        }

        #better-youtube-topbar .topbar-btn:hover::before {
          opacity: 1;
        }

        #better-youtube-topbar .topbar-btn:active {
          transform: scale(0.92);
          background: rgba(255, 255, 255, 0.12);
        }

        #better-youtube-topbar .topbar-btn svg {
          width: 20px;
          height: 20px;
          stroke-width: 2;
          position: relative;
          z-index: 1;
        }

        #better-youtube-topbar .topbar-btn.settings-btn {
          background: rgba(138, 43, 226, 0.15);
          color: rgba(186, 130, 255, 0.9);
        }

        #better-youtube-topbar .topbar-btn.settings-btn:hover {
          background: rgba(138, 43, 226, 0.25);
          color: #d4a5ff;
        }

        /* Window controls */
        #better-youtube-topbar .window-controls {
          gap: 0;
        }

        #better-youtube-topbar .window-controls .topbar-btn {
          width: 46px;
          height: 36px;
          border-radius: 0;
        }

        #better-youtube-topbar .window-controls .topbar-btn:first-child {
          border-radius: 8px 0 0 8px;
        }

        #better-youtube-topbar .window-controls .topbar-btn:last-child {
          border-radius: 0 8px 8px 0;
        }

        #better-youtube-topbar .topbar-btn.close:hover {
          background: linear-gradient(135deg, #ff4757 0%, #c0392b 100%);
          color: white;
        }

        #better-youtube-topbar .topbar-btn.close:hover::before {
          opacity: 0;
        }

        #better-youtube-topbar .address-bar {
          flex: 1;
          max-width: 600px;
          height: 34px;
          margin: 0 20px;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.5);
          font-size: 13px;
          font-weight: 400;
          padding: 0 16px;
          display: flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          -webkit-app-region: no-drag;
          transition: all 0.2s;
        }

        #better-youtube-topbar .address-bar:hover {
          background: rgba(255, 255, 255, 0.06);
          border-color: rgba(255, 255, 255, 0.12);
        }

        #better-youtube-topbar .address-bar .lock-icon {
          color: rgba(100, 200, 150, 0.8);
          flex-shrink: 0;
        }

        #better-youtube-topbar .address-bar .url-text {
          overflow: hidden;
          text-overflow: ellipsis;
        }

        #better-youtube-topbar .divider {
          width: 1px;
          height: 24px;
          background: linear-gradient(to bottom, transparent, rgba(255, 255, 255, 0.15), transparent);
          margin: 0 8px;
        }

        body {
          padding-top: 48px !important;
        }

        /* Fix for YouTube's masthead */
        #masthead-container,
        ytd-masthead {
          top: 48px !important;
        }

        /* Smooth transitions for icons */
        #better-youtube-topbar .topbar-btn svg {
          transition: transform 0.2s;
        }

        #better-youtube-topbar .topbar-btn:hover svg {
          transform: scale(1.1);
        }

        #better-youtube-topbar .topbar-btn:active svg {
          transform: scale(0.95);
        }
      \`;
      document.head.appendChild(style);

      // Create top bar
      const topbar = document.createElement('div');
      topbar.id = 'better-youtube-topbar';
      topbar.innerHTML = \`
        <div class="nav-controls">
          <button class="topbar-btn" id="btn-back" title="Go Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
          <button class="topbar-btn" id="btn-forward" title="Go Forward">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
          <button class="topbar-btn" id="btn-refresh" title="Refresh">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12a9 9 0 11-3-6.7"/>
              <path d="M21 4v5h-5"/>
            </svg>
          </button>
          <div class="divider"></div>
          <button class="topbar-btn settings-btn" id="btn-settings" title="Settings">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
            </svg>
          </button>
        </div>

        <div class="address-bar" id="address-bar">
          <svg class="lock-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          <span class="url-text">youtube.com</span>
        </div>

        <div class="window-controls">
          <button class="topbar-btn" id="btn-minimize" title="Minimize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
              <path d="M5 12h14"/>
            </svg>
          </button>
          <button class="topbar-btn" id="btn-maximize" title="Maximize">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          </button>
          <button class="topbar-btn close" id="btn-close" title="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
      \`;

      document.body.prepend(topbar);

      // Update address bar with current URL
      const urlText = document.querySelector('#better-youtube-topbar .url-text');
      const updateAddressBar = () => {
        try {
          const url = new URL(window.location.href);
          urlText.textContent = url.hostname + url.pathname;
        } catch(e) {
          urlText.textContent = 'youtube.com';
        }
      };
      updateAddressBar();

      // Add click handlers
      document.getElementById('btn-back').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.goBack) window.electronAPI.goBack();
      });

      document.getElementById('btn-forward').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.goForward) window.electronAPI.goForward();
      });

      document.getElementById('btn-refresh').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.refresh) window.electronAPI.refresh();
      });

      document.getElementById('btn-settings').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.openSettings) window.electronAPI.openSettings();
      });

      document.getElementById('btn-minimize').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.minimize) window.electronAPI.minimize();
      });

      document.getElementById('btn-maximize').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.maximize) window.electronAPI.maximize();
      });

      document.getElementById('btn-close').addEventListener('click', () => {
        if (window.electronAPI && window.electronAPI.close) window.electronAPI.close();
      });
    })();
  `;

  window.webContents.executeJavaScript(overlayScript, true).catch((err) => {
    console.error("Error injecting titlebar overlay:", err);
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
      contextIsolation: true,
    },
    autoHideMenuBar: true,
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
          ${
            plugins.length === 0
              ? '<div class="empty-state"><p>No plugins found</p><p>Add .js files to the plugins directory</p></div>'
              : plugins
                  .map(
                    (plugin) => `
                <div class="plugin-item">
                  <div>
                    <div class="plugin-name">${plugin}</div>
                    <div class="status active">Active</div>
                  </div>
                </div>
              `,
                  )
                  .join("")
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

  settingsWindow.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`,
  );

  settingsWindow.on("closed", () => {
    settingsWindow = null;
  });
}

ipcMain.handle("get-app-version", () => {
  return app.getVersion();
});

// IPC Handlers
ipcMain.handle("open-settings", () => {
  createSettingsWindow();
});

ipcMain.handle("get-plugins", () => {
  return getPluginList();
});

// Navigation IPC Handlers
ipcMain.handle("go-back", () => {
  if (mainWindow && mainWindow.webContents.canGoBack()) {
    mainWindow.webContents.goBack();
  }
});

ipcMain.handle("go-forward", () => {
  if (mainWindow && mainWindow.webContents.canGoForward()) {
    mainWindow.webContents.goForward();
  }
});

ipcMain.handle("refresh", () => {
  if (mainWindow) {
    mainWindow.webContents.reload();
  }
});

// Window Control IPC Handlers
ipcMain.handle("minimize", () => {
  if (mainWindow) {
    mainWindow.minimize();
  }
});

ipcMain.handle("maximize", () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle("close", () => {
  if (mainWindow) {
    mainWindow.close();
  }
});

// App lifecycle
app.whenReady().then(async () => {
  await initializeStore();
  // Initialize adblocker (currently disabled by default)
  // Enable it in settings if needed
  try {
    await initializeAdBlocker();
  } catch (error) {
    console.error(
      "Adblocker initialization failed, continuing without it:",
      error,
    );
  }
  createMainWindow();

  // Check for updates
  autoUpdater.checkForUpdatesAndNotify();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

autoUpdater.on("update-downloaded", (info) => {
  const dialogOpts = {
    type: "info",
    buttons: ["Restart", "Later"],
    title: "Application Update",
    message:
      process.platform === "win32" ? info.releaseNotes : info.releaseName,
    detail:
      "A new version has been downloaded. Restart the application to apply the updates.",
  };

  dialog.showMessageBox(dialogOpts).then((returnValue) => {
    if (returnValue.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
