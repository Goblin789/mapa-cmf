// Montagem das entidades a gravar a partir das linhas da lista mestra e dos dados iniciais.
// Regras em docs/decisoes.md. Função pura: não lê nem escreve ficheiros.

import {
  type Carrinha,
  type Casa,
  type Cliente,
  type Id,
  type Local,
  PAISES,
  type Pais,
  type Pessoa,
  TIPOS_LOCAL,
  type TipoLocal,
} from '../dominio/tipos';
import { chaveNome, garantirUnico, idPessoaBase, normalizarNumero } from './celulas';
import { criarProcuras, type Procuras } from './correspondencias';
import type {
  DadosIniciais,
  Entidades,
  ErroImportacao,
  LinhaLista,
  Normalizacao,
  Pendente,
  TipoNormalizacao,
} from './tipos';

export const RAIO_CASA_M = 150;
export const RAIO_ESTACIONAMENTO_M = 100;

export interface ResultadoMontagem {
  entidades: Entidades;
  erros: ErroImportacao[];
  normalizacoes: Normalizacao[];
  pendentes: Pendente[];
  /** Linhas da folha "Não estão na lista" que entraram. */
  extrasIncluidos: LinhaLista[];
  /** Linhas da folha "Não estão na lista" que ficaram de fora por decisão. */
  extrasExcluidos: LinhaLista[];
}

/** Junta as normalizações iguais e conta as pessoas afetadas. */
class Normalizacoes {
  private readonly porChave = new Map<string, Normalizacao>();

  registar(tipo: TipoNormalizacao, de: string, para: string, nota: string | null = null): void {
    const chave = `${tipo}\u0000${de}\u0000${para}`;
    const existente = this.porChave.get(chave);
    if (existente) {
      existente.pessoas++;
      existente.nota = null;
    } else {
      this.porChave.set(chave, { tipo, de, para, pessoas: 1, nota });
    }
  }

  lista(): Normalizacao[] {
    return [...this.porChave.values()];
  }
}

function verificarUnicos<T>(lista: T[], campo: (x: T) => string, rotulo: string, erros: ErroImportacao[]) {
  const vistos = new Set<string>();
  for (const x of lista) {
    const v = campo(x);
    if (vistos.has(v))
      erros.push({ bloqueante: true, mensagem: `${rotulo} repetido: "${v}".`, onde: 'dados-iniciais' });
    vistos.add(v);
  }
}

function montarClientes(dados: DadosIniciais, erros: ErroImportacao[]): Cliente[] {
  verificarUnicos(dados.clientes, (c) => c.id, 'Id de cliente', erros);
  verificarUnicos(dados.clientes, (c) => c.cor.toLowerCase(), 'Cor de cliente', erros);
  verificarUnicos(dados.clientes, (c) => c.sigla, 'Sigla de cliente', erros);
  return dados.clientes.map((c, i) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    sigla: c.sigla,
    interno: c.interno,
    ordem: i,
  }));
}

function montarLocais(dados: DadosIniciais, erros: ErroImportacao[]): Local[] {
  verificarUnicos(dados.locais, (l) => l.id, 'Id de local', erros);
  const locais: Local[] = [];
  for (const l of dados.locais) {
    const onde = `dados-iniciais/locais.json (${l.id})`;
    if (!(TIPOS_LOCAL as readonly string[]).includes(l.tipo)) {
      erros.push({ bloqueante: true, mensagem: `Tipo de local desconhecido "${l.tipo}".`, onde });
      continue;
    }
    if (!(PAISES as readonly string[]).includes(l.pais)) {
      erros.push({ bloqueante: true, mensagem: `País desconhecido "${l.pais}".`, onde });
      continue;
    }
    if (l.lat === null || l.lng === null) {
      erros.push({
        bloqueante: true,
        mensagem: `Local "${l.nome}" sem coordenadas: correr "npm run geocodificar".`,
        onde,
      });
    }
    locais.push({
      id: l.id,
      tipo: l.tipo as TipoLocal,
      nome: l.nome,
      morada: l.morada,
      pais: l.pais as Pais,
      lat: l.lat,
      lng: l.lng,
      raioM: l.tipo === 'estacionamento' ? RAIO_ESTACIONAMENTO_M : RAIO_CASA_M,
    });
  }
  return locais;
}

