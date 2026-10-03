// Matrícula ao estilo luxemburguês: fundo amarelo, letras pretas, faixa azul da UE com o "L".
// Usada nos cartões das carrinhas no mapa e nas listas.

const AMARELO = '#FFD200';
const AZUL_UE = '#003399';

/** "CF5001" → "CF 5001"; "KS 9412" fica igual; o resto passa sem mudança. */
export function formatarMatricula(matricula: string): string {
  const m = /^([A-Za-z]{1,3})\s*-?\s*(\d{1,5})$/.exec(matricula.trim());
  return m ? `${(m[1] as string).toUpperCase()} ${m[2]}` : matricula.trim();
}

interface Props {
  matricula: string;
  /** Altura em píxeis (a largura acompanha). Por omissão 16. */
  altura?: number;
  className?: string;
}

export function Matricula({ matricula, altura = 16, className = '' }: Props) {
  const texto = formatarMatricula(matricula);
  const faixa = Math.max(6, Math.round(altura * 0.55));
  const letra = Math.max(8, Math.round(altura * 0.72));
  return (
    <span
      className={`inline-flex shrink-0 items-stretch overflow-hidden rounded-[3px] border border-black align-middle leading-none ${className}`}
      style={{ height: altura, backgroundColor: AMARELO }}
      title={`Matrícula ${texto}`}
    >
      <span
        aria-hidden="true"
        className="flex flex-col items-center justify-end pb-px text-white"
        style={{ width: faixa, backgroundColor: AZUL_UE, fontSize: Math.max(5, Math.round(altura * 0.38)) }}
      >
        <span
          className="block rounded-full border border-yellow-300"
          style={{ width: faixa * 0.6, height: faixa * 0.6, marginBottom: 'auto', marginTop: 1 }}
        />
        L
      </span>
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
