// Dados do painel de foco e do destino da pesquisa no mapa. Funções puras.
// M2 (docs/m2.md, "Fichas editáveis"): também o que os editores das fichas precisam — ler o que se escreveu
// num campo (EditorCampo, lerValorEditado), a carta (Tem / Não tem / Não sei, com a validade no mesmo passo),
// a morada do local de uma casa (num só passo), o nome no mapa proposto e repetido, e tirar o nome do registo
// das frases de erro do domínio.

import {
  type CampoEditavel,
  chaveMatricula,
  type EntidadeEditavel,
  type ValorCampo,
  validarValorCampo,
} from '../../dominio/campos';
import type { ConfiancaDormida, Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import {
  aplicarOperacoes,
  nomeDoRegisto,
  type Operacao,
  type OperacaoCampo,
  operacaoCampo,
  operacaoCondutor,
  operacaoCriar,
  operacoesParaAlvo,
  validarOperacoes,
  valoresIguais,
} from '../../dominio/operacoes';
import { normalizarTexto } from '../../dominio/pesquisa';
import type { Carrinha, Casa, Estado, Id, Pais, Pessoa } from '../../dominio/tipos';
import type { Foco } from '../estado/loja';
import { deArtigoDoVeiculo, ROTULO_FORA_DAS_CASAS, ROTULO_SEM_OBRA, ROTULO_SEM_TRANSPORTE } from './textos';

/** A vista onde a ficha está aberta (PainelFoco): o Mapa, a Tabela ou o Quadro. */
export type VistaFicha = 'mapa' | 'tabela' | 'quadro';

/** Na Tabela: se se está no modo de edição e a pessoa cuja ficha se abriu pelo "Editar…" da linha. */
export interface FichaNaTabela {
  modoEdicao: boolean;
  /** A pessoa do último "Editar…" (null = nenhum, ou já fechou). */
  editar: Id | null;
}

/**
 * A ficha da pessoa abre-se aqui? No Mapa e no Quadro sempre (a ficha completa). Na Tabela, fora do modo de
 * edição, nunca (pedido do Rafael, 04/10/2026: a linha já mostra tudo e a ficha que abria era inútil; fica o
 * "Ver no mapa"): uma pessoa em foco (pesquisa, nomes da ficha de uma casa) só realça a linha. No modo de
 * edição, só a da pessoa do botão "Editar…" da linha (o Rafael, 05/10/2026: os dados dela e "Saiu da
 * empresa…" também se mudam na Tabela), e só enquanto está na empresa: depois de "Saiu da empresa…" a
 * ficha fecha (quem saiu volta pelo "Voltou à empresa…" da linha). As fichas de casa e carrinha abrem em
 * todas as vistas.
 */
export function haFichaDaPessoa(
  vista: VistaFicha,
  pessoa: Pick<Pessoa, 'id' | 'ativa'>,
  tabela: FichaNaTabela,
): boolean {
  if (vista !== 'tabela') return true;
  return tabela.modoEdicao && pessoa.ativa && tabela.editar === pessoa.id;
}

export interface ElementoCadeia {
  tipo: 'casa' | 'carrinha' | 'obra';
  /** null quando a pessoa não tem (grupo especial ou sem obra). */
  id: Id | null;
  rotulo: string;
  aConfirmar: boolean;
}

/** A linha casa → carrinha → obra de uma pessoa. */
export function cadeiaDaPessoa(p: Pessoa, ind: Indices): ElementoCadeia[] {
  const casa = p.casaId ? ind.casas.get(p.casaId) : undefined;
  const carrinha = p.carrinhaId ? ind.carrinhas.get(p.carrinhaId) : undefined;
  const obra = p.obraId ? ind.obras.get(p.obraId) : undefined;
  return [
    {
      tipo: 'casa',
      id: casa?.id ?? null,
      rotulo: casa?.nome ?? ROTULO_FORA_DAS_CASAS,
      aConfirmar: p.casaAConfirmar,
    },
    {
      tipo: 'carrinha',
      id: carrinha?.id ?? null,
      rotulo: carrinha?.matricula ?? ROTULO_SEM_TRANSPORTE,
      aConfirmar: p.carrinhaAConfirmar,
    },
    { tipo: 'obra', id: obra?.id ?? null, rotulo: obra?.nome ?? ROTULO_SEM_OBRA, aConfirmar: false },
  ];
}

export interface ContagemCasa {
  casa: Casa;
  n: number;
}

/** De que casas vêm estas pessoas (mais pessoas primeiro) e quantas estão fora das casas. */
export function casasDasPessoas(
  pessoas: Pessoa[],
  ind: Pick<Indices, 'casas'>,
): { casas: ContagemCasa[]; semCasa: number } {
  const contagem = new Map<Id, number>();
  let semCasa = 0;
  for (const p of pessoas) {
    if (p.casaId && ind.casas.has(p.casaId)) contagem.set(p.casaId, (contagem.get(p.casaId) ?? 0) + 1);
    else semCasa++;
  }
  const casas = [...contagem]
    .flatMap(([id, n]) => {
      const casa = ind.casas.get(id);
      return casa ? [{ casa, n }] : [];
    })
    .sort((a, b) => b.n - a.n || a.casa.ordem - b.casa.ordem);
  return { casas, semCasa };
}

export interface ContagemCarrinha {
  carrinha: Carrinha;
  n: number;
}

/** Que carrinhas estas pessoas usam (mais pessoas primeiro) e quantas estão sem transporte. */
export function carrinhasDasPessoas(
  pessoas: Pessoa[],
  ind: Pick<Indices, 'carrinhas'>,
): { carrinhas: ContagemCarrinha[]; semCarrinha: number } {
  const contagem = new Map<Id, number>();
  let semCarrinha = 0;
  for (const p of pessoas) {
    if (p.carrinhaId && ind.carrinhas.has(p.carrinhaId)) {
      contagem.set(p.carrinhaId, (contagem.get(p.carrinhaId) ?? 0) + 1);
    } else semCarrinha++;
  }
  const carrinhas = [...contagem]
    .flatMap(([id, n]) => {
      const carrinha = ind.carrinhas.get(id);
      return carrinha ? [{ carrinha, n }] : [];
    })
    .sort((a, b) => b.n - a.n || a.carrinha.ordem - b.carrinha.ordem);
  return { carrinhas, semCarrinha };
}

/** Carrinhas que dormem numa casa (definida ou sugerida), pela ordem das carrinhas. */
export function carrinhasQueDormemEm(
  casaId: Id,
  ind: Pick<Indices, 'carrinhas'>,
  dormidas: Map<Id, Dormida>,
): { carrinha: Carrinha; confianca: ConfiancaDormida }[] {
  const resultado: { carrinha: Carrinha; confianca: ConfiancaDormida }[] = [];
  for (const d of dormidas.values()) {
    if (d.casaId !== casaId) continue;
    const carrinha = ind.carrinhas.get(d.carrinhaId);
    if (carrinha) resultado.push({ carrinha, confianca: d.confianca });
  }
  return resultado.sort((a, b) => a.carrinha.ordem - b.carrinha.ordem);
}

/** Zoom do mapa ao ir para uma pessoa, casa ou carrinha. */
export const ZOOM_DESTINO = 13;

export interface Coordenadas {
  lat: number;
  lng: number;
}

export function coordenadasDoLocal(
  localId: Id | null | undefined,
  ind: Pick<Indices, 'locais'>,
): Coordenadas | null {
  const local = localId ? ind.locais.get(localId) : undefined;
  if (!local || local.lat === null || local.lng === null) return null;
  return { lat: local.lat, lng: local.lng };
}

function coordenadasDaCarrinha(
  carrinhaId: Id | null,
  ind: Pick<Indices, 'locais'>,
  dormidas: Map<Id, Dormida>,
): Coordenadas | null {
  return carrinhaId ? coordenadasDoLocal(dormidas.get(carrinhaId)?.localId, ind) : null;
}

/**
 * Para onde o mapa vai quando se escolhe algo na pesquisa.
 * Pessoa: o local da casa; sem casa (ou casa sem coordenadas), o local onde dorme a carrinha.
 * Carrinha: o local onde dorme. Casa: o seu local. Obra (M2): o seu local. null se não houver sítio no mapa.
 */
export function destinoNoMapa(
  foco: NonNullable<Foco>,
  ind: Pick<Indices, 'pessoas' | 'casas' | 'locais'> & Partial<Pick<Indices, 'obras'>>,
  dormidas: Map<Id, Dormida>,
): Coordenadas | null {
  if (foco.tipo === 'casa') return coordenadasDoLocal(ind.casas.get(foco.id)?.localId, ind);
  if (foco.tipo === 'carrinha') return coordenadasDaCarrinha(foco.id, ind, dormidas);
  if (foco.tipo === 'obra') return coordenadasDoLocal(ind.obras?.get(foco.id)?.localId, ind);
  const pessoa = ind.pessoas.get(foco.id);
  if (!pessoa) return null;
  const casa = pessoa.casaId ? ind.casas.get(pessoa.casaId) : undefined;
  return coordenadasDoLocal(casa?.localId, ind) ?? coordenadasDaCarrinha(pessoa.carrinhaId, ind, dormidas);
}

// --- M2: editores das fichas ---------------------------------------------------------------------

/**
 * Como se escreve um campo na ficha (CamposFicha.tsx). A validação do valor é sempre a do domínio
 * (validarValorCampo); aqui só se passa do texto do campo para o valor.
 * - texto: aparado; vazio = null nos opcionais (nunca "");
 * - matricula / matriculas: maiúsculas, "cf-5001" → "CF5001" (como as dos dados iniciais); as outras
 *   matrículas separadas por vírgulas;
 * - inteiro: só algarismos; vazio = null quando pode ficar vazio;
 * - escolha: o valor da opção; simNao: true / false.
 */
export type EditorCampo =
  | { tipo: 'texto'; opcional: boolean; max: number }
  | { tipo: 'matricula' }
  | { tipo: 'matriculas' }
  | { tipo: 'inteiro'; nulo: boolean; min: number; max: number }
  | { tipo: 'escolha'; opcoes: readonly { valor: string; rotulo: string }[] }
  | { tipo: 'simNao' };

/** O resultado de ler um campo: o valor, ou o erro (sem o rótulo: quem o mostra junta-o). */
export type ValorLido = { valor: ValorCampo } | { erro: string };

/** Quebras de linha (uma colagem pode trazê-las) e os espaços à volta: num campo de uma linha, um espaço. */
const QUEBRAS = /\s*[\r\n\u2028\u2029]+\s*/g;

/**
 * Matrícula como se guarda: maiúsculas, espaços seguidos juntos, e a forma luxemburguesa sem espaço nem
 * hífen ("cf 5001", "CF-5001" → "CF5001", como nos dados iniciais; no ecrã o formatarMatricula põe o
 * espaço). As outras ficam como se escreveram, em maiúsculas.
 */
export function normalizarMatricula(texto: string): string {
  const limpo = texto.replace(QUEBRAS, ' ').trim().toUpperCase().replace(/\s+/g, ' ');
  const m = /^([A-Z]{1,3})[ -]?(\d{1,5})$/.exec(limpo);
  return m ? `${m[1]}${m[2]}` : limpo;
}

/** O texto com que o campo abre (o valor atual): matrículas formatadas, listas separadas por vírgulas. */
export function textoParaEditar(
  editor: EditorCampo,
  valor: ValorCampo,
  formatar: (matricula: string) => string,
): string {
  if (valor === null) return '';
  if (editor.tipo === 'matriculas') return Array.isArray(valor) ? valor.map(formatar).join(', ') : '';
  if (editor.tipo === 'matricula') return formatar(String(valor));
  if (editor.tipo === 'simNao') return valor === true ? 'sim' : 'nao';
  return Array.isArray(valor) ? valor.join(', ') : String(valor);
}

/** Lê o que se escreveu num campo da ficha (ver EditorCampo). */
export function lerValorEditado(editor: EditorCampo, texto: string): ValorLido {
  const limpo = texto.replace(QUEBRAS, ' ').trim();
  switch (editor.tipo) {
    case 'texto':
      return { valor: limpo === '' && editor.opcional ? null : limpo };
    case 'matricula':
      return { valor: normalizarMatricula(limpo) };
    case 'matriculas':
      return {
        valor: limpo
          .split(/[,;]/)
          .map(normalizarMatricula)
          .filter((m) => m !== ''),
      };
    case 'inteiro': {
      if (limpo === '') return editor.nulo ? { valor: null } : { erro: 'falta o número.' };
      const n = /^\d+$/.test(limpo) ? Number(limpo) : Number.NaN;
      if (!Number.isInteger(n) || n < editor.min || n > editor.max) {
        return { erro: `tem de ser um número inteiro de ${editor.min} a ${editor.max}.` };
      }
      return { valor: n };
    }
    case 'escolha':
      return editor.opcoes.some((o) => o.valor === limpo) ? { valor: limpo } : { erro: 'falta escolher.' };
    case 'simNao':
      if (limpo === 'sim') return { valor: true };
      return limpo === 'nao' ? { valor: false } : { erro: 'falta escolher.' };
  }
}

/** Carta: Tem / Não tem / Não sei (true / false / null). */
export type EscolhaCarta = 'tem' | 'nao-tem' | 'nao-sei';

export function escolhaCarta(temCarta: boolean | null): EscolhaCarta {
  return temCarta === true ? 'tem' : temCarta === false ? 'nao-tem' : 'nao-sei';
}

export function temCartaDaEscolha(escolha: EscolhaCarta): boolean | null {
  return escolha === 'tem' ? true : escolha === 'nao-tem' ? false : null;
}

/**
 * O passo da carta: temCarta e, no MESMO passo, a validade. Com "Não tem" ou "Não sei" a validade passa a
 * null (o servidor recusa uma validade sem carta). `validade` = AAAA-MM-DD, ou "" (não se sabe). [] = nada
 * muda.
 */
export function operacoesCarta(
  estado: Estado,
  pessoaId: Id,
  escolha: EscolhaCarta,
  validade: string,
): OperacaoCampo[] {
  const temCarta = temCartaDaEscolha(escolha);
  const dia = temCarta === true && validade.trim() !== '' ? validade.trim() : null;
  return [
    operacaoCampo(estado, 'pessoa', pessoaId, 'temCarta', temCarta),
    operacaoCampo(estado, 'pessoa', pessoaId, 'cartaValidade', dia),
  ].filter((op): op is OperacaoCampo => op !== null);
}

/** A morada de um local como o campo da morada a devolve (comum/CampoMorada.tsx, ValorMorada). */
export interface MoradaEditada {
  morada: string;
  pais: Pais;
  lat: number | null;
  lng: number | null;
}

/**
 * O passo da morada de uma casa: os 'campo' do LOCAL (morada aparada, país, lat, lng) num só passo. Sem pino
 * (lat/lng null) a posição fica como estava. [] = nada muda.
 */
export function operacoesMoradaDoLocal(estado: Estado, localId: Id, valor: MoradaEditada): OperacaoCampo[] {
  const morada = valor.morada.replace(QUEBRAS, ' ').trim();
  return [
    operacaoCampo(estado, 'local', localId, 'morada', morada),
    operacaoCampo(estado, 'local', localId, 'pais', valor.pais),
    valor.lat === null ? null : operacaoCampo(estado, 'local', localId, 'lat', valor.lat),
    valor.lng === null ? null : operacaoCampo(estado, 'local', localId, 'lng', valor.lng),
  ].filter((op): op is OperacaoCampo => op !== null);
}

/**
 * Nota por baixo da lotação, no modo de edição, numa casa cujos lugares são os moradores (`sempreCheia`:
 * Walferdange, Schifflange): aí a lotação não conta (lotacaoEfetiva), e sem a nota mudava-se um número sem
 * efeito nenhum. Sem as palavras "sempre cheia" (pedido do Rafael, 04/10/2026). null nas outras casas.
 */
export function notaDaLotacao(casa: Pick<Casa, 'sempreCheia'>): string | null {
  return casa.sempreCheia ? 'Nesta casa os lugares são os moradores: a lotação não conta.' : null;
}

/** As outras casas na mesma morada (o local é partilhado: mudar a morada muda-a para todas). */
export function outrasCasasNoLocal(casa: Casa, ind: Pick<Indices, 'casasPorLocal'>): Casa[] {
  return (ind.casasPorLocal.get(casa.localId) ?? []).filter((c) => c.id !== casa.id);
}

/** Uma opção de "Mudar para outra morada…": o local e as casas que já lá estão. */
export interface OpcaoOutraMorada {
  valor: Id;
  rotulo: string;
  /** As casas que já estão nesse local (a casa passa a partilhar a morada com elas). */
  casas: string[];
}

/**
 * As opções de "Mudar para outra morada…": os locais de casas (sem o atual), pelo nome, cada um com a
 * morada (quando não é o próprio nome) e as casas que já lá estão ("Eischen — 1 Rue X · Casa Eischen").
 */
export function opcoesOutraMorada(estado: Estado, casa: Casa): OpcaoOutraMorada[] {
  const comparar = new Intl.Collator('pt', { sensitivity: 'base', numeric: true }).compare;
  return estado.locais
    .filter((l) => l.tipo === 'casa' && l.id !== casa.localId)
    .sort((a, b) => comparar(a.nome, b.nome))
    .map((l) => {
      const casas = estado.casas
        .filter((c) => c.localId === l.id && c.id !== casa.id)
        .map((c) => c.nome)
        .sort(comparar);
      const morada =
        normalizarTexto(l.nome) === normalizarTexto(l.morada) || !l.morada.trim() ? '' : ` — ${l.morada}`;
      const onde = casas.length > 0 ? ` · ${casas.join(', ')}` : '';
      return { valor: l.id, rotulo: `${l.nome}${morada}${onde}`, casas };
    });
}

/** O aviso antes de aplicar "Mudar para outra morada…" (null = nada escolhido). */
export function avisoOutraMorada(opcao: OpcaoOutraMorada | undefined): string | null {
  if (!opcao) return null;
  return opcao.casas.length > 0
    ? `Passa a partilhar a morada com ${lista(opcao.casas)}: mudar a morada de uma muda a de todas.`
    : 'Passa para esta morada (nenhuma outra casa está lá agora).';
}

/**
 * As outras matrículas de uma carrinha não podem ser a matrícula (principal ou outra) de outro veículo, nem
 * a principal desta, nem repetir-se (a pesquisa e o "Mover para…" encontravam duas carrinhas). null = ok.
 */
export function erroOutrasMatriculas(
  estado: Estado,
  carrinhaId: Id,
  outras: readonly string[],
): string | null {
  const propria = estado.carrinhas.find((c) => c.id === carrinhaId);
  const vistas = new Set<string>();
  for (const m of outras) {
    const chave = chaveMatricula(m);
    if (vistas.has(chave)) return `${formatarMatricula(m)} está repetida.`;
    vistas.add(chave);
    if (propria && chaveMatricula(propria.matricula) === chave) {
      return `${formatarMatricula(m)} é a matrícula principal desta carrinha.`;
    }
    const outra = estado.carrinhas.find(
      (c) =>
        c.id !== carrinhaId &&
        (chaveMatricula(c.matricula) === chave ||
          c.matriculasAlternativas.some((a) => chaveMatricula(a) === chave)),
    );
    if (outra)
      return `${formatarMatricula(m)} já é de outro veículo (${formatarMatricula(outra.matricula)}).`;
  }
  return null;
}

/**
 * O que fazer a uma tecla dentro de um campo aberto da ficha:
 * - 'cancelar': Esc (não chega à ficha, que fechava, nem aos atalhos);
 * - 'aplicar': Enter numa lista ou num botão de opção (o browser não submete o formulário aí);
 * - 'reter': Ctrl/⌘+Z, Ctrl/⌘+Y e Ctrl/⌘+Shift+Z não chegam aos atalhos do modo de edição (desfaziam o
 *   passo anterior do rascunho com o campo ainda aberto); nos campos de escrever o browser desfaz o texto;
 * - null: o resto segue o caminho normal.
 */
export function teclaDoCampoAberto(tecla: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  /** O foco está numa lista (<select>) ou num botão de opção. */
  emListaOuOpcao: boolean;
}): 'cancelar' | 'aplicar' | 'reter' | null {
  if (tecla.key === 'Escape') return 'cancelar';
  if (tecla.key === 'Enter' && tecla.emListaOuOpcao) return 'aplicar';
  const k = tecla.key.toLowerCase();
  if ((tecla.ctrlKey || tecla.metaKey) && !tecla.altKey && (k === 'z' || k === 'y')) return 'reter';
  return null;
}

