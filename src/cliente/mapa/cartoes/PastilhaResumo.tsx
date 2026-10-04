// Resumo (zoom afastado ou ecrã pequeno): uma pastilha por local (ou locais juntos), com o nome e, numa
// linha, ícone + "ocupados/lugares" das casas, das carrinhas e das obras. Carregar abre o local com os
// nomes. A lotação agregada fica a vermelho se alguma casa/carrinha tiver gente a mais.
// M2: as carrinhas não contam quem está indisponível hoje (ocupacaoDaCarrinha); os problemas abertos das
// casas e carrinhas do local entram no tooltip (a pastilha é pequena demais para mais um ícone).

import { type NivelLotacao, nivelLotacao, ocupacaoCasa, ocupacaoDaCarrinha } from '../../../dominio/ocupacao';
import { chaveAlvoProblema } from '../../../dominio/problemas';
import { textoProblemasAbertos } from '../../comum/IconeProblemas';
import { useLoja } from '../../estado/loja';
import type { GrupoDisposto } from '../layout/disposicao';
import type { GeometriaResumo } from '../layout/medidas';
import { contar, nomeJunto } from '../layout/textos';
import { CLASSE_FOCO_TECLADO, classeDestaque, type Destaque, posicao } from './comum';
import { IconeCarrinha, IconeCasa, IconeObra } from './Icones';
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
  const { locais, geometria: g } = disposto;
  const nome = nomeJunto(locais.map((l) => l.nome));

  const casasIds = locais.flatMap((l) => l.casas.map((c) => c.id));
  const carrinhasIds = locais.flatMap((l) => l.carrinhas.map((c) => c.id));
  const obrasIds = locais.flatMap((l) => l.obras.map((o) => o.id));
  const ocCasas = casasIds.flatMap((id) => {
    const casa = indices.casas.get(id);
    return casa ? [ocupacaoCasa(casa, indices.moradores.get(id)?.length ?? 0)] : [];
  });
  const casas = somar(ocCasas.map((o) => ({ ocupados: o.ocupados, lugares: o.lotacao, nivel: o.nivel })));
  const acimaContrato = ocCasas.filter(
    (o) => o.aviso === 'acima_maximo' || o.aviso === 'acima_tolerado',
  ).length;
  const carrinhas = somar(
    carrinhasIds.flatMap((id) => {
      const c = indices.carrinhas.get(id);
      return c ? [ocupacaoDaCarrinha(indices, c)] : [];
    }),
  );
  const pessoasObras = obrasIds.reduce((t, id) => t + (indices.trabalhadores.get(id)?.length ?? 0), 0);
  const nProblemas = [
    ...casasIds.map((id) => chaveAlvoProblema({ tipo: 'casa', id })),
    ...carrinhasIds.map((id) => chaveAlvoProblema({ tipo: 'carrinha', id })),
  ].reduce((t, chave) => t + (indices.problemasAbertos.get(chave)?.length ?? 0), 0);

  const descricao = [
    nome,
    casasIds.length > 0
      ? `${contar(casasIds.length, 'casa', 'casas')}: ${casas.ocupados}/${casas.lugares}`
      : null,
    acimaContrato > 0 ? `${contar(acimaContrato, 'casa', 'casas')} acima do contrato` : null,
    carrinhasIds.length > 0
      ? `${contar(carrinhasIds.length, 'carrinha', 'carrinhas')}: ${carrinhas.ocupados}/${carrinhas.lugares}`
      : null,
    obrasIds.length > 0
      ? `${contar(obrasIds.length, 'obra', 'obras')}: ${contar(pessoasObras, 'pessoa', 'pessoas')}`
      : null,
    nProblemas > 0 ? textoProblemasAbertos(nProblemas) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      className={['absolute rounded-md', classeDestaque(destaque)].join(' ')}
      style={{ left: esquerda, top: topo, width: g.largura, height: g.altura }}
    >
      <button
        type="button"
        className={`absolute inset-0 cursor-pointer rounded-md border border-slate-400 bg-white text-left shadow-[0_1px_3px_rgb(15_23_42/0.3)] hover:border-slate-700 ${CLASSE_FOCO_TECLADO}`}
        title={`${descricao} · carregar para ver os nomes`}
        aria-label={`${descricao}. Mostrar os nomes.`}
        aria-expanded={false}
        onClick={() => alternarExpandido(disposto.chave)}
      >
        <span
          className="absolute truncate text-[10px] font-bold leading-3 text-slate-900"
          style={posicao(g.nome)}
        >
          {nome}
        </span>
        <span className="absolute flex items-center gap-1.5 text-slate-600" style={posicao(g.linha)}>
          {casasIds.length > 0 && (
            <span className="flex items-center gap-0.5">
              <IconeCasa tamanho={11} />
              <PastilhaLotacao ocupados={casas.ocupados} lugares={casas.lugares} nivel={casas.nivel} />
              {acimaContrato > 0 && (
                <span className="text-[9px] text-amber-700" title="Acima do contrato">
                  ▲
                </span>
              )}
            </span>
          )}
          {carrinhasIds.length > 0 && (
            <span className="flex items-center gap-0.5">
              <IconeCarrinha tamanho={11} />
              <PastilhaLotacao
                ocupados={carrinhas.ocupados}
                lugares={carrinhas.lugares}
                nivel={carrinhas.nivel}
              />
            </span>
          )}
          {obrasIds.length > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] font-semibold tabular-nums">
              <IconeObra tamanho={11} className="text-amber-600" />
              {pessoasObras}
            </span>
          )}
        </span>
      </button>
    </div>
  );
}
