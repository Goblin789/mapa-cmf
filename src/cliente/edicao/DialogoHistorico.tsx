// Histórico das gravações (lotes), mais recentes primeiro: quando (hora do Luxemburgo), quem, o
// comentário e o que mudou. "Carregar mais" pede mais lotes. Disponível sempre, também fora da edição.
// M2: frases seguidas iguais juntas (só a ver: o Reverter recebe a entrada completa), "Reverter…" em cada
// lote que se pode reverter (nunca na reunião, que é só de leitura) e as etiquetas "Reverte…"/"Revertida".

import { useEffect, useState } from 'react';
import { useSessao } from '../entrar/sessao';
import { type EntradaHistorico, obterHistorico } from '../estado/api';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { comPlural } from '../paineis/textos';
import { useVista } from '../vistas/vista';
import { BOTAO_PEQUENO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { textoDoErro } from './erros';
import {
  DESCRICOES_VISIVEIS,
  dicaDoAutor,
  etiquetaReverte,
  etiquetaRevertida,
  formatarDataHora,
  juntarFrasesIguais,
  lembrarGravacoes,
  mostraReverter,
  nomeDoAutor,
  notaEstadoLote,
  PASSO_HISTORICO,
  partirDescricao,
  podeHaverMais,
  proximoLimite,
  rotuloTipoLote,
} from './historico';
import { IconeAviso, IconeReverter, IconeRodar } from './icones';
import { abrirReverter } from './ui';

function Lote({
  entrada,
  carregadas,
  reuniao,
}: {
  entrada: EntradaHistorico;
  /** A lista carregada: dá a data e o autor dos lotes de "Reverte…" e "Revertida". */
  carregadas: readonly EntradaHistorico[];
  reuniao: boolean;
}) {
  const [tudo, setTudo] = useState(false);
  const nota = notaEstadoLote(entrada.estado);
  // Só a ver: as linhas seguidas com a mesma frase (a latitude e a longitude de um pino) dão uma.
  const frases = juntarFrasesIguais(entrada.alteracoes);
  const n = frases.length;
  const visiveis = tudo ? frases : frases.slice(0, DESCRICOES_VISIVEIS);
  const agendado = entrada.efetivoEm !== entrada.criadoEm && entrada.estado === 'agendado';
  const reverte = etiquetaReverte(entrada, carregadas);
  const revertida = etiquetaRevertida(entrada, carregadas);
  const reverter = mostraReverter(entrada, reuniao);

  return (
    <li className="overflow-hidden rounded-lg border border-slate-200">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-slate-200 bg-slate-50 px-3 py-1.5">
        <time dateTime={entrada.criadoEm} className="text-sm font-semibold text-slate-900 tabular-nums">
          {formatarDataHora(entrada.criadoEm)}
        </time>
        {/* O e-mail de quem gravou fica na dica: o nome chega para o reconhecer. */}
        <span className="text-sm text-slate-700" title={dicaDoAutor(entrada) ?? undefined}>
          {nomeDoAutor(entrada)}
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          {revertida && (
            <span
              title={revertida.dica}
              className="rounded border border-violet-300 bg-violet-50 px-1.5 text-[11px] leading-4 font-medium text-violet-900"
            >
              {revertida.texto}
            </span>
          )}
          {nota && (
            <span className="rounded border border-amber-400 bg-amber-50 px-1.5 text-[11px] leading-4 font-medium text-amber-900">
              {nota}
            </span>
          )}
          <span className="rounded border border-slate-300 bg-white px-1.5 text-[11px] leading-4 font-medium text-slate-700">
            {rotuloTipoLote(entrada.tipo)}
          </span>
        </span>
      </div>
      <div className="px-3 py-2 text-sm">
        {agendado && (
          <p className="mb-1 text-xs text-slate-600">
            Vale a partir de {formatarDataHora(entrada.efetivoEm)}
          </p>
        )}
        {reverte && (
          <p className="mb-1 flex items-start gap-1.5 text-xs font-medium text-violet-900">
            <IconeReverter className="mt-px h-3.5 w-3.5" />
            {reverte}
          </p>
        )}
        {entrada.comentario && <p className="mb-1.5 text-slate-700 italic">“{entrada.comentario}”</p>}
        {n === 0 ? (
          <p className="text-xs text-slate-500">Sem alterações registadas.</p>
        ) : (
          <ul className="space-y-0.5">
            {visiveis.map((a, i) => {
              const { quem, oque } = partirDescricao(a.descricao);
              return (
                // A ordem das frases de um lote nunca muda: o índice serve de chave.
                // biome-ignore lint/suspicious/noArrayIndexKey: lista fixa
                <li key={i} className="leading-snug">
                  {quem && <span className="font-medium text-slate-900">{quem}</span>}
                  {quem && <span className="text-slate-400"> — </span>}
                  <span className="text-slate-700">{oque}</span>
                </li>
              );
            })}
          </ul>
        )}
        {n > DESCRICOES_VISIVEIS && (
          <button
            type="button"
            aria-expanded={tudo}
            onClick={() => setTudo(!tudo)}
            className={`mt-1 rounded-sm text-xs font-medium text-blue-800 underline decoration-blue-300 underline-offset-2 hover:decoration-blue-800 ${FOCO_VISIVEL}`}
          >
            {tudo ? 'Mostrar menos' : `Mostrar todas (${n})`}
          </button>
        )}
        {/* Já revertida: em vez do "Reverter…", quem a reverteu e quando (o servidor recusa outra vez). */}
        {revertida && (
          <p className="mt-2 flex items-start justify-end gap-1.5 text-right text-xs text-violet-900">
            <IconeReverter className="mt-px h-3.5 w-3.5 shrink-0" />
            {revertida.dica}
          </p>
        )}
        {reverter && n > 0 && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => abrirReverter(entrada)}
              title="Ver o que volta atrás antes de pôr no rascunho (nada é gravado até Guardar)"
              className={BOTAO_PEQUENO}
            >
              <IconeReverter className="h-3.5 w-3.5" />
              Reverter…
            </button>
          </div>
        )}
      </div>
    </li>
  );
}

