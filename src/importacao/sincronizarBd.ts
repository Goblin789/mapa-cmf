// Sincronização dos dados iniciais na base de dados: o ensaio só lê; o --aplicar grava tudo numa só
// transação IMMEDIATE (ninguém grava pelo meio, nem o servidor) e regista UM lote no histórico
// (autor 'dados-iniciais', tipo 'ficha') com uma linha em `alteracoes` por campo mudado.
// O plano volta a calcular-se dentro da transação: o que se grava é o que a base de dados tem nesse
// momento, não o que tinha quando se fez o ensaio. As regras estão em sincronizar.ts (funções puras).

import { existsSync } from 'node:fs';
import Database from 'better-sqlite3';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { Estado, Id } from '../dominio/tipos';
import * as esquema from '../servidor/db/esquema';
import type { Bd } from '../servidor/db/ligacao';
import { lerEstado, lerVersao } from '../servidor/estado';
import {
  AUTOR_SINCRONIZACAO,
  alteracoesDoPlano,
  CAMPOS_UNICOS,
  type EntidadeSincronizada,
  type PlanoSincronizacao,
  planearSincronizacao,
  planoVazio,
  resumoDoPlano,
} from './sincronizar';
import type { DadosReferencia } from './tipos';

/** Linhas por INSERT (fica longe do limite de variáveis do SQLite). */
const POR_INSERT = 100;

function blocos<T>(lista: readonly T[]): T[][] {
  const r: T[][] = [];
  for (let i = 0; i < lista.length; i += POR_INSERT) r.push(lista.slice(i, i + POR_INSERT));
  return r;
}

type Transacao = Parameters<Parameters<Bd['transaction']>[0]>[0];

/** Muda só os campos dados de um registo. */
function atualizar(
  tx: Transacao,
  entidade: EntidadeSincronizada,
  id: Id,
  valores: Record<string, unknown>,
): void {
  switch (entidade) {
    case 'cliente':
      tx.update(esquema.clientes)
        .set(valores as Partial<typeof esquema.clientes.$inferInsert>)
        .where(eq(esquema.clientes.id, id))
        .run();
      return;
    case 'local':
      tx.update(esquema.locais)
        .set(valores as Partial<typeof esquema.locais.$inferInsert>)
        .where(eq(esquema.locais.id, id))
        .run();
      return;
    case 'casa':
      tx.update(esquema.casas)
        .set(valores as Partial<typeof esquema.casas.$inferInsert>)
        .where(eq(esquema.casas.id, id))
        .run();
      return;
    case 'carrinha':
      tx.update(esquema.carrinhas)
        .set(valores as Partial<typeof esquema.carrinhas.$inferInsert>)
        .where(eq(esquema.carrinhas.id, id))
        .run();
      return;
  }
}

/**
 * Abre a base de dados só para ler (o ensaio não escreve nada, nem as migrações).
 * Erro se o ficheiro não existir.
 */
export function abrirBdSoLeitura(caminho: string): Bd {
  if (!existsSync(caminho)) throw new Error(`Não encontrei a base de dados: ${caminho}`);
  const sqlite = new Database(caminho, { readonly: true, fileMustExist: true });
  sqlite.pragma('busy_timeout = 5000');
  return drizzle(sqlite, { schema: esquema }) as Bd;
}

export interface Ensaio {
  plano: PlanoSincronizacao;
  /** Versão do estado lido (o maior id de lote). */
  versao: number;
  estado: Estado;
}

/** Calcula o plano sem gravar nada (leitura coerente, numa transação). */
export function ensaiarSincronizacao(bd: Bd, dados: DadosReferencia, agora: Date = new Date()): Ensaio {
  return bd.transaction((tx) => {
    const estado = lerEstado(tx, agora);
    return { plano: planearSincronizacao(dados, estado), versao: estado.versao, estado };
  });
}

interface Calculado {
  plano: PlanoSincronizacao;
  /** O que a base de dados tinha antes de gravar (o plano foi calculado sobre isto). */
  estado: Estado;
}

/**
 * aplicado: um lote novo no histórico; vazio: a base de dados já está igual aos dados iniciais (não se
 * grava nada, nem lote); recusado: há erros bloqueantes (não se grava nada).
 */
export type ResultadoSincronizacao =
  | (Calculado & { tipo: 'aplicado'; loteId: number; versao: number; alteracoes: number })
  | (Calculado & { tipo: 'vazio' })
  | (Calculado & { tipo: 'recusado' });

