// Contadores do topo do ecrã.

import { clienteEfetivoId } from './cores';
import { type Indices, indexar } from './indices';
import { ocupacaoCasa, ocupacaoDaCarrinha } from './ocupacao';
import type { Estado, Id, Pessoa } from './tipos';

export interface ContagemPorCliente {
  total: number;
  porCliente: Record<Id, number>;
}

export interface Contadores {
  totalPessoas: number;
  pessoasPorCliente: Record<Id, number>;
  /** Soma dos lugares livres de todas as casas. */
  lugaresLivresCasas: number;
  casasCheias: number;
  casasEmExcesso: number;
  /** Casas cujos lugares usados passam o máximo do contrato (inclui as acima do tolerado). */
  casasAcimaContrato: number;
  foraDasCasas: ContagemPorCliente;
  semTransporte: ContagemPorCliente;
  /** Lugares livres nas carrinhas, sem contar quem está indisponível no `hoje` dos índices. */
  lugaresLivresCarrinhas: number;
  /** Carrinhas sem ninguém (ou só com quem está indisponível no `hoje` dos índices). */
  carrinhasSemPassageiros: number;
  /** Carrinhas paradas ou na oficina. Os estados das carrinhas chegam no M3; por agora é sempre 0. */
  carrinhasParadas: number;
  /** Pessoas com casa ou carrinha por confirmar. */
  aConfirmar: number;
}

function contarPorCliente(pessoas: Pessoa[], ind: Indices): ContagemPorCliente {
  // Map e não {}: um id como "constructor" ou "toString" apanharia o valor de Object.prototype.
  const porCliente = new Map<Id, number>();
  for (const p of pessoas) {
    const id = clienteEfetivoId(p, ind.obras);
    porCliente.set(id, (porCliente.get(id) ?? 0) + 1);
  }
  return { total: pessoas.length, porCliente: Object.fromEntries(porCliente) };
}

export function calcularContadores(estado: Estado, ind: Indices = indexar(estado)): Contadores {
  const ativas = estado.pessoas.filter((p) => p.ativa);

  let lugaresLivresCasas = 0;
  let casasCheias = 0;
  let casasEmExcesso = 0;
  let casasAcimaContrato = 0;
  for (const casa of estado.casas) {
    const oc = ocupacaoCasa(casa, ind.moradores.get(casa.id)?.length ?? 0);
    lugaresLivresCasas += oc.livres;
    if (oc.nivel === 'cheio') casasCheias++;
    if (oc.nivel === 'excesso') casasEmExcesso++;
    if (oc.aviso === 'acima_maximo' || oc.aviso === 'acima_tolerado') casasAcimaContrato++;
  }

  let lugaresLivresCarrinhas = 0;
  let carrinhasSemPassageiros = 0;
  // M2: quem está indisponível hoje não ocupa lugar na carrinha (ocupacaoDaCarrinha, como no ecrã).
  for (const carrinha of estado.carrinhas) {
    const oc = ocupacaoDaCarrinha(ind, carrinha);
    lugaresLivresCarrinhas += oc.livres;
    if (oc.ocupados === 0) carrinhasSemPassageiros++;
  }

  return {
    totalPessoas: ativas.length,
    pessoasPorCliente: contarPorCliente(ativas, ind).porCliente,
    lugaresLivresCasas,
    casasCheias,
    casasEmExcesso,
    casasAcimaContrato,
    foraDasCasas: contarPorCliente(ind.foraDasCasas, ind),
    semTransporte: contarPorCliente(ind.semTransporte, ind),
    lugaresLivresCarrinhas,
    carrinhasSemPassageiros,
    carrinhasParadas: 0,
    aConfirmar: ativas.filter((p) => p.casaAConfirmar || p.carrinhaAConfirmar).length,
  };
}
