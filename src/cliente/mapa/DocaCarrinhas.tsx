// Doca no canto superior direito do mapa (fora do Leaflet): carrinhas sem sítio conhecido onde dormir
// (ex.: as novas, ainda sem passageiros) e, se houver, casas sem coordenadas. Recolhível.
// Os cartões são os mesmos do mapa; o foco realça-os, mas as linhas de foco não chegam aqui.

import { useMemo, useState } from 'react';
import { useLoja } from '../estado/loja';
import { CartaoCarrinha } from './cartoes/CartaoCarrinha';
import { CartaoCasa } from './cartoes/CartaoCasa';
import { type Destaque, Seta } from './cartoes/comum';
import { nivelDoCartao } from './layout/disposicao';
import { relacoesFoco } from './layout/foco';
import { chaveCarrinha, chaveCasa, type ModeloMapa } from './layout/grupos';
import { geometriaCarrinha, geometriaCasa } from './layout/medidas';
import type { NivelDetalhe } from './layout/niveis';

const CHAVE_ARMAZENAMENTO = 'mapa-cmf:doca-aberta';
/** Nenhum grupo tem esta chave: no nível da doca só contam o zoom e o próprio cartão. */
const SEM_GRUPO = 'grupo:';

function lerAberta(): boolean {
  try {
    return globalThis.localStorage?.getItem(CHAVE_ARMAZENAMENTO) === '1';
  } catch {
    return false;
  }
}

function gravarAberta(aberta: boolean) {
  try {
    globalThis.localStorage?.setItem(CHAVE_ARMAZENAMENTO, aberta ? '1' : '0');
  } catch {
    // Sem armazenamento (janela privada, etc.): fica só nesta sessão.
  }
}

interface Props {
  modelo: ModeloMapa;
  nivel: NivelDetalhe;
}

export function DocaCarrinhas({ modelo, nivel }: Props) {
  // Começa recolhida (só o título com o número) para não tapar cartões; lembra a escolha.
  const [aberta, setAberta] = useState(lerAberta);
  const indices = useLoja((s) => s.indices);
  const expandidos = useLoja((s) => s.expandidos);
  const foco = useLoja((s) => s.foco);
  const relacoes = useMemo(() => (indices ? relacoesFoco(foco, indices) : null), [foco, indices]);

  const { carrinhasSemLocal: carrinhas, casasSemLocal: casas } = modelo;
  if (carrinhas.length === 0 && casas.length === 0) return null;

  const chaveFoco = foco && foco.tipo !== 'pessoa' ? `${foco.tipo}:${foco.id}` : null;
  const destaqueDe = (chave: string): Destaque => {
    if (chave === chaveFoco) return 'foco';
    return relacoes?.destaques.has(chave) ? 'relacionado' : null;
  };
  const algumDestacado = [
    ...carrinhas.map((c) => chaveCarrinha(c.id)),
    ...casas.map((c) => chaveCasa(c.id)),
  ].some((k) => destaqueDe(k) !== null);
  const podeAlternar = nivel !== 'nomes';
  const titulo = carrinhas.length > 0 ? 'Carrinhas sem local conhecido' : 'Casas sem local no mapa';

  return (
    <section
      className={[
        'absolute right-2 top-2 z-10 flex max-h-[calc(100%-6rem)] w-[300px] max-w-[calc(100%-1rem)] flex-col overflow-hidden',
        'rounded-lg border bg-white/95 shadow-lg select-none',
        algumDestacado ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-300',
      ].join(' ')}
      aria-label={titulo}
    >
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-xs font-semibold hover:bg-slate-50"
        aria-expanded={aberta}
        onClick={() => {
          setAberta(!aberta);
          gravarAberta(!aberta);
        }}
      >
        <Seta aberta={aberta} />
        <span className="min-w-0 flex-1 truncate">{titulo}</span>
        <span className="rounded-full bg-slate-200 px-1.5 text-[11px] tabular-nums">
          {carrinhas.length + casas.length}
        </span>
      </button>
      {aberta && (
        <div className="min-h-0 overflow-y-auto border-t border-slate-200 p-2">
          {carrinhas.length > 0 && (
            <>
              <p className="mb-2 text-[11px] leading-snug text-slate-500">
                Sem passageiros que morem numa casa da CMF, por isso não se sabe onde dormem.
              </p>
              <div className="flex flex-wrap gap-2">
                {carrinhas.map((c) => {
                  const chave = chaveCarrinha(c.id);
                  const g = geometriaCarrinha(nivelDoCartao(nivel, expandidos, SEM_GRUPO, chave), c.nLugares);
                  return (
                    <div
                      key={c.id}
                      className="relative shrink-0"
                      style={{ width: g.largura, height: g.altura }}
                    >
                      <CartaoCarrinha
                        carrinhaId={c.id}
                        geometria={g}
                        x={0}
                        y={0}
                        confianca={c.confianca}
                        podeAlternar={podeAlternar}
                        aberto={expandidos.has(chave)}
                        destaque={destaqueDe(chave)}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
          {casas.length > 0 && (
            <>
              <p className="mt-3 mb-2 text-[11px] leading-snug text-slate-500">
                Casas cuja morada ainda não tem coordenadas.
              </p>
              <div className="flex flex-wrap gap-2">
                {casas.map((c) => {
                  const chave = chaveCasa(c.id);
                  const g = geometriaCasa(
                    nivelDoCartao(nivel, expandidos, SEM_GRUPO, chave),
                    c.nLugares,
                    c.comAviso,
                  );
                  return (
                    <div
                      key={c.id}
                      className="relative shrink-0"
                      style={{ width: g.largura, height: g.altura }}
                    >
                      <CartaoCasa
                        casaId={c.id}
                        geometria={g}
                        x={0}
                        y={0}
                        podeAlternar={podeAlternar}
                        aberto={expandidos.has(chave)}
                        destaque={destaqueDe(chave)}
                      />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
