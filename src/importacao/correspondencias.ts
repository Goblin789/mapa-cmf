// Correspondência entre o texto dos Excel e os ids dos dados iniciais (clientes, casas, carrinhas).
// Indiferente a acentos e maiúsculas; matrículas também sem espaços nem hífenes.

import { compactar } from '../dominio/pesquisa';
import type { Id } from '../dominio/tipos';
import { chaveNome } from './celulas';
import type { DadosIniciais } from './tipos';

export interface Correspondencia {
  id: Id;
  /** Encontrado por um nome/matrícula alternativo (não pelo principal). */
  porAlternativa: boolean;
}

export interface Procuras {
  cliente(texto: string): Correspondencia | null;
  casa(texto: string): Correspondencia | null;
  carrinha(texto: string): Correspondencia | null;
  eForaDasCasas(texto: string): boolean;
  eSemTransporte(texto: string): boolean;
}

function mapa(entradas: [string, Correspondencia][]): Map<string, Correspondencia> {
  const m = new Map<string, Correspondencia>();
  // O primeiro ganha: os nomes principais vêm antes dos alternativos.
  for (const [chave, c] of entradas) if (chave && !m.has(chave)) m.set(chave, c);
  return m;
}

export function criarProcuras(dados: DadosIniciais): Procuras {
  const clientes = mapa([
    ...dados.clientes.flatMap((c): [string, Correspondencia][] => [
      [chaveNome(c.nomeExcel), { id: c.id, porAlternativa: false }],
      [chaveNome(c.nome), { id: c.id, porAlternativa: false }],
    ]),
    ...dados.clientes.flatMap((c) =>
      (c.nomesAlternativos ?? []).map((n): [string, Correspondencia] => [
        chaveNome(n),
        { id: c.id, porAlternativa: true },
      ]),
    ),
  ]);
  const casas = mapa(
    dados.casas.flatMap((c): [string, Correspondencia][] => [
      [chaveNome(c.nomeExcel), { id: c.id, porAlternativa: false }],
      [chaveNome(c.nome), { id: c.id, porAlternativa: false }],
    ]),
  );
  const carrinhas = mapa([
    ...dados.carrinhas.map((c): [string, Correspondencia] => [
      compactar(c.matricula),
      { id: c.id, porAlternativa: false },
    ]),
    ...dados.carrinhas.flatMap((c) =>
      c.matriculasAlternativas.map((m): [string, Correspondencia] => [
        compactar(m),
        { id: c.id, porAlternativa: true },
      ]),
    ),
  ]);
  const fora = chaveNome(dados.importacao.valoresEspeciais.foraDasCasas);
  const sem = chaveNome(dados.importacao.valoresEspeciais.semTransporte);

  return {
    cliente: (t) => clientes.get(chaveNome(t)) ?? null,
    casa: (t) => casas.get(chaveNome(t)) ?? null,
    carrinha: (t) => carrinhas.get(compactar(t)) ?? null,
    eForaDasCasas: (t) => chaveNome(t) === fora,
    eSemTransporte: (t) => chaveNome(t) === sem,
  };
}