export function DialogoHistorico({ aoFechar }: { aoFechar: () => void }) {
  // Volta a pedir quando o estado gravado muda (ex.: acabou de se guardar).
  const versao = useLoja((s) => s.estadoServidor?.versao ?? 0);
  // Sem sessão não vale a pena pedir; quando ela volta (entrou outra vez), pede de novo.
  const dentro = useSessao((s) => s.estado === 'dentro');
  // A reunião é só de leitura: o histórico abre, mas sem "Reverter…".
  const reuniao = useVista((s) => s.reuniao);
  const [limite, setLimite] = useState(PASSO_HISTORICO);
  const [tentativa, setTentativa] = useState(0);
  const [entradas, setEntradas] = useState<EntradaHistorico[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);

  // `versao` e `tentativa` não se usam lá dentro: só servem para voltar a pedir.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dependências de propósito
  useEffect(() => {
    if (!dentro) return;
    let atual = true;
    setACarregar(true);
    setErro(null);
    obterHistorico(limite)
      .then((lista) => {
        // O Reverter e o Guardar falam destas gravações pela data e pelo autor (historico.ts).
        lembrarGravacoes(lista);
        if (atual) setEntradas(lista);
      })
      .catch((e: unknown) => {
        if (atual) setErro(textoDoErro(e instanceof Error ? e.message : String(e)));
      })
      .finally(() => {
        if (atual) setACarregar(false);
      });
    return () => {
      atual = false;
    };
  }, [limite, versao, tentativa, dentro]);

  const haMais = entradas !== null && podeHaverMais(entradas.length, limite);

  return (
    <Dialogo
      titulo="Histórico"
      descricao="Quem mudou o quê, do mais recente para o mais antigo."
      aoFechar={aoFechar}
      largura="normal"
      alturaFixa
      fecharFora
      rodape={
        <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
          Fechar
        </button>
      }
    >
      {erro && (
        <div
          role="alert"
          className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950"
        >
          <p className="flex items-start gap-2">
            <IconeAviso className="mt-0.5 h-4 w-4 text-red-700" />
            <span>
              <strong className="font-semibold">Não foi possível ler o histórico.</strong> {erro}
            </span>
          </p>
          <button
            type="button"
            onClick={() => setTentativa((t) => t + 1)}
            className={`${BOTAO_SECUNDARIO} mt-2`}
          >
            Tentar outra vez
          </button>
        </div>
      )}
      {entradas !== null && entradas.length === 0 && !aCarregar && (
        <p className="py-6 text-center text-sm text-slate-600">Ainda não há gravações.</p>
      )}
      {entradas !== null && entradas.length > 0 && (
        <ol aria-label={comPlural(entradas.length, 'gravação', 'gravações')} className="space-y-3">
          {entradas.map((e) => (
            <Lote key={e.loteId} entrada={e} carregadas={entradas} reuniao={reuniao} />
          ))}
        </ol>
      )}
      <div className="mt-3 flex justify-center">
        {aCarregar && entradas === null && (
          <p className="flex items-center gap-2 py-6 text-sm text-slate-600">
            <IconeRodar /> A carregar…
          </p>
        )}
        {entradas !== null && (haMais || aCarregar) && !erro && (
          // aria-disabled (e não disabled) para o foco não se perder enquanto carrega.
          <button
            type="button"
            aria-disabled={aCarregar}
            onClick={() => {
              if (!aCarregar) setLimite(proximoLimite);
            }}
            className={BOTAO_SECUNDARIO}
          >
            {aCarregar && <IconeRodar />}
            {aCarregar ? 'A carregar…' : 'Carregar mais'}
          </button>
        )}
      </div>
    </Dialogo>
  );
}
