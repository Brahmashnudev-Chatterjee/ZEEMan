/* Prevent browser history or the back/forward cache from exposing a stale
   signed-in screen after logout, or a stale sign-in screen after login. */
(() => {
  const protectedRoute = () => /^\/(admin|user)(?:\/|$)/.test(location.pathname) || location.pathname === '/onboarding';
  const authRoute = () => ['/login', '/login.html', '/register'].includes(location.pathname);
  const destinationFor = user => user.role === 'admin'
    ? '/admin/dashboard'
    : (user.onboarding_completed_at ? '/user/dashboard' : '/onboarding');
  let checking = false;

  async function validateHistoryEntry() {
    if (checking || (!protectedRoute() && !authRoute())) return;
    checking = true;
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }
      });
      const payload = response.ok ? await response.json() : null;
      if (protectedRoute()) {
        if (!payload?.user) return location.replace('/login');
        if (location.pathname === '/onboarding') {
          if (payload.user.role === 'admin' || payload.user.onboarding_completed_at) location.replace(destinationFor(payload.user));
          return;
        }
        const prefix = payload.user.role === 'admin' ? '/admin' : '/user';
        if (!location.pathname.startsWith(prefix)) location.replace(destinationFor(payload.user));
      } else if (payload?.user) {
        location.replace(destinationFor(payload.user));
      }
    } catch (_) {
      if (protectedRoute()) location.replace('/login');
    } finally {
      checking = false;
    }
  }

  window.addEventListener('pageshow', validateHistoryEntry);
  window.addEventListener('popstate', () => setTimeout(validateHistoryEntry, 0));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') validateHistoryEntry();
  });
  validateHistoryEntry();
})();
