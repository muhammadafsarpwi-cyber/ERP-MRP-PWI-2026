import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Spin } from 'antd';
import App from './App';
import ThemeProvider from './theme/ThemeProvider';
import ErrorBoundary from './components/shared/ErrorBoundary';
import './index.css';
// These MUST stay after `./index.css`: CSS is concatenated in module-evaluation
// order, and index.css pulls in the legacy `styles/erp-table.css`. Loading the
// redesign layer last is what lets it outrank that legacy sheet on every
// equal-specificity tie, so the new table chrome actually wins the cascade.
import './styles/erp-font.css';
import './styles/erp-redesign.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);