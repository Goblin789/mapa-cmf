// Problema novo / mudar o texto de um problema (M2, docs/m2.md, "Problemas"): texto curto sobre a casa ou
// a carrinha, com o aviso discreto de não pôr dados pessoais nem de saúde (avisoTextoProblema). Entra no
// rascunho (operacaoNovoProblema / 'campo' texto).
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import type { AlvoProblema } from '../../dominio/problemas';
import type { Id } from '../../dominio/tipos';
import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoProblema({
  alvo,
  problemaId,
  aoFechar,
}: {
  alvo: AlvoProblema;
  problemaId: Id | null;
  aoFechar: () => void;
}) {
  void alvo;
  return (
    <Dialogo
      titulo={problemaId === null ? 'Novo problema' : 'Problema'}
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