/**
 * Nome no mapa proposto a partir do nome: o 1.º nome e a inicial do último apelido ("Ana Maria" + "Silva
 * Teixeira" → "Ana T."). Só com um dos dois, a 1.ª palavra dele. Sem nada, "".
 */
export function proporNomeNoMapa(nome: string, apelidos: string): string {
  const palavras = (texto: string) => texto.trim().split(/\s+/).filter(Boolean);
  const [primeiro] = palavras(nome);
  const doApelido = palavras(apelidos);
  if (!primeiro) return doApelido[0] ?? '';
  const inicial = [...(doApelido.at(-1) ?? '')][0];
  return inicial ? `${primeiro} ${inicial.toLocaleUpperCase('pt')}.` : primeiro;
}

/**
 * Outra pessoa (ativa ou não) com o mesmo nome no mapa, sem contar acentos, maiúsculas nem espaços a mais
 * (como o domínio: o nome no mapa é único). undefined = não há.
 */
export function outraComNomeNoMapa(
  pessoas: readonly Pessoa[],
  nomeNoMapa: string,
  proprioId: Id | null,
): Pessoa | undefined {
  const chave = normalizarTexto(nomeNoMapa);
  if (!chave) return undefined;
  return pessoas.find((p) => p.id !== proprioId && normalizarTexto(p.nomeCurto) === chave);
}

