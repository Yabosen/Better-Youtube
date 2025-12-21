import { BrowserWindow, ipcMain } from 'electron';
import { BasePlugin } from '../Plugin';
import type { PluginMetadata } from '../Plugin';
import { Client } from '@xhayper/discord-rpc';

/**
 * Discord Rich Presence Plugin
 * Shows "Watching [Video]" on Discord using @xhayper/discord-rpc
 */
export class DiscordRPCPlugin extends BasePlugin {
  public metadata: PluginMetadata = {
    name: 'discord-rpc',
    description: 'Show what you\'re watching on Discord',
    version: '2.1.1',
  };

  private rpc: Client | null = null;
  private isReady = false;
  private currentVideo: {
    id: string;
    title: string;
    channel: string;
    startTime: number;
  } | null = null;

  public async onAppReady(): Promise<void> {
    console.log('DiscordRPC: onAppReady called, enabled:', this.isEnabled());
    
    // Register IPC handler for video updates from renderer (only once)
    if (!ipcMain.listenerCount('discord-rpc-update-video')) {
      console.log('DiscordRPC: Registering IPC handlers');
      
      // Store reference to plugin instance for IPC handlers
      const pluginInstance = this;
      
      ipcMain.handle('discord-rpc-update-video', (_event, videoData: any) => {
        console.log('DiscordRPC: 📥 Received video update from renderer:', {
          id: videoData?.id,
          title: videoData?.title?.substring(0, 40) + '...',
          channel: videoData?.channel
        });
        if (pluginInstance.isEnabled()) {
          pluginInstance.updatePresence(videoData);
        } else {
          console.log('DiscordRPC: Plugin is disabled, ignoring update');
        }
        return true; // Return success
      });

      ipcMain.handle('discord-rpc-clear', () => {
        console.log('DiscordRPC: Received clear request');
        if (pluginInstance.isEnabled()) {
          pluginInstance.clearPresence();
        }
      });
    } else {
      console.log('DiscordRPC: IPC handlers already registered');
    }

    // Initialize if enabled
    if (this.isEnabled()) {
      console.log('DiscordRPC: Plugin is enabled, initializing...');
      await this.initializeRPC();
    } else {
      console.log('DiscordRPC: Plugin is disabled, skipping initialization');
    }
  }

