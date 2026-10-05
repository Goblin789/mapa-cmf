// Vista Quadro: as casas, as carrinhas ou as obras em blocos, como as folhas do Michael — um bloco por casa,
// carrinha ou obra, com a lotação (ou o nº de pessoas) no cabeçalho e os nomes por baixo. Funções puras:
// agrupar e ordenar.
//
// Agrupamento das casas e das carrinhas:
// - por país (França, Luxemburgo…), pela ordem das casas (a do Michael: Himeling primeiro);
// - locais vizinhos (a menos de 500 m, como no mapa: as duas ruas de Himeling) formam uma zona com as
//   partes lado a lado, a de oeste à esquerda (Himeling: Forêt à esquerda, Grotte à direita);
// - nas casas, uma morada com várias casas fica junta, com o nome da morada por cima;
// - os outros locais vão todos para a mesma grelha do país (para caber tudo num ecrã);
// - no fim, "Fora das casas CMF" ou "Sem transporte da empresa" (bloco largo, nomes por cliente)
//   e, nas carrinhas, as que ainda não têm onde dormir.
// Uma carrinha conta onde dorme (definido ou, sem isso, a sugestão: a casa da maioria dos passageiros).
// Casas e carrinhas desenham os lugares livres até à lotação, com o mesmo aspeto. M2: a lotação da carrinha
// não conta quem está indisponível hoje (ocupacaoDaCarrinha: o lugar fica livre), mas as caixas desenhadas são
// as do cartão do Mapa (quem está indisponível continua na sua).
// Obras (pedido do Rafael, 04/10/2026: "Obras" ao lado de Casas e Carrinhas): uma secção por cliente (pela
// ordem dos clientes), um bloco por obra (pelo nome; sem lotação, a pastilha é o nº de pessoas) e, no fim,
// "Sem obra" (bloco largo, nomes por cliente). Quem tem uma obra que não se conhece conta como sem obra. Nos
// blocos das obras os nomes vêm pela casa de onde vem cada um, que se lê em letra pequena por baixo (deOnde;
// no "Sem obra", que hoje tem toda a gente, não, para não encher o Quadro).
//
// Filtro do Quadro (clientes e obras, vários de cada; ver FiltroQuadro): ficam SÓ as pessoas que passam.
// Os blocos continuam todos lá, com a lotação real (não filtrada: é para lá que se larga no modo de
// edição); os que não têm ninguém do filtro ficam recolhidos (só o título e a pastilha).

