// "Reverter" uma gravação do Histórico (M2, docs/m2.md, "Reverter"): mostra o que volta atrás e o que já não
// se pode reverter porque mudou entretanto (planearReversao); "Pôr no rascunho" chama loja.iniciarReversao
// (entra no modo de edição; nada é gravado até Guardar).
// CONTRATO DO M2: o módulo Histórico e Guardar implementa (este ficheiro é dele).

import type { EntradaHistorico } from '../../dominio/api';
import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoReverter({ entrada, aoFechar }: { entrada: EntradaHistorico; aoFechar: () => void }) {
  void entrada;
  return (
    <Dialogo
      titulo="Reverter"
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
