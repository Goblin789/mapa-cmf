// Ficha rápida do que está em foco (pessoa, casa ou carrinha), sobre o canto superior esquerdo do mapa
// ou por cima da Tabela e do Quadro. Fecha com o botão ou com Esc. As casas, carrinhas e nomes da ficha
// (e os nomes dos moradores e passageiros) mudam o foco e levam a vista até lá (vistas/mostrar.ts), sem
// mudar de vista; no Mapa só mudam o foco.
// No modo de edição: marca "alterado — por guardar", mostra o valor gravado ao lado do que mudou,
// quem entra e sai, os botões "Mudar casa/carrinha/obra" (abrem o "Mover para…"), os de condutor
// ("Tornar condutor" / "Tirar condutor") e os de onde dorme a carrinha ("Mudar onde dorme…",
// "Confirmar sugestão"). O condutor aparece sempre em primeiro, com o volante.
// `lugar` diz onde a ficha aparece (docs/vistas-edicao.md). 'mapa' = sobre o canto superior esquerdo do
// mapa (como sempre); 'vista' = na Tabela e no Quadro, que a montam por cima da sua área de conteúdo (num
// invólucro `relative`): no PC em cima à direita, 22 rem; no telemóvel em baixo, a toda a largura, e
// RECOLHIDA: só o cabeçalho (título, "Ver no mapa", ✕), uma linha de resumo e as ações principais do modo
// de edição, para a Tabela e o Quadro continuarem à vista (cada toque num nome abre-a). "Ver tudo" abre-a
// toda (até 60 % da altura, a deslizar por dentro, sempre com umas linhas da vista à mostra); volta a
// recolher quando o foco muda a partir da vista (as ligações e os nomes da própria ficha não a recolhem).
// Na vista a ficha tem o botão "Ver no mapa" (o único que muda de vista).

import {
  createContext,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { clienteEfetivoId } from '../../dominio/cores';
import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { ocupacaoCarrinha, ocupacaoCasa } from '../../dominio/ocupacao';
import type { Carrinha, Casa, Id, Pessoa } from '../../dominio/tipos';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_AVISO_CONTRATO } from '../comum/lotacao';
import { formatarMatricula } from '../comum/Matricula';
import {
  AcoesDormida,
  AcoesPessoa,
  CondutorGravado,
  DormidaGravada,
  MarcaAlterado,
  MovimentosPendentes,
  PassageirosEmEdicao,
  usePessoaAlterada,
  useSitioAlterado,
  ValorGravado,
} from '../edicao/PecasFoco';
import { type Foco, useLoja } from '../estado/loja';
import { IconeMapa } from '../vistas/icones';
import { ATRIBUTO_FICHA, mostrarElemento, seguirPessoaEmFoco } from '../vistas/mostrar';
import { verNoMapa } from '../vistas/navegar';
import { alturaMaximaPainelFoco, FOCO_VISIVEL, Z_SOBRE_MAPA } from './classes';
import { carrinhaConduzida, condutorDaCarrinha, ROTULO_SEM_CONDUTOR } from './condutor';
import { cadeiaDaPessoa, carrinhasDasPessoas, carrinhasQueDormemEm, casasDasPessoas } from './fichas';
import { useAlturaLegenda } from './ganchos';
import { GrelhaNomes, IconeFechar, MarcaAConfirmar, MarcaCliente, PastilhaLotacao } from './pecas';
import {
  APARTAMENTO_POR_CONFIRMAR,
  comPlural,
  hojeISO,
  nomeCompleto,
  ROTULO_FORA_DAS_CASAS,
  ROTULO_SEM_TRANSPORTE,
  ROTULO_TIPO_VEICULO,
  textoApartamento,
  textoCarta,
  textoContrato,
  textoDormida,
  textoMarcaModelo,
  textoTelefone,
} from './textos';

/** Onde a ficha aparece: sobre o mapa ou sobre a Tabela/Quadro. */
export type LugarFicha = 'mapa' | 'vista';

const ContextoLugar = createContext<LugarFicha>('mapa');