import { clienteEfetivoId } from '../../dominio/cores';
import type { Dormida } from '../../dominio/dormidas';
import { compararPessoas, type Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import { type NivelLotacao, ocupacaoDaCarrinha, ocupacaoDaCasa } from '../../dominio/ocupacao';
import type { Carrinha, Casa, Cliente, Estado, Id, Local, Obra, Pais, Pessoa } from '../../dominio/tipos';
import { GRUPO_ESPECIAIS, type OpcaoFiltro, passaFiltro } from '../comum/escolhaMultipla';
import {
  condutorPrimeiro,
  ordenarPorClienteENome,
  ROTULO_CLIENTE_DESCONHECIDO,
  ROTULO_SEM_OBRA_SECCAO,
} from '../lista/seccoes';
import { DISTANCIA_VIZINHOS_M, distanciaMetros } from '../mapa/layout/disposicao';
import { nomeJunto } from '../mapa/layout/textos';
import { agruparPorCliente } from '../paineis/agrupar';
import { semCondutor } from '../paineis/condutor';
import { carrinhasQueDormemEm } from '../paineis/fichas';
import {
  ROTULO_FORA_DAS_CASAS,
  ROTULO_SEM_TRANSPORTE,
  ROTULO_TIPO_VEICULO,
  textoDormida,
  textoMarcaModelo,
} from '../paineis/textos';
import type { Agrupamento } from './vista';

export const NOME_PAIS: Record<Pais, string> = {
  LU: 'Luxemburgo',
  FR: 'França',
  BE: 'Bélgica',
  DE: 'Alemanha',
};

export const ROTULO_DORME_POR_DEFINIR = 'Onde dorme: por definir';

export interface LotacaoBloco {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
}

/** O que liga o bloco ao resto: numa casa, as carrinhas que lá dormem; numa carrinha, onde dorme. */
export interface LigacaoQuadro {
  tipo: 'casa' | 'carrinha' | 'local' | 'por-definir';
  /** Casa ou carrinha do outro lado (null num local que não é casa ou por definir). */
  id: Id | null;
  rotulo: string;
  /** Onde dorme ainda não foi definido: é a sugestão (a casa onde moram mais passageiros). */
  sugerida: boolean;
}

export interface ParcelaClienteQuadro {
  clienteId: Id;
  cliente: Cliente | null;
  n: number;
}

export type TipoBlocoQuadro = 'casa' | 'carrinha' | 'fora' | 'sem-transporte' | 'obra' | 'sem-obra';

export interface BlocoQuadro {
  /** "casa:<id>", "carrinha:<id>", "obra:<id>", "fora", "sem-transporte", "sem-obra" (= chaveAlvo). */
  chave: string;
  tipo: TipoBlocoQuadro;
  id: Id | null;
  /** Nome da casa ou da obra, matrícula formatada ("CF 5001") ou o rótulo do grupo. */
  titulo: string;
  /**
   * Carrinha: "Ford Transit Custom" (num carro, "Carro · Volvo V40"). Obra: a morada do local (sem morada, o
   * nome do local, quando não é o da obra).
   */
  detalhe: string | null;
  /**
   * Nas casas pelo cliente e pelo nome (as cores juntas, como no Excel); nas carrinhas o condutor primeiro;
   * nas obras pela casa de onde vêm (a ordem das casas; fora das casas no fim) e pelo nome.
   */
  pessoas: Pessoa[];
  /**
   * Nos blocos das obras: a casa de onde vem cada pessoa (pessoa → "Casa 2" ou "Fora das casas CMF"), em
   * letra pequena por baixo do nome. null nos outros blocos (também no "Sem obra").
   */
  deOnde: ReadonlyMap<Id, string> | null;
  /** Null nas obras e nos grupos sem lugares (fora das casas, sem transporte, sem obra). */
  lotacao: LotacaoBloco | null;
  /**
   * Lugares livres a desenhar ("livre"), até à lotação: nas casas (nas que contam como cheias, nenhum)
   * e nas carrinhas. Com gente a mais, nenhum (a pastilha já está a vermelho). 0 nos blocos largos.
   */
  vazios: number;
  ligacoes: LigacaoQuadro[];
  /** Carrinha com passageiros e ninguém a conduzir. */
  semCondutor: boolean;
  /** Bloco largo (fora das casas, sem transporte, sem obra): ocupa a linha toda, com a divisão por cliente. */
  largo: boolean;
  porCliente: ParcelaClienteQuadro[];
  /** Pessoas do bloco que o filtro esconde (0 sem filtro). */
  escondidas: number;
  /** Com o filtro ligado, ninguém do bloco passa: mostra-se só o título e a pastilha. */
  recolhido: boolean;
}

/** Partes lado a lado (locais vizinhos, de oeste para leste) ou uma só parte (grelha do país). */
export interface ParteQuadro {
  chave: string;
  /** "Rue de la Forêt"; null na grelha do país. */
  titulo: string | null;
  blocos: BlocoQuadro[];
}

export interface FaixaQuadro {
  chave: string;
  /** "Himeling", o nome da morada com várias casas; null na grelha do país. */
  titulo: string | null;
  partes: ParteQuadro[];
}

export interface SeccaoQuadro {
  chave: string;
  /**
   * "França", "Luxemburgo", "Onde dorme: por definir" ou, por obras, o nome do cliente; null nos blocos
   * largos (já têm título).
   */
  titulo: string | null;
  faixas: FaixaQuadro[];
  /** Blocos (casas, carrinhas ou obras) e pessoas na secção. */
  nBlocos: number;
  nPessoas: number;
}

// --- Filtro ---------------------------------------------------------------------------------------

/** Valor da opção "Sem obra" do filtro das obras (os outros valores são ids de obras). */
export const SEM_OBRA = 'sem-obra';

/**
 * O filtro do Quadro: clientes (o efetivo: o da obra, ou o da pessoa sem obra) e obras (ids ou SEM_OBRA).
 * Vazio = sem filtro. Dentro de cada um é OU; entre os dois é E.
 */
export interface FiltroQuadro {
  clientes: ReadonlySet<Id>;
  obras: ReadonlySet<string>;
}

export const SEM_FILTRO: FiltroQuadro = { clientes: new Set(), obras: new Set() };

export function filtroQuadroAtivo(f: FiltroQuadro): boolean {
  return f.clientes.size > 0 || f.obras.size > 0;
}

/**
 * A obra da pessoa para o filtro: o id, ou SEM_OBRA sem obra ou com uma obra que não se conhece (apagada,
 * ou a meio de uma importação). O mesmo critério conta o "Sem obra" (opcoesObrasQuadro).
 */
function obraDoFiltro(pessoa: Pessoa, obras: Map<Id, Obra>): string {
  return pessoa.obraId !== null && obras.has(pessoa.obraId) ? pessoa.obraId : SEM_OBRA;
}

/** A pessoa passa no filtro (o cliente efetivo E a obra). */
export function passaFiltroQuadro(pessoa: Pessoa, f: FiltroQuadro, obras: Map<Id, Obra>): boolean {
  return (
    passaFiltro(f.clientes, clienteEfetivoId(pessoa, obras)) &&
    passaFiltro(f.obras, obraDoFiltro(pessoa, obras))
  );
}

/**
 * Opções do filtro das obras: as obras agrupadas pelo cliente (título pequeno com o nome dele, pela ordem
 * dos clientes) e, no fim, "Sem obra". Sem obras nenhuma: lista vazia (o botão fica "Obra: sem obras").
 */
export function opcoesObrasQuadro(estado: Estado, ind: Indices): OpcaoFiltro[] {
  if (estado.obras.length === 0) return [];
  const ordemCliente = (id: Id) => ind.clientes.get(id)?.ordem ?? Number.POSITIVE_INFINITY;
  const obras = [...estado.obras].sort(
    (a, b) => ordemCliente(a.clienteId) - ordemCliente(b.clienteId) || a.nome.localeCompare(b.nome, 'pt'),
  );
  const opcoes: OpcaoFiltro[] = obras.map((o) => {
    const cliente = ind.clientes.get(o.clienteId);
    return {
      valor: o.id,
      rotulo: o.nome,
      grupo: cliente?.nome ?? 'Cliente desconhecido',
      contagem: ind.trabalhadores.get(o.id)?.length ?? 0,
      termos: cliente ? `${cliente.nome} ${cliente.sigla}` : undefined,
    };
  });
  const semObra = estado.pessoas.filter((p) => p.ativa && obraDoFiltro(p, ind.obras) === SEM_OBRA);
  opcoes.push({ valor: SEM_OBRA, rotulo: 'Sem obra', grupo: GRUPO_ESPECIAIS, contagem: semObra.length });
  return opcoes;
}

/** Larguras mínimas de sempre (em) de um nome e de um bloco. */
export const LARGURA_MIN_NOME = 9.5;
export const LARGURA_MIN_BLOCO = 12.5;

/**
 * Larguras mínimas (em) das colunas para o nome mais comprido e o cabeçalho mais largo caberem numa só
 * linha: `nome` para a grelha dos nomes, `bloco` para a dos blocos — o maior entre o nome mais as margens
 * do bloco (0,35 em de cada lado, a borda e uma folga para arredondamentos) e o cabeçalho inteiro (título,
 * "●" e pastilha, já com as margens e a borda). Nunca abaixo das de sempre (9,5 e 12,5 em).
 * @param nomeEm largura natural do nome mais comprido (em), medida no browser (0 = não conta: as colunas
 *   dos nomes ficam as de sempre e os nomes compridos levam reticências).
 * @param cabecalhoEm largura natural do cabeçalho mais largo (em), medida no browser (0 = não conta).
 */
export function largurasMinimas(nomeEm: number, cabecalhoEm = 0): { nome: number; bloco: number } {
  const arredondar = (x: number) => Math.ceil(x * 20) / 20;
  const valido = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const nome = valido(nomeEm);
  const cabecalho = valido(cabecalhoEm);
  return {
    nome: arredondar(Math.max(LARGURA_MIN_NOME, nome + 0.05)),
    bloco: arredondar(Math.max(LARGURA_MIN_BLOCO, nome + 0.95, cabecalho + 0.05)),
  };
}

/** Intervalos (em) entre blocos de uma grelha e entre as partes lado a lado (os do Quadro.tsx). */
export const INTERVALO_BLOCOS = 0.45;
export const INTERVALO_PARTES = 0.6;

/**
 * Quantas colunas de blocos dá a cada parte lado a lado (Himeling: Forêt à esquerda, Grotte à direita)
 * quando não cabem todos numa linha. Cada parte ocupa `colunas × min + (colunas − 1) × INTERVALO_BLOCOS` (a base da
 * flexbox); escolhe-se, entre as combinações que cabem em `largura`, a que tem menos linhas na parte mais
 * alta, depois menos linhas ao todo e depois mais colunas. Assim a parte de títulos largos passa à linha
 * de baixo sem levar a outra atrás (a flexbox encolhia as duas na mesma proporção). Se nem com uma coluna
 * cada couber, uma coluna cada.
 * @param largura largura da fila das partes (em);
 * @param partes a largura mínima de um bloco (em) e o nº de blocos de cada parte.
 */
export function colunasLadoALado(largura: number, partes: readonly { min: number; n: number }[]): number[] {
  const uma = partes.map(() => 1);
  if (partes.length === 0) return [];
  const base = (min: number, c: number) => c * (min + INTERVALO_BLOCOS) - INTERVALO_BLOCOS;
  let melhor: { colunas: number[]; chave: number[] } | null = null;
  const atual = [...uma];
  const visitar = (i: number, usada: number) => {
    if (usada > largura + 1e-6) return;
    if (i === partes.length) {
      const linhas = partes.map((p, j) => Math.ceil(Math.max(1, p.n) / (atual[j] as number)));
      const chave = [
        Math.max(...linhas),
        linhas.reduce((a, b) => a + b, 0),
        -atual.reduce((a, b) => a + b, 0),
      ];
      if (!melhor || comparar(chave, melhor.chave) < 0) melhor = { colunas: [...atual], chave };
      return;
    }
    const p = partes[i] as { min: number; n: number };
    for (let c = 1; c <= Math.max(1, p.n); c++) {
      atual[i] = c;
      visitar(i + 1, usada + base(p.min, c) + (i > 0 ? INTERVALO_PARTES : 0));
    }
    atual[i] = 1;
  };
  visitar(0, 0);
  return (melhor as { colunas: number[] } | null)?.colunas ?? uma;
}

function comparar(a: readonly number[], b: readonly number[]): number {
  for (let k = 0; k < a.length; k++) {
    const d = (a[k] as number) - (b[k] as number);
    if (d !== 0) return d;
  }
  return 0;
}

// --- Blocos ---------------------------------------------------------------------------------------

/** Pessoas que passam no filtro e quantas ficam escondidas; sem filtro, todas. */
function filtrar(
  pessoas: Pessoa[],
  ind: Indices,
  filtro: FiltroQuadro | undefined,
): { pessoas: Pessoa[]; escondidas: number; recolhido: boolean } {
  if (!filtro || !filtroQuadroAtivo(filtro)) return { pessoas, escondidas: 0, recolhido: false };
  const ficam = pessoas.filter((p) => passaFiltroQuadro(p, filtro, ind.obras));
  return { pessoas: ficam, escondidas: pessoas.length - ficam.length, recolhido: ficam.length === 0 };
}

function parcelas(pessoas: Pessoa[], ind: Indices): ParcelaClienteQuadro[] {
  return agruparPorCliente(pessoas, ind).map((g) => ({
    clienteId: g.clienteId,
    cliente: g.cliente,
    n: g.pessoas.length,
  }));
}

function blocoCasa(
  casa: Casa,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  filtro: FiltroQuadro | undefined,
): BlocoQuadro {
  const moradores = ind.moradores.get(casa.id) ?? [];
  const oc = ocupacaoDaCasa(ind, casa);
  const f = filtrar(ordenarPorClienteENome(moradores, ind), ind, filtro);
  return {
    chave: `casa:${casa.id}`,
    tipo: 'casa',
    id: casa.id,
    titulo: casa.nome,
    detalhe: null,
    pessoas: f.pessoas,
    deOnde: null,
    escondidas: f.escondidas,
    recolhido: f.recolhido,
    lotacao: { ocupados: oc.ocupados, lugares: oc.lotacao, nivel: oc.nivel },
    vazios: oc.livres,
    ligacoes: carrinhasQueDormemEm(casa.id, ind, dormidas).map(({ carrinha, confianca }) => ({
      tipo: 'carrinha' as const,
      id: carrinha.id,
      rotulo: formatarMatricula(carrinha.matricula),
      sugerida: confianca === 'sugerida',
    })),
    semCondutor: false,
    largo: false,
    porCliente: [],
  };
}

function ligacaoDaCarrinha(d: Dormida | undefined, ind: Indices): LigacaoQuadro {
  const texto = textoDormida(d, ind);
  if (texto.desconhecida) return { tipo: 'por-definir', id: null, rotulo: 'por definir', sugerida: false };
  return {
    tipo: texto.casaId ? 'casa' : 'local',
    id: texto.casaId ?? d?.localId ?? null,
    rotulo: texto.rotulo,
    sugerida: d?.confianca === 'sugerida',
  };
}

function blocoCarrinha(
  carrinha: Carrinha,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  filtro: FiltroQuadro | undefined,
): BlocoQuadro {
  const passageiros = ind.passageiros.get(carrinha.id) ?? [];
  // M2: quem está indisponível hoje não conta (o lugar fica livre), como no Mapa e na lista.
  const oc = ocupacaoDaCarrinha(ind, carrinha);
  const marcaModelo = textoMarcaModelo(carrinha);
  const f = filtrar(condutorPrimeiro(ordenarPorClienteENome(passageiros, ind), carrinha), ind, filtro);
  return {
    chave: `carrinha:${carrinha.id}`,
    tipo: 'carrinha',
    id: carrinha.id,
    titulo: formatarMatricula(carrinha.matricula),
    detalhe:
      carrinha.tipo === 'carro'
        ? [ROTULO_TIPO_VEICULO.carro, marcaModelo].filter(Boolean).join(' · ')
        : marcaModelo,
    pessoas: f.pessoas,
    deOnde: null,
    escondidas: f.escondidas,
    recolhido: f.recolhido,
    lotacao: { ocupados: oc.ocupados, lugares: oc.lugares, nivel: oc.nivel },
    // As caixas são as do cartão do Mapa (grupos.ts): quem está indisponível continua desenhado na sua.
    vazios: Math.max(0, carrinha.lugares - passageiros.length),
    ligacoes: [ligacaoDaCarrinha(dormidas.get(carrinha.id), ind)],
    semCondutor: semCondutor(carrinha, ind),
    largo: false,
    porCliente: [],
  };
}

/** Título de cada bloco largo. */
const TITULO_LARGO: Record<'fora' | 'sem-transporte' | 'sem-obra', string> = {
  fora: ROTULO_FORA_DAS_CASAS,
  'sem-transporte': ROTULO_SEM_TRANSPORTE,
  'sem-obra': ROTULO_SEM_OBRA_SECCAO,
};

function blocoLargo(
  tipo: 'fora' | 'sem-transporte' | 'sem-obra',
  pessoas: Pessoa[],
  ind: Indices,
  filtro: FiltroQuadro | undefined,
): BlocoQuadro {
  const f = filtrar(ordenarPorClienteENome(pessoas, ind), ind, filtro);
  const ordenadas = f.pessoas;
  return {
    chave: tipo,
    tipo,
    id: null,
    titulo: TITULO_LARGO[tipo],
    detalhe: null,
    pessoas: ordenadas,
    deOnde: null,
    escondidas: f.escondidas,
    recolhido: f.recolhido,
    lotacao: null,
    vazios: 0,
    ligacoes: [],
    semCondutor: false,
    largo: true,
    porCliente: parcelas(ordenadas, ind),
  };
}

/** A casa de onde vem cada pessoa (o nome da casa; sem casa, "Fora das casas CMF"). */
function casasDeOnde(pessoas: readonly Pessoa[], ind: Indices): Map<Id, string> {
  return new Map(
    pessoas.map((p) => {
      const casa = p.casaId ? ind.casas.get(p.casaId) : undefined;
      return [p.id, casa?.nome ?? ROTULO_FORA_DAS_CASAS] as const;
    }),
  );
}

/** Pela casa de onde vêm (a ordem das casas; fora das casas no fim) e depois pelo nome. */
function porCasaENome(pessoas: readonly Pessoa[], ind: Indices): Pessoa[] {
  const ordemCasa = (p: Pessoa) =>
    (p.casaId ? ind.casas.get(p.casaId)?.ordem : undefined) ?? Number.MAX_SAFE_INTEGER;
  return [...pessoas].sort((a, b) => ordemCasa(a) - ordemCasa(b) || compararPessoas(a, b));
}

/** A morada do local da obra; sem morada, o nome do local, se não for o da obra (o da obra já é o título). */
function detalheDaObra(obra: Obra, ind: Indices): string | null {
  const local = ind.locais.get(obra.localId);
  if (!local) return null;
  const morada = local.morada.trim();
  if (morada) return morada;
  return local.nome.trim() && local.nome.trim() !== obra.nome.trim() ? local.nome.trim() : null;
}

function blocoObra(obra: Obra, ind: Indices, filtro: FiltroQuadro | undefined): BlocoQuadro {
  const f = filtrar(porCasaENome(ind.trabalhadores.get(obra.id) ?? [], ind), ind, filtro);
  return {
    chave: `obra:${obra.id}`,
    tipo: 'obra',
    id: obra.id,
    titulo: obra.nome,
    detalhe: detalheDaObra(obra, ind),
    pessoas: f.pessoas,
    deOnde: casasDeOnde(f.pessoas, ind),
    escondidas: f.escondidas,
    recolhido: f.recolhido,
    lotacao: null,
    vazios: 0,
    ligacoes: [],
    semCondutor: false,
    largo: false,
    porCliente: [],
  };
}

// --- Locais, zonas e países -----------------------------------------------------------------------

interface ItemLocal {
  local: Local;
  /** Blocos deste local, já pela ordem. */
  blocos: BlocoQuadro[];
  /** Posição do local na ordem do Michael (a da 1.ª casa; sem casas, depois de todas). */
  ordem: number;
}

/** Junta os locais vizinhos (a menos de 500 m, em cadeia). Locais sem coordenadas ficam sozinhos. */
export function zonasDeVizinhos(locais: readonly Local[]): Local[][] {
  const pai = locais.map((_, i) => i);
  const raiz = (i: number): number => {
    while (pai[i] !== i) i = pai[i] = pai[pai[i] as number] as number;
    return i;
  };
  for (let i = 0; i < locais.length; i++) {
    for (let j = i + 1; j < locais.length; j++) {
      const a = locais[i] as Local;
      const b = locais[j] as Local;
      if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) continue;
      const d = distanciaMetros({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng });
      if (d < DISTANCIA_VIZINHOS_M) pai[raiz(j)] = raiz(i);
    }
  }
  const zonas = new Map<number, Local[]>();
  locais.forEach((local, i) => {
    const lista = zonas.get(raiz(i));
    if (lista) lista.push(local);
    else zonas.set(raiz(i), [local]);
  });
  // Dentro de uma zona: de oeste para leste (empate: o mais a norte primeiro), como no mapa.
  return [...zonas.values()].map((z) =>
    z.sort((a, b) => (a.lng ?? 0) - (b.lng ?? 0) || (b.lat ?? 0) - (a.lat ?? 0)),
  );
}

