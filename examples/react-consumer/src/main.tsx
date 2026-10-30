import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@jello-export/bottom-navigation/style.css';
import './app.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
