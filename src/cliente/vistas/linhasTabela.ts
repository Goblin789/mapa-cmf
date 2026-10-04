// Vista Tabela: uma linha por pessoa ativa, com ordenação por coluna, pesquisa (indiferente a acentos),
// filtros de escolha múltipla por cliente, casa, carrinha e obra, e o realce do que está em foco (a ficha)
// ou da linha em que se clicou. Funções puras, sem browser (usadas também pelo Excel).

import { clienteEfetivoId } from '../../dominio/cores';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import { nomeComMaiusculasNormais } from '../../dominio/nomes';
import { compactar, normalizarTexto } from '../../dominio/pesquisa';
import type { Carrinha, Casa, Cliente, Estado, Id, Obra, Pessoa } from '../../dominio/tipos';
import { GRUPO_ESPECIAIS, type OpcaoFiltro, passaFiltro } from '../comum/escolhaMultipla';
import { carrinhaConduzida } from '../paineis/condutor';
import { nomeCompleto, ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';

export interface LinhaTabela {
  pessoa: Pessoa;
  /** Nome curto (o do mapa). */
  nome: string;
  /** Nome e apelidos como estão guardados (sem eles, o nome curto). */
  nomeCompleto: string;
  /**
   * O nome que a Tabela e o Excel mostram (e pelo qual ordenam): o completo com maiúsculas normais
   * ("Cipriano da Silva"); sem nome completo, o nome curto.
   */
  nomeMostrado: string;
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
      const temCompleto = `${p.nome}${p.apelidos}`.trim() !== '';
      const matriculas = carrinha
        ? [carrinha.matricula, formatarMatricula(carrinha.matricula), ...carrinha.matriculasAlternativas]
        : [];
      return {
        pessoa: p,
        nome: p.nomeCurto,
        nomeCompleto: completo,
        nomeMostrado: temCompleto ? nomeComMaiusculasNormais(completo) : p.nomeCurto,
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
      return l.nomeMostrado;
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

/**
 * Ordena pela coluna; os vazios ficam no fim e os empates vão pelo nome (o mostrado). Não muda a lista
 * recebida.
 */
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
    return comparador.compare(a.nomeMostrado, b.nomeMostrado) || a.pessoa.id.localeCompare(b.pessoa.id);
  });
}

/** Valor do atributo aria-sort do cabeçalho de uma coluna. */
export function ariaSort(ordem: OrdemTabela, coluna: ColunaTabela): 'ascending' | 'descending' | 'none' {
  if (ordem.coluna !== coluna) return 'none';
  return ordem.direcao === 'asc' ? 'ascending' : 'descending';
}

// --- Filtros --------------------------------------------------------------------------------------

/** Valor especial dos filtros de casa, carrinha e obra: quem não tem (fora das casas, sem transporte, sem obra). */
export const SEM = '__sem__';

/**
 * Filtros da Tabela. Cliente, Casa, Carrinha e Obra são de escolha múltipla (comum/FiltroMultiplo): um
 * conjunto VAZIO é sem filtro; dentro do mesmo filtro basta uma das escolhas (Casa 1 OU Casa 2); entre
 * filtros diferentes têm de passar todos (E).
 */
export interface FiltrosTabela {
  texto: string;
  /** Clientes da cor da pessoa (o da obra, ou o da pessoa enquanto não tem obra). */
  clientes: ReadonlySet<Id>;
  /** Ids das casas e/ou SEM (fora das casas CMF). */
  casas: ReadonlySet<string>;
  /** Ids das carrinhas e/ou SEM (sem transporte da empresa). */
  carrinhas: ReadonlySet<string>;
  /** Ids das obras e/ou SEM (sem obra). */
  obras: ReadonlySet<string>;
  soAConfirmar: boolean;
}

export const FILTROS_INICIAIS: FiltrosTabela = {
  texto: '',
  clientes: new Set(),
  casas: new Set(),
  carrinhas: new Set(),
  obras: new Set(),
  soAConfirmar: false,
};

export function filtrosTabelaAtivos(f: FiltrosTabela): boolean {
  return (
    normalizarTexto(f.texto) !== '' ||
    f.clientes.size > 0 ||
    f.casas.size > 0 ||
    f.carrinhas.size > 0 ||
    f.obras.size > 0 ||
    f.soAConfirmar
  );
}

/**
 * Linhas que passam os filtros. O texto procura em todas as palavras (cada uma tem de aparecer em
 * algum lado: "ana steinsel" encontra a Ana que mora em Steinsel) e no Nº (sem espaços nem hífenes).
 */
