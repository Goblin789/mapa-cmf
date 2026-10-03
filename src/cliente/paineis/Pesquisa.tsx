// Pesquisa rápida por nome, Nº, matrícula ou casa (combobox ARIA com lista de resultados).
// ↑ ↓ escolhem, Enter abre, Esc fecha a lista (e depois limpa o texto).
// "/" e Ctrl+K levam o foco para aqui. Escolher um resultado põe-no em foco e leva o mapa até lá.

import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { clienteEfetivoId } from '../../dominio/cores';
import type { Indices } from '../../dominio/indices';
import { pesquisar, type ResultadoPesquisa } from '../../dominio/pesquisa';
import type { Id } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL, Z_POPOVER } from './classes';
import { destinoNoMapa, ZOOM_DESTINO } from './fichas';
import { IconeTipo, MarcaCliente } from './pecas';
import { ehAtalhoPesquisa, ehCampoEditavel, moverAtivo } from './teclado';
import { comPlural, detalheCarrinha } from './textos';

const ROTULO_TIPO: Record<ResultadoPesquisa['tipo'], string> = {
  pessoa: 'pessoa',
  carrinha: 'carrinha',
  casa: 'casa',
};

/** Tipo à direita do resultado: um carro da frota diz "carro". */
function rotuloTipo(r: ResultadoPesquisa, ind: Indices | null): string {
  if (r.tipo === 'carrinha' && ind?.carrinhas.get(r.id)?.tipo === 'carro') return 'carro';
  return ROTULO_TIPO[r.tipo];
}

/** Detalhe do resultado. Numa carrinha: "3/9 lugares · Ford Transit Custom" (com a marca). */
function detalheResultado(r: ResultadoPesquisa, ind: Indices | null): string {
  const carrinha = r.tipo === 'carrinha' ? ind?.carrinhas.get(r.id) : undefined;
  if (!carrinha || !ind) return r.detalhe;
  return detalheCarrinha(carrinha, ind.passageiros.get(carrinha.id)?.length ?? 0);
}

