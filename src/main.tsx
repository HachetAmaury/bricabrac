import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles/global.css';

// Auto-update the service worker. The new SW takes over and reloads the page on
// its own (registerType: 'autoUpdate'), but iOS standalone PWAs are resumed
// rather than relaunched, so they rarely re-check on their own. We nudge them:
// once an hour and, more importantly, every time the app returns to the
// foreground. That's what makes a new deploy actually land on the home screen.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    const check = () => {
      registration.update().catch(() => {});
    };
    setInterval(check, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
    window.addEventListener('focus', check);
  }
});
void updateSW;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