/** "Himeling, Rue de la Forêt" numa zona "Himeling" → "Rue de la Forêt". */
export function nomeNaZona(nomeLocal: string, nomeZona: string): string {
  const [primeira, ...resto] = nomeLocal.split(',').map((p) => p.trim());
  return primeira === nomeZona && resto.length > 0 ? resto.join(', ') : nomeLocal;
}

interface FaixaOrdenada {
  faixa: FaixaQuadro;
  ordem: number;
}

/**
 * Secções por país: zonas de vizinhos (partes lado a lado), moradas com vários blocos (se
 * `juntarMoradas`) e, numa só grelha, os outros locais. Pela ordem do Michael.
 */
function seccoesPorPais(itens: readonly ItemLocal[], juntarMoradas: boolean): SeccaoQuadro[] {
  const porLocal = new Map(itens.map((it) => [it.local.id, it]));
  const zonas = zonasDeVizinhos(itens.map((it) => it.local));
  const porPais = new Map<Pais, { faixas: FaixaOrdenada[]; soltos: ItemLocal[] }>();
  const doPais = (pais: Pais) => {
    let p = porPais.get(pais);
    if (!p) {
      p = { faixas: [], soltos: [] };
      porPais.set(pais, p);
    }
    return p;
  };

  for (const zona of zonas) {
    const membros = zona.map((l) => porLocal.get(l.id) as ItemLocal);
    const primeiro = membros[0] as ItemLocal;
    const pais = doPais(primeiro.local.pais);
    const ordem = Math.min(...membros.map((m) => m.ordem));
    if (membros.length >= 2) {
      const titulo = nomeJunto(membros.map((m) => m.local.nome));
      pais.faixas.push({
        ordem,
        faixa: {
          chave: `zona:${membros.map((m) => m.local.id).join('+')}`,
          titulo,
          partes: membros.map((m) => ({
            chave: `local:${m.local.id}`,
            titulo: nomeNaZona(m.local.nome, titulo),
            blocos: m.blocos,
          })),
        },
      });
    } else if (juntarMoradas && primeiro.blocos.length >= 2) {
      pais.faixas.push({
        ordem,
        faixa: {
          chave: `local:${primeiro.local.id}`,
          titulo: primeiro.local.nome,
          partes: [{ chave: `local:${primeiro.local.id}`, titulo: null, blocos: primeiro.blocos }],
        },
      });
    } else pais.soltos.push(primeiro);
  }

  const seccoes: { seccao: SeccaoQuadro; ordem: number }[] = [];
  for (const [pais, { faixas, soltos }] of porPais) {
    if (soltos.length > 0) {
      const ordenados = [...soltos].sort((a, b) => a.ordem - b.ordem);
      faixas.push({
        ordem: (ordenados[0] as ItemLocal).ordem,
        faixa: {
          chave: `pais:${pais}`,
          titulo: null,
          partes: [{ chave: `pais:${pais}`, titulo: null, blocos: ordenados.flatMap((it) => it.blocos) }],
        },
      });
    }
    faixas.sort((a, b) => a.ordem - b.ordem);
    const blocos = faixas.flatMap((f) => f.faixa.partes.flatMap((p) => p.blocos));
    seccoes.push({
      ordem: Math.min(...faixas.map((f) => f.ordem)),
      seccao: {
        chave: `pais:${pais}`,
        titulo: NOME_PAIS[pais] ?? pais,
        faixas: faixas.map((f) => f.faixa),
        nBlocos: blocos.length,
        nPessoas: blocos.reduce((n, b) => n + b.pessoas.length, 0),
      },
    });
  }
  return seccoes.sort((a, b) => a.ordem - b.ordem).map((s) => s.seccao);
}

