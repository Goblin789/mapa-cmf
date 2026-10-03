// Ícones de linha da lista lateral (16×16, cor do texto). A casa e a carrinha seguem o formato do mapa:
// casa de frente com telhado de duas águas e chaminé; carrinha vista de cima, com a frente para cima.
// "Sem" (fora das casas, sem transporte, sem obra) = o mesmo ícone a tracejado.

import type { ReactNode } from 'react';

interface Props {
  className?: string;
  /** Traço tracejado (grupos "fora/sem"). */
  tracejado?: boolean;
}

function Svg({ className = 'size-4', tracejado = false, children }: Props & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeDasharray={tracejado ? '2 1.8' : undefined}
    >
      {children}
    </svg>
  );
}

export function IconeCasa(props: Props) {
  return (
    <Svg {...props}>
      <path d="M1.5 7.6 8 2.4l6.5 5.2" />
      <path d="M11 4.4V2.6h1.6v3.1" />
      <path d="M3.4 6.3V14h9.2V6.3" />
      <path d="M6.8 14v-3.2h2.4V14" />
    </Svg>
  );
}

export function IconeCarrinha(props: Props) {
  return (
    <Svg {...props}>
      <rect x="4" y="1.5" width="8" height="13" rx="2.4" />
      <path d="M5.4 5.6 6 3.9h4l.6 1.7z" />
      <path d="M4 5.4H2.6M12 5.4h1.4" />
      <path d="M6.2 9h3.6M6.2 11.2h3.6" />
    </Svg>
  );
}

/** Capacete de obra. */
export function IconeObra(props: Props) {
  return (
    <Svg {...props}>
      <path d="M1.5 12.2h13" />
      <path d="M3 12.2v-1.7a5 5 0 0 1 10 0v1.7" />
      <path d="M6.6 5.8v3.3M9.4 5.8v3.3" />
    </Svg>
  );
}

export function IconeSeta({ aberta, className = 'size-3' }: { aberta: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`shrink-0 transition-transform ${aberta ? 'rotate-90' : ''} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
  );
}

export function IconeLupa(props: Props) {
  return (
    <Svg {...props}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="m10.4 10.4 3.6 3.6" />
    </Svg>
  );
}

/** Alargar (setas para fora) ou estreitar (setas para dentro). */
export function IconeLargura({ alargar, className }: { alargar: boolean; className?: string }) {
  return (
    <Svg className={className}>
      {alargar ? (
        <path d="M1.5 8h13M4 5.5 1.5 8 4 10.5M12 5.5 14.5 8 12 10.5" />
      ) : (
        <path d="M1.5 8h4.5M10 8h4.5M3.5 5.5 6 8l-2.5 2.5M12.5 5.5 10 8l2.5 2.5M8 3v10" />
      )}
    </Svg>
  );
}

/** Abrir/recolher todas as secções. */
export function IconeRecolher({ recolher, className }: { recolher: boolean; className?: string }) {
  return (
    <Svg className={className}>
      {/* Recolher: setas para dentro; abrir: setas para fora. */}
      {recolher ? (
        <path d="M5 2.5 8 5.5l3-3M5 13.5l3-3 3 3M2.5 8h11" />
      ) : (
        <path d="M5 5 8 2l3 3M5 11l3 3 3-3M2.5 8h11" />
      )}
    </Svg>
  );
}

/** Pino do mapa ("mostrar no mapa"). */
export function IconePino(props: Props) {
  return (
    <Svg {...props}>
      <path d="M8 14.5s4.6-4.3 4.6-7.6a4.6 4.6 0 0 0-9.2 0c0 3.3 4.6 7.6 4.6 7.6Z" />
      <circle cx="8" cy="6.9" r="1.6" />
    </Svg>
  );
}