function montarCasas(dados: DadosIniciais, locais: Local[], erros: ErroImportacao[]): Casa[] {
  verificarUnicos(dados.casas, (c) => c.id, 'Id de casa', erros);
  verificarUnicos(dados.casas, (c) => c.nome, 'Nome de casa', erros);
  const idsLocais = new Set(locais.map((l) => l.id));
  return dados.casas.map((c, i) => {
    if (!idsLocais.has(c.localId)) {
      erros.push({
        bloqueante: true,
        mensagem: `A casa "${c.nome}" aponta para um local que não existe ("${c.localId}").`,
        onde: 'dados-iniciais/casas.json',
      });
    }
    return {
      id: c.id,
      nome: c.nome,
      localId: c.localId,
      apartamento: c.apartamento,
      lotacao: c.lotacao,
      maxContrato: c.maxContrato,
      tolerado: c.tolerado,
      notaContrato: c.notaContrato,
      senhorio: null,
      equipamento: null,
      ordem: i,
    };
  });
}

function montarCarrinhas(dados: DadosIniciais, erros: ErroImportacao[]): Carrinha[] {
  verificarUnicos(dados.carrinhas, (c) => c.id, 'Id de carrinha', erros);
  verificarUnicos(
    dados.carrinhas.flatMap((c) => [c.matricula, ...c.matriculasAlternativas]),
    (m) => m,
    'Matrícula',
    erros,
  );
  return dados.carrinhas.map((c, i) => ({
    id: c.id,
    matricula: c.matricula,
    matriculasAlternativas: [...c.matriculasAlternativas],
    modelo: c.modelo,
    lugares: c.lugares,
    dormeCasaId: null,
    dormeLocalId: null,
    temporaria: false,
    nota: c.nota,
    ordem: i,
  }));
}

/** Separa as linhas da folha "Não estão na lista" entre as que entram e as que ficam de fora. */
export function separarExtras(
  extras: LinhaLista[],
  aIncluir: string[],
): { incluidos: LinhaLista[]; excluidos: LinhaLista[]; emFalta: string[] } {
  const chaves = new Set(aIncluir.map(chaveNome));
  const incluidos = extras.filter((l) => chaves.has(chaveNome(l.nomeCurto)));
  const encontrados = new Set(incluidos.map((l) => chaveNome(l.nomeCurto)));
  return {
    incluidos,
    excluidos: extras.filter((l) => !chaves.has(chaveNome(l.nomeCurto))),
    emFalta: aIncluir.filter((n) => !encontrados.has(chaveNome(n))),
  };
}

interface Contexto {
  dados: DadosIniciais;
  procuras: Procuras;
  erros: ErroImportacao[];
  normalizacoes: Normalizacoes;
  alternativos: Map<string, string[]>;
}

type PessoaSemId = Omit<Pessoa, 'id'>;