/**
 * Ficha da vista no telemóvel: se está aberta toda ou recolhida. null no mapa e no PC (sempre inteira,
 * como sempre).
 */
interface Recolher {
  inteira: boolean;
  alternar: () => void;
  /** Um clique dentro da ficha: se mudar o foco (ligações, nomes), a ficha fica como está. */
  marcarDentro: () => void;
}
const ContextoRecolher = createContext<Recolher | null>(null);

/** O contrário do `sm:` do Tailwind: abaixo disto a ficha da vista é uma folha em baixo. */
const CONSULTA_TELEMOVEL = '(max-width: 39.99rem)';

function subscreverTelemovel(avisar: () => void): () => void {
  const consulta = window.matchMedia(CONSULTA_TELEMOVEL);
  consulta.addEventListener('change', avisar);
  return () => consulta.removeEventListener('change', avisar);
}

function useTelemovel(): boolean {
  return useSyncExternalStore(
    subscreverTelemovel,
    () => window.matchMedia(CONSULTA_TELEMOVEL).matches,
    () => false,
  );
}

/**
 * Posição, tamanho e sombra da ficha em cada lugar (a do mapa é a de sempre). Na vista, no telemóvel, é
 * uma folha em baixo (a sombra para cima separa-a do que está por trás); a partir de 640 px, um cartão em
 * cima à direita. O conteúdo desliza por dentro (Moldura): a ficha nunca faz a página deslizar.
 */
const CLASSES_LUGAR: Record<LugarFicha, string> = {
  mapa: 'top-3 left-3 w-[min(22rem,calc(100%-4.5rem))] rounded-lg shadow-lg',
  vista:
    'inset-x-2 bottom-2 rounded-xl shadow-[0_-4px_24px_rgb(15_23_42/0.22)] sm:inset-x-auto sm:top-2 sm:right-3 sm:bottom-auto sm:max-h-[calc(100%-1rem)] sm:w-[min(22rem,calc(100%-1.5rem))] sm:rounded-lg sm:shadow-lg',
};

/**
 * Altura máxima da ficha da vista no telemóvel (no PC manda o `sm:max-h` de cima).
 * - Inteira: até 60 % da área da vista, ou até 16 rem se a área der, mas deixando sempre 6 rem da vista à
 *   mostra (num ecrã baixo, a editar, a área fica com uns 320 px: 16 rem tapava-a quase toda).
 * - Recolhida: o que precisa (cabeçalho, resumo, ações), até 45 % da área (ou 9 rem, se a área der).
 */
const ALTURA_VISTA_TELEMOVEL = {
  inteira: 'max-h-[max(60%,min(16rem,calc(100%-6rem)))]',
  recolhida: 'max-h-[max(45%,min(9rem,calc(100%-1rem)))]',
} as const;

/**
 * As ações (AcoesPessoa, AcoesDormida) na ficha recolhida: sem a linha por cima nem o título "Mudar", numa
 * só fila que desliza de lado (o último botão fica meio à vista), para a ficha recolhida não crescer.
 */
const ACOES_RECOLHIDA =
  'mt-1.5 [&_button]:shrink-0 [&_button]:whitespace-nowrap [&>div]:mt-0 [&>div]:border-t-0 [&>div]:pt-0 [&>div>div]:flex-nowrap [&>div>div]:overflow-x-auto [&>div>p]:sr-only [&>span]:mt-0 [&>span]:flex-nowrap [&>span]:overflow-x-auto';

const ROTULO_ELEMENTO = { casa: 'Casa', carrinha: 'Carrinha', obra: 'Obra' } as const;
const CAMPO_ELEMENTO = { casa: 'casaId', carrinha: 'carrinhaId', obra: 'obraId' } as const;

