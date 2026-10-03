// Cruzamento da lista mestra com o ficheiro do Michael: contagens por casa, carrinha e cliente,
// e diferenças pessoa a pessoa. Os nomes casam sem acentos/maiúsculas e através de aliasesMichael.

import { indexar } from '../dominio/indices';
import type { Id, Pessoa } from '../dominio/tipos';
import { chaveNome } from './celulas';
import { criarProcuras, type Procuras } from './correspondencias';
import type {
  CampoComparado,
  DadosIniciais,
  DadosMichael,
  DiferencaPessoa,
  Discrepancias,
  Entidades,
  GrupoMichael,
  LinhaContagem,
  LinhaLista,
  SemCasaMichael,
  SoNoMichael,
} from './tipos';

// Valores especiais nas ocorrências do Michael (os outros são ids ou "?:" + cabeçalho desconhecido).
const FORA = '__fora__';
const SALMAO = '__salmao__';
const SEM = '__sem__';
const DESCONHECIDO = '?:';

const colator = new Intl.Collator('pt', { sensitivity: 'base' });

interface Ocorrencias {
  /** Nomes tal como o Michael os escreveu. */
  nomes: string[];
  casa: string[];
  carrinha: string[];
  cliente: string[];
  onde: string[];
}

function novaOcorrencia(): Ocorrencias {
  return { nomes: [], casa: [], carrinha: [], cliente: [], onde: [] };
}

interface Resolucao {
  /** Id da pessoa da lista, ou a chave do nome se não estiver na lista. */
  chave: string;
  pessoa: Pessoa | null;
  /** Casou por um alias ou nome alternativo (não pelo nome curto). */
  porAlias: boolean;
}

function criarResolvedor(pessoas: Pessoa[], aliases: Record<string, string>): (nome: string) => Resolucao {
  const porNomeCurto = new Map<string, Pessoa>();
  const porAlternativo = new Map<string, Pessoa>();
  for (const p of pessoas) porNomeCurto.set(chaveNome(p.nomeCurto), p);
  for (const p of pessoas) for (const n of p.nomesAlternativos) porAlternativo.set(chaveNome(n), p);
  const aliasPorChave = new Map(
    Object.entries(aliases).map(([de, para]) => [chaveNome(de), chaveNome(para)]),
  );

  return (nome) => {
    let k = chaveNome(nome);
    let porAlias = false;
    const alvo = aliasPorChave.get(k);
    if (alvo && alvo !== k) {
      k = alvo;
      porAlias = true;
    }
    let pessoa = porNomeCurto.get(k) ?? null;
    if (!pessoa) {
      pessoa = porAlternativo.get(k) ?? null;
      if (pessoa) porAlias = true;
    }
    return { chave: pessoa ? pessoa.id : k, pessoa, porAlias };
  };
}

/** Distância de edição (Levenshtein) entre duas cadeias. */
export function distancia(a: string, b: string): number {
  let anterior = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1;
      atual[j] = Math.min((anterior[j] ?? 0) + 1, (atual[j - 1] ?? 0) + 1, (anterior[j - 1] ?? 0) + custo);
    }
    anterior = atual;
  }
  return anterior[b.length] ?? 0;
}

/** Nome curto da lista mais parecido (até 2 letras de diferença), para sugerir um alias. */
function maisParecido(nome: string, pessoas: Pessoa[]): string | null {
  const k = chaveNome(nome);
  let melhor: { nome: string; d: number } | null = null;
  for (const p of pessoas) {
    const d = distancia(k, chaveNome(p.nomeCurto));
    if (d <= 2 && (!melhor || d < melhor.d)) melhor = { nome: p.nomeCurto, d };
  }
  return melhor?.nome ?? null;
}

function contar<T>(lista: T[], chave: (x: T) => Id): Map<Id, number> {
  const m = new Map<Id, number>();
  for (const x of lista) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1);
  return m;
}