/** O aviso enquanto se escreve o nome no mapa, se já houver outra pessoa com ele (null = não há). */
export function avisoNomeNoMapa(
  pessoas: readonly Pessoa[],
  nomeNoMapa: string,
  proprioId: Id | null,
): string | null {
  const outra = outraComNomeNoMapa(pessoas, nomeNoMapa, proprioId);
  return outra ? `Já há outra pessoa com «${outra.nomeCurto}» no mapa: escolhe outro nome.` : null;
}

/**
 * As frases de erro do domínio começam pelo nome do registo ("Casa Um — o tolerado (4) …"). Na ficha desse
 * registo o nome está à vista: tira-se ("O tolerado (4) …"). As outras ficam como vêm.
 */
export function erroSemNome(estado: Estado, entidade: EntidadeEditavel, id: Id, erro: string): string {
  return semPrefixo(erro, `${nomeDoRegisto(estado, entidade, id)} — `);
}

/** A frase sem o prefixo ("Ana T. — "), com maiúscula; se não começar por ele, fica como vem. */
function semPrefixo(erro: string, prefixo: string): string {
  if (!erro.startsWith(prefixo)) return erro;
  const resto = erro.slice(prefixo.length);
  return resto.charAt(0).toLocaleUpperCase('pt') + resto.slice(1);
}

