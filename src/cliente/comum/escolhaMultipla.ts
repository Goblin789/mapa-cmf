// Filtro de escolha múltipla (FiltroMultiplo.tsx; Tabela: Cliente, Casa, Carrinha, Obra; Quadro: Obras): decisões puras.
// Aqui fica o que se pode testar sem browser — o texto do botão,
// a pesquisa na lista (indiferente a acentos e maiúsculas), alternar/escolher todas/limpar, as secções e a
// posição do painel no ecrã.
//
// Regra das escolhas: um conjunto VAZIO quer dizer "sem filtro" (todas as opções passam). Com escolhas,
// passa quem tiver pelo menos uma delas (OU dentro do mesmo filtro); entre filtros diferentes é E, e isso
// é de quem usa o filtro (`passaFiltro` ajuda).

import { compactar, normalizarTexto } from '../../dominio/pesquisa';

/** Uma opção da lista. `valor` é a chave estável (ex.: o id da casa ou um valor especial como "sem"). */
export interface OpcaoFiltro {
  valor: string;
  /** Texto principal da opção (ex.: "Casa 1 Puttelange", "CF 5005"). Também é o texto do botão com uma só escolha. */
  rotulo: string;
  /** Texto secundário, mais claro, à direita do rótulo (ex.: a obra ou o cliente). Também conta na pesquisa. */
  detalhe?: string;
  /**
   * Secção da opção. Sem grupo = a lista principal. As opções do mesmo grupo ficam juntas e cada secção
   * fica separada das outras por uma linha, pela ordem em que o grupo aparece pela primeira vez em `opcoes`.
   * O nome do grupo aparece como título pequeno, exceto em `GRUPO_ESPECIAIS` (só a linha), que é o das
   * opções especiais ("Fora das casas CMF", "Sem transporte", "Sem obra").
   */
  grupo?: string;
  /** Não se pode escolher (ex.: "Sem obras" enquanto não há obras). Fica à vista, esbatida. */
  desativada?: boolean;
  /** Número à direita (ex.: pessoas nessa casa). Opcional. */
  contagem?: number;
  /** Texto extra que a pesquisa também encontra mas não se mostra (ex.: nomes antigos, a sigla). */
  termos?: string;
}

/** Grupo das opções especiais: separadas das outras por uma linha, sem título. */
export const GRUPO_ESPECIAIS = 'especiais';

/** A partir de quantas opções aparece o campo para filtrar a lista. */
export const LIMIAR_PESQUISA = 8;

/** Concordância das palavras no botão: "Casa: todas / 2 escolhidas", "Cliente: todos / 2 escolhidos". */
export type Genero = 'f' | 'm';

/**
 * O que um filtro faz a um valor: sem escolhas passa tudo; com escolhas, passa se o valor (ou algum dos
 * valores, ex.: uma pessoa com mais de um cliente) estiver escolhido.
 */
export function passaFiltro(
  escolhidos: ReadonlySet<string>,
  valor: string | null | undefined | readonly (string | null | undefined)[],
): boolean {
  if (escolhidos.size === 0) return true;
  const valores = Array.isArray(valor) ? valor : [valor];
  return valores.some((v) => v != null && escolhidos.has(v));
}

/** Há pelo menos uma opção que se pode escolher. */
export function temOpcoesAtivas(opcoes: readonly OpcaoFiltro[]): boolean {
  return opcoes.some((o) => !o.desativada);
}

/** Partes do texto do botão, para o componente poder mostrar o número numa pastilha. */
export interface RotuloBotao {
  /** O texto inteiro, para leitores de ecrã e testes: "Casa: todas", "Casa: Casa 1", "Casa: 2 escolhidas". */
  texto: string;
  /** O que vem depois de "Casa: ". */
  valor: string;
  /** Número de escolhas quando são duas ou mais (o componente mostra "Casa" + pastilha); senão null. */
  numero: number | null;
  /** Lista completa das escolhas (para o title): "Casa 1, Casa 2". Vazia sem escolhas. */
  lista: string;
  /** Não há nada para escolher (botão desativado). */
  vazio: boolean;
}

