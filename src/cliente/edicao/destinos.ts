// Destinos do diálogo "Mover para…": casas, carrinhas e obras (com os grupos especiais), com a
// lotação do estado visível e o resultado se as pessoas forem para lá. Filtrar e andar com o teclado.
// Funções puras.

import type { Indices } from '../../dominio/indices';
import { type NivelLotacao, nivelLotacao } from '../../dominio/ocupacao';
import { type Alvo, chaveAlvo } from '../../dominio/operacoes';
import { compactar, normalizarTexto } from '../../dominio/pesquisa';
import type { Estado, Id, Pessoa } from '../../dominio/tipos';
import { formatarMatricula } from '../comum/Matricula';
import { comPlural, ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';

export type TipoDestino = 'casa' | 'carrinha' | 'obra';

export const ROTULO_SEM_OBRA_DESTINO = 'Sem obra';

export interface LotacaoDestino {
  ocupados: number;
  lugares: number;
  nivel: NivelLotacao;
  /** Ocupados se as pessoas forem para lá (quem já lá está não conta duas vezes). */
  depois: number;
  nivelDepois: NivelLotacao;
}

export interface Destino {
  /** chaveAlvo(alvo): única na lista. */
  chave: string;
  alvo: Alvo;
  tipo: TipoDestino;
  rotulo: string;
  detalhe: string | null;
  /** Fora das casas CMF / Sem transporte da empresa / Sem obra. */
  especial: boolean;
  /** Só casas e carrinhas. */
  lotacao: LotacaoDestino | null;
  /** Quantas pessoas lá estão agora (no estado visível). */
  pessoas: number;
  /** Quantas das pessoas a mover já lá estão. */
  jaLa: number;
  /** Todas as pessoas a mover já lá estão: escolher não muda nada. */
  todosJaLa: boolean;
  /** Cliente da obra (para a marca de cor). */
  clienteId: Id | null;
  /** Textos onde a pesquisa procura (já normalizados). */
  termos: string[];
  /** Textos compactos (matrículas), para "zz1001" encontrar "ZZ 1001". */
  termosCompactos: string[];
}

export interface GrupoDestinos {
  tipo: TipoDestino;
  titulo: string;
  destinos: Destino[];
}

/** "3 livres", "1 livre", "cheia", "2 a mais" (casas e carrinhas são femininas). */
export function textoLivres(ocupados: number, lugares: number): string {
  if (ocupados < lugares) return comPlural(lugares - ocupados, 'livre', 'livres');
  if (ocupados === lugares) return 'cheia';
  return `${ocupados - lugares} a mais`;
}

function lotacao(ocupados: number, lugares: number, entram: number): LotacaoDestino {
  const depois = ocupados + entram;
  return {
    ocupados,
    lugares,
    nivel: nivelLotacao(ocupados, lugares),
    depois,
    nivelDepois: nivelLotacao(depois, lugares),
  };
}

function termos(...textos: (string | null | undefined)[]): string[] {
  return textos.filter((t): t is string => Boolean(t?.trim())).map(normalizarTexto);
}

/**
 * Todos os destinos possíveis para estas pessoas, agrupados: Casas (+ Fora das casas CMF),
 * Carrinhas (+ Sem transporte da empresa) e, se houver obras, Obras (+ Sem obra).
 */
export function montarDestinos(estado: Estado, ind: Indices, pessoaIds: readonly Id[]): GrupoDestinos[] {
  const pessoas = [...new Set(pessoaIds)]
    .map((id) => ind.pessoas.get(id))
    .filter((p): p is Pessoa => p !== undefined);
  const contar = (estaLa: (p: Pessoa) => boolean) => pessoas.filter(estaLa).length;
  const n = pessoas.length;

  function destino(
    parcial: Omit<Destino, 'chave' | 'todosJaLa' | 'termosCompactos'> & { termosCompactos?: string[] },
  ): Destino {
    return {
      ...parcial,
      chave: chaveAlvo(parcial.alvo),
      todosJaLa: n > 0 && parcial.jaLa === n,
      termosCompactos: parcial.termosCompactos ?? [],
    };
  }

  const casas: Destino[] = estado.casas.map((casa) => {
    const jaLa = contar((p) => p.casaId === casa.id);
    const ocupados = ind.moradores.get(casa.id)?.length ?? 0;
    const local = ind.locais.get(casa.localId);
    const localDiferente = local && normalizarTexto(local.nome) !== normalizarTexto(casa.nome);
    return destino({
      alvo: { tipo: 'casa', id: casa.id },
      tipo: 'casa',
      rotulo: casa.nome,
      detalhe: localDiferente ? local.nome : null,
      especial: false,
      lotacao: lotacao(ocupados, casa.lotacao, n - jaLa),
      pessoas: ocupados,
      jaLa,
      clienteId: null,
      termos: termos(casa.nome, local?.nome, local?.morada, casa.apartamento),
    });
  });
  casas.push(
    destino({
      alvo: { tipo: 'fora' },
      tipo: 'casa',
      rotulo: ROTULO_FORA_DAS_CASAS,
      detalhe: null,
      especial: true,
      lotacao: null,
      pessoas: ind.foraDasCasas.length,
      jaLa: contar((p) => p.casaId === null || !ind.casas.has(p.casaId)),
      clienteId: null,
      termos: termos(ROTULO_FORA_DAS_CASAS, 'sem casa'),
    }),
  );

  const carrinhas: Destino[] = estado.carrinhas.map((carrinha) => {
    const jaLa = contar((p) => p.carrinhaId === carrinha.id);
    const ocupados = ind.passageiros.get(carrinha.id)?.length ?? 0;
    return destino({
      alvo: { tipo: 'carrinha', id: carrinha.id },
      tipo: 'carrinha',
      rotulo: formatarMatricula(carrinha.matricula),
      detalhe: carrinha.modelo,
      especial: false,
      lotacao: lotacao(ocupados, carrinha.lugares, n - jaLa),
      pessoas: ocupados,
      jaLa,
      clienteId: null,
      termos: termos(carrinha.modelo),
      termosCompactos: [carrinha.matricula, ...carrinha.matriculasAlternativas].map(compactar),
    });
  });
  carrinhas.push(
    destino({
      alvo: { tipo: 'sem-transporte' },
      tipo: 'carrinha',
      rotulo: ROTULO_SEM_TRANSPORTE,
      detalhe: null,
      especial: true,
      lotacao: null,
      pessoas: ind.semTransporte.length,
      jaLa: contar((p) => p.carrinhaId === null || !ind.carrinhas.has(p.carrinhaId)),
      clienteId: null,
      termos: termos(ROTULO_SEM_TRANSPORTE, 'sem carrinha'),
    }),
  );

  const grupos: GrupoDestinos[] = [
    { tipo: 'casa', titulo: 'Casas', destinos: casas },
    { tipo: 'carrinha', titulo: 'Carrinhas', destinos: carrinhas },
  ];

  if (estado.obras.length > 0) {
    const comparar = new Intl.Collator('pt', { sensitivity: 'base', numeric: true }).compare;
    const obras: Destino[] = [...estado.obras]
      .sort((a, b) => comparar(a.nome, b.nome))
      .map((obra) => {
        const cliente = ind.clientes.get(obra.clienteId);
        return destino({
          alvo: { tipo: 'obra', id: obra.id },
          tipo: 'obra',
          rotulo: obra.nome,
          detalhe: cliente?.nome ?? null,
          especial: false,
          lotacao: null,
          pessoas: ind.trabalhadores.get(obra.id)?.length ?? 0,
          jaLa: contar((p) => p.obraId === obra.id),
          clienteId: obra.clienteId,
          termos: termos(obra.nome, cliente?.nome, ind.locais.get(obra.localId)?.nome),
        });
      });
    obras.push(
      destino({
        alvo: { tipo: 'sem-obra' },
        tipo: 'obra',
        rotulo: ROTULO_SEM_OBRA_DESTINO,
        detalhe: null,
        especial: true,
        lotacao: null,
        pessoas: estado.pessoas.filter((p) => p.ativa && (p.obraId === null || !ind.obras.has(p.obraId)))
          .length,
        jaLa: contar((p) => p.obraId === null || !ind.obras.has(p.obraId)),
        clienteId: null,
        termos: termos(ROTULO_SEM_OBRA_DESTINO),
      }),
    );
    grupos.push({ tipo: 'obra', titulo: 'Obras', destinos: obras });
  }

  return grupos;
}

function corresponde(destino: Destino, termo: string, termoCompacto: string): boolean {
  if (destino.termos.some((t) => t.includes(termo))) return true;
  return termoCompacto.length > 0 && destino.termosCompactos.some((t) => t.includes(termoCompacto));
}

/** Só os grupos do tipo escolhido (null = todos) e os destinos que têm o texto. Grupos vazios saem. */
export function filtrarDestinos(
  grupos: readonly GrupoDestinos[],
  texto: string,
  tipo: TipoDestino | null,
): GrupoDestinos[] {
  const termo = normalizarTexto(texto);
  const termoCompacto = compactar(texto);
  return grupos
    .filter((g) => tipo === null || g.tipo === tipo)
    .map((g) => ({
      ...g,
      destinos: termo ? g.destinos.filter((d) => corresponde(d, termo, termoCompacto)) : g.destinos,
    }))
    .filter((g) => g.destinos.length > 0);
}

/** Destinos que se podem escolher, pela ordem em que aparecem (para as setas). */
export function destinosEscolhiveis(grupos: readonly GrupoDestinos[]): Destino[] {
  return grupos.flatMap((g) => g.destinos.filter((d) => !d.todosJaLa));
}

/**
 * Próximo destino ativo com ↑/↓ (a dar a volta), Home/End (primeiro/último). Se o ativo deixou de
 * estar na lista (o filtro mudou), começa no primeiro. null = lista vazia.
 */
export function proximoAtivo(
  escolhiveis: readonly Destino[],
  atual: string | null,
  tecla: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
): string | null {
  const total = escolhiveis.length;
  if (total === 0) return null;
  if (tecla === 'Home') return escolhiveis[0]?.chave ?? null;
  if (tecla === 'End') return escolhiveis[total - 1]?.chave ?? null;
  const i = atual === null ? -1 : escolhiveis.findIndex((d) => d.chave === atual);
  if (i < 0) return (tecla === 'ArrowDown' ? escolhiveis[0] : escolhiveis[total - 1])?.chave ?? null;
  const j = (i + (tecla === 'ArrowDown' ? 1 : -1) + total) % total;
  return escolhiveis[j]?.chave ?? null;
}

/** O ativo, se ainda estiver na lista; senão o primeiro escolhível (ou null). */
export function ativoValido(escolhiveis: readonly Destino[], atual: string | null): string | null {
  if (atual !== null && escolhiveis.some((d) => d.chave === atual)) return atual;
  return escolhiveis[0]?.chave ?? null;
}

/** Título do diálogo: "Mudar a casa de Ana", "Mover 3 pessoas para…". */
export function tituloMover(nomes: readonly string[], tipo: TipoDestino | null): string {
  const quem = nomes.length === 1 ? (nomes[0] as string) : comPlural(nomes.length, 'pessoa', 'pessoas');
  if (nomes.length === 1 && tipo !== null) {
    const campo = tipo === 'casa' ? 'a casa' : tipo === 'carrinha' ? 'a carrinha' : 'a obra';
    return `Mudar ${campo} de ${quem}`;
  }
  return `Mover ${quem} para…`;
}
