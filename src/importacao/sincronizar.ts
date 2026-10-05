// Sincronização NÃO destrutiva dos dados iniciais com a base de dados (npm run sincronizar).
// Compara dados-iniciais/{clientes,casas,carrinhas,locais}.json com o estado da base de dados e diz o que
// muda, sem tocar no que se edita no programa: as pessoas (exceto as dos veículos que saem da frota), os
// condutores, onde dormem as carrinhas, os carros temporários, o senhorio e o equipamento das casas, as
// obras e o histórico. Funções puras; a gravação (uma transação e um lote no histórico) está em
// sincronizarBd.ts.
//
// - Clientes, locais, casas e veículos novos entram; os que já existem atualizam só os campos dos JSON
//   (CAMPOS_SINCRONIZADOS).
// - Veículos que desaparecem dos JSON saem da frota (vendidos): quem lá ia fica "sem transporte" e
//   "a confirmar", e o condutor é retirado. Os veículos TEMPORÁRIOS (carros de substituição, que se gerem
//   no programa e não estão nos JSON) nunca saem.
// - Um JSON vazio (sem clientes, casas ou veículos) é erro bloqueante: tirava tudo de uma vez.
// - Casas que desaparecem só saem sem moradores (senão é erro bloqueante); as carrinhas que lá dormiam
//   ficam com onde dorme "por definir" (o mapa volta a usar a sugestão).
// - Clientes que desaparecem só saem sem pessoas nem obras (senão é erro bloqueante).
// - Locais nunca se apagam (podem ter obras e carrinhas a dormir lá): os que só existem na base de dados
//   ficam e o relatório diz quais são.
// - M2: um campo mudado no programa NUNCA é desfeito (`editados`: a linha mais recente desse campo em
//   `alteracoes` é de um lote que não é da importação nem dos dados iniciais): fica o valor do programa e o
//   plano lista-o em `mantidos` ("Ficou o valor do programa"). Daí em diante muda-se no programa, ou com
//   --usar-json entidade:id:campo (`usarJson`), que aplica de propósito o valor do JSON. Um registo apagado no
//   programa (CAMPO_REGISTO com depois null) não volta a entrar.
// - M2: casas e veículos que saem com problemas por resolver: recusado ("A carrinha CF 5003 tem 1 problema
//   por resolver: resolve-o antes"); os problemas resolvidos apagam-se antes deles (ficam no histórico).

import { formatarMatricula } from '../dominio/matricula';
import { CAMPO_REGISTO } from '../dominio/operacoes';
import type { Carrinha, Casa, Cliente, Estado, Id, Local, Problema } from '../dominio/tipos';
import { montarReferencias, type Referencias } from './montar';
import type { DadosReferencia, ErroImportacao } from './tipos';

export type EntidadeSincronizada = 'cliente' | 'local' | 'casa' | 'carrinha';

/** Campos que vêm dos JSON. Os outros (condutor, onde dorme, senhorio…) editam-se no programa. */
export const CAMPOS_SINCRONIZADOS = {
  cliente: ['nome', 'cor', 'sigla', 'interno', 'ordem'],
  local: ['nome', 'morada', 'pais', 'lat', 'lng'],
  casa: [
    'nome',
    'localId',
    'apartamento',
    'lotacao',
    'maxContrato',
    'tolerado',
    'notaContrato',
    'sempreCheia',
    'ordem',
  ],
  carrinha: ['matricula', 'matriculasAlternativas', 'tipo', 'marca', 'modelo', 'lugares', 'nota', 'ordem'],
} as const satisfies {
  cliente: readonly (keyof Cliente)[];
  local: readonly (keyof Local)[];
  casa: readonly (keyof Casa)[];
  carrinha: readonly (keyof Carrinha)[];
};

/**
 * Campos com valor único na base de dados. Quando mudam, gravam-se em dois passos (primeiro um valor
 * provisório, depois o final), para uma troca entre dois registos (ex.: duas cores) não colidir.
 */
export const CAMPOS_UNICOS: Readonly<Record<EntidadeSincronizada, readonly string[]>> = {
  cliente: ['cor', 'sigla'],
  local: [],
  casa: ['nome'],
  carrinha: ['matricula'],
};

/** Campos da tabela `alteracoes` que o servidor também usa (src/servidor/lotes.ts). */
export const CAMPO_CONDUTOR = 'condutorId';
/** Onde dorme a carrinha: a chave "casa:<id>" / "local:<id>" em JSON (null = por definir). */
export const CAMPO_DORMIDA = 'dormida';

/** O autor do lote no histórico. */
export const AUTOR_SINCRONIZACAO = 'dados-iniciais';

export type Valor = string | number | boolean | null | readonly string[];

export interface MudancaCampo {
  campo: string;
  antes: Valor;
  depois: Valor;
}

