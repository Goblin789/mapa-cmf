// Contadores do cabeçalho: lugares livres nas casas, sem transporte, fora das casas,
// carrinhas paradas/oficina, carrinhas vazias e "a confirmar". Os que têm detalhe abrem um popover
// (casas com lugares livres e acima do contrato; divisão por cliente; explicação).
// No PC cabem numa linha. No telemóvel ficam em grelha de 3 no Mapa (lá a página cresce e o cabeçalho
// sobe ao deslizar) e numa só linha, a deslizar de lado, na Tabela e no Quadro ("compactos": lá o
// cabeçalho fica sempre à vista e duas linhas de contadores roubavam espaço à vista e à ficha).
// Compactos, os popovers são fixos (a linha que desliza cortava-os) e fecham quando algo desliza.
// No modo de edição, um contador que a simulação mudou mostra o valor gravado e o novo ("6 → 4").
// As casas do popover mostram-se na vista ativa, sem mudar de vista (vistas/mostrar.ts): no Mapa o mapa
// vai lá; na Tabela e no Quadro (também na reunião) a vista desliza até ela e acende-a.

import { createContext, type ReactNode, useCallback, useContext, useId, useRef, useState } from 'react';
import type { ContagemPorCliente } from '../../dominio/contadores';
import type { Cliente, Id } from '../../dominio/tipos';
import { ESTILO_AVISO_CONTRATO } from '../comum/lotacao';
import { valorAnterior } from '../edicao/resumo';
import { useLoja } from '../estado/loja';
import { mostrarElemento } from '../vistas/mostrar';
import { useVista } from '../vistas/vista';
import { divisaoPorCliente } from './agrupar';
import { FOCO_VISIVEL, Z_POPOVER } from './classes';
import { resumoDasCasas } from './fichas';
import { useFecharFora } from './ganchos';
import { useFecharAoDeslizar } from './Legenda';
import { MarcaCliente } from './pecas';
import { deslocamentoPopover } from './teclado';
import { comPlural, textoContrato } from './textos';

const LARGURA_POPOVER_PX = 240;

/** Telemóvel na Tabela e no Quadro: uma só linha a deslizar de lado, com o aspeto do PC (ver o topo). */
const ContextoCompacto = createContext(false);

/** Classes de cada peça: [normal (grelha no telemóvel), compacto]. A partir de 640 px são iguais. */
const CLASSES = {
  pastilha: [
    'flex h-full w-full items-start gap-1 rounded-md border px-2 py-1 text-left sm:items-center sm:px-1.5 sm:py-0.5',
    'flex h-full w-full items-center gap-1 rounded-md border px-2 py-1 text-left whitespace-nowrap sm:px-1.5 sm:py-0.5',
  ],
  item: ['min-w-0', 'shrink-0 sm:min-w-0 sm:shrink'],
  numeroERotulo: [
    'flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1 sm:whitespace-nowrap',
    'flex min-w-0 flex-row items-baseline gap-1 whitespace-nowrap',
  ],
  numero: [
    'text-base leading-tight font-bold tabular-nums sm:text-sm',
    'text-sm leading-tight font-bold tabular-nums',
  ],
  rotulo: [
    'text-[11px] leading-tight text-slate-700 sm:order-first sm:text-xs',
    'order-first text-xs leading-tight text-slate-700',
  ],
  seta: ['ml-auto text-[10px] text-slate-500 sm:ml-0', 'text-[10px] text-slate-500'],
  lista: [
    'grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:items-stretch',
    // Desliza de lado dentro da largura do cabeçalho (a página nunca), sem barra à vista.
    'flex w-full gap-1 overflow-x-auto [scrollbar-width:none] sm:w-auto sm:flex-wrap sm:items-stretch sm:overflow-visible',
  ],
} as const;

function useClasse() {
  const compacto = useContext(ContextoCompacto);
  return (peca: keyof typeof CLASSES) => CLASSES[peca][compacto ? 1 : 0];
}

/** Compactos só abaixo de 640 px: daí para cima o cabeçalho é o do PC em todas as vistas. */
function ehTelemovel(): boolean {
  return window.matchMedia?.('(max-width: 639.98px)').matches ?? false;
}

/** Classes de uma pastilha cujo valor a simulação mudou. */
const CLASSE_MUDOU = 'border-amber-500 bg-amber-50';

