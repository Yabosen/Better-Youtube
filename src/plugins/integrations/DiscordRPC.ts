import { BrowserWindow } from 'electron';
import { BasePlugin } from '../Plugin';
import type { PluginMetadata } from '../Plugin';

// Discord RPC - using discord-rpc package
const DiscordRPC = require('discord-rpc');

/**
 * Discord Rich Presence Plugin
 * Shows "Watching [Video]" on Discord
 */
export class DiscordRPCPlugin extends BasePlugin {
  public metadata: PluginMetadata = {
    name: 'discord-rpc',
    description: 'Show what you\'re watching on Discord',
    version: '1.0.0',
  };

  private rpc: any = null;
  private isReady = false;
  private currentTitle = '';

  public async onAppReady(): Promise<void> {
    if (!this.isEnabled()) return;

    try {
      const config = this.getConfig();
      const clientId = config.clientId || 'YOUR_DISCORD_CLIENT_ID';
      
      if (clientId === 'YOUR_DISCORD_CLIENT_ID') {
        console.warn('DiscordRPC: Please set your Discord Client ID in settings');
        return;
      }

      this.rpc = new DiscordRPC.Client({ transport: 'ipc' });

      this.rpc.on('ready', () => {
        this.isReady = true;
        console.log('DiscordRPC: Connected');
        if (this.currentTitle) {
          this.updatePresence(this.currentTitle);
        }
      });

      await this.rpc.login({ clientId }).catch(() => {
        console.log('DiscordRPC: Not connected (Discord may not be running)');
        this.rpc = null;
      });
    } catch (error) {
      console.error('DiscordRPC: Error initializing:', error);
      this.rpc = null;
    }
  }

  public async onRendererLoaded(window: BrowserWindow): Promise<void> {
    if (!this.isEnabled()) return;

    // Listen for title changes
    window.webContents.on('page-title-updated', (event, title) => {
      this.updatePresence(title);
    });
  }

  private async updatePresence(title: string): Promise<void> {
    if (!this.rpc || !this.isReady) {
      this.currentTitle = title;
      return;
    }

    try {
      // Extract video title from YouTube page title
      const videoTitle = title.replace(' - YouTube', '').trim();
      
      await this.rpc.setActivity({
        details: `Watching ${videoTitle}`,
        state: 'on YouTube',
        largeImageKey: 'youtube',
        largeImageText: 'YouTube',
        startTimestamp: Date.now(),
        instance: false,
      });
    } catch (error) {
      console.error('DiscordRPC: Error updating presence:', error);
    }
  }

  public async onDisabled(): Promise<void> {
    await this.shutdown();
  }

  private async shutdown(): Promise<void> {
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
    return {
      clientId: 'YOUR_DISCORD_CLIENT_ID', // User must set this
      ...super.getConfig(),
    };
  }
}

