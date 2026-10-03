// Um bloco no mapa: as casas, carrinhas e obras de um local (ou de locais vizinhos, como as duas ruas de
// Himeling), na arrumação calculada (layout/arrumacao.ts), desenhado em píxeis base e escalado com
// transform: scale(escala). Sem fundo: vê-se o mapa entre os cartões.
// No resumo, um bloco aberto à mão tem um botão para voltar a fechar.

import type { Id } from '../../../dominio/tipos';
import { useLoja } from '../../estado/loja';
import type { GrupoDisposto } from '../layout/disposicao';
import { type CarrinhaNoMapa, chaveGrupo } from '../layout/grupos';
import { CartaoCarrinha } from './CartaoCarrinha';
import { CartaoCasa } from './CartaoCasa';
import { CartaoObra } from './CartaoObra';
import { CLASSE_FOCO_TECLADO, CLASSE_NOMES_MAPA, type Destaque, posicao } from './comum';

interface Props {
  disposto: GrupoDisposto & { modo: 'completo' };
  esquerda: number;
  topo: number;
  /** O bloco foi aberto à mão no resumo (mostra o botão de fechar). */
  aberto: boolean;
  destaqueDe: (chave: string) => Destaque;
}

export function BlocoLocal({ disposto, esquerda, topo, aberto, destaqueDe }: Props) {
  const expandidos = useLoja((s) => s.expandidos);
  const alternarExpandido = useLoja((s) => s.alternarExpandido);
  const { arrumacao: a, escala, locais } = disposto;
  const carrinhas = new Map<Id, CarrinhaNoMapa>(locais.flatMap((l) => l.carrinhas.map((c) => [c.id, c])));
  const fechar = () => {
    for (const l of locais) if (expandidos.has(chaveGrupo(l.localId))) alternarExpandido(chaveGrupo(l.localId));
  };

  return (
    <div
      className={`absolute ${CLASSE_NOMES_MAPA}`}
      style={{
        left: esquerda,
        top: topo,
        width: a.largura,
        height: a.altura,
        transform: `scale(${escala})`,
        transformOrigin: '0 0',
      }}
      data-grupo={disposto.chave}
    >
      {a.rotulos.map((r) => (
        <span
          key={r.localId}
          className="rotulo-local pointer-events-none absolute truncate text-[10px] font-bold leading-3 text-slate-800"
          style={posicao(r.retangulo)}
        >
          {r.texto}
        </span>
      ))}
      {a.cartoes.map((c) => {
        const id = c.chave.slice(c.chave.indexOf(':') + 1);
        const destaque = destaqueDe(c.chave);
        if (c.geometria.tipo === 'casa') {
          return <CartaoCasa key={c.chave} casaId={id} geometria={c.geometria} x={c.x} y={c.y} destaque={destaque} />;
        }
        if (c.geometria.tipo === 'carrinha') {
          return (
            <CartaoCarrinha
              key={c.chave}
              carrinhaId={id}
              geometria={c.geometria}
              x={c.x}
              y={c.y}
              confianca={carrinhas.get(id)?.confianca ?? 'desconhecida'}
              destaque={destaque}
            />
          );
        }
        return <CartaoObra key={c.chave} obraId={id} geometria={c.geometria} x={c.x} y={c.y} destaque={destaque} />;
      })}
      {aberto && (
        <button
          type="button"
          className={`absolute -top-2 -right-2 z-[2] grid size-5 cursor-pointer place-items-center rounded-full border border-slate-400 bg-white text-xs leading-none text-slate-700 shadow hover:bg-slate-100 ${CLASSE_FOCO_TECLADO}`}
          title="Voltar ao resumo"
          aria-label={`Fechar ${locais.map((l) => l.nome).join(' e ')} (voltar ao resumo)`}
          onClick={fechar}
        >
          ×
        </button>
      )}
    </div>
  );
}