/** Se a pessoa estiver numa caixa lateral, mostra o nome dela lá (sem mexer no mapa nem no painel). */
function mostrarNasCaixas(pessoaId: Id): void {
  // No telemóvel a lista fica por baixo do mapa e quem faz scroll é a página: fazer scroll até ao nome
  // tirava o mapa do ecrã. Aí basta a ficha e o mapa.
  if (!window.matchMedia('(min-width: 768px)').matches) return;
  const chip = document.querySelector(`[data-caixas-laterais] [data-pessoa-id="${CSS.escape(pessoaId)}"]`);
  chip?.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

export function Pesquisa() {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const dormidas = useLoja((s) => s.dormidas);
  const definirFoco = useLoja((s) => s.definirFoco);
  const pedirIrPara = useLoja((s) => s.pedirIrPara);

  const [texto, setTexto] = useState('');
  const [aberta, setAberta] = useState(false);
  const [ativo, setAtivo] = useState(-1);
  const campo = useRef<HTMLInputElement>(null);
  const idCampo = useId();
  const idLista = useId();
  const idOpcao = (i: number) => `${idLista}-opcao-${i}`;

  const resultados = useMemo(
    () => (estado && indices ? pesquisar(estado, indices, texto) : []),
    [estado, indices, texto],
  );
  const termoValido = texto.trim().length >= 2;
  const mostrarLista = aberta && resultados.length > 0;
  const mostrarSemResultados = aberta && termoValido && resultados.length === 0;
  const ativoValido = mostrarLista && ativo >= 0 && ativo < resultados.length ? ativo : -1;

  // Atalhos globais: "/" fora de campos de texto, Ctrl+K / ⌘K em qualquer sítio.
  useEffect(() => {
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const alvo = e.target instanceof HTMLElement ? e.target : null;
      const tecla = {
        key: e.key,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        altKey: e.altKey,
        emCampoEditavel: ehCampoEditavel(alvo),
      };
      if (!ehAtalhoPesquisa(tecla)) return;
      e.preventDefault();
      campo.current?.focus();
      campo.current?.select();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  // Mantém o resultado ativo visível quando se anda com as setas.
  useEffect(() => {
    if (ativoValido < 0) return;
    document.getElementById(`${idLista}-opcao-${ativoValido}`)?.scrollIntoView({ block: 'nearest' });
  }, [ativoValido, idLista]);

  const escolher = (r: ResultadoPesquisa) => {
    setTexto(r.rotulo);
    setAberta(false);
    setAtivo(-1);
    definirFoco({ tipo: r.tipo, id: r.id });
    if (indices && dormidas) {
      const destino = destinoNoMapa({ tipo: r.tipo, id: r.id }, indices, dormidas);
      if (destino) pedirIrPara(destino.lat, destino.lng, ZOOM_DESTINO);
    }
    // Espera que as caixas laterais mudem de aba (telemóvel) antes de procurar o nome.
    if (r.tipo === 'pessoa') requestAnimationFrame(() => mostrarNasCaixas(r.id));
  };

  const aoTeclar = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (resultados.length === 0) return;
        e.preventDefault();
        const direcao = e.key === 'ArrowDown' ? 1 : -1;
        if (!aberta) {
          setAberta(true);
          setAtivo(direcao === 1 ? 0 : resultados.length - 1);
        } else setAtivo(moverAtivo(ativoValido, resultados.length, direcao));
        return;
      }
      case 'Enter': {
        const r = resultados[ativoValido >= 0 ? ativoValido : 0];
        if (!aberta || !r) return;
        e.preventDefault();
        escolher(r);
        return;
      }
      case 'Escape':
        // preventDefault marca o Esc como tratado: o painel de foco não fecha ao mesmo tempo.
        // Se um popover já o tratou (fase de captura), a pesquisa fica como está.
        if (e.nativeEvent.defaultPrevented) return;
        if (mostrarLista || mostrarSemResultados) {
          e.preventDefault();
          setAberta(false);
        } else if (texto) {
          e.preventDefault();
          setTexto('');
        }
        return;
    }
  };

  return (
    <div className="relative">
      <label htmlFor={idCampo} className="sr-only">
        Pesquisar pessoa, Nº, matrícula ou casa
      </label>
      <input
        ref={campo}
        id={idCampo}
        type="text"
        role="combobox"
        aria-expanded={mostrarLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={ativoValido >= 0 ? idOpcao(ativoValido) : undefined}
        aria-keyshortcuts="/ Control+K"
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        placeholder="Pesquisar nome, Nº ou matrícula…"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberta(true);
          setAtivo(0);
        }}
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
        onKeyDown={aoTeclar}
        // 16 px no telemóvel: abaixo disso o Safari do iPhone aproxima a página ao tocar no campo.
        className={`w-full rounded-md border border-slate-300 bg-white py-1.5 pr-8 pl-2.5 text-base placeholder:text-slate-500 sm:text-sm ${FOCO_VISIVEL}`}
      />
      {!texto && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 rounded border border-slate-300 bg-slate-50 px-1.5 font-sans text-[11px] text-slate-600 sm:block"
        >
          /
        </span>
      )}
      <div
        id={idLista}
        role="listbox"
        aria-label="Resultados da pesquisa"
        hidden={!mostrarLista}
        className={`absolute top-full right-0 left-0 ${Z_POPOVER} mt-1 max-h-80 overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg`}
      >
        {mostrarLista &&
          resultados.map((r, i) => {
            const pessoa = r.tipo === 'pessoa' ? indices?.pessoas.get(r.id) : undefined;
            const cliente =
              pessoa && indices
                ? (indices.clientes.get(clienteEfetivoId(pessoa, indices.obras)) ?? null)
                : null;
            return (
              // O teclado é tratado no campo (padrão combobox ARIA): as opções só precisam do rato.
              // biome-ignore lint/a11y/useKeyWithClickEvents: o teclado é tratado no campo da pesquisa
              <div
                key={`${r.tipo}:${r.id}`}
                id={idOpcao(i)}
                role="option"
                tabIndex={-1}
                aria-selected={i === ativoValido}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => {
                  if (i !== ativoValido) setAtivo(i);
                }}
                onClick={() => escolher(r)}
                className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                  i === ativoValido ? 'bg-blue-50 outline-2 -outline-offset-2 outline-blue-700' : ''
                }`}
              >
                {r.tipo === 'pessoa' ? <MarcaCliente cliente={cliente} /> : <IconeTipo tipo={r.tipo} />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{r.rotulo}</span>
                  <span className="block truncate text-xs text-slate-600">
                    {detalheResultado(r, indices)}
                  </span>
                </span>
                <span className="shrink-0 text-[11px] text-slate-600">{rotuloTipo(r, indices)}</span>
              </div>
            );
          })}
      </div>
      {mostrarSemResultados && (
        <p
          className={`absolute top-full right-0 left-0 ${Z_POPOVER} mt-1 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-700 shadow-lg`}
        >
          Sem resultados.
        </p>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {mostrarLista
          ? comPlural(resultados.length, 'resultado', 'resultados')
          : mostrarSemResultados
            ? 'Sem resultados.'
            : ''}
      </p>
    </div>
  );
}
