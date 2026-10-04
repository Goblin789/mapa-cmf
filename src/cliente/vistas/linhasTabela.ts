// Vista Tabela: uma linha por pessoa ativa, com ordenação por coluna, pesquisa (indiferente a acentos)
// e filtros por cliente, casa e carrinha, e o realce do que está em foco (a ficha). Funções puras, sem
// browser (usadas também pelo Excel).

import { clienteEfetivoId } from '../../dominio/cores';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import { compactar, normalizarTexto } from '../../dominio/pesquisa';
import type { Carrinha, Casa, Cliente, Estado, Id, Obra, Pessoa } from '../../dominio/tipos';
import { carrinhaConduzida } from '../paineis/condutor';
import { nomeCompleto } from '../paineis/textos';

export interface LinhaTabela {
  pessoa: Pessoa;
  /** Nome curto (o do mapa). */
  nome: string;
  nomeCompleto: string;
  numero: string | null;
  /** O cliente que dá a cor: o da obra, ou o da pessoa enquanto não tem obra. */
  clienteId: Id;
  cliente: Cliente | null;
  obra: Obra | null;
  /** null = fora das casas CMF. */
  casa: Casa | null;
  /** null = sem transporte da empresa. */
  carrinha: Carrinha | null;
  /** Conduz a carrinha onde vai. */
  condutor: boolean;
  casaAConfirmar: boolean;
  carrinhaAConfirmar: boolean;
  /** Tudo o que a pesquisa procura, já normalizado: nomes, cliente, obra, casa e matrículas. */
  textoPesquisa: string;
}

/** Uma linha por pessoa ativa, pela ordem do estado (quem mostra ordena). */
export function linhasDaTabela(estado: Estado, ind: Indices): LinhaTabela[] {
  return estado.pessoas
    .filter((p) => p.ativa)
    .map((p) => {
      const clienteId = clienteEfetivoId(p, ind.obras);
      const cliente = ind.clientes.get(clienteId) ?? null;
      const obra = p.obraId ? (ind.obras.get(p.obraId) ?? null) : null;
      const casa = p.casaId ? (ind.casas.get(p.casaId) ?? null) : null;
      const carrinha = p.carrinhaId ? (ind.carrinhas.get(p.carrinhaId) ?? null) : null;
      const completo = nomeCompleto(p);
      const matriculas = carrinha
        ? [carrinha.matricula, formatarMatricula(carrinha.matricula), ...carrinha.matriculasAlternativas]
        : [];
      return {
        pessoa: p,
        nome: p.nomeCurto,
        nomeCompleto: completo,
        numero: p.numero,
        clienteId,
        cliente,
        obra,
        casa,
        carrinha,
        condutor: carrinhaConduzida(p, ind) !== null,
        casaAConfirmar: p.casaAConfirmar,
        carrinhaAConfirmar: p.carrinhaAConfirmar,
        textoPesquisa: normalizarTexto(
          [
            p.nomeCurto,
            completo,
            ...p.nomesAlternativos,
            cliente?.nome,
            cliente?.sigla,
            obra?.nome,
            casa?.nome,
            ...matriculas,
          ]
            .filter(Boolean)
            .join(' · '),
        ),
      };
    });
}

// --- Ordenação ------------------------------------------------------------------------------------

export type ColunaTabela =
  | 'nome'
  | 'numero'
  | 'cliente'
  | 'obra'
  | 'casa'
  | 'carrinha'
  | 'condutor'
  | 'aConfirmar';

export const COLUNAS_TABELA: readonly { id: ColunaTabela; rotulo: string }[] = [
  { id: 'nome', rotulo: 'Nome' },
  { id: 'numero', rotulo: 'Nº' },
  { id: 'cliente', rotulo: 'Cliente' },
  { id: 'obra', rotulo: 'Obra' },
  { id: 'casa', rotulo: 'Casa' },
  { id: 'carrinha', rotulo: 'Carrinha' },
  { id: 'condutor', rotulo: 'Condutor' },
  { id: 'aConfirmar', rotulo: 'A confirmar' },
];

export type Direcao = 'asc' | 'desc';

export interface OrdemTabela {
  coluna: ColunaTabela;
  direcao: Direcao;
}

export const ORDEM_INICIAL: OrdemTabela = { coluna: 'nome', direcao: 'asc' };

/** Clicar na coluna já ordenada inverte; noutra coluna começa por ordem crescente. */
export function proximaOrdem(atual: OrdemTabela, coluna: ColunaTabela): OrdemTabela {
  if (atual.coluna !== coluna) return { coluna, direcao: 'asc' };
  return { coluna, direcao: atual.direcao === 'asc' ? 'desc' : 'asc' };
}

const comparador = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

