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
// Na Tabela não há ficha da PESSOA (fichas.ts, haFichaDaPessoa): a linha já mostra tudo e tem o seu botão
// "Ver no mapa"; uma pessoa em foco na Tabela só realça a linha. As fichas de casa e carrinha abrem em
// todas as vistas. A vista sai da loja da vista (ou da prop `vista`).
// O aviso do contrato de uma casa só aparece aqui, na ficha da casa (fora dela, só no diálogo Guardar).
// M2 (docs/m2.md): a moldura e as peças do corpo estão em MolduraFicha.tsx; a ficha da obra (FichaObra.tsx),
// a secção Indisponível da pessoa (SeccaoIndisponivel.tsx) e a dos problemas da casa/carrinha
// (SeccaoProblemas.tsx) são ficheiros próprios, montados aqui. A lotação da carrinha não conta quem está
// indisponível hoje (ocupacaoDaCarrinha); com o condutor indisponível hoje, a ficha da carrinha avisa.
// M2, fichas editáveis: no modo de edição cada campo de CAMPOS_EDITAVEIS da pessoa, da casa e da carrinha
// muda-se no sítio (CamposFicha.tsx: lápis → campo → Enter/✓ = um passo; Esc cancela; "antes: …" por baixo
// do que mudou). A morada da casa edita o LOCAL (aviso quando é partilhado). Fora do modo de edição as
// fichas só se leem, com os campos que têm valor. A validade da carta compara com loja.hoje (o dia no
// Luxemburgo). Quem saiu da empresa não está no mapa nem nas listas: só na Tabela, com "Mostrar quem saiu",
// onde o botão da linha é "Voltou à empresa…" (vistas/Tabela.tsx).

import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { LIMITES } from '../../dominio/campos';
import { clienteEfetivoId } from '../../dominio/cores';
import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { nomeComMaiusculasNormais } from '../../dominio/nomes';
import {
  lugaresTemporarios,
  ocupacaoCasa,
  ocupacaoDaCarrinha,
  textoLugaresTemporarios,
} from '../../dominio/ocupacao';
import {
  type Carrinha,
  type Casa,
  type Estado,
  type Id,
  type Pessoa,
  TIPOS_VEICULO,
} from '../../dominio/tipos';
import { IconeVolante } from '../comum/IconeVolante';
import { ESTILO_AVISO_CONTRATO } from '../comum/lotacao';
import { formatarMatricula } from '../comum/Matricula';
import {
  AcoesDormida,
  AcoesPessoa,
  CondutorGravado,
  ConfirmarMarca,
  DormidaGravada,
  MarcaSaiu,
  MovimentosPendentes,
  PassageirosEmEdicao,
  usePessoaAlterada,
  useSitioAlterado,
  ValorGravado,
} from '../edicao/PecasFoco';
import { useLoja } from '../estado/loja';
import { useVista } from '../vistas/vista';
import { CampoCarta, CampoFicha, CampoMoradaCasa } from './CamposFicha';
import { carrinhaConduzida, condutorDaCarrinha, ROTULO_SEM_CONDUTOR } from './condutor';
import { FichaObra } from './FichaObra';
import {
  avisoNomeNoMapa,
  cadeiaDaPessoa,
  carrinhasDasPessoas,
  carrinhasQueDormemEm,
  casasDasPessoas,
  haFichaDaPessoa,
  outrasCasasNoLocal,
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
  nomeCompleto,
  notaCorDaObra,
  ROTULO_FORA_DAS_CASAS,
  ROTULO_SEM_TRANSPORTE,
  ROTULO_TIPO_VEICULO,
  SEM_DADOS,
  textoApartamento,
  textoCondutorIndisponivel,
  textoContrato,
  textoDormida,
  textoMarcaModelo,
  textoTelefone,
} from './textos';
import { usePosicaoJanela } from './useJanelaArrastavel';

export type { LugarFicha } from './MolduraFicha';

const ROTULO_ELEMENTO = { casa: 'Casa', carrinha: 'Carrinha', obra: 'Obra' } as const;
const CAMPO_ELEMENTO = { casa: 'casaId', carrinha: 'carrinhaId', obra: 'obraId' } as const;

