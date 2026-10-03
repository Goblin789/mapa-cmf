// "Guardar…": revê as alterações (por pessoa) e os avisos, aceita um comentário e grava num lote.
// Se o servidor recusar por conflito (alguém mudou entretanto as mesmas pessoas), nada foi gravado:
// mostra o que mudou e oferece deitar fora o rascunho e recarregar, ou voltar à edição.

import { useEffect, useId, useRef, useState } from 'react';
import { clienteEfetivoId } from '../../dominio/cores';
import { useLoja } from '../estado/loja';
import { MarcaCliente } from '../paineis/pecas';
import { comPlural } from '../paineis/textos';
import { BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { textoDoErro } from './erros';
import { IconeAviso, IconeGuardar, IconeRodar } from './icones';
import { agruparAlteracoes, calcularAvisos } from './resumo';
import { useUiEdicao } from './ui';

const LIMITE_COMENTARIO = 500;

function useInstantaneo() {
  // Tirado ao abrir: depois de gravar, a loja limpa o rascunho antes de o diálogo fechar.
  const [instantaneo] = useState(() => {
    const { estadoServidor, estado, indices, pendentes } = useLoja.getState();
    if (!estadoServidor || !estado || !indices) return null;
    return {
      n: pendentes.length,
      grupos: agruparAlteracoes(estadoServidor, pendentes),
      avisos: calcularAvisos(estadoServidor, estado, pendentes, undefined, indices),
      indices,
    };
  });
  return instantaneo;
}

function Conflitos({ aoVoltar, aoDescartar }: { aoVoltar: () => void; aoDescartar: () => void }) {
  const conflitos = useLoja((s) => s.conflitos) ?? [];
  const erroGuardar = useLoja((s) => s.erroGuardar);
  const caixa = useRef<HTMLDivElement>(null);
  // O botão Guardar desaparece: o foco passa para a explicação (e o leitor de ecrã lê-a).
  useEffect(() => caixa.current?.focus(), []);
  return (
    <div ref={caixa} tabIndex={-1} role="alert" className="space-y-3 outline-none">
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-950">
        <p className="flex items-start gap-2 font-semibold">
          <IconeAviso className="mt-0.5 h-4 w-4 text-red-700" />
          {erroGuardar ?? 'Alguém mudou entretanto algumas destas pessoas. Nada foi gravado.'}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-9">
          {conflitos.map((c) => (
            <li key={`${c.pessoaId}:${c.campo}`}>{c.descricao}</li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-slate-700">
        Para ver o que está gravado agora, deita fora as tuas alterações e recarrega: depois podes voltar a
        fazê-las. Ou volta atrás para continuares a ver a tua simulação.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={aoVoltar} className={BOTAO_SECUNDARIO}>
          Voltar
        </button>
        <button type="button" onClick={aoDescartar} className={BOTAO_PERIGO}>
          Deitar fora as minhas alterações e recarregar
        </button>
      </div>
    </div>
  );
}

export function DialogoGuardar({ aoFechar }: { aoFechar: () => void }) {
  const instantaneo = useInstantaneo();
  const aGuardar = useLoja((s) => s.aGuardar);
  const erroGuardar = useLoja((s) => s.erroGuardar);
  const conflitos = useLoja((s) => s.conflitos);
  const guardar = useLoja((s) => s.guardar);
  const avisar = useUiEdicao((s) => s.avisar);
  const [comentario, setComentario] = useState('');
  // Erros e conflitos só contam se vierem de uma tentativa feita neste diálogo.
  const [tentou, setTentou] = useState(false);
  const [aRecarregar, setARecarregar] = useState(false);
  const idComentario = useId();
  const idAvisos = useId();

  if (!instantaneo) return null;
  const { n, grupos, avisos, indices } = instantaneo;
  const ocupado = aGuardar || aRecarregar;
  const emConflito = tentou && conflitos !== null && conflitos.length > 0;

  const aoGuardar = async () => {
    setTentou(true);
    const ok = await guardar(comentario.trim() || undefined);
    if (ok) {
      aoFechar();
      avisar(`${comPlural(n, 'alteração guardada', 'alterações guardadas')}. Ficam no histórico.`);
    }
  };

  const aoDescartar = async () => {
    const { cancelarEdicao, carregar } = useLoja.getState();
    setARecarregar(true);
    cancelarEdicao();
    await carregar();
    aoFechar();
    avisar('As tuas alterações foram deitadas fora e os dados foram recarregados.');
  };

  return (
    <Dialogo
      titulo={emConflito ? 'Não foi possível guardar' : `Guardar ${comPlural(n, 'alteração', 'alterações')}`}
      descricao={
        emConflito
          ? 'Houve uma gravação entretanto que mexe nas mesmas pessoas.'
          : `${comPlural(grupos.length, 'pessoa muda', 'pessoas mudam')}. Revê antes de gravar.`
      }
      aoFechar={aoFechar}
      bloqueado={ocupado}
      largura="normal"
      rodape={
        emConflito ? undefined : (
          <>
            <button type="button" onClick={aoFechar} disabled={ocupado} className={BOTAO_SECUNDARIO}>
              Voltar
            </button>
            {/* aria-disabled (e não disabled) enquanto grava: o foco fica no botão e o leitor de ecrã lê "A guardar…". */}
            <button
              type="button"
              data-foco-inicial
              onClick={() => {
                if (!ocupado) void aoGuardar();
              }}
              aria-disabled={ocupado}
              className={`${BOTAO_PRIMARIO} ${ocupado ? 'cursor-wait opacity-70' : ''}`}
            >
              {aGuardar ? <IconeRodar /> : <IconeGuardar />}
              {aGuardar ? 'A guardar…' : 'Guardar'}
            </button>
          </>
        )
      }
    >
      {emConflito ? (
        <Conflitos aoVoltar={aoFechar} aoDescartar={() => void aoDescartar()} />
      ) : (
        <div className="space-y-4" aria-busy={ocupado}>
          {tentou && erroGuardar && !aGuardar && (
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950"
            >
              <IconeAviso className="mt-0.5 h-4 w-4 text-red-700" />
              <span>
                <strong className="font-semibold">Não foi possível guardar.</strong>{' '}
                {textoDoErro(erroGuardar)}
              </span>
            </p>
          )}

          {avisos.length > 0 && (
            <section aria-labelledby={idAvisos}>
              <h3
                id={idAvisos}
                className="mb-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase"
              >
                A ter em conta ({avisos.length})
              </h3>
              <ul className="space-y-1">
                {avisos.map((a) => (
                  <li
                    key={a.chave}
                    className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm ${
                      a.gravidade === 'forte'
                        ? 'border-red-300 bg-red-50 text-red-950'
                        : 'border-amber-300 bg-amber-50 text-amber-950'
                    }`}
                  >
                    <IconeAviso
                      className={`mt-0.5 h-4 w-4 ${a.gravidade === 'forte' ? 'text-red-700' : 'text-amber-700'}`}
                    />
                    <span>
                      <span className="sr-only">{a.gravidade === 'forte' ? 'Aviso forte: ' : 'Aviso: '}</span>
                      {a.texto}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-label="Alterações">
            <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
              Alterações ({n})
            </h3>
            <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
              {grupos.map((g) => {
                const pessoa = indices.pessoas.get(g.pessoaId);
                const cliente = pessoa
                  ? (indices.clientes.get(clienteEfetivoId(pessoa, indices.obras)) ?? null)
                  : null;
                return (
                  <li key={g.pessoaId} className="px-3 py-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <MarcaCliente cliente={cliente} />
                      {g.nome}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {g.alteracoes.map((a) => (
                        <li key={a.campo} className="flex items-baseline gap-2 text-sm">
                          <span className="w-16 shrink-0 text-xs text-slate-600">{a.rotuloCampo}</span>
                          <span className="min-w-0 flex-1">
                            <span className="text-slate-600">{a.de}</span>
                            <span aria-hidden="true" className="px-1.5 text-slate-400">
                              →
                            </span>
                            <span className="sr-only"> passa para </span>
                            <strong className="font-semibold text-slate-900">{a.para}</strong>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
            {avisos.length === 0 && (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <IconeGuardar className="h-4 w-4 text-emerald-700" />
                Sem avisos de lotação, de contrato ou de pessoas sem casa ou sem transporte.
              </p>
            )}
          </section>

          <div>
            <label htmlFor={idComentario} className="mb-1 block text-sm font-medium text-slate-800">
              Comentário <span className="font-normal text-slate-500">(opcional)</span>
            </label>
            <textarea
              id={idComentario}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              maxLength={LIMITE_COMENTARIO}
              rows={2}
              disabled={ocupado}
              placeholder="Ex.: troca combinada com o encarregado"
              className="block w-full resize-y rounded-md border border-slate-300 px-2.5 py-1.5 text-base placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-700 sm:text-sm"
            />
          </div>
        </div>
      )}
    </Dialogo>
  );
}
