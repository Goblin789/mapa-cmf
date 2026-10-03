import 'leaflet/dist/leaflet.css';
import './estilos.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta o elemento #raiz no index.html');

createRoot(raiz).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
