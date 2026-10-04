// Sessões do login Microsoft, guardadas na base de dados. O browser fica com um token aleatório
// (32 bytes) num cookie HttpOnly; na base de dados só fica o hash SHA-256, por isso uma cópia da BD
// não serve para entrar. Uma sessão acaba com 30 dias sem uso ou 90 dias depois de criada.

import { createHash, randomBytes } from 'node:crypto';
import { count, eq, inArray, lte, max, or } from 'drizzle-orm';
import type { Utilizador } from '../../dominio/api';
import * as esquema from '../db/esquema';
import type { Bd } from '../db/ligacao';

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;

/** Sem uso durante este tempo, a sessão acaba. */
export const INATIVIDADE_MAXIMA_MS = 30 * DIA_MS;
/** Limite absoluto desde que a sessão foi criada, mesmo com uso. */
export const DURACAO_MAXIMA_MS = 90 * DIA_MS;
/** O último uso grava-se no máximo uma vez por este intervalo (não escrever na BD a cada pedido). */
export const INTERVALO_ULTIMO_USO_MS = HORA_MS;

/** Token novo para o cookie: 32 bytes aleatórios em base64url. */
export function gerarToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Id da sessão na BD: SHA-256 (hex) do token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Cria uma sessão para o utilizador e devolve o token (só vai para o cookie, nunca para a BD). */
export function criarSessao(bd: Bd, utilizadorId: string, agora: Date): { token: string; expiraEm: Date } {
  const token = gerarToken();
  const expiraEm = new Date(agora.getTime() + DURACAO_MAXIMA_MS);
  bd.insert(esquema.sessoes)
    .values({
      id: hashToken(token),
      utilizadorId,
      criadaEm: agora.toISOString(),
      ultimoUsoEm: agora.toISOString(),
      expiraEm: expiraEm.toISOString(),
    })
    .run();
  return { token, expiraEm };
}

/** A sessão ainda vale a esta hora (nem o limite absoluto nem a inatividade passaram). */
export function sessaoValida(sessao: { ultimoUsoEm: string; expiraEm: string }, agora: Date): boolean {
  const t = agora.getTime();
  return Date.parse(sessao.expiraEm) > t && Date.parse(sessao.ultimoUsoEm) + INATIVIDADE_MAXIMA_MS > t;
}

/** A linha da sessão (com o utilizador) pelo id, ou undefined. */
function lerLinha(bd: Bd, id: string) {
  return bd
    .select({
      ultimoUsoEm: esquema.sessoes.ultimoUsoEm,
      expiraEm: esquema.sessoes.expiraEm,
      email: esquema.utilizadores.email,
      nome: esquema.utilizadores.nome,
    })
    .from(esquema.sessoes)
    .innerJoin(esquema.utilizadores, eq(esquema.utilizadores.id, esquema.sessoes.utilizadorId))
    .where(eq(esquema.sessoes.id, id))
    .get();
}

function utilizadorDaLinha(linha: { email: string; nome: string }): Utilizador {
  return { chave: linha.email, nome: linha.nome, email: linha.email, modo: 'entra' };
}

/**
 * Utilizador da sessão deste token, ou null se não existir ou tiver acabado (nesse caso apaga-a).
 * Atualiza o último uso se a última gravação tiver mais de uma hora.
 */
export function lerSessao(bd: Bd, token: string, agora: Date): Utilizador | null {
  const id = hashToken(token);
  const linha = lerLinha(bd, id);
  if (!linha) return null;
  if (!sessaoValida(linha, agora)) {
    apagarSessao(bd, token);
    return null;
  }
  if (agora.getTime() - Date.parse(linha.ultimoUsoEm) >= INTERVALO_ULTIMO_USO_MS) {
    bd.update(esquema.sessoes)
      .set({ ultimoUsoEm: agora.toISOString() })
      .where(eq(esquema.sessoes.id, id))
      .run();
  }
  return utilizadorDaLinha(linha);
}

/**
 * Utilizador da sessão com este id (o hash do token), se ainda valer. Só lê: não conta como uso nem
 * apaga nada (serve para rever as ligações do tempo real que ficaram abertas).
 */
export function utilizadorDaSessao(bd: Bd, id: string, agora: Date): Utilizador | null {
  const linha = lerLinha(bd, id);
  return linha && sessaoValida(linha, agora) ? utilizadorDaLinha(linha) : null;
}

/** Termina a sessão deste token (se existir). */
export function apagarSessao(bd: Bd, token: string): void {
  bd.delete(esquema.sessoes)
    .where(eq(esquema.sessoes.id, hashToken(token)))
    .run();
}

/**
 * Termina todas as sessões de um e-mail (ou de toda a gente, com null), sem reiniciar o servidor
 * (`npm run sessoes`). As ligações do tempo real dessas sessões caem na revisão de minuto a minuto.
 * Devolve quantas sessões foram apagadas.
 */
export function terminarSessoes(bd: Bd, email: string | null): number {
  if (email === null) return bd.delete(esquema.sessoes).run().changes;
  const ids = bd
    .select({ id: esquema.utilizadores.id })
    .from(esquema.utilizadores)
    .where(eq(esquema.utilizadores.email, email.trim().toLowerCase()));
  return bd.delete(esquema.sessoes).where(inArray(esquema.sessoes.utilizadorId, ids)).run().changes;
}

/** Quem tem sessões abertas (válidas ou não), com quantas e o último uso. Sem tokens nem hashes. */
export function resumoSessoes(
  bd: Bd,
): { email: string; nome: string; sessoes: number; ultimoUsoEm: string }[] {
  return bd
    .select({
      email: esquema.utilizadores.email,
      nome: esquema.utilizadores.nome,
      sessoes: count(esquema.sessoes.id),
      ultimoUsoEm: max(esquema.sessoes.ultimoUsoEm),
    })
    .from(esquema.sessoes)
    .innerJoin(esquema.utilizadores, eq(esquema.utilizadores.id, esquema.sessoes.utilizadorId))
    .groupBy(esquema.utilizadores.email, esquema.utilizadores.nome)
    .orderBy(esquema.utilizadores.email)
    .all()
    .map((l) => ({ ...l, ultimoUsoEm: l.ultimoUsoEm ?? '' }));
}

/** Apaga as sessões que já acabaram. Devolve quantas. */
export function limparSessoesExpiradas(bd: Bd, agora: Date): number {
  const limiteUso = new Date(agora.getTime() - INATIVIDADE_MAXIMA_MS).toISOString();
  return bd
    .delete(esquema.sessoes)
    .where(
      or(lte(esquema.sessoes.expiraEm, agora.toISOString()), lte(esquema.sessoes.ultimoUsoEm, limiteUso)),
    )
    .run().changes;
}

/** Limpeza de hora a hora (não impede o processo de terminar). Devolve a função que a pára. */
export function iniciarLimpezaSessoes(bd: Bd, agora: () => Date = () => new Date()): () => void {
  const temporizador = setInterval(() => {
    try {
      limparSessoesExpiradas(bd, agora());
    } catch (erro) {
      console.error('Limpeza das sessões falhou:', erro instanceof Error ? erro.message : erro);
    }
  }, HORA_MS);
  temporizador.unref();
  return () => clearInterval(temporizador);
}