export function filtrarLinhas(linhas: readonly LinhaTabela[], f: FiltrosTabela): LinhaTabela[] {
  const palavras = normalizarTexto(f.texto).split(' ').filter(Boolean);
  const compacto = compactar(f.texto);
  return linhas.filter((l) => {
    if (!passaFiltro(f.clientes, l.clienteId)) return false;
    if (!passaFiltro(f.casas, l.casa?.id ?? SEM)) return false;
    if (!passaFiltro(f.carrinhas, l.carrinha?.id ?? SEM)) return false;
    if (!passaFiltro(f.obras, l.obra?.id ?? SEM)) return false;
    if (f.soAConfirmar && !(l.casaAConfirmar || l.carrinhaAConfirmar)) return false;
    if (palavras.length === 0) return true;
    if (palavras.every((p) => l.textoPesquisa.includes(p))) return true;
    return l.numero !== null && compacto.length >= 2 && compactar(l.numero).includes(compacto);
  });
}

/** As opções dos quatro filtros da barra (sem as marcas dos clientes, que são da interface). */
export interface OpcoesFiltrosTabela {
  clientes: OpcaoFiltro[];
  casas: OpcaoFiltro[];
  carrinhas: OpcaoFiltro[];
  /** Vazia enquanto não há obras: o filtro fica desativado ("Obra: sem obras"). */
  obras: OpcaoFiltro[];
}

/** Rótulos das opções especiais dos filtros (quem não tem). */
export const ROTULO_FILTRO_SEM_OBRA = 'Sem obra';

/**
 * As opções dos filtros, com o número de pessoas de cada uma (de todas as linhas, não só das filtradas:
 * o número não muda ao escolher). Clientes pela ordem; casas pela ordem das casas (a do Michael); carrinhas
 * pela matrícula (os carros com "carro" ao lado); obras pela ordem do cliente e pelo nome, numa secção por cliente. As opções especiais
 * (fora das casas, sem transporte, sem obra) ficam no fim, separadas. Sem obras, a lista das obras fica
 * vazia (o "Sem obra" seria toda a gente).
 */
