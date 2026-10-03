// Do estado para o que o mapa desenha: um grupo por local (as casas desse local e as carrinhas que
// lá dormem) e, à parte, o que não tem sítio no mapa (vai para a doca).

import type { ConfiancaDormida, Dormida } from '../../../dominio/dormidas';
import type { Indices } from '../../../dominio/indices';
import { avisoContrato } from '../../../dominio/ocupacao';
import type { Casa, Estado, Id } from '../../../dominio/tipos';
import { lugaresADesenhar } from './medidas';

export interface CasaNoMapa {
  id: Id;
  /** Lugares a desenhar: a lotação, ou os ocupados se houver gente a mais. */
  nLugares: number;
  /** Passa o máximo do contrato (mostra o aviso). */
  comAviso: boolean;
}

export interface CarrinhaNoMapa {
  id: Id;
  nLugares: number;
  confianca: ConfiancaDormida;
}

export interface GrupoNoMapa {
  localId: Id;
  nome: string;
  lat: number;
  lng: number;
  casas: CasaNoMapa[];
  carrinhas: CarrinhaNoMapa[];
}

export interface ModeloMapa {
  grupos: GrupoNoMapa[];
  /** Carrinhas sem sítio conhecido onde dormir (ou cujo local não tem coordenadas). */
  carrinhasSemLocal: CarrinhaNoMapa[];
  /** Casas cujo local não tem coordenadas (não devia acontecer depois da geocodificação). */
  casasSemLocal: CasaNoMapa[];
}

export const chaveGrupo = (localId: Id) => `grupo:${localId}`;
export const chaveCasa = (id: Id) => `casa:${id}`;
export const chaveCarrinha = (id: Id) => `carrinha:${id}`;

function casaNoMapa(casa: Casa, ind: Indices): CasaNoMapa {
  const ocupados = ind.moradores.get(casa.id)?.length ?? 0;
  const aviso = avisoContrato(casa, ocupados);
  return {
    id: casa.id,
    nLugares: lugaresADesenhar(casa.lotacao, ocupados),
    comAviso: aviso === 'acima_maximo' || aviso === 'acima_tolerado',
  };
}

const comparadorNomes = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

export function montarModelo(estado: Estado, ind: Indices, dormidas: ReadonlyMap<Id, Dormida>): ModeloMapa {
  const grupos = new Map<Id, GrupoNoMapa>();
  const casasSemLocal: CasaNoMapa[] = [];
  const carrinhasSemLocal: CarrinhaNoMapa[] = [];

  const grupoDoLocal = (localId: Id): GrupoNoMapa | null => {
    const existente = grupos.get(localId);
    if (existente) return existente;
    const local = ind.locais.get(localId);
    if (!local || local.lat === null || local.lng === null) return null;
    const novo: GrupoNoMapa = {
      localId,
      nome: local.nome,
      lat: local.lat,
      lng: local.lng,
      casas: [],
      carrinhas: [],
    };
    grupos.set(localId, novo);
    return novo;
  };

  for (const [localId, casas] of ind.casasPorLocal) {
    for (const casa of casas) {
      const c = casaNoMapa(casa, ind);
      const grupo = grupoDoLocal(localId);
      if (grupo) grupo.casas.push(c);
      else casasSemLocal.push(c);
    }
  }

  const carrinhas = [...estado.carrinhas].sort(
    (a, b) => a.ordem - b.ordem || comparadorNomes.compare(a.matricula, b.matricula),
  );
  for (const carrinha of carrinhas) {
    const dormida = dormidas.get(carrinha.id);
    const ocupados = ind.passageiros.get(carrinha.id)?.length ?? 0;
    const confianca = dormida?.confianca ?? 'desconhecida';
    const c: CarrinhaNoMapa = {
      id: carrinha.id,
      nLugares: lugaresADesenhar(carrinha.lugares, ocupados),
      confianca,
    };
    const grupo = confianca !== 'desconhecida' && dormida?.localId ? grupoDoLocal(dormida.localId) : null;
    if (grupo) grupo.carrinhas.push(c);
    else carrinhasSemLocal.push(c);
  }

  return {
    grupos: [...grupos.values()].sort(
      (a, b) => comparadorNomes.compare(a.nome, b.nome) || comparadorNomes.compare(a.localId, b.localId),
    ),
    carrinhasSemLocal,
    casasSemLocal,
  };
}
