// O que o React desenha dentro da camada de cartões (createPortal para o pane do Leaflet):
// pinos dos locais, blocos de cartões (ou pastilhas de resumo) e linhas de foco.
// O layout recalcula-se só quando mudam o zoom, o tamanho do mapa, os dados (incluindo o rascunho do
// modo de edição), as camadas ou os blocos abertos; deslocar o mapa não faz nada (o pane anda com o mapa).

import { useMemo } from 'react';
import { useLoja } from '../estado/loja';
import type { CamadaCartoes } from './CamadaCartoes';
import { BlocoLocal } from './cartoes/BlocoLocal';
import type { Destaque } from './cartoes/comum';
import { PastilhaResumo } from './cartoes/PastilhaResumo';
import { LinhasFoco, Pinos } from './LinhasFoco';
import { chavesDoLocal, type Disposicao, linhasChamada } from './layout/disposicao';
import { linhasFoco, relacoesFoco } from './layout/foco';
import { chaveGrupo } from './layout/grupos';
import { useVistaMapa } from './useVistaMapa';

interface Props {
  camada: CamadaCartoes;
  /** Disposição calculada pelo Mapa para o zoom e o tamanho atuais. */
  disposicao: Disposicao | null;
}

export function CartoesNoMapa({ camada, disposicao }: Props) {
  const vista = useVistaMapa(camada);
  const indices = useLoja((s) => s.indices);
  const expandidos = useLoja((s) => s.expandidos);
  const foco = useLoja((s) => s.foco);

  const pinos = useMemo(() => (disposicao ? linhasChamada(disposicao) : []), [disposicao]);
  const relacoes = useMemo(() => (indices ? relacoesFoco(foco, indices) : null), [foco, indices]);
  const linhas = useMemo(
    () => (disposicao && relacoes && indices ? linhasFoco(relacoes, disposicao, indices) : []),
    [disposicao, relacoes, indices],
  );

  if (!vista || !disposicao || !indices || disposicao.zoom !== vista.zoom) return null;

  const { origem } = vista;
  const chaveFoco = foco && foco.tipo !== 'pessoa' ? `${foco.tipo}:${foco.id}` : null;
  const destaqueDe = (chave: string): Destaque => {
    if (chave === chaveFoco) return 'foco';
    return relacoes?.destaques.has(chave) ? 'relacionado' : null;
  };

  return (
    <div
      className="select-none font-sans leading-tight text-slate-900"
      style={{ visibility: vista.aAnimar ? 'hidden' : 'visible' }}
    >
      <Pinos linhas={pinos} origem={origem} />
      <div className="absolute left-0 top-0" style={{ zIndex: 1 }}>
        {disposicao.grupos.map((g) => {
          const esquerda = g.x - origem.x;
          const topo = g.y - origem.y;
          if (g.modo === 'resumo') {
            const destaques = g.locais.flatMap((l) => [...chavesDoLocal(l)].map(destaqueDe));
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
          // Aberto à mão no resumo (ou no compacto, com as carrinhas inteiras): leva o botão de fechar.
          const aberto =
            disposicao.modo !== 'completo' && g.locais.some((l) => expandidos.has(chaveGrupo(l.localId)));
          return (
            <BlocoLocal
              key={g.chave}
              disposto={g}
              esquerda={esquerda}
              topo={topo}
              aberto={aberto}
              destaqueDe={destaqueDe}
            />
          );
        })}
      </div>
      <LinhasFoco linhas={linhas} origem={origem} indices={indices} />
    </div>
  );
}
