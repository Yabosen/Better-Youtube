// Volume Booster Plugin
// Boosts audio volume using Web Audio API

(function() {
  'use strict';

  let audioContext = null;
  let gainNode = null;
  let sourceNode = null;
  let mediaElementSource = null;
  let boostLevel = 1.5; // 1.5x boost by default

  // Initialize Web Audio API
  function initAudioContext() {
    if (audioContext) {
      return;
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContext();
      
      gainNode = audioContext.createGain();
      gainNode.gain.value = boostLevel;
      gainNode.connect(audioContext.destination);
    } catch (error) {
      console.error('Volume Booster: Error initializing audio context', error);
    }
  }

  // Connect video element to audio context
  function connectVideo(video) {
    if (!audioContext || !video || mediaElementSource) {
      return;
    }

    try {
      // Disconnect existing source if any
      if (sourceNode) {
        sourceNode.disconnect();
      }

      // Create media element source
      mediaElementSource = audioContext.createMediaElementSource(video);
      sourceNode = mediaElementSource;
      
      // Connect: video -> gain -> destination
      sourceNode.connect(gainNode);
      
      // Disconnect video's direct connection to speakers
      // (This is handled automatically by createMediaElementSource)
    } catch (error) {
      console.error('Volume Booster: Error connecting video', error);
      // If error, try to reconnect
      mediaElementSource = null;
    }
  }

  // Set boost level
  function setBoostLevel(level) {
    boostLevel = Math.max(0.1, Math.min(5.0, level)); // Clamp between 0.1 and 5.0
    if (gainNode) {
      gainNode.gain.value = boostLevel;
    }
  }

  // Initialize
  function init() {
    const video = document.querySelector('video');
    if (!video) {
      return;
    }

    initAudioContext();
    
    if (audioContext && audioContext.state === 'suspended') {
      // Resume audio context on user interaction
      const resumeAudio = () => {
        audioContext.resume();
        document.removeEventListener('click', resumeAudio);
        document.removeEventListener('touchstart', resumeAudio);
      };
      document.addEventListener('click', resumeAudio);
      document.addEventListener('touchstart', resumeAudio);
    }

    connectVideo(video);

    // Reconnect if video element changes
    const observer = new MutationObserver(() => {
      const newVideo = document.querySelector('video');
      if (newVideo && newVideo !== video) {
        connectVideo(newVideo);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-initialize on navigation
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      mediaElementSource = null;
      setTimeout(init, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

})();