/** Secção só com um bloco largo (fora das casas, sem transporte). */
function seccaoLarga(bloco: BlocoQuadro): SeccaoQuadro {
  return {
    chave: bloco.chave,
    titulo: null,
    faixas: [
      { chave: bloco.chave, titulo: null, partes: [{ chave: bloco.chave, titulo: null, blocos: [bloco] }] },
    ],
    nBlocos: 0,
    nPessoas: bloco.pessoas.length,
  };
}

function seccoesCasas(
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  filtro: FiltroQuadro | undefined,
): SeccaoQuadro[] {
  const casas = [...estado.casas].sort((a, b) => a.ordem - b.ordem);
  const itens = new Map<Id, ItemLocal>();
  for (const casa of casas) {
    const local = ind.locais.get(casa.localId);
    if (!local) continue;
    const item = itens.get(local.id);
    if (item) item.blocos.push(blocoCasa(casa, ind, dormidas, filtro));
    else itens.set(local.id, { local, blocos: [blocoCasa(casa, ind, dormidas, filtro)], ordem: casa.ordem });
  }
  // Casas cujo local não existe (não devia acontecer, mas não desaparecem): numa secção à parte.
  const semLocal = casas
    .filter((c) => !ind.locais.has(c.localId))
    .map((c) => blocoCasa(c, ind, dormidas, filtro));
  const seccoes = seccoesPorPais([...itens.values()], true);
  if (semLocal.length > 0) seccoes.push(seccaoSolta('casas-sem-local', 'Sem morada', semLocal));
  seccoes.push(seccaoLarga(blocoLargo('fora', ind.foraDasCasas, ind, filtro)));
  return seccoes;
}

