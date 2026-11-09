// First, so the cascade layer order is declared before any component CSS
import './mantine/layers.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app';
import { AppMantineProvider } from './mantine/provider';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppMantineProvider>
      <App />
    </AppMantineProvider>
  </React.StrictMode>
);
