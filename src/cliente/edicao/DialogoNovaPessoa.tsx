// Nova pessoa (M2, docs/m2.md, "Fichas"): nome, apelidos, nome no mapa (único), nº, cliente, telefone e
// carta. Entra como um passo do rascunho (operação 'registo' com novoId('pessoa')), em "Fora das casas CMF"
// e "Sem transporte da empresa"; depois arrasta-se como as outras.
// CONTRATO DO M2: o módulo Fichas implementa (este ficheiro é dele).

import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoNovaPessoa({ aoFechar }: { aoFechar: () => void }) {
  return (
    <Dialogo titulo="Nova pessoa" aoFechar={aoFechar} rodape={<BotaoFechar aoFechar={aoFechar} />}>
      <p className="text-sm text-slate-700">Em construção (M2).</p>
    </Dialogo>
  );
}

function BotaoFechar({ aoFechar }: { aoFechar: () => void }) {
  return (
    <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
      Fechar
    </button>
  );
}
