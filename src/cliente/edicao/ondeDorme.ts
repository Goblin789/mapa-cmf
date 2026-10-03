// Onde dorme uma carrinha, no modo de edição: os sítios do diálogo "Onde dorme a …" (casas agrupadas por
// morada, outros locais como estacionamentos e "Por definir"), a sugestão (a casa onde mora a maioria dos
// passageiros) e as operações de "Confirmar sugestão" / "Confirmar todas as sugestões". Funções puras.

import { type Dormida, dormidasDasCarrinhas } from '../../dominio/dormidas';
import type { Indices } from '../../dominio/indices';
import { type ChaveDormida, chaveDormida, type Operacao, operacaoDormida } from '../../dominio/operacoes';
import { compactar, normalizarTexto } from '../../dominio/pesquisa';
import type { Carrinha, Estado, Id, Local } from '../../dominio/tipos';
import { formatarMatricula } from '../comum/Matricula';
import { artigoDoVeiculo, comPlural, ROTULO_TIPO_LOCAL } from '../paineis/textos';

/** Chave da opção "Por definir" (as outras opções usam a própria chave de onde dorme). */
export const CHAVE_POR_DEFINIR = 'por-definir';

export const ROTULO_POR_DEFINIR_OPCAO = 'Por definir (usar a sugestão)';

export interface SitioDormida {
  /** Única na lista: a chave de onde dorme ("casa:<id>", "local:<id>") ou CHAVE_POR_DEFINIR. */
  chave: string;
  /** O que se grava ao escolher (null = por definir). */
  valor: ChaveDormida | null;
  tipo: 'casa' | 'local' | 'por-definir';
  rotulo: string;
  detalhe: string | null;
  /** É onde a carrinha dorme agora (no rascunho): escolher não muda nada. */
  atual: boolean;
  /** Casa sugerida (a da maioria dos passageiros). */
  sugerida: boolean;
  /** Passageiros desta carrinha que moram aqui. */
  passageirosAqui: number;
  /** Outras carrinhas que dormem aqui (definido ou sugerido). */
  outrasCarrinhas: number;
  /** Textos onde a pesquisa procura (já normalizados). */
  termos: string[];
}

export interface GrupoSitios {
  chave: string;
  titulo: string;
  sitios: SitioDormida[];
}

/**
 * Casa que se sugere para a carrinha dormir (a da maioria dos passageiros), mesmo que já tenha onde dormir
 * definido; null se nenhum passageiro morar numa casa CMF.
 */
export function sugestaoDeDormida(estado: Estado, ind: Indices, carrinhaId: Id): Id | null {
  const carrinha = ind.carrinhas.get(carrinhaId);
  if (!carrinha) return null;
  const semSitio: Carrinha = { ...carrinha, dormeCasaId: null, dormeLocalId: null };
  const d = dormidasDasCarrinhas({ ...estado, carrinhas: [semSitio] }, ind).get(carrinhaId);
  return d?.confianca === 'sugerida' ? d.casaId : null;
}

function termos(...textos: (string | null | undefined)[]): string[] {
  return textos.filter((t): t is string => Boolean(t?.trim())).map(normalizarTexto);
}

/** Locais que não são casas nem obras (estacionamentos, oficinas…), e o local onde a carrinha já dorme. */
function outrosLocais(estado: Estado, atual: ChaveDormida | null): Local[] {
  const comparar = new Intl.Collator('pt', { sensitivity: 'base', numeric: true }).compare;
  return estado.locais
    .filter((l) => (l.tipo !== 'casa' && l.tipo !== 'obra') || atual === `local:${l.id}`)
    .sort((a, b) => comparar(a.nome, b.nome));
}

/**
 * Sítios onde a carrinha pode dormir, agrupados: "Por definir"; as casas pela ordem, com as da mesma morada
 * num grupo com o nome da morada e as casas sozinhas seguidas num grupo "Casas"; e os outros locais.
 * `dormidas` = onde dormem as carrinhas no estado visível (para contar as outras que dormem em cada sítio).
 */