/** Valor de ordenação; null = vazio (fica sempre no fim, seja qual for a direção). */
function valor(l: LinhaTabela, coluna: ColunaTabela): string | number | null {
  switch (coluna) {
    case 'nome':
      return l.nome;
    case 'numero':
      return l.numero;
    case 'cliente':
      return l.cliente ? l.cliente.ordem : null;
    case 'obra':
      return l.obra?.nome ?? null;
    case 'casa':
      // Pela ordem das casas (a do Michael: as de Himeling juntas), não pelo alfabeto.
      return l.casa ? l.casa.ordem : null;
    case 'carrinha':
      return l.carrinha ? formatarMatricula(l.carrinha.matricula) : null;
    case 'condutor':
      // Crescente = quem conduz primeiro.
      return l.condutor ? 0 : 1;
    case 'aConfirmar':
      return l.casaAConfirmar || l.carrinhaAConfirmar ? 0 : 1;
  }
}

function comparar(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return comparador.compare(String(a), String(b));
}

/** Ordena pela coluna; os vazios ficam no fim e os empates vão pelo nome. Não muda a lista recebida. */
export function ordenarLinhas(linhas: readonly LinhaTabela[], ordem: OrdemTabela): LinhaTabela[] {
  const sinal = ordem.direcao === 'asc' ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const va = valor(a, ordem.coluna);
    const vb = valor(b, ordem.coluna);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else {
      const c = comparar(va, vb);
      if (c !== 0) return c * sinal;
    }
    return comparador.compare(a.nome, b.nome) || a.pessoa.id.localeCompare(b.pessoa.id);
  });
}

/** Valor do atributo aria-sort do cabeçalho de uma coluna. */
export function ariaSort(ordem: OrdemTabela, coluna: ColunaTabela): 'ascending' | 'descending' | 'none' {
  if (ordem.coluna !== coluna) return 'none';
  return ordem.direcao === 'asc' ? 'ascending' : 'descending';
}

// --- Filtros --------------------------------------------------------------------------------------

/** Valor especial dos filtros de casa e de carrinha: quem não tem. */
export const SEM = '__sem__';

export interface FiltrosTabela {
  texto: string;
  /** Cliente da cor da pessoa; null = todos. */
  clienteId: Id | null;
  /** Id da casa, SEM (fora das casas) ou null (todas). */
  casa: Id | null;
  /** Id da carrinha, SEM (sem transporte) ou null (todas). */
  carrinha: Id | null;
  soAConfirmar: boolean;
}

export const FILTROS_INICIAIS: FiltrosTabela = {
  texto: '',
  clienteId: null,
  casa: null,
  carrinha: null,
  soAConfirmar: false,
};

export function filtrosTabelaAtivos(f: FiltrosTabela): boolean {
  return (
    normalizarTexto(f.texto) !== '' ||
    f.clienteId !== null ||
    f.casa !== null ||
    f.carrinha !== null ||
    f.soAConfirmar
  );
}

function passaNoFiltro(id: Id | null, filtro: Id | null): boolean {
  if (filtro === null) return true;
  return filtro === SEM ? id === null : id === filtro;
}

/**
 * Linhas que passam os filtros. O texto procura em todas as palavras (cada uma tem de aparecer em
 * algum lado: "ana steinsel" encontra a Ana que mora em Steinsel) e no Nº (sem espaços nem hífenes).
 */
export function filtrarLinhas(linhas: readonly LinhaTabela[], f: FiltrosTabela): LinhaTabela[] {
  const palavras = normalizarTexto(f.texto).split(' ').filter(Boolean);
  const compacto = compactar(f.texto);
  return linhas.filter((l) => {
    if (f.clienteId !== null && l.clienteId !== f.clienteId) return false;
    if (!passaNoFiltro(l.casa?.id ?? null, f.casa)) return false;
    if (!passaNoFiltro(l.carrinha?.id ?? null, f.carrinha)) return false;
    if (f.soAConfirmar && !(l.casaAConfirmar || l.carrinhaAConfirmar)) return false;
    if (palavras.length === 0) return true;
    if (palavras.every((p) => l.textoPesquisa.includes(p))) return true;
    return l.numero !== null && compacto.length >= 2 && compactar(l.numero).includes(compacto);
  });
}

/** "a confirmar: casa", "casa e carrinha"… (texto para o Excel e para os leitores de ecrã). */
export function textoAConfirmar(l: Pick<LinhaTabela, 'casaAConfirmar' | 'carrinhaAConfirmar'>): string {
  if (l.casaAConfirmar && l.carrinhaAConfirmar) return 'casa e carrinha';
  if (l.casaAConfirmar) return 'casa';
  if (l.carrinhaAConfirmar) return 'carrinha';
  return '';
}

/** "137 pessoas" ou, com filtros, "12 de 137 pessoas". */
export function textoContagem(mostradas: number, total: number, comFiltros: boolean): string {
  const unidade = (n: number) => (n === 1 ? 'pessoa' : 'pessoas');
  return comFiltros ? `${mostradas} de ${total} ${unidade(total)}` : `${total} ${unidade(total)}`;
}

