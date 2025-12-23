/**
 * Shared Renderer Utilities
 * Provides common functionality for renderer-side plugin logic
 * to reduce redundant observers and intervals.
 */
export const SharedRendererUtils = `
(function() {
  if (window.BetterYouTubeUtils) return;

  const listeners = {
    navigation: [],
    videoFound: []
  };

  let lastUrl = location.href;
  let videoFound = false;

  const checkNavigation = () => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      videoFound = false;
      listeners.navigation.forEach(cb => {
        try { cb(currentUrl); } catch (e) { console.error('BYT Navigation Listener Error:', e); }
      });
    }
  };

  const checkVideo = () => {
    try {
      const video = document.querySelector('video');
      if (video && !videoFound) {
        videoFound = true;
        listeners.videoFound.forEach(cb => {
          try { cb(video); } catch (e) { console.error('BYT VideoFound Listener Error:', e); }
        });
      }
    } catch (e) {}
  };

  // YouTube SPA events are much more reliable than MutationObserver for navigation
  window.addEventListener('yt-navigate-finish', () => {
    checkNavigation();
    setTimeout(checkVideo, 500);
    setTimeout(checkVideo, 1500);
  });

  window.addEventListener('popstate', checkNavigation);
  
  // Use a debounced observer for video discovery if events miss it
  let timer = null;
  const observer = new MutationObserver(() => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      checkVideo();
    }, 1000);
  });

  function start() {
    const target = document.querySelector('ytd-app') || document.body;
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
      checkVideo();
    } else {
      setTimeout(start, 500);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  window.BetterYouTubeUtils = {
    onNavigation: (cb) => listeners.navigation.push(cb),
    onVideoFound: (cb) => listeners.videoFound.push(cb)
  };
})();
`;