/**
 * Texto do botão. Sem escolhas: "Casa: todas"; uma: o rótulo dela ("Casa: Casa 1 Puttelange"); várias:
 * "Casa: 2 escolhidas". Sem opções que se possam escolher (e sem escolhas): "Obra: sem obras" (`textoVazio`).
 * Uma escolha que já não está nas opções conta na mesma (o filtro continua a valer).
 */
export function rotuloBotao(
  rotulo: string,
  opcoes: readonly OpcaoFiltro[],
  escolhidos: ReadonlySet<string>,
  { genero = 'f', textoVazio = 'sem opções' }: { genero?: Genero; textoVazio?: string } = {},
): RotuloBotao {
  const porValor = new Map(opcoes.map((o) => [o.valor, o]));
  // Pela ordem das opções (não pela ordem em que se escolheram); as desconhecidas no fim.
  const nomes = [
    ...opcoes.filter((o) => escolhidos.has(o.valor)).map((o) => o.rotulo),
    ...[...escolhidos].filter((v) => !porValor.has(v)),
  ];
  const lista = nomes.join(', ');
  const n = escolhidos.size;
  let valor: string;
  let numero: number | null = null;
  let vazio = false;
  if (n === 0) {
    vazio = !temOpcoesAtivas(opcoes);
    valor = vazio ? textoVazio : genero === 'f' ? 'todas' : 'todos';
  } else if (n === 1) {
    const [unico] = escolhidos;
    valor = porValor.get(unico as string)?.rotulo ?? (genero === 'f' ? '1 escolhida' : '1 escolhido');
  } else {
    numero = n;
    valor = `${n} ${genero === 'f' ? 'escolhidas' : 'escolhidos'}`;
  }
  return { texto: `${rotulo}: ${valor}`, valor, numero, lista, vazio };
}

/**
 * As opções que correspondem ao texto da pesquisa: todas as palavras têm de aparecer no rótulo, no
 * detalhe ou nos termos, sem acentos nem maiúsculas ("puttelange", "cf5005" encontra "CF 5005").
 * Texto vazio = todas. Mantém a ordem.
 */
export function filtrarOpcoes<T extends OpcaoFiltro>(opcoes: readonly T[], texto: string): T[] {
  const consulta = normalizarTexto(texto);
  if (!consulta) return [...opcoes];
  const palavras = consulta.split(' ');
  const consultaCompacta = compactar(texto);
  return opcoes.filter((o) => {
    const alvo = normalizarTexto([o.rotulo, o.detalhe, o.termos].filter(Boolean).join(' '));
    if (palavras.every((p) => alvo.includes(p))) return true;
    // Matrículas e números escritos sem espaços ou com hífenes.
    return consultaCompacta.length > 0 && compactar(alvo).includes(consultaCompacta);
  });
}

/** Liga ou desliga uma opção. Devolve um conjunto novo. */
export function alternarEscolha(escolhidos: ReadonlySet<string>, valor: string): Set<string> {
  const novos = new Set(escolhidos);
  if (novos.has(valor)) novos.delete(valor);
  else novos.add(valor);
  return novos;
}

/**
 * Junta às escolhas todas as opções que se podem escolher de `visiveis` (a lista inteira, ou só as que a
 * pesquisa mostra). Devolve um conjunto novo.
 */
export function escolherTodas(
  escolhidos: ReadonlySet<string>,
  visiveis: readonly OpcaoFiltro[],
): Set<string> {
  const novos = new Set(escolhidos);
  for (const o of visiveis) if (!o.desativada) novos.add(o.valor);
  return novos;
}

/** Todas as opções que se podem escolher de `visiveis` já estão escolhidas (o "Todas" não faria nada). */
export function todasEscolhidas(escolhidos: ReadonlySet<string>, visiveis: readonly OpcaoFiltro[]): boolean {
  return visiveis.every((o) => o.desativada || escolhidos.has(o.valor));
}

/** Uma secção da lista: o grupo (undefined = lista principal) e as suas opções, pela ordem dada. */
export interface SecaoFiltro<T extends OpcaoFiltro = OpcaoFiltro> {
  grupo: string | undefined;
  /** Título a mostrar (null sem título: lista principal e opções especiais). */
  titulo: string | null;
  opcoes: T[];
}

