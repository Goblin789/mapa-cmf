// Ficha da obra (M2, docs/m2.md, "Obras"): "quem vem para esta obra e de onde" — o cliente, a morada, o
// estacionamento, as pessoas da obra agrupadas pela casa e pela carrinha de onde vêm e, no modo de edição,
// "Editar obra…" (DialogoObra) e "Apagar obra" (só sem pessoas, ou tirando-as no mesmo passo).
// CONTRATO DO M2: versão mínima; o módulo Obras implementa (este ficheiro é dele).

import type { Indices } from '../../dominio/indices';
import type { Obra } from '../../dominio/tipos';
import { Moldura, Secao } from './MolduraFicha';
import { GrelhaNomes } from './pecas';

export function FichaObra({ obra, indices }: { obra: Obra; indices: Indices }) {
  const cliente = indices.clientes.get(obra.clienteId);
  const local = indices.locais.get(obra.localId);
  const pessoas = indices.trabalhadores.get(obra.id) ?? [];
  return (
    <Moldura
      tipo="Obra"
      titulo={obra.nome}
      subtitulo={[cliente?.nome, local?.morada].filter(Boolean).join(' · ') || undefined}
    >
      <Secao titulo={`Pessoas (${pessoas.length})`}>
        <GrelhaNomes pessoas={pessoas} vazio="Ninguém nesta obra." />
      </Secao>
    </Moldura>
  );
}
