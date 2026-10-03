// Volante: marca o condutor de uma carrinha (no mapa, nas listas e nas fichas).

interface Props {
  /** Lado em píxeis. Por omissão 12. */
  tamanho?: number;
  className?: string;
  /** Texto para leitores de ecrã; sem ele o ícone é decorativo. */
  rotulo?: string;
}

export function IconeVolante({ tamanho = 12, className = '', rotulo }: Props) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      className={`shrink-0 ${className}`}
      role={rotulo ? 'img' : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
    >
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M3 11.5c3-1.2 6-1.6 9-1.6s6 .4 9 1.6M12 14.2v7.3" />
    </svg>
  );
}
