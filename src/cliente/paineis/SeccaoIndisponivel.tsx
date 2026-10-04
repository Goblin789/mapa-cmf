// Secção "Indisponível" da ficha da pessoa (M2, docs/m2.md, "Indisponível"): se está indisponível hoje
// ("até 12/10" ou "sem data de regresso"), os próximos períodos e, no modo de edição, "Marcar
// indisponível…", "Já voltou" (termina ontem; apaga se começou hoje), "Mudar datas…" e "Apagar". Só datas:
// nunca motivo nem texto livre. Não aparece nada quando não há períodos e não se está a editar.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import type { Pessoa } from '../../dominio/tipos';

export function SeccaoIndisponivel({ pessoa }: { pessoa: Pessoa }) {
  void pessoa;
  return null;
}
