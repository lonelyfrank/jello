import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@jello-export/mobile-navbar/style.css';
import '@jello-export/call-to-action/style.css';
import '@jello-export/solid-link/style.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