/** Junta as opções por grupo, pela ordem em que cada grupo aparece pela primeira vez. Sem secções vazias. */
export function seccionarOpcoes<T extends OpcaoFiltro>(opcoes: readonly T[]): SecaoFiltro<T>[] {
  const secoes = new Map<string | undefined, SecaoFiltro<T>>();
  for (const o of opcoes) {
    const grupo = o.grupo || undefined;
    let secao = secoes.get(grupo);
    if (!secao) {
      secao = { grupo, titulo: grupo === undefined || grupo === GRUPO_ESPECIAIS ? null : grupo, opcoes: [] };
      secoes.set(grupo, secao);
    }
    secao.opcoes.push(o);
  }
  return [...secoes.values()];
}

// --- Posição do painel ------------------------------------------------------------------------------

/** O retângulo do botão no ecrã (o que interessa de um DOMRect). */
export interface RetanguloBotao {
  top: number;
  bottom: number;
  left: number;
}

/** Posição (fixa) do painel: `top` OU `bottom` (abre para cima quando não cabe por baixo). */
export interface PosicaoPainel {
  left: number;
  largura: number;
  top?: number;
  bottom?: number;
  alturaMaxima: number;
}

/** Espaço entre o botão e o painel (px). */
const FOLGA_BOTAO = 4;
/** Altura mínima que se quer por baixo antes de pensar em abrir para cima (px). */
const ALTURA_MINIMA_BAIXO = 240;
/** Abaixo desta largura (o `sm:` do Tailwind) o painel ocupa a largura toda do ecrã, menos as margens. */
export const LARGURA_TELEMOVEL = 640;

/**
 * Onde pôr o painel, fixo no ecrã: alinhado à esquerda do botão e com a largura pedida, mas sempre dentro
 * do ecrã com `margem` de cada lado. No telemóvel (abaixo de 640 px) ocupa a largura toda menos as margens
 * (359 px num ecrã de 375): alvos de toque maiores e o cabeçalho do painel cabe. Abre por baixo do botão;
 * só abre para cima se por baixo houver menos de 240 px e por cima houver mais. A altura máxima é o espaço
 * que sobra até à borda (nunca mais do que `alturaMaximaDesejada`).
 */
export function posicaoPainel(
  botao: RetanguloBotao,
  janela: { largura: number; altura: number },
  larguraDesejada: number,
  { margem = 8, alturaMaximaDesejada = 420 }: { margem?: number; alturaMaximaDesejada?: number } = {},
): PosicaoPainel {
  const maxima = janela.largura - 2 * margem;
  const largura = Math.max(
    0,
    janela.largura < LARGURA_TELEMOVEL ? maxima : Math.min(larguraDesejada, maxima),
  );
  const left = Math.max(margem, Math.min(botao.left, janela.largura - margem - largura));
  const espacoBaixo = janela.altura - botao.bottom - FOLGA_BOTAO - margem;
  const espacoCima = botao.top - FOLGA_BOTAO - margem;
  if (espacoBaixo < ALTURA_MINIMA_BAIXO && espacoCima > espacoBaixo) {
    return {
      left,
      largura,
      bottom: janela.altura - botao.top + FOLGA_BOTAO,
      alturaMaxima: Math.max(0, Math.min(alturaMaximaDesejada, espacoCima)),
    };
  }
  return {
    left,
    largura,
    top: botao.bottom + FOLGA_BOTAO,
    alturaMaxima: Math.max(0, Math.min(alturaMaximaDesejada, espacoBaixo)),
  };
}

/**
 * Próximo índice com ↑/↓/Início/Fim numa lista de `total` caixas, sem dar a volta. `atual` = -1 quando o
 * foco está no campo da pesquisa (↓ vai para a primeira). Devolve -1 para "volta à pesquisa" (↑ na primeira).
 */
export function proximaCaixa(
  atual: number,
  total: number,
  tecla: 'ArrowDown' | 'ArrowUp' | 'Home' | 'End',
): number {
  if (total <= 0) return -1;
  switch (tecla) {
    case 'Home':
      return 0;
    case 'End':
      return total - 1;
    case 'ArrowDown':
      return Math.min(atual + 1, total - 1);
    case 'ArrowUp':
      return atual <= 0 ? -1 : atual - 1;
  }
}
