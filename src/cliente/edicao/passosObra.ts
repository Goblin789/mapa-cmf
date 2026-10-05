// Os passos do rascunho das obras (M2, docs/m2.md, "Obras"): criar, editar e apagar uma obra, cada um UM
// passo (Ctrl+Z desfaz tudo de uma vez). Funções puras sobre o estado VISÍVEL (o do servidor com o rascunho),
// como todas as operações; quem chama (edicao/DialogoObra.tsx, paineis/FichaObra.tsx) valida o passo com
// validarOperacoes antes de o juntar ao rascunho.
//
// - Criar: o local da obra (tipo 'obra', RAIO_OMISSAO, o nome da obra) [+ o do estacionamento] e a obra
//   (origem 'manual'). O pino é obrigatório (dentro de REGIAO_MAPA); a morada pode ficar vazia ("").
// - Editar: os 'campo' da obra (nome, cliente, estacionamento) e do local (morada, país, posição), SÓ os que
//   a pessoa mudou face ao que o diálogo tinha ao abrir (uma mudança de outra pessoa que chegue entretanto
//   pelo tempo real não se desfaz). O nome do local criado no programa acompanha o da obra. O estacionamento
//   pode aparecer (local novo), mudar de sítio ou sair (o local criado no programa que mais nada use
//   apaga-se no mesmo passo).
// - O nome da obra não repete o de outra (sem contar acentos nem maiúsculas): na Tabela, no Mover para… e
//   no Histórico não se distinguiam.
// - Apagar: quem lá trabalha passa para "sem obra", a obra apaga-se e, com ela, os locais dela criados no
//   programa (localCriadoNoPrograma) que mais nada use. Os dos dados iniciais nunca se apagam.

import { localCriadoNoPrograma, RAIO_OMISSAO } from '../../dominio/campos';
import { formatarMatricula } from '../../dominio/matricula';
import {
  novoId,
  type Operacao,
  operacaoApagar,
  operacaoCampo,
  operacaoCriar,
  operacoesParaAlvo,
} from '../../dominio/operacoes';
import { normalizarTexto } from '../../dominio/pesquisa';
import type { Cliente, Estado, Id, Local, Obra } from '../../dominio/tipos';
import { limparMorada, temPinoValido, type ValorMorada } from '../comum/morada';
import { clientesPorOrdem } from '../paineis/agrupar';

/** O que o diálogo da obra recolhe. `estacionamento` null = sem estacionamento. */
export interface DadosObra {
  nome: string;
  clienteId: Id | null;
  morada: ValorMorada;
  estacionamento: ValorMorada | null;
}

/** O passo, ou as frases do que falta (o passo não se monta). */
export type ResultadoPasso = { ops: Operacao[]; erros: [] } | { ops: null; erros: string[] };

/** Clientes que podem ter obras: os que não são grupos internos (ex.: Enquadramento), pela ordem. */
export function clientesDeObras(estado: Pick<Estado, 'clientes'>): Cliente[] {
  return clientesPorOrdem(estado.clientes).filter((c) => !c.interno);
}

