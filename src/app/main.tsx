import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { WorkspaceProvider } from './state/WorkspaceProvider';
import { ToastProvider } from './components/ToastProvider';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ToastProvider>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </ToastProvider>
  </StrictMode>,
);
