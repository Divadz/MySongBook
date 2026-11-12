import React from 'react';
import ReactDOM from 'react-dom/client';
import './render/fonts';
import { App } from './ui/App';
import { isNative } from './core/nativeLibrary';

// Mode hors ligne du site : pas en développement, ni dans l'APK (fichiers déjà locaux).
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      /* hors ligne indisponible : le site marche quand même */
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