  private async initializeRPC(): Promise<void> {
    // Shutdown existing connection if any
    if (this.rpc) {
      await this.shutdown();
    }

    try {
      const config = this.getConfig();
      // Default Client ID for Better YouTube - works out of the box for all users
      // Users can override this in settings if they want to use their own Discord app
      const defaultClientId = '1450804946348933324';
      const clientId = (config.clientId && config.clientId !== 'YOUR_DISCORD_CLIENT_ID' && config.clientId.trim() !== '') 
        ? config.clientId.trim() 
        : defaultClientId;
      
      console.log('DiscordRPC: Initializing with Client ID:', clientId.substring(0, 10) + '...');

      this.rpc = new Client({ clientId });

      this.rpc.on('ready', () => {
        this.isReady = true;
        console.log('DiscordRPC: ✅ Connected successfully to Discord!');
        console.log('DiscordRPC: User:', this.rpc?.user ? 'available' : 'null');
        console.log('DiscordRPC: Application:', this.rpc?.application ? 'available' : 'null');
        
        // Test with a simple presence update
        this.testPresence();
        
        if (this.currentVideo) {
          this.updatePresence(this.currentVideo);
        }
        
        // Start connection monitoring
        this.startConnectionMonitoring();
      });

      this.rpc.on('error', (error: any) => {
        console.error('DiscordRPC: ❌ Error event:', error);
        this.isReady = false;
      });

      this.rpc.on('disconnected', () => {
        console.log('DiscordRPC: ⚠️ Disconnected - attempting to reconnect...');
        this.isReady = false;
        // Try to reconnect immediately and then retry
        const attemptReconnect = () => {
          if (this.isEnabled() && this.rpc) {
            console.log('DiscordRPC: Attempting to reconnect...');
            this.rpc.connect().then(() => {
              console.log('DiscordRPC: ✅ Reconnected successfully');
              // Check connection state after reconnect
              setTimeout(() => {
                if (this.rpc && this.rpc.isConnected && this.rpc.user && !this.isReady) {
                  console.log('DiscordRPC: Manually setting ready after reconnect');
                  this.isReady = true;
                  if (this.currentVideo) {
                    this.updatePresence(this.currentVideo);
                  }
                }
              }, 2000);
            }).catch((err: any) => {
              console.error('DiscordRPC: Reconnection failed, retrying in 5s:', err);
              setTimeout(attemptReconnect, 5000);
            });
          }
        };
        attemptReconnect();
      });
      
      // Also listen for connected event
      this.rpc.on('connected', () => {
        console.log('DiscordRPC: 🔌 Connected event fired');
      });

      // Try to connect
      console.log('DiscordRPC: Attempting to connect to Discord...');
      try {
        await this.rpc.connect();
        console.log('DiscordRPC: Connect call completed, waiting for ready event...');
        // Give it a moment to emit the ready event
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!this.isReady) {
          console.warn('DiscordRPC: Connected but ready event not fired. Checking connection state...');
          console.warn('DiscordRPC: isConnected:', this.rpc.isConnected);
          console.warn('DiscordRPC: user:', this.rpc.user ? 'exists' : 'null');
          
          // If connected but ready event didn't fire, manually set ready state
          if (this.rpc.isConnected && this.rpc.user) {
            console.log('DiscordRPC: Manually setting ready state since connection is established');
            this.isReady = true;
            this.testPresence();
            if (this.currentVideo) {
              this.updatePresence(this.currentVideo);
            }
          }
        }
      } catch (error: any) {
        console.error('DiscordRPC: Connection failed:', error);
        console.error('DiscordRPC: Error details:', {
          message: error?.message,
          code: error?.code,
          name: error?.name,
          errno: error?.errno,
          syscall: error?.syscall,
          stack: error?.stack?.substring(0, 500)
        });
        console.error('DiscordRPC: Troubleshooting:');
        console.error('  1. Make sure Discord desktop app is running (not browser)');
        console.error('  2. Make sure you\'re logged into Discord');
        console.error('  3. Check Discord Settings > Activity Privacy > Display current activity');
        console.error('  4. Try restarting Discord');
        this.rpc = null;
        this.isReady = false;
      }
    } catch (error) {
      console.error('DiscordRPC: Error initializing:', error);
      this.rpc = null;
      this.isReady = false;
    }
  }

  public async onConfigChanged(): Promise<void> {
    // Reinitialize when config changes (e.g., Client ID is set)
    if (this.isEnabled()) {
      await this.initializeRPC();
    } else {
      await this.shutdown();
    }
  }

  public async onRendererLoaded(window: BrowserWindow): Promise<void> {
    if (!this.isEnabled()) {
      console.log('DiscordRPC: Plugin disabled, skipping renderer script injection');
      return;
    }

    console.log('DiscordRPC: 🚀 Injecting renderer script...');
    const script = this.getRendererScript();
    try {
      // Wait a bit for page to be ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Check if page is YouTube
      const url = window.webContents.getURL();
      if (!url.includes('youtube.com')) {
        console.log('DiscordRPC: Not on YouTube, skipping injection');
        return;
      }
      
      console.log('DiscordRPC: Page URL:', url);
      await window.webContents.executeJavaScript(script, true);
      console.log('DiscordRPC: ✅ Renderer script injected successfully');
      
      // Also inject after a delay to catch late navigation
      setTimeout(async () => {
        try {
          const currentUrl = window.webContents.getURL();
          if (currentUrl.includes('youtube.com')) {
            await window.webContents.executeJavaScript(script, true);
            console.log('DiscordRPC: ✅ Renderer script re-injected after delay');
          }
        } catch (err) {
          console.error('DiscordRPC: ❌ Error re-injecting script:', err);
        }
      }, 3000);
      
      // Also expose test functions for manual testing
      await window.webContents.executeJavaScript(`
        (function() {
          window.testDiscordRPC = function() {
            console.log('[DiscordRPC Test] Manual test triggered');
            if (window.electronAPI && window.electronAPI.invoke) {
              window.electronAPI.invoke('discord-rpc-update-video', {
                id: 'test123',
                title: 'Test Video - Discord RPC Working!',
                channel: 'Test Channel',
                startTime: Date.now()
              }).then(() => {
                console.log('[DiscordRPC Test] Test update sent');
              }).catch((err) => {
                console.error('[DiscordRPC Test] Error:', err);
              });
            } else {
              console.error('[DiscordRPC Test] electronAPI not available');
            }
          };
          
          window.debugDiscordRPC = function() {
            console.log('[DiscordRPC Debug] Current state:', {
              url: window.location.href,
              videoId: new URLSearchParams(window.location.search).get('v'),
              hasElectronAPI: !!window.electronAPI,
              hasInvoke: !!(window.electronAPI && window.electronAPI.invoke)
            });
            
            // Try to get video info
            const videoId = new URLSearchParams(window.location.search).get('v');
            const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, h1.ytd-video-primary-info-renderer yt-formatted-string');
            const channelEl = document.querySelector('ytd-channel-name #text a, ytd-video-owner-renderer .ytd-channel-name a');
            
            console.log('[DiscordRPC Debug] Video info:', {
              videoId: videoId,
              title: titleEl?.textContent?.trim() || 'not found',
              channel: channelEl?.textContent?.trim() || 'not found'
            });
          };
          
          console.log('[DiscordRPC] Test functions available:');
          console.log('  - window.testDiscordRPC() - Send test presence');
          console.log('  - window.debugDiscordRPC() - Debug current state');
        })();
      `, true);
    } catch (error) {
      console.error('DiscordRPC: Error injecting renderer script:', error);
    }
  }

  private getRendererScript(): string {
    // Escape the config JSON to prevent syntax errors
    const configJson = JSON.stringify(this.getConfig()).replace(/`/g, '\\`').replace(/\$/g, '\\$');
    
    return `
    (function() {
      console.log('[DiscordRPC Renderer] 🚀 Script starting...');
      
      // Prevent multiple injections
      if (window.__discordRPCInjected) {
        console.log('[DiscordRPC Renderer] ⚠️ Script already injected, skipping');
        return;
      }
      window.__discordRPCInjected = true;
      
      try {
        // Verify electronAPI is available
        if (!window.electronAPI) {
          console.error('[DiscordRPC Renderer] ❌ CRITICAL: window.electronAPI is not available!');
          console.error('[DiscordRPC Renderer] This means the preload script did not load correctly.');
          return;
        }
        
        if (!window.electronAPI.invoke) {
          console.error('[DiscordRPC Renderer] ❌ CRITICAL: window.electronAPI.invoke is not available!');
          return;
        }
        
        console.log('[DiscordRPC Renderer] ✅ electronAPI is available');
        
        const config = ${configJson};
        console.log('[DiscordRPC Renderer] Config:', config);
        if (!config.enabled) {
          console.log('[DiscordRPC Renderer] Plugin disabled in config');
          return;
        }
        console.log('[DiscordRPC Renderer] Plugin enabled, initializing...');

      let currentVideoId = null;
      let currentVideo: any = null;
      let startTime: number | null = null;
      let updateTimeout: any = null;

      function getVideoId(): string | null {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
      }

      function getVideoInfo() {
        const currentUrl = window.location.href;
        const videoId = getVideoId();
        
        console.log('[DiscordRPC Renderer] 🔍 getVideoInfo called:', {
          url: currentUrl.substring(0, 80),
          videoId: videoId || 'none',
          isWatchPage: currentUrl.includes('/watch') || currentUrl.includes('/shorts/')
        });
        
        if (!videoId) {
          console.log('[DiscordRPC Renderer] ❌ No video ID found in URL');
          return null;
        }
        
        // Make sure we're actually on a watch page
        if (!currentUrl.includes('/watch') && !currentUrl.includes('/shorts/')) {
          console.log('[DiscordRPC Renderer] ❌ Not on watch or shorts page');
          return null;
        }

        // Get video title - try multiple selectors (YouTube changes these frequently)
        let titleElement = null;
        let title = '';
        
        // Try comprehensive list of selectors
        const titleSelectors = [
          'h1.ytd-watch-metadata yt-formatted-string',
          'h1.ytd-video-primary-info-renderer yt-formatted-string',
          'h1.title.style-scope.ytd-video-primary-info-renderer',
          'h1.ytd-watch-metadata',
          'h1.ytd-video-primary-info-renderer',
          'ytd-watch-metadata h1',
          'ytd-watch-metadata h1 yt-formatted-string',
          '#title h1',
          '#title yt-formatted-string',
          '#title',
          'ytd-watch-flexy h1',
          'ytd-watch-flexy h1 yt-formatted-string',
          'ytd-watch-flexy #title',
          'ytd-watch-flexy #title yt-formatted-string',
          'ytd-watch-flexy #title-container h1',
          'ytd-watch-flexy #title-container yt-formatted-string',
          '#above-the-fold h1',
          '#above-the-fold yt-formatted-string'
        ];
        
        // Try all selectors
        for (const selector of titleSelectors) {
          titleElement = document.querySelector(selector);
          if (titleElement) {
            // Try multiple ways to get text (handles shadow DOM)
            title = titleElement.textContent?.trim() || 
                    titleElement.innerText?.trim() || 
                    (titleElement as any).innerHTML?.replace(/<[^>]*>/g, '').trim() || '';
            if (title && title.length > 0 && title !== 'YouTube') {
              break;
            }
          }
        }
        
        // Also try getting from watch-flexy container directly
        if (!title || title === 'YouTube') {
          const watchFlexy = document.querySelector('ytd-watch-flexy');
          if (watchFlexy) {
            // Try all h1 elements in watch-flexy
            const h1Elements = watchFlexy.querySelectorAll('h1');
            for (const h1 of Array.from(h1Elements)) {
              const text = h1.textContent?.trim() || h1.innerText?.trim() || '';
              if (text && text.length > 0 && text !== 'YouTube') {
                title = text;
                titleElement = h1;
                break;
              }
            }
            
            // Also try yt-formatted-string elements
            if (!title || title === 'YouTube') {
              const formattedStrings = watchFlexy.querySelectorAll('yt-formatted-string');
              for (const fs of Array.from(formattedStrings)) {
                const text = fs.textContent?.trim() || fs.innerText?.trim() || '';
                // Filter out short text (likely not the title)
                if (text && text.length > 10 && text !== 'YouTube') {
                  title = text;
                  titleElement = fs;
                  break;
                }
              }
            }
          }
        }
        
        // Fallback to document title (but clean it up)
        if (!title || title === 'YouTube' || title.length < 3) {
          const docTitle = document.title.replace(' - YouTube', '').trim();
          if (docTitle && docTitle.length > 3 && docTitle !== 'YouTube') {
            title = docTitle;
            console.log('[DiscordRPC Renderer] Using document.title as fallback');
          }
        }
        
        if (title && title !== 'YouTube' && title.length > 3) {
          console.log('[DiscordRPC Renderer] ✅ Video title found:', title.substring(0, 60) + (title.length > 60 ? '...' : ''));
        } else {
          console.warn('[DiscordRPC Renderer] ❌ Video title NOT FOUND');
          console.warn('[DiscordRPC Renderer] Available elements:', {
            hasWatchFlexy: !!document.querySelector('ytd-watch-flexy'),
            hasH1: !!document.querySelector('h1'),
            docTitle: document.title
          });
        }

        // Get channel name - try multiple selectors
        let channelElement = null;
        const channelSelectors = [
          'ytd-channel-name #text a',
          'ytd-video-owner-renderer .ytd-channel-name a',
          '#channel-name a',
          'ytd-channel-name a',
          '#owner-sub-count',
          'ytd-channel-name',
          'ytd-video-owner-renderer #channel-name',
          '#owner-container #channel-name',
          'ytd-watch-flexy ytd-channel-name a',
          'ytd-watch-flexy #channel-name'
        ];
        
        for (const selector of channelSelectors) {
          channelElement = document.querySelector(selector);
          if (channelElement) {
            const text = channelElement.textContent?.trim() || channelElement.innerText?.trim();
            if (text && text.length > 0) {
              break;
            }
          }
        }
        
        const channel = (channelElement?.textContent?.trim() || channelElement?.innerText?.trim() || 'Unknown Channel');
        console.log('[DiscordRPC Renderer] Channel found:', channel);

        return { id: videoId, title, channel };
      }

      function updateDiscordRPC() {
        if (updateTimeout) {
          clearTimeout(updateTimeout);
        }

        updateTimeout = setTimeout(() => {
          const currentUrl = window.location.href;
          const videoInfo = getVideoInfo();
          
          console.log('[DiscordRPC Renderer] 🔍 updateDiscordRPC called:', {
            url: currentUrl.substring(0, 60) + '...',
            hasVideoInfo: !!videoInfo,
            videoId: videoInfo?.id || 'none',
            title: videoInfo?.title?.substring(0, 30) || 'none'
          });
          
          if (!videoInfo || !videoInfo.id) {
            // Not on a video page, clear presence only if we had one
            if (currentVideoId) {
              console.log('[DiscordRPC Renderer] ⚠️ No video detected, clearing presence');
              currentVideoId = null;
              currentVideo = null;
              startTime = null;
              if (window.electronAPI && window.electronAPI.invoke) {
                window.electronAPI.invoke('discord-rpc-clear').catch(() => {});
              }
            }
            return;
          }
          
          // Video changed or first time detecting
          const videoChanged = videoInfo.id !== currentVideoId;
          if (videoChanged) {
            console.log('[DiscordRPC Renderer] 🎬 Video changed:', {
              oldId: currentVideoId,
              newId: videoInfo.id
            });
            currentVideoId = videoInfo.id;
            currentVideo = videoInfo;
            startTime = Date.now();
          }

          // Validate video info - but be more lenient (allow sending even if title is missing initially)
          if (!videoInfo.title || videoInfo.title.trim() === '' || videoInfo.title === 'YouTube') {
            console.warn('[DiscordRPC Renderer] ⚠️ Video has no valid title yet, using fallback...');
            // Use a fallback title instead of skipping
            videoInfo.title = 'YouTube Video';
            // Still retry to get the real title
            setTimeout(updateDiscordRPC, 2000);
          }

          // Always send update when we have video info (even if same video, in case title/channel changed)
          if (!window.electronAPI) {
            console.error('[DiscordRPC Renderer] ❌ window.electronAPI is not available!');
            console.error('[DiscordRPC Renderer] This means the preload script did not load correctly.');
            return;
          }
          
          if (!window.electronAPI.invoke) {
            console.error('[DiscordRPC Renderer] ❌ window.electronAPI.invoke is not available!');
            return;
          }
          
          if (!videoInfo) {
            console.warn('[DiscordRPC Renderer] ⚠️ No video info to send');
            return;
          }
          
          // Make sure we have valid data (be lenient with title)
          if (!videoInfo.id) {
            console.warn('[DiscordRPC Renderer] ⚠️ No video ID, skipping');
            return;
          }
          
          // Use fallback title if missing
          if (!videoInfo.title || videoInfo.title.trim() === '' || videoInfo.title === 'YouTube') {
            videoInfo.title = 'YouTube Video';
          }
          
          console.log('[DiscordRPC Renderer] ✅ Sending video update:', {
            id: videoInfo.id,
            title: videoInfo.title.substring(0, 50) + (videoInfo.title.length > 50 ? '...' : ''),
            channel: videoInfo.channel,
            changed: videoChanged
          });
          
          window.electronAPI.invoke('discord-rpc-update-video', {
            id: videoInfo.id,
            title: videoInfo.title,
            channel: videoInfo.channel,
            startTime: startTime || Date.now()
          }).then(() => {
            console.log('[DiscordRPC Renderer] ✅✅✅ Update sent successfully to main process!');
          }).catch((err: any) => {
            console.error('[DiscordRPC Renderer] ❌ Failed to send update:', err);
            console.error('[DiscordRPC Renderer] Error details:', {
              message: err?.message,
              stack: err?.stack
            });
          });
        }, 1000); // Debounce updates
      }

      // Watch for video changes
      function watchVideo() {
        if (!document.body) {
          setTimeout(watchVideo, 100);
          return;
        }

        // Initial check immediately
        console.log('[DiscordRPC Renderer] Initial check on watchVideo start');
        updateDiscordRPC();
        
        // Also check after a short delay to catch late-loading content
        setTimeout(() => {
          console.log('[DiscordRPC Renderer] Delayed check for late-loading content');
          updateDiscordRPC();
        }, 2000);

        // Watch for URL changes (SPA navigation)
        let lastUrl = location.href;
        const checkNavigation = () => {
          const currentUrl = location.href;
          if (currentUrl !== lastUrl) {
            lastUrl = currentUrl;
            currentVideoId = null;
            currentVideo = null;
            startTime = null;
            setTimeout(updateDiscordRPC, 1000);
          }
        };

        // Use multiple methods to detect navigation (YouTube SPA)
        window.addEventListener('popstate', checkNavigation);
        window.addEventListener('hashchange', checkNavigation);
        
        // Also listen for YouTube's navigation events
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        
        history.pushState = function(...args) {
          originalPushState.apply(history, args);
          console.log('[DiscordRPC Renderer] pushState detected, checking navigation');
          setTimeout(checkNavigation, 200);
          setTimeout(updateDiscordRPC, 500);
        };
        
        history.replaceState = function(...args) {
          originalReplaceState.apply(history, args);
          console.log('[DiscordRPC Renderer] replaceState detected, checking navigation');
          setTimeout(checkNavigation, 200);
          setTimeout(updateDiscordRPC, 500);
        };
        
        // Also listen for yt-navigate events (YouTube's custom events)
        document.addEventListener('yt-navigate-start', () => {
          console.log('[DiscordRPC Renderer] yt-navigate-start detected');
        });
        
        document.addEventListener('yt-navigate-finish', () => {
          console.log('[DiscordRPC Renderer] yt-navigate-finish detected, updating RPC');
          setTimeout(updateDiscordRPC, 1000);
        });
        
        // MutationObserver for DOM changes (video info updates)
        const observer = new MutationObserver(() => {
          updateDiscordRPC();
        });

        const videoInfoContainer = document.querySelector('ytd-watch-flexy, ytd-watch-metadata, ytd-video-primary-info-renderer');
        if (videoInfoContainer) {
          observer.observe(videoInfoContainer, {
            childList: true,
            subtree: true
          });
        } else {
          observer.observe(document.body, {
            childList: true,
            subtree: false
          });
        }

        // Periodic check (fallback) - more frequent to catch videos
        let checkCount = 0;
        setInterval(() => {
          checkCount++;
          const url = window.location.href;
          const hasVideo = url.includes('/watch') || url.includes('/shorts/');
          const videoId = getVideoId();
          
          // Log every 5th check to reduce spam
          if (checkCount % 5 === 0) {
            console.log('[DiscordRPC Renderer] 🔄 Periodic check #' + checkCount + ':', {
              url: url.substring(0, 80),
              hasVideo: hasVideo,
              videoId: videoId || 'none',
              currentVideoId: currentVideoId || 'none'
            });
          }
          
          updateDiscordRPC();
        }, 2000); // Check every 2 seconds
      }

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          console.log('[DiscordRPC Renderer] DOMContentLoaded, starting watchVideo');
          setTimeout(watchVideo, 500);
        });
      } else {
        console.log('[DiscordRPC Renderer] DOM already loaded, starting watchVideo');
        setTimeout(watchVideo, 500);
      }
      
      console.log('[DiscordRPC Renderer] ✅ Script initialization complete');
      
      // Expose debug function
      (window as any).debugDiscordRPC = function() {
        console.log('[DiscordRPC Renderer] 🔍 Debug Info:', {
          hasElectronAPI: !!window.electronAPI,
          hasInvoke: !!(window.electronAPI && window.electronAPI.invoke),
          currentUrl: window.location.href,
          videoId: getVideoId(),
          currentVideoId: currentVideoId,
          currentVideo: currentVideo,
          documentReady: document.readyState
        });
        const info = getVideoInfo();
        console.log('[DiscordRPC Renderer] Current video info:', info);
        return info;
      };
      
      console.log('[DiscordRPC Renderer] 💡 Run window.debugDiscordRPC() in console to debug');
      } catch (error) {
        console.error('[DiscordRPC Renderer] ❌ Error in script:', error);
        console.error('[DiscordRPC Renderer] Error stack:', error?.stack);
      }
    })();
    `;
  }

  private async updatePresence(videoData: {
    id: string;
    title: string;
    channel: string;
    startTime: number;
  }): Promise<void> {
    console.log('DiscordRPC: updatePresence called', {
      hasRPC: !!this.rpc,
      isReady: this.isReady,
      hasUser: !!this.rpc?.user,
      videoId: videoData.id,
      title: videoData.title.substring(0, 50) + '...'
    });
    
    if (!this.rpc) {
      console.warn('DiscordRPC: RPC client is null, storing video data for later');
      this.currentVideo = videoData;
      return;
    }
    
    if (!this.isReady) {
      console.warn('DiscordRPC: Not ready yet, storing video data');
      this.currentVideo = videoData;
      return;
    }
    
    if (!this.rpc.user) {
      console.warn('DiscordRPC: User object is null, storing video data');
      this.currentVideo = videoData;
      return;
    }

    try {
      // Truncate title if too long (Discord limit is 128 chars for details)
      const title = videoData.title.length > 120 
        ? videoData.title.substring(0, 120) + '...' 
        : videoData.title;

      // Truncate channel if too long (Discord limit is 128 chars for state)
      const channel = videoData.channel.length > 120 
        ? videoData.channel.substring(0, 120) + '...' 
        : videoData.channel;

      // Format activity according to SetActivity type
      // Note: startTimestamp should be a Date or number (milliseconds since epoch)
      const startTimestamp = videoData.startTime 
        ? (typeof videoData.startTime === 'number' ? new Date(videoData.startTime) : videoData.startTime)
        : undefined;
      
      const activity = {
        details: 'Watching',
        state: title,
        largeImageKey: 'youtube', // Use uploaded asset from Discord Developer Portal
        largeImageText: title, // Video title on hover
        smallImageKey: 'youtube',
        smallImageText: channel, // Channel name on hover
        startTimestamp: startTimestamp,
        buttons: [
          {
            label: 'Watch Video',
            url: `https://www.youtube.com/watch?v=${videoData.id}`
          }
        ],
        type: 3 as const // ActivityType.Watching (3)
      };
      
      console.log('DiscordRPC: Setting activity:', {
        details: activity.details.substring(0, 30) + '...',
        state: activity.state,
        hasButtons: activity.buttons.length > 0
      });
      
      // Note: pid is optional, but we pass it to ensure proper tracking
      const result = await this.rpc.user.setActivity(activity, process.pid);
      console.log('DiscordRPC: ✅ Activity set successfully!', {
        hasResult: !!result,
        resultState: result?.state?.substring(0, 30) + '...'
      });

      this.currentVideo = videoData;
    } catch (error: any) {
      console.error('DiscordRPC: Error updating presence:', error);
      console.error('DiscordRPC: Error details:', {
        message: error?.message,
        code: error?.code,
        name: error?.name
      });
    }
  }

  private async testPresence(): Promise<void> {
    if (!this.rpc || !this.isReady || !this.rpc.user) {
      console.log('DiscordRPC: Cannot test presence - not ready');
      return;
    }

    try {
      console.log('DiscordRPC: Testing presence with simple message...');
      await this.rpc.user.setActivity({
        details: 'Watching',
        state: 'Better YouTube',
        largeImageKey: 'youtube',
        largeImageText: 'Better YouTube',
        smallImageKey: 'youtube',
        smallImageText: 'Ready to watch',
        type: 3 as const // ActivityType.Watching
      }, process.pid);
      console.log('DiscordRPC: ✅ Test presence set successfully! Check Discord now.');
    } catch (error: any) {
      console.error('DiscordRPC: Error setting test presence:', error);
    }
  }

  private async clearPresence(): Promise<void> {
    if (!this.rpc || !this.isReady || !this.rpc.user) {
      return;
    }

    try {
      await this.rpc.user.clearActivity(process.pid);
      this.currentVideo = null;
    } catch (error) {
      console.error('DiscordRPC: Error clearing presence:', error);
    }
  }

  public async onDisabled(): Promise<void> {
    await this.clearPresence();
    await this.shutdown();
  }

  private connectionMonitorInterval: NodeJS.Timeout | null = null;
  private presenceKeepaliveInterval: NodeJS.Timeout | null = null;

  private startConnectionMonitoring(): void {
    // Clear any existing monitor
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
    }
    
    // Monitor connection every 10 seconds
    this.connectionMonitorInterval = setInterval(() => {
      if (!this.rpc) {
        console.warn('DiscordRPC: ⚠️ RPC client is null');
        return;
      }
      
      const isConnected = this.rpc.isConnected;
      const hasUser = !!this.rpc.user;
      
      if (!isConnected || !hasUser) {
        console.warn('DiscordRPC: ⚠️ Connection check failed:', {
          isConnected,
          hasUser,
          isReady: this.isReady
        });
        
        if (!isConnected && this.isEnabled()) {
          console.log('DiscordRPC: Attempting to reconnect...');
          this.rpc.connect().catch((err: any) => {
            console.error('DiscordRPC: Reconnection failed:', err);
          });
        }
      }
    }, 10000);
    
    // Keepalive - refresh presence every 30 seconds to prevent Discord from clearing it
    if (this.presenceKeepaliveInterval) {
      clearInterval(this.presenceKeepaliveInterval);
    }
    
    this.presenceKeepaliveInterval = setInterval(() => {
      if (this.isReady && this.currentVideo && this.rpc && this.rpc.user) {
        console.log('DiscordRPC: 🔄 Keepalive - refreshing presence to prevent Discord from clearing it');
        // Refresh the presence even when window is not focused
        this.updatePresence(this.currentVideo).catch((err: any) => {
          console.error('DiscordRPC: Keepalive failed:', err);
          // If keepalive fails, connection might be lost - try to reconnect
          if (this.rpc && !this.rpc.isConnected) {
            console.log('DiscordRPC: Connection lost during keepalive, reconnecting...');
            this.rpc.connect().catch(() => {});
          }
        });
      } else if (this.currentVideo) {
        console.warn('DiscordRPC: ⚠️ Keepalive skipped - not ready:', {
          isReady: this.isReady,
          hasVideo: !!this.currentVideo,
          hasRPC: !!this.rpc,
          hasUser: !!this.rpc?.user
        });
      }
    }, 20000); // Refresh every 20 seconds to prevent Discord from clearing
  }

  private async shutdown(): Promise<void> {
    if (this.connectionMonitorInterval) {
      clearInterval(this.connectionMonitorInterval);
      this.connectionMonitorInterval = null;
    }
    
    if (this.presenceKeepaliveInterval) {
      clearInterval(this.presenceKeepaliveInterval);
      this.presenceKeepaliveInterval = null;
    }
    
    if (this.rpc) {
      try {
        await this.rpc.destroy();
      } catch (error) {
        console.error('DiscordRPC: Error shutting down:', error);
      }
      this.rpc = null;
      this.isReady = false;
    }
  }

  public getConfig() {
    // Default Client ID for Better YouTube - works out of the box for all users
    // Users can override this in settings if they want to use their own Discord app
    const defaultClientId = '1450804946348933324';
    const savedConfig = super.getConfig();
    return {
      clientId: savedConfig.clientId || defaultClientId,
      ...savedConfig,
    };
  }
}

