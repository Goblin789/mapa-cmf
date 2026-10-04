// Marcar indisponível (M2, docs/m2.md, "Indisponível"): de (hoje, por omissão) até (dia ou "sem data de
// regresso"), para uma ou várias pessoas. SEM motivo nem campo de texto, de propósito. Também muda as datas
// de um período existente (periodoId). Entra no rascunho (operacoesMarcarIndisponivel / 'campo').
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import type { Id } from '../../dominio/tipos';
import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoIndisponivel({
  pessoaIds,
  periodoId,
  aoFechar,
}: {
  pessoaIds: readonly Id[];
  periodoId: Id | null;
  aoFechar: () => void;
}) {
  void pessoaIds;
  void periodoId;
  return (
    <Dialogo
      titulo="Indisponível"
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
