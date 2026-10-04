// Células da Tabela no modo de edição: as listas de Casa, Carrinha e Obra (com a lotação da simulação e
// os grupos especiais no fim), o alvo de cada escolha, o "antes: …" das células que mudaram no rascunho,
// os textos do botão do condutor e o que faz cada tecla nas listas. Funções puras (a Tabela calcula as
// opções uma vez por estado).

import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import { ocupacaoCarrinha, ocupacaoCasa } from '../../dominio/ocupacao';
import type { Alvo, CampoMovivel, Operacao } from '../../dominio/operacoes';
import type { Carrinha, Estado, Id } from '../../dominio/tipos';
import { type AcaoAtalho, acaoDoAtalho } from '../edicao/atalhos';
import { ROTULO_SEM_OBRA_DESTINO } from '../edicao/destinos';
import { alteracoesDaPessoa, rotuloDoCondutor, rotuloDoValor, soCondutores } from '../edicao/resumo';
import { deArtigoDoVeiculo, ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';
import { type LinhaTabela, SEM } from './linhasTabela';

/** As três células que se mudam com uma lista. */
export type CampoCelula = 'casa' | 'carrinha' | 'obra';

const CAMPO_MOVIVEL: Record<CampoCelula, CampoMovivel> = {
  casa: 'casaId',
  carrinha: 'carrinhaId',
  obra: 'obraId',
};

/** Uma opção de uma lista: o id (ou SEM, para Fora das casas / Sem transporte / Sem obra) e o texto. */
export interface OpcaoCelula {
  valor: string;
  rotulo: string;
}

const comparador = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

/** Casas pela ordem, "Casa 2 · 6/6" (lotação do estado visível), e no fim "Fora das casas CMF". */
export function opcoesCasa(estado: Estado, ind: Indices): OpcaoCelula[] {
  return [
    ...[...estado.casas]
      .sort((a, b) => a.ordem - b.ordem)
      .map((casa) => {
        const oc = ocupacaoCasa(casa, ind.moradores.get(casa.id)?.length ?? 0);
        return { valor: casa.id, rotulo: `${casa.nome} · ${oc.ocupados}/${oc.lotacao}` };
      }),
    { valor: SEM, rotulo: ROTULO_FORA_DAS_CASAS },
  ];
}

/** Carrinhas pela matrícula formatada, "CF 5005 · 6/9", e no fim "Sem transporte da empresa". */
export function opcoesCarrinha(estado: Estado, ind: Indices): OpcaoCelula[] {
  return [
    ...estado.carrinhas
      .map((c) => ({ carrinha: c, matricula: formatarMatricula(c.matricula) }))
      .sort((a, b) => comparador.compare(a.matricula, b.matricula))
      .map(({ carrinha, matricula }) => {
        const oc = ocupacaoCarrinha(carrinha, ind.passageiros.get(carrinha.id)?.length ?? 0);
        return { valor: carrinha.id, rotulo: `${matricula} · ${oc.ocupados}/${oc.lugares}` };
      }),
    { valor: SEM, rotulo: ROTULO_SEM_TRANSPORTE },
  ];
}

/** Obras pelo nome e no fim "Sem obra". */
export function opcoesObra(estado: Estado, _ind?: Indices): OpcaoCelula[] {
  return [
    ...[...estado.obras]
      .sort((a, b) => comparador.compare(a.nome, b.nome))
      .map((obra) => ({ valor: obra.id, rotulo: obra.nome })),
    { valor: SEM, rotulo: ROTULO_SEM_OBRA_DESTINO },
  ];
}

/** As mesmas opções (mesmos valores e textos): a Tabela guarda a lista anterior e as linhas não redesenham. */
export function mesmasOpcoes(a: readonly OpcaoCelula[], b: readonly OpcaoCelula[]): boolean {
  return a.length === b.length && a.every((o, i) => o.valor === b[i]?.valor && o.rotulo === b[i]?.rotulo);
}

/** Valor da célula na lista: o id da casa/carrinha/obra, ou SEM. */
export function valorDaCelula(linha: LinhaTabela, campo: CampoCelula): string {
  if (campo === 'casa') return linha.casa?.id ?? SEM;
  if (campo === 'carrinha') return linha.carrinha?.id ?? SEM;
  return linha.obra?.id ?? SEM;
}

/**
 * Texto da célula com a lista fechada (sem a lotação): a Tabela só desenha as opções todas na lista que
 * se está a usar, para mudar uma pessoa não obrigar a redesenhar as listas das ~140 linhas.
 */
export function rotuloDaCelula(linha: LinhaTabela, campo: CampoCelula): string {
  if (campo === 'casa') return linha.casa?.nome ?? ROTULO_FORA_DAS_CASAS;
  if (campo === 'carrinha') {
    return linha.carrinha ? formatarMatricula(linha.carrinha.matricula) : ROTULO_SEM_TRANSPORTE;
  }
  return linha.obra?.nome ?? ROTULO_SEM_OBRA_DESTINO;
}

/** Para onde vai a pessoa quando se escolhe `valor` na lista do campo. */
export function alvoDaEscolha(campo: CampoCelula, valor: string): Alvo {
  const sem = valor === SEM;
  if (campo === 'casa') return sem ? { tipo: 'fora' } : { tipo: 'casa', id: valor };
  if (campo === 'carrinha') return sem ? { tipo: 'sem-transporte' } : { tipo: 'carrinha', id: valor };
  return sem ? { tipo: 'sem-obra' } : { tipo: 'obra', id: valor };
}

/** "antes: Casa L1" se a célula mudou no rascunho (o valor gravado); null se não mudou. */
export function antesDaCelula(
  pendentes: readonly Operacao[],
  estadoServidor: Estado,
  pessoaId: Id,
  campo: CampoCelula,
): string | null {
  const movivel = CAMPO_MOVIVEL[campo];
  const op = alteracoesDaPessoa(pendentes, pessoaId).get(movivel);
  return op ? `antes: ${rotuloDoValor(estadoServidor, movivel, op.de)}` : null;
}

function condutorDe(estado: Estado, carrinhaId: Id): Id | null {
  return estado.carrinhas.find((c) => c.id === carrinhaId)?.condutorId ?? null;
}

/**
 * "antes: …" da célula do condutor, comparando o gravado com a simulação:
 * - a carrinha onde a pessoa vai mudou de condutor e a pessoa é (ou era) esse condutor → "antes: Ana T."
 *   (ou "antes: sem condutor");
 * - a pessoa conduzia outra carrinha e já não conduz (saiu dela) → "antes: condutor da XX 1001".
 * null se nada mudou para ela.
 */
export function antesDoCondutor(estadoServidor: Estado, estado: Estado, pessoaId: Id): string | null {
  const carrinhaId = estado.pessoas.find((p) => p.id === pessoaId)?.carrinhaId ?? null;
  if (carrinhaId) {
    const antes = condutorDe(estadoServidor, carrinhaId);
    const agora = condutorDe(estado, carrinhaId);
    if (antes !== agora && (antes === pessoaId || agora === pessoaId)) {
      return `antes: ${rotuloDoCondutor(estadoServidor, antes)}`;
    }
  }
  const conduzia = estadoServidor.carrinhas.find((c) => c.condutorId === pessoaId && c.id !== carrinhaId);
  if (conduzia && condutorDe(estado, conduzia.id) !== pessoaId) {
    return `antes: condutor ${deArtigoDoVeiculo(conduzia.tipo)} ${formatarMatricula(conduzia.matricula)}`;
  }
  return null;
}

/** O "antes: …" das células que mudaram numa linha (só os campos que mudaram). */
export interface AntesDaLinha {
  casa?: string;
  carrinha?: string;
  obra?: string;
  condutor?: string;
}

/** O "antes: …" de todas as pessoas com alterações por guardar (as outras não aparecem). */
export function antesDasLinhas(
  pendentes: readonly Operacao[],
  estadoServidor: Estado,
  estado: Estado,
): Map<Id, AntesDaLinha> {
  const ids = new Set<Id>();
  for (const op of pendentes) {
    if (op.tipo === 'mover') ids.add(op.pessoaId);
    else if (op.tipo === 'condutor') {
      if (op.de) ids.add(op.de);
      if (op.para) ids.add(op.para);
    }
  }
  // Quem estava a conduzir uma carrinha que mudou de condutor (o `de` compactado pode ser outro).
  for (const op of soCondutores(pendentes)) {
    const gravado = condutorDe(estadoServidor, op.carrinhaId);
    if (gravado) ids.add(gravado);
  }
  const resultado = new Map<Id, AntesDaLinha>();
  for (const id of ids) {
    const antes: AntesDaLinha = {};
    for (const campo of ['casa', 'carrinha', 'obra'] as const) {
      const texto = antesDaCelula(pendentes, estadoServidor, id, campo);
      if (texto) antes[campo] = texto;
    }
    const condutor = antesDoCondutor(estadoServidor, estado, id);
    if (condutor) antes.condutor = condutor;
    if (Object.keys(antes).length > 0) resultado.set(id, antes);
  }
  return resultado;
}

/** aria-label do botão do condutor: "Tornar Ana B. condutor da XX 1001" / "Tirar Ana B. de condutor da …". */
export function rotuloBotaoCondutor(
  nomeCurto: string,
  carrinha: Pick<Carrinha, 'tipo' | 'matricula'>,
  conduz: boolean,
): string {
  const daCarrinha = `${deArtigoDoVeiculo(carrinha.tipo)} ${formatarMatricula(carrinha.matricula)}`;
  return conduz
    ? `Tirar ${nomeCurto} de condutor ${daCarrinha}`
    : `Tornar ${nomeCurto} condutor ${daCarrinha}`;
}

// --- Teclado nas listas das células ---------------------------------------------------------------

/** Teclas que movem o escolhido numa lista (setas, Home/End, página acima/abaixo). */
const TECLAS_NAVEGACAO = new Set(['ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);

export interface TeclaLista {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/**
 * Tecla que, numa lista FECHADA com o foco, muda logo o valor (Chrome e Firefox no Windows e Linux):
 * as setas, Home/End, página acima/abaixo e as letras (escolhe pela primeira letra). Alt+↓ e o espaço
 * abrem a lista; com Ctrl/⌘ é um atalho.
 */
export function teclaMudaLista(t: TeclaLista): boolean {
  if (t.altKey || t.ctrlKey || t.metaKey) return false;
  if (TECLAS_NAVEGACAO.has(t.key)) return true;
  return [...t.key].length === 1 && t.key !== ' ';
}

/**
 * O que faz uma tecla numa lista de uma célula (modo de edição):
 * - 'abrir': tecla que mudaria logo a pessoa com a lista fechada → abre a lista (escolhe-se com Enter);
 * - 'confirmar' / 'anular': Enter grava a escolha provisória (feita com o teclado sem abrir a lista,
 *   quando o browser não a deixa abrir); Esc e Ctrl/⌘+Z anulam-na;
 * - 'desfazer' / 'refazer' / 'limpar-selecao': os atalhos do modo de edição, que a lista também tem
 *   (fora dela são do documento, que ignora as listas por serem campos);
 * - null: a tecla é do browser.
 * `aberta` = a lista já foi aberta e não se sabe se fechou: aí as teclas são da lista aberta.
 */
export type AcaoTeclaLista = 'abrir' | 'confirmar' | 'anular' | AcaoAtalho;

export function acaoTeclaLista(
  t: TeclaLista,
  c: { aberta: boolean; provisoria: boolean; temSelecao: boolean; dialogoAberto: boolean },
): AcaoTeclaLista | null {
  const comando = t.ctrlKey || t.metaKey;
  if (c.provisoria) {
    if (t.key === 'Enter' && !comando && !t.altKey) return 'confirmar';
    if (t.key === 'Escape' && !comando && !t.altKey) return 'anular';
    if (comando && !t.shiftKey && !t.altKey && t.key.toLowerCase() === 'z') return 'anular';
  }
  const atalho = acaoDoAtalho({
    key: t.key,
    ctrlKey: t.ctrlKey,
    metaKey: t.metaKey,
    shiftKey: t.shiftKey,
    altKey: t.altKey,
    emCampoEditavel: false,
    modoEdicao: true,
    dialogoAberto: c.dialogoAberto,
    temSelecao: c.temSelecao,
  });
  if (atalho) return atalho;
  if (!c.aberta && teclaMudaLista(t)) return 'abrir';
  return null;
}
