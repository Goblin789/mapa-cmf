// Casa: telhado por cima, nome, pastilha "ocupados/lotação", aviso de contrato e um lugar por lugar.
// Neutra (sem cor de cliente): a lotação vai no contorno e na pastilha.
// Clicar no cartão põe a casa em foco; clicar no cabeçalho mostra/esconde os nomes.

import { ocupacaoCasa } from '../../../dominio/ocupacao';
import type { Casa, Id } from '../../../dominio/tipos';
import { ESTILO_AVISO_CONTRATO, ESTILO_NIVEL } from '../../comum/lotacao';
import { useLoja } from '../../estado/loja';
import type { Retangulo } from '../layout/geometria';
import { chaveCasa } from '../layout/grupos';
import type { GeometriaCasa } from '../layout/medidas';
import { nomeCurtoCasa } from '../layout/textos';
import { classeDestaque, type Destaque, posicao, Seta } from './comum';
import { Lugar } from './Lugar';
import { PastilhaLotacao } from './PastilhaLotacao';

interface Props {
  casaId: Id;
  geometria: GeometriaCasa;
  /** Posição dentro do contentor (grupo ou doca). */
  x: number;
  y: number;
  /** Mostrar/esconder os nomes faz sentido (o zoom e o grupo ainda não os mostram). */
  podeAlternar: boolean;
  aberto: boolean;
  destaque: Destaque;
}

function Telhado({ retangulo, cor }: { retangulo: Retangulo; cor: string }) {
  const { largura: l, altura: a } = retangulo;
  return (
    <svg
      className="pointer-events-none absolute left-0 top-0"
      // O CSS do Leaflet dá z-index 200 aos svg do mapa.
      style={{ zIndex: 'auto' }}
      width={l}
      height={a}
      viewBox={`0 0 ${l} ${a}`}
      aria-hidden="true"
    >
      <polygon
        points={`1,${a} ${l / 2},1 ${l - 1},${a}`}
        fill="#cbd5e1"
        stroke={cor}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function textoAviso(casa: Casa, usados: number, curto: boolean, forte: boolean): string {
  const simbolo = forte ? '!!' : '!';
  if (curto) return `${simbolo} contrato ${casa.maxContrato}`;
  const tolerado = casa.tolerado !== null ? ` (tolerado ${casa.tolerado})` : '';
  return `${simbolo} ${usados} para contrato ${casa.maxContrato}${tolerado}`;
}

export function CartaoCasa({ casaId, geometria: g, x, y, podeAlternar, aberto, destaque }: Props) {
  const indices = useLoja((s) => s.indices);
  const definirFoco = useLoja((s) => s.definirFoco);
  const alternarExpandido = useLoja((s) => s.alternarExpandido);
  const casa = indices?.casas.get(casaId);
  if (!indices || !casa) return null;

  const moradores = indices.moradores.get(casaId) ?? [];
  const oc = ocupacaoCasa(casa, moradores.length);
  const estilo = ESTILO_NIVEL[oc.nivel];
  const aviso = ESTILO_AVISO_CONTRATO[oc.aviso];
  const nomes = g.nivel === 'nomes';
  const chave = chaveCasa(casaId);
  const emFoco = destaque === 'foco';
  const descricao = `${casa.nome} · ${oc.ocupados}/${oc.lotacao} lugares · ${estilo.rotulo}`;
  // No cartão pequeno, o nome sem o que já se lê no grupo ("Casa 2 Rue de la Forêt" → "Casa 2").
  const local = indices.locais.get(casa.localId);
  const nomeMostrado = nomes
    ? casa.nome
    : nomeCurtoCasa(casa.nome, local ? `${local.nome} ${local.morada}` : '');
  const descricaoAviso = aviso
    ? `${aviso.rotulo}: ${oc.usados} lugares para um máximo de ${casa.maxContrato}` +
      `${casa.tolerado !== null ? ` (tolerado ${casa.tolerado})` : ''}.${casa.notaContrato ? ` ${casa.notaContrato}` : ''}`
    : '';

  const conteudoCabecalho = (
    <>
      <span
        className={['min-w-0 flex-1 truncate font-semibold', nomes ? 'text-xs' : 'text-[10px]'].join(' ')}
      >
        {nomeMostrado}
      </span>
      {/* No nível dos lugares não há espaço para a seta (o nome tem de caber). */}
      {podeAlternar && nomes && <Seta aberta={aberto} />}
      <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lotacao} nivel={oc.nivel} grande={nomes} />
    </>
  );

  return (
    <div
      className={['absolute rounded-md', classeDestaque(destaque)].join(' ')}
      style={{ left: x, top: y, width: g.largura, height: g.altura }}
      data-cartao={chave}
    >
      {/* O cartão inteiro (telhado incluído) põe a casa em foco; a caixa desenha-se por cima sem apanhar cliques. */}
      <button
        type="button"
        className="absolute inset-0 cursor-pointer rounded-md"
        title={`${descricao}${descricaoAviso ? ` · ${descricaoAviso}` : ''}`}
        aria-label={`${descricao}. Mostrar as ligações desta casa.`}
        aria-pressed={emFoco}
        onClick={() => definirFoco(emFoco ? null : { tipo: 'casa', id: casaId })}
      />
      <Telhado retangulo={g.telhado} cor={estilo.corHex} />
      <div
        className={[
          'pointer-events-none absolute rounded-t-[3px] rounded-b-md border-2 bg-white',
          estilo.contorno,
        ].join(' ')}
        style={posicao(g.corpo)}
      />
      {podeAlternar ? (
        <button
          type="button"
          className="absolute z-[1] flex cursor-pointer items-center gap-1 rounded-sm text-left hover:bg-slate-100"
          style={posicao(g.cabecalho)}
          title={`${casa.nome} · ${aberto ? 'esconder' : 'mostrar'} os nomes`}
          aria-expanded={aberto}
          onClick={() => alternarExpandido(chave)}
        >
          {conteudoCabecalho}
        </button>
      ) : (
        <div
          className="pointer-events-none absolute z-[1] flex items-center gap-1"
          style={posicao(g.cabecalho)}
        >
          {conteudoCabecalho}
        </div>
      )}
      {aviso && g.aviso && (
        <div
          className={[
            'pointer-events-none absolute z-[1] flex items-center truncate rounded-sm border px-1 text-[10px] font-semibold leading-none',
            aviso.classe,
          ].join(' ')}
          style={posicao(g.aviso)}
        >
          {textoAviso(casa, oc.usados, !nomes, oc.aviso === 'acima_tolerado')}
        </div>
      )}
      {g.lugares.map((r, i) => (
        <Lugar
          key={`${r.x}:${r.y}`}
          pessoa={moradores[i] ?? null}
          retangulo={r}
          nivel={g.nivel}
          aMais={i >= casa.lotacao}
        />
      ))}
    </div>
  );
}
