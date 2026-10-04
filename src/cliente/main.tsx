// Letras da marca CMF, alojadas no próprio site (nunca do Google Fonts: RGPD).
// Archivo (variável) para os títulos; IBM Plex Sans para o texto, só nos pesos que a interface usa.
// O itálico (notas, "Ninguém.", "livre") é sempre de peso normal: sem o 400-italic o browser inclinava
// o Plex à força. O browser só o descarrega quando aparece texto em itálico.
import '@fontsource-variable/archivo';
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/400-italic.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-sans/700.css';
import 'leaflet/dist/leaflet.css';
import './estilos.css';
// Depois de estilos.css: as cores e as letras da marca ganham aos valores por omissão.
import './tema.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { Portao } from './entrar/Portao';

const raiz = document.getElementById('raiz');
if (!raiz) throw new Error('Falta o elemento #raiz no index.html');

createRoot(raiz).render(
  <StrictMode>
    <Portao>
      <App />
    </Portao>
  </StrictMode>,
);