/** "6 → " antes do valor novo, com o gravado mais claro. */
function Antes({ valor }: { valor: number }) {
  return (
    <>
      <span className="font-medium text-slate-500">{valor}</span>
      <span aria-hidden="true" className="px-0.5 font-normal text-amber-700">
        →
      </span>
      <span className="sr-only"> passa a </span>
    </>
  );
}

/**
 * Número e rótulo: número por cima no telemóvel, rótulo antes do número no PC.
 * Com `antes` (modo de edição, o valor mudou): "6 → 4".
 */
function NumeroERotulo({
  valor,
  rotulo,
  extra,
  antes = null,
}: {
  valor: number;
  rotulo: string;
  extra?: ReactNode;
  antes?: number | null;
}) {
  const classe = useClasse();
  return (
    <span className={classe('numeroERotulo')}>
      <strong className={classe('numero')}>
        {antes !== null && <Antes valor={antes} />}
        {valor}
      </strong>
      <span className={classe('rotulo')}>{rotulo}</span>
      {extra}
    </span>
  );
}

function Pastilha({
  valor,
  rotulo,
  titulo,
  extra,
  antes = null,
  classe = 'border-slate-300 bg-white',
}: {
  valor: number;
  rotulo: string;
  titulo: string;
  extra?: ReactNode;
  antes?: number | null;
  classe?: string;
}) {
  const classeDe = useClasse();
  return (
    <li className={classeDe('item')}>
      <div className={`${classeDe('pastilha')} ${antes !== null ? CLASSE_MUDOU : classe}`} title={titulo}>
        <NumeroERotulo valor={valor} rotulo={rotulo} extra={extra} antes={antes} />
      </div>
    </li>
  );
}

/** Pastilha-botão que abre um popover. O conteúdo pode receber `fechar` (para os seus botões). */
function PastilhaComDetalhe({
  valor,
  rotulo,
  titulo,
  extra,
  antes = null,
  children,
}: {
  valor: number;
  rotulo: string;
  titulo: string;
  extra?: ReactNode;
  antes?: number | null;
  children: ReactNode | ((fechar: () => void) => ReactNode);
}) {
  const classe = useClasse();
  const compacto = useContext(ContextoCompacto);
  const [aberto, setAberto] = useState(false);
  const [deslocamento, setDeslocamento] = useState(0);
  // Compactos, no telemóvel: popover fixo, aqui. null = por baixo da pastilha, como sempre.
  const [fixo, setFixo] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  const contentor = useRef<HTMLLIElement>(null);
  const botao = useRef<HTMLButtonElement>(null);
  const detalhe = useRef<HTMLDivElement>(null);
  const idDetalhe = useId();
  const fechar = useCallback(() => {
    // Se o foco estava no popover (Esc ou um botão lá dentro), volta ao botão em vez de se perder.
    if (detalhe.current?.contains(document.activeElement)) botao.current?.focus();
    setAberto(false);
  }, []);
  useFecharFora(aberto, contentor, fechar);
  useFecharAoDeslizar(aberto && fixo !== null, detalhe, fechar);

  return (
    <li ref={contentor} className={`relative ${classe('item')}`}>
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        title={titulo}
        onClick={(e) => {
          if (!aberto) {
            const r = e.currentTarget.getBoundingClientRect();
            const d = deslocamentoPopover(r.left, LARGURA_POPOVER_PX, window.innerWidth);
            setDeslocamento(d);
            const top = r.bottom + 4;
            setFixo(
              compacto && ehTelemovel()
                ? { top, left: r.left + d, maxHeight: Math.max(120, window.innerHeight - top - 8) }
                : null,
            );
          }
          setAberto(!aberto);
        }}
        className={`${classe('pastilha')} ${FOCO_VISIVEL} ${
          aberto
            ? 'border-slate-900 bg-slate-100'
            : antes !== null
              ? `${CLASSE_MUDOU} hover:bg-amber-100`
              : 'border-slate-300 bg-white hover:bg-slate-50'
        }`}
      >
        <NumeroERotulo valor={valor} rotulo={rotulo} extra={extra} antes={antes} />
        <span aria-hidden="true" className={classe('seta')}>
          {aberto ? '▴' : '▾'}
        </span>
      </button>
      <div
        ref={detalhe}
        id={idDetalhe}
        hidden={!aberto}
        style={fixo ?? { left: deslocamento }}
        className={`${fixo ? 'fixed overflow-y-auto' : 'absolute top-full mt-1'} ${Z_POPOVER} w-60 rounded-md border border-slate-300 bg-white p-2 text-xs shadow-lg`}
      >
        {typeof children === 'function' ? children(fechar) : children}
      </div>
    </li>
  );
}

