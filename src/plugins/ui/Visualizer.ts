import { BrowserWindow } from 'electron';
import { BasePlugin } from '../Plugin';
import type { PluginMetadata } from '../Plugin';

/**
 * Visualizer Plugin
 * Audio visualizer using Canvas and Web Audio API
 */
export class Visualizer extends BasePlugin {
  public metadata: PluginMetadata = {
    name: 'visualizer',
    description: 'Audio visualizer with customizable styles',
    version: '1.0.0',
  };

  private getRendererScript(): string {
    const config = JSON.stringify(this.getConfig());
    return `
    (function() {
      'use strict';
      
      const config = ${config};
      if (!config.enabled) return;
      
      let audioContext = null;
      let analyser = null;
      let dataArray = null;
      let canvas = null;
      let ctx = null;
      let animationFrame = null;
      let sourceNode = null;
      let barGradient = null;
      
      // Initialize audio context
      function initAudioContext() {
        if (audioContext) return;
        
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          audioContext = new AudioContext();
          analyser = audioContext.createAnalyser();
          analyser.fftSize = config.fftSize || 256;
          dataArray = new Uint8Array(analyser.frequencyBinCount);
        } catch (error) {
          console.error('Visualizer: Error initializing audio context', error);
        }
      }
      
      // Connect video to audio context
      function connectVideo(video) {
        if (!audioContext || !video || sourceNode) return;
        
        try {
          sourceNode = audioContext.createMediaElementSource(video);
          sourceNode.connect(analyser);
          analyser.connect(audioContext.destination);
        } catch (error) {
          console.error('Visualizer: Error connecting video', error);
        }
      }
      
      // Create canvas
      function createCanvas() {
        if (canvas) return;
        
        if (!document.body) {
          setTimeout(createCanvas, 100);
          return;
        }
        
        try {
          canvas = document.createElement('canvas');
          canvas.id = 'audio-visualizer';
          canvas.style.cssText = \`position: fixed; bottom: 0; left: 0; width: 100%; height: \${config.height || 100}px; z-index: 9998; pointer-events: none; opacity: \${config.opacity || 0.7};\`;
          document.body.appendChild(canvas);
          ctx = canvas.getContext('2d', { alpha: true });
          updateCanvasSize();
          window.addEventListener('resize', updateCanvasSize);
        } catch (error) {
          console.error('Visualizer: Error creating canvas', error);
        }
      }

      function updateCanvasSize() {
        if (!canvas || !ctx) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        
        // Cache gradient - much faster than creating per bar
        barGradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
        barGradient.addColorStop(0, config.colorStart || '#ff0000');
        barGradient.addColorStop(1, config.colorEnd || '#00ff00');
      }
      
      // Draw visualizer
      function draw() {
        if (!analyser || !canvas || !ctx) return;
        
        analyser.getByteFrequencyData(dataArray);
        
        // Use a faster clear method
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const barWidth = (canvas.width / dataArray.length);
        const barSpacing = 1;
        
        ctx.fillStyle = barGradient;

        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height;
          ctx.fillRect(i * (barWidth + barSpacing), canvas.height - barHeight, barWidth, barHeight);
        }
        
        animationFrame = requestAnimationFrame(draw);
      }
      
      // Initialize
      function init() {
        const video = document.querySelector('video');
        if (!video) return;
        
        initAudioContext();
        createCanvas();
        connectVideo(video);
        
        if (audioContext && audioContext.state === 'suspended') {
          const resume = () => {
            audioContext.resume();
            document.removeEventListener('click', resume);
            document.removeEventListener('touchstart', resume);
          };
          document.addEventListener('click', resume);
          document.addEventListener('touchstart', resume);
        }
        
        if (!animationFrame) {
          draw();
        }
      }
      
      // Watch for video element
      let checkVideoTimeout = null;
      const checkForVideo = () => {
        if (checkVideoTimeout) return;
        checkVideoTimeout = setTimeout(() => {
          checkVideoTimeout = null;
          const video = document.querySelector('video');
          if (video && !sourceNode) {
            init();
          }
        }, 1000); // Less frequent check
      };
      
      function setupObserver() {
        try {
          // Observe specifically for player container changes
          const target = document.querySelector('ytd-watch-flexy, #player-container') || document.body;
          const observer = new MutationObserver(checkForVideo);
          observer.observe(target, { childList: true, subtree: target === document.body });
        } catch (error) {
          console.error('Visualizer: Observer error', error);
        }
      }
      
      // Initial check
      function startPlugin() {
        if (!document.body) {
          setTimeout(startPlugin, 100);
          return;
        }
        setTimeout(init, 1500);
        setupObserver();
      }
      
      // Efficient navigation tracking
      let lastUrl = location.href;
      const checkNavigation = () => {
        const currentUrl = location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
          if (animationFrame) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
          }
          sourceNode = null;
          setTimeout(init, 1500);
        }
      };
      
      window.addEventListener('popstate', checkNavigation);
      // YouTube specific navigation event
      window.addEventListener('yt-navigate-finish', checkNavigation);
      
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startPlugin);
      } else {
        startPlugin();
      }
    })();
    `;
  }

  public async onRendererLoaded(window: BrowserWindow): Promise<void> {
    if (!this.isEnabled()) return;
    await this.injectRendererScript(window, this.getRendererScript());
  }

  public getConfig() {
    return {
      height: 100,
      opacity: 0.7,
      fftSize: 256,
      colorStart: '#ff0000',
      colorEnd: '#00ff00',
      ...super.getConfig(),
    };
  }
}

