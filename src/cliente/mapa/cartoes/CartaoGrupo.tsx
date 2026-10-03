// Cartão de um local: o nome, as casas desse local e, por baixo, as carrinhas que lá dormem.
// Posições internas calculadas em layout/medidas.ts (as mesmas que as colisões e as linhas usam).
// Clicar no cabeçalho mostra/esconde os nomes de todo o grupo.

import type { Id } from '../../../dominio/tipos';
import { useLoja } from '../../estado/loja';
import type { GrupoDisposto } from '../layout/disposicao';
import type { CarrinhaNoMapa } from '../layout/grupos';
import type { GeometriaGrupo } from '../layout/medidas';
import type { NivelDetalhe } from '../layout/niveis';
import { CartaoCarrinha } from './CartaoCarrinha';
import { CartaoCasa } from './CartaoCasa';
import { type Destaque, posicao, Seta } from './comum';

interface Props {
  disposto: GrupoDisposto & { modo: 'cartao'; geometria: GeometriaGrupo };
  esquerda: number;
  topo: number;
  nivel: NivelDetalhe;
  /** Realce de cada cartão (chave → foco/relacionado). */
  destaqueDe: (chave: string) => Destaque;
}

export function CartaoGrupo({ disposto, esquerda, topo, nivel, destaqueDe }: Props) {
  const expandidos = useLoja((s) => s.expandidos);
  const alternarExpandido = useLoja((s) => s.alternarExpandido);
  const { grupo, geometria: g, chave } = disposto;
  const grupoAberto = expandidos.has(chave);
  // Com zoom alto os nomes já aparecem todos: abrir/fechar não faz nada.
  const podeAlternar = nivel !== 'nomes';
  const podeAlternarFilhos = podeAlternar && !grupoAberto;
  const carrinhas = new Map<Id, CarrinhaNoMapa>(grupo.carrinhas.map((c) => [c.id, c]));

  const conteudoCabecalho = (
    <>
      <span className="min-w-0 flex-1 truncate text-[11px] font-bold">{grupo.nome}</span>
      {podeAlternar && <Seta aberta={grupoAberto} />}
    </>
  );

  return (
    <div
      className="absolute isolate rounded-lg border border-slate-300 bg-white/95 shadow-md"
      style={{ left: esquerda, top: topo, width: g.largura, height: g.altura }}
      data-grupo={grupo.localId}
    >
      {podeAlternar ? (
        <button
          type="button"
          className="absolute z-[1] flex cursor-pointer items-center gap-1 rounded-sm px-0.5 text-left hover:bg-slate-100"
          style={posicao(g.cabecalho)}
          title={`${grupo.nome} · ${grupoAberto ? 'esconder' : 'mostrar'} os nomes`}
          aria-expanded={grupoAberto}
          onClick={() => alternarExpandido(chave)}
        >
          {conteudoCabecalho}
        </button>
      ) : (
        <div
          className="absolute z-[1] flex items-center gap-1 px-0.5"
          style={posicao(g.cabecalho)}
          title={grupo.nome}
        >
          {conteudoCabecalho}
        </div>
      )}
      {g.rotuloCarrinhas && (
        <div
          className="pointer-events-none absolute truncate border-t border-dashed border-slate-300 pt-0.5 text-[10px] leading-[11px] text-slate-500"
          style={posicao(g.rotuloCarrinhas)}
        >
          Carrinhas que dormem aqui
        </div>
      )}
      {g.filhos.map((f) => {
        const id = f.chave.slice(f.chave.indexOf(':') + 1);
        const aberto = expandidos.has(f.chave);
        if (f.geometria.tipo === 'casa') {
          return (
            <CartaoCasa
              key={f.chave}
              casaId={id}
              geometria={f.geometria}
              x={f.x}
              y={f.y}
              podeAlternar={podeAlternarFilhos}
              aberto={aberto}
              destaque={destaqueDe(f.chave)}
            />
          );
        }
        return (
          <CartaoCarrinha
            key={f.chave}
            carrinhaId={id}
            geometria={f.geometria}
            x={f.x}
            y={f.y}
            confianca={carrinhas.get(id)?.confianca ?? 'desconhecida'}
            podeAlternar={podeAlternarFilhos}
            aberto={aberto}
            destaque={destaqueDe(f.chave)}
          />
        );
      })}
    </div>
  );
}