export function montarSitiosDormida(
  estado: Estado,
  ind: Indices,
  dormidas: ReadonlyMap<Id, Dormida>,
  carrinhaId: Id,
): GrupoSitios[] {
  const carrinha = ind.carrinhas.get(carrinhaId);
  if (!carrinha) return [];
  const atual = chaveDormida(carrinha);
  const sugestao = sugestaoDeDormida(estado, ind, carrinhaId);
  const passageiros = ind.passageiros.get(carrinhaId) ?? [];
  const outras = (aqui: (d: Dormida) => boolean) =>
    [...dormidas.values()].filter(
      (d) => d.carrinhaId !== carrinhaId && d.confianca !== 'desconhecida' && aqui(d),
    ).length;

  const nomeSugestao = sugestao ? ind.casas.get(sugestao)?.nome : undefined;
  const porDefinir: SitioDormida = {
    chave: CHAVE_POR_DEFINIR,
    valor: null,
    tipo: 'por-definir',
    rotulo: ROTULO_POR_DEFINIR_OPCAO,
    detalhe: nomeSugestao
      ? `O mapa usa a sugestão: ${nomeSugestao}`
      : 'Sem sugestão: nenhum passageiro mora numa casa CMF',
    atual: atual === null,
    sugerida: false,
    passageirosAqui: 0,
    outrasCarrinhas: 0,
    termos: termos(ROTULO_POR_DEFINIR_OPCAO, 'sugestão sugerido sugerida'),
  };
  const grupos: GrupoSitios[] = [{ chave: CHAVE_POR_DEFINIR, titulo: 'Por definir', sitios: [porDefinir] }];

  const moradasVistas = new Set<Id>();
  let soltas: GrupoSitios | null = null;
  for (const primeira of [...estado.casas].sort((a, b) => a.ordem - b.ordem)) {
    if (moradasVistas.has(primeira.localId)) continue;
    moradasVistas.add(primeira.localId);
    const daMorada = ind.casasPorLocal.get(primeira.localId) ?? [primeira];
    const local = ind.locais.get(primeira.localId);
    const sozinha = daMorada.length === 1;
    const sitios = daMorada.map((casa): SitioDormida => {
      const chave = `casa:${casa.id}`;
      return {
        chave,
        valor: chave,
        tipo: 'casa',
        rotulo: casa.nome,
        detalhe: sozinha ? (local?.morada ?? null) : casa.apartamento,
        atual: atual === chave,
        sugerida: casa.id === sugestao,
        passageirosAqui: passageiros.filter((p) => p.casaId === casa.id).length,
        outrasCarrinhas: outras((d) => d.casaId === casa.id),
        termos: termos(casa.nome, casa.apartamento, local?.nome, local?.morada),
      };
    });
    if (!sozinha) {
      soltas = null;
      grupos.push({
        chave: `morada:${primeira.localId}`,
        titulo: `Casas — ${local?.nome ?? 'mesma morada'}`,
        sitios,
      });
    } else if (soltas) {
      soltas.sitios.push(...sitios);
    } else {
      soltas = { chave: `casas:${primeira.id}`, titulo: 'Casas', sitios };
      grupos.push(soltas);
    }
  }

  const locais = outrosLocais(estado, atual).map((local): SitioDormida => {
    const chave = `local:${local.id}`;
    return {
      chave,
      valor: chave,
      tipo: 'local',
      rotulo: local.nome,
      detalhe: [ROTULO_TIPO_LOCAL[local.tipo], local.morada].filter(Boolean).join(' · '),
      atual: atual === chave,
      sugerida: false,
      passageirosAqui: 0,
      outrasCarrinhas: outras((d) => d.casaId === null && d.localId === local.id),
      termos: termos(local.nome, local.morada, ROTULO_TIPO_LOCAL[local.tipo]),
    };
  });
  if (locais.length > 0) grupos.push({ chave: 'locais', titulo: 'Outros locais', sitios: locais });
  return grupos;
}

