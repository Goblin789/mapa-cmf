// Contadores do cabeçalho: lugares livres nas casas, sem transporte, fora das casas,
// carrinhas paradas/oficina, carrinhas vazias e "a confirmar". Os que têm detalhe abrem um popover
// (casas com lugares livres e acima do contrato; divisão por cliente; explicação).
// No PC cabem numa linha; no telemóvel ficam em grelha de 3.
// No modo de edição, um contador que a simulação mudou mostra o valor gravado e o novo ("6 → 4").

import { type ReactNode, useCallback, useId, useRef, useState } from 'react';
import type { ContagemPorCliente } from '../../dominio/contadores';
import type { Cliente, Id } from '../../dominio/tipos';
import { ESTILO_AVISO_CONTRATO } from '../comum/lotacao';
import { valorAnterior } from '../edicao/resumo';
import { useLoja } from '../estado/loja';
import { divisaoPorCliente } from './agrupar';
import { FOCO_VISIVEL, Z_POPOVER } from './classes';
import { destinoNoMapa, resumoDasCasas, ZOOM_DESTINO } from './fichas';
import { useFecharFora } from './ganchos';
import { MarcaCliente } from './pecas';
import { deslocamentoPopover } from './teclado';
import { comPlural, textoContrato } from './textos';

const LARGURA_POPOVER_PX = 240;

const CLASSE_PASTILHA =
  'flex h-full w-full items-start gap-1 rounded-md border px-2 py-1 text-left sm:items-center sm:px-1.5 sm:py-0.5';

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
  return (
    <span className="flex min-w-0 flex-col sm:flex-row sm:items-baseline sm:gap-1 sm:whitespace-nowrap">
      <strong className="text-base leading-tight font-bold tabular-nums sm:text-sm">
        {antes !== null && <Antes valor={antes} />}
        {valor}
      </strong>
      <span className="text-[11px] leading-tight text-slate-700 sm:order-first sm:text-xs">{rotulo}</span>
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
  return (
    <li className="min-w-0">
      <div className={`${CLASSE_PASTILHA} ${antes !== null ? CLASSE_MUDOU : classe}`} title={titulo}>
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
  const [aberto, setAberto] = useState(false);
  const [deslocamento, setDeslocamento] = useState(0);
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

  return (
    <li ref={contentor} className="relative min-w-0">
      <button
        ref={botao}
        type="button"
        aria-expanded={aberto}
        aria-controls={idDetalhe}
        title={titulo}
        onClick={(e) => {
          if (!aberto) {
            const r = e.currentTarget.getBoundingClientRect();
            setDeslocamento(deslocamentoPopover(r.left, LARGURA_POPOVER_PX, window.innerWidth));
          }
          setAberto(!aberto);
        }}
        className={`${CLASSE_PASTILHA} ${FOCO_VISIVEL} ${
          aberto
            ? 'border-slate-900 bg-slate-100'
            : antes !== null
              ? `${CLASSE_MUDOU} hover:bg-amber-100`
              : 'border-slate-300 bg-white hover:bg-slate-50'
        }`}
      >
        <NumeroERotulo valor={valor} rotulo={rotulo} extra={extra} antes={antes} />
        <span aria-hidden="true" className="ml-auto text-[10px] text-slate-500 sm:ml-0">
          {aberto ? '▴' : '▾'}
        </span>
      </button>
      <div
        ref={detalhe}
        id={idDetalhe}
        hidden={!aberto}
        style={{ left: deslocamento }}
        className={`absolute top-full mt-1 ${Z_POPOVER} w-60 rounded-md border border-slate-300 bg-white p-2 text-xs shadow-lg`}
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

/** Botão com o nome de uma casa: põe-na em foco e leva o mapa até ela. */
function BotaoCasa({ casaId, nome, depois }: { casaId: Id; nome: string; depois: () => void }) {
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const definirFoco = useLoja((s) => s.definirFoco);
  const pedirIrPara = useLoja((s) => s.pedirIrPara);
  return (
    <button
      type="button"
      onClick={() => {
        definirFoco({ tipo: 'casa', id: casaId });
        const destino = indices
          ? destinoNoMapa({ tipo: 'casa', id: casaId }, indices, dormidas ?? new Map())
          : null;
        if (destino) pedirIrPara(destino.lat, destino.lng, ZOOM_DESTINO);
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
  if (!contadores || !indices) return null;

  const acima = contadores.casasAcimaContrato;
  const aConfirmar = contadores.aConfirmar;
  const antes = (gravado: number | undefined, visivel: number) => valorAnterior(modoEdicao, gravado, visivel);
  const acimaAntes = antes(gravados?.casasAcimaContrato, acima);

  return (
    <ul
      aria-label="Contadores"
      className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:flex-wrap sm:items-stretch"
    >
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
          Os estados das carrinhas (oficina, parada, carro de substituição) chegam no M3. Até lá este número é
          sempre 0.
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
        classe={aConfirmar > 0 ? 'border-amber-500 bg-amber-100 text-amber-950' : 'border-slate-300 bg-white'}
        extra={
          aConfirmar > 0 && (
            <span aria-hidden="true" className="hidden font-bold text-amber-800 sm:inline">
              ?
            </span>
          )
        }
      />
    </ul>
  );
}
