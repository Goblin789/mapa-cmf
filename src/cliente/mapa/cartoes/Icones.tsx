// Ícones pequenos do mapa (resumo, camadas, obra), desenhados com a cor do texto (currentColor).

interface Props {
  tamanho?: number;
  className?: string;
}

/** Casa de frente: telhado de duas águas com chaminé. */
export function IconeCasa({ tamanho = 12, className = '' }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 12 12" aria-hidden="true" className={className}>
      <path d="M8.6 1.6h1.3v2.6L8.6 3.1z" fill="currentColor" />
      <path
        d="M0.6 6.1 6 1.4l5.4 4.7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path d="M2.2 5.6V11h7.6V5.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5 11V8h2v3" fill="currentColor" />
    </svg>
  );
}

/** Carrinha vista de cima, frente para cima. */
export function IconeCarrinha({ tamanho = 12, className = '' }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 12 12" aria-hidden="true" className={className}>
      <rect
        x="2.6"
        y="0.7"
        width="6.8"
        height="10.6"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path d="M3.6 3.1h4.8L7.8 4.6H4.2z" fill="currentColor" />
      <path d="M1.2 3.6h1.4M9.4 3.6h1.4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/** Capacete de obra. */
export function IconeObra({ tamanho = 12, className = '' }: Props) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 12 12" aria-hidden="true" className={className}>
      <path d="M2 8.2a4 4 0 0 1 8 0z" fill="currentColor" />
      <path d="M5.2 3.4V2.4h1.6v1" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="0.8" y="8.3" width="10.4" height="1.6" rx="0.8" fill="currentColor" />
    </svg>
  );
}