function montarPessoa(l: LinhaLista, ctx: Contexto): { pessoa: PessoaSemId; motivos: string[] } | null {
  const { procuras, erros, normalizacoes, dados } = ctx;
  const onde = `${l.folha}, linha ${l.linha}`;
  const motivos: string[] = [];
  const fora = dados.importacao.valoresEspeciais.foraDasCasas;
  const sem = dados.importacao.valoresEspeciais.semTransporte;

  // Cliente: obrigatório e conhecido; sem isto não há pessoa.
  if (!l.cliente) {
    erros.push({ bloqueante: true, mensagem: `${l.nomeCurto}: sem cliente.`, onde });
    return null;
  }
  const cliente = procuras.cliente(l.cliente);
  if (!cliente) {
    erros.push({ bloqueante: true, mensagem: `${l.nomeCurto}: cliente desconhecido "${l.cliente}".`, onde });
    return null;
  }
  const clienteInicial = dados.clientes.find((c) => c.id === cliente.id);
  if (clienteInicial && l.cliente !== clienteInicial.nomeExcel && l.cliente !== clienteInicial.nome) {
    normalizacoes.registar('cliente', l.cliente, clienteInicial.nome);
  }

  // Casa: vazia ou desconhecida → sem casa e "a confirmar".
  let casaId: Id | null = null;
  let casaAConfirmar = false;
  if (!l.casa) {
    casaAConfirmar = true;
    motivos.push(`Casa vazia na lista: fica em "${fora}".`);
  } else if (!procuras.eForaDasCasas(l.casa)) {
    const casa = procuras.casa(l.casa);
    const casaInicial = casa ? dados.casas.find((c) => c.id === casa.id) : undefined;
    if (casaInicial) {
      casaId = casaInicial.id;
      if (l.casa !== casaInicial.nome) normalizacoes.registar('casa', l.casa, casaInicial.nome);
    } else {
      casaAConfirmar = true;
      motivos.push(`Casa desconhecida "${l.casa}": fica em "${fora}".`);
      erros.push({ bloqueante: false, mensagem: `${l.nomeCurto}: casa desconhecida "${l.casa}".`, onde });
    }
  }

  // Carrinha: vazia ou desconhecida → sem transporte e "a confirmar".
  let carrinhaId: Id | null = null;
  let carrinhaAConfirmar = false;
  if (!l.carrinha) {
    carrinhaAConfirmar = true;
    motivos.push(`Carrinha vazia na lista: fica em "${sem}".`);
  } else if (!procuras.eSemTransporte(l.carrinha)) {
    const c = procuras.carrinha(l.carrinha);
    const carrinhaInicial = c ? dados.carrinhas.find((x) => x.id === c.id) : undefined;
    if (carrinhaInicial) {
      carrinhaId = carrinhaInicial.id;
      if (l.carrinha !== carrinhaInicial.matricula) {
        normalizacoes.registar('carrinha', l.carrinha, carrinhaInicial.matricula);
      }
    } else {
      carrinhaAConfirmar = true;
      motivos.push(`Matrícula desconhecida "${l.carrinha}": fica em "${sem}".`);
      erros.push({
        bloqueante: false,
        mensagem: `${l.nomeCurto}: matrícula desconhecida "${l.carrinha}".`,
        onde,
      });
    }
  }

  const numero = normalizarNumero(l.numero);
  if (l.numero !== null && numero !== null && numero !== l.numero) {
    normalizacoes.registar('numero', l.numero, numero, l.nomeCurto);
  }

  const nomesAlternativos = ctx.alternativos.get(chaveNome(l.nomeCurto)) ?? [];
  if (nomesAlternativos.length > 0) {
    normalizacoes.registar('nomeAlternativo', l.nomeCurto, nomesAlternativos.join(', '));
  }

  return {
    pessoa: {
      numero,
      numeroOriginal: l.numero,
      apelidos: l.apelidos,
      nome: l.nome,
      nomeCurto: l.nomeCurto,
      nomesAlternativos: [...nomesAlternativos],
      clienteId: cliente.id,
      obraId: null,
      casaId,
      carrinhaId,
      casaAConfirmar,
      carrinhaAConfirmar,
      telefone: null,
      temCarta: null,
      cartaValidade: null,
      ativa: true,
    },
    motivos,
  };
}

/** Erros bloqueantes para valores repetidos (Nº normalizado, nome curto). */
function verificarRepetidos(
  pessoas: { pessoa: PessoaSemId; linha: LinhaLista }[],
  chave: (p: PessoaSemId) => string | null,
  rotulo: string,
  erros: ErroImportacao[],
) {
  const grupos = new Map<string, LinhaLista[]>();
  for (const { pessoa, linha } of pessoas) {
    const k = chave(pessoa);
    if (k === null) continue;
    grupos.set(k, [...(grupos.get(k) ?? []), linha]);
  }
  for (const linhas of grupos.values()) {
    if (linhas.length < 2) continue;
    erros.push({
      bloqueante: true,
      mensagem: `${rotulo} repetido: ${linhas.map((l) => `"${l.nomeCurto}"`).join(', ')}.`,
      onde: linhas.map((l) => `${l.folha}, linha ${l.linha}`).join('; '),
    });
  }
}