function seccaoSolta(chave: string, titulo: string, blocos: BlocoQuadro[]): SeccaoQuadro {
  return {
    chave,
    titulo,
    faixas: [{ chave, titulo: null, partes: [{ chave, titulo: null, blocos }] }],
    nBlocos: blocos.length,
    nPessoas: blocos.reduce((n, b) => n + b.pessoas.length, 0),
  };
}

function seccoesCarrinhas(
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  filtro: FiltroQuadro | undefined,
): SeccaoQuadro[] {
  // Ordem de cada local: a da primeira casa que lá está (locais sem casas, como um estacionamento,
  // ficam depois de todas as casas).
  const ordemLocal = new Map<Id, number>();
  for (const casa of estado.casas) {
    ordemLocal.set(
      casa.localId,
      Math.min(ordemLocal.get(casa.localId) ?? Number.POSITIVE_INFINITY, casa.ordem),
    );
  }
  const carrinhas = [...estado.carrinhas].sort(
    (a, b) => a.ordem - b.ordem || a.matricula.localeCompare(b.matricula),
  );
  const itens = new Map<Id, ItemLocal>();
  const porDefinir: BlocoQuadro[] = [];
  for (const carrinha of carrinhas) {
    const bloco = blocoCarrinha(carrinha, ind, dormidas, filtro);
    const localId = dormidas.get(carrinha.id)?.localId ?? null;
    const local = localId ? ind.locais.get(localId) : undefined;
    if (!local) {
      porDefinir.push(bloco);
      continue;
    }
    const item = itens.get(local.id);
    if (item) item.blocos.push(bloco);
    else
      itens.set(local.id, {
        local,
        blocos: [bloco],
        ordem: ordemLocal.get(local.id) ?? estado.casas.length + carrinha.ordem,
      });
  }
  const seccoes = seccoesPorPais([...itens.values()], false);
  if (porDefinir.length > 0) seccoes.push(seccaoSolta('por-definir', ROTULO_DORME_POR_DEFINIR, porDefinir));
  seccoes.push(seccaoLarga(blocoLargo('sem-transporte', ind.semTransporte, ind, filtro)));
  return seccoes;
}

