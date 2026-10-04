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
// invólucro `relative`): no PC em cima à direita, 22 rem; no telemóvel em baixo, a toda a largura, até 60 %
// da altura e a deslizar por dentro. Na vista a ficha tem o botão "Ver no mapa" (o único que muda de vista).

import { createContext, type MouseEvent, type ReactNode, useContext, useEffect, useId } from 'react';
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
 * Posição, tamanho e sombra da ficha em cada lugar (a do mapa é a de sempre). Na vista, no telemóvel, é
 * uma folha em baixo (a sombra para cima separa-a do que está por trás); a partir de 640 px, um cartão em
 * cima à direita. O conteúdo desliza por dentro (Moldura): a ficha nunca faz a página deslizar.
 * No telemóvel a folha vai até 60 % da área da vista, mas pode sempre chegar a 16 rem (se a área der):
 * num ecrã baixo, a editar, a área da vista fica com uns 320 px (cabeçalho e barra de edição) e 60 %
 * deixava o corpo da ficha com 40 px, sem se verem os botões de mudar.
 */
const CLASSES_LUGAR: Record<LugarFicha, string> = {
  mapa: 'top-3 left-3 w-[min(22rem,calc(100%-4.5rem))] rounded-lg shadow-lg',
  vista:
    'inset-x-2 bottom-2 max-h-[max(60%,min(16rem,calc(100%-1rem)))] rounded-xl shadow-[0_-4px_24px_rgb(15_23_42/0.22)] sm:inset-x-auto sm:top-2 sm:right-3 sm:bottom-auto sm:max-h-[calc(100%-1rem)] sm:w-[min(22rem,calc(100%-1.5rem))] sm:rounded-lg sm:shadow-lg',
};

const ROTULO_ELEMENTO = { casa: 'Casa', carrinha: 'Carrinha', obra: 'Obra' } as const;
const CAMPO_ELEMENTO = { casa: 'casaId', carrinha: 'carrinhaId', obra: 'obraId' } as const;

function Moldura({
  tipo,
  titulo,
  subtitulo,
  alterado = false,
  children,
}: {
  tipo: string;
  titulo: string;
  subtitulo?: ReactNode;
  /** Tem alterações por guardar (modo de edição). */
  alterado?: boolean;
  children: ReactNode;
}) {
  const definirFoco = useLoja((s) => s.definirFoco);
  const idTitulo = useId();
  const alturaLegenda = useAlturaLegenda();
  const lugar = useContext(ContextoLugar);
  return (
    <section
      aria-labelledby={idTitulo}
      // Na vista, quem desliza até um elemento (vistas/mostrar.ts) deixa-o fora da ficha.
      {...{ [ATRIBUTO_FICHA]: lugar }}
      // No mapa, a ficha acaba por cima da legenda (canto inferior esquerdo) em vez de a tapar.
      style={lugar === 'mapa' ? { maxHeight: alturaMaximaPainelFoco(alturaLegenda) } : undefined}
      onClickCapture={lugar === 'vista' ? seguirNomeClicado : undefined}
      className={`absolute ${CLASSES_LUGAR[lugar]} ${Z_SOBRE_MAPA} flex flex-col overflow-hidden border bg-white text-sm ${
        alterado ? 'border-amber-400' : 'border-slate-300'
      }`}
    >
      <header className="flex items-start gap-2 border-b border-slate-200 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="text-[11px] font-semibold tracking-wide text-slate-600 uppercase">{tipo}</span>
            {alterado && <MarcaAlterado />}
          </p>
          <h2 id={idTitulo} className="text-base leading-tight font-bold break-words text-slate-900">
            {titulo}
          </h2>
          {subtitulo && <p className="mt-0.5 text-xs text-slate-700">{subtitulo}</p>}
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
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">{children}</div>
    </section>
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
  const subtitulo = [
    pessoa.numero ? `Nº ${pessoa.numero}` : 'Sem Nº',
    pessoa.nomeCurto !== nome ? `no mapa: ${pessoa.nomeCurto}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Moldura tipo="Pessoa" titulo={nome} subtitulo={subtitulo} alterado={alterada}>
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
          {cadeiaDaPessoa(pessoa, indices).map((el, i) => (
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
  return (
    <ContextoLugar.Provider value={lugar}>
      <Ficha />
    </ContextoLugar.Provider>
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