/**
 * Valida UM passo da ficha antes de o aplicar: as frases do domínio (validarOperacoes, sobre o estado
 * visível), sem o nome do registo à frente (está à vista). [] = pode aplicar-se.
 */
export function errosDoPasso(
  estado: Estado,
  entidade: EntidadeEditavel,
  id: Id,
  ops: readonly Operacao[],
): string[] {
  // O nome pode ser o de antes (o registo) ou o novo (ex.: o nome no mapa que se está a mudar).
  const final = aplicarOperacoes(estado, ops);
  return validarOperacoes(estado, ops).map((e) =>
    erroSemNome(final, entidade, id, erroSemNome(estado, entidade, id, e)),
  );
}

/** O campo da ficha que mudou no rascunho: a operação 'campo' pendente dele (null = não mudou). */
export function campoPendente<E extends EntidadeEditavel>(
  pendentes: readonly Operacao[],
  entidade: E,
  id: Id,
  campo: CampoEditavel<E>,
): OperacaoCampo | null {
  return (
    pendentes.findLast(
      (op): op is OperacaoCampo =>
        op.tipo === 'campo' && op.entidade === entidade && op.id === id && op.campo === campo,
    ) ?? null
  );
}

// --- M2: o editor aberto enquanto outra pessoa grava o mesmo campo (tempo real) -----------------------