/** Linhas de contagem: uma por entidade (pela ordem dos dados iniciais) + cabeçalhos do Michael desconhecidos. */
function linhasContagem(
  entidades: { id: Id; rotulo: string; capacidade: number | null; documento: number | null }[],
  lista: Map<Id, number>,
  grupos: GrupoMichael[] | null,
  procurar: (rotulo: string) => Id | null,
): LinhaContagem[] {
  const porId = new Map<Id, GrupoMichael>();
  const desconhecidos: GrupoMichael[] = [];
  for (const g of grupos ?? []) {
    const id = procurar(g.rotulo);
    if (id && !porId.has(id)) porId.set(id, g);
    else desconhecidos.push(g);
  }
  return [
    ...entidades.map((e) => {
      const g = porId.get(e.id);
      return {
        ...e,
        lista: lista.get(e.id) ?? 0,
        michael: grupos ? (g?.nomes.length ?? 0) : null,
        michaelDeclarado: g?.contagem ?? null,
      };
    }),
    ...desconhecidos.map((g) => ({
      id: null,
      rotulo: `${g.rotulo} (só no Michael, ${g.celula})`,
      capacidade: null,
      documento: null,
      lista: 0,
      michael: g.nomes.length,
      michaelDeclarado: g.contagem,
    })),
  ];
}

function linhaEspecial(
  rotulo: string,
  lista: number,
  grupo: GrupoMichael | null,
  folha: boolean,
): LinhaContagem {
  return {
    id: null,
    rotulo,
    capacidade: null,
    documento: null,
    lista,
    michael: folha ? (grupo?.nomes.length ?? 0) : null,
    michaelDeclarado: grupo?.contagem ?? null,
  };
}

