// Ícones de traço do modo de edição (16×16, cor do texto). Sempre ao lado de um texto ou de um
// rótulo para leitores de ecrã: escondidos da acessibilidade.

import type { ReactNode } from 'react';

function Icone({ children, className = 'h-4 w-4' }: { children: ReactNode; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

interface PropsIcone {
  className?: string;
}

export function IconeLapis({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M10.5 2.5l3 3L5.5 13.5H2.5v-3z" />
      <path d="M8.75 4.25l3 3" />
    </Icone>
  );
}

export function IconeRelogio({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4.75V8l2.25 1.5" />
    </Icone>
  );
}

export function IconeDesfazer({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M5.5 3.5L2.5 6.5l3 3" />
      <path d="M2.5 6.5h7a4 4 0 010 8H7" />
    </Icone>
  );
}

export function IconeRefazer({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M10.5 3.5l3 3-3 3" />
      <path d="M13.5 6.5h-7a4 4 0 000 8H9" />
    </Icone>
  );
}

export function IconeMover({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M2.5 8h9" />
      <path d="M8.5 4.5L12 8l-3.5 3.5" />
      <path d="M14 3v10" />
    </Icone>
  );
}

export function IconeLimparSelecao({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" strokeDasharray="2 2" />
      <path d="M6 6l4 4M10 6l-4 4" />
    </Icone>
  );
}

export function IconeGuardar({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M3 8.5l3.25 3.25L13 5" />
    </Icone>
  );
}

export function IconeAviso({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M8 2.25l6.25 11H1.75z" />
      <path d="M8 6.5v3" />
      <path d="M8 11.5v.01" />
    </Icone>
  );
}

export function IconeCasa({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M2 7.5L8 2.5l6 5" />
      <path d="M3.75 6.25v7.25h8.5V6.25" />
      <path d="M11 4.25V2.5h1.5v3" />
    </Icone>
  );
}

export function IconeCarrinha({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <rect x="4.25" y="1.75" width="7.5" height="12.5" rx="1.75" />
      <path d="M5.5 5.25h5" />
      <path d="M3 4.5h1.25M11.75 4.5H13" />
    </Icone>
  );
}

export function IconeObra({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M2.5 13.5h11" />
      <path d="M4 13.5V7h3v6.5" />
      <path d="M9 13.5V3.5h4.5" />
      <path d="M9 6h3" />
    </Icone>
  );
}

export function IconeLupa({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.25 10.25l3.25 3.25" />
    </Icone>
  );
}

export function IconeRodar({ className }: PropsIcone) {
  return (
    <Icone className={`animate-spin ${className ?? 'h-4 w-4'}`}>
      <path d="M8 2.25a5.75 5.75 0 105.75 5.75" />
    </Icone>
  );
}

/** Lua: onde dorme a carrinha. */
export function IconeDormir({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <path d="M12.75 10.1A5.25 5.25 0 016.4 2.75a5.25 5.25 0 106.35 7.35z" />
    </Icone>
  );
}

/** Placa de estacionamento ("P"): outros locais onde uma carrinha pode dormir. */
export function IconeLocal({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <rect x="2.5" y="2.5" width="11" height="11" rx="2" />
      <path d="M6.5 11V5h2.25a1.75 1.75 0 010 3.5H6.5" />
    </Icone>
  );
}

/** Ponto de interrogação num círculo tracejado: "por definir". */
export function IconePorDefinir({ className }: PropsIcone) {
  return (
    <Icone className={className}>
      <circle cx="8" cy="8" r="6" strokeDasharray="2 1.8" />
      <path d="M6.4 6.4a1.6 1.6 0 113.1.6c-.3.7-1.5 1-1.5 2" />
      <path d="M8 11.25v.01" />
    </Icone>
  );
}