/** Os clientes como opções de uma lista (pela ordem dos clientes). */
function opcoesClientes(estado: Estado) {
  return [...estado.clientes].sort((a, b) => a.ordem - b.ordem).map((c) => ({ valor: c.id, rotulo: c.nome }));
}

const TEXTO_CURTO = { tipo: 'texto', opcional: false, max: LIMITES.textoCurto } as const;
const TEXTO_CURTO_OPCIONAL = { tipo: 'texto', opcional: true, max: LIMITES.textoCurto } as const;
const TEXTO_LONGO = { tipo: 'texto', opcional: true, max: LIMITES.textoLongo } as const;

/**
 * No modo de edição, os campos de quem a pessoa é: nº, nome, apelidos, nome no mapa (com o aviso de repetido
 * enquanto se escreve) e cliente (com a nota da cor da obra, quando tem obra).
 */
function CamposDaPessoa({ pessoa, indices }: { pessoa: Pessoa; indices: Indices }) {
  const estado = useLoja((s) => s.estado);
  if (!estado) return null;
  const proprio = indices.clientes.get(pessoa.clienteId) ?? null;
  const obra = pessoa.obraId ? indices.obras.get(pessoa.obraId) : undefined;
  const clienteDaObra = obra ? (indices.clientes.get(obra.clienteId)?.nome ?? null) : null;
  return (
    <>
      <CampoFicha
        entidade="pessoa"
        id={pessoa.id}
        campo="numero"
        rotulo="Nº"
        valor={pessoa.numero}
        editor={{ tipo: 'texto', opcional: true, max: LIMITES.numero }}
      />
      <CampoFicha entidade="pessoa" id={pessoa.id} campo="nome" valor={pessoa.nome} editor={TEXTO_CURTO} />
      <CampoFicha
        entidade="pessoa"
        id={pessoa.id}
        campo="apelidos"
        valor={pessoa.apelidos}
        editor={TEXTO_CURTO}
      />
      <CampoFicha
        entidade="pessoa"
        id={pessoa.id}
        campo="nomeCurto"
        valor={pessoa.nomeCurto}
        editor={TEXTO_CURTO}
        aoEscrever={(texto) => avisoNomeNoMapa(estado.pessoas, texto, pessoa.id)}
      />
      <CampoFicha
        entidade="pessoa"
        id={pessoa.id}
        campo="clienteId"
        valor={pessoa.clienteId}
        editor={{ tipo: 'escolha', opcoes: opcoesClientes(estado) }}
        mostrar={
          <span className="inline-flex items-center gap-1.5">
            <MarcaCliente cliente={proprio} />
            {proprio?.nome ?? <Vazio>desconhecido</Vazio>}
          </span>
        }
        nota={obra ? notaCorDaObra(clienteDaObra, obra.nome) : undefined}
      />
    </>
  );
}

/** O telefone e a carta (no modo de edição mudam-se aqui; fora dele, só se leem). */
function ContactosDaPessoa({
  pessoa,
  foraDaEdicao,
}: {
  pessoa: Pessoa;
  foraDaEdicao: 'sempre' | 'com-valor';
}) {
  const temCarta = pessoa.temCarta !== null;
  const modoEdicao = useLoja((s) => s.modoEdicao);
  return (
    <>
      <CampoFicha
        entidade="pessoa"
        id={pessoa.id}
        campo="telefone"
        valor={pessoa.telefone}
        editor={{ tipo: 'texto', opcional: true, max: LIMITES.telefone }}
        tipoTeclado="tel"
        foraDaEdicao={foraDaEdicao}
        mostrar={pessoa.telefone?.trim() ? textoTelefone(pessoa) : <Vazio>{SEM_DADOS}</Vazio>}
      />
      {(modoEdicao || foraDaEdicao === 'sempre' || temCarta) && <CampoCarta pessoa={pessoa} />}
    </>
  );
}

