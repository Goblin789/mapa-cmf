// Ficha rápida do que está em foco (pessoa, casa, carrinha ou obra), sobre o canto superior esquerdo do mapa
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
// No PC (a partir de 640 px) a ficha arrasta-se pelo cabeçalho (ou pela pega, com as setas; Alt+setas em
// qualquer sítio do cabeçalho) para qualquer sítio da área onde está posta, sem sair dela; cada lugar
// lembra-se da posição (janelaArrastavel.ts, useJanelaArrastavel.ts). "Voltar ao sítio" ou um duplo
// clique no cabeçalho põem-na outra vez na origem. O título e o subtítulo não arrastam (selecionam-se e
// copiam-se). No mapa, arrastada, continua a acabar por cima da legenda. No telemóvel fica como estava.
// Cada vista (Mapa, Tabela, Quadro) lembra a sua posição: na Tabela a ficha arrastada para a esquerda tapa
// a coluna dos nomes, no Quadro não.
// Na Tabela a ficha da PESSOA é compacta (fichas.ts, fichaPessoaCompacta): a linha já tem o Nº, o cliente,
// a casa → carrinha → obra e, no modo de edição, as listas e o condutor; a ficha só mostra o que a linha
// não tem ("Ver no mapa", o nome do mapa, avisos, telefone e carta quando existem) e nunca recolhe. As
// fichas de casa e carrinha são as completas. A vista sai da loja da vista (ou da prop `vista`).
// M2 (docs/m2.md): a moldura e as peças do corpo estão em MolduraFicha.tsx; a ficha da obra (FichaObra.tsx),
// a secção Indisponível da pessoa (SeccaoIndisponivel.tsx) e a dos problemas da casa/carrinha
// (SeccaoProblemas.tsx) são ficheiros próprios, montados aqui. A lotação da carrinha não conta quem está
// indisponível hoje (ocupacaoDaCarrinha).

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { clienteEfetivoId } from '../../dominio/cores';
import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { nomeComMaiusculasNormais } from '../../dominio/nomes';
import { ocupacaoCasa, ocupacaoDaCarrinha } from '../../dominio/ocupacao';
import type { Carrinha, Casa, Id, Pessoa } from '../../dominio/tipos';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_AVISO_CONTRATO } from '../comum/lotacao';
import { formatarMatricula } from '../comum/Matricula';
import {
  AcoesDormida,
  AcoesPessoa,
  CondutorGravado,
  DormidaGravada,
  MovimentosPendentes,
  PassageirosEmEdicao,
  usePessoaAlterada,
  useSitioAlterado,
  ValorGravado,
} from '../edicao/PecasFoco';
import { useLoja } from '../estado/loja';
import { useVista } from '../vistas/vista';
import { carrinhaConduzida, condutorDaCarrinha, ROTULO_SEM_CONDUTOR } from './condutor';
import { FichaObra } from './FichaObra';
import {
  cadeiaDaPessoa,
  carrinhasDasPessoas,
  carrinhasQueDormemEm,
  casasDasPessoas,
  extrasDaPessoa,
  fichaCompactaTemCorpo,
  fichaPessoaCompacta,
  type VistaFicha,
} from './fichas';
import {
  BotaoFoco,
  ContextoLugar,
  ContextoPosicao,
  ContextoRecolher,
  ContextoVistaFicha,
  Linha,
  type LugarFicha,
  Moldura,
  type Recolher,
  Secao,
  useTelemovel,
  Vazio,
} from './MolduraFicha';
import { GrelhaNomes, MarcaAConfirmar, MarcaCliente, PastilhaLotacao } from './pecas';
import { SeccaoIndisponivel } from './SeccaoIndisponivel';
import { SeccaoProblemas } from './SeccaoProblemas';
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
import { usePosicaoJanela } from './useJanelaArrastavel';

export type { LugarFicha } from './MolduraFicha';

const ROTULO_ELEMENTO = { casa: 'Casa', carrinha: 'Carrinha', obra: 'Obra' } as const;
const CAMPO_ELEMENTO = { casa: 'casaId', carrinha: 'carrinhaId', obra: 'obraId' } as const;

function FichaPessoa({ pessoa, indices }: { pessoa: Pessoa; indices: Indices }) {
  const cliente = indices.clientes.get(clienteEfetivoId(pessoa, indices.obras)) ?? null;
  // Como na Tabela: maiúsculas normais (só para mostrar).
  const nome = nomeComMaiusculasNormais(nomeCompleto(pessoa));
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
      {/* M2: indisponível (hoje e os próximos períodos; no modo de edição, marcar e terminar). */}
      <SeccaoIndisponivel pessoa={pessoa} />
      <AcoesPessoa pessoa={pessoa} />
    </Moldura>
  );
}

/**
 * A ficha da pessoa na Tabela: só o que a linha não mostra. Sem Nº, cliente nem casa → carrinha → obra
 * (estão nas colunas) e sem os botões "Mudar…" e de condutor (no modo de edição são as listas e o botão
 * das células). Fica: o tipo, o nome, "no mapa: …" (se for outro), "Ver no mapa" e ✕ no cabeçalho; o aviso
 * de quem conduz sem carta; o telefone e a carta, se existirem. Sem nenhum deles, só o cabeçalho.
 * (M2: o indisponível está na coluna da Tabela, não aqui.)
 */
