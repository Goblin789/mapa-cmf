// Textos dos painéis: formatação pura, sem browser.

import type { Dormida } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import type { Casa, Id, Pessoa } from '../../dominio/tipos';

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

/** Data de hoje no fuso local, em AAAA-MM-DD (comparável com as datas ISO do estado). */
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

/** Onde dorme uma carrinha: definida, sugerida (pela casa da maioria dos passageiros) ou desconhecida. */
export function textoDormida(d: Dormida | undefined, ind: Indices): TextoDormida {
  if (!d || d.confianca === 'desconhecida') {
    return { casaId: null, rotulo: 'Desconhecido', nota: 'Ainda não está definido.', desconhecida: true };
  }
  const nota = d.confianca === 'sugerida' ? 'Sugerida: onde mora a maioria dos passageiros.' : null;
  const casa = d.casaId ? ind.casas.get(d.casaId) : undefined;
  if (casa) return { casaId: casa.id, rotulo: casa.nome, nota, desconhecida: false };
  const local = d.localId ? ind.locais.get(d.localId) : undefined;
  return { casaId: null, rotulo: local?.nome ?? 'Local desconhecido', nota, desconhecida: !local };
}