/**
 * Obras: uma secção por cliente (pela ordem dos clientes; obras de um cliente que não se conhece no fim),
 * as obras pelo nome e, no fim, "Sem obra" (quem não tem obra ou tem uma que não se conhece).
 */
function seccoesObras(estado: Estado, ind: Indices, filtro: FiltroQuadro | undefined): SeccaoQuadro[] {
  const ordemCliente = (id: Id) => ind.clientes.get(id)?.ordem ?? Number.POSITIVE_INFINITY;
  const obras = [...estado.obras].sort(
    (a, b) => ordemCliente(a.clienteId) - ordemCliente(b.clienteId) || a.nome.localeCompare(b.nome, 'pt'),
  );
  const porCliente = new Map<Id, Obra[]>();
  for (const obra of obras) {
    const lista = porCliente.get(obra.clienteId);
    if (lista) lista.push(obra);
    else porCliente.set(obra.clienteId, [obra]);
  }
  const seccoes = [...porCliente].map(([clienteId, obrasDoCliente]) =>
    seccaoSolta(
      `cliente:${clienteId}`,
      ind.clientes.get(clienteId)?.nome ?? ROTULO_CLIENTE_DESCONHECIDO,
      obrasDoCliente.map((o) => blocoObra(o, ind, filtro)),
    ),
  );
  const semObra = estado.pessoas.filter((p) => p.ativa && obraDoFiltro(p, ind.obras) === SEM_OBRA);
  seccoes.push(seccaoLarga(blocoLargo('sem-obra', semObra, ind, filtro)));
  return seccoes;
}

