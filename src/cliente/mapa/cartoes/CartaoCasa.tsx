// Casa vista de frente: telhado de duas águas com beirais e chaminé, o nome no frontão, uma linha de
// estado (aviso de contrato à esquerda, "ocupados/lotação" à direita) e os nomes em duas colunas.
// Neutra: só a pastilha da lotação tem a cor do nível. Os nomes têm a cor do cliente.
// Clicar na casa põe-na em foco; no modo de edição é um alvo onde se largam pessoas (data-alvo).

import { ocupacaoCasa } from '../../../dominio/ocupacao';
import { chaveAlvo } from '../../../dominio/operacoes';
import type { Casa, Id } from '../../../dominio/tipos';
import { ESTILO_AVISO_CONTRATO, ESTILO_NIVEL } from '../../comum/lotacao';
import { useLoja } from '../../estado/loja';
import { chaveCasa } from '../layout/grupos';
import type { GeometriaCasa } from '../layout/medidas';
import { nomeCurtoCasa } from '../layout/textos';
import { CLASSE_FOCO_TECLADO, type Destaque, posicao, tracoDestaque } from './comum';
import { Lugares } from './Lugar';
import { PastilhaLotacao } from './PastilhaLotacao';

interface Props {
  casaId: Id;
  geometria: GeometriaCasa;
  /** Posição dentro do bloco (píxeis base). */
  x: number;
  y: number;
  destaque: Destaque;
}

/** Silhueta: chaminé, telhado (por cima da chaminé) e paredes. */
function Silhueta({ g, destaque }: { g: GeometriaCasa; destaque: Destaque }) {
  const { largura: L, altura: A } = g;
  const R = g.telhado.altura;
  const traco = tracoDestaque(destaque);
  // Chaminé na água da direita: começa acima do telhado e desaparece por baixo dele.
  const xChamine = Math.round(L * 0.7);
  const yTelhado = (x: number) => (R * (x - L / 2)) / (L / 2);
  return (
    <svg
      className="forma-casa pointer-events-none absolute left-0 top-0 overflow-visible"
      // O CSS do Leaflet dá z-index 200 aos svg do mapa: ficava por cima dos nomes.
      style={{ zIndex: 'auto' }}
      width={L}
      height={A}
      viewBox={`0 0 ${L} ${A}`}
      aria-hidden="true"
    >
      <rect
        x={xChamine}
        y={1}
        width={8}
        height={yTelhado(xChamine + 8) + 1}
        fill="#475569"
        stroke="#1e293b"
        strokeWidth={0.75}
      />
      <rect
        className="forma-corpo"
        x={g.corpo.x + 0.5}
        y={g.corpo.y - 1}
        width={g.corpo.largura - 1}
        height={g.corpo.altura + 0.5}
        rx={1.5}
        fill="#ffffff"
        stroke={traco.cor}
        strokeWidth={traco.largura}
        strokeDasharray={traco.tracejado}
      />
      <path
        className="forma-telhado"
        d={`M0.5 ${R} L${L / 2} 0.75 L${L - 0.5} ${R} Z`}
        fill="#334155"
        stroke={destaque ? traco.cor : '#1e293b'}
        strokeWidth={destaque ? traco.largura : 1}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function textoAviso(casa: Casa, forte: boolean): string {
  return forte && casa.tolerado !== null
    ? `contrato ${casa.maxContrato} (tol. ${casa.tolerado})`
    : `contrato ${casa.maxContrato}`;
}

export function CartaoCasa({ casaId, geometria: g, x, y, destaque }: Props) {
  const indices = useLoja((s) => s.indices);
  const definirFoco = useLoja((s) => s.definirFoco);
  const casa = indices?.casas.get(casaId);
  if (!indices || !casa) return null;

  const moradores = indices.moradores.get(casaId) ?? [];
  const oc = ocupacaoCasa(casa, moradores.length);
  const estilo = ESTILO_NIVEL[oc.nivel];
  const aviso = ESTILO_AVISO_CONTRATO[oc.aviso];
  const forte = oc.aviso === 'acima_tolerado';
  const emFoco = destaque === 'foco';
  const local = indices.locais.get(casa.localId);
  // No mapa, o nome sem o que já se lê no rótulo do local ("Casa 2 Rue de la Forêt" → "Casa 2").
  const nomeMostrado = nomeCurtoCasa(casa.nome, local ? `${local.nome} ${local.morada}` : '');
  const descricaoAviso = aviso
    ? `${aviso.rotulo}: ${oc.usados} lugares para um máximo de ${casa.maxContrato}` +
      `${casa.tolerado !== null ? ` (tolerado ${casa.tolerado})` : ''}.${casa.notaContrato ? ` ${casa.notaContrato}` : ''}`
    : '';
  const descricao = `${casa.nome} · ${oc.ocupados}/${oc.lotacao} lugares · ${estilo.rotulo}`;

  return (
    <div
      className="cartao-mapa absolute"
      style={{ left: x, top: y, width: g.largura, height: g.altura }}
      data-cartao={chaveCasa(casaId)}
      data-alvo={chaveAlvo({ tipo: 'casa', id: casaId })}
    >
      <Silhueta g={g} destaque={destaque} />
      {/* A casa inteira (telhado incluído) põe a casa em foco; os nomes ficam por cima. */}
      <button
        type="button"
        className={`absolute inset-0 cursor-pointer rounded-sm ${CLASSE_FOCO_TECLADO}`}
        title={`${descricao}${descricaoAviso ? ` · ${descricaoAviso}` : ''}`}
        aria-label={`${descricao}${descricaoAviso ? `. ${descricaoAviso}` : ''}. Mostrar as ligações desta casa.`}
        aria-pressed={emFoco}
        onClick={() => definirFoco(emFoco ? null : { tipo: 'casa', id: casaId })}
      />
      <span
        className="pointer-events-none absolute truncate text-center text-[10px] font-bold leading-3 tracking-tight text-white"
        style={posicao(g.frontao)}
      >
        {nomeMostrado}
      </span>
      <div
        className="pointer-events-none absolute flex items-center justify-end gap-1"
        style={posicao(g.estado)}
      >
        {aviso && (
          <span
            className={[
              'mr-auto flex min-w-0 items-center gap-0.5 truncate text-[10px] font-semibold leading-3',
              forte ? 'text-red-700' : 'text-amber-700',
            ].join(' ')}
          >
            <span aria-hidden="true" className="text-[8px]">
              ▲
            </span>
            <span className="truncate">{textoAviso(casa, forte)}</span>
          </span>
        )}
        <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lotacao} nivel={oc.nivel} />
      </div>
      <Lugares pessoas={moradores} lugares={g.lugares} capacidade={casa.lotacao} />
    </div>
  );
}
