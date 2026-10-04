// Morada e posição de um local (M2, docs/m2.md, "Obras" e "Geocodificação"): o país, o campo da morada,
// "Procurar" (geocodificarMorada, no servidor) com a lista de resultados, e um mini-mapa (Leaflet, ~200 px)
// onde se clica ou arrasta o pino; clicar pede a morada ao servidor (geocodificarPosicao). Funciona em
// todas as vistas (o mini-mapa está dentro do diálogo: nunca muda de vista). Serve a obra nova, o
// estacionamento e a morada de uma casa (ficha da casa).
// CONTRATO DO M2: o módulo Obras implementa (este ficheiro é dele); o módulo Fichas usa-o na ficha da casa.

import type { Pais } from '../../dominio/tipos';

/** O que o campo devolve: a morada escrita (ou a do serviço), o país e a posição (null = sem pino). */
export interface ValorMorada {
  morada: string;
  pais: Pais;
  lat: number | null;
  lng: number | null;
}

export function CampoMorada({
  valor,
  aoMudar,
  rotulo = 'Morada',
}: {
  valor: ValorMorada;
  aoMudar: (valor: ValorMorada) => void;
  rotulo?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-700">{rotulo}</span>
      <input
        type="text"
        value={valor.morada}
        onChange={(e) => aoMudar({ ...valor, morada: e.target.value })}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5"
      />
    </label>
  );
}
