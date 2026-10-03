// Matrícula ao estilo luxemburguês: fundo amarelo, letras pretas, contorno preto arredondado e a faixa
// azul da UE à esquerda, com o círculo de estrelas e o "L" branco.
// Usada nos cartões das carrinhas no mapa e nas listas.

import { formatarMatricula } from '../../dominio/matricula';

export { formatarMatricula };

const AMARELO = '#FFD200';
const AZUL_UE = '#003399';
const AMARELO_ESTRELAS = '#FFDD00';

interface Props {
  matricula: string;
  /** Altura em píxeis (a largura acompanha). Por omissão 16. */
  altura?: number;
  className?: string;
}

/** Faixa da UE desenhada em SVG (nítida em qualquer tamanho): 12 estrelas em círculo e o "L". */
function FaixaUE({ largura, altura }: { largura: number; altura: number }) {
  const cx = largura / 2;
  const cy = altura * 0.36;
  const r = Math.min(largura * 0.3, altura * 0.2);
  // 12 pontos redondos: traços quase nulos com remate redondo, espaçados 1/12 da circunferência.
  const passo = (2 * Math.PI * r) / 12;
  return (
    <svg
      width={largura}
      height={altura}
      viewBox={`0 0 ${largura} ${altura}`}
      aria-hidden="true"
      className="block"
    >
      <rect width={largura} height={altura} fill={AZUL_UE} />
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={AMARELO_ESTRELAS}
        strokeWidth={Math.max(0.9, altura * 0.075)}
        strokeLinecap="round"
        strokeDasharray={`0.01 ${passo - 0.01}`}
      />
      <text
        x={cx}
        y={altura * 0.9}
        textAnchor="middle"
        fill="#ffffff"
        fontSize={Math.max(5, altura * 0.36)}
        fontWeight={700}
        fontFamily="Arial, sans-serif"
      >
        L
      </text>
    </svg>
  );
}

export function Matricula({ matricula, altura = 16, className = '' }: Props) {
  const texto = formatarMatricula(matricula);
  const faixa = Math.max(6, Math.round(altura * 0.55));
  const letra = Math.max(8, Math.round(altura * 0.72));
  // O contorno (1 px) fica por dentro da altura pedida.
  const interior = altura - 2;
  return (
    <span
      className={`inline-flex shrink-0 items-stretch overflow-hidden rounded-[3px] border border-black align-middle leading-none ${className}`}
      style={{ height: altura, backgroundColor: AMARELO }}
      title={`Matrícula ${texto}`}
    >
      <FaixaUE largura={faixa} altura={interior} />
      <span
        className="flex items-center px-1 font-bold tracking-wide text-black tabular-nums whitespace-nowrap"
        style={{
          fontSize: letra,
          fontFamily: '"DIN Alternate", "Arial Narrow", "Roboto Condensed", Arial, sans-serif',
        }}
      >
        {texto}
      </span>
    </span>
  );
}
