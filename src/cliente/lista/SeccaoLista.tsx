// Uma secção da lista lateral: uma casa, uma carrinha, uma obra, um cliente ou um grupo "fora/sem".
// Cabeçalho neutro (só a pastilha da lotação tem cor), nomes por baixo e os lugares vazios tracejados.
// No modo de edição as secções com alvo recebem nomes largados (data-alvo, ver arrastar/motor.ts).
// Quem conduz leva o volante ao lado do nome (em todas as vistas); nas carrinhas o condutor vem primeiro
// e as que levam gente sem condutor dizem-no, discretamente. Cada carrinha mostra a marca e o modelo, se é
// carro ou carrinha e onde dorme (definido ou "≈ sugerido"); no modo de edição, com um botão para o mudar.
// M2: os nomes de quem está indisponível hoje mostram "até 12/10" à vista; a pastilha da carrinha não os
// conta (Indices.ocupadosCarrinha: o lugar fica livre, a pessoa continua na lista); as secções de casa e
// de carrinha têm o ícone dos problemas abertos ao lado da pastilha.

import { useId, useMemo } from 'react';
import type { Indices } from '../../dominio/indices';
import { type NivelLotacao, ocupacaoCasa, ocupacaoDaCarrinha } from '../../dominio/ocupacao';
import { chaveAlvo } from '../../dominio/operacoes';
import type { Pessoa } from '../../dominio/tipos';
import { IconeProblemas } from '../comum/IconeProblemas';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { Matricula } from '../comum/Matricula';
import { NomeChip } from '../comum/NomeChip';
import { ContextoOrdemPessoas } from '../comum/ordemPessoas';
import { BOTAO_MINI } from '../edicao/classes';
import { dormidaPendente } from '../edicao/resumo';
import { abrirDormida } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { agruparPorCliente } from '../paineis/agrupar';
import { FOCO_VISIVEL } from '../paineis/classes';
import { ehCondutor, ROTULO_SEM_CONDUTOR, semCondutor } from '../paineis/condutor';
import { coordenadasDoLocal, destinoNoMapa, ZOOM_DESTINO } from '../paineis/fichas';
import { MarcaCliente } from '../paineis/pecas';
import {
  comPlural,
  ROTULO_TIPO_VEICULO,
  textoDormida,
  textoLotacao,
  textoMarcaModelo,
} from '../paineis/textos';
import {
  IconeCarrinha,
  IconeCarrinhaLado,
  IconeCarroLado,
  IconeCasa,
  IconeDormir,
  IconeObra,
  IconePino,
  IconeSeta,
} from './icones';
import { lugaresVazios, type Seccao } from './seccoes';

interface Props {
  seccao: Seccao;
  /** Com filtros e sem ninguém que os passe: só o cabeçalho (fica para se poder largar lá). */
  soCabecalho: boolean;
  recolhida: boolean;
  aoAlternar: () => void;
  comFiltros: boolean;
  /** Painel alargado (secções em colunas): os grupos fora/sem ocupam a linha toda. */
  alargado: boolean;
}

const ESPECIAIS = new Set<Seccao['tipo']>(['fora', 'sem-transporte', 'sem-obra']);

