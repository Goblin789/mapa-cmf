// Linhas desenhadas no plano das camadas do Leaflet (coordenadas = píxeis do mundo − origem).
// - Pinos (por baixo dos cartões): um ponto no sítio exato de cada local e o "pé" até ao cartão mais
//   próximo desse local; tracejado quando o bloco teve de se afastar (linha de chamada).
// - Linhas de foco (por cima dos cartões): casa → carrinha → obra da pessoa em foco, a obra em foco → as
//   casas e carrinhas de quem lá trabalha (M2), etc. Onde a linha toca o sítio de uma obra (não o cartão
//   dela), um losango com o nome da obra.
// A geometria vem do layout calculado (layout/foco.ts), não de medições do DOM: fica certa depois de
// mudar o zoom, e não há saltos nem ciclos de medição.

import type { Indices } from '../../dominio/indices';
import type { LinhaChamada } from './layout/disposicao';
import type { LinhaFoco } from './layout/foco';

type Origem = { x: number; y: number };

// O CSS do Leaflet dá z-index 200 aos svg do mapa; aqui fixa-se a ordem à mão.
const estiloSvg = (zIndex: number) =>
  ({ position: 'absolute', left: 0, top: 0, overflow: 'visible', zIndex, pointerEvents: 'none' }) as const;

export function Pinos({ linhas, origem }: { linhas: readonly LinhaChamada[]; origem: Origem }) {
  if (linhas.length === 0) return null;
  return (
    <svg width={1} height={1} style={estiloSvg(0)} aria-hidden="true">
      {linhas.map((l) => {
        const x1 = l.de.x - origem.x;
        const y1 = l.de.y - origem.y;
        const x2 = l.para.x - origem.x;
        const y2 = l.para.y - origem.y;
        return (
          <g key={l.chave}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#ffffff"
              strokeWidth={3.5}
              strokeLinecap="round"
              opacity={0.85}
            />
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#1e293b"
              strokeWidth={1.5}
              strokeDasharray={l.longa ? '4 2.5' : undefined}
              strokeLinecap="round"
            />
            <circle cx={x1} cy={y1} r={4} fill="#1e293b" stroke="#ffffff" strokeWidth={1.75} />
          </g>
        );
      })}
    </svg>
  );
}

interface PropsFoco {
  linhas: readonly LinhaFoco[];
  origem: Origem;
  indices: Indices;
}

/** Losango no sítio de uma obra, com o nome ao lado (só uma vez: várias linhas podem sair do mesmo sítio). */
function MarcaObra({ x, y, nome }: { x: number; y: number; nome: string | null }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x={-7}
        y={-7}
        width={14}
        height={14}
        transform="rotate(45)"
        fill="#ffffff"
        stroke="#0f172a"
        strokeWidth={3}
      />
      {nome !== null && (
        <text
          x={12}
          y={4}
          fontSize={12}
          fontWeight={700}
          fill="#0f172a"
          stroke="#ffffff"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {nome}
        </text>
      )}
    </g>
  );
}

export function LinhasFoco({ linhas, origem, indices }: PropsFoco) {
  if (linhas.length === 0) return null;
  return (
    <svg width={1} height={1} style={estiloSvg(2)} aria-hidden="true">
      {linhas.map((l, i) => {
        const x1 = l.de.x - origem.x;
        const y1 = l.de.y - origem.y;
        const x2 = l.para.x - origem.x;
        const y2 = l.para.y - origem.y;
        const obra = l.obraId ? indices.obras.get(l.obraId) : undefined;
        const obraOrigem = l.obraOrigemId ? indices.obras.get(l.obraOrigemId) : undefined;
        return (
          <g key={l.chave}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="#ffffff"
              strokeWidth={7}
              strokeLinecap="round"
              opacity={0.9}
            />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#0f172a" strokeWidth={3} strokeLinecap="round" />
            {obraOrigem ? (
              <MarcaObra x={x1} y={y1} nome={i === 0 ? obraOrigem.nome : null} />
            ) : (
              <circle cx={x1} cy={y1} r={4} fill="#0f172a" stroke="#ffffff" strokeWidth={1.5} />
            )}
            {obra ? (
              <MarcaObra x={x2} y={y2} nome={obra.nome} />
            ) : (
              <circle cx={x2} cy={y2} r={4} fill="#0f172a" stroke="#ffffff" strokeWidth={1.5} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
