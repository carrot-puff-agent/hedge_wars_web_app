/** The production worker is generated only after both frontend builds exist. */
export function registerPwa() {
  if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
    window.addEventListener('load', () => {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Installation is optional; normal online navigation remains available.
      });
    }, { once: true });
  }
}
