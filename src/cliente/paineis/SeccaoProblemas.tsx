// Secção "Problemas" da ficha da casa e da carrinha (M2, docs/m2.md, "Problemas"): os abertos (texto, desde
// quando) com "Resolver" e, no modo de edição, "Novo problema…", "Mudar texto…", "Reabrir" e "Apagar" (era
// engano); os resolvidos dos últimos 30 dias, recolhidos. Não aparece nada sem problemas fora da edição.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import type { AlvoProblema } from '../../dominio/problemas';

export function SeccaoProblemas({ alvo }: { alvo: AlvoProblema }) {
  void alvo;
  return null;
}
