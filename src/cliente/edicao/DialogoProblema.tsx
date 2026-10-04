// Problema novo / mudar o texto de um problema (M2, docs/m2.md, "Problemas"): texto curto sobre a casa ou
// a carrinha, com o aviso discreto de não pôr dados pessoais nem de saúde (avisoTextoProblema). Entra no
// rascunho (operacaoNovoProblema / 'campo' texto).
// O texto vai até MAX_TEXTO_PROBLEMA (120), numa só linha, com contador; por baixo, a frase fixa "É sobre a
// casa/carrinha: não escrevas nomes nem dados de saúde." e, enquanto se escreve, o aviso (aria-live
// polite), que nunca impede de pôr no rascunho.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import { type FormEvent, useId, useState } from 'react';
import { formatarMatricula } from '../../dominio/matricula';
import { operacaoCampo } from '../../dominio/operacoes';
import {
  type AlvoProblema,
  avisoTextoProblema,
  MAX_TEXTO_PROBLEMA,
  operacaoNovoProblema,
} from '../../dominio/problemas';
import type { Estado, Id } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { aplicarComAviso } from './DialogoIndisponivel';
import { useUiEdicao } from './ui';

/** O texto como se grava: sem quebras de linha nem espaços a mais (nunca "" — sem texto não há problema). */
export function limparTextoProblema(texto: string): string {
  return texto.replace(/\s+/g, ' ').trim();
}

/** "É sobre a casa: não escrevas nomes nem dados de saúde." (ou "a carrinha"). */
export function fraseSobreOAlvo(alvo: Pick<AlvoProblema, 'tipo'>): string {
  return `É sobre a ${alvo.tipo === 'casa' ? 'casa' : 'carrinha'}: não escrevas nomes nem dados de saúde.`;
}

/** O nome da casa ou a matrícula (para o título do diálogo). */
export function nomeDoAlvo(estado: Pick<Estado, 'casas' | 'carrinhas'>, alvo: AlvoProblema): string {
  if (alvo.tipo === 'casa') return estado.casas.find((c) => c.id === alvo.id)?.nome ?? 'casa';
  const carrinha = estado.carrinhas.find((c) => c.id === alvo.id);
  return carrinha ? formatarMatricula(carrinha.matricula) : 'carrinha';
}

export function DialogoProblema({
  alvo,
  problemaId,
  aoFechar,
}: {
  alvo: AlvoProblema;
  problemaId: Id | null;
  aoFechar: () => void;
}) {
  const estado = useLoja((s) => s.estado);
  const hoje = useLoja((s) => s.hoje);
  const problema = problemaId ? (estado?.problemas.find((p) => p.id === problemaId) ?? null) : null;
  const [texto, setTexto] = useState(problema?.texto ?? '');
  const ids = { texto: useId(), contador: useId(), frase: useId(), aviso: useId(), form: useId() };

  if (!estado) return null;
  if (problemaId !== null && !problema) {
    return (
      <Dialogo
        titulo="Problema"
        aoFechar={aoFechar}
        rodape={
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Fechar
          </button>
        }
      >
        <p className="text-sm text-slate-700">Este problema já não existe (foi apagado ou desfeito).</p>
      </Dialogo>
    );
  }

  const limpo = limparTextoProblema(texto);
  const aviso = avisoTextoProblema(texto, estado);
  const nome = nomeDoAlvo(estado, alvo);

  const porNoRascunho = (e: FormEvent) => {
    e.preventDefault();
    if (limpo === '') return;
    if (problemaId === null) {
      aplicarComAviso([operacaoNovoProblema(alvo, limpo, hoje)]);
      aoFechar();
      return;
    }
    const op = operacaoCampo(estado, 'problema', problemaId, 'texto', limpo);
    if (op) aplicarComAviso([op]);
    else useUiEdicao.getState().avisar('Nada mudou: o texto já era este.');
    aoFechar();
  };

  return (
    <Dialogo
      titulo={problemaId === null ? `Novo problema — ${nome}` : `Mudar o texto do problema — ${nome}`}
      aoFechar={aoFechar}
      largura="estreito"
      rodape={
        <>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={ids.form} disabled={limpo === ''} className={BOTAO_PRIMARIO}>
            {problemaId === null ? 'Abrir problema' : 'Mudar o texto'}
          </button>
        </>
      }
    >
      <form id={ids.form} onSubmit={porNoRascunho} className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor={ids.texto} className="text-sm font-medium text-slate-800">
            O que se passa
          </label>
          <span id={ids.contador} className="text-xs text-slate-600 tabular-nums">
            {texto.length}/{MAX_TEXTO_PROBLEMA}
          </span>
        </div>
        <input
          id={ids.texto}
          type="text"
          data-foco-inicial
          value={texto}
          maxLength={MAX_TEXTO_PROBLEMA}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={alvo.tipo === 'casa' ? 'Ex.: esquentador avariado' : 'Ex.: pneu furado'}
          autoComplete="off"
          aria-describedby={`${ids.frase} ${ids.aviso} ${ids.contador}`}
          className={`w-full min-w-0 rounded-md border border-slate-400 bg-white px-2 py-1.5 text-base text-slate-900 sm:text-sm ${FOCO_VISIVEL}`}
        />
        <p id={ids.frase} className="text-xs text-slate-700">
          {fraseSobreOAlvo(alvo)}
        </p>
        <p id={ids.aviso} aria-live="polite" className="min-h-4 text-xs font-medium text-amber-800">
          {aviso && (
            <>
              <span aria-hidden="true">▲ </span>
              {aviso}
            </>
          )}
        </p>
      </form>
    </Dialogo>
  );
}
