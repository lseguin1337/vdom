import { StrictMode } from 'react'
import './index.css'
import App from './App.tsx'
import { createRoot } from './react-render.ts';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
