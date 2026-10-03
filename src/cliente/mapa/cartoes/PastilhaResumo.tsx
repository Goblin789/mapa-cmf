// Nível "resumo" (zoom afastado): uma pastilha por local, ex. "Himeling, Rue de la Grotte",
// "4 casas · 31/32" e "7 carrinhas · 40/57". Clicar abre o grupo com os nomes.
// A lotação agregada fica a vermelho se alguma casa/carrinha tiver gente a mais.

import { type NivelLotacao, nivelLotacao, ocupacaoCarrinha, ocupacaoCasa } from '../../../dominio/ocupacao';
import { useLoja } from '../../estado/loja';
import type { GrupoDisposto } from '../layout/disposicao';
import type { GeometriaResumo } from '../layout/medidas';
import { contar } from '../layout/textos';
import { classeDestaque, type Destaque, posicao } from './comum';
import { PastilhaLotacao } from './PastilhaLotacao';

interface Props {
  disposto: GrupoDisposto & { modo: 'resumo'; geometria: GeometriaResumo };
  esquerda: number;
  topo: number;
  destaque: Destaque;
}

interface Soma {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
}

function somar(lista: readonly { ocupados: number; lugares: number; nivel: NivelLotacao }[]): Soma {
  const ocupados = lista.reduce((t, x) => t + x.ocupados, 0);
  const lugares = lista.reduce((t, x) => t + x.lugares, 0);
  const nivel = lista.some((x) => x.nivel === 'excesso') ? 'excesso' : nivelLotacao(ocupados, lugares);
  return { ocupados, lugares, nivel };
}

export function PastilhaResumo({ disposto, esquerda, topo, destaque }: Props) {
  const indices = useLoja((s) => s.indices);
  const alternarExpandido = useLoja((s) => s.alternarExpandido);
  if (!indices) return null;
  const { grupo, geometria: g } = disposto;

  const ocCasas = grupo.casas.flatMap((c) => {
    const casa = indices.casas.get(c.id);
    return casa ? [ocupacaoCasa(casa, indices.moradores.get(c.id)?.length ?? 0)] : [];
  });
  const casas = somar(ocCasas.map((o) => ({ ocupados: o.ocupados, lugares: o.lotacao, nivel: o.nivel })));
  const acimaContrato = ocCasas.filter(
    (o) => o.aviso === 'acima_maximo' || o.aviso === 'acima_tolerado',
  ).length;
  const acimaTolerado = ocCasas.some((o) => o.aviso === 'acima_tolerado');

  const carrinhas = somar(
    grupo.carrinhas.flatMap((c) => {
      const carrinha = indices.carrinhas.get(c.id);
      return carrinha ? [ocupacaoCarrinha(carrinha, indices.passageiros.get(c.id)?.length ?? 0)] : [];
    }),
  );

  const textoCasas = contar(grupo.casas.length, 'casa', 'casas');
  const textoCarrinhas = contar(grupo.carrinhas.length, 'carrinha', 'carrinhas');
  const descricao = [
    grupo.nome,
    grupo.casas.length > 0 ? `${textoCasas}: ${casas.ocupados}/${casas.lugares}` : null,
    acimaContrato > 0 ? `${contar(acimaContrato, 'casa', 'casas')} acima do contrato` : null,
    grupo.carrinhas.length > 0 ? `${textoCarrinhas}: ${carrinhas.ocupados}/${carrinhas.lugares}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // O realce vai numa div à volta: o Leaflet apaga o outline do botão clicado (ver comum.tsx).
  return (
    <div
      className={['absolute rounded-lg', classeDestaque(destaque)].join(' ')}
      style={{ left: esquerda, top: topo, width: g.largura, height: g.altura }}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-lg border border-slate-400 bg-white/95 text-left shadow-md hover:border-slate-700"
        title={`${descricao} · clicar para ver os nomes`}
        aria-label={`${descricao}. Mostrar os nomes.`}
        aria-expanded={false}
        onClick={() => alternarExpandido(disposto.chave)}
      >
        <span className="absolute truncate text-[11px] font-bold leading-4" style={posicao(g.nome)}>
          {grupo.nome}
        </span>
        {g.linhaCasas && (
          <span
            className="absolute flex items-center gap-1 text-[10px] leading-none"
            style={posicao(g.linhaCasas)}
          >
            <span className="truncate">{textoCasas}</span>
            <PastilhaLotacao ocupados={casas.ocupados} lugares={casas.lugares} nivel={casas.nivel} />
            {acimaContrato > 0 && (
              <span
                className={[
                  'shrink-0 rounded-sm border px-0.5 font-semibold',
                  acimaTolerado
                    ? 'border-red-500 bg-red-100 text-red-900'
                    : 'border-amber-400 bg-amber-100 text-amber-900',
                ].join(' ')}
              >
                {acimaTolerado ? '!!' : '!'} contrato
              </span>
            )}
          </span>
        )}
        {g.linhaCarrinhas && (
          <span
            className="absolute flex items-center gap-1 text-[10px] leading-none"
            style={posicao(g.linhaCarrinhas)}
          >
            <span className="truncate">{textoCarrinhas}</span>
            <PastilhaLotacao
              ocupados={carrinhas.ocupados}
              lugares={carrinhas.lugares}
              nivel={carrinhas.nivel}
            />
          </span>
        )}
      </button>
    </div>
  );
}
