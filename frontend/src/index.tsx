import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Spin } from 'antd';
import App from './App';
import ThemeProvider from './theme/ThemeProvider';
import { OrbitalDualRingLoader } from './components/shared';
import './index.css';

// Set signature orbital dual-ring spinner as global default across all Ant Design components
Spin.setDefaultIndicator(<OrbitalDualRingLoader size="default" />);

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);