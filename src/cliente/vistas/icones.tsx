// Ícones de traço das vistas (16×16, cor do texto), no mesmo desenho dos da lista lateral.
// Sempre ao lado de um texto ou de um rótulo para leitores de ecrã: escondidos da acessibilidade.

import type { ReactNode } from 'react';

interface Props {
  className?: string;
}

function Svg({ className = 'size-4', children }: Props & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Mapa dobrado em três. */
export function IconeMapa(props: Props) {
  return (
    <Svg {...props}>
      <path d="M1.5 3.6 5.5 2l5 1.6 4-1.6v10.4l-4 1.6-5-1.6-4 1.6z" />
      <path d="M5.5 2v10.4M10.5 3.6V14" />
    </Svg>
  );
}

/** Tabela: linhas e uma coluna. */
export function IconeTabela(props: Props) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M1.5 6.2h13M1.5 9.8h13M5.8 6.2v7.3" />
    </Svg>
  );
}

/** Quadro: colunas de alturas diferentes (como as folhas do Michael). */
export function IconeQuadro(props: Props) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2" width="3.6" height="12" rx="1" />
      <rect x="6.2" y="2" width="3.6" height="8" rx="1" />
      <rect x="10.9" y="2" width="3.6" height="10" rx="1" />
    </Svg>
  );
}

/** Reunião: um ecrã grande no pé. */
export function IconeReuniao(props: Props) {
  return (
    <Svg {...props}>
      <rect x="1.5" y="2" width="13" height="9" rx="1.2" />
      <path d="M5.5 14h5M8 11v3" />
    </Svg>
  );
}

/** Descarregar (Excel). */
export function IconeDescarregar(props: Props) {
  return (
    <Svg {...props}>
      <path d="M8 2v8.2M4.8 7.2 8 10.4l3.2-3.2" />
      <path d="M2.5 11v2.5h11V11" />
    </Svg>
  );
}

/** Ecrã inteiro: cantos para fora. */
export function IconeEcraInteiro(props: Props) {
  return (
    <Svg {...props}>
      <path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" />
    </Svg>
  );
}

/** Sair da reunião: cantos para dentro. */
export function IconeSairEcra(props: Props) {
  return (
    <Svg {...props}>
      <path d="M6 2v4H2M14 6h-4V2M10 14v-4h4M2 10h4v4" />
    </Svg>
  );
}

/** Seta de ordenação: para cima (crescente), para baixo (decrescente) ou as duas, apagadas (sem ordem). */
export function IconeOrdem({
  direcao,
  className = 'size-3',
}: {
  direcao: 'asc' | 'desc' | null;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 12 12"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {direcao === null ? (
        <path d="M3.5 4.5 6 2l2.5 2.5M3.5 7.5 6 10l2.5-2.5" opacity="0.45" />
      ) : direcao === 'asc' ? (
        <path d="M3 7 6 4l3 3" />
      ) : (
        <path d="M3 5l3 3 3-3" />
      )}
    </svg>
  );
}