export function opcoesFiltrosTabela(
  estado: Pick<Estado, 'clientes' | 'casas' | 'carrinhas' | 'obras'>,
  ind: Pick<Indices, 'clientes'>,
  linhas: readonly LinhaTabela[],
): OpcoesFiltrosTabela {
  const contar = (chave: (l: LinhaTabela) => string) => {
    const n = new Map<string, number>();
    for (const l of linhas) n.set(chave(l), (n.get(chave(l)) ?? 0) + 1);
    return (valor: string) => n.get(valor) ?? 0;
  };
  const porCliente = contar((l) => l.clienteId);
  const porCasa = contar((l) => l.casa?.id ?? SEM);
  const porCarrinha = contar((l) => l.carrinha?.id ?? SEM);
  const porObra = contar((l) => l.obra?.id ?? SEM);

  const clientes = [...estado.clientes]
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt'))
    .map((c) => ({ valor: c.id, rotulo: c.nome, termos: c.sigla, contagem: porCliente(c.id) }));
  const casas: OpcaoFiltro[] = [...estado.casas]
    .sort((a, b) => a.ordem - b.ordem)
    .map((c) => ({ valor: c.id, rotulo: c.nome, contagem: porCasa(c.id) }));
  casas.push({
    valor: SEM,
    rotulo: ROTULO_FORA_DAS_CASAS,
    grupo: GRUPO_ESPECIAIS,
    contagem: porCasa(SEM),
  });
  const carrinhas: OpcaoFiltro[] = [...estado.carrinhas]
    .map((c) => ({ c, rotulo: formatarMatricula(c.matricula) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt'))
    .map(({ c, rotulo }) => ({
      valor: c.id,
      rotulo,
      // Os carros também estão no filtro "Carrinha": diz-se quais são.
      ...(c.tipo === 'carro' ? { detalhe: 'carro' } : {}),
      termos: [c.matricula, ...c.matriculasAlternativas].join(' '),
      contagem: porCarrinha(c.id),
    }));
  carrinhas.push({
    valor: SEM,
    rotulo: ROTULO_SEM_TRANSPORTE,
    grupo: GRUPO_ESPECIAIS,
    contagem: porCarrinha(SEM),
  });
  const ordemCliente = (id: Id) => ind.clientes.get(id)?.ordem ?? Number.MAX_SAFE_INTEGER;
  const obras: OpcaoFiltro[] = [...estado.obras]
    .sort(
      (a, b) =>
        ordemCliente(a.clienteId) - ordemCliente(b.clienteId) ||
        comparador.compare(a.clienteId, b.clienteId) ||
        comparador.compare(a.nome, b.nome),
    )
    .map((o) => {
      const cliente = ind.clientes.get(o.clienteId);
      return {
        valor: o.id,
        rotulo: o.nome,
        grupo: cliente?.nome ?? 'Outro cliente',
        termos: cliente?.sigla,
        contagem: porObra(o.id),
      };
    });
  if (obras.length > 0)
    obras.push({
      valor: SEM,
      rotulo: ROTULO_FILTRO_SEM_OBRA,
      grupo: GRUPO_ESPECIAIS,
      contagem: porObra(SEM),
    });
  return { clientes, casas, carrinhas, obras };
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

/** O que está em foco (a ficha aberta): uma pessoa, casa, carrinha ou (M2) obra. */
export type FocoTabela = { tipo: 'pessoa' | 'casa' | 'carrinha' | 'obra'; id: Id } | null;

/** O que o realce precisa de uma linha (a obra só para o foco numa obra, M2). */
type LinhaParaRealce = Pick<LinhaTabela, 'pessoa' | 'casa' | 'carrinha'> & Partial<Pick<LinhaTabela, 'obra'>>;

/**
 * Realce persistente de uma linha: 'foco' = a pessoa da ficha; 'marcada' = a linha em que se clicou
 * (clicar numa linha realça-a sem abrir a ficha); 'ligada' = mora na casa (ou vai na carrinha, ou trabalha
 * na obra) da ficha; null = nenhum.
 */
export function realceDaLinha(
  linha: LinhaParaRealce,
  foco: FocoTabela,
  marcada: Id | null = null,
): RealceLinha {
  if (foco?.tipo === 'pessoa' && foco.id === linha.pessoa.id) return 'foco';
  if (marcada === linha.pessoa.id) return 'marcada';
  if (!foco || foco.tipo === 'pessoa') return null;
  const sitio = foco.tipo === 'casa' ? linha.casa : foco.tipo === 'carrinha' ? linha.carrinha : linha.obra;
  return sitio?.id === foco.id ? 'ligada' : null;
}

export type RealceLinha = 'foco' | 'marcada' | 'ligada' | null;

/**
 * A linha realçada depois de um clique numa linha (docs/vistas-edicao.md). A linha já mostra tudo, por
 * isso o clique NUNCA abre nem muda a ficha (só o ⓘ a seguir ao nome): fora da edição realça a linha
 * (outro clique na mesma tira o realce); no modo de edição a seleção é o realce (o clique seleciona) e
 * não fica nenhuma marcada. Na linha da pessoa da ficha (`focoPessoaId`) o clique não alterna: ela fica
 * marcada, para continuar realçada depois de a ficha fechar (o realce 'foco' tapava a mudança).
 */
export function marcadaDepoisDoClique(
  id: Id,
  marcada: Id | null,
  modoEdicao: boolean,
  focoPessoaId: Id | null = null,
): Id | null {
  if (modoEdicao) return null;
  if (id === focoPessoaId) return id;
  return marcada === id ? null : id;
}

/**
 * As linhas que mostram um elemento (pesquisa, ligações da ficha): a pessoa, ou quem mora
 * na casa / vai na carrinha, pela ordem recebida.
 */
export function pessoasDoElemento(
  linhas: readonly LinhaParaRealce[],
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
 * O espaço que a caixa da tabela deixa à ficha aberta, para as colunas e as últimas linhas continuarem a
 * alcançar-se deslizando: em baixo no telemóvel (a ficha fica em baixo, a toda a largura) e à direita no
 * PC, mas só com a ficha no sítio de origem (à direita). Arrastada para outro sítio (PainelFoco), a
 * reserva ficava uma faixa vazia e a tabela deslizava de lado sem precisar: aí não há reserva.
 */
export function reservaDaFicha(haFicha: boolean, movida: boolean): { baixo: boolean; direita: boolean } {
  return { baixo: haFicha, direita: haFicha && !movida };
}

/**
 * A parte da caixa da tabela onde uma linha se vê: por baixo do cabeçalho fixo e, quando a ficha tapa
 * o princípio das linhas (no telemóvel fica em baixo, a toda a largura; no PC, se foi arrastada para cima
 * dos nomes), por cima da ficha. Na origem, no PC, a ficha fica à direita e não tapa a célula do nome:
 * não conta. Uma ficha escondida tem o retângulo vazio.
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