/** Um registo que já existe e muda (só os campos de CAMPOS_SINCRONIZADOS). */
export interface Alterado {
  entidade: EntidadeSincronizada;
  id: Id;
  /** Ex.: "Carrinha CF 5001", "Casa Um", "Cliente Alfa", "Local Rua A" (com os valores novos). */
  rotulo: string;
  mudancas: MudancaCampo[];
}

/**
 * Um campo dos JSON que foi mudado no programa: fica o valor do programa (a sincronização nunca desfaz uma
 * edição). Para aplicar o do JSON: --usar-json entidade:id:campo.
 */
export interface Mantido {
  entidade: EntidadeSincronizada;
  id: Id;
  /** Ex.: "Casa Um", "Carrinha CF 5001". */
  rotulo: string;
  campo: string;
  valorPrograma: Valor;
  valorJson: Valor;
}

/** Um registo dos JSON que foi apagado no programa: não volta a entrar. */
export interface ApagadoNoPrograma {
  entidade: EntidadeSincronizada;
  id: Id;
  rotulo: string;
}

/** Chave de um campo (ou de um registo, com CAMPO_REGISTO) nos conjuntos `editados` e `usarJson`. */
export function chaveCampo(entidade: string, id: Id, campo: string): string {
  return `${entidade}:${id}:${campo}`;
}

/** Pessoa que ia num veículo que sai da frota. */
export interface SemTransporte {
  pessoaId: Id;
  nomeCurto: string;
  carrinhaId: Id;
  /** Já estava marcada "carrinha a confirmar". */
  aConfirmarAntes: boolean;
}

export interface CondutorRetirado {
  carrinhaId: Id;
  pessoaId: Id;
  nomeCurto: string;
}

/** Carrinha que dormia numa casa que sai: fica com onde dorme "por definir". */
export interface DormidaRetirada {
  carrinhaId: Id;
  casaId: Id;
}

export interface PlanoSincronizacao {
  novos: Referencias;
  alterados: Alterado[];
  removidos: { clientes: Cliente[]; casas: Casa[]; carrinhas: Carrinha[] };
  semTransporte: SemTransporte[];
  condutoresRetirados: CondutorRetirado[];
  dormidasRetiradas: DormidaRetirada[];
  /** Locais que estão na base de dados mas não em locais.json: ficam (os locais nunca se apagam). */
  locaisSoNaBd: Local[];
  /**
   * Veículos temporários (carros de substituição) que não estão em carrinhas.json: geram-se no programa,
   * por isso ficam, com as pessoas e o condutor.
   */
  temporariasSoNaBd: Carrinha[];
  /**
   * M2: campos que mudaram nos JSON mas tinham sido mudados no programa: fica o valor do programa (não se
   * gravam). Os de `usarJson` não ficam aqui: aplicam-se.
   */
  mantidos: Mantido[];
  /** M2: registos dos JSON apagados no programa (não voltam). */
  apagadosNoPrograma: ApagadoNoPrograma[];
  /** M2: problemas resolvidos das casas e veículos que saem: apagam-se antes deles (ficam no histórico). */
  problemasApagados: Problema[];
  /**
   * Erros dos JSON e saídas impossíveis (cliente com pessoas, casa com moradores, problemas por resolver):
   * impedem o --aplicar.
   */
  erros: ErroImportacao[];
}

// --- Rótulos e valores ----------------------------------------------------------------------------

/** "Carrinha CF 5001" ou "Carro YG 4474". */
export function rotuloVeiculo(c: Pick<Carrinha, 'tipo' | 'matricula'>): string {
  return `${c.tipo === 'carro' ? 'Carro' : 'Carrinha'} ${formatarMatricula(c.matricula)}`;
}

function rotulo(entidade: EntidadeSincronizada, registo: Cliente | Local | Casa | Carrinha): string {
  if (entidade === 'carrinha') return rotuloVeiculo(registo as Carrinha);
  const nome = (registo as Cliente | Local | Casa).nome;
  if (entidade === 'cliente') return `Cliente ${nome}`;
  if (entidade === 'local') return `Local ${nome}`;
  return /^(casa|apartamento) /i.test(nome) ? nome : `Casa ${nome}`;
}

export function plural(n: number, singular: string, varios: string): string {
  return `${n} ${n === 1 ? singular : varios}`;
}