/**
 * As secções do Quadro, por casas, por carrinhas ou por obras. Com `filtro`, os blocos só têm as pessoas que passam
 * (a lotação continua a real) e as secções contam só essas.
 */
export function montarQuadro(
  agrupamento: Agrupamento,
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
  filtro?: FiltroQuadro,
): SeccaoQuadro[] {
  switch (agrupamento) {
    case 'casas':
      return seccoesCasas(estado, ind, dormidas, filtro);
    case 'carrinhas':
      return seccoesCarrinhas(estado, ind, dormidas, filtro);
    case 'obras':
      return seccoesObras(estado, ind, filtro);
  }
}

/** Todos os blocos do quadro, pela ordem em que aparecem (para os testes e para contar). */
export function blocosDoQuadro(seccoes: readonly SeccaoQuadro[]): BlocoQuadro[] {
  return seccoes.flatMap((s) => s.faixas.flatMap((f) => f.partes.flatMap((p) => p.blocos)));
}

// --- Ajuste ao ecrã ---------------------------------------------------------------------------------

/** Nº de algarismos de um inteiro ≥ 0. */
function algarismos(n: number): number {
  return String(Math.max(0, Math.trunc(n))).length;
}

/**
 * Algarismos que o nº de ocupados da pastilha pode ter no modo de edição sem se voltar a medir: os de
 * max(lugares, ocupados + 1), ou seja, até à lotação e mais uma largada (9/10 → 10/10, 9/9 → 10/9). O
 * useAjuste reserva os que faltam (algarismosAMais); a chave de edição (assinaturaCabecalhos) muda
 * quando este nº muda (de 8/4 para 9/4), e só aí se volta a medir. Sem lotação, `lugares` = 0.
 */
export function algarismosDaPastilha(ocupados: number, lugares: number): number {
  return algarismos(Math.max(lugares, ocupados + 1));
}

/** Algarismos a reservar na pastilha (≥ 0): os de algarismosDaPastilha menos os que já tem. */
export function algarismosAMais(ocupados: number, lugares: number): number {
  return Math.max(0, algarismosDaPastilha(ocupados, lugares) - algarismos(ocupados));
}

/**
 * Assinatura dos cabeçalhos dos blocos normais, para a chave do ajuste no modo de edição: muda só quando
 * uma pastilha passa a precisar de mais algarismos do que os reservados ou quando um bloco fica (ou
 * deixa de ficar) recolhido pelo filtro. As outras largadas não voltam a medir.
 */
export function assinaturaCabecalhos(seccoes: readonly SeccaoQuadro[]): string {
  return blocosDoQuadro(seccoes)
    .filter((b) => !b.largo)
    .map((b) => {
      const n = b.lotacao
        ? algarismosDaPastilha(b.lotacao.ocupados, b.lotacao.lugares)
        : algarismosDaPastilha(b.pessoas.length, 0);
      return `${n}${b.recolhido ? 'r' : ''}`;
    })
    .join('.');
}

/**
 * O maior tamanho de letra (px, inteiro) entre `minimo` e `maximo` com que o quadro cabe; null se nem com o
 * mínimo couber. `cabe` mede (no browser: põe a letra e compara a altura do conteúdo com a do ecrã).
 * Pesquisa binária: cabe(f) tem de ser monótona (letra maior nunca cabe melhor).
 */
