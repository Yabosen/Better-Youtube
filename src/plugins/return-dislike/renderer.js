// Return YouTube Dislike Plugin
// Shows dislike count using the Return YouTube Dislike API

(function() {
  'use strict';

  let currentVideoId = null;
  let dislikeData = null;

  // Get video ID from URL
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Fetch dislike count from RYD API
  async function fetchDislikeCount(videoId) {
    try {
      const response = await fetch(
        `https://returnyoutubedislikeapi.com/votes?videoId=${videoId}`
      );
      if (response.ok) {
        const data = await response.json();
        return data;
      }
    } catch (error) {
      console.error('Return YouTube Dislike: Error fetching data', error);
    }
    return null;
  }

  // Format number (e.g., 1234 -> 1.2K)
  function formatNumber(num) {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    } else if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toString();
  }

  // Inject dislike count into DOM
  function injectDislikeCount() {
    // Find the like button container
    const likeButton = document.querySelector('#top-level-buttons-computed ytd-toggle-button-renderer:first-child');
    if (!likeButton) {
      return;
    }

    // Check if we already injected
    if (likeButton.querySelector('.ryd-dislike-count')) {
      return;
    }

    // Find the like count element
    const likeCountElement = likeButton.querySelector('#text');
    if (!likeCountElement) {
      return;
    }

    // Create dislike count element
    const dislikeElement = document.createElement('span');
    dislikeElement.className = 'ryd-dislike-count';
    dislikeElement.style.cssText = `
      margin-left: 8px;
      color: #909090;
      font-size: 14px;
    `;

    if (dislikeData && dislikeData.dislikes !== undefined) {
      dislikeElement.textContent = formatNumber(dislikeData.dislikes);
    } else {
      dislikeElement.textContent = '?';
    }

    // Insert after like count
    likeCountElement.parentNode.insertBefore(dislikeElement, likeCountElement.nextSibling);
  }

  // Initialize
  async function init() {
    const videoId = getVideoId();
    
    if (!videoId) {
      return;
    }

    if (videoId === currentVideoId) {
      return; // Already loaded
    }

    currentVideoId = videoId;
    dislikeData = await fetchDislikeCount(videoId);

    // Wait for YouTube to render the like button
    const observer = new MutationObserver(() => {
      if (document.querySelector('#top-level-buttons-computed')) {
        injectDislikeCount();
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    // Also try immediately
    setTimeout(injectDislikeCount, 1000);
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
      setTimeout(init, 1000);
    }
  }).observe(document, { subtree: true, childList: true });

})();