/** Só os sítios que têm o texto (sem acentos nem maiúsculas). Grupos vazios saem. */
export function filtrarSitios(grupos: readonly GrupoSitios[], texto: string): GrupoSitios[] {
  const termo = normalizarTexto(texto);
  if (!termo) return [...grupos];
  const termoCompacto = compactar(texto);
  return grupos
    .map((g) => ({
      ...g,
      sitios: g.sitios.filter(
        (s) =>
          s.termos.some((t) => t.includes(termo)) ||
          (termoCompacto.length > 0 && s.termos.some((t) => compactar(t).includes(termoCompacto))),
      ),
    }))
    .filter((g) => g.sitios.length > 0);
}

/** Sítios que se podem escolher (todos menos o atual), pela ordem em que aparecem (para as setas). */
export function sitiosEscolhiveis(grupos: readonly GrupoSitios[]): SitioDormida[] {
  return grupos.flatMap((g) => g.sitios.filter((s) => !s.atual));
}

/** "2 passageiros moram aqui · dormem aqui outras 3 carrinhas"; null se não houver nada a dizer. */
export function contagens(sitio: Pick<SitioDormida, 'passageirosAqui' | 'outrasCarrinhas'>): string | null {
  const partes = [
    sitio.passageirosAqui > 0
      ? comPlural(sitio.passageirosAqui, 'passageiro mora aqui', 'passageiros moram aqui')
      : null,
    sitio.outrasCarrinhas === 1
      ? 'dorme aqui outra carrinha'
      : sitio.outrasCarrinhas > 1
        ? `dormem aqui outras ${sitio.outrasCarrinhas} carrinhas`
        : null,
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** "Onde dorme a CF 5001" (carrinha) ou "Onde dorme o DH 9250" (carro). */
export function tituloDormida(carrinha: Pick<Carrinha, 'matricula' | 'tipo'>): string {
  return `Onde dorme ${artigoDoVeiculo(carrinha.tipo)} ${formatarMatricula(carrinha.matricula)}`;
}

/** Rótulo de "Mudar onde dorme…" na ficha: "Mudar onde dorme a CF 5001…" / "… o DH 9250…" (carro). */
export function rotuloMudarDormida(carrinha: Pick<Carrinha, 'matricula' | 'tipo'>): string {
  return `Mudar onde dorme ${artigoDoVeiculo(carrinha.tipo)} ${formatarMatricula(carrinha.matricula)}…`;
}

/** Rótulo de "Confirmar sugestão": "Confirmar a sugestão: a CF 5001 dorme em Casa Um" (carro: "o DH 9250"). */
export function rotuloConfirmarSugestao(
  carrinha: Pick<Carrinha, 'matricula' | 'tipo'>,
  casaSugerida: string | null,
): string {
  const veiculo = `${artigoDoVeiculo(carrinha.tipo)} ${formatarMatricula(carrinha.matricula)}`;
  return `Confirmar a sugestão: ${veiculo} dorme em ${casaSugerida ?? 'casa sugerida'}`;
}

/**
 * Operação para a carrinha passar a dormir na casa sugerida (o que se vê no mapa passa a estar definido);
 * null se não houver sugestão (já está definido, ou não há casa a sugerir).
 */
export function operacaoConfirmarSugestao(
  estado: Estado,
  dormidas: ReadonlyMap<Id, Dormida>,
  carrinhaId: Id,
): Operacao | null {
  const d = dormidas.get(carrinhaId);
  if (d?.confianca !== 'sugerida' || d.casaId === null) return null;
  return operacaoDormida(estado, carrinhaId, `casa:${d.casaId}`);
}

/** Operações para confirmar as sugestões de todas as carrinhas que as têm, pela ordem das carrinhas. */
export function operacoesConfirmarSugestoes(estado: Estado, dormidas: ReadonlyMap<Id, Dormida>): Operacao[] {
  return [...estado.carrinhas]
    .sort((a, b) => a.ordem - b.ordem || a.matricula.localeCompare(b.matricula))
    .flatMap((c) => {
      const op = operacaoConfirmarSugestao(estado, dormidas, c.id);
      return op ? [op] : [];
    });
}

/** "Confirmar a sugestão de 1 carrinha", "… de 22 carrinhas". */
export function textoConfirmarSugestoes(n: number): string {
  return `Confirmar a sugestão de ${comPlural(n, 'carrinha', 'carrinhas')}`;
}
