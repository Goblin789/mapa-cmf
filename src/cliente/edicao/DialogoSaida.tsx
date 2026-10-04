// "Saiu da empresa" / "Voltou à empresa" (M2, docs/m2.md, "Fichas"). Sair: explica o que acontece ("Sai de
// Casa X, da CF 5001 (deixa de conduzir) e da obra Y") e faz UM passo com a pessoa fora da casa, da carrinha
// e da obra, sem conduzir, e `ativa` = false (nunca se apaga a pessoa nem o histórico). Voltar: `ativa` =
// true (fica em "Fora das casas CMF" e "Sem transporte da empresa"; põe-se numa casa e numa carrinha a
// seguir, no mesmo rascunho se se quiser). Abre por abrirSaida(id), só no modo de edição.
// CONTRATO DO M2: o módulo Fichas implementa (este ficheiro é dele).

import { useState } from 'react';
import { validarOperacoes } from '../../dominio/operacoes';
import type { Id } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { passoSaida, passoVoltar, textoSaida } from '../paineis/fichas';
import { ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';
import { aplicarComAviso } from './acoes';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

export function DialogoSaida({ pessoaId, aoFechar }: { pessoaId: Id; aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  // Decide-se ao abrir se é sair ou voltar (depois de aplicar a pessoa muda, e o diálogo fecha).
  const [sair] = useState(
    () => useLoja.getState().estado?.pessoas.find((p) => p.id === pessoaId)?.ativa ?? true,
  );
  const [erros, setErros] = useState<string[]>([]);
  const pessoa = estado?.pessoas.find((p) => p.id === pessoaId);
  if (!estado || !pessoa) return null;
  const nome = pessoa.nomeCurto;

  const confirmar = () => {
    const atual = useLoja.getState().estado;
    if (!atual) return;
    const ops = sair ? passoSaida(atual, pessoaId) : passoVoltar(atual, pessoaId);
    const problemas = validarOperacoes(atual, ops);
    if (problemas.length > 0) {
      setErros(problemas);
      return;
    }
    aplicarComAviso(
      ops,
      sair ? `${nome} saiu da empresa (por guardar)` : `${nome} voltou à empresa (por guardar)`,
    );
    aoFechar();
  };

  return (
    <Dialogo
      alerta
      largura="estreito"
      titulo={sair ? `${nome} saiu da empresa?` : `${nome} voltou à empresa?`}
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Não
          </button>
          <button type="button" onClick={confirmar} className={BOTAO_PRIMARIO}>
            {sair ? 'Saiu da empresa' : 'Voltou à empresa'}
          </button>
        </>
      }
    >
      <div className="space-y-2 text-sm text-slate-800">
        {sair ? (
          <>
            <p>{textoSaida(estado, pessoa)}</p>
            <p>
              Deixa de aparecer no mapa e nas listas. Fica no histórico e na Tabela (com «Mostrar quem saiu»);
              nada se apaga. Se voltar, usa «Voltou à empresa…» na ficha.
            </p>
          </>
        ) : (
          <p>
            Volta a aparecer, em «{ROTULO_FORA_DAS_CASAS}» e «{ROTULO_SEM_TRANSPORTE}». Depois põe-na numa
            casa e numa carrinha (pode ser no mesmo rascunho, antes de guardar).
          </p>
        )}
        <p className="text-xs text-slate-600">Só fica gravado quando carregares em Guardar. Ctrl+Z desfaz.</p>
        {erros.length > 0 && (
          <div
            role="alert"
            className="rounded border border-red-400 bg-red-50 px-2 py-1.5 text-xs text-red-900"
          >
            <p className="font-semibold">Não se pode aplicar:</p>
            <ul className="list-disc pl-4">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Dialogo>
  );
}
