// "Mover para…": lista pesquisável de destinos (casas, carrinhas, obras e os grupos especiais) com os
// lugares livres no estado visível e o resultado se as pessoas forem para lá. É o caminho garantido
// no telemóvel. Teclado: escrever filtra, ↑ ↓ escolhem, Enter move, Esc fecha (padrão combobox ARIA).
// M2: as carrinhas não contam quem está indisponível hoje e dizem "1 livre até 12/10" (destinos.ts). Aberto
// no separador Obras ("Mudar obra…" da ficha) sem nenhuma obra, diz como se cria uma e tem "Nova obra…".

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Id, Pessoa } from '../../dominio/tipos';
import { ESTILO_NIVEL } from '../comum/lotacao';
import { formatarMatricula, Matricula } from '../comum/Matricula';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { cadeiaDaPessoa } from '../paineis/fichas';
import { useEcraLargo } from '../paineis/ganchos';
import { MarcaCliente } from '../paineis/pecas';
import { comPlural } from '../paineis/textos';
import { moverComAviso } from './acoes';
import { BOTAO_PEQUENO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import {
  ativoValido,
  type Destino,
  destinosEscolhiveis,
  filtrarDestinos,
  montarDestinos,
  proximoAtivo,
  separadoresDoMover,
  type TipoDestino,
  textoLivres,
  tituloMover,
} from './destinos';
import { IconeCarrinha, IconeCasa, IconeLupa, IconeObra } from './icones';
import { abrirObra } from './ui';

const SEPARADORES: { tipo: TipoDestino | null; rotulo: string }[] = [
  { tipo: null, rotulo: 'Tudo' },
  { tipo: 'casa', rotulo: 'Casas' },
  { tipo: 'carrinha', rotulo: 'Carrinhas' },
  { tipo: 'obra', rotulo: 'Obras' },
];

const MAX_NOMES = 8;

/** Id HTML de uma opção (a chave do alvo tem ":"; o useId tem caracteres que não servem em seletores). */
function idDaOpcao(idLista: string, chave: string): string {
  return `${idLista}-${chave}`.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function QuemMuda({ pessoas }: { pessoas: Pessoa[] }) {
  const indices = useLoja((s) => s.indices);
  if (!indices) return null;
  const [unica] = pessoas;
  if (pessoas.length === 1 && unica) {
    return (
      <p className="text-sm text-slate-700">
        <span className="text-slate-500">Agora: </span>
        {cadeiaDaPessoa(unica, indices)
          .map((el) => (el.tipo === 'carrinha' && el.id ? formatarMatricula(el.rotulo) : el.rotulo))
          .join(' · ')}
      </p>
    );
  }
  const visiveis = pessoas.slice(0, MAX_NOMES);
  return (
    <p className="text-sm text-slate-700">
      {visiveis.map((p) => p.nomeCurto).join(', ')}
      {pessoas.length > MAX_NOMES && ` e mais ${pessoas.length - MAX_NOMES}`}
    </p>
  );
}

function IconeDestino({ destino }: { destino: Destino }) {
  const indices = useLoja((s) => s.indices);
  const classe = `h-4 w-4 ${destino.especial ? 'text-slate-400' : 'text-slate-600'}`;
  if (destino.tipo === 'obra' && destino.clienteId) {
    return <MarcaCliente cliente={indices?.clientes.get(destino.clienteId) ?? null} />;
  }
  if (destino.tipo === 'casa') return <IconeCasa className={classe} />;
  if (destino.tipo === 'carrinha') return <IconeCarrinha className={classe} />;
  return <IconeObra className={classe} />;
}

/** Lado direito de cada destino: lotação agora, livres e como fica. */
function Lotacao({ destino, aMover }: { destino: Destino; aMover: number }) {
  if (destino.todosJaLa) {
    return (
      <span className="rounded border border-slate-300 bg-slate-100 px-1.5 text-xs leading-5 font-medium text-slate-600">
        {aMover === 1 ? 'Está aqui' : 'Estão aqui'}
      </span>
    );
  }
  const l = destino.lotacao;
  if (!l) {
    return (
      <span className="text-xs text-slate-600 tabular-nums">
        {comPlural(destino.pessoas, 'pessoa', 'pessoas')}
        {destino.jaLa > 0 && <span className="block text-slate-500">{destino.jaLa} já aqui</span>}
      </span>
    );
  }
  const estilo = ESTILO_NIVEL[l.nivel];
  const muda = l.depois !== l.ocupados;
  const excesso = l.nivelDepois === 'excesso';
  return (
    <span className="flex flex-col items-end gap-0.5 text-xs leading-tight">
      <span className="flex items-center gap-1.5">
        <span className="text-slate-600">{textoLivres(l.ocupados, l.lugares)}</span>
        <span
          className={`inline-flex items-center gap-0.5 rounded px-1.5 leading-5 font-semibold tabular-nums ${estilo.pastilha}`}
          title={`${l.ocupados} de ${l.lugares} lugares ocupados · ${estilo.rotulo}`}
        >
          <span aria-hidden="true">{estilo.simbolo}</span>
          {l.ocupados}/{l.lugares}
        </span>
      </span>
      {/* M2: lugares livres só até alguém voltar (quem está indisponível hoje não conta na lotação). */}
      {l.temporarios && (
        <span
          className="font-medium text-amber-800"
          title="Lugar de quem está indisponível: volta a ser ocupado quando a pessoa voltar"
        >
          {l.temporarios}
        </span>
      )}
      {muda && (
        <span className={excesso ? 'font-semibold text-red-700' : 'text-slate-500'}>
          {excesso && <span aria-hidden="true">▲ </span>}
          fica {l.depois}/{l.lugares}
          {excesso && ` · ${l.depois - l.lugares} a mais`}
        </span>
      )}
    </span>
  );
}

export function DialogoMoverPara({
  pessoaIds,
  filtro,
  aoFechar,
}: {
  pessoaIds: readonly Id[];
  filtro: TipoDestino | null;
  aoFechar: () => void;
}) {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const ecraLargo = useEcraLargo();
  const [tipo, setTipo] = useState<TipoDestino | null>(filtro);
  const [texto, setTexto] = useState('');
  const [ativo, setAtivo] = useState<string | null>(null);
  const idCampo = useId();
  const idLista = useId();
  const idEstado = useId();

  const grupos = useMemo(
    () => (estado && indices ? montarDestinos(estado, indices, pessoaIds) : []),
    [estado, indices, pessoaIds],
  );
  const filtrados = useMemo(() => filtrarDestinos(grupos, texto, tipo), [grupos, texto, tipo]);
  const escolhiveis = useMemo(() => destinosEscolhiveis(filtrados), [filtrados]);
  const chaveAtiva = ativoValido(escolhiveis, ativo);
  const idOpcao = (chave: string) => idDaOpcao(idLista, chave);

  // Mantém o destino ativo visível quando se anda com as setas (com o rato não: já está à vista).
  const rolarParaAtivo = useRef(false);
  useEffect(() => {
    if (!rolarParaAtivo.current || !chaveAtiva) return;
    rolarParaAtivo.current = false;
    document.getElementById(idDaOpcao(idLista, chaveAtiva))?.scrollIntoView({ block: 'nearest' });
  }, [chaveAtiva, idLista]);

  const pessoas = pessoaIds.map((id) => indices?.pessoas.get(id)).filter((p): p is Pessoa => p !== undefined);
  const temObras = grupos.some((g) => g.tipo === 'obra');
  const tiposVisiveis = separadoresDoMover(temObras, filtro);
  const separadores = SEPARADORES.filter((s) => tiposVisiveis.includes(s.tipo));
  // "Mudar obra…" sem nenhuma obra: em vez da lista vazia, como se cria uma.
  const semObras = tipo === 'obra' && !temObras;

  const escolher = (d: Destino) => {
    if (d.todosJaLa) return;
    aoFechar();
    moverComAviso(pessoaIds, d.alvo);
  };

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    const comSetas = e.key === 'ArrowDown' || e.key === 'ArrowUp';
    // Home/End sozinhos são do campo (início/fim do texto); com Ctrl vão ao primeiro/último destino.
    const pontas = (e.key === 'Home' || e.key === 'End') && e.ctrlKey;
    if (comSetas || pontas) {
      e.preventDefault();
      rolarParaAtivo.current = true;
      setAtivo(proximoAtivo(escolhiveis, chaveAtiva, e.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'));
    } else if (e.key === 'Enter') {
      const d = escolhiveis.find((x) => x.chave === chaveAtiva);
      if (!d) return;
      e.preventDefault();
      escolher(d);
    }
  };

  const nResultados = escolhiveis.length;

  return (
    <Dialogo
      titulo={tituloMover(
        pessoas.map((p) => p.nomeCurto),
        tipo,
      )}
      aoFechar={aoFechar}
      largura="normal"
      alturaFixa
      corpoLivre
      fecharFora
      rodape={
        <>
          <p className="mr-auto hidden text-xs text-slate-500 md:block">
            <kbd className="font-sans">↑ ↓</kbd> escolher · <kbd className="font-sans">Enter</kbd> mover ·{' '}
            <kbd className="font-sans">Esc</kbd> fechar
          </p>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
        </>
      }
    >
      <div className="space-y-2.5 border-b border-slate-200 px-4 py-3">
        <QuemMuda pessoas={pessoas} />
        <fieldset className="flex min-w-0 gap-1 rounded-lg bg-slate-100 p-0.5">
          <legend className="sr-only">Mostrar</legend>
          {separadores.map((s) => (
            <button
              key={s.rotulo}
              type="button"
              aria-pressed={tipo === s.tipo}
              onClick={() => setTipo(s.tipo)}
              className={`flex-1 rounded-md px-2 py-1 text-sm font-medium ${FOCO_VISIVEL} ${
                tipo === s.tipo ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.rotulo}
            </button>
          ))}
        </fieldset>
        <div className="relative">
          <label htmlFor={idCampo} className="sr-only">
            Procurar destino
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
            placeholder="Procurar casa, matrícula ou obra…"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setAtivo(null);
            }}
            onKeyDown={aoTeclar}
            className={`w-full rounded-md border border-slate-300 bg-white py-1.5 pr-2.5 pl-8 text-base placeholder:text-slate-400 sm:text-sm ${FOCO_VISIVEL}`}
          />
          <p id={idEstado} className="sr-only" role="status" aria-live="polite">
            {nResultados === 0 ? 'Nenhum destino.' : comPlural(nResultados, 'destino', 'destinos')}
          </p>
        </div>
      </div>

      {/* Fora da listbox: um botão não é uma opção. */}
      {semObras && (
        <div className="space-y-2 px-4 pt-6 text-center text-sm text-slate-600">
          <p>Ainda não há obras.</p>
          <button
            type="button"
            onClick={() => {
              aoFechar();
              abrirObra(null);
            }}
            className={BOTAO_PEQUENO}
          >
            <IconeObra className="h-3.5 w-3.5" />
            Nova obra…
          </button>
        </div>
      )}
      <div
        id={idLista}
        role="listbox"
        aria-label="Destinos"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pt-1 pb-3"
      >
        {filtrados.length === 0 && !semObras && (
          <p className="px-2 py-6 text-center text-sm text-slate-600">Nenhum destino com “{texto.trim()}”.</p>
        )}
        {filtrados.map((g) => (
          // Grupo de opções dentro de uma listbox (ARIA): um <fieldset> não serve aqui.
          // biome-ignore lint/a11y/useSemanticElements: role="group" é o padrão ARIA da listbox com grupos
          <div key={g.tipo} role="group" aria-labelledby={`${idLista}-grupo-${g.tipo}`}>
            <div
              id={`${idLista}-grupo-${g.tipo}`}
              role="presentation"
              className="sticky top-0 z-10 bg-white/95 px-2 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase backdrop-blur-sm"
            >
              {g.titulo}
            </div>
            {g.destinos.map((d) => {
              const eAtivo = d.chave === chaveAtiva;
              return (
                // O teclado é tratado no campo de pesquisa (padrão combobox ARIA): as opções só precisam do rato.
                // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado é tratado no campo de pesquisa
                <div
                  key={d.chave}
                  id={idOpcao(d.chave)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={eAtivo}
                  aria-disabled={d.todosJaLa}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => {
                    if (!d.todosJaLa && !eAtivo) setAtivo(d.chave);
                  }}
                  onClick={() => escolher(d)}
                  className={`flex min-h-11 scroll-mt-8 items-center gap-3 rounded-md px-2 py-1.5 ${
                    d.todosJaLa
                      ? 'cursor-default opacity-60'
                      : eAtivo
                        ? 'cursor-pointer bg-blue-50 outline-2 -outline-offset-2 outline-blue-700'
                        : 'cursor-pointer hover:bg-slate-50'
                  }`}
                >
                  <span className="grid w-6 shrink-0 place-items-center">
                    <IconeDestino destino={d} />
                  </span>
                  <span className="min-w-0 flex-1">
                    {d.tipo === 'carrinha' && !d.especial ? (
                      <Matricula matricula={d.rotulo} altura={18} />
                    ) : (
                      <span
                        className={`block truncate text-sm ${d.especial ? 'text-slate-700 italic' : 'font-medium text-slate-900'}`}
                      >
                        {d.rotulo}
                      </span>
                    )}
                    {d.detalhe && <span className="block truncate text-xs text-slate-500">{d.detalhe}</span>}
                  </span>
                  <span className="shrink-0 text-right">
                    <Lotacao destino={d} aMover={pessoas.length} />
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
