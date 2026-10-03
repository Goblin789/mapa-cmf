// "Onde dorme a …": lista pesquisável dos sítios onde a carrinha pode dormir — "Por definir (usar a
// sugestão)", as casas agrupadas por morada e os outros locais (ex.: estacionamentos) — com a casa sugerida
// (a da maioria dos passageiros), quantos passageiros moram em cada casa e quantas outras carrinhas lá
// dormem. Escolher é um passo do rascunho. Teclado como no "Mover para…": escrever filtra, ↑ ↓ escolhem,
// Enter escolhe, Esc fecha (padrão combobox ARIA).

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Id } from '../../dominio/tipos';
import { formatarMatricula } from '../comum/Matricula';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { useEcraLargo } from '../paineis/ganchos';
import { comPlural, textoDormida } from '../paineis/textos';
import { mudarDormidaComAviso } from './acoes';
import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { ativoValido, proximoAtivo } from './destinos';
import { IconeCasa, IconeLocal, IconeLupa, IconePorDefinir } from './icones';
import {
  contagens,
  filtrarSitios,
  montarSitiosDormida,
  type SitioDormida,
  sitiosEscolhiveis,
  tituloDormida,
} from './ondeDorme';

/** Id HTML de uma opção (a chave tem ":"; o useId tem caracteres que não servem em seletores). */
function idDaOpcao(idLista: string, chave: string): string {
  return `${idLista}-${chave}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function IconeSitio({ sitio }: { sitio: SitioDormida }) {
  const classe = 'h-4 w-4 text-slate-600';
  if (sitio.tipo === 'casa') return <IconeCasa className={classe} />;
  if (sitio.tipo === 'local') return <IconeLocal className={classe} />;
  return <IconePorDefinir className="h-4 w-4 text-slate-500" />;
}

/** Lado direito de cada sítio: "Agora" e "Sugerida". */
function InfoSitio({ sitio }: { sitio: SitioDormida }) {
  return (
    <span className="flex flex-col items-end gap-0.5 text-xs leading-tight">
      <span className="flex flex-wrap justify-end gap-1">
        {sitio.atual && (
          <span className="rounded border border-slate-300 bg-slate-100 px-1.5 leading-5 font-medium text-slate-700">
            Agora
          </span>
        )}
        {sitio.sugerida && (
          <span className="rounded border border-emerald-600 bg-emerald-50 px-1.5 leading-5 font-medium text-emerald-900">
            <span aria-hidden="true">≈ </span>Sugerida
          </span>
        )}
      </span>
    </span>
  );
}

export function DialogoDormida({ carrinhaId, aoFechar }: { carrinhaId: Id; aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const ecraLargo = useEcraLargo();
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState<string | null>(null);
  const idCampo = useId();
  const idLista = useId();
  const idEstado = useId();
  const carrinha = indices?.carrinhas.get(carrinhaId);

  const grupos = useMemo(
    () => (estado && indices && dormidas ? montarSitiosDormida(estado, indices, dormidas, carrinhaId) : []),
    [estado, indices, dormidas, carrinhaId],
  );
  const filtrados = useMemo(() => filtrarSitios(grupos, texto), [grupos, texto]);
  const escolhiveis = useMemo(() => sitiosEscolhiveis(filtrados), [filtrados]);
  const chaveAtiva = ativoValido(escolhiveis, ativo);
  const idOpcao = (chave: string) => idDaOpcao(idLista, chave);

  // Mantém o sítio ativo visível quando se anda com as setas (com o rato não: já está à vista).
  const rolarParaAtivo = useRef(false);
  useEffect(() => {
    if (!rolarParaAtivo.current || !chaveAtiva) return;
    rolarParaAtivo.current = false;
    document.getElementById(idDaOpcao(idLista, chaveAtiva))?.scrollIntoView({ block: 'nearest' });
  }, [chaveAtiva, idLista]);

  // A carrinha deixou de existir (ex.: recarregou-se o estado): não há nada a escolher.
  useEffect(() => {
    if (indices && !carrinha) aoFechar();
  }, [indices, carrinha, aoFechar]);
  if (!carrinha || !indices || !dormidas) return null;

  const agora = textoDormida(dormidas.get(carrinha.id), indices);
  const sugerida = dormidas.get(carrinha.id)?.confianca === 'sugerida';

  const escolher = (s: SitioDormida) => {
    if (s.atual) return;
    aoFechar();
    mudarDormidaComAviso(carrinha.id, s.valor);
  };

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    const comSetas = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    // Home/End sozinhos são do campo (início/fim do texto); com Ctrl vão ao primeiro/último sítio.
    const pontas = (e.key === 'Home' || e.key === 'End') && e.ctrlKey;
    if (comSetas || pontas) {
      e.preventDefault();
      rolarParaAtivo.current = true;
      setAtivo(proximoAtivo(escolhiveis, chaveAtiva, e.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'));
    } else if (e.key === 'Enter') {
      const s = escolhiveis.find((x) => x.chave === chaveAtiva);
      if (!s) return;
      e.preventDefault();
      escolher(s);
    }
  };

  const nResultados = escolhiveis.length;

  return (
    <Dialogo
      titulo={tituloDormida(carrinha)}
      aoFechar={aoFechar}
      largura="normal"
      alturaFixa
      corpoLivre
      fecharFora
      rodape={
        <>
          <p className="mr-auto hidden text-xs text-slate-500 md:block">
            <kbd className="font-sans">↑ ↓</kbd> escolher · <kbd className="font-sans">Enter</kbd> confirmar ·{' '}
            <kbd className="font-sans">Esc</kbd> fechar
          </p>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="space-y-2.5 border-b border-slate-200 px-4 py-3">
        <p className="text-sm text-slate-700">
          <span className="text-slate-500">Agora: </span>
          <strong className="font-semibold text-slate-900">{agora.rotulo}</strong>
          {sugerida && <span className="text-slate-600"> — {agora.nota}</span>}
          <span className="text-slate-500">
            {' '}
            · {comPlural(indices.passageiros.get(carrinha.id)?.length ?? 0, 'passageiro', 'passageiros')}
          </span>
        </p>
        <div className="relative">
          <label htmlFor={idCampo} className="sr-only">
            Procurar casa ou local
          </label>
          <IconeLupa className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id={idCampo}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={idLista}
            aria-autocomplete="list"
            aria-activedescendant={chaveAtiva ? idOpcao(chaveAtiva) : undefined}
            aria-describedby={idEstado}
            data-foco-inicial={ecraLargo ? true : undefined}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="go"
            placeholder="Procurar casa, morada ou estacionamento…"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAtivo(null);
            }}
            onKeyDown={aoTeclar}
            className={`w-full rounded-md border border-slate-300 bg-white py-1.5 pr-2.5 pl-8 text-base placeholder:text-slate-400 sm:text-sm ${FOCO_VISIVEL}`}
          />
          <p id={idEstado} className="sr-only" role="status" aria-live="polite">
            {nResultados === 0 ? 'Nenhum sítio.' : comPlural(nResultados, 'sítio', 'sítios')}
          </p>
        </div>
      </div>

      <div
        id={idLista}
        role="listbox"
        aria-label={`Sítios onde ${formatarMatricula(carrinha.matricula)} pode dormir`}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-3"
      >
        {filtrados.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-slate-600">Nenhum sítio com “{texto.trim()}”.</p>
        )}
        {filtrados.map((g) => (
          // Grupo de opções dentro de uma listbox (ARIA): um <fieldset> não serve aqui.
          // biome-ignore lint/a11y/useSemanticElements: role="group" é o padrão ARIA da listbox com grupos
          <div key={g.chave} role="group" aria-labelledby={idDaOpcao(idLista, `grupo-${g.chave}`)}>
            <div
              id={idDaOpcao(idLista, `grupo-${g.chave}`)}
              role="presentation"
              className="sticky top-0 z-10 bg-white/95 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase backdrop-blur-sm"
            >
              {g.titulo}
            </div>
            {g.sitios.map((s) => {
              const eAtivo = s.chave === chaveAtiva;
              return (
                // O teclado é tratado no campo de pesquisa (padrão combobox ARIA): as opções só precisam do rato.
                // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado é tratado no campo de pesquisa
                <div
                  key={s.chave}
                  id={idOpcao(s.chave)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={eAtivo}
                  aria-disabled={s.atual}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => {
                    if (!s.atual && !eAtivo) setAtivo(s.chave);
                  }}
                  onClick={() => escolher(s)}
                  className={`flex min-h-11 scroll-mt-8 items-center gap-3 rounded-md px-2 py-1.5 ${
                    s.atual
                      ? 'cursor-default bg-slate-50'
                      : eAtivo
                        ? 'cursor-pointer bg-blue-50 outline-2 -outline-offset-2 outline-blue-700'
                        : 'cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <span className="grid w-6 shrink-0 place-items-center">
                    <IconeSitio sitio={s} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-sm break-words ${
                        s.tipo === 'por-definir' ? 'text-slate-700 italic' : 'font-medium text-slate-900'
                      }`}
                    >
                      {s.rotulo}
                    </span>
                    {s.detalhe && (
                      <span className="block text-xs break-words text-slate-500">{s.detalhe}</span>
                    )}
                    {contagens(s) && <span className="block text-xs text-slate-600">{contagens(s)}</span>}
                    {s.atual && <span className="sr-only"> (é onde dorme agora)</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <InfoSitio sitio={s} />
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </Dialogo>
  );
}