/** Os valores dos campos de um registo quando o editor abriu, por campo. */
export type ValoresAoAbrir = Readonly<Record<string, ValorCampo>>;

/**
 * Tempo real: com o editor de um campo aberto, outra pessoa pode gravar o mesmo campo (o estado visível muda
 * por baixo dele). O `de` de cada operação passa a ser o valor de quando o editor abriu: assim o Guardar dá
 * conflito (409, "esperavas A, mas agora é B") em vez de escrever por cima em silêncio. Um campo que se deixa
 * como estava ao abrir fica sem efeito (de = para: o aplicar deixa-o cair), mesmo que entretanto tenha mudado.
 */
export function comDeDeQuandoAbriu(ops: readonly OperacaoCampo[], aoAbrir: ValoresAoAbrir): OperacaoCampo[] {
  return ops.map((op) => (Object.hasOwn(aoAbrir, op.campo) ? { ...op, de: aoAbrir[op.campo] ?? null } : op));
}

/** Algum dos campos mudou desde que o editor abriu (o valor visível já não é o de então). */
export function mudouDesdeQueAbriu(aoAbrir: ValoresAoAbrir, agora: ValoresAoAbrir): boolean {
  return Object.keys(aoAbrir).some((campo) => !valoresIguais(aoAbrir[campo] ?? null, agora[campo] ?? null));
}

