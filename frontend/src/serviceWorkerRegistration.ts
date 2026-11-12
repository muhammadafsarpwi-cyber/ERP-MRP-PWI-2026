/**
 * Service Worker Registration for Progressive Web App (PWA) support.
 * Registers /sw.js to enable installability, offline capability, and background sync.
 */

export function registerServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    const register = () => {
      const swUrl = `${process.env.PUBLIC_URL || ''}/sw.js`;

      navigator.serviceWorker
        .register(swUrl, { scope: '/' })
        .then((registration) => {
          console.log('[PWA] Service Worker registered with scope:', registration.scope);

          // Check for service worker updates
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            if (installingWorker) {
              installingWorker.onstatechange = () => {
                if (installingWorker.state === 'installed') {
                  if (navigator.serviceWorker.controller) {
                    console.log('[PWA] New content is available and will be used when all tabs are closed.');
                  } else {
                    console.log('[PWA] Content is cached for offline use.');
                  }
                }
              };
            }
          };
        })
        .catch((error) => {
          console.warn('[PWA] Service Worker registration failed:', error);
        });
    };

    // If window already loaded (typical in single-page apps), register immediately
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      register();
    } else {
      window.addEventListener('load', register);
    }
  }
}

export function unregisterServiceWorker(): void {
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        registration.unregister();
      })
      .catch((error) => {
        console.error(error.message);
      });
  }
}
