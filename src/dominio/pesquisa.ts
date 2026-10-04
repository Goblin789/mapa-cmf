// Pesquisa rápida por nome, número ou matrícula (pessoas, carrinhas, casas e, no M2, obras).
// Indiferente a acentos e maiúsculas.

import type { Indices } from './indices';
import type { Estado, Id } from './tipos';

/** Minúsculas, sem acentos, espaços normalizados. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Forma compacta para matrículas e números: sem espaços, hífenes nem sublinhados. */
export function compactar(s: string): string {
  return normalizarTexto(s).replace(/[\s\-_]/g, '');
}

export interface ResultadoPesquisa {
  /** M2: também obras (rótulo = nome, detalhe "Cliente · N pessoas"). */
  tipo: 'pessoa' | 'carrinha' | 'casa' | 'obra';
  id: Id;
  rotulo: string;
  detalhe: string;
  pontuacao: number;
}

/** 3 = igual, 2 = começa por, 1 = uma palavra começa por, 0.5 = contém, 0 = não. */
function pontuar(alvo: string, termo: string): number {
  const a = normalizarTexto(alvo);
  if (!a || !termo) return 0;
  if (a === termo) return 3;
  if (a.startsWith(termo)) return 2;
  if (a.split(' ').some((palavra) => palavra.startsWith(termo))) return 1;
  if (a.includes(termo)) return 0.5;
  return 0;
}

function pontuarCompacto(alvo: string, termo: string): number {
  const a = compactar(alvo);
  const t = compactar(termo);
  if (!a || !t) return 0;
  if (a === t) return 3;
  if (a.startsWith(t)) return 2;
  if (t.length >= 3 && a.includes(t)) return 0.5;
  return 0;
}

export function pesquisar(estado: Estado, ind: Indices, termoBruto: string, limite = 8): ResultadoPesquisa[] {
  const termo = normalizarTexto(termoBruto);
  if (termo.length < 2) return [];
  const resultados: ResultadoPesquisa[] = [];

  for (const p of estado.pessoas) {
    if (!p.ativa) continue;
    const pontuacao = Math.max(
      pontuar(p.nomeCurto, termo),
      pontuar(`${p.nome} ${p.apelidos}`, termo) * 0.9,
      ...p.nomesAlternativos.map((n) => pontuar(n, termo) * 0.8),
      p.numero ? pontuarCompacto(p.numero, termo) : 0,
    );
    if (pontuacao > 0) {
      const casa = p.casaId ? ind.casas.get(p.casaId)?.nome : 'Fora das casas CMF';
      const carrinha = p.carrinhaId ? ind.carrinhas.get(p.carrinhaId)?.matricula : 'sem transporte';
      resultados.push({
        tipo: 'pessoa',
        id: p.id,
        rotulo: p.nomeCurto,
        detalhe: `${casa ?? '?'} · ${carrinha ?? '?'}`,
        pontuacao,
      });
    }
  }

  for (const c of estado.carrinhas) {
    const pontuacao = Math.max(
      pontuarCompacto(c.matricula, termo),
      ...c.matriculasAlternativas.map((m) => pontuarCompacto(m, termo) * 0.9),
      pontuar([c.marca, c.modelo].filter(Boolean).join(' '), termo) * 0.6,
    );
    if (pontuacao > 0) {
      // M2: sem quem está indisponível hoje (o lugar fica livre), como a pastilha e o Mover para….
      const n = ind.ocupadosCarrinha.get(c.id) ?? ind.passageiros.get(c.id)?.length ?? 0;
      resultados.push({
        tipo: 'carrinha',
        id: c.id,
        rotulo: c.matricula,
        detalhe: `${n}/${c.lugares} lugares${c.modelo ? ` · ${c.modelo}` : ''}`,
        pontuacao,
      });
    }
  }

  for (const casa of estado.casas) {
    const pontuacao = pontuar(casa.nome, termo);
    if (pontuacao > 0) {
      const n = ind.moradores.get(casa.id)?.length ?? 0;
      resultados.push({
        tipo: 'casa',
        id: casa.id,
        rotulo: casa.nome,
        detalhe: `${n}/${casa.lotacao} lugares`,
        pontuacao,
      });
    }
  }

  for (const obra of estado.obras) {
    const pontuacao = pontuar(obra.nome, termo);
    if (pontuacao > 0) {
      const n = ind.trabalhadores.get(obra.id)?.length ?? 0;
      const cliente = ind.clientes.get(obra.clienteId)?.nome ?? '?';
      resultados.push({
        tipo: 'obra',
        id: obra.id,
        rotulo: obra.nome,
        detalhe: `${cliente} · ${n === 1 ? '1 pessoa' : `${n} pessoas`}`,
        pontuacao,
      });
    }
  }

  return resultados
    .sort((a, b) => b.pontuacao - a.pontuacao || a.rotulo.localeCompare(b.rotulo, 'pt'))
    .slice(0, limite);
}
