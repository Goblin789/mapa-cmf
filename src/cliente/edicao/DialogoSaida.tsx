// "Saiu da empresa" / "Voltou à empresa" (M2, docs/m2.md, "Fichas"). Sair: um passo com a pessoa fora da
// casa, da carrinha e da obra, sem conduzir, e `ativa` = false (nunca se apaga a pessoa nem o histórico).
// Voltar: `ativa` = true (fica em "Fora das casas CMF" e "Sem transporte da empresa").
// CONTRATO DO M2: o módulo Fichas implementa (este ficheiro é dele).

import type { Id } from '../../dominio/tipos';
import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoSaida({ pessoaId, aoFechar }: { pessoaId: Id; aoFechar: () => void }) {
  void pessoaId;
  return (
    <Dialogo
      titulo="Saiu da empresa"
      aoFechar={aoFechar}
      rodape={
        <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
          Fechar
        </button>
      }
    >
      <p className="text-sm text-slate-700">Em construção (M2).</p>
    </Dialogo>
  );
}
