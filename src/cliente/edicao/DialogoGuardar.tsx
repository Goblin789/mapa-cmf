// "Guardar…": revê as alterações (por pessoa; as de condutor e as de onde dormem por carrinha) e os avisos,
// aceita um comentário e grava num lote. Se o servidor recusar por conflito (alguém mudou entretanto as
// mesmas pessoas, o condutor das mesmas carrinhas ou onde elas dormem), nada foi gravado: mostra o que
// mudou e oferece deitar fora o rascunho e recarregar, ou voltar à edição.

import { useEffect, useId, useRef, useState } from 'react';
import type { ConflitoServidor } from '../../dominio/api';
import { clienteEfetivoId } from '../../dominio/cores';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { IconeVolante } from '../comum/IconeVolante';
import { Matricula } from '../comum/Matricula';
import { useLoja } from '../estado/loja';
import { MarcaCliente } from '../paineis/pecas';
import { comPlural, hojeISO, ROTULO_TIPO_VEICULO } from '../paineis/textos';
import { BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { textoDoErro } from './erros';
import { IconeAviso, IconeDormir, IconeGuardar, IconeRodar } from './icones';
import { agruparAlteracoes, agruparCondutores, agruparDormidas, calcularAvisos } from './resumo';
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
      condutores: agruparCondutores(estadoServidor, pendentes),
      dormidas: agruparDormidas(
        estadoServidor,
        pendentes,
        dormidasDasCarrinhas(estadoServidor, indexar(estadoServidor)),
      ),
      avisos: calcularAvisos(estadoServidor, estado, pendentes, undefined, indices, hojeISO()),
      indices,
      matriculas: new Map(estadoServidor.carrinhas.map((c) => [c.id, c.matricula])),
      // "Carrinha" ou "Carro", para os leitores de ecrã.
      tiposVeiculo: new Map(estadoServidor.carrinhas.map((c) => [c.id, ROTULO_TIPO_VEICULO[c.tipo]])),
    };
  });
  return instantaneo;
}

/** Há conflitos que não são só de pessoas (condutor ou onde dorme de uma carrinha). */
function conflitoDeCarrinhas(conflitos: readonly ConflitoServidor[] | null): boolean {
  return conflitos?.some((c) => c.tipo !== 'mover') ?? false;
}

function chaveConflito(c: ConflitoServidor): string {
  return c.tipo === 'mover' ? `${c.pessoaId}:${c.campo}` : `${c.tipo}:${c.carrinhaId}`;
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
          {conflitoDeCarrinhas(conflitos)
            ? 'Alguém mudou entretanto algumas destas pessoas ou carrinhas. Nada foi gravado.'
            : (erroGuardar ?? 'Alguém mudou entretanto algumas destas pessoas. Nada foi gravado.')}
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-9">
          {conflitos.map((c) => (
            <li key={chaveConflito(c)}>{c.descricao}</li>
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
  const { n, grupos, condutores, dormidas, avisos, indices, matriculas, tiposVeiculo } = instantaneo;
  const tipoVeiculo = (id: string) => tiposVeiculo.get(id) ?? ROTULO_TIPO_VEICULO.carrinha;
  const ocupado = aGuardar || aRecarregar;
  const emConflito = tentou && conflitos !== null && conflitos.length > 0;
  const conflitoDeCondutor = conflitoDeCarrinhas(conflitos);
  const resumo = [
    grupos.length > 0 ? comPlural(grupos.length, 'pessoa muda', 'pessoas mudam') : null,
    condutores.length > 0
      ? comPlural(condutores.length, 'carrinha muda de condutor', 'carrinhas mudam de condutor')
      : null,
    dormidas.length > 0
      ? comPlural(dormidas.length, 'carrinha muda onde dorme', 'carrinhas mudam onde dormem')
      : null,
  ]
    .filter(Boolean)
    .join(', ');

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
          ? `Houve uma gravação entretanto que mexe nas mesmas ${
              conflitoDeCondutor ? 'pessoas ou carrinhas' : 'pessoas'
            }.`
          : `${resumo}. Revê antes de gravar.`
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
            {grupos.length > 0 && (
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
            )}
            {condutores.length > 0 && (
              <>
                <h4 className="mt-3 mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <IconeVolante tamanho={13} />
                  Condutores ({condutores.length})
                </h4>
                <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {condutores.map((g) => (
                    <li key={g.carrinhaId} className="px-3 py-2">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <Matricula matricula={matriculas.get(g.carrinhaId) ?? g.matricula} altura={16} />
                        <span className="sr-only">
                          {tipoVeiculo(g.carrinhaId)} {g.matricula}
                        </span>
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {g.alteracoes.map((a) => (
                          <li key={a.descricao} className="flex items-baseline gap-2 text-sm">
                            <span className="w-16 shrink-0 text-xs text-slate-600">Condutor</span>
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
                  ))}
                </ul>
              </>
            )}
            {dormidas.length > 0 && (
              <>
                <h4 className="mt-3 mb-1.5 flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <IconeDormir className="h-3.5 w-3.5" />
                  Onde dormem ({dormidas.length})
                </h4>
                <ul className="divide-y divide-slate-200 rounded-md border border-slate-200">
                  {dormidas.map((d) => (
                    <li
                      key={d.carrinhaId}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5"
                    >
                      <span className="flex shrink-0 items-center self-center">
                        <Matricula matricula={matriculas.get(d.carrinhaId) ?? d.matricula} altura={16} />
                        <span className="sr-only">
                          {tipoVeiculo(d.carrinhaId)} {d.matricula}: onde dorme
                        </span>
                      </span>
                      <span className="min-w-0 flex-1 text-sm">
                        <span className="text-slate-600">
                          {d.de}
                          {d.sugestaoAntes !== null && !d.confirmaSugestao && (
                            <span className="text-slate-500"> (sugerido: {d.sugestaoAntes})</span>
                          )}
                        </span>
                        <span aria-hidden="true" className="px-1.5 text-slate-400">
                          →
                        </span>
                        <span className="sr-only"> passa para </span>
                        <strong className="font-semibold text-slate-900">{d.para}</strong>
                        {/* inline-block: num ecrã estreito passa inteira para a linha seguinte (sem isto ficava
                            colada ao nome e era cortada à direita). */}
                        {d.confirmaSugestao && (
                          <span className="ml-1.5 inline-block text-xs whitespace-nowrap text-emerald-800">
                            <span aria-hidden="true">✓ </span>sugestão confirmada
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {avisos.length === 0 && (
              <p className="mt-2 flex items-center gap-2 text-sm text-slate-700">
                <IconeGuardar className="h-4 w-4 text-emerald-700" />
                Sem avisos de lotação, de contrato, de condutores ou de pessoas sem casa ou sem transporte.
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
