// Vista Quadro: as casas (ou as carrinhas) em blocos, como as folhas do Michael — um bloco por casa ou
// carrinha, com a lotação no cabeçalho e os nomes por baixo. Funções puras: agrupar e ordenar.
//
// Agrupamento (o mesmo para casas e carrinhas):
// - por país (França, Luxemburgo…), pela ordem das casas (a do Michael: Himeling primeiro);
// - locais vizinhos (a menos de 500 m, como no mapa: as duas ruas de Himeling) formam uma zona com as
//   partes lado a lado, a de oeste à esquerda (Himeling: Forêt à esquerda, Grotte à direita);
// - nas casas, uma morada com várias casas fica junta, com o nome da morada por cima;
// - os outros locais vão todos para a mesma grelha do país (para caber tudo num ecrã);
// - no fim, "Fora das casas CMF" ou "Sem transporte da empresa" (bloco largo, nomes por cliente)
//   e, nas carrinhas, as que ainda não têm onde dormir.
// Uma carrinha conta onde dorme (definido ou, sem isso, a sugestão: a casa da maioria dos passageiros).

import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import {
  type AvisoContrato,
  type NivelLotacao,
  ocupacaoCarrinha,
  ocupacaoCasa,
} from '../../dominio/ocupacao';
import type { Carrinha, Casa, Cliente, Estado, Id, Local, Pais, Pessoa } from '../../dominio/tipos';
import { condutorPrimeiro, ordenarPorClienteENome } from '../lista/seccoes';
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

export interface BlocoQuadro {
  /** "casa:<id>", "carrinha:<id>", "fora", "sem-transporte". */
  chave: string;
  tipo: 'casa' | 'carrinha' | 'fora' | 'sem-transporte';
  id: Id | null;
  /** Nome da casa, matrícula formatada ("CF 5001") ou o rótulo do grupo. */
  titulo: string;
  /** Carrinha: "Ford Transit Custom" (num carro, "Carro · Volvo V40"). */
  detalhe: string | null;
  /** Nas casas pelo cliente e pelo nome (as cores juntas, como no Excel); nas carrinhas o condutor primeiro. */
  pessoas: Pessoa[];
  /** Null nos grupos sem lugares (fora das casas, sem transporte). */
  lotacao: LotacaoBloco | null;
  /** Lugares livres a desenhar (só nas casas: nas carrinhas a pastilha chega). */
  vazios: number;
  ligacoes: LigacaoQuadro[];
  /** Aviso do contrato da casa (acima do máximo ou do tolerado); null quando não há. */
  aviso: { tipo: AvisoContrato; usados: number; maximo: number; tolerado: number | null } | null;
  sempreCheia: boolean;
  /** Carrinha com passageiros e ninguém a conduzir. */
  semCondutor: boolean;
  /** Bloco largo (fora das casas, sem transporte): ocupa a linha toda, com a divisão por cliente. */
  largo: boolean;
  porCliente: ParcelaClienteQuadro[];
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
  /** "França", "Luxemburgo", "Onde dorme: por definir"; null nos blocos largos (já têm título). */
  titulo: string | null;
  faixas: FaixaQuadro[];
  /** Blocos (casas ou carrinhas) e pessoas na secção. */
  nBlocos: number;
  nPessoas: number;
}

// --- Blocos ---------------------------------------------------------------------------------------

function parcelas(pessoas: Pessoa[], ind: Indices): ParcelaClienteQuadro[] {
  return agruparPorCliente(pessoas, ind).map((g) => ({
    clienteId: g.clienteId,
    cliente: g.cliente,
    n: g.pessoas.length,
  }));
}

