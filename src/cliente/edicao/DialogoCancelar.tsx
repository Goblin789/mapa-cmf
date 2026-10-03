// Confirmação antes de deitar fora o rascunho. O foco começa em "Continuar a editar" (o mais seguro).

import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { deitarForaAlteracoes } from './acoes';
import { BOTAO_PERIGO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoCancelar({ aoFechar }: { aoFechar: () => void }) {
  const n = useLoja((s) => s.pendentes.length);
  return (
    <Dialogo
      alerta
      largura="estreito"
      titulo={`Deitar fora ${comPlural(n, 'alteração', 'alterações')}?`}
      descricao="Volta tudo ao que estava."
      aoFechar={aoFechar}
      fecharFora
      rodape={
        <>
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Continuar a editar
          </button>
          <button type="button" onClick={deitarForaAlteracoes} className={BOTAO_PERIGO}>
            Deitar fora
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-700">
        Nada do que mudaste neste modo de edição fica gravado e sais do modo de edição.
      </p>
    </Dialogo>
  );
}
