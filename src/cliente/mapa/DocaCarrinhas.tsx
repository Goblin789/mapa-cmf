// Doca no canto superior direito do mapa (fora do Leaflet), por baixo das camadas: carrinhas sem sítio
// conhecido onde dormir (ex.: as novas, ainda sem passageiros) e, se houver, casas e obras sem
// coordenadas. Recolhível (lembra a escolha). Os cartões são os mesmos do mapa (também são alvos no
// modo de edição); o foco realça-os (também o de uma obra: as carrinhas de quem lá trabalha), mas as
// linhas de foco não chegam aqui. Uma obra sem coordenadas (não devia acontecer nas criadas no programa,
// que têm sempre pino) fica aqui e abre a ficha como no mapa.

import { type ReactNode, useMemo, useState } from 'react';
import { useLoja } from '../estado/loja';
import { CartaoCarrinha } from './cartoes/CartaoCarrinha';
import { CartaoCasa } from './cartoes/CartaoCasa';
import { CartaoObra } from './cartoes/CartaoObra';
import { CLASSE_NOMES_MAPA, type Destaque } from './cartoes/comum';
import { relacoesFoco } from './layout/foco';
import { chaveCarrinha, chaveCasa, chaveObra, type ModeloMapa } from './layout/grupos';
import { type GeometriaCartao, geometriaCarrinha, geometriaCasa, geometriaObra } from './layout/medidas';

const CHAVE_ARMAZENAMENTO = 'mapa-cmf:doca-aberta';
/** A doca desenha os cartões um pouco mais pequenos do que o tamanho base. */
const ESCALA_DOCA = 0.9;

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

function Lugar({ g, children }: { g: GeometriaCartao; children: ReactNode }) {
  return (
    <div
      className="relative shrink-0"
      style={{ width: Math.ceil(g.largura * ESCALA_DOCA), height: Math.ceil(g.altura * ESCALA_DOCA) }}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: g.largura,
          height: g.altura,
          transform: `scale(${ESCALA_DOCA})`,
          transformOrigin: '0 0',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function DocaCarrinhas({ modelo }: { modelo: ModeloMapa }) {
  // Começa recolhida (só o título com o número) para não tapar cartões; lembra a escolha.
  const [aberta, setAberta] = useState(lerAberta);
  const indices = useLoja((s) => s.indices);
  const foco = useLoja((s) => s.foco);
  const relacoes = useMemo(() => (indices ? relacoesFoco(foco, indices) : null), [foco, indices]);

  const { carrinhasSemLocal: carrinhas, casasSemLocal: casas, obrasSemLocal: obras } = modelo;
  const total = carrinhas.length + casas.length + obras.length;
  if (total === 0) return null;

  const chaveFoco = foco && foco.tipo !== 'pessoa' ? `${foco.tipo}:${foco.id}` : null;
  const destaqueDe = (chave: string): Destaque => {
    if (chave === chaveFoco) return 'foco';
    return relacoes?.destaques.has(chave) ? 'relacionado' : null;
  };
  const algumDestacado = [
    ...carrinhas.map((c) => chaveCarrinha(c.id)),
    ...casas.map((c) => chaveCasa(c.id)),
    ...obras.map((o) => chaveObra(o.id)),
  ].some((k) => destaqueDe(k) !== null);
  const titulo = carrinhas.length > 0 ? 'Carrinhas sem local conhecido' : 'Sem local no mapa';

  return (
    <section
      className={[
        // Sem max-h em percentagem (o contentor tem altura automática): encolhe pelo min-h-0 e a lista rola.
        'flex min-h-0 w-[260px] max-w-full flex-col overflow-hidden rounded-lg border bg-white/95 shadow-md select-none',
        algumDestacado ? 'border-slate-900 ring-2 ring-slate-900' : 'border-slate-300',
      ].join(' ')}
      aria-label={titulo}
    >
      <button
        type="button"
        className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-left text-xs font-semibold hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-700"
        aria-expanded={aberta}
        onClick={() => {
          setAberta(!aberta);
          gravarAberta(!aberta);
        }}
      >
        <svg
          width="8"
          height="8"
          viewBox="0 0 8 8"
          aria-hidden="true"
          className="shrink-0 text-slate-500"
          style={{ transform: aberta ? 'rotate(90deg)' : undefined }}
        >
          <path
            d="M2 1 L6 4 L2 7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        <span className="min-w-0 flex-1 truncate">{titulo}</span>
        <span className="rounded-full bg-slate-200 px-1.5 text-[11px] tabular-nums">{total}</span>
      </button>
      {aberta && (
        <div className={`min-h-0 overflow-y-auto border-t border-slate-200 p-2 ${CLASSE_NOMES_MAPA}`}>
          {carrinhas.length > 0 && (
            <>
              <p className="mb-2 text-[11px] leading-snug text-slate-500">
                Sem passageiros que morem numa casa da CMF, por isso não se sabe onde dormem.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                {carrinhas.map((c) => {
                  const g = geometriaCarrinha(c.nLugares, false, c.tipo);
                  return (
                    <Lugar key={c.id} g={g}>
                      <CartaoCarrinha
                        carrinhaId={c.id}
                        geometria={g}
                        x={0}
                        y={0}
                        confianca={c.confianca}
                        destaque={destaqueDe(chaveCarrinha(c.id))}
                      />
                    </Lugar>
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
              <div className="flex flex-wrap items-end gap-2">
                {casas.map((c) => {
                  const g = geometriaCasa(c.nLugares);
                  return (
                    <Lugar key={c.id} g={g}>
                      <CartaoCasa
                        casaId={c.id}
                        geometria={g}
                        x={0}
                        y={0}
                        destaque={destaqueDe(chaveCasa(c.id))}
                      />
                    </Lugar>
                  );
                })}
              </div>
            </>
          )}
          {obras.length > 0 && (
            <>
              <p className="mt-3 mb-2 text-[11px] leading-snug text-slate-500">
                Obras cujo local ainda não tem coordenadas.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                {obras.map((o) => {
                  const g = geometriaObra(o.nPessoas);
                  return (
                    <Lugar key={o.id} g={g}>
                      <CartaoObra
                        obraId={o.id}
                        geometria={g}
                        x={0}
                        y={0}
                        destaque={destaqueDe(chaveObra(o.id))}
                      />
                    </Lugar>
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
