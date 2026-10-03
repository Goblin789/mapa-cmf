// Do estado para o que o mapa desenha: um grupo por local (as casas desse local, as carrinhas que
// lá dormem e as obras desse local) e, à parte, o que não tem sítio no mapa (vai para a doca).
// As camadas desligadas não entram: o layout e o enquadramento recalculam-se só com o que se vê.

import type { ConfiancaDormida, Dormida } from '../../../dominio/dormidas';
import type { Indices } from '../../../dominio/indices';
import type { Estado, Id } from '../../../dominio/tipos';
import type { Camada } from '../../estado/loja';
import { lugaresADesenhar } from './medidas';

export interface CasaNoMapa {
  id: Id;
  /** Lugares a desenhar: a lotação, ou os ocupados se houver gente a mais. */
  nLugares: number;
}

export interface CarrinhaNoMapa {
  id: Id;
  nLugares: number;
  confianca: ConfiancaDormida;
}

export interface ObraNoMapa {
  id: Id;
  /** Pessoas a trabalhar lá (a obra não tem lugares). */
  nPessoas: number;
}

export interface GrupoNoMapa {
  localId: Id;
  nome: string;
  lat: number;
  lng: number;
  casas: CasaNoMapa[];
  carrinhas: CarrinhaNoMapa[];
  obras: ObraNoMapa[];
}

export interface ModeloMapa {
  grupos: GrupoNoMapa[];
  /** Carrinhas sem sítio conhecido onde dormir (ou cujo local não tem coordenadas). */
  carrinhasSemLocal: CarrinhaNoMapa[];
  /** Casas cujo local não tem coordenadas (não devia acontecer depois da geocodificação). */
  casasSemLocal: CasaNoMapa[];
  /** Obras cujo local não tem coordenadas. */
  obrasSemLocal: ObraNoMapa[];
}

export type CamadasVisiveis = Readonly<Record<Camada, boolean>>;

export const TODAS_AS_CAMADAS: CamadasVisiveis = { casas: true, carrinhas: true, obras: true };

export const chaveGrupo = (localId: Id) => `grupo:${localId}`;
export const chaveCasa = (id: Id) => `casa:${id}`;
export const chaveCarrinha = (id: Id) => `carrinha:${id}`;
export const chaveObra = (id: Id) => `obra:${id}`;

const comparadorNomes = new Intl.Collator('pt', { sensitivity: 'base', numeric: true });

export function montarModelo(
  estado: Estado,
  ind: Indices,
  dormidas: ReadonlyMap<Id, Dormida>,
  camadas: CamadasVisiveis = TODAS_AS_CAMADAS,
): ModeloMapa {
  const grupos = new Map<Id, GrupoNoMapa>();
  const casasSemLocal: CasaNoMapa[] = [];
  const carrinhasSemLocal: CarrinhaNoMapa[] = [];
  const obrasSemLocal: ObraNoMapa[] = [];

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
      obras: [],
    };
    grupos.set(localId, novo);
    return novo;
  };

  if (camadas.casas) {
    for (const [localId, casas] of ind.casasPorLocal) {
      for (const casa of casas) {
        const c = {
          id: casa.id,
          nLugares: lugaresADesenhar(casa.lotacao, ind.moradores.get(casa.id)?.length ?? 0),
        };
        const grupo = grupoDoLocal(localId);
        if (grupo) grupo.casas.push(c);
        else casasSemLocal.push(c);
      }
    }
  }

  if (camadas.carrinhas) {
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
  }

  if (camadas.obras) {
    const obras = [...estado.obras].sort((a, b) => comparadorNomes.compare(a.nome, b.nome));
    for (const obra of obras) {
      const o = { id: obra.id, nPessoas: ind.trabalhadores.get(obra.id)?.length ?? 0 };
      const grupo = grupoDoLocal(obra.localId);
      if (grupo) grupo.obras.push(o);
      else obrasSemLocal.push(o);
    }
  }

  return {
    grupos: [...grupos.values()].sort(
      (a, b) => comparadorNomes.compare(a.nome, b.nome) || comparadorNomes.compare(a.localId, b.localId),
    ),
    carrinhasSemLocal,
    casasSemLocal,
    obrasSemLocal,
  };
}
