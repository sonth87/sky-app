import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BackdropApp } from '@sky-app/module-ceremony';
import '@sky-app/module-ceremony/styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BackdropApp />
  </StrictMode>,
);
