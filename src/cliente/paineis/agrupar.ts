// Agrupar pessoas e contagens por cliente, pela ordem dos clientes (a mesma da legenda).
// O cliente de cada pessoa é o que lhe dá a cor: o da obra, ou o da pessoa enquanto não tem obra.

import { clienteEfetivoId } from '../../dominio/cores';
import type { Indices } from '../../dominio/indices';
import type { Cliente, Id, Pessoa } from '../../dominio/tipos';

export function clientesPorOrdem(clientes: Iterable<Cliente>): Cliente[] {
  return [...clientes].sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, 'pt'));
}

/** Clientes conhecidos primeiro, pela ordem; ids desconhecidos no fim. */
function compararPorCliente(a: { clienteId: Id; cliente: Cliente | null }, b: typeof a): number {
  const ordemA = a.cliente?.ordem ?? Number.MAX_SAFE_INTEGER;
  const ordemB = b.cliente?.ordem ?? Number.MAX_SAFE_INTEGER;
  return ordemA - ordemB || a.clienteId.localeCompare(b.clienteId);
}

export interface GrupoCliente {
  clienteId: Id;
  cliente: Cliente | null;
  /** Pela ordem em que vieram (os índices já vêm ordenados por nome curto). */
  pessoas: Pessoa[];
}

export function agruparPorCliente(
  pessoas: Pessoa[],
  ind: Pick<Indices, 'clientes' | 'obras'>,
): GrupoCliente[] {
  const grupos = new Map<Id, Pessoa[]>();
  for (const p of pessoas) {
    const id = clienteEfetivoId(p, ind.obras);
    const lista = grupos.get(id);
    if (lista) lista.push(p);
    else grupos.set(id, [p]);
  }
  return [...grupos]
    .map(([clienteId, lista]) => ({
      clienteId,
      cliente: ind.clientes.get(clienteId) ?? null,
      pessoas: lista,
    }))
    .sort(compararPorCliente);
}

export interface ParcelaCliente {
  clienteId: Id;
  cliente: Cliente | null;
  n: number;
}

/** Divisão de um contador por cliente, sem os zeros. */
export function divisaoPorCliente(
  porCliente: Record<Id, number>,
  clientes: Map<Id, Cliente>,
): ParcelaCliente[] {
  return Object.entries(porCliente)
    .filter(([, n]) => n > 0)
    .map(([clienteId, n]) => ({ clienteId, cliente: clientes.get(clienteId) ?? null, n }))
    .sort(compararPorCliente);
}

/** Número de um cliente num contador; só lê chaves próprias (um id como "constructor" não apanha o protótipo). */
export function contagemDoCliente(porCliente: Record<Id, number>, clienteId: Id): number {
  return Object.hasOwn(porCliente, clienteId) ? (porCliente[clienteId] ?? 0) : 0;
}
