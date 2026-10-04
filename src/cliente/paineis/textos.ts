// Textos dos painéis: formatação pura, sem browser.

import { type EntidadeEditavel, ROTULO_CAMPO, type ValorCampo } from '../../dominio/campos';
import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { textoAte } from '../../dominio/indisponibilidade';
import { valorLegivel } from '../../dominio/operacoes';
import { normalizarTexto } from '../../dominio/pesquisa';
import type {
  Carrinha,
  Casa,
  Estado,
  Id,
  Indisponibilidade,
  Local,
  Pessoa,
  TipoLocal,
  TipoVeiculo,
} from '../../dominio/tipos';

export const ROTULO_FORA_DAS_CASAS = 'Fora das casas CMF';
export const ROTULO_SEM_TRANSPORTE = 'Sem transporte da empresa';
export const ROTULO_SEM_OBRA = 'sem obra';
export const SEM_DADOS = 'sem dados ainda';

/** "1 lugar livre", "3 lugares livres", "0 lugares livres". */
export function comPlural(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function nomeCompleto(p: Pessoa): string {
  const completo = [p.nome, p.apelidos]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  return completo || p.nomeCurto;
}

/**
 * Data de hoje no fuso local, em AAAA-MM-DD (comparável com as datas ISO do estado).
 * M2: as fichas comparam com `loja.hoje` (o dia no Luxemburgo), não com isto.
 */
export function hojeISO(agora: Date = new Date()): string {
  const d2 = (n: number) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${d2(agora.getMonth() + 1)}-${d2(agora.getDate())}`;
}

/** "2027-03-01" → "01/03/2027". Se não for uma data ISO, devolve o texto como veio. */
export function formatarData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function textoTelefone(p: Pessoa): string {
  return p.telefone?.trim() || SEM_DADOS;
}

export function textoCarta(p: Pessoa, hoje: string): string {
  if (p.temCarta === null) return SEM_DADOS;
  if (!p.temCarta) return 'Não tem';
  if (!p.cartaValidade) return 'Tem (validade desconhecida)';
  const data = formatarData(p.cartaValidade);
  return p.cartaValidade < hoje ? `Caducou a ${data}` : `Tem, válida até ${data}`;
}

/** Ao lado de "9/10": "1 lugar livre", "cheio" ou "2 pessoas a mais". */
export function textoLotacao(ocupados: number, lugares: number): string {
  if (ocupados < lugares) return comPlural(lugares - ocupados, 'lugar livre', 'lugares livres');
  if (ocupados === lugares) return 'cheio';
  return `${comPlural(ocupados - lugares, 'pessoa', 'pessoas')} a mais`;
}

export const APARTAMENTO_POR_CONFIRMAR = 'por confirmar';

/**
 * Apartamento de uma casa. Sem apartamento, só fica "por confirmar" numa morada com várias casas
 * (Himeling); numa morada com uma só casa não há apartamento a mostrar (null).
 */
export function textoApartamento(casa: Casa, casasNaMorada: number): string | null {
  const apartamento = casa.apartamento?.trim();
  if (apartamento) return apartamento;
  return casasNaMorada > 1 ? APARTAMENTO_POR_CONFIRMAR : null;
}

/** Máximo do contrato com o tolerado: "4 (tolerado 6)", "6", "não fixado". */
export function textoContrato(casa: Casa): string {
  if (casa.maxContrato === null) return 'não fixado';
  if (casa.tolerado === null || casa.tolerado === casa.maxContrato) return String(casa.maxContrato);
  return `${casa.maxContrato} (tolerado ${casa.tolerado})`;
}

export interface TextoDormida {
  /** Casa onde dorme (para o painel a tornar clicável), se houver. */
  casaId: Id | null;
  rotulo: string;
  nota: string | null;
  desconhecida: boolean;
}

export const ROTULO_DORMIDA_POR_DEFINIR = 'Por definir';

/** Nota de onde dorme quando não está definido e se usa a casa da maioria dos passageiros. */
export const NOTA_DORMIDA_SUGERIDA = 'sugerido (é onde moram mais passageiros)';

/** Onde dorme uma carrinha: definida, sugerida (pela casa da maioria dos passageiros) ou por definir. */
export function textoDormida(d: Dormida | undefined, ind: Indices): TextoDormida {
  if (!d || d.confianca === 'desconhecida') {
    return {
      casaId: null,
      rotulo: ROTULO_DORMIDA_POR_DEFINIR,
      nota: 'Sem sugestão: nenhum passageiro mora numa casa CMF.',
      desconhecida: true,
    };
  }
  const nota = d.confianca === 'sugerida' ? NOTA_DORMIDA_SUGERIDA : null;
  const casa = d.casaId ? ind.casas.get(d.casaId) : undefined;
  if (casa) return { casaId: casa.id, rotulo: casa.nome, nota, desconhecida: false };
  const local = d.localId ? ind.locais.get(d.localId) : undefined;
  return { casaId: null, rotulo: local?.nome ?? 'Local desconhecido', nota, desconhecida: !local };
}

/** "Carrinha" ou "Carro". */
export const ROTULO_TIPO_VEICULO: Record<TipoVeiculo, string> = { carrinha: 'Carrinha', carro: 'Carro' };

/** Artigo antes da matrícula: "a CF 5001" (carrinha), "o DH 9250" (carro). */
export function artigoDoVeiculo(tipo: TipoVeiculo): 'a' | 'o' {
  return tipo === 'carro' ? 'o' : 'a';
}

/** "de" com o artigo, antes da matrícula: "condutor da CF 5001" (carrinha), "condutor do DH 9250" (carro). */
export function deArtigoDoVeiculo(tipo: TipoVeiculo): 'da' | 'do' {
  return tipo === 'carro' ? 'do' : 'da';
}

/**
 * Marca e modelo: "Ford Transit Custom". Se o modelo já começar pela marca, não a repete; só com um dos
 * dois, fica esse; sem nenhum, null.
 */
export function textoMarcaModelo(c: Pick<Carrinha, 'marca' | 'modelo'>): string | null {
  const marca = c.marca?.trim() ?? '';
  const modelo = c.modelo?.trim() ?? '';
  if (!marca) return modelo || null;
  if (!modelo) return marca;
  const m = normalizarTexto(modelo);
  const jaTemMarca = m === normalizarTexto(marca) || m.startsWith(`${normalizarTexto(marca)} `);
  return jaTemMarca ? modelo : `${marca} ${modelo}`;
}

/** Detalhe de uma carrinha (pesquisa): "3/9 lugares · Ford Transit Custom". */
export function detalheCarrinha(
  c: Pick<Carrinha, 'lugares' | 'marca' | 'modelo'>,
  passageiros: number,
): string {
  const marcaModelo = textoMarcaModelo(c);
  return `${passageiros}/${c.lugares} lugares${marcaModelo ? ` · ${marcaModelo}` : ''}`;
}

// --- M2: campos das fichas ------------------------------------------------------------------------

/** "Não tem" / "Não sei" / "Tem": a carta como se escolhe na ficha. */
export const ROTULO_ESCOLHA_CARTA = { tem: 'Tem', 'nao-tem': 'Não tem', 'nao-sei': 'Não sei' } as const;

/**
 * O valor de um campo editável como aparece na ficha: "—" quando está vazio, "Sim"/"Não", a carta
 * "Tem"/"Não tem"/"Não sei", dias dd/mm/aaaa, matrículas formatadas, o nome do cliente e a morada do
 * local em vez dos ids (as mesmas regras das frases do Histórico, valorLegivel).
 */
export function textoValorCampo(
  estado: Estado,
  entidade: EntidadeEditavel,
  campo: string,
  valor: ValorCampo,
): string {
  if (campo === 'temCarta')
    return ROTULO_ESCOLHA_CARTA[valor === true ? 'tem' : valor === false ? 'nao-tem' : 'nao-sei'];
  if (valor === true) return 'Sim';
  if (valor === false) return 'Não';
  return valorLegivel(estado, entidade, campo, valor);
}

/** O rótulo do campo no domínio, com maiúscula ("Nome no mapa", "Máx. do contrato"). */
export function rotuloDoCampo(entidade: EntidadeEditavel, campo: string): string {
  const rotulo = (ROTULO_CAMPO[entidade] as Record<string, string>)[campo] ?? campo;
  return rotulo.charAt(0).toLocaleUpperCase('pt') + rotulo.slice(1);
}

/** A morada como se mostra: "1 Rue X", com o país quando não é o Luxemburgo; sem morada, o nome do local. */
export function textoMorada(local: Pick<Local, 'morada' | 'pais' | 'nome'>): string {
  const morada = local.morada.trim() || local.nome;
  return local.pais === 'LU' ? morada : `${morada} (${local.pais})`;
}

/** Por baixo de um campo que mudou no rascunho: "antes: 8" (o valor gravado, como no Histórico). */
export function textoAntes(
  estado: Estado,
  entidade: EntidadeEditavel,
  campo: string,
  de: ValorCampo,
): string {
  return `antes: ${valorLegivel(estado, entidade, campo, de)}`;
}

/**
 * Na ficha da carrinha, quando o condutor está indisponível hoje: "O condutor está indisponível até 12/10."
 * ou "O condutor está indisponível (sem data de regresso)." Não muda o condutor.
 */
export function textoCondutorIndisponivel(periodo: Indisponibilidade): string {
  return periodo.fim === null
    ? 'O condutor está indisponível (sem data de regresso).'
    : `O condutor está indisponível ${textoAte(periodo)}.`;
}

/** A nota da cor na ficha da pessoa com obra: a cor (e a sigla) são as do cliente da obra. */
export function notaCorDaObra(clienteDaObra: string | null, obra: string): string {
  return clienteDaObra
    ? `No mapa tem a cor de ${clienteDaObra}, o cliente da obra ${obra}.`
    : `No mapa tem a cor do cliente da obra ${obra}.`;
}

/** Tipo de um local por palavras ("estacionamento", "oficina"…). */
export const ROTULO_TIPO_LOCAL: Record<TipoLocal, string> = {
  casa: 'casa',
  obra: 'obra',
  estacionamento: 'estacionamento',
  oficina: 'oficina',
  escritorio: 'escritório',
  bomba: 'bomba de gasolina',
  outro: 'outro local',
};