/** A nota curta por baixo do editor aberto: "Mudou entretanto: agora é 10." */
export function notaMudouEntretanto(agora: string): string {
  return `Mudou entretanto: agora é ${agora}.`;
}

// --- M2: nova pessoa e saída da empresa (DialogoNovaPessoa.tsx, DialogoSaida.tsx) ------------------

/** O que se escreve no diálogo (textos como vêm dos campos; casa/carrinha null = nenhuma). */
export interface DadosNovaPessoa {
  nome: string;
  apelidos: string;
  nomeNoMapa: string;
  numero: string;
  clienteId: Id;
  telefone: string;
  carta: EscolhaCarta;
  /** AAAA-MM-DD ou "" (só conta com carta "Tem"). */
  validade: string;
  casaId: Id | null;
  carrinhaId: Id | null;
}

/** Texto de uma linha: aparado, espaços seguidos juntos, sem quebras de linha. */
export function linhaDeTexto(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/**
 * O registo da pessoa nova, como o domínio o quer (validarRegisto): sem casa, carrinha nem obra, ativa, sem
 * marcas "a confirmar", sem nomes alternativos nem nº original; vazios = null (os apelidos, opcionais, ficam
 * "": a coluna é NOT NULL); validade só com carta "Tem".
 */
export function pessoaNova(dados: DadosNovaPessoa, id: Id): Pessoa {
  const temCarta = temCartaDaEscolha(dados.carta);
  const opcional = (texto: string) => linhaDeTexto(texto) || null;
  return {
    id,
    numero: opcional(dados.numero),
    numeroOriginal: null,
    apelidos: linhaDeTexto(dados.apelidos),
    nome: linhaDeTexto(dados.nome),
    nomeCurto: linhaDeTexto(dados.nomeNoMapa),
    nomesAlternativos: [],
    clienteId: dados.clienteId,
    obraId: null,
    casaId: null,
    carrinhaId: null,
    casaAConfirmar: false,
    carrinhaAConfirmar: false,
    telefone: opcional(dados.telefone),
    temCarta,
    cartaValidade: temCarta === true && dados.validade.trim() !== '' ? dados.validade.trim() : null,
    ativa: true,
  };
}

/**
 * O passo da pessoa nova: criar o registo e, no mesmo passo, levá-la para a casa e a carrinha escolhidas
 * (operacoesParaAlvo sobre o estado já com ela).
 */
export function passoNovaPessoa(estado: Estado, dados: DadosNovaPessoa, id: Id): Operacao[] {
  const criar = operacaoCriar('pessoa', pessoaNova(dados, id));
  const comEla = aplicarOperacoes(estado, [criar]);
  return [
    criar,
    ...(dados.casaId ? operacoesParaAlvo(comEla, [id], { tipo: 'casa', id: dados.casaId }) : []),
    ...(dados.carrinhaId ? operacoesParaAlvo(comEla, [id], { tipo: 'carrinha', id: dados.carrinhaId }) : []),
  ];
}

/**
 * Erros do diálogo (frases prontas; [] = pode aplicar-se). Primeiro o que falta escrever (o nome e o nome
 * no mapa; o cliente), depois o domínio sobre o estado visível (nome no mapa e nº únicos, tamanhos,
 * validade…), sem o nome da pessoa à frente. Os apelidos são opcionais (o Rafael, 05/10/2026): sem eles
 * ficam "" (campos.ts) e o nome no mapa proposto é só o 1.º nome.
 */
export function errosNovaPessoa(estado: Estado, dados: DadosNovaPessoa, id: Id): string[] {
  const faltam: string[] = [];
  if (!linhaDeTexto(dados.nome)) faltam.push('o nome');
  if (!linhaDeTexto(dados.nomeNoMapa)) faltam.push('o nome no mapa');
  const erros: string[] = [];
  if (faltam.length > 0) {
    erros.push(`Falta${faltam.length > 1 ? 'm' : ''} ${faltam.join(', ').replace(/, ([^,]*)$/, ' e $1')}.`);
  }
  if (!dados.clienteId) erros.push('Falta escolher o cliente.');
  const outra = outraComNomeNoMapa(estado.pessoas, dados.nomeNoMapa, null);
  if (outra) erros.push(`Nome no mapa repetido: já há outra pessoa com «${outra.nomeCurto}».`);
  if (temCartaDaEscolha(dados.carta) === true && dados.validade.trim() !== '') {
    const erro = validarValorCampo('pessoa', 'cartaValidade', dados.validade.trim());
    if (erro) erros.push(erro);
  }
  if (erros.length > 0) return erros;
  const nomeCurto = linhaDeTexto(dados.nomeNoMapa);
  return validarOperacoes(estado, passoNovaPessoa(estado, dados, id)).map((e) =>
    semPrefixo(e, `${nomeCurto} — `),
  );
}

/** "a, b e c". */
function lista(partes: readonly string[]): string {
  if (partes.length <= 1) return partes.join('');
  return `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`;
}

/**
 * O que acontece quando a pessoa sai: "Sai de Casa X, da CF 5001 (deixa de conduzir) e da obra Y." Sem
 * casa, carrinha nem obra: "Não está em nenhuma casa, carrinha nem obra."
 */
export function textoSaida(estado: Estado, pessoa: Pessoa): string {
  const partes: string[] = [];
  const casa = pessoa.casaId ? estado.casas.find((c) => c.id === pessoa.casaId) : undefined;
  if (casa) partes.push(`de ${casa.nome}`);
  const carrinha = pessoa.carrinhaId ? estado.carrinhas.find((c) => c.id === pessoa.carrinhaId) : undefined;
  if (carrinha) {
    const conduz = carrinha.condutorId === pessoa.id ? ' (deixa de conduzir)' : '';
    partes.push(`${deArtigoDoVeiculo(carrinha.tipo)} ${formatarMatricula(carrinha.matricula)}${conduz}`);
  }
  const obra = pessoa.obraId ? estado.obras.find((o) => o.id === pessoa.obraId) : undefined;
  if (obra) partes.push(`da obra ${obra.nome}`);
  return partes.length > 0 ? `Sai ${lista(partes)}.` : 'Não está em nenhuma casa, carrinha nem obra.';
}

/**
 * O passo "Saiu da empresa": fora da casa, da carrinha (deixa de conduzir) e da obra, e `ativa` = false.
 * Também deixa de conduzir uma carrinha onde não vai (dados antigos incoerentes), para o passo ser válido.
 * [] se já tiver saído (ou não existir).
 */
export function passoSaida(estado: Estado, pessoaId: Id): Operacao[] {
  const pessoa = estado.pessoas.find((p) => p.id === pessoaId);
  if (!pessoa?.ativa) return [];
  const ops: Operacao[] = [
    ...operacoesParaAlvo(estado, [pessoaId], { tipo: 'fora' }),
    ...operacoesParaAlvo(estado, [pessoaId], { tipo: 'sem-transporte' }),
    ...operacoesParaAlvo(estado, [pessoaId], { tipo: 'sem-obra' }),
  ];
  for (const c of estado.carrinhas) {
    if (c.condutorId !== pessoaId) continue;
    if (ops.some((op) => op.tipo === 'condutor' && op.carrinhaId === c.id)) continue;
    const op = operacaoCondutor(estado, c.id, null);
    if (op) ops.push(op);
  }
  const ativa = operacaoCampo(estado, 'pessoa', pessoaId, 'ativa', false);
  if (ativa) ops.push(ativa);
  return ops;
}

/** O passo "Voltou à empresa": `ativa` = true (fica fora das casas e sem transporte). [] se estiver ativa. */
export function passoVoltar(estado: Estado, pessoaId: Id): Operacao[] {
  const op = operacaoCampo(estado, 'pessoa', pessoaId, 'ativa', true);
  return op ? [op] : [];
}