/** "9/10" com a cor e o símbolo do nível. É a única coisa com cor no cabeçalho. */
function PastilhaNivel({
  ocupados,
  lugares,
  nivel,
}: {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
}) {
  const estilo = ESTILO_NIVEL[nivel];
  const texto = textoLotacao(ocupados, lugares);
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded px-1.5 text-xs leading-5 font-semibold tabular-nums ${estilo.pastilha}`}
      title={`${ocupados} de ${lugares} lugares · ${texto}`}
    >
      <span aria-hidden="true">{estilo.simbolo}</span>
      {ocupados}/{lugares}
      <span className="sr-only">, {texto}</span>
    </span>
  );
}

function Contagem({ n }: { n: number }) {
  return (
    <span
      className="inline-flex shrink-0 rounded bg-slate-100 px-1.5 text-xs leading-5 font-semibold tabular-nums text-slate-700"
      title={comPlural(n, 'pessoa', 'pessoas')}
    >
      {n}
      <span className="sr-only"> {n === 1 ? 'pessoa' : 'pessoas'}</span>
    </span>
  );
}

function ListaNomes({ pessoas, vazios, indices }: { pessoas: Pessoa[]; vazios: number; indices: Indices }) {
  return (
    // Colunas de nomes conforme a largura da secção: 1 nas colunas do painel alargado, 2 no painel normal,
    // mais nos grupos que ocupam a linha toda.
    <ul className="grid grid-cols-1 gap-1 @min-[17rem]:grid-cols-2 @min-[34rem]:grid-cols-3 @min-[46rem]:grid-cols-4 @min-[58rem]:grid-cols-5">
      {pessoas.map((p) => (
        <li key={p.id} className="min-w-0">
          <NomeChip pessoa={p} condutor={ehCondutor(p, indices)} textoIndisponivel />
        </li>
      ))}
      {Array.from({ length: vazios }, (_, i) => (
        // Lugar vazio: a mesma altura de um nome, tracejado.
        // biome-ignore lint/suspicious/noArrayIndexKey: os lugares vazios não têm identidade própria.
        <li key={`vazio-${i}`} aria-hidden="true" className="min-w-0">
          <span className="flex rounded border border-dashed border-slate-300 px-1.5 py-0.5 text-xs leading-tight text-slate-400 italic">
            livre
          </span>
        </li>
      ))}
    </ul>
  );
}

function CorpoSeccao({ seccao, indices, vazios }: { seccao: Seccao; indices: Indices; vazios: number }) {
  const ordem = useMemo(() => seccao.pessoas.map((p) => p.id), [seccao.pessoas]);
  if (seccao.pessoas.length === 0 && vazios === 0) {
    return <p className="text-xs text-slate-500 italic">Ninguém.</p>;
  }
  return (
    <ContextoOrdemPessoas.Provider value={ordem}>
      {seccao.porCliente ? (
        agruparPorCliente(seccao.pessoas, indices).map((g, i) => (
          <div key={g.clienteId} className={i > 0 ? 'mt-2' : ''}>
            <p className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
              <MarcaCliente cliente={g.cliente} />
              <span className="min-w-0 flex-1 truncate">{g.cliente?.nome ?? 'Cliente desconhecido'}</span>
              <span className="font-normal tabular-nums">{g.pessoas.length}</span>
            </p>
            <ListaNomes pessoas={g.pessoas} vazios={0} indices={indices} />
          </div>
        ))
      ) : (
        <ListaNomes pessoas={seccao.pessoas} vazios={vazios} indices={indices} />
      )}
    </ContextoOrdemPessoas.Provider>
  );
}

export function SeccaoLista({ seccao: s, soCabecalho, recolhida, aoAlternar, comFiltros, alargado }: Props) {
  const indices = useLoja((st) => st.indices);
  const dormidas = useLoja((st) => st.dormidas);
  const modoEdicao = useLoja((st) => st.modoEdicao);
  const definirFoco = useLoja((st) => st.definirFoco);
  const pedirIrPara = useLoja((st) => st.pedirIrPara);
  // Onde dorme esta carrinha mudou no rascunho (antes do `return` abaixo: é um hook).
  const dormidaAlterada = useLoja(
    (st) =>
      s.tipo === 'carrinha' && s.id !== null && st.modoEdicao && dormidaPendente(st.pendentes, s.id) !== null,
  );
  const idTitulo = useId();
  const idCorpo = useId();
  if (!indices) return null;

  const especial = ESPECIAIS.has(s.tipo);
  const aberta = !recolhida && !soCabecalho;
  const casa = s.tipo === 'casa' && s.id ? indices.casas.get(s.id) : undefined;
  const carrinha = s.tipo === 'carrinha' && s.id ? indices.carrinhas.get(s.id) : undefined;
  const obra = s.tipo === 'obra' && s.id ? indices.obras.get(s.id) : undefined;
  const clienteDaSeccao =
    s.tipo === 'cliente' && s.id
      ? (indices.clientes.get(s.id) ?? null)
      : obra
        ? (indices.clientes.get(obra.clienteId) ?? null)
        : undefined;

  const ocCasa = casa ? ocupacaoCasa(casa, s.total) : null;
  // O s.total da secção conta toda a gente; a lotação da carrinha não conta quem está indisponível hoje.
  const ocCarrinha = carrinha ? ocupacaoDaCarrinha(indices, carrinha) : null;
  const dormidaCarrinha = carrinha ? dormidas?.get(carrinha.id) : undefined;
  const dormida = carrinha && dormidas ? textoDormida(dormidaCarrinha, indices) : null;
  const dormidaSugerida = dormidaCarrinha?.confianca === 'sugerida';
  const faltaCondutor = carrinha ? semCondutor(carrinha, indices) : false;

  // Destino no mapa (pino): a casa, onde dorme a carrinha, o local da obra.
  const destino = casa
    ? destinoNoMapa({ tipo: 'casa', id: casa.id }, indices, dormidas ?? new Map())
    : carrinha && dormidas
      ? destinoNoMapa({ tipo: 'carrinha', id: carrinha.id }, indices, dormidas)
      : obra
        ? coordenadasDoLocal(obra.localId, indices)
        : null;
  const mostrarNoMapa = () => {
    if (casa) definirFoco({ tipo: 'casa', id: casa.id });
    else if (carrinha) definirFoco({ tipo: 'carrinha', id: carrinha.id });
    // M2: a obra também tem ficha ("quem vem para esta obra e de onde").
    else if (obra) definirFoco({ tipo: 'obra', id: obra.id });
    if (destino) pedirIrPara(destino.lat, destino.lng, ZOOM_DESTINO);
  };

  const icone =
    s.tipo === 'casa' || s.tipo === 'fora' ? (
      <IconeCasa tracejado={especial} className="size-4 text-slate-500" />
    ) : s.tipo === 'sem-transporte' ? (
      <IconeCarrinha tracejado className="size-4 text-slate-500" />
    ) : s.tipo === 'obra' || s.tipo === 'sem-obra' ? (
      <IconeObra tracejado={especial} className="size-4 text-slate-500" />
    ) : null;

  const marcaModelo = carrinha ? textoMarcaModelo(carrinha) : null;
  const IconeVeiculo = carrinha?.tipo === 'carro' ? IconeCarroLado : IconeCarrinhaLado;
  const titulo = carrinha ? (
    <>
      <Matricula matricula={carrinha.matricula} altura={18} />
      <span id={idTitulo} className="sr-only">
        {ROTULO_TIPO_VEICULO[carrinha.tipo]} {carrinha.matricula}
        {marcaModelo ? `, ${marcaModelo}` : ''}
      </span>
      <span
        aria-hidden="true"
        className="flex min-w-0 items-center gap-1 text-xs text-slate-500"
        title={[ROTULO_TIPO_VEICULO[carrinha.tipo], marcaModelo].filter(Boolean).join(' · ')}
      >
        <IconeVeiculo className="size-4 text-slate-500" />
        <span className="min-w-0 truncate">
          {carrinha.tipo === 'carro' && (
            <span className="font-medium text-slate-600">Carro{marcaModelo ? ' · ' : ''}</span>
          )}
          {marcaModelo}
        </span>
      </span>
    </>
  ) : (
    <>
      {clienteDaSeccao !== undefined && <MarcaCliente cliente={clienteDaSeccao} />}
      <span
        id={idTitulo}
        className="min-w-0 text-[13px] leading-tight font-semibold break-words text-slate-900"
      >
        {s.titulo}
      </span>
    </>
  );

  return (
    <section
      aria-labelledby={idTitulo}
      data-seccao={s.chave}
      data-alvo={modoEdicao && s.alvo ? chaveAlvo(s.alvo) : undefined}
      className={[
        'min-w-0 rounded-md border transition-[background-color,border-color,box-shadow]',
        especial ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white shadow-xs',
        // No painel alargado, os grupos fora/sem ocupam a linha toda (são os maiores).
        alargado && especial ? 'col-span-full' : '',
        // Realce quando se arrasta um nome por cima (o motor põe data-alvo-estado="por-cima").
        'data-[alvo-estado=por-cima]:border-blue-500 data-[alvo-estado=por-cima]:bg-blue-50 data-[alvo-estado=por-cima]:outline-none data-[alvo-estado=por-cima]:ring-2 data-[alvo-estado=por-cima]:ring-blue-500',
      ].join(' ')}
    >
      <div className="flex min-h-9 items-center gap-1.5 py-1 pr-1.5 pl-2">
        <h3 className="flex min-w-0 flex-1">
          {soCabecalho ? (
            <span className="flex min-w-0 flex-1 items-center gap-1.5 pl-[1.125rem]">
              {icone}
              {titulo}
            </span>
          ) : (
            <button
              type="button"
              aria-expanded={aberta}
              aria-controls={aberta ? idCorpo : undefined}
              onClick={aoAlternar}
              className={`flex min-w-0 flex-1 items-center gap-1.5 rounded-sm text-left ${FOCO_VISIVEL}`}
            >
              <IconeSeta aberta={aberta} className="size-3 text-slate-400" />
              {icone}
              {titulo}
            </button>
          )}
        </h3>
        {casa ? (
          <IconeProblemas alvo={{ tipo: 'casa', id: casa.id }} />
        ) : carrinha ? (
          <IconeProblemas alvo={{ tipo: 'carrinha', id: carrinha.id }} />
        ) : null}
        {ocCasa ? (
          <PastilhaNivel ocupados={ocCasa.ocupados} lugares={ocCasa.lotacao} nivel={ocCasa.nivel} />
        ) : ocCarrinha ? (
          <PastilhaNivel
            ocupados={ocCarrinha.ocupados}
            lugares={ocCarrinha.lugares}
            nivel={ocCarrinha.nivel}
          />
        ) : (
          <Contagem n={s.total} />
        )}
        {destino && (
          <button
            type="button"
            onClick={mostrarNoMapa}
            className={`grid size-6 shrink-0 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800 ${FOCO_VISIVEL}`}
            title="Mostrar no mapa"
            aria-label={`Mostrar ${carrinha ? carrinha.matricula : s.titulo} no mapa`}
          >
            <IconePino className="size-3.5" />
          </button>
        )}
      </div>

      {(dormida || soCabecalho || faltaCondutor) && (
        <p className="-mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 px-2 pb-1.5 pl-[1.625rem] text-[11px] text-slate-600">
          {dormida && carrinha && (
            <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5">
              <IconeDormir className="size-3 text-slate-400" />
              {dormida.desconhecida ? (
                <span className="text-slate-500 italic" title={dormida.nota ?? undefined}>
                  Onde dorme: por definir
                </span>
              ) : dormidaSugerida ? (
                <span title={dormida.nota ?? undefined}>
                  Dorme em <span aria-hidden="true">≈ </span>
                  {dormida.rotulo}
                  <span className="text-slate-500 italic"> · sugerido</span>
                </span>
              ) : (
                <span>Dorme em {dormida.rotulo}</span>
              )}
              {dormidaAlterada && (
                <span className="font-semibold text-amber-800" title="Alterado — por guardar">
                  <span aria-hidden="true">●</span>
                  <span className="sr-only"> (alterado, por guardar)</span>
                </span>
              )}
              {modoEdicao && (
                <button
                  type="button"
                  onClick={() => abrirDormida(carrinha.id)}
                  aria-label={`Mudar onde dorme ${carrinha.tipo === 'carro' ? 'o' : 'a'} ${carrinha.matricula}`}
                  title="Mudar onde dorme"
                  className={`${BOTAO_MINI} ml-0.5`}
                >
                  Mudar
                </button>
              )}
            </span>
          )}
          {faltaCondutor && (
            <span
              className="inline-flex items-center gap-1 text-slate-500 italic"
              title="Leva passageiros e ninguém está marcado como condutor"
            >
              <IconeVolante tamanho={11} className="text-slate-400" />
              {ROTULO_SEM_CONDUTOR}
            </span>
          )}
          {soCabecalho && <span className="text-slate-500 italic">Ninguém com estes filtros.</span>}
        </p>
      )}

      {aberta && (
        <div id={idCorpo} className="@container border-t border-slate-100 px-2 pt-1.5 pb-2">
          <CorpoSeccao seccao={s} indices={indices} vazios={lugaresVazios(s, comFiltros)} />
        </div>
      )}
    </section>
  );
}
