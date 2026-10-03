// O que o React desenha dentro da camada de cartões (createPortal para o pane do Leaflet):
// linhas de chamada, cartões de grupo (ou pastilhas de resumo) e linhas de foco.
// O layout recalcula-se só quando mudam o zoom, o nível, os dados ou os cartões abertos;
// deslocar o mapa não faz nada (o pane anda com o mapa) e um viewreset só muda a origem.

import { useMemo } from 'react';
import { useLoja } from '../estado/loja';
import type { CamadaCartoes } from './CamadaCartoes';
import { CartaoGrupo } from './cartoes/CartaoGrupo';
import type { Destaque } from './cartoes/comum';
import { PastilhaResumo } from './cartoes/PastilhaResumo';
import { LinhasChamada, LinhasFoco } from './LinhasFoco';
import { disporMapa, linhasChamada } from './layout/disposicao';
import { linhasFoco, relacoesFoco } from './layout/foco';
import { chaveCarrinha, chaveCasa, type ModeloMapa } from './layout/grupos';
import { nivelDetalhe } from './layout/niveis';
import { useVistaMapa } from './useVistaMapa';

interface Props {
  camada: CamadaCartoes;
  modelo: ModeloMapa;
}

export function CartoesNoMapa({ camada, modelo }: Props) {
  const vista = useVistaMapa(camada);
  const indices = useLoja((s) => s.indices);
  const expandidos = useLoja((s) => s.expandidos);
  const foco = useLoja((s) => s.foco);

  const zoom = vista?.zoom ?? null;
  const nivel = vista ? nivelDetalhe(vista.zoom, vista.largura) : null;
  const disposicao = useMemo(
    () => (zoom === null || nivel === null ? null : disporMapa(modelo.grupos, { zoom, nivel, expandidos })),
    [modelo, zoom, nivel, expandidos],
  );
  const chamadas = useMemo(() => (disposicao ? linhasChamada(disposicao) : []), [disposicao]);
  const relacoes = useMemo(() => (indices ? relacoesFoco(foco, indices) : null), [foco, indices]);
  const linhas = useMemo(
    () => (disposicao && relacoes && indices ? linhasFoco(relacoes, disposicao, indices) : []),
    [disposicao, relacoes, indices],
  );

  if (!vista || !disposicao || !indices || !nivel) return null;

  const { origem } = vista;
  const chaveFoco = foco && foco.tipo !== 'pessoa' ? `${foco.tipo}:${foco.id}` : null;
  const destaqueDe = (chave: string): Destaque => {
    if (chave === chaveFoco) return 'foco';
    return relacoes?.destaques.has(chave) ? 'relacionado' : null;
  };

  return (
    <div
      className="select-none font-sans text-[11px] leading-tight text-slate-900"
      style={{ visibility: vista.aAnimar ? 'hidden' : 'visible' }}
    >
      <LinhasChamada linhas={chamadas} origem={origem} />
      <div className="absolute left-0 top-0" style={{ zIndex: 1 }}>
        {disposicao.grupos.map((g) => {
          const esquerda = g.x - origem.x;
          const topo = g.y - origem.y;
          if (g.modo === 'resumo') {
            const chaves = [
              ...g.grupo.casas.map((c) => chaveCasa(c.id)),
              ...g.grupo.carrinhas.map((c) => chaveCarrinha(c.id)),
            ];
            const destaques = chaves.map(destaqueDe);
            const destaque: Destaque = destaques.includes('foco')
              ? 'foco'
              : destaques.includes('relacionado')
                ? 'relacionado'
                : null;
            return (
              <PastilhaResumo
                key={g.chave}
                disposto={g}
                esquerda={esquerda}
                topo={topo}
                destaque={destaque}
              />
            );
          }
          return (
            <CartaoGrupo
              key={g.chave}
              disposto={g}
              esquerda={esquerda}
              topo={topo}
              nivel={nivel}
              destaqueDe={destaqueDe}
            />
          );
        })}
      </div>
      <LinhasFoco linhas={linhas} origem={origem} indices={indices} />
    </div>
  );
}