function Moldura({
  tipo,
  titulo,
  subtitulo,
  alterado = false,
  resumo,
  acoes,
  children,
}: {
  tipo: string;
  titulo: string;
  subtitulo?: ReactNode;
  /** Tem alterações por guardar (modo de edição). */
  alterado?: boolean;
  /** Ficha recolhida (vista, telemóvel): o essencial numa ou duas linhas, em vez do corpo. */
  resumo?: ReactNode;
  /** Ficha recolhida: as ações principais (as mesmas que o corpo tem no fim). */
  acoes?: ReactNode;
  children: ReactNode;
}) {
  const definirFoco = useLoja((s) => s.definirFoco);
  const idTitulo = useId();
  const idCorpo = useId();
  const alturaLegenda = useAlturaLegenda();
  const lugar = useContext(ContextoLugar);
  const recolher = useContext(ContextoRecolher);
  const recolhida = recolher !== null && !recolher.inteira;
  const altura = lugar === 'vista' ? ALTURA_VISTA_TELEMOVEL[recolhida ? 'recolhida' : 'inteira'] : '';
  return (
    <section
      aria-labelledby={idTitulo}
      // Na vista, quem desliza até um elemento (vistas/mostrar.ts) deixa-o fora da ficha.
      {...{ [ATRIBUTO_FICHA]: lugar }}
      // No mapa, a ficha acaba por cima da legenda (canto inferior esquerdo) em vez de a tapar.
      style={lugar === 'mapa' ? { maxHeight: alturaMaximaPainelFoco(alturaLegenda) } : undefined}
      onClickCapture={
        lugar === 'vista'
          ? (e) => {
              recolher?.marcarDentro();
              seguirNomeClicado(e);
            }
          : undefined
      }
      className={`absolute ${CLASSES_LUGAR[lugar]} ${altura} ${Z_SOBRE_MAPA} flex flex-col overflow-hidden border bg-white text-sm ${
        alterado ? 'border-amber-400' : 'border-slate-300'
      }`}
    >
      <header
        className={`flex items-start gap-2 border-b border-slate-200 px-3 ${recolhida ? 'py-1.5' : 'py-2'}`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase">{tipo}</span>
            {alterado && <MarcaAlterado />}
            {recolher && (
              <BotaoRecolher inteira={recolher.inteira} alternar={recolher.alternar} corpo={idCorpo} />
            )}
          </p>
          {/* Recolhida: o título numa linha (inteiro na ficha toda) e sem o subtítulo; tocar-lhe abre-a. */}
          <h2
            id={idTitulo}
            className={`text-base leading-tight font-bold text-slate-900 ${recolhida ? 'truncate' : 'break-words'}`}
          >
            {recolhida && recolher ? (
              <button
                type="button"
                onClick={recolher.alternar}
                aria-controls={idCorpo}
                aria-expanded={false}
                title={`${titulo}: ver a ficha toda`}
                className={`max-w-full truncate rounded-sm text-left ${FOCO_VISIVEL}`}
              >
                {titulo}
              </button>
            ) : (
              titulo
            )}
          </h2>
          {subtitulo && !recolhida && <p className="mt-0.5 text-xs text-slate-700">{subtitulo}</p>}
        </div>
        {lugar === 'vista' && <BotaoVerNoMapa />}
        <button
          type="button"
          aria-label="Fechar a ficha"
          title="Fechar (Esc)"
          onClick={() => definirFoco(null)}
          className={`-mr-1 shrink-0 rounded p-1 text-slate-600 hover:bg-slate-100 hover:text-slate-900 ${FOCO_VISIVEL}`}
        >
          <IconeFechar />
        </button>
      </header>
      <div id={idCorpo} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {recolhida ? (
          <>
            {resumo}
            {acoes && <div className={ACOES_RECOLHIDA}>{acoes}</div>}
          </>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

/** Seta para cima (abrir a ficha toda) ou para baixo (recolher). */
function IconeSeta({ paraCima }: { paraCima: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paraCima ? 'm3.5 10 4.5-4.5 4.5 4.5' : 'm3.5 6 4.5 4.5 4.5-4.5'} />
    </svg>
  );
}

/** Na ficha da vista no telemóvel, na linha do tipo: "Ver tudo" abre-a toda; "Recolher" volta a fechá-la. */
function BotaoRecolher({
  inteira,
  alternar,
  corpo,
}: {
  inteira: boolean;
  alternar: () => void;
  corpo: string;
}) {
  return (
    <button
      type="button"
      aria-expanded={inteira}
      aria-controls={corpo}
      title={inteira ? 'Recolher a ficha' : 'Ver a ficha toda'}
      onClick={alternar}
      className={`-my-1 ml-auto inline-flex shrink-0 items-center gap-0.5 rounded px-1 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-50 ${FOCO_VISIVEL}`}
    >
      {inteira ? 'Recolher' : 'Ver tudo'}
      <IconeSeta paraCima={!inteira} />
    </button>
  );
}

/**
 * Na ficha da vista, os nomes (moradores, passageiros) são NomeChip, que só mudam o foco (e a seleção, no
 * modo de edição) e não deixam o clique subir. Apanha-se o clique ao descer e, depois de o nome o tratar,
 * se a pessoa ficou em foco a vista leva-se até ela, como nas outras ligações da ficha. (Um setTimeout e
 * não uma microtarefa: o React trata o clique ao descer e ao subir em dois ouvintes separados.)
 */
function seguirNomeClicado(e: MouseEvent<HTMLElement>) {
  const nome = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-pessoa-id]') : null;
  // (contains: um clique num diálogo aberto a partir da ficha também passa por aqui no React.)
  const id = nome && e.currentTarget.contains(nome) ? nome.dataset.pessoaId : undefined;
  if (id) setTimeout(() => seguirPessoaEmFoco(id), 0);
}

/** Na Tabela e no Quadro: o único caminho para o Mapa (leva o mapa até ao que está em foco). */
function BotaoVerNoMapa() {
  return (
    <button
      type="button"
      title="Ver no mapa"
      onClick={() => {
        const { foco } = useLoja.getState();
        if (foco) verNoMapa(foco);
      }}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 ${FOCO_VISIVEL}`}
    >
      <IconeMapa className="size-4" />
      {/* No telemóvel só o ícone (o nome do botão fica para os leitores de ecrã). */}
      <span className="sr-only sm:not-sr-only">Ver no mapa</span>
    </button>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="w-24 shrink-0 text-xs leading-5 text-slate-600">{rotulo}</dt>
      <dd className="min-w-0 flex-1 leading-5">{children}</dd>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">{titulo}</h3>
      {children}
    </section>
  );
}

/**
 * Texto clicável que muda o foco para uma pessoa, casa ou carrinha. No Mapa só muda o foco (como sempre);
 * na Tabela e no Quadro a vista também desliza até lá e acende-a.
 */
function BotaoFoco({ foco, children }: { foco: NonNullable<Foco>; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => mostrarElemento(foco, { noMapa: 'so-foco' })}
      className={`rounded-sm text-left font-medium text-blue-800 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-800 ${FOCO_VISIVEL}`}
    >
      {children}
    </button>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <span className="text-slate-600 italic">{children}</span>;
}

function FichaPessoa({ pessoa, indices }: { pessoa: Pessoa; indices: Indices }) {
  const cliente = indices.clientes.get(clienteEfetivoId(pessoa, indices.obras)) ?? null;
  const nome = nomeCompleto(pessoa);
  const hoje = hojeISO();
  const alterada = usePessoaAlterada(pessoa.id);
  const conduz = carrinhaConduzida(pessoa, indices);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const subtitulo = [
    pessoa.numero ? `Nº ${pessoa.numero}` : 'Sem Nº',
    pessoa.nomeCurto !== nome ? `no mapa: ${pessoa.nomeCurto}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const cadeia = cadeiaDaPessoa(pessoa, indices);
  // Texto corrido (parte onde calhar): casa → carrinha → obra numa ou duas linhas.
  const resumo = (
    <p className="leading-5">
      <MarcaCliente cliente={cliente} />
      <span className="sr-only">{cliente?.nome ?? 'Cliente desconhecido'}. </span>
      {cadeia.map((el, i) => (
        <span key={el.tipo}>
          {i > 0 ? (
            <span aria-hidden="true" className="text-slate-400">
              {' → '}
            </span>
          ) : (
            ' '
          )}
          <span className="sr-only">{ROTULO_ELEMENTO[el.tipo]}: </span>
          {el.id && el.tipo !== 'obra' ? (
            <BotaoFoco foco={{ tipo: el.tipo, id: el.id }}>
              {el.tipo === 'carrinha' ? formatarMatricula(el.rotulo) : el.rotulo}
            </BotaoFoco>
          ) : el.id ? (
            <span>{el.rotulo}</span>
          ) : (
            <Vazio>{el.rotulo}</Vazio>
          )}
          {el.aConfirmar && (
            <>
              {' '}
              <MarcaAConfirmar />
            </>
          )}
        </span>
      ))}
      {conduz && (
        <span className="ml-1.5 inline-flex items-center align-[-2px] text-slate-700" title="Condutor">
          <IconeVolante tamanho={14} />
          <span className="sr-only">, condutor</span>
        </span>
      )}
    </p>
  );
  // Fora do modo de edição a ficha recolhida não repete o "Para mudar…: Editar" (a barra já tem Editar).
  const acoes = modoEdicao ? <AcoesPessoa pessoa={pessoa} /> : null;

  return (
    <Moldura
      tipo="Pessoa"
      titulo={nome}
      subtitulo={subtitulo}
      alterado={alterada}
      resumo={resumo}
      acoes={acoes}
    >
      <dl>
        <Linha rotulo="Cliente">
          <span className="inline-flex items-center gap-1.5">
            <MarcaCliente cliente={cliente} />
            {cliente?.nome ?? <Vazio>desconhecido</Vazio>}
          </span>
        </Linha>
      </dl>
      <Secao titulo="Casa → Carrinha → Obra">
        <ol className="space-y-0.5">
          {cadeia.map((el, i) => (
            <li key={el.tipo} className="flex items-start gap-2">
              <span className="w-16 shrink-0 text-xs leading-5 text-slate-600">
                <span aria-hidden="true" className="inline-block w-3 text-slate-500">
                  {i === 0 ? '' : '↳'}
                </span>
                {ROTULO_ELEMENTO[el.tipo]}
              </span>
              <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 leading-5">
                {el.id && el.tipo !== 'obra' ? (
                  <BotaoFoco foco={{ tipo: el.tipo, id: el.id }}>
                    {/* Matrícula como no mapa e no "antes: …" logo abaixo ("ZZ 1001"). */}
                    {el.tipo === 'carrinha' ? formatarMatricula(el.rotulo) : el.rotulo}
                  </BotaoFoco>
                ) : el.id ? (
                  <span>{el.rotulo}</span>
                ) : (
                  <Vazio>{el.rotulo}</Vazio>
                )}
                {el.aConfirmar && <MarcaAConfirmar />}
                <ValorGravado pessoaId={pessoa.id} campo={CAMPO_ELEMENTO[el.tipo]} />
              </span>
            </li>
          ))}
        </ol>
        {conduz && (
          <p className="mt-1.5 flex items-center gap-1.5 text-sm font-medium text-slate-900">
            <IconeVolante tamanho={14} className="text-slate-700" />
            Condutor da {formatarMatricula(conduz.matricula)}
          </p>
        )}
        {conduz && pessoa.temCarta === false && (
          <p className="mt-1 rounded border border-red-500 bg-red-100 px-2 py-1 text-xs font-medium text-red-900">
            <span aria-hidden="true">▲ </span>
            Conduz, mas não tem carta.
          </p>
        )}
      </Secao>
      <dl className="mt-3 border-t border-slate-200 pt-2">
        <Linha rotulo="Telefone">
          {pessoa.telefone ? textoTelefone(pessoa) : <Vazio>{textoTelefone(pessoa)}</Vazio>}
        </Linha>
        <Linha rotulo="Carta">
          {pessoa.temCarta === null ? <Vazio>{textoCarta(pessoa, hoje)}</Vazio> : textoCarta(pessoa, hoje)}
        </Linha>
      </dl>
      <AcoesPessoa pessoa={pessoa} />
    </Moldura>
  );
}

function FichaCasa({
  casa,
  indices,
  dormidas,
}: {
  casa: Casa;
  indices: Indices;
  dormidas: Map<Id, Dormida>;
}) {
  const local = indices.locais.get(casa.localId);
  const moradores = indices.moradores.get(casa.id) ?? [];
  const oc = ocupacaoCasa(casa, moradores.length);
  const aviso = ESTILO_AVISO_CONTRATO[oc.aviso];
  const { carrinhas, semCarrinha } = carrinhasDasPessoas(moradores, indices);
  const dormem = carrinhasQueDormemEm(casa.id, indices, dormidas);
  const apartamento = textoApartamento(casa, indices.casasPorLocal.get(casa.localId)?.length ?? 1);
  const alterada = useSitioAlterado('casaId', casa.id);

  return (
    <Moldura
      tipo="Casa"
      titulo={casa.nome}
      subtitulo={local?.morada ?? 'Morada desconhecida'}
      alterado={alterada}
      resumo={
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-5">
          <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lotacao} nivel={oc.nivel} />
          <span className="text-slate-700">{comPlural(moradores.length, 'morador', 'moradores')}</span>
          {aviso && (
            <span className={`rounded border px-1.5 text-xs font-medium ${aviso.classe}`}>
              <span aria-hidden="true">▲ </span>
              {aviso.rotulo}
            </span>
          )}
        </p>
      }
    >
      <dl>
        {apartamento !== null && (
          <Linha rotulo="Apartamento">
            {apartamento === APARTAMENTO_POR_CONFIRMAR ? <Vazio>{apartamento}</Vazio> : apartamento}
          </Linha>
        )}
        <Linha rotulo="Ocupação">
          <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lotacao} nivel={oc.nivel} />
        </Linha>
        <Linha rotulo="Máx. contrato">{textoContrato(casa)}</Linha>
        {casa.senhorio && <Linha rotulo="Senhorio">{casa.senhorio}</Linha>}
        {casa.equipamento && <Linha rotulo="Equipamento">{casa.equipamento}</Linha>}
      </dl>
      {aviso && (
        <p className={`mt-1 rounded border px-2 py-1 text-xs font-medium ${aviso.classe}`}>
          <span aria-hidden="true">▲ </span>
          {aviso.rotulo}: {comPlural(oc.usados, 'lugar usado', 'lugares usados')} para {textoContrato(casa)}.
        </p>
      )}
      {casa.notaContrato && <p className="mt-1 text-xs text-slate-700 italic">{casa.notaContrato}</p>}
      <MovimentosPendentes campo="casaId" id={casa.id} />

      <Secao titulo={`Moradores (${moradores.length})`}>
        <GrelhaNomes pessoas={moradores} />
      </Secao>

      {moradores.length > 0 && (
        <Secao titulo="Carrinhas dos moradores">
          <ul className="space-y-0.5">
            {carrinhas.map(({ carrinha, n }) => (
              <li key={carrinha.id} className="flex items-baseline gap-2">
                <BotaoFoco foco={{ tipo: 'carrinha', id: carrinha.id }}>{carrinha.matricula}</BotaoFoco>
                <span className="text-xs text-slate-700">{comPlural(n, 'morador', 'moradores')}</span>
              </li>
            ))}
            {semCarrinha > 0 && (
              <li className="flex items-baseline gap-2">
                <Vazio>{ROTULO_SEM_TRANSPORTE}</Vazio>
                <span className="text-xs text-slate-700">
                  {comPlural(semCarrinha, 'morador', 'moradores')}
                </span>
              </li>
            )}
          </ul>
        </Secao>
      )}

      {dormem.length > 0 && (
        <Secao titulo="Carrinhas que dormem aqui">
          <ul className="space-y-0.5">
            {dormem.map(({ carrinha, confianca }) => (
              <li key={carrinha.id} className="flex items-baseline gap-2">
                <BotaoFoco foco={{ tipo: 'carrinha', id: carrinha.id }}>{carrinha.matricula}</BotaoFoco>
                {confianca === 'sugerida' && <span className="text-xs text-slate-700">(sugerida)</span>}
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </Moldura>
  );
}

function FichaCarrinha({
  carrinha,
  indices,
  dormidas,
}: {
  carrinha: Carrinha;
  indices: Indices;
  dormidas: Map<Id, Dormida>;
}) {
  const passageiros = indices.passageiros.get(carrinha.id) ?? [];
  const oc = ocupacaoCarrinha(carrinha, passageiros.length);
  const dormida = dormidas.get(carrinha.id);
  const dorme = textoDormida(dormida, indices);
  const sugerida = dormida?.confianca === 'sugerida';
  const marcaModelo = textoMarcaModelo(carrinha);
  const tipo = ROTULO_TIPO_VEICULO[carrinha.tipo];
  const { casas, semCasa } = casasDasPessoas(passageiros, indices);
  const alternativas = carrinha.matriculasAlternativas.length
    ? `também ${carrinha.matriculasAlternativas.join(', ')}`
    : null;
  const alterada = useSitioAlterado('carrinhaId', carrinha.id);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const condutor = condutorDaCarrinha(carrinha, indices);

  return (
    <Moldura
      tipo={carrinha.temporaria ? `${tipo} de substituição` : tipo}
      titulo={formatarMatricula(carrinha.matricula)}
      subtitulo={alternativas}
      alterado={alterada}
      resumo={
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-5">
          <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lugares} nivel={oc.nivel} />
          <span className="inline-flex min-w-0 items-center gap-1">
            <IconeVolante tamanho={14} className={condutor ? 'text-slate-700' : 'text-slate-400'} />
            <span className="sr-only">Condutor: </span>
            {condutor ? (
              <BotaoFoco foco={{ tipo: 'pessoa', id: condutor.id }}>{condutor.nomeCurto}</BotaoFoco>
            ) : (
              <Vazio>{ROTULO_SEM_CONDUTOR}</Vazio>
            )}
          </span>
          <span className="inline-flex min-w-0 items-center gap-1">
            <span className="text-xs text-slate-600">Dorme:</span>
            {sugerida && (
              <span aria-hidden="true" className="text-slate-600">
                ≈
              </span>
            )}
            {dorme.casaId ? (
              <BotaoFoco foco={{ tipo: 'casa', id: dorme.casaId }}>{dorme.rotulo}</BotaoFoco>
            ) : dorme.desconhecida ? (
              <Vazio>{dorme.rotulo}</Vazio>
            ) : (
              dorme.rotulo
            )}
            {sugerida && <span className="sr-only"> (sugerido)</span>}
          </span>
        </p>
      }
      acoes={modoEdicao ? <AcoesDormida carrinha={carrinha} /> : null}
    >
      <dl>
        <Linha rotulo="Modelo">{marcaModelo ?? <Vazio>desconhecido</Vazio>}</Linha>
        <Linha rotulo="Ocupação">
          <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lugares} nivel={oc.nivel} />
        </Linha>
        <Linha rotulo="Condutor">
          <span className="flex flex-wrap items-center gap-1.5">
            <IconeVolante tamanho={14} className={condutor ? 'text-slate-700' : 'text-slate-400'} />
            {condutor ? (
              <BotaoFoco foco={{ tipo: 'pessoa', id: condutor.id }}>{condutor.nomeCurto}</BotaoFoco>
            ) : (
              <Vazio>{ROTULO_SEM_CONDUTOR}</Vazio>
            )}
            <CondutorGravado carrinhaId={carrinha.id} />
          </span>
        </Linha>
        <Linha rotulo="Onde dorme">
          {sugerida && (
            <span aria-hidden="true" className="text-slate-600">
              ≈{' '}
            </span>
          )}
          {dorme.casaId ? (
            <BotaoFoco foco={{ tipo: 'casa', id: dorme.casaId }}>{dorme.rotulo}</BotaoFoco>
          ) : dorme.desconhecida ? (
            <Vazio>{dorme.rotulo}</Vazio>
          ) : (
            dorme.rotulo
          )}
          {dorme.nota && (
            <span className={`block text-xs ${sugerida ? 'text-slate-700 italic' : 'text-slate-700'}`}>
              {dorme.nota}
            </span>
          )}
          <DormidaGravada carrinhaId={carrinha.id} />
          <AcoesDormida carrinha={carrinha} />
        </Linha>
      </dl>
      {carrinha.nota && <p className="mt-1 text-xs text-slate-700 italic">{carrinha.nota}</p>}
      <MovimentosPendentes campo="carrinhaId" id={carrinha.id} />

      <Secao titulo={`Passageiros (${passageiros.length})`}>
        {modoEdicao ? (
          <PassageirosEmEdicao carrinha={carrinha} passageiros={passageiros} />
        ) : (
          <GrelhaNomes pessoas={passageiros} vazio="Sem passageiros." />
        )}
      </Secao>

      {passageiros.length > 0 && (
        <Secao titulo="De onde vêm">
          <ul className="space-y-0.5">
            {casas.map(({ casa, n }) => (
              <li key={casa.id} className="flex items-baseline gap-2">
                <BotaoFoco foco={{ tipo: 'casa', id: casa.id }}>{casa.nome}</BotaoFoco>
                <span className="text-xs text-slate-700">{comPlural(n, 'passageiro', 'passageiros')}</span>
              </li>
            ))}
            {semCasa > 0 && (
              <li className="flex items-baseline gap-2">
                <Vazio>{ROTULO_FORA_DAS_CASAS}</Vazio>
                <span className="text-xs text-slate-700">
                  {comPlural(semCasa, 'passageiro', 'passageiros')}
                </span>
              </li>
            )}
          </ul>
        </Secao>
      )}
    </Moldura>
  );
}

export function PainelFoco({ lugar = 'mapa' }: { lugar?: LugarFicha }) {
  const telemovel = useTelemovel();
  const recolher = useRecolher(lugar === 'vista' && telemovel);
  return (
    <ContextoLugar.Provider value={lugar}>
      <ContextoRecolher.Provider value={recolher}>
        <Ficha />
      </ContextoRecolher.Provider>
    </ContextoLugar.Provider>
  );
}

/**
 * Recolhida ou inteira (só a ficha da vista no telemóvel; null nos outros casos). Abre sempre recolhida;
 * quando o foco muda a partir da vista (um toque num nome, num bloco, numa linha, a pesquisa) volta a
 * recolher; quando muda por um clique dentro da própria ficha (ligações, nomes dos moradores) fica como
 * estava. O clique dentro marca-se ao descer e esquece-se logo a seguir (setTimeout): o React desenha a
 * mudança de foco antes disso.
 */
function useRecolher(ativo: boolean): Recolher | null {
  const [inteira, setInteira] = useState(false);
  const dentro = useRef(false);
  const chaveFoco = useLoja((s) => (s.foco ? `${s.foco.tipo}:${s.foco.id}` : null));
  // biome-ignore lint/correctness/useExhaustiveDependencies: só interessa quando o foco muda.
  useLayoutEffect(() => {
    if (!dentro.current) setInteira(false);
  }, [chaveFoco]);
  return useMemo(
    () =>
      ativo
        ? {
            inteira,
            alternar: () => setInteira((v) => !v),
            marcarDentro: () => {
              dentro.current = true;
              setTimeout(() => {
                dentro.current = false;
              }, 0);
            },
          }
        : null,
    [ativo, inteira],
  );
}

function Ficha() {
  const foco = useLoja((s) => s.foco);
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const definirFoco = useLoja((s) => s.definirFoco);
  const temFoco = foco !== null;

  // Esc fecha a ficha, a não ser que outro elemento já o tenha tratado (pesquisa, popovers).
  useEffect(() => {
    if (!temFoco) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) definirFoco(null);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [temFoco, definirFoco]);

  if (!foco || !indices || !dormidas) return null;

  if (foco.tipo === 'pessoa') {
    const pessoa = indices.pessoas.get(foco.id);
    return pessoa ? <FichaPessoa key={pessoa.id} pessoa={pessoa} indices={indices} /> : null;
  }
  if (foco.tipo === 'casa') {
    const casa = indices.casas.get(foco.id);
    return casa ? <FichaCasa key={casa.id} casa={casa} indices={indices} dormidas={dormidas} /> : null;
  }
  const carrinha = indices.carrinhas.get(foco.id);
  return carrinha ? (
    <FichaCarrinha key={carrinha.id} carrinha={carrinha} indices={indices} dormidas={dormidas} />
  ) : null;
}