export function montarEntidades(
  pessoal: LinhaLista[],
  extras: LinhaLista[],
  dados: DadosIniciais,
): ResultadoMontagem {
  const erros: ErroImportacao[] = [];
  const normalizacoes = new Normalizacoes();

  const clientes = montarClientes(dados, erros);
  const locais = montarLocais(dados, erros);
  const casas = montarCasas(dados, locais, erros);
  const carrinhas = montarCarrinhas(dados, erros);

  const { incluidos, excluidos, emFalta } = separarExtras(extras, dados.importacao.extrasAIncluir);
  for (const nome of emFalta) {
    erros.push({
      bloqueante: false,
      mensagem: `"${nome}" está em extrasAIncluir mas não aparece na folha "${dados.importacao.folhaExtra}".`,
      onde: 'dados-iniciais/importacao.json',
    });
  }

  const alternativos = new Map(
    Object.entries(dados.importacao.nomesAlternativos).map(([k, v]) => [chaveNome(k), v] as const),
  );
  const ctx: Contexto = { dados, procuras: criarProcuras(dados), erros, normalizacoes, alternativos };

  const montadas: { pessoa: PessoaSemId; motivos: string[]; linha: LinhaLista }[] = [];
  for (const linha of [...pessoal, ...incluidos]) {
    const r = montarPessoa(linha, ctx);
    if (r) montadas.push({ ...r, linha });
  }
  // Só contam como incluídos os extras que deram uma pessoa (sem cliente válido não entram).
  const linhasMontadas = new Set(montadas.map((m) => m.linha));
  const extrasIncluidos = incluidos.filter((l) => linhasMontadas.has(l));

  const chavesNomes = new Set(montadas.map((m) => chaveNome(m.pessoa.nomeCurto)));
  for (const nome of Object.keys(dados.importacao.nomesAlternativos)) {
    if (!chavesNomes.has(chaveNome(nome))) {
      erros.push({
        bloqueante: false,
        mensagem: `nomesAlternativos: "${nome}" não corresponde a ninguém da lista.`,
        onde: 'dados-iniciais/importacao.json',
      });
    }
  }

  verificarRepetidos(montadas, (p) => p.numero, 'Nº', erros);
  verificarRepetidos(montadas, (p) => chaveNome(p.nomeCurto), 'Nome curto', erros);

  // Ids: quando duas pessoas dão a mesma base (ex.: "Ana-Rita" e "Ana Rita"), o "-2" não pode depender
  // da ordem das linhas no Excel; atribuem-se por uma ordem fixa (base, Nº, nome curto).
  const comId = montadas.map((m) => ({
    ...m,
    base: idPessoaBase(m.pessoa.numero, m.pessoa.nomeCurto),
    id: '',
  }));
  const usados = new Set<string>();
  const texto = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  const ordemFixa = [...comId].sort(
    (a, b) =>
      texto(a.base, b.base) ||
      texto(a.pessoa.numero ?? '', b.pessoa.numero ?? '') ||
      texto(a.pessoa.nomeCurto, b.pessoa.nomeCurto),
  );
  for (const x of ordemFixa) x.id = garantirUnico(x.base, usados);

  const pessoas: Pessoa[] = [];
  const pendentes: Pendente[] = [];
  for (const m of comId) {
    pessoas.push({ id: m.id, ...m.pessoa });
    if (m.motivos.length > 0) {
      pendentes.push({
        pessoaId: m.id,
        nomeCurto: m.pessoa.nomeCurto,
        motivos: m.motivos,
        observacoes: m.linha.observacoes,
      });
    }
  }

  return {
    entidades: { clientes, locais, casas, carrinhas, obras: [], pessoas },
    erros,
    normalizacoes: normalizacoes.lista(),
    pendentes,
    extrasIncluidos,
    extrasExcluidos: excluidos,
  };
}