export function maiorLetraQueCabe(
  minimo: number,
  maximo: number,
  cabe: (f: number) => boolean,
): number | null {
  if (maximo < minimo || !cabe(minimo)) return null;
  let lo = minimo;
  let hi = maximo;
  while (lo < hi) {
    const meio = Math.ceil((lo + hi) / 2);
    if (cabe(meio)) lo = meio;
    else hi = meio - 1;
  }
  return lo;
}

/**
 * O que o quadro mostra, do mais para o menos:
 * - 'completo': tudo, um "livre" (tracejado) por lugar livre;
 * - 'livres-numa-linha': os lugares livres de cada bloco juntos numa só linha tracejada ("4 livres") e
 *   sem o que a pastilha ou o título da secção já dizem ("Ninguém.", "por definir" no rodapé);
 * - 'compacto': como o anterior, mas sem os lugares livres (a pastilha diz quantos há).
 */
export type ModoAjuste = 'completo' | 'livres-numa-linha' | 'compacto';

/** Um degrau do ajuste: o que se mostra e os limites da letra. */
export interface DegrauAjuste {
  modo: ModoAjuste;
  minimo: number;
  maximo: number;
  /**
   * As colunas ficam com a largura de sempre (LARGURA_MIN_BLOCO, ou a do cabeçalho mais largo: os títulos
   * ficam sempre inteiros) e os nomes que não cabem levam reticências. Sem isto (por omissão), as colunas
   * têm a largura do nome mais comprido (largurasMinimas): todos os nomes inteiros numa só linha.
   */
  nomesCortados?: boolean;
}

export interface AjusteQuadro {
  letra: number;
  modo: ModoAjuste;
  /** Colunas da largura de sempre (ou do cabeçalho): algum nome comprido pode ficar com reticências. */
  nomesCortados: boolean;
  /** Nem assim coube: o quadro desliza na vertical. */
  desliza: boolean;
}

/** Letra (px) no telemóvel e quando o quadro não cabe no PC. */
export const LETRA_NORMAL = 14;

/**
 * Os degraus do ajuste (ver escolherAjuste) e o que fica se nenhum couber.
 * Os nomes ficam sempre inteiros numa só linha (pedido do Rafael, 04/10/2026): as colunas têm a largura do
 * nome mais comprido.
 * - Reunião (TV vista de longe): completo de 14 a 30 px; senão os livres numa linha, que podem ir até
 *   13 px; senão o compacto, sem livres. Se nem assim couber, antes de deslizar (na TV ninguém desliza:
 *   blocos inteiros ficavam fora do ecrã) as colunas voltam à largura de sempre e só os poucos nomes que
 *   não cabem levam reticências: a 1920×1080, com os dados de outubro de 2026, o Quadro por carrinhas não
 *   cabe com os nomes inteiros nem compacto a 13 px, e com 4 nomes cortados cabe com os livres numa
 *   linha a 13. Se nem assim, 13 px a deslizar com os nomes inteiros.
 * - PC: de 12 a 16 px, sempre completo, com um "livre" por lugar nas casas e nas carrinhas (pedido do
 *   Rafael: os lugares vazios das carrinhas "tal como nas casas"); se não couber, 14 px a deslizar. Os
 *   nomes nunca se cortam (no PC desliza-se).
 */
export const DEGRAUS_AJUSTE: Record<
  'reuniao' | 'normal',
  { degraus: readonly DegrauAjuste[]; senaoCouber: { letra: number; modo: ModoAjuste } }
> = {
  reuniao: {
    degraus: [
      { modo: 'completo', minimo: 14, maximo: 30 },
      { modo: 'livres-numa-linha', minimo: 13, maximo: 30 },
      { modo: 'compacto', minimo: 13, maximo: 30 },
      { modo: 'livres-numa-linha', minimo: 13, maximo: 30, nomesCortados: true },
      { modo: 'compacto', minimo: 13, maximo: 30, nomesCortados: true },
    ],
    senaoCouber: { letra: 13, modo: 'compacto' },
  },
  normal: {
    degraus: [{ modo: 'completo', minimo: 12, maximo: 16 }],
    senaoCouber: { letra: LETRA_NORMAL, modo: 'completo' },
  },
};

/**
 * Desce os degraus até o quadro caber: no primeiro em que caiba, a maior letra com que cabe. Assim, antes
 * de a letra ficar pequena demais para se ler (na TV, de longe), tira-se primeiro informação. Se nenhum
 * couber, fica `senaoCouber` e o quadro desliza.
 */
export function escolherAjuste(
  degraus: readonly DegrauAjuste[],
  senaoCouber: { letra: number; modo: ModoAjuste },
  cabe: (letra: number, modo: ModoAjuste, nomesCortados: boolean) => boolean,
): AjusteQuadro {
  for (const { modo, minimo, maximo, nomesCortados = false } of degraus) {
    const letra = maiorLetraQueCabe(minimo, maximo, (f) => cabe(f, modo, nomesCortados));
    if (letra !== null) return { letra, modo, nomesCortados, desliza: false };
  }
  return { ...senaoCouber, nomesCortados: false, desliza: true };
}