function DivisaoPorCliente({
  titulo,
  contagem,
  clientes,
}: {
  titulo: string;
  contagem: ContagemPorCliente;
  clientes: Map<Id, Cliente>;
}) {
  const parcelas = divisaoPorCliente(contagem.porCliente, clientes);
  return (
    <>
      <p className="mb-1 font-semibold text-slate-900">
        {titulo}: {contagem.total}
      </p>
      {parcelas.length === 0 ? (
        <p className="text-slate-600 italic">Ninguém.</p>
      ) : (
        <ul className="space-y-0.5">
          {parcelas.map((p) => (
            <li key={p.clienteId} className="flex items-center gap-2">
              <MarcaCliente cliente={p.cliente} />
              <span className="min-w-0 flex-1 truncate">{p.cliente?.nome ?? 'Cliente desconhecido'}</span>
              <span className="font-semibold tabular-nums">{p.n}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/** Botão com o nome de uma casa: põe-na em foco e leva a vista ativa até ela (no Mapa, o mapa). */
function BotaoCasa({ casaId, nome, depois }: { casaId: Id; nome: string; depois: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        mostrarElemento({ tipo: 'casa', id: casaId }, { noMapa: 'ir' });
        depois();
      }}
      className={`min-w-0 truncate rounded-sm text-left font-medium text-blue-800 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-800 ${FOCO_VISIVEL}`}
    >
      {nome}
    </button>
  );
}

function ResumoCasas({ total, fechar }: { total: number; fechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  if (!estado || !indices) return null;
  const { comLivres, acimaContrato } = resumoDasCasas(estado.casas, indices);
  const sempreCheias = estado.casas.filter((c) => c.sempreCheia).sort((x, y) => x.ordem - y.ordem);
  return (
    <>
      <p className="mb-1 font-semibold text-slate-900">Lugares livres nas casas: {total}</p>
      {comLivres.length === 0 ? (
        <p className="text-slate-600 italic">Nenhuma casa tem lugares livres.</p>
      ) : (
        <ul className="space-y-0.5">
          {comLivres.map(({ casa, ocupacao }) => (
            <li key={casa.id} className="flex items-baseline justify-between gap-2">
              <BotaoCasa casaId={casa.id} nome={casa.nome} depois={fechar} />
              <span className="shrink-0 tabular-nums">{comPlural(ocupacao.livres, 'livre', 'livres')}</span>
            </li>
          ))}
        </ul>
      )}
      {sempreCheias.length > 0 && (
        <p className="mt-1 text-slate-600">
          Não contam (sempre cheias): {sempreCheias.map((c) => c.nome).join(', ')}.
        </p>
      )}
      {acimaContrato.length > 0 && (
        <>
          <p className="mt-2 mb-1 font-semibold text-slate-900">Acima do contrato: {acimaContrato.length}</p>
          <ul className="space-y-1">
            {acimaContrato.map(({ casa, ocupacao }) => {
              const aviso = ESTILO_AVISO_CONTRATO[ocupacao.aviso];
              return (
                <li key={casa.id} className="flex items-start gap-1.5">
                  <span
                    className={`shrink-0 rounded border px-1 leading-4 font-bold ${aviso?.classe ?? ''}`}
                    title={aviso?.rotulo}
                  >
                    <span aria-hidden="true">▲</span>
                    <span className="sr-only">{aviso?.rotulo}:</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <BotaoCasa casaId={casa.id} nome={casa.nome} depois={fechar} />
                    <span className="block text-slate-700">
                      {ocupacao.usados} para {textoContrato(casa)}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </>
  );
}

export function Contadores() {
  const contadores = useLoja((s) => s.contadores);
  const gravados = useLoja((s) => s.contadoresServidor);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const indices = useLoja((s) => s.indices);
  const compacto = useVista((s) => s.vista !== 'mapa');
  if (!contadores || !indices) return null;

  const acima = contadores.casasAcimaContrato;
  const aConfirmar = contadores.aConfirmar;
  const antes = (gravado: number | undefined, visivel: number) => valorAnterior(modoEdicao, gravado, visivel);
  const acimaAntes = antes(gravados?.casasAcimaContrato, acima);

  return (
    <ContextoCompacto.Provider value={compacto}>
      <ListaContadores>
        <PastilhaComDetalhe
          valor={contadores.lugaresLivresCasas}
          antes={antes(gravados?.lugaresLivresCasas, contadores.lugaresLivresCasas)}
          rotulo="Livres nas casas"
          titulo="Casas com lugares livres e casas acima do contrato"
          extra={
            (acima > 0 || acimaAntes !== null) && (
              <span className="text-[11px] leading-tight font-semibold text-amber-800 sm:text-xs">
                {/* "N casas", não só "N": ao lado de "Livres nas casas" lia-se como lugares a mais.
                  "do contrato" só se vê a partir de 1600 px (abaixo disso, com a pesquisa e os botões Histórico
                  e Editar, o cabeçalho deixava de caber numa linha). */}
                <span aria-hidden="true">▲ </span>
                {acimaAntes !== null && <Antes valor={acimaAntes} />}
                {comPlural(acima, 'casa', 'casas')} acima
                <span className="sr-only min-[1600px]:not-sr-only"> do contrato</span>
              </span>
            )
          }
        >
          {(fechar) => <ResumoCasas total={contadores.lugaresLivresCasas} fechar={fechar} />}
        </PastilhaComDetalhe>
        <PastilhaComDetalhe
          valor={contadores.semTransporte.total}
          antes={antes(gravados?.semTransporte.total, contadores.semTransporte.total)}
          rotulo="Sem transporte"
          titulo="Pessoas sem carrinha da empresa, por cliente"
        >
          <DivisaoPorCliente
            titulo="Sem transporte da empresa"
            contagem={contadores.semTransporte}
            clientes={indices.clientes}
          />
        </PastilhaComDetalhe>
        <PastilhaComDetalhe
          valor={contadores.foraDasCasas.total}
          antes={antes(gravados?.foraDasCasas.total, contadores.foraDasCasas.total)}
          rotulo="Fora das casas"
          titulo="Pessoas fora das casas CMF, por cliente"
        >
          <DivisaoPorCliente
            titulo="Fora das casas CMF"
            contagem={contadores.foraDasCasas}
            clientes={indices.clientes}
          />
        </PastilhaComDetalhe>
        <PastilhaComDetalhe
          valor={contadores.carrinhasParadas}
          antes={antes(gravados?.carrinhasParadas, contadores.carrinhasParadas)}
          rotulo="Paradas/oficina"
          titulo="Carrinhas paradas ou na oficina"
        >
          <p className="font-semibold text-slate-900">Carrinhas paradas ou na oficina</p>
          <p className="mt-1 text-slate-700">
            Os estados das carrinhas (oficina, parada, carro de substituição) chegam no M3. Até lá este número
            é sempre 0.
          </p>
        </PastilhaComDetalhe>
        <Pastilha
          valor={contadores.carrinhasSemPassageiros}
          antes={antes(gravados?.carrinhasSemPassageiros, contadores.carrinhasSemPassageiros)}
          rotulo="Carrinhas vazias"
          titulo="Carrinhas sem ninguém atribuído"
        />
        <Pastilha
          valor={aConfirmar}
          antes={antes(gravados?.aConfirmar, aConfirmar)}
          rotulo="A confirmar"
          titulo="Pessoas com a casa ou a carrinha por confirmar (assinaladas com ?)"
          classe={
            aConfirmar > 0 ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white'
          }
          extra={
            aConfirmar > 0 && (
              <span
                aria-hidden="true"
                className={`${compacto ? 'inline' : 'hidden sm:inline'} font-bold text-amber-800`}
              >
                ?
              </span>
            )
          }
        />
      </ListaContadores>
    </ContextoCompacto.Provider>
  );
}

function ListaContadores({ children }: { children: ReactNode }) {
  const classe = useClasse();
  return (
    <ul aria-label="Contadores" className={classe('lista')}>
      {children}
    </ul>
  );
}