/**
 * Aplica a sincronização: tudo ou nada. Recusa se houver erros bloqueantes; sem diferenças, não cria lote.
 * Ordem (por causa das chaves estrangeiras e dos valores únicos): locais novos e alterados; pessoas sem
 * transporte, condutores e onde dorme retirados; saídas (veículos, casas, clientes); mudanças dos campos
 * únicos em dois passos; o resto das mudanças; registos novos; lote e histórico.
 */
export function aplicarSincronizacao(
  bd: Bd,
  dados: DadosReferencia,
  opcoes: { agora: Date },
): ResultadoSincronizacao {
  return bd.transaction(
    (tx): ResultadoSincronizacao => {
      const estado = lerEstado(tx, opcoes.agora);
      const plano = planearSincronizacao(dados, estado);
      if (plano.erros.length > 0) return { tipo: 'recusado', plano, estado };
      if (planoVazio(plano)) return { tipo: 'vazio', plano, estado };

      const valoresDe = (mudancas: { campo: string; depois: unknown }[]) =>
        Object.fromEntries(mudancas.map((m) => [m.campo, m.depois]));

      // 1. Locais (as casas novas ou mudadas podem apontar para eles).
      for (const b of blocos(plano.novos.locais)) tx.insert(esquema.locais).values(b).run();
      for (const a of plano.alterados) {
        if (a.entidade === 'local') atualizar(tx, 'local', a.id, valoresDe(a.mudancas));
      }

      // 2. Consequências das saídas.
      const aConfirmar = new Set(
        plano.semTransporte.filter((s) => !s.aConfirmarAntes).map((s) => s.pessoaId),
      );
      for (const s of plano.semTransporte) {
        tx.update(esquema.pessoas)
          .set(
            aConfirmar.has(s.pessoaId)
              ? { carrinhaId: null, carrinhaAConfirmar: true }
              : { carrinhaId: null },
          )
          .where(eq(esquema.pessoas.id, s.pessoaId))
          .run();
      }
      for (const c of plano.condutoresRetirados) {
        tx.update(esquema.carrinhas)
          .set({ condutorId: null })
          .where(eq(esquema.carrinhas.id, c.carrinhaId))
          .run();
      }
      for (const d of plano.dormidasRetiradas) {
        tx.update(esquema.carrinhas)
          .set({ dormeCasaId: null })
          .where(eq(esquema.carrinhas.id, d.carrinhaId))
          .run();
      }

      // 3. Saídas (já ninguém aponta para elas).
      for (const c of plano.removidos.carrinhas) {
        tx.delete(esquema.carrinhas).where(eq(esquema.carrinhas.id, c.id)).run();
      }
      for (const c of plano.removidos.casas) tx.delete(esquema.casas).where(eq(esquema.casas.id, c.id)).run();
      for (const c of plano.removidos.clientes) {
        tx.delete(esquema.clientes).where(eq(esquema.clientes.id, c.id)).run();
      }

      // 4. Campos únicos que mudam: primeiro um valor provisório (único), para trocas não colidirem.
      const outros = plano.alterados.filter((a) => a.entidade !== 'local');
      for (const a of outros) {
        const unicos = a.mudancas.filter((m) => CAMPOS_UNICOS[a.entidade].includes(m.campo));
        if (unicos.length === 0) continue;
        atualizar(
          tx,
          a.entidade,
          a.id,
          Object.fromEntries(
            unicos.map((m) => [m.campo, `\u0001sincronizar\u0001${a.entidade}\u0001${a.id}`]),
          ),
        );
      }
      for (const a of outros) atualizar(tx, a.entidade, a.id, valoresDe(a.mudancas));

      // 5. Registos novos.
      for (const b of blocos(plano.novos.clientes)) tx.insert(esquema.clientes).values(b).run();
      for (const b of blocos(plano.novos.casas)) tx.insert(esquema.casas).values(b).run();
      for (const b of blocos(plano.novos.carrinhas)) tx.insert(esquema.carrinhas).values(b).run();

      // 6. Histórico: um lote com uma linha por campo mudado.
      const quando = opcoes.agora.toISOString();
      const { id: loteId } = tx
        .insert(esquema.lotes)
        .values({
          autor: AUTOR_SINCRONIZACAO,
          tipo: 'ficha',
          estado: 'aplicado',
          criadoEm: quando,
          efetivoEm: quando,
          comentario: resumoDoPlano(plano),
        })
        .returning({ id: esquema.lotes.id })
        .get();
      const linhas = alteracoesDoPlano(plano).map((l) => ({ loteId, ...l }));
      for (const b of blocos(linhas)) tx.insert(esquema.alteracoes).values(b).run();

      return { tipo: 'aplicado', plano, estado, loteId, versao: lerVersao(tx), alteracoes: linhas.length };
    },
    { behavior: 'immediate' },
  );
}