export function compararComMichael(
  entidades: Entidades,
  dados: DadosIniciais,
  michael: DadosMichael | null,
  extrasExcluidos: LinhaLista[] = [],
): Discrepancias {
  const ind = indexar({ versao: 0, geradoEm: '', ...entidades });
  const procuras: Procuras = criarProcuras(dados);
  const { foraDasCasas, semTransporte } = dados.importacao.valoresEspeciais;
  const ativas = entidades.pessoas.filter((p) => p.ativa);
  const folhas = michael?.folhas ?? { casas: null, empresas: null, viaturas: null };

  // --- Contagens ---
  const contagensCasas = [
    ...linhasContagem(
      dados.casas.map((c) => ({
        id: c.id,
        rotulo: c.nome,
        capacidade: c.lotacao,
        documento: c.moradoresDoc,
      })),
      new Map([...ind.moradores].map(([id, ps]) => [id, ps.length])),
      folhas.casas ? (michael?.casas ?? []) : null,
      (r) => procuras.casa(r)?.id ?? null,
    ),
    linhaEspecial(
      foraDasCasas,
      ind.foraDasCasas.length,
      michael?.foraDasCasas ?? null,
      folhas.casas !== null,
    ),
  ];
  const contagensCarrinhas = [
    ...linhasContagem(
      dados.carrinhas.map((c) => ({
        id: c.id,
        rotulo: c.matricula,
        capacidade: c.lugares,
        documento: c.pessoasDoc,
      })),
      new Map([...ind.passageiros].map(([id, ps]) => [id, ps.length])),
      folhas.viaturas ? (michael?.viaturas ?? []) : null,
      (r) => procuras.carrinha(r)?.id ?? null,
    ),
    linhaEspecial(
      semTransporte,
      ind.semTransporte.length,
      michael?.semTransporte ?? null,
      folhas.viaturas !== null,
    ),
  ];
  const contagensClientes = linhasContagem(
    dados.clientes.map((c) => ({ id: c.id, rotulo: c.nome, capacidade: null, documento: c.pessoasDoc })),
    contar(ativas, (p) => p.clienteId),
    folhas.empresas ? (michael?.empresas ?? []) : null,
    (r) => procuras.cliente(r)?.id ?? null,
  );

  const vazio: Discrepancias = {
    michaelDisponivel: false,
    contagensCasas,
    contagensCarrinhas,
    contagensClientes,
    diferencas: [],
    soNoMichael: [],
    soNaLista: [],
    repetidosNoMichael: [],
    semCasaMichael: [],
    aliasesUsados: [],
  };
  if (!michael || (!folhas.casas && !folhas.empresas && !folhas.viaturas)) return vazio;

  // --- Ocorrências de cada nome nas folhas do Michael ---
  const resolver = criarResolvedor(ativas, dados.importacao.aliasesMichael);
  const ocorrencias = new Map<string, Ocorrencias>();
  const aliasesUsados = new Map<string, { nomeMichael: string; nomeCurto: string }>();

  const registar = (
    grupos: GrupoMichael[],
    campo: CampoComparado,
    folha: string,
    valor: (g: GrupoMichael) => string,
  ) => {
    for (const g of grupos) {
      for (const nome of g.nomes) {
        const r = resolver(nome);
        const o = ocorrencias.get(r.chave) ?? novaOcorrencia();
        ocorrencias.set(r.chave, o);
        if (!o.nomes.includes(nome)) o.nomes.push(nome);
        o[campo].push(valor(g));
        o.onde.push(`${folha} › ${g.rotulo}`);
        if (r.porAlias && r.pessoa)
          aliasesUsados.set(nome, { nomeMichael: nome, nomeCurto: r.pessoa.nomeCurto });
      }
    }
  };
  const semNulos = (gs: (GrupoMichael | null)[]) => gs.filter((g) => g !== null);

  if (folhas.casas) {
    registar(
      michael.casas,
      'casa',
      folhas.casas,
      (g) => procuras.casa(g.rotulo)?.id ?? DESCONHECIDO + g.rotulo,
    );
    registar(semNulos([michael.foraDasCasas]), 'casa', folhas.casas, () => FORA);
    registar(semNulos([michael.semCasa]), 'casa', folhas.casas, () => SALMAO);
  }
  if (folhas.empresas) {
    registar(
      michael.empresas,
      'cliente',
      folhas.empresas,
      (g) => procuras.cliente(g.rotulo)?.id ?? DESCONHECIDO + g.rotulo,
    );
  }
  if (folhas.viaturas) {
    registar(
      michael.viaturas,
      'carrinha',
      folhas.viaturas,
      (g) => procuras.carrinha(g.rotulo)?.id ?? DESCONHECIDO + g.rotulo,
    );
    registar(semNulos([michael.semTransporte]), 'carrinha', folhas.viaturas, () => SEM);
  }

  // --- Rótulos legíveis ---
  const rotuloMichael = (valores: string[], campo: CampoComparado): string => {
    if (valores.length === 0) return '— (não aparece nesta folha)';
    return valores
      .map((v) => {
        if (v === FORA) return foraDasCasas;
        if (v === SALMAO) return 'Sem casa (lista à parte, a salmão)';
        if (v === SEM) return semTransporte;
        if (v.startsWith(DESCONHECIDO)) return `"${v.slice(DESCONHECIDO.length)}" (desconhecido)`;
        if (campo === 'casa') return ind.casas.get(v)?.nome ?? v;
        if (campo === 'carrinha') return ind.carrinhas.get(v)?.matricula ?? v;
        return ind.clientes.get(v)?.nome ?? v;
      })
      .join(' + ');
  };
  const rotuloLista = (p: Pessoa, campo: CampoComparado): string => {
    if (campo === 'casa') {
      const nome = p.casaId ? (ind.casas.get(p.casaId)?.nome ?? p.casaId) : foraDasCasas;
      return p.casaAConfirmar ? `${nome} (a confirmar)` : nome;
    }
    if (campo === 'carrinha') {
      const nome = p.carrinhaId
        ? (ind.carrinhas.get(p.carrinhaId)?.matricula ?? p.carrinhaId)
        : semTransporte;
      return p.carrinhaAConfirmar ? `${nome} (a confirmar)` : nome;
    }
    return ind.clientes.get(p.clienteId)?.nome ?? p.clienteId;
  };
  const valorLista = (p: Pessoa, campo: CampoComparado): string => {
    if (campo === 'casa') return p.casaId ?? FORA;
    if (campo === 'carrinha') return p.carrinhaId ?? SEM;
    return p.clienteId;
  };
  const iguais = (lista: string, michaelVals: string[]): boolean =>
    michaelVals.length === 1 && (michaelVals[0] === lista || (lista === FORA && michaelVals[0] === SALMAO));

  // --- Diferenças por pessoa ---
  const campos: { campo: CampoComparado; folha: string | null }[] = [
    { campo: 'casa', folha: folhas.casas },
    { campo: 'carrinha', folha: folhas.viaturas },
    { campo: 'cliente', folha: folhas.empresas },
  ];
  const diferencas: DiferencaPessoa[] = [];
  const soNaLista: Discrepancias['soNaLista'] = [];
  for (const p of ativas) {
    const o = ocorrencias.get(p.id);
    if (!o) {
      soNaLista.push({ pessoaId: p.id, nomeCurto: p.nomeCurto });
      continue;
    }
    for (const { campo, folha } of campos) {
      if (!folha || iguais(valorLista(p, campo), o[campo])) continue;
      diferencas.push({
        pessoaId: p.id,
        nomeCurto: p.nomeCurto,
        campo,
        lista: rotuloLista(p, campo),
        michael: rotuloMichael(o[campo], campo),
      });
    }
  }

  // --- Nomes repetidos numa mesma folha do Michael ---
  const repetidosNoMichael: Discrepancias['repetidosNoMichael'] = [];
  for (const o of ocorrencias.values()) {
    for (const { campo, folha } of campos) {
      if (folha && o[campo].length > 1) {
        repetidosNoMichael.push({
          nomeMichael: o.nomes.join(' / '),
          folha,
          onde: o.onde.filter((x) => x.startsWith(`${folha} ›`)),
        });
      }
    }
  }

  // --- Só no Michael ---
  const idsPessoas = new Set(ativas.map((p) => p.id));
  const chavesExtras = new Set(extrasExcluidos.map((l) => chaveNome(l.nomeCurto)));
  const soNoMichael: SoNoMichael[] = [...ocorrencias]
    .filter(([chave]) => !idsPessoas.has(chave))
    .map(([chave, o]) => {
      const naFolhaExtra = chavesExtras.has(chave) || o.nomes.some((n) => chavesExtras.has(chaveNome(n)));
      return {
        nomeMichael: o.nomes.join(' / '),
        onde: o.onde,
        naFolhaExtra,
        parecido: naFolhaExtra ? null : (o.nomes.map((n) => maisParecido(n, ativas)).find(Boolean) ?? null),
      };
    });

  // --- Lista a salmão ---
  const semCasaMichael: SemCasaMichael[] = (michael.semCasa?.nomes ?? []).map((nome) => {
    const { pessoa } = resolver(nome);
    return {
      nomeMichael: nome,
      pessoaId: pessoa?.id ?? null,
      nomeCurto: pessoa?.nomeCurto ?? null,
      casaLista: pessoa ? rotuloLista(pessoa, 'casa') : null,
    };
  });

  const ordemCampo: Record<CampoComparado, number> = { casa: 0, carrinha: 1, cliente: 2 };
  return {
    ...vazio,
    michaelDisponivel: true,
    diferencas: diferencas.sort(
      (a, b) => colator.compare(a.nomeCurto, b.nomeCurto) || ordemCampo[a.campo] - ordemCampo[b.campo],
    ),
    soNoMichael: soNoMichael.sort((a, b) => colator.compare(a.nomeMichael, b.nomeMichael)),
    soNaLista: soNaLista.sort((a, b) => colator.compare(a.nomeCurto, b.nomeCurto)),
    repetidosNoMichael,
    semCasaMichael,
    aliasesUsados: [...aliasesUsados.values()].sort((a, b) => colator.compare(a.nomeMichael, b.nomeMichael)),
  };
}