/** O nome como se grava: aparado e sem espaços repetidos nem quebras de linha. */
export function limparNome(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** Nome do local do estacionamento de uma obra (até 80 caracteres, como os outros nomes). */
export function nomeEstacionamento(nomeObra: string): string {
  return `Estacionamento ${nomeObra}`.slice(0, 80).trim();
}

/** Os dados do diálogo para editar uma obra que já existe. */
export function dadosDaObra(estado: Estado, obra: Obra): DadosObra {
  const local = estado.locais.find((l) => l.id === obra.localId);
  const estacionamento =
    obra.estacionamentoLocalId !== null
      ? estado.locais.find((l) => l.id === obra.estacionamentoLocalId)
      : undefined;
  const morada = (l: Local | undefined): ValorMorada => ({
    morada: l?.morada ?? '',
    pais: l?.pais ?? 'LU',
    lat: l?.lat ?? null,
    lng: l?.lng ?? null,
  });
  return {
    nome: obra.nome,
    clienteId: obra.clienteId,
    morada: morada(local),
    estacionamento: obra.estacionamentoLocalId !== null ? morada(estacionamento) : null,
  };
}

/** Há outra obra (além de `exceto`) com este nome, sem contar acentos, maiúsculas nem espaços a mais. */
export function nomeDeObraRepetido(estado: Pick<Estado, 'obras'>, nome: string, exceto: Id | null): boolean {
  const alvo = normalizarTexto(nome);
  return alvo !== '' && estado.obras.some((o) => o.id !== exceto && normalizarTexto(o.nome) === alvo);
}

/**
 * O que falta para o passo se montar (o resto é o validarOperacoes). O nome repetido só se vê quando o
 * nome é novo (`verNomeRepetido`): mexer noutra coisa de uma obra antiga com o nome igual ao de outra passa.
 */
function errosDosDados(
  estado: Estado,
  dados: DadosObra,
  obraId: Id | null,
  verNomeRepetido: boolean,
): string[] {
  const erros: string[] = [];
  if (limparNome(dados.nome) === '') erros.push('Falta o nome da obra.');
  else if (limparNome(dados.nome).length > 80) erros.push('O nome da obra tem no máximo 80 caracteres.');
  else if (verNomeRepetido && nomeDeObraRepetido(estado, limparNome(dados.nome), obraId))
    erros.push('Já há uma obra com este nome: escolhe outro (ex.: junta a localidade).');
  const cliente = dados.clienteId ? estado.clientes.find((c) => c.id === dados.clienteId) : undefined;
  if (!cliente) erros.push('Falta escolher o cliente.');
  else if (cliente.interno) erros.push(`${cliente.nome} é um grupo interno: escolhe o cliente da obra.`);
  if (!temPinoValido(dados.morada))
    erros.push('Falta o pino da obra: procura a morada ou clica no mini-mapa.');
  if (dados.estacionamento && !temPinoValido(dados.estacionamento)) {
    erros.push('Falta o pino do estacionamento (ou tira o estacionamento).');
  }
  return erros;
}

/** Um local novo (obra ou estacionamento) com o pino escolhido. */
function localNovo(
  tipo: 'obra' | 'estacionamento',
  nome: string,
  v: ValorMorada,
  gerar: (() => string) | undefined,
): Local {
  return {
    id: novoId('local', gerar),
    tipo,
    nome,
    morada: limparMorada(v.morada),
    pais: v.pais,
    lat: v.lat,
    lng: v.lng,
    raioM: RAIO_OMISSAO,
  };
}

/**
 * Criar uma obra: um passo com o local da obra, o do estacionamento (se houver) e a obra. Devolve também o
 * id da obra nova (para a pôr em foco no fim). `gerar` só nos testes (ids previsíveis).
 */
export function passoCriarObra(
  estado: Estado,
  dados: DadosObra,
  gerar?: () => string,
): ResultadoPasso & { obraId: Id | null } {
  const erros = errosDosDados(estado, dados, null, true);
  if (erros.length > 0) return { ops: null, erros, obraId: null };
  const nome = limparNome(dados.nome);
  const local = localNovo('obra', nome, dados.morada, gerar);
  const estacionamento = dados.estacionamento
    ? localNovo('estacionamento', nomeEstacionamento(nome), dados.estacionamento, gerar)
    : null;
  const obra: Obra = {
    id: novoId('obra', gerar),
    nome,
    clienteId: dados.clienteId as Id,
    localId: local.id,
    estacionamentoLocalId: estacionamento?.id ?? null,
    origem: 'manual',
  };
  const ops: Operacao[] = [operacaoCriar('local', local)];
  if (estacionamento) ops.push(operacaoCriar('local', estacionamento));
  ops.push(operacaoCriar('obra', obra));
  return { ops, erros: [], obraId: obra.id };
}

/**
 * Os 'campo' do local para ficar com esta morada e este pino: só os que a pessoa mudou face a `inicial` (o
 * que o diálogo tinha ao abrir; null = todos). O pino (lat e lng) vai junto: mexeu-se, vão os dois.
 */
function camposDoLocal(
  estado: Estado,
  localId: Id,
  v: ValorMorada,
  inicial: ValorMorada | null,
  nome: string | null,
): Operacao[] {
  const morada = limparMorada(v.morada);
  const mexeuMorada = inicial === null || morada !== limparMorada(inicial.morada);
  const mexeuPais = inicial === null || v.pais !== inicial.pais;
  const mexeuPino = inicial === null || v.lat !== inicial.lat || v.lng !== inicial.lng;
  const ops: (Operacao | null)[] = [
    nome !== null ? operacaoCampo(estado, 'local', localId, 'nome', nome) : null,
    mexeuMorada ? operacaoCampo(estado, 'local', localId, 'morada', morada) : null,
    mexeuPais ? operacaoCampo(estado, 'local', localId, 'pais', v.pais) : null,
    mexeuPino ? operacaoCampo(estado, 'local', localId, 'lat', v.lat) : null,
    mexeuPino ? operacaoCampo(estado, 'local', localId, 'lng', v.lng) : null,
  ];
  return ops.filter((op) => op !== null);
}

/** A pessoa mexeu nesta morada (texto, país ou pino) face ao que o diálogo tinha ao abrir. */
function moradaMexida(v: ValorMorada, inicial: ValorMorada): boolean {
  return (
    limparMorada(v.morada) !== limparMorada(inicial.morada) ||
    v.pais !== inicial.pais ||
    v.lat !== inicial.lat ||
    v.lng !== inicial.lng
  );
}

/**
 * O que usa o local, além das obras em `ignorar`: casas, obras (o local ou o estacionamento) e carrinhas que
 * lá dormem. Frases curtas ("Casa 2", "Obra X", "CF 5001 (dorme lá)").
 */
export function usosDoLocal(estado: Estado, localId: Id, ignorar: ReadonlySet<Id> = new Set()): string[] {
  return [
    ...estado.casas.filter((c) => c.localId === localId).map((c) => c.nome),
    ...estado.obras
      .filter((o) => !ignorar.has(o.id) && (o.localId === localId || o.estacionamentoLocalId === localId))
      .map((o) => o.nome),
    ...estado.carrinhas
      .filter((c) => c.dormeLocalId === localId)
      .map((c) => `${formatarMatricula(c.matricula)} (dorme lá)`),
  ];
}

/** Os locais da obra que se apagam com ela (ou quando deixam de ser dela): criados no programa e sem outros usos. */
function locaisQueSaem(estado: Estado, obraId: Id, localIds: readonly (Id | null)[]): Id[] {
  const ignorar = new Set([obraId]);
  const ids = [...new Set(localIds.filter((id): id is Id => id !== null))];
  return ids.filter((id) => {
    const local = estado.locais.find((l) => l.id === id);
    return (
      local !== undefined && localCriadoNoPrograma(local) && usosDoLocal(estado, id, ignorar).length === 0
    );
  });
}

/**
 * Editar uma obra: um passo com os 'campo' da obra (nome, cliente, estacionamento) e dos locais (morada,
 * país, pino), SÓ os que a pessoa mudou: `dados` compara-se com `iniciais` (o que o diálogo tinha ao abrir,
 * dadosDaObra nesse momento) e o `de` de cada operação é o do estado visível agora. Assim, o que outra pessoa
 * gravou entretanto (e chegou pelo tempo real) fica, se esta não lhe mexeu. O local da obra criado no
 * programa muda de nome com ela. Estacionamento: novo (local novo + campo), mudado (campos do local) ou
 * tirado (campo a null + apagar o local, se foi criado no programa e mais nada o usa). `ops` vazio = nada
 * mudou.
 */
export function passoEditarObra(
  estado: Estado,
  obraId: Id,
  dados: DadosObra,
  iniciais: DadosObra,
  gerar?: () => string,
): ResultadoPasso {
  const obra = estado.obras.find((o) => o.id === obraId);
  if (!obra) return { ops: null, erros: ['Esta obra já não existe.'] };
  const nome = limparNome(dados.nome);
  const mexeuNome = nome !== limparNome(iniciais.nome);
  const erros = errosDosDados(estado, dados, obraId, mexeuNome);
  if (erros.length > 0) return { ops: null, erros };
  const local = estado.locais.find((l) => l.id === obra.localId);
  const nomeLocal =
    mexeuNome && local && localCriadoNoPrograma(local) && local.nome === obra.nome ? nome : null;
  const ops: Operacao[] = [
    mexeuNome ? operacaoCampo(estado, 'obra', obraId, 'nome', nome) : null,
    dados.clienteId !== iniciais.clienteId
      ? operacaoCampo(estado, 'obra', obraId, 'clienteId', dados.clienteId as Id)
      : null,
  ].filter((op) => op !== null);
  if (local) ops.push(...camposDoLocal(estado, local.id, dados.morada, iniciais.morada, nomeLocal));

  const antes = obra.estacionamentoLocalId;
  const est = antes !== null ? estado.locais.find((l) => l.id === antes) : undefined;
  const nomeEst =
    mexeuNome && est && localCriadoNoPrograma(est) && est.nome === nomeEstacionamento(obra.nome)
      ? nomeEstacionamento(nome)
      : null;
  const criarEstacionamento = (v: ValorMorada) => {
    const novo = localNovo('estacionamento', nomeEstacionamento(nome), v, gerar);
    ops.push(operacaoCriar('local', novo));
    const op = operacaoCampo(estado, 'obra', obraId, 'estacionamentoLocalId', novo.id);
    if (op) ops.push(op);
  };
  if (dados.estacionamento && !iniciais.estacionamento) {
    // Acrescentado no diálogo. Se outra pessoa lhe pôs um entretanto, esse fica com o sítio escolhido aqui.
    if (antes === null) criarEstacionamento(dados.estacionamento);
    else ops.push(...camposDoLocal(estado, antes, dados.estacionamento, null, nomeEst));
  } else if (dados.estacionamento && iniciais.estacionamento) {
    if (antes !== null) {
      ops.push(...camposDoLocal(estado, antes, dados.estacionamento, iniciais.estacionamento, nomeEst));
    } else if (moradaMexida(dados.estacionamento, iniciais.estacionamento)) {
      // Outra pessoa tirou-o entretanto, mas esta mexeu-lhe: volta, num local novo.
      criarEstacionamento(dados.estacionamento);
    }
  } else if (!dados.estacionamento && iniciais.estacionamento) {
    if (antes !== null) {
      const op = operacaoCampo(estado, 'obra', obraId, 'estacionamentoLocalId', null);
      if (op) ops.push(op);
      for (const id of locaisQueSaem(estado, obraId, [antes])) {
        if (id === obra.localId) continue;
        const apagar = operacaoApagar(estado, 'local', id);
        if (apagar) ops.push(apagar);
      }
    }
  } else if (antes !== null && nomeEst !== null) {
    // Não lhe mexeu, mas outra pessoa pôs-lhe um entretanto: só o nome acompanha o da obra.
    const op = operacaoCampo(estado, 'local', antes, 'nome', nomeEst);
    if (op) ops.push(op);
  }
  return { ops, erros: [] };
}

/** O que o "Apagar obra…" vai fazer, para o diálogo de confirmação. */
export interface ResumoApagarObra {
  /** Quem lá trabalha (passa para "sem obra"). */
  pessoas: number;
  /** Locais da obra que se apagam com ela (criados no programa e sem outros usos). */
  locaisApagados: Local[];
  /** Locais da obra que ficam (vieram dos dados iniciais ou são usados por outros). */
  locaisQueFicam: Local[];
}

export function resumoApagarObra(estado: Estado, obraId: Id): ResumoApagarObra | null {
  const obra = estado.obras.find((o) => o.id === obraId);
  if (!obra) return null;
  const ids = [...new Set([obra.localId, obra.estacionamentoLocalId].filter((x): x is Id => x !== null))];
  const saem = new Set(locaisQueSaem(estado, obraId, ids));
  const locais = ids
    .map((id) => estado.locais.find((l) => l.id === id))
    .filter((l): l is Local => l !== undefined);
  return {
    pessoas: estado.pessoas.filter((p) => p.obraId === obraId).length,
    locaisApagados: locais.filter((l) => saem.has(l.id)),
    locaisQueFicam: locais.filter((l) => !saem.has(l.id)),
  };
}

/**
 * Apagar uma obra: um passo com quem lá está para "sem obra" (também quem já saiu da empresa e ainda a
 * tinha), a obra apagada e os locais dela criados no programa que mais nada use (as obras antes dos locais:
 * o aplicarOperacoes e o servidor tratam da ordem). null se a obra já não existir.
 */
export function passoApagarObra(estado: Estado, obraId: Id): Operacao[] | null {
  const obra = estado.obras.find((o) => o.id === obraId);
  if (!obra) return null;
  const pessoas = estado.pessoas.filter((p) => p.obraId === obraId).map((p) => p.id);
  const ops: Operacao[] = operacoesParaAlvo(estado, pessoas, { tipo: 'sem-obra' });
  const apagarObra = operacaoApagar(estado, 'obra', obraId);
  if (apagarObra) ops.push(apagarObra);
  for (const id of locaisQueSaem(estado, obraId, [obra.localId, obra.estacionamentoLocalId])) {
    const op = operacaoApagar(estado, 'local', id);
    if (op) ops.push(op);
  }
  return ops;
}

/** Título da confirmação de apagar: "Apagar a Obra Ensaio?" e não "Apagar a obra Obra Ensaio?" (como nas casas). */
export function tituloApagarObra(nome: string): string {
  return normalizarTexto(nome).split(' ')[0] === 'obra' ? `Apagar a ${nome}?` : `Apagar a obra ${nome}?`;
}

/**
 * Como se diz um local na confirmação de apagar: a morada, ou, numa obra escolhida só no mapa (sem morada),
 * "o sítio no mapa" (o nome do local é o da obra e não diz nada).
 */
export function descreverLocalApagar(local: Pick<Local, 'morada' | 'nome'>): string {
  return local.morada.trim() ? `a morada ${local.morada.trim()}` : `o sítio no mapa (${local.nome})`;
}