// --- Foco e "mostrar" -----------------------------------------------------------------------------

/** O que está em foco (a ficha aberta): uma pessoa, casa ou carrinha. */
export type FocoTabela = { tipo: 'pessoa' | 'casa' | 'carrinha'; id: Id } | null;

/**
 * Realce persistente de uma linha: 'foco' = a pessoa da ficha; 'ligada' = mora na casa (ou vai na
 * carrinha) da ficha; null = nenhum.
 */
export function realceDaLinha(
  linha: Pick<LinhaTabela, 'pessoa' | 'casa' | 'carrinha'>,
  foco: FocoTabela,
): 'foco' | 'ligada' | null {
  if (!foco) return null;
  if (foco.tipo === 'pessoa') return foco.id === linha.pessoa.id ? 'foco' : null;
  const sitio = foco.tipo === 'casa' ? linha.casa : linha.carrinha;
  return sitio?.id === foco.id ? 'ligada' : null;
}

/**
 * As linhas que mostram um elemento (pesquisa, contadores, ligações da ficha): a pessoa, ou quem mora
 * na casa / vai na carrinha, pela ordem recebida.
 */
export function pessoasDoElemento(
  linhas: readonly Pick<LinhaTabela, 'pessoa' | 'casa' | 'carrinha'>[],
  elemento: NonNullable<FocoTabela>,
): Id[] {
  if (elemento.tipo === 'pessoa') return [elemento.id];
  return linhas.filter((l) => realceDaLinha(l, elemento) === 'ligada').map((l) => l.pessoa.id);
}

// --- Seleção pelas caixas --------------------------------------------------------------------------

/**
 * A seleção depois da caixa "todas as visíveis": marcar junta as visíveis; desmarcar tira só as visíveis.
 * Quem está selecionado e os filtros escondem (ou foi selecionado noutra vista) fica selecionado.
 */
export function selecaoComVisiveis(selecao: ReadonlySet<Id>, visiveis: readonly Id[], marcar: boolean): Id[] {
  if (marcar) return [...new Set([...selecao, ...visiveis])];
  const tirar = new Set(visiveis);
  return [...selecao].filter((id) => !tirar.has(id));
}

/**
 * Modo da caixa de uma linha: com Shift, o intervalo desde a âncora (pela ordem visível) se a âncora
 * estiver à vista; senão (escondida por um filtro, ou posta noutra vista) só junta ou tira esta linha,
 * em vez de deitar fora a seleção.
 */
export function modoDaCaixa(
  comShift: boolean,
  ancora: Id | null,
  ordemVisivel: readonly Id[],
): 'intervalo' | 'alternar' {
  return comShift && ancora !== null && ordemVisivel.includes(ancora) ? 'intervalo' : 'alternar';
}

// --- Manter à vista -------------------------------------------------------------------------------

/** Retângulo no ecrã (o que interessa de um DOMRect). */
export interface Caixa {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * A parte da caixa da tabela onde uma linha se vê: por baixo do cabeçalho fixo e, quando a ficha tapa
 * o princípio das linhas (no telemóvel fica em baixo, a toda a largura), por cima da ficha. No PC a ficha
 * fica à direita e não tapa a célula do nome: não conta. Uma ficha escondida tem o retângulo vazio.
 */
export function zonaLivreDaTabela(
  contentor: Caixa,
  fundoCabecalho: number,
  ficha: Caixa | null,
  primeiraCelula: Pick<Caixa, 'left' | 'right'>,
): { top: number; bottom: number } {
  const top = Math.max(contentor.top, fundoCabecalho);
  let bottom = contentor.bottom;
  const tapa =
    ficha !== null &&
    ficha.bottom > ficha.top &&
    ficha.left < primeiraCelula.right &&
    ficha.right > primeiraCelula.left &&
    ficha.top > top &&
    ficha.top < bottom;
  if (tapa) bottom = ficha.top;
  return { top, bottom };
}

/**
 * Quanto deslizar (scrollTop) para a linha ficar inteira na zona livre, com uma pequena folga: 0 se já
 * se vê; se não couber, fica com o topo no topo da zona.
 */
export function deslocamentoParaVer(
  linha: Pick<Caixa, 'top' | 'bottom'>,
  zona: { top: number; bottom: number },
  folga = 8,
): number {
  if (linha.top >= zona.top && linha.bottom <= zona.bottom) return 0;
  const altura = linha.bottom - linha.top;
  const livre = zona.bottom - zona.top;
  const margem = Math.max(0, Math.min(folga, (livre - altura) / 2));
  if (linha.top < zona.top || altura > livre) return Math.round(linha.top - zona.top - margem);
  return Math.round(linha.bottom - zona.bottom + margem);
}