function FichaPessoa({ pessoa, indices }: { pessoa: Pessoa; indices: Indices }) {
  const cliente = indices.clientes.get(clienteEfetivoId(pessoa, indices.obras)) ?? null;
  // Como na Tabela: maiúsculas normais (só para mostrar).
  const nome = nomeComMaiusculasNormais(nomeCompleto(pessoa));
  const alterada = usePessoaAlterada(pessoa.id);
  const conduz = carrinhaConduzida(pessoa, indices);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const texto = [
    pessoa.numero ? `Nº ${pessoa.numero}` : 'Sem Nº',
    pessoa.nomeCurto !== nome ? `no mapa: ${pessoa.nomeCurto}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const subtitulo = pessoa.ativa ? (
    texto
  ) : (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {texto}
      <MarcaSaiu />
    </span>
  );

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
        {modoEdicao ? (
          <CamposDaPessoa pessoa={pessoa} indices={indices} />
        ) : (
          <Linha rotulo="Cliente">
            <span className="inline-flex items-center gap-1.5">
              <MarcaCliente cliente={cliente} />
              {cliente?.nome ?? <Vazio>desconhecido</Vazio>}
            </span>
          </Linha>
        )}
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
                {el.aConfirmar && el.tipo !== 'obra' && <ConfirmarMarca pessoa={pessoa} qual={el.tipo} />}
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
        <ContactosDaPessoa pessoa={pessoa} foraDaEdicao="sempre" />
      </dl>
      {/* M2: indisponível (hoje e os próximos períodos; no modo de edição, marcar e terminar). */}
      <SeccaoIndisponivel pessoa={pessoa} />
      <AcoesPessoa pessoa={pessoa} />
    </Moldura>
  );
}

/**
 * No modo de edição, os campos da casa: nome, morada (o LOCAL, com o aviso de morada partilhada e "Mudar
 * para outra morada…"), apartamento, lotação, máx. do contrato, tolerado, nota do contrato, senhorio (só o
 * contacto da casa) e equipamento. Os "lugares iguais aos moradores" (sempreCheia) não se mostram nem se mudam
 * aqui (pedido do Rafael, 05/10/2026: não quer ver isso em lado nenhum); ficam nos dados e no sincronizar.
 */
function CamposDaCasa({ casa, indices }: { casa: Casa; indices: Indices }) {
  const local = indices.locais.get(casa.localId);
  const moradores = indices.moradores.get(casa.id) ?? [];
  const oc = ocupacaoCasa(casa, moradores.length);
  const inteiro = (nulo: boolean) => ({ tipo: 'inteiro', nulo, min: 0, max: LIMITES.lotacaoMaxima }) as const;
  return (
    <dl>
      <CampoFicha entidade="casa" id={casa.id} campo="nome" valor={casa.nome} editor={TEXTO_CURTO} />
      {local && <CampoMoradaCasa casa={casa} local={local} outras={outrasCasasNoLocal(casa, indices)} />}
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="apartamento"
        valor={casa.apartamento}
        editor={TEXTO_CURTO_OPCIONAL}
      />
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="lotacao"
        valor={casa.lotacao}
        editor={inteiro(false)}
        mostrar={
          <span className="inline-flex flex-wrap items-center gap-1.5">
            {casa.lotacao}
            <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lotacao} nivel={oc.nivel} />
          </span>
        }
      />
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="maxContrato"
        valor={casa.maxContrato}
        editor={inteiro(true)}
        mostrar={casa.maxContrato === null ? <Vazio>não fixado</Vazio> : undefined}
      />
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="tolerado"
        valor={casa.tolerado}
        editor={inteiro(true)}
      />
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="notaContrato"
        valor={casa.notaContrato}
        editor={TEXTO_LONGO}
      />
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="senhorio"
        valor={casa.senhorio}
        editor={TEXTO_LONGO}
        nota="Só o contacto da casa."
      />
      <CampoFicha
        entidade="casa"
        id={casa.id}
        campo="equipamento"
        valor={casa.equipamento}
        editor={TEXTO_LONGO}
      />
    </dl>
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
  const modoEdicao = useLoja((s) => s.modoEdicao);

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
      {modoEdicao ? (
        <CamposDaCasa casa={casa} indices={indices} />
      ) : (
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
      )}
      {aviso && (
        <p className={`mt-1 rounded border px-2 py-1 text-xs font-medium ${aviso.classe}`}>
          <span aria-hidden="true">▲ </span>
          {aviso.rotulo}: {comPlural(oc.usados, 'lugar usado', 'lugares usados')} para {textoContrato(casa)}.
        </p>
      )}
      {!modoEdicao && casa.notaContrato && (
        <p className="mt-1 text-xs text-slate-700 italic">{casa.notaContrato}</p>
      )}
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

/**
 * No modo de edição, os campos da carrinha: matrícula (única; mostrada formatada), outras matrículas
 * (separadas por vírgulas), tipo, marca, modelo, lugares (1 a LIMITES.lugaresMaximos) e nota. Nada de
 * CT/revisão/correia nem estados (M3).
 */
function CamposDaCarrinha({ carrinha }: { carrinha: Carrinha }) {
  return (
    <>
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="matricula"
        valor={carrinha.matricula}
        editor={{ tipo: 'matricula' }}
      />
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="matriculasAlternativas"
        valor={carrinha.matriculasAlternativas}
        editor={{ tipo: 'matriculas' }}
      />
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="tipo"
        valor={carrinha.tipo}
        editor={{
          tipo: 'escolha',
          opcoes: TIPOS_VEICULO.map((t) => ({ valor: t, rotulo: ROTULO_TIPO_VEICULO[t] })),
        }}
        mostrar={ROTULO_TIPO_VEICULO[carrinha.tipo]}
      />
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="marca"
        valor={carrinha.marca}
        editor={TEXTO_CURTO_OPCIONAL}
      />
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="modelo"
        valor={carrinha.modelo}
        editor={TEXTO_CURTO_OPCIONAL}
      />
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="lugares"
        valor={carrinha.lugares}
        editor={{ tipo: 'inteiro', nulo: false, min: 1, max: LIMITES.lugaresMaximos }}
        nota="Com o do condutor."
      />
      <CampoFicha
        entidade="carrinha"
        id={carrinha.id}
        campo="nota"
        valor={carrinha.nota}
        editor={TEXTO_LONGO}
      />
    </>
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
  // M2: o lugar de quem está indisponível só está livre até voltar ("1 livre até 12/10").
  const livresAte = textoLugaresTemporarios(lugaresTemporarios(indices, carrinha.id));
  const dormida = dormidas.get(carrinha.id);
  const dorme = textoDormida(dormida, indices);
  const sugerida = dormida?.confianca === 'sugerida';
  const marcaModelo = textoMarcaModelo(carrinha);
  const tipo = ROTULO_TIPO_VEICULO[carrinha.tipo];
  const { casas, semCasa } = casasDasPessoas(passageiros, indices);
  const alternativas = carrinha.matriculasAlternativas.length
    ? `também ${carrinha.matriculasAlternativas.map(formatarMatricula).join(', ')}`
    : null;
  const alterada = useSitioAlterado('carrinhaId', carrinha.id);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const condutor = condutorDaCarrinha(carrinha, indices);
  // M2: o condutor indisponível hoje não muda de carrinha nem deixa de ser o condutor; só se avisa.
  const condutorIndisponivel = condutor ? indices.indisponiveis.get(condutor.id) : undefined;

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
        {modoEdicao ? (
          <CamposDaCarrinha carrinha={carrinha} />
        ) : (
          <Linha rotulo="Modelo">{marcaModelo ?? <Vazio>desconhecido</Vazio>}</Linha>
        )}
        <Linha rotulo="Ocupação">
          <PastilhaLotacao ocupados={oc.ocupados} lugares={oc.lugares} nivel={oc.nivel} />
          {livresAte && <span className="ml-1.5 text-xs font-medium text-amber-800">{livresAte}</span>}
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
          {condutorIndisponivel && (
            <span className="mt-0.5 block rounded border border-amber-500 bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-950">
              <span aria-hidden="true">▲ </span>
              {textoCondutorIndisponivel(condutorIndisponivel)}
            </span>
          )}
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
      {!modoEdicao && carrinha.nota && <p className="mt-1 text-xs text-slate-700 italic">{carrinha.nota}</p>}
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
 * @param vista na vista, qual delas é ('tabela' = sem ficha da pessoa). Por omissão, a vista ativa
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
  const comFichaDaPessoa = haFichaDaPessoa(useContext(ContextoVistaFicha));
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
    // Na Tabela, nada: a linha da pessoa fica realçada (e tem o seu "Ver no mapa").
    if (!pessoa || !comFichaDaPessoa) return null;
    return <FichaPessoa key={pessoa.id} pessoa={pessoa} indices={indices} />;
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