function FichaPessoaCompacta({ pessoa, indices }: { pessoa: Pessoa; indices: Indices }) {
  const alterada = usePessoaAlterada(pessoa.id);
  const extras = extrasDaPessoa(pessoa, hojeISO());
  // (Quem não tem carta tem sempre a linha Carta: "Não tem".)
  const semCarta = pessoa.temCarta === false && carrinhaConduzida(pessoa, indices) !== null;
  return (
    <Moldura
      tipo="Pessoa"
      titulo={nomeComMaiusculasNormais(nomeCompleto(pessoa))}
      subtitulo={extras.nomeNoMapa ? `no mapa: ${extras.nomeNoMapa}` : undefined}
      alterado={alterada}
      compacta
    >
      {/* Sem nada para mostrar, a ficha fica só com o cabeçalho (a Moldura não põe o corpo). */}
      {fichaCompactaTemCorpo(extras, semCarta) ? (
        <>
          {semCarta && (
            <p className="mb-1 rounded border border-red-500 bg-red-100 px-2 py-1 text-xs font-medium text-red-900">
              <span aria-hidden="true">▲ </span>
              Conduz, mas não tem carta.
            </p>
          )}
          {(extras.telefone || extras.carta) && (
            <dl>
              {extras.telefone && <Linha rotulo="Telefone">{extras.telefone}</Linha>}
              {extras.carta && <Linha rotulo="Carta">{extras.carta}</Linha>}
            </dl>
          )}
        </>
      ) : null}
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
      {/* M2: problemas pendurados na casa (abertos e "Resolver"; no modo de edição, novo problema). */}
      <SeccaoProblemas alvo={{ tipo: 'casa', id: casa.id }} />

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
  // M2: quem está indisponível hoje continua na lista, mas o lugar dele fica livre.
  const oc = ocupacaoDaCarrinha(indices, carrinha);
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
      {/* M2: problemas pendurados na carrinha (abertos e "Resolver"; no modo de edição, novo problema). */}
      <SeccaoProblemas alvo={{ tipo: 'carrinha', id: carrinha.id }} />

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

/**
 * @param lugar 'mapa' (sobre o mapa, no App) ou 'vista' (a Tabela e o Quadro montam-na por cima da sua área).
 * @param vista na vista, qual delas é ('tabela' = ficha da pessoa compacta). Por omissão, a vista ativa
 *   (vistas/vista.ts): cada vista só está montada enquanto é a ativa.
 */
export function PainelFoco({
  lugar = 'mapa',
  vista,
}: {
  lugar?: LugarFicha;
  vista?: Exclude<VistaFicha, 'mapa'>;
}) {
  const vistaAtiva = useVista((s) => s.vista);
  const vistaFicha: VistaFicha =
    lugar === 'mapa' ? 'mapa' : (vista ?? (vistaAtiva === 'tabela' ? 'tabela' : 'quadro'));
  const telemovel = useTelemovel();
  const recolher = useRecolher(lugar === 'vista' && telemovel);
  // No telemóvel a ficha fica onde sempre esteve (em baixo na vista, no canto do mapa) e não se arrasta.
  // Cada vista lembra a sua posição (na Tabela e no Quadro as disposições são opostas).
  const posicao = usePosicaoJanela(vistaFicha, !telemovel);
  return (
    <ContextoLugar.Provider value={lugar}>
      <ContextoVistaFicha.Provider value={vistaFicha}>
        <ContextoRecolher.Provider value={recolher}>
          <ContextoPosicao.Provider value={posicao}>
            <Ficha />
          </ContextoPosicao.Provider>
        </ContextoRecolher.Provider>
      </ContextoVistaFicha.Provider>
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
  const compacta = fichaPessoaCompacta(useContext(ContextoVistaFicha));
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
    if (!pessoa) return null;
    return compacta ? (
      <FichaPessoaCompacta key={pessoa.id} pessoa={pessoa} indices={indices} />
    ) : (
      <FichaPessoa key={pessoa.id} pessoa={pessoa} indices={indices} />
    );
  }
  if (foco.tipo === 'casa') {
    const casa = indices.casas.get(foco.id);
    return casa ? <FichaCasa key={casa.id} casa={casa} indices={indices} dormidas={dormidas} /> : null;
  }
  if (foco.tipo === 'obra') {
    // M2: "quem vem para esta obra e de onde" (FichaObra.tsx, módulo Obras).
    const obra = indices.obras.get(foco.id);
    return obra ? <FichaObra key={obra.id} obra={obra} indices={indices} /> : null;
  }
  const carrinha = indices.carrinhas.get(foco.id);
  return carrinha ? (
    <FichaCarrinha key={carrinha.id} carrinha={carrinha} indices={indices} dormidas={dormidas} />
  ) : null;
}