function blocoCasa(casa: Casa, ind: Indices, dormidas: Map<Id, Dormida>): BlocoQuadro {
  const moradores = ind.moradores.get(casa.id) ?? [];
  const oc = ocupacaoCasa(casa, moradores.length);
  return {
    chave: `casa:${casa.id}`,
    tipo: 'casa',
    id: casa.id,
    titulo: casa.nome,
    detalhe: null,
    pessoas: ordenarPorClienteENome(moradores, ind),
    lotacao: { ocupados: oc.ocupados, lugares: oc.lotacao, nivel: oc.nivel },
    vazios: oc.livres,
    ligacoes: carrinhasQueDormemEm(casa.id, ind, dormidas).map(({ carrinha, confianca }) => ({
      tipo: 'carrinha' as const,
      id: carrinha.id,
      rotulo: formatarMatricula(carrinha.matricula),
      sugerida: confianca === 'sugerida',
    })),
    aviso:
      (oc.aviso === 'acima_maximo' || oc.aviso === 'acima_tolerado') && casa.maxContrato !== null
        ? { tipo: oc.aviso, usados: oc.usados, maximo: casa.maxContrato, tolerado: casa.tolerado }
        : null,
    sempreCheia: casa.sempreCheia,
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

function blocoCarrinha(carrinha: Carrinha, ind: Indices, dormidas: Map<Id, Dormida>): BlocoQuadro {
  const passageiros = ind.passageiros.get(carrinha.id) ?? [];
  const oc = ocupacaoCarrinha(carrinha, passageiros.length);
  const marcaModelo = textoMarcaModelo(carrinha);
  return {
    chave: `carrinha:${carrinha.id}`,
    tipo: 'carrinha',
    id: carrinha.id,
    titulo: formatarMatricula(carrinha.matricula),
    detalhe:
      carrinha.tipo === 'carro'
        ? [ROTULO_TIPO_VEICULO.carro, marcaModelo].filter(Boolean).join(' · ')
        : marcaModelo,
    pessoas: condutorPrimeiro(ordenarPorClienteENome(passageiros, ind), carrinha),
    lotacao: { ocupados: oc.ocupados, lugares: oc.lugares, nivel: oc.nivel },
    vazios: 0,
    ligacoes: [ligacaoDaCarrinha(dormidas.get(carrinha.id), ind)],
    aviso: null,
    sempreCheia: false,
    semCondutor: semCondutor(carrinha, ind),
    largo: false,
    porCliente: [],
  };
}

function blocoLargo(tipo: 'fora' | 'sem-transporte', pessoas: Pessoa[], ind: Indices): BlocoQuadro {
  const ordenadas = ordenarPorClienteENome(pessoas, ind);
  return {
    chave: tipo,
    tipo,
    id: null,
    titulo: tipo === 'fora' ? ROTULO_FORA_DAS_CASAS : ROTULO_SEM_TRANSPORTE,
    detalhe: null,
    pessoas: ordenadas,
    lotacao: null,
    vazios: 0,
    ligacoes: [],
    aviso: null,
    sempreCheia: false,
    semCondutor: false,
    largo: true,
    porCliente: parcelas(ordenadas, ind),
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

function seccoesCasas(estado: Estado, ind: Indices, dormidas: Map<Id, Dormida>): SeccaoQuadro[] {
  const casas = [...estado.casas].sort((a, b) => a.ordem - b.ordem);
  const itens = new Map<Id, ItemLocal>();
  for (const casa of casas) {
    const local = ind.locais.get(casa.localId);
    if (!local) continue;
    const item = itens.get(local.id);
    if (item) item.blocos.push(blocoCasa(casa, ind, dormidas));
    else itens.set(local.id, { local, blocos: [blocoCasa(casa, ind, dormidas)], ordem: casa.ordem });
  }
  // Casas cujo local não existe (não devia acontecer, mas não desaparecem): numa secção à parte.
  const semLocal = casas.filter((c) => !ind.locais.has(c.localId)).map((c) => blocoCasa(c, ind, dormidas));
  const seccoes = seccoesPorPais([...itens.values()], true);
  if (semLocal.length > 0) seccoes.push(seccaoSolta('casas-sem-local', 'Sem morada', semLocal));
  seccoes.push(seccaoLarga(blocoLargo('fora', ind.foraDasCasas, ind)));
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

function seccoesCarrinhas(estado: Estado, ind: Indices, dormidas: Map<Id, Dormida>): SeccaoQuadro[] {
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
    const bloco = blocoCarrinha(carrinha, ind, dormidas);
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
  seccoes.push(seccaoLarga(blocoLargo('sem-transporte', ind.semTransporte, ind)));
  return seccoes;
}

/** As secções do Quadro, por casas ou por carrinhas. */
export function montarQuadro(
  agrupamento: Agrupamento,
  estado: Estado,
  ind: Indices,
  dormidas: Map<Id, Dormida>,
): SeccaoQuadro[] {
  return agrupamento === 'casas'
    ? seccoesCasas(estado, ind, dormidas)
    : seccoesCarrinhas(estado, ind, dormidas);
}

/** Todos os blocos do quadro, pela ordem em que aparecem (para os testes e para contar). */
export function blocosDoQuadro(seccoes: readonly SeccaoQuadro[]): BlocoQuadro[] {
  return seccoes.flatMap((s) => s.faixas.flatMap((f) => f.partes.flatMap((p) => p.blocos)));
}

// --- Ajuste ao ecrã ---------------------------------------------------------------------------------

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

/** Um degrau do ajuste: com ou sem os pormenores que se podem dispensar, e os limites da letra. */
export interface DegrauAjuste {
  compacto: boolean;
  minimo: number;
  maximo: number;
}

export interface AjusteQuadro {
  letra: number;
  /** Sem os pormenores dispensáveis (na reunião: os lugares livres desenhados). */
  compacto: boolean;
  /** Nem assim coube: o quadro desliza na vertical. */
  desliza: boolean;
}

/**
 * Desce os degraus até o quadro caber: no primeiro em que caiba, a maior letra com que cabe. Assim, antes
 * de a letra ficar pequena demais para se ler (na TV, de longe), tira-se primeiro informação. Se nenhum
 * couber, fica `senaoCouber` e o quadro desliza.
 */
export function escolherAjuste(
  degraus: readonly DegrauAjuste[],
  senaoCouber: { letra: number; compacto: boolean },
  cabe: (letra: number, compacto: boolean) => boolean,
): AjusteQuadro {
  for (const { compacto, minimo, maximo } of degraus) {
    const letra = maiorLetraQueCabe(minimo, maximo, (f) => cabe(f, compacto));
    if (letra !== null) return { letra, compacto, desliza: false };
  }
  return { ...senaoCouber, desliza: true };
}