function iguais(a: Valor | undefined, b: Valor | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function valorDe(registo: object, campo: string): Valor {
  const v = (registo as Record<string, unknown>)[campo];
  return v === undefined ? null : (v as Valor);
}

function mudancas(campos: readonly string[], atual: object, novo: object): MudancaCampo[] {
  return campos.flatMap((campo) => {
    const antes = valorDe(atual, campo);
    const depois = valorDe(novo, campo);
    return iguais(antes, depois) ? [] : [{ campo, antes, depois }];
  });
}

// --- Plano ----------------------------------------------------------------------------------------

/**
 * Compara os dados iniciais com o estado da base de dados e devolve o que muda. Não altera nada.
 * Se `erros` não estiver vazio, o plano não se pode aplicar.
 * @param estado o estado COMPLETO (com os problemas resolvidos antigos: os das casas e veículos que saem).
 * @param editados "entidade:id:campo" mudados no programa (a linha mais recente em `alteracoes` não é da
 *   importação nem dos dados iniciais): ficam com o valor do programa. "entidade:id:@registo" = apagado no
 *   programa: não volta a entrar.
 * @param usarJson "entidade:id:campo" em que se aplica o valor do JSON mesmo que tenha sido editado.
 */
export function planearSincronizacao(
  dados: DadosReferencia,
  estado: Estado,
  editados: ReadonlySet<string> = new Set(),
  usarJson: ReadonlySet<string> = new Set(),
): PlanoSincronizacao {
  const { referencias: ref, erros } = montarReferencias(dados);
  const plano: PlanoSincronizacao = {
    novos: { clientes: [], locais: [], casas: [], carrinhas: [] },
    alterados: [],
    removidos: { clientes: [], casas: [], carrinhas: [] },
    semTransporte: [],
    condutoresRetirados: [],
    dormidasRetiradas: [],
    locaisSoNaBd: [],
    temporariasSoNaBd: [],
    mantidos: [],
    apagadosNoPrograma: [],
    problemasApagados: [],
    erros: [...erros],
  };

  // Um JSON vazio tirava tudo de uma vez (ex.: todos os veículos saíam da frota e as pessoas ficavam sem
  // transporte): é quase de certeza um ficheiro estragado, não uma decisão.
  const vazios: [string, number, number][] = [
    ['clientes.json', dados.clientes.length, estado.clientes.length],
    ['casas.json', dados.casas.length, estado.casas.length],
    ['carrinhas.json', dados.carrinhas.length, estado.carrinhas.filter((c) => !c.temporaria).length],
  ];
  for (const [ficheiro, noJson, naBd] of vazios) {
    if (noJson > 0 || naBd === 0) continue;
    plano.erros.push({
      bloqueante: true,
      mensagem: `${ficheiro} está vazio: assim saía tudo o que lá estava. Confirme o ficheiro antes de sincronizar.`,
      onde: `dados-iniciais/${ficheiro}`,
    });
  }

  /** Novos e alterados de uma entidade, pela ordem do JSON. */
  function comparar<T extends Cliente | Local | Casa | Carrinha>(
    entidade: EntidadeSincronizada,
    doJson: readonly T[],
    daBd: readonly T[],
    novos: T[],
  ): Set<Id> {
    const atuais = new Map(daBd.map((r) => [r.id, r]));
    for (const novo of doJson) {
      const atual = atuais.get(novo.id);
      if (!atual) {
        if (editados.has(chaveCampo(entidade, novo.id, CAMPO_REGISTO))) {
          plano.apagadosNoPrograma.push({ entidade, id: novo.id, rotulo: rotulo(entidade, novo) });
        } else {
          novos.push(novo);
        }
        continue;
      }
      const m: MudancaCampo[] = [];
      for (const mudanca of mudancas(CAMPOS_SINCRONIZADOS[entidade], atual, novo)) {
        const chave = chaveCampo(entidade, novo.id, mudanca.campo);
        if (editados.has(chave) && !usarJson.has(chave)) {
          plano.mantidos.push({
            entidade,
            id: novo.id,
            rotulo: rotulo(entidade, atual),
            campo: mudanca.campo,
            valorPrograma: mudanca.antes,
            valorJson: mudanca.depois,
          });
        } else {
          m.push(mudanca);
        }
      }
      if (m.length > 0)
        plano.alterados.push({ entidade, id: novo.id, rotulo: rotulo(entidade, novo), mudancas: m });
    }
    // Os apagados no programa contam como "no JSON": não são registos que saem.
    return new Set(doJson.map((r) => r.id));
  }

  const idsLocais = comparar('local', ref.locais, estado.locais, plano.novos.locais);
  plano.locaisSoNaBd = estado.locais.filter((l) => !idsLocais.has(l.id));

  const idsClientes = comparar('cliente', ref.clientes, estado.clientes, plano.novos.clientes);
  for (const c of estado.clientes) {
    if (idsClientes.has(c.id)) continue;
    const pessoas = estado.pessoas.filter((p) => p.clienteId === c.id).length;
    const obras = estado.obras.filter((o) => o.clienteId === c.id).length;
    if (pessoas + obras === 0) {
      plano.removidos.clientes.push(c);
      continue;
    }
    const tem = [
      pessoas > 0 ? plural(pessoas, 'pessoa', 'pessoas') : null,
      obras > 0 ? plural(obras, 'obra', 'obras') : null,
    ]
      .filter(Boolean)
      .join(' e ');
    plano.erros.push({
      bloqueante: true,
      mensagem:
        `O cliente "${c.nome}" já não está em clientes.json, mas tem ${tem}: não pode sair. ` +
        'Volte a pô-lo no JSON, ou mude primeiro essas pessoas/obras de cliente.',
      onde: 'dados-iniciais/clientes.json',
    });
  }

  /**
   * Problemas de uma casa/veículo que sai: com algum por resolver, erro bloqueante (devolve true); os
   * resolvidos apagam-se antes do registo (FK) e ficam no histórico.
   */
  function problemasQueSaem(quem: string, doAlvo: (p: Problema) => boolean, onde: string): boolean {
    const dele = (estado.problemas ?? []).filter(doAlvo);
    const abertos = dele.filter((p) => p.resolvidoEm === null).length;
    if (abertos > 0) {
      plano.erros.push({
        bloqueante: true,
        mensagem: `${quem} tem ${plural(abertos, 'problema', 'problemas')} por resolver: ${
          abertos === 1 ? 'resolve-o' : 'resolve-os'
        } antes.`,
        onde,
      });
      return true;
    }
    plano.problemasApagados.push(...dele);
    return false;
  }

  const idsCasas = comparar('casa', ref.casas, estado.casas, plano.novos.casas);
  const casasQueSaem = new Set<Id>();
  for (const c of estado.casas) {
    if (idsCasas.has(c.id)) continue;
    const moradores = estado.pessoas.filter((p) => p.casaId === c.id).length;
    if (moradores === 0) {
      if (problemasQueSaem(`A casa "${c.nome}"`, (p) => p.casaId === c.id, 'dados-iniciais/casas.json'))
        continue;
      plano.removidos.casas.push(c);
      casasQueSaem.add(c.id);
      continue;
    }
    plano.erros.push({
      bloqueante: true,
      mensagem:
        `A casa "${c.nome}" já não está em casas.json, mas tem ${plural(moradores, 'morador', 'moradores')}: ` +
        'não pode sair. Volte a pô-la no JSON, ou mude primeiro os moradores no programa.',
      onde: 'dados-iniciais/casas.json',
    });
  }

  const idsCarrinhas = comparar('carrinha', ref.carrinhas, estado.carrinhas, plano.novos.carrinhas);
  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  for (const c of estado.carrinhas) {
    // Os temporários que não estão no JSON geram-se no programa: ficam (só saem pelo programa).
    const temporariaSoNaBd = c.temporaria && !idsCarrinhas.has(c.id);
    if (temporariaSoNaBd) plano.temporariasSoNaBd.push(c);
    if (idsCarrinhas.has(c.id) || temporariaSoNaBd) {
      if (c.dormeCasaId && casasQueSaem.has(c.dormeCasaId)) {
        plano.dormidasRetiradas.push({ carrinhaId: c.id, casaId: c.dormeCasaId });
      }
      continue;
    }
    const veiculo = `${c.tipo === 'carro' ? 'O carro' : 'A carrinha'} ${formatarMatricula(c.matricula)}`;
    problemasQueSaem(veiculo, (p) => p.carrinhaId === c.id, 'dados-iniciais/carrinhas.json');
    plano.removidos.carrinhas.push(c);
    for (const p of estado.pessoas) {
      if (p.carrinhaId !== c.id) continue;
      plano.semTransporte.push({
        pessoaId: p.id,
        nomeCurto: p.nomeCurto,
        carrinhaId: c.id,
        aConfirmarAntes: p.carrinhaAConfirmar,
      });
    }
    if (c.condutorId) {
      plano.condutoresRetirados.push({
        carrinhaId: c.id,
        pessoaId: c.condutorId,
        nomeCurto: pessoas.get(c.condutorId)?.nomeCurto ?? c.condutorId,
      });
    }
  }

  // A matrícula é única na base de dados e o temporário fica: um veículo do JSON com a mesma matrícula
  // rebentava a gravação a meio (a transação desfazia tudo, mas sem explicar porquê).
  const temporarias = new Map(plano.temporariasSoNaBd.map((c) => [c.matricula, c]));
  for (const c of ref.carrinhas) {
    const temporaria = temporarias.get(c.matricula);
    if (!temporaria) continue;
    plano.erros.push({
      bloqueante: true,
      mensagem:
        `A matrícula ${formatarMatricula(c.matricula)} de carrinhas.json já é do veículo temporário ` +
        `"${temporaria.id}" (criado no programa): não pode haver duas iguais.`,
      onde: `dados-iniciais/carrinhas.json (${c.id})`,
    });
  }

  return plano;
}

export function planoVazio(plano: PlanoSincronizacao): boolean {
  const { novos, removidos } = plano;
  return (
    plano.alterados.length === 0 &&
    novos.clientes.length + novos.locais.length + novos.casas.length + novos.carrinhas.length === 0 &&
    removidos.clientes.length + removidos.casas.length + removidos.carrinhas.length === 0 &&
    plano.semTransporte.length + plano.condutoresRetirados.length + plano.dormidasRetiradas.length === 0
  );
}

// --- Linhas do histórico (tabela `alteracoes`) ------------------------------------------------------

/** Uma linha da tabela `alteracoes`: valores em JSON; null = não existia (registo novo ou que saiu). */
export interface LinhaAlteracaoSincronizacao {
  entidade: string;
  entidadeId: Id;
  campo: string;
  antes: string | null;
  depois: string | null;
}

/** Campos a registar quando um registo entra ou sai (só os que têm valor). */
const CAMPOS_REGISTO: Readonly<Record<EntidadeSincronizada, readonly string[]>> = {
  cliente: ['nome', 'cor', 'sigla', 'interno'],
  local: ['tipo', 'nome', 'morada', 'pais', 'lat', 'lng'],
  casa: [
    'nome',
    'localId',
    'apartamento',
    'lotacao',
    'maxContrato',
    'tolerado',
    'notaContrato',
    'sempreCheia',
    'senhorio',
    'equipamento',
  ],
  carrinha: [
    'matricula',
    'matriculasAlternativas',
    'tipo',
    'marca',
    'modelo',
    'lugares',
    'temporaria',
    'nota',
  ],
};

function temValor(v: Valor): boolean {
  if (v === null || v === false || v === '') return false;
  return !Array.isArray(v) || v.length > 0;
}

function linhasDoRegisto(
  entidade: EntidadeSincronizada,
  registo: Cliente | Local | Casa | Carrinha,
  sentido: 'entra' | 'sai',
): LinhaAlteracaoSincronizacao[] {
  const linhas: LinhaAlteracaoSincronizacao[] = [];
  for (const campo of CAMPOS_REGISTO[entidade]) {
    const v = valorDe(registo, campo);
    if (!temValor(v)) continue;
    const json = JSON.stringify(v);
    linhas.push({
      entidade,
      entidadeId: registo.id,
      campo,
      antes: sentido === 'sai' ? json : null,
      depois: sentido === 'entra' ? json : null,
    });
  }
  return linhas;
}

/**
 * As linhas do histórico, pela ordem em que interessam a quem as lê (o diálogo mostra as primeiras):
 * pessoas que ficam sem transporte, condutores retirados, onde dorme retirado, o que sai, o que entra,
 * o que muda e, no fim, as mudanças de ordem.
 */
export function alteracoesDoPlano(plano: PlanoSincronizacao): LinhaAlteracaoSincronizacao[] {
  const linhas: LinhaAlteracaoSincronizacao[] = [];
  for (const s of plano.semTransporte) {
    linhas.push({
      entidade: 'pessoa',
      entidadeId: s.pessoaId,
      campo: 'carrinhaId',
      antes: JSON.stringify(s.carrinhaId),
      depois: JSON.stringify(null),
    });
    if (!s.aConfirmarAntes) {
      linhas.push({
        entidade: 'pessoa',
        entidadeId: s.pessoaId,
        campo: 'carrinhaAConfirmar',
        antes: JSON.stringify(false),
        depois: JSON.stringify(true),
      });
    }
  }
  for (const c of plano.condutoresRetirados) {
    linhas.push({
      entidade: 'carrinha',
      entidadeId: c.carrinhaId,
      campo: CAMPO_CONDUTOR,
      antes: JSON.stringify(c.pessoaId),
      depois: JSON.stringify(null),
    });
  }
  for (const d of plano.dormidasRetiradas) {
    linhas.push({
      entidade: 'carrinha',
      entidadeId: d.carrinhaId,
      campo: CAMPO_DORMIDA,
      antes: JSON.stringify(`casa:${d.casaId}`),
      depois: JSON.stringify(null),
    });
  }
  // M2: os problemas resolvidos das casas e veículos que saem (o registo inteiro, como os do programa).
  for (const p of plano.problemasApagados) {
    linhas.push({
      entidade: 'problema',
      entidadeId: p.id,
      campo: CAMPO_REGISTO,
      antes: JSON.stringify(p),
      depois: null,
    });
  }
  for (const c of plano.removidos.carrinhas) {
    linhas.push(...linhasDoRegisto('carrinha', c, 'sai'));
    const dormida = c.dormeCasaId
      ? `casa:${c.dormeCasaId}`
      : c.dormeLocalId
        ? `local:${c.dormeLocalId}`
        : null;
    if (dormida) {
      linhas.push({
        entidade: 'carrinha',
        entidadeId: c.id,
        campo: CAMPO_DORMIDA,
        antes: JSON.stringify(dormida),
        depois: null,
      });
    }
  }
  for (const c of plano.removidos.casas) linhas.push(...linhasDoRegisto('casa', c, 'sai'));
  for (const c of plano.removidos.clientes) linhas.push(...linhasDoRegisto('cliente', c, 'sai'));
  for (const l of plano.novos.locais) linhas.push(...linhasDoRegisto('local', l, 'entra'));
  for (const c of plano.novos.clientes) linhas.push(...linhasDoRegisto('cliente', c, 'entra'));
  for (const c of plano.novos.casas) linhas.push(...linhasDoRegisto('casa', c, 'entra'));
  for (const c of plano.novos.carrinhas) linhas.push(...linhasDoRegisto('carrinha', c, 'entra'));
  const deOrdem: LinhaAlteracaoSincronizacao[] = [];
  for (const a of plano.alterados) {
    for (const m of a.mudancas) {
      const linha = {
        entidade: a.entidade,
        entidadeId: a.id,
        campo: m.campo,
        antes: JSON.stringify(m.antes),
        depois: JSON.stringify(m.depois),
      };
      (m.campo === 'ordem' ? deOrdem : linhas).push(linha);
    }
  }
  return [...linhas, ...deOrdem];
}

// --- Textos ---------------------------------------------------------------------------------------

const NOME_CAMPO: Readonly<Record<string, string>> = {
  nome: 'nome',
  cor: 'cor',
  sigla: 'sigla',
  interno: 'interno',
  ordem: 'ordem',
  tipo: 'tipo',
  morada: 'morada',
  pais: 'país',
  lat: 'latitude',
  lng: 'longitude',
  localId: 'local',
  apartamento: 'apartamento',
  lotacao: 'lotação',
  maxContrato: 'máximo do contrato',
  tolerado: 'tolerado',
  notaContrato: 'nota do contrato',
  // Sem a etiqueta "sempre cheia" (pedido do Rafael, 04/10/2026: não aparece em lado nenhum; o Histórico
  // usa estes nomes).
  sempreCheia: 'lugares iguais aos moradores',
  senhorio: 'senhorio',
  equipamento: 'equipamento',
  matricula: 'matrícula',
  matriculasAlternativas: 'outras matrículas',
  marca: 'marca',
  modelo: 'modelo',
  lugares: 'lugares',
  temporaria: 'temporária',
  nota: 'nota',
};

export function nomeCampo(campo: string): string {
  return NOME_CAMPO[campo] ?? campo;
}

/** Valor legível: "—" para vazio, sim/não, listas separadas por vírgulas, decimais com vírgula. */
export function formatarValor(
  v: Valor | undefined,
  nomeLocal: (id: Id) => string = (id) => id,
  campo = '',
): string {
  if (v === null || v === undefined || v === '') return '—';
  if (v === true) return 'sim';
  if (v === false) return 'não';
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : '—';
  if (typeof v === 'number') return String(v).replace('.', ',');
  if (campo === 'localId') return nomeLocal(v as string);
  if (campo === 'matricula') return formatarMatricula(v as string);
  return String(v);
}

function frasesDasMudancas(m: readonly MudancaCampo[], nomeLocal: (id: Id) => string): string {
  return m
    .map(
      (x) =>
        `${nomeCampo(x.campo)} ${formatarValor(x.antes, nomeLocal, x.campo)} → ${formatarValor(x.depois, nomeLocal, x.campo)}`,
    )
    .join(' · ');
}

function marcaModelo(c: Pick<Carrinha, 'marca' | 'modelo'>): string | null {
  const t = [c.marca, c.modelo].filter(Boolean).join(' ');
  return t || null;
}

/** Frase de um veículo que sai da frota, com as consequências. */
export function consequenciasDaSaida(plano: PlanoSincronizacao, c: Carrinha): string {
  const pessoas = plano.semTransporte.filter((s) => s.carrinhaId === c.id).length;
  const condutor = plano.condutoresRetirados.some((x) => x.carrinhaId === c.id);
  const partes = [
    pessoas > 0
      ? `${plural(pessoas, 'pessoa fica', 'pessoas ficam')} sem transporte (a confirmar)`
      : 'não levava ninguém',
    condutor ? 'condutor retirado' : null,
  ].filter(Boolean);
  return partes.join('; ');
}

/** Ex.: "Carrinha ZZ 1001 sai da frota: 2 pessoas ficam sem transporte (a confirmar); condutor retirado". */
export function fraseSaida(plano: PlanoSincronizacao, c: Carrinha): string {
  return `${rotuloVeiculo(c)} sai da frota: ${consequenciasDaSaida(plano, c)}`;
}

/**
 * O que muda, uma frase por registo (ex.: "Carrinha ZZ 1001 sai da frota: 2 pessoas ficam sem transporte
 * (a confirmar); condutor retirado"). As mudanças de ordem ficam juntas numa só frase, no fim.
 */
export function frasesDoPlano(plano: PlanoSincronizacao, estado: Pick<Estado, 'locais'>): string[] {
  const locais = new Map([...estado.locais, ...plano.novos.locais].map((l) => [l.id, l.nome]));
  const nomeLocal = (id: Id) => locais.get(id) ?? id;
  const frases: string[] = [];

  for (const c of plano.removidos.carrinhas) frases.push(fraseSaida(plano, c));
  for (const c of plano.removidos.casas) {
    const dormiam = plano.dormidasRetiradas.filter((d) => d.casaId === c.id).length;
    frases.push(
      `${rotulo('casa', c)} sai (sem moradores)` +
        (dormiam > 0
          ? `; ${plural(dormiam, 'carrinha que lá dormia fica', 'carrinhas que lá dormiam ficam')} com onde dorme por definir`
          : ''),
    );
  }
  for (const c of plano.removidos.clientes)
    frases.push(`${rotulo('cliente', c)} sai (sem pessoas nem obras)`);

  for (const c of plano.novos.carrinhas) {
    const descricao = [marcaModelo(c), plural(c.lugares, 'lugar', 'lugares')].filter(Boolean).join(', ');
    frases.push(`${rotuloVeiculo(c)} entra na frota: ${descricao}`);
  }
  for (const c of plano.novos.casas) {
    frases.push(`${rotulo('casa', c)} nova: lotação ${c.lotacao}, em ${nomeLocal(c.localId)}`);
  }
  for (const c of plano.novos.clientes)
    frases.push(`${rotulo('cliente', c)} novo: cor ${c.cor}, sigla ${c.sigla}`);
  for (const l of plano.novos.locais) frases.push(`${rotulo('local', l)} novo: ${l.morada}`);

  const ordem = new Map<EntidadeSincronizada, number>();
  for (const a of plano.alterados) {
    const semOrdem = a.mudancas.filter((m) => m.campo !== 'ordem');
    if (semOrdem.length < a.mudancas.length) ordem.set(a.entidade, (ordem.get(a.entidade) ?? 0) + 1);
    if (semOrdem.length > 0) frases.push(`${a.rotulo}: ${frasesDasMudancas(semOrdem, nomeLocal)}`);
  }
  if (ordem.size > 0) {
    const nomes: Record<EntidadeSincronizada, [string, string]> = {
      cliente: ['cliente', 'clientes'],
      local: ['local', 'locais'],
      casa: ['casa', 'casas'],
      carrinha: ['veículo', 'veículos'],
    };
    const partes = (['cliente', 'local', 'casa', 'carrinha'] as const)
      .filter((e) => ordem.has(e))
      .map((e) => plural(ordem.get(e) ?? 0, ...nomes[e]));
    frases.push(`Ordem atualizada como nos JSON: ${partes.join(', ')}`);
  }

  for (const l of plano.locaisSoNaBd) {
    frases.push(`${rotulo('local', l)} só existe na base de dados: fica (os locais nunca se apagam)`);
  }
  if (plano.problemasApagados.length > 0) {
    frases.push(
      `${plural(plano.problemasApagados.length, 'problema resolvido apagado', 'problemas resolvidos apagados')} ` +
        '(das casas e veículos que saem; ficam no histórico)',
    );
  }
  for (const m of plano.mantidos) {
    frases.push(
      `${m.rotulo}: ${nomeCampo(m.campo)} fica ${formatarValor(m.valorPrograma, nomeLocal, m.campo)} ` +
        `(mudado no programa; no JSON: ${formatarValor(m.valorJson, nomeLocal, m.campo)})`,
    );
  }
  for (const a of plano.apagadosNoPrograma)
    frases.push(`${a.rotulo} foi apagado no programa: não volta a entrar`);
  return frases;
}

export interface ContagemEntidade {
  novos: number;
  alterados: number;
  removidos: number;
}

export interface ContagensSincronizacao {
  clientes: ContagemEntidade;
  locais: ContagemEntidade;
  casas: ContagemEntidade;
  veiculos: ContagemEntidade;
  semTransporte: number;
  condutoresRetirados: number;
  dormidasRetiradas: number;
  /** M2: campos que ficaram com o valor do programa. */
  mantidos: number;
  /** M2: problemas resolvidos apagados (das casas e veículos que saem). */
  problemasApagados: number;
  erros: number;
}

export function contarPlano(plano: PlanoSincronizacao): ContagensSincronizacao {
  const alterados = (e: EntidadeSincronizada) => plano.alterados.filter((a) => a.entidade === e).length;
  return {
    clientes: {
      novos: plano.novos.clientes.length,
      alterados: alterados('cliente'),
      removidos: plano.removidos.clientes.length,
    },
    locais: { novos: plano.novos.locais.length, alterados: alterados('local'), removidos: 0 },
    casas: {
      novos: plano.novos.casas.length,
      alterados: alterados('casa'),
      removidos: plano.removidos.casas.length,
    },
    veiculos: {
      novos: plano.novos.carrinhas.length,
      alterados: alterados('carrinha'),
      removidos: plano.removidos.carrinhas.length,
    },
    semTransporte: plano.semTransporte.length,
    condutoresRetirados: plano.condutoresRetirados.length,
    dormidasRetiradas: plano.dormidasRetiradas.length,
    mantidos: plano.mantidos.length,
    problemasApagados: plano.problemasApagados.length,
    erros: plano.erros.length,
  };
}

/** Palavras de uma contagem, no singular e no plural. */
export interface PalavrasContagem {
  novos: [string, string];
  alterados: [string, string];
  saem: [string, string];
}

export const PALAVRAS: Readonly<Record<'veiculos' | 'clientes' | 'casas' | 'locais', PalavrasContagem>> = {
  veiculos: {
    novos: ['novo', 'novos'],
    alterados: ['atualizado', 'atualizados'],
    saem: ['sai da frota', 'saem da frota'],
  },
  clientes: { novos: ['novo', 'novos'], alterados: ['atualizado', 'atualizados'], saem: ['sai', 'saem'] },
  casas: { novos: ['nova', 'novas'], alterados: ['atualizada', 'atualizadas'], saem: ['sai', 'saem'] },
  locais: { novos: ['novo', 'novos'], alterados: ['atualizado', 'atualizados'], saem: ['sai', 'saem'] },
};

/** "1 novo, 20 atualizados, 3 saem" (só o que não é zero; "sem mudanças" se tudo for zero). */
export function textoContagem(c: ContagemEntidade, palavras: PalavrasContagem = PALAVRAS.clientes): string {
  const partes = [
    c.novos > 0 ? plural(c.novos, ...palavras.novos) : null,
    c.alterados > 0 ? plural(c.alterados, ...palavras.alterados) : null,
    c.removidos > 0 ? plural(c.removidos, ...palavras.saem) : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(', ') : 'sem mudanças';
}

/** Comentário do lote no histórico (um parágrafo curto, sem nomes de pessoas). */
export function resumoDoPlano(plano: PlanoSincronizacao): string {
  const n = contarPlano(plano);
  const grupos: [string, ContagemEntidade, PalavrasContagem][] = [
    ['Veículos', n.veiculos, PALAVRAS.veiculos],
    ['Clientes', n.clientes, PALAVRAS.clientes],
    ['Casas', n.casas, PALAVRAS.casas],
    ['Locais', n.locais, PALAVRAS.locais],
  ];
  const frases = ['Sincronização dos dados iniciais.'];
  for (const [nome, c, palavras] of grupos) {
    if (c.novos + c.alterados + c.removidos > 0) frases.push(`${nome}: ${textoContagem(c, palavras)}.`);
  }
  if (n.semTransporte > 0) {
    frases.push(`${plural(n.semTransporte, 'pessoa fica', 'pessoas ficam')} sem transporte (a confirmar).`);
  }
  if (n.condutoresRetirados > 0) {
    frases.push(`${plural(n.condutoresRetirados, 'condutor retirado', 'condutores retirados')}.`);
  }
  if (n.dormidasRetiradas > 0) {
    frases.push(
      `${plural(n.dormidasRetiradas, 'carrinha fica', 'carrinhas ficam')} com onde dorme por definir.`,
    );
  }
  if (n.problemasApagados > 0) {
    frases.push(
      `${plural(n.problemasApagados, 'problema resolvido apagado', 'problemas resolvidos apagados')}.`,
    );
  }
  if (n.mantidos > 0) {
    frases.push(`${plural(n.mantidos, 'campo ficou', 'campos ficaram')} com o valor do programa.`);
  }
  return frases.join(' ');
}

// --- Histórico ------------------------------------------------------------------------------------

/**
 * Frase do histórico para uma linha de uma sincronização (clientes, locais, casas e veículos), com os
 * nomes ATUAIS. Ex.: "CF 5001 — marca: — → Ford"; "MJ 9423 — modelo: Trafic (entrou)";
 * "ZZ 1001 — matrícula: ZZ 1001 (saiu)". null quando não é uma destas linhas (as das pessoas, do
 * condutor e de onde dorme descreve-as src/servidor/lotes.ts).
 */
export function descreverAlteracaoDosDados(
  estado: Pick<Estado, 'clientes' | 'locais' | 'casas' | 'carrinhas'>,
  a: LinhaAlteracaoSincronizacao,
): string | null {
  if (!Object.hasOwn(NOME_CAMPO, a.campo)) return null;
  let quem: string;
  if (a.entidade === 'carrinha') {
    quem = formatarMatricula(estado.carrinhas.find((c) => c.id === a.entidadeId)?.matricula ?? a.entidadeId);
  } else if (a.entidade === 'casa') {
    quem = estado.casas.find((c) => c.id === a.entidadeId)?.nome ?? a.entidadeId;
  } else if (a.entidade === 'cliente') {
    quem = estado.clientes.find((c) => c.id === a.entidadeId)?.nome ?? a.entidadeId;
  } else if (a.entidade === 'local') {
    quem = estado.locais.find((l) => l.id === a.entidadeId)?.nome ?? a.entidadeId;
  } else {
    return null;
  }
  const ler = (json: string | null): Valor => {
    if (json === null) return null;
    try {
      return JSON.parse(json) as Valor;
    } catch {
      return json;
    }
  };
  const nomeLocal = (id: Id) => estado.locais.find((l) => l.id === id)?.nome ?? id;
  const campo = nomeCampo(a.campo);
  const antes = formatarValor(ler(a.antes), nomeLocal, a.campo);
  const depois = formatarValor(ler(a.depois), nomeLocal, a.campo);
  if (a.antes === null) return `${quem} — ${campo}: ${depois} (entrou)`;
  if (a.depois === null) return `${quem} — ${campo}: ${antes} (saiu)`;
  return `${quem} — ${campo}: ${antes} → ${depois}`;
}
