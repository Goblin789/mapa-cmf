// Obra: cartão com uma faixa fina da cor do cliente, capacete, nome da obra e as pessoas em lista.
// No modo de edição é um alvo onde se largam pessoas. Não há foco de obra (o foco da loja é pessoa, casa
// ou carrinha), por isso o cartão não é um botão (era um botão sem ação, uma paragem inútil do Tab): a
// descrição fica no tooltip e num texto só para leitores de ecrã.

import { chaveAlvo } from '../../../dominio/operacoes';
import type { Id } from '../../../dominio/tipos';
import { useLoja } from '../../estado/loja';
import { chaveObra } from '../layout/grupos';
import type { GeometriaObra } from '../layout/medidas';
import { classeDestaque, type Destaque, posicao } from './comum';
import { IconeObra } from './Icones';
import { Lugares } from './Lugar';

interface Props {
  obraId: Id;
  geometria: GeometriaObra;
  x: number;
  y: number;
  destaque: Destaque;
}

export function CartaoObra({ obraId, geometria: g, x, y, destaque }: Props) {
  const indices = useLoja((s) => s.indices);
  const obra = indices?.obras.get(obraId);
  if (!indices || !obra) return null;
  const cliente = indices.clientes.get(obra.clienteId);
  const pessoas = indices.trabalhadores.get(obraId) ?? [];
  const descricao = `Obra ${obra.nome}${cliente ? ` · ${cliente.nome}` : ''} · ${pessoas.length} ${pessoas.length === 1 ? 'pessoa' : 'pessoas'}`;

  return (
    <div
      className={[
        'cartao-mapa cartao-obra absolute overflow-hidden rounded-[5px] border border-slate-500 bg-white shadow-[0_1px_2px_rgb(15_23_42/0.3)]',
        classeDestaque(destaque),
      ].join(' ')}
      style={{ left: x, top: y, width: g.largura, height: g.altura }}
      data-cartao={chaveObra(obraId)}
      data-alvo={chaveAlvo({ tipo: 'obra', id: obraId })}
      title={descricao}
    >
      <span className="sr-only">{descricao}</span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute"
        style={{ ...posicao(g.faixa), top: -1, backgroundColor: cliente?.cor ?? '#94a3b8' }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute flex items-center gap-1 text-[10px] font-bold leading-3 text-slate-900"
        style={posicao({ ...g.cabecalho, x: g.cabecalho.x - 1, y: g.cabecalho.y - 1 })}
      >
        <IconeObra tamanho={11} className="shrink-0 text-amber-600" />
        <span className="min-w-0 flex-1 truncate">{obra.nome}</span>
        {cliente && <span className="shrink-0 font-semibold text-slate-500">{cliente.sigla}</span>}
      </span>
      <div className="absolute" style={{ left: -1, top: -1 }}>
        <Lugares pessoas={pessoas} lugares={g.lugares} capacidade={null} />
      </div>
    </div>
  );
}
