// ========================================
// GigsCourt Cache System
// SWR (Stale-While-Revalidate) + Scroll Position Restore
// ========================================

const Cache = (function() {
  
  // Store for cached data
  const dataCache = new Map();
  
  // Store for scroll positions by page/route
  const scrollCache = new Map();
  
  // Store for pending revalidate requests
  const pendingRevalidate = new Map();
  
  // ===== Data Caching (SWR) =====
  async function swr(key, fetcher, ttl = 5 * 60 * 1000) { // 5 min default TTL
    const cached = dataCache.get(key);
    const now = Date.now();
    
    // Return cached data immediately if available (stale)
    if (cached) {
      // Revalidate in background if expired
      if (now - cached.timestamp > ttl && !pendingRevalidate.has(key)) {
        pendingRevalidate.set(key, true);
        fetcher().then(freshData => {
          dataCache.set(key, {
            data: freshData,
            timestamp: now
          });
          pendingRevalidate.delete(key);
          // Trigger UI update if callback exists
          if (window._onCacheUpdate && window._onCacheUpdate[key]) {
            window._onCacheUpdate[key](freshData);
          }
        }).catch(() => {
          pendingRevalidate.delete(key);
        });
      }
      return cached.data;
    }
    
    // No cache - fetch fresh
    const freshData = await fetcher();
    dataCache.set(key, {
      data: freshData,
      timestamp: now
    });
    return freshData;
  }
  
  // ===== Scroll Position Caching =====
  function saveScrollPosition(route, position) {
    scrollCache.set(route, position);
  }
  
  function getScrollPosition(route) {
    return scrollCache.get(route) || 0;
  }
  
  function restoreScrollPosition(route, element) {
    const position = getScrollPosition(route);
    if (position && element) {
      setTimeout(() => {
        element.scrollTop = position;
      }, 50); // Small delay to ensure DOM is ready
    }
  }
  
  // ===== Manual Cache Controls =====
  function invalidate(key) {
    dataCache.delete(key);
  }
  
  function invalidatePattern(prefix) {
    for (const key of dataCache.keys()) {
      if (key.startsWith(prefix)) {
        dataCache.delete(key);
      }
    }
  }
  
  function clearAll() {
    dataCache.clear();
    // Don't clear scroll positions on clear
  }
  
  function clearScroll() {
    scrollCache.clear();
  }
  
  // ===== Preload Data =====
  function preload(key, fetcher) {
    fetcher().then(data => {
      dataCache.set(key, {
        data: data,
        timestamp: Date.now()
      });
    }).catch(console.error);
  }
  
  // ===== Register Update Callback =====
  function onCacheUpdate(key, callback) {
    if (!window._onCacheUpdate) window._onCacheUpdate = {};
    window._onCacheUpdate[key] = callback;
  }
  
  // Public API
  return {
    swr,
    saveScrollPosition,
    getScrollPosition,
    restoreScrollPosition,
    invalidate,
    invalidatePattern,
    clearAll,
    clearScroll,
    preload,
    onCacheUpdate
  };
  
})();

// Make global
window.Cache = Cache;
