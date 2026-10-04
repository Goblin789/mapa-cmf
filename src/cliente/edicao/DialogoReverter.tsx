// "Reverter" uma gravação do Histórico (M2, docs/m2.md, "Reverter"): mostra o que volta atrás e o que já não
// se pode reverter porque mudou entretanto (planearReversao); "Pôr no rascunho" chama loja.iniciarReversao
// (entra no modo de edição; nada é gravado até Guardar).
// CONTRATO DO M2: o módulo Histórico e Guardar implementa (este ficheiro é dele).
// O plano faz-se sobre o estado VISÍVEL (o gravado com o rascunho que já houver) e com TODAS as linhas do
// lote (entrada.alteracoes, sem juntar frases): juntar frases iguais é só para mostrar. Abre também fora do
// modo de edição (pré-visualização); a lógica está em historico.ts (prepararReversao), com testes.

import { useId, useMemo } from 'react';
import type { EntradaHistorico } from '../../dominio/api';
import { reversoesDoRascunho, useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { useVista } from '../vistas/vista';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import {
  avisoReversaoNoRascunho,
  etiquetaRevertida,
  type FraseHistorico,
  formatarDataHora,
  gravacoesConhecidas,
  lembrarGravacoes,
  lotesDaReversaoAEnviar,
  nomeDoAutor,
  partirDescricao,
  prepararReversao,
} from './historico';
import { IconeAviso, IconeReverter } from './icones';
import { useUiEdicao } from './ui';

/** "Ana T. — casa: Casa Um → Casa Dois", com o "quem" a negrito (como no Histórico). */
function Frase({ descricao, linhas }: FraseHistorico) {
  const { quem, oque } = partirDescricao(descricao);
  return (
    <>
      {quem && <span className="font-medium text-slate-900">{quem}</span>}
      {quem && <span className="text-slate-400"> — </span>}
      <span className="text-slate-700">{oque}</span>
      {linhas > 1 && <span className="sr-only"> ({linhas} linhas do histórico)</span>}
    </>
  );
}

const TITULO_SECCAO = 'mb-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase';

export function DialogoReverter({ entrada, aoFechar }: { entrada: EntradaHistorico; aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  // A reversão deste lote ainda vai no Guardar (a mesma regra da loja): `reverte` só diz que o passo está no
  // rascunho, mesmo que outras mudanças a tenham anulado toda. Depende de `reverte` e dos pendentes.
  const jaNoRascunho = useLoja(
    (s) =>
      s.reverte.length > 0 &&
      lotesDaReversaoAEnviar(reversoesDoRascunho(), s.pendentes).includes(entrada.loteId),
  );
  const reuniao = useVista((s) => s.reuniao);
  const abrirDialogo = useUiEdicao((s) => s.abrirDialogo);
  const avisar = useUiEdicao((s) => s.avisar);
  const idVolta = useId();
  const idImpossiveis = useId();
  const idErros = useId();

  const vista = useMemo(
    () => (estado ? prepararReversao(estado, entrada, jaNoRascunho) : null),
    [estado, entrada, jaNoRascunho],
  );
  // Pela data e pelo autor (as gravações que o Histórico mostrou); o "nº N" só como último recurso.
  const revertida = etiquetaRevertida(entrada, gravacoesConhecidas());
  const voltarAoHistorico = () => abrirDialogo({ tipo: 'historico' });

  const porNoRascunho = () => {
    if (!vista?.podePorNoRascunho) return;
    // O Guardar fala deste lote pela data e pelo autor.
    lembrarGravacoes([entrada]);
    const ok = useLoja.getState().iniciarReversao(entrada.loteId, vista.operacoes);
    if (!ok) {
      avisar('Nada mudou: o que esta gravação mudou já está como estava antes dela.');
      return;
    }
    aoFechar();
    avisar(avisoReversaoNoRascunho(vista.nAlteracoes));
  };

  // A reunião é só de leitura: lá, só a pré-visualização.
  const podePor = vista?.podePorNoRascunho === true && !reuniao;

  return (
    <Dialogo
      titulo={`Reverter a gravação de ${formatarDataHora(entrada.criadoEm)}`}
      descricao={`De ${nomeDoAutor(entrada)}. Nada é gravado: as alterações vão para o rascunho, onde as revês antes de Guardar.`}
      aoFechar={aoFechar}
      largura="normal"
      fecharFora
      rodape={
        <>
          <button
            type="button"
            data-foco-inicial={podePor ? undefined : ''}
            onClick={voltarAoHistorico}
            className={BOTAO_SECUNDARIO}
          >
            Voltar ao histórico
          </button>
          {!reuniao && (
            <button
              type="button"
              data-foco-inicial={podePor ? '' : undefined}
              onClick={porNoRascunho}
              disabled={!podePor}
              title={vista?.explicacao ?? 'Pôr no rascunho como uma só alteração (Ctrl+Z desfaz)'}
              className={BOTAO_PRIMARIO}
            >
              <IconeReverter />
              Pôr no rascunho
            </button>
          )}
        </>
      }
    >
      {!vista ? (
        <p className="text-sm text-slate-600">A carregar os dados…</p>
      ) : (
        <div className="space-y-4">
          {revertida && (
            <p className="rounded-md border border-violet-300 bg-violet-50 px-3 py-2 text-sm text-violet-950">
              {revertida.dica}. O que ainda se pode reverter aparece em baixo.
            </p>
          )}
          {!modoEdicao && podePor && (
            <p className="text-sm text-slate-700">
              Ao pôr no rascunho entras no modo de edição. Só fica gravado quando carregares em Guardar.
            </p>
          )}
          {vista.explicacao && (
            <p
              role={vista.erros.length > 0 ? 'alert' : undefined}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                vista.erros.length > 0
                  ? 'border-red-300 bg-red-50 text-red-950'
                  : 'border-amber-300 bg-amber-50 text-amber-950'
              }`}
            >
              <IconeAviso
                className={`mt-0.5 h-4 w-4 ${vista.erros.length > 0 ? 'text-red-700' : 'text-amber-700'}`}
              />
              <span>{vista.explicacao}</span>
            </p>
          )}

          {vista.erros.length > 0 && (
            <section aria-labelledby={idErros}>
              <h3 id={idErros} className={TITULO_SECCAO}>
                Erros ({vista.erros.length})
              </h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-red-950">
                {vista.erros.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </section>
          )}

          {vista.voltaAtras.length > 0 && (
            <section aria-labelledby={idVolta}>
              <h3 id={idVolta} className={TITULO_SECCAO}>
                Vai voltar atrás ({comPlural(vista.nAlteracoes, 'alteração', 'alterações')})
              </h3>
              <ul className="space-y-0.5 rounded-md border border-slate-200 px-3 py-2 text-sm">
                {vista.voltaAtras.map((f, i) => (
                  // A lista é recalculada inteira: o índice serve de chave.
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa
                  <li key={i} className="leading-snug break-words">
                    <Frase {...f} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {vista.impossiveis.length > 0 && (
            <section aria-labelledby={idImpossiveis}>
              <h3 id={idImpossiveis} className={TITULO_SECCAO}>
                Já não se pode reverter ({vista.impossiveis.length})
              </h3>
              <ul className="divide-y divide-slate-200 rounded-md border border-slate-200 text-sm">
                {vista.impossiveis.map((x, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa
                  <li key={i} className="px-3 py-1.5 leading-snug break-words">
                    <Frase descricao={x.descricao} linhas={1} />
                    <span className="block text-xs text-slate-600">
                      <span className="sr-only">Porquê: </span>
                      {x.motivo}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Dialogo>
  );
}
