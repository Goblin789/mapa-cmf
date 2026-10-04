// Peças do modo de edição que a App monta: botões do cabeçalho (Histórico, Editar), contorno âmbar
// da área de trabalho, diálogos, aviso curto e atalhos.

import { useEffect } from 'react';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { entrarEdicaoComAviso } from './acoes';
import { DialogoCancelar } from './DialogoCancelar';
import { DialogoConfirmarSugestoes } from './DialogoConfirmarSugestoes';
import { DialogoDormida } from './DialogoDormida';
import { DialogoGuardar } from './DialogoGuardar';
import { DialogoHistorico } from './DialogoHistorico';
import { DialogoIndisponivel } from './DialogoIndisponivel';
import { DialogoMoverPara } from './DialogoMoverPara';
import { DialogoNovaPessoa } from './DialogoNovaPessoa';
import { DialogoObra } from './DialogoObra';
import { DialogoProblema } from './DialogoProblema';
import { DialogoReverter } from './DialogoReverter';
import { DialogoSaida } from './DialogoSaida';
import { useAtalhosEdicao, useAvisoAoSair, useFocoAoMudarModo } from './ganchos';
import { IconeLapis, IconeRelogio } from './icones';
import { useUiEdicao } from './ui';

const BOTAO_CABECALHO = `inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm font-medium whitespace-nowrap ${FOCO_VISIVEL}`;

/** Histórico (sempre) e Editar (fora do modo de edição; lá dentro manda a barra âmbar). */
export function BotoesCabecalho() {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const abrirDialogo = useUiEdicao((s) => s.abrirDialogo);
  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => abrirDialogo({ tipo: 'historico' })}
        title="Histórico: quem mudou o quê"
        className={`${BOTAO_CABECALHO} border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}
      >
        <IconeRelogio />
        {/* Entre 640 e 1536 px só o ícone, para o cabeçalho caber numa linha. */}
        <span className="sm:sr-only 2xl:not-sr-only">Histórico</span>
      </button>
      {!modoEdicao && (
        <button
          type="button"
          data-botao-editar
          onClick={entrarEdicaoComAviso}
          title="Mudar pessoas de casa, de carrinha ou de obra (só fica gravado ao Guardar)"
          className={`${BOTAO_CABECALHO} border-slate-900 bg-slate-900 text-white hover:bg-slate-700`}
        >
          <IconeLapis />
          Editar
        </button>
      )}
    </div>
  );
}

/** Contorno âmbar à volta da área de trabalho: o que se vê é uma simulação. Pôr dentro de um pai `relative`. */
export function ContornoEdicao() {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  if (!modoEdicao) return null;
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[1050] shadow-[inset_0_0_0_3px_rgb(245_158_11)]"
    />
  );
}

/** Aviso curto em baixo ao centro ("Desfeito: …", "Alterações guardadas."); some ao fim de uns segundos. */
function AvisoFlutuante() {
  const aviso = useUiEdicao((s) => s.aviso);
  const limparAviso = useUiEdicao((s) => s.limparAviso);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(limparAviso, 5000);
    return () => window.clearTimeout(t);
  }, [aviso, limparAviso]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[1200] flex justify-center px-4">
      <p
        role="status"
        aria-live="polite"
        className={
          aviso
            ? 'max-w-xl rounded-lg bg-slate-900 px-3.5 py-2 text-sm text-white shadow-lg ring-1 ring-black/10'
            : 'sr-only'
        }
      >
        {aviso?.texto}
      </p>
    </div>
  );
}

/** Diálogos do modo de edição e do histórico, aviso curto, atalhos e aviso ao sair da página. */
export function Edicao() {
  useAtalhosEdicao();
  useAvisoAoSair();
  const dialogo = useUiEdicao((s) => s.dialogo);
  const fecharDialogo = useUiEdicao((s) => s.fecharDialogo);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  useFocoAoMudarModo(modoEdicao, dialogo !== null);

  // Fora do modo de edição não há nada para mover, para cancelar nem onde dormir para mudar; nem (M2)
  // fichas novas, obras, indisponíveis ou problemas para mudar. O Reverter abre fora dele (pré-visualização).
  const soEmEdicao =
    dialogo?.tipo === 'mover' ||
    dialogo?.tipo === 'cancelar' ||
    dialogo?.tipo === 'dormida' ||
    dialogo?.tipo === 'confirmar-sugestoes' ||
    dialogo?.tipo === 'nova-pessoa' ||
    dialogo?.tipo === 'saida' ||
    dialogo?.tipo === 'obra' ||
    dialogo?.tipo === 'indisponivel' ||
    dialogo?.tipo === 'problema';
  useEffect(() => {
    if (!modoEdicao && soEmEdicao) fecharDialogo();
  }, [modoEdicao, soEmEdicao, fecharDialogo]);

  return (
    <>
      {modoEdicao && dialogo?.tipo === 'mover' && (
        <DialogoMoverPara pessoaIds={dialogo.pessoaIds} filtro={dialogo.filtro} aoFechar={fecharDialogo} />
      )}
      {modoEdicao && dialogo?.tipo === 'cancelar' && <DialogoCancelar aoFechar={fecharDialogo} />}
      {modoEdicao && dialogo?.tipo === 'dormida' && (
        <DialogoDormida carrinhaId={dialogo.carrinhaId} aoFechar={fecharDialogo} />
      )}
      {modoEdicao && dialogo?.tipo === 'confirmar-sugestoes' && (
        <DialogoConfirmarSugestoes aoFechar={fecharDialogo} />
      )}
      {modoEdicao && dialogo?.tipo === 'nova-pessoa' && <DialogoNovaPessoa aoFechar={fecharDialogo} />}
      {modoEdicao && dialogo?.tipo === 'saida' && (
        <DialogoSaida pessoaId={dialogo.pessoaId} aoFechar={fecharDialogo} />
      )}
      {modoEdicao && dialogo?.tipo === 'obra' && (
        <DialogoObra obraId={dialogo.obraId} posicao={dialogo.posicao} aoFechar={fecharDialogo} />
      )}
      {modoEdicao && dialogo?.tipo === 'indisponivel' && (
        <DialogoIndisponivel
          pessoaIds={dialogo.pessoaIds}
          periodoId={dialogo.periodoId}
          aoFechar={fecharDialogo}
        />
      )}
      {modoEdicao && dialogo?.tipo === 'problema' && (
        <DialogoProblema alvo={dialogo.alvo} problemaId={dialogo.problemaId} aoFechar={fecharDialogo} />
      )}
      {dialogo?.tipo === 'reverter' && <DialogoReverter entrada={dialogo.entrada} aoFechar={fecharDialogo} />}
      {dialogo?.tipo === 'guardar' && <DialogoGuardar aoFechar={fecharDialogo} />}
      {dialogo?.tipo === 'historico' && <DialogoHistorico aoFechar={fecharDialogo} />}
      <AvisoFlutuante />
    </>
  );
}
