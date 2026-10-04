// Marcar indisponível (M2, docs/m2.md, "Indisponível"): de (hoje, por omissão) até (dia ou "sem data de
// regresso"), para uma ou várias pessoas. SEM motivo nem campo de texto, de propósito. Também muda as datas
// de um período existente (periodoId). Entra no rascunho (operacoesMarcarIndisponivel / 'campo').
// Antes de pôr no rascunho valida o fim ≥ início e as sobreposições com os períodos de cada pessoa que o
// browser conhece (o estado só traz os dos últimos 30 dias: um mais antigo sobreposto é recusado pelo
// servidor ao guardar, com uma frase). Com algum erro explica e não aplica. Um período que já acabou (fim
// antes de hoje: quase sempre engano no ano ou no mês) pede confirmação: o 1.º clique avisa, o 2.º marca.
// Aqui ficam também as funções puras do diálogo (testadas) e `aplicarComAviso`, o passo do rascunho com o
// aviso "Ctrl+Z desfaz" que a ficha, a Tabela e o diálogo dos problemas usam.
// CONTRATO DO M2: o módulo Indisponível e problemas implementa (este ficheiro é dele).

import { type FormEvent, useId, useMemo, useState } from 'react';
import { eDia, formatarDiaCompleto, formatarDiaMes } from '../../dominio/datas';
import {
  operacoesMarcarIndisponivel,
  periodosDaPessoa,
  periodosSobrepoem,
  textoPeriodo,
} from '../../dominio/indisponibilidade';
import {
  descreverOperacao,
  type Operacao,
  type OperacaoCampo,
  operacaoCampo,
  validarOperacoes,
} from '../../dominio/operacoes';
import type { Estado, Id, Indisponibilidade, Pessoa } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { comPlural } from '../paineis/textos';
import { entrarEdicaoComAviso } from './acoes';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { useUiEdicao } from './ui';

// --- Funções puras ----------------------------------------------------------------------------------

/** A frase fixa do diálogo: não há motivo nem texto livre. */
export const FRASE_SO_DATAS = 'Só se guardam as datas.';

/**
 * O que está mal nas datas, ou null: o início tem de ser um dia; o fim, um dia (ou null = sem data de
 * regresso) igual ou depois do início.
 */
export function erroDatas(inicio: string, fim: string | null): string | null {
  if (!eDia(inicio)) return 'Escolhe o primeiro dia.';
  if (fim === null) return null;
  if (!eDia(fim)) return 'Escolhe o último dia ou marca "Sem data de regresso".';
  if (fim < inicio) {
    return `O último dia (${formatarDiaMes(fim)}) não pode ser antes do primeiro (${formatarDiaMes(inicio)}).`;
  }
  return null;
}

/**
 * Aviso (pede confirmação) quando o período já acabou: o último dia é antes de hoje. Um período passado não
 * conta na lotação e a ficha só o mostra enquanto está por guardar; quase sempre é engano no ano ou no mês.
 * null se ainda não acabou (ou sem data de regresso).
 */
export function avisoPeriodoPassado(fim: string | null, hoje: string): string | null {
  if (fim === null || !eDia(fim) || fim >= hoje) return null;
  return `O período já acabou (o último dia, ${formatarDiaCompleto(fim)}, é antes de hoje): não conta na lotação e, depois de guardar, não aparece na ficha. Confirma o ano e o mês.`;
}

/** Um período que já existe e se sobrepõe ao novo. */
export interface Sobreposicao {
  pessoa: Pick<Pessoa, 'id' | 'nomeCurto'>;
  periodo: Indisponibilidade;
}

/**
 * Os períodos das pessoas que se sobrepõem a [inicio, fim] (fim null = sem data de regresso), sem contar o
 * período que se está a mudar (`ignorar`). Só os que o estado tem (os dos últimos 30 dias e os futuros).
 */
export function sobreposicoes(
  estado: Pick<Estado, 'indisponibilidades' | 'pessoas'>,
  pessoaIds: readonly Id[],
  inicio: string,
  fim: string | null,
  ignorar: Id | null = null,
): Sobreposicao[] {
  const novo: Indisponibilidade = { id: '', pessoaId: '', inicio, fim };
  return [...new Set(pessoaIds)].flatMap((pessoaId) => {
    const pessoa = estado.pessoas.find((p) => p.id === pessoaId);
    if (!pessoa) return [];
    return periodosDaPessoa(estado, pessoaId)
      .filter((p) => p.id !== ignorar && periodosSobrepoem(p, novo))
      .map((periodo) => ({ pessoa, periodo }));
  });
}

/** "Ana T. já está indisponível 06/10 a 12/10." (uma frase por sobreposição). */
export function frasesSobreposicoes(lista: readonly Sobreposicao[]): string[] {
  return lista.map((s) => `${s.pessoa.nomeCurto} já está indisponível ${textoPeriodo(s.periodo)}.`);
}

/**
 * As operações do diálogo: períodos novos (um por pessoa) ou as datas mudadas de um período (`periodoId`);
 * [] se nada muda.
 */
export function operacoesDoDialogo(
  estado: Estado,
  pessoaIds: readonly Id[],
  periodoId: Id | null,
  inicio: string,
  fim: string | null,
  gerar?: () => string,
): Operacao[] {
  if (periodoId === null) return operacoesMarcarIndisponivel(pessoaIds, inicio, fim, gerar);
  return [
    operacaoCampo(estado, 'indisponibilidade', periodoId, 'inicio', inicio),
    operacaoCampo(estado, 'indisponibilidade', periodoId, 'fim', fim),
  ].filter((op): op is OperacaoCampo => op !== null);
}

// --- Passo do rascunho com aviso ---------------------------------------------------------------------

/**
 * Põe as operações no rascunho como UM passo e deixa o aviso "… Ctrl+Z desfaz." (`frase` = o que
 * aconteceu; sem ela, a frase do histórico da única operação). Fora do modo de edição entra nele antes
 * (os botões "Resolver"/"Reabrir" funcionam também a ler). Devolve se mudou alguma coisa.
 */
export function aplicarComAviso(ops: readonly Operacao[], frase?: string): boolean {
  const loja = useLoja.getState();
  if (!loja.estado || ops.length === 0) return false;
  const entrou = !loja.modoEdicao;
  if (entrou) entrarEdicaoComAviso();
  const antes = useLoja.getState().estado;
  useLoja.getState().aplicar([...ops]);
  const [unica] = ops;
  const texto = frase ?? (ops.length === 1 && unica && antes ? descreverOperacao(antes, unica) : '');
  useUiEdicao
    .getState()
    .avisar(
      `${entrou ? 'Modo de edição: só fica gravado com Guardar. ' : ''}${texto ? `${texto}. ` : ''}Ctrl+Z desfaz.`,
    );
  return true;
}

// --- Diálogo ------------------------------------------------------------------------------------------

const CLASSE_CAMPO = `min-w-0 rounded-md border border-slate-400 bg-white px-2 py-1.5 text-base text-slate-900 disabled:bg-slate-100 disabled:text-slate-500 sm:text-sm ${FOCO_VISIVEL}`;

export function DialogoIndisponivel({
  pessoaIds,
  periodoId,
  aoFechar,
}: {
  pessoaIds: readonly Id[];
  periodoId: Id | null;
  aoFechar: () => void;
}) {
  const estado = useLoja((s) => s.estado);
  const hoje = useLoja((s) => s.hoje);
  const periodo = periodoId ? (estado?.indisponibilidades.find((p) => p.id === periodoId) ?? null) : null;
  const [inicio, setInicio] = useState(periodo?.inicio ?? hoje);
  const [fimEscolhido, setFimEscolhido] = useState(periodo?.fim ?? '');
  const [semData, setSemData] = useState(periodo !== null && periodo.fim === null);
  const [tentou, setTentou] = useState(false);
  // Período que já acabou: o 1.º "Marcar" só mostra o aviso (fica aqui com que datas); o 2.º, com as mesmas
  // datas, marca na mesma.
  const [avisadoPara, setAvisadoPara] = useState<string | null>(null);
  const [erroServidor, setErroServidor] = useState<string[]>([]);
  const ids = { inicio: useId(), fim: useId(), sem: useId(), form: useId(), erros: useId() };

  // A quem se aplica: a pessoa do período, ou as escolhidas que ainda estão na empresa.
  const pessoas = useMemo(() => {
    if (!estado) return [];
    const quem = periodo ? [periodo.pessoaId] : [...new Set(pessoaIds)];
    return quem
      .map((id) => estado.pessoas.find((p) => p.id === id))
      .filter((p): p is Pessoa => p !== undefined);
  }, [estado, periodo, pessoaIds]);
  const ativas = periodo ? pessoas : pessoas.filter((p) => p.ativa);
  const foram = pessoas.length - ativas.length;

  if (!estado) return null;
  if (periodoId !== null && !periodo) {
    return (
      <Dialogo
        titulo="Indisponível"
        aoFechar={aoFechar}
        rodape={
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Fechar
          </button>
        }
      >
        <p className="text-sm text-slate-700">Este período já não existe (foi apagado ou desfeito).</p>
      </Dialogo>
    );
  }

  const fim = semData ? null : fimEscolhido;
  const erro = erroDatas(inicio, fim === '' ? 'sem dia' : fim);
  const frases = erro
    ? []
    : frasesSobreposicoes(
        sobreposicoes(
          estado,
          ativas.map((p) => p.id),
          inicio,
          fim,
          periodoId,
        ),
      );
  const problemas = [...(erro ? [erro] : []), ...frases];
  const aviso = problemas.length === 0 ? avisoPeriodoPassado(fim, hoje) : null;
  const chaveDatas = `${inicio}|${fim ?? 'sem'}`;
  const avisado = aviso !== null && avisadoPara === chaveDatas;
  const mostrarErros = tentou || frases.length > 0 || (erro !== null && fim !== '' && eDia(inicio));

  const porNoRascunho = (e: FormEvent) => {
    e.preventDefault();
    setTentou(true);
    if (problemas.length > 0 || ativas.length === 0) return;
    if (aviso !== null && !avisado) {
      setAvisadoPara(chaveDatas);
      return;
    }
    const ops = operacoesDoDialogo(
      estado,
      ativas.map((p) => p.id),
      periodoId,
      inicio,
      fim,
    );
    if (ops.length === 0) {
      useUiEdicao.getState().avisar('Nada mudou: as datas já eram estas.');
      aoFechar();
      return;
    }
    // As outras regras do domínio (as mesmas do servidor), com o estado que o browser tem.
    const outros = validarOperacoes(estado, ops);
    if (outros.length > 0) {
      setErroServidor(outros);
      return;
    }
    // Uma operação: a frase do histórico ("Ana T. — indisponível de … a …"); várias pessoas: quantas.
    const frase =
      ops.length === 1
        ? undefined
        : periodoId === null
          ? `${ativas.length} pessoas marcadas indisponíveis`
          : `${pessoas[0]?.nomeCurto ?? ''} — datas do período mudadas`;
    aplicarComAviso(ops, frase);
    aoFechar();
  };

  const titulo =
    periodoId !== null
      ? `Mudar as datas — ${pessoas[0]?.nomeCurto ?? ''}`
      : ativas.length === 1
        ? `Marcar ${ativas[0]?.nomeCurto} indisponível`
        : `Marcar ${comPlural(ativas.length, 'pessoa', 'pessoas')} indisponíveis`;

  return (
    <Dialogo
      titulo={titulo}
      descricao={FRASE_SO_DATAS}
      aoFechar={aoFechar}
      largura="estreito"
      rodape={
        <>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={ids.form} disabled={ativas.length === 0} className={BOTAO_PRIMARIO}>
            {avisado ? 'Sim, já acabou' : periodoId !== null ? 'Mudar as datas' : 'Marcar indisponível'}
          </button>
        </>
      }
    >
      <form id={ids.form} onSubmit={porNoRascunho} noValidate className="flex flex-col gap-3">
        {periodoId === null && pessoas.length > 1 && (
          <div>
            <p className="text-xs font-semibold text-slate-700">
              {comPlural(ativas.length, 'pessoa', 'pessoas')}
            </p>
            <ul className="mt-1 flex max-h-28 flex-wrap gap-1 overflow-y-auto">
              {ativas.map((p) => (
                <li
                  key={p.id}
                  className="rounded border border-slate-300 bg-slate-50 px-1.5 text-xs leading-5"
                >
                  {p.nomeCurto}
                </li>
              ))}
            </ul>
          </div>
        )}
        {foram > 0 && (
          <p className="text-xs text-slate-600">
            {comPlural(foram, 'pessoa já saiu', 'pessoas já saíram')} da empresa e não{' '}
            {foram === 1 ? 'entra' : 'entram'}.
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={ids.inicio} className="text-sm font-medium text-slate-800">
              De (primeiro dia fora)
            </label>
            <input
              id={ids.inicio}
              type="date"
              data-foco-inicial
              required
              value={inicio}
              onChange={(e) => {
                setInicio(e.target.value);
                setErroServidor([]);
              }}
              className={`${CLASSE_CAMPO} w-full`}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <label htmlFor={ids.fim} className="text-sm font-medium text-slate-800">
              Até (último dia fora)
            </label>
            <input
              id={ids.fim}
              type="date"
              value={semData ? '' : fimEscolhido}
              min={eDia(inicio) ? inicio : undefined}
              disabled={semData}
              onChange={(e) => {
                setFimEscolhido(e.target.value);
                setErroServidor([]);
              }}
              aria-describedby={mostrarErros && problemas.length > 0 ? ids.erros : undefined}
              className={`${CLASSE_CAMPO} w-full`}
            />
          </div>
        </div>
        <label htmlFor={ids.sem} className="flex cursor-pointer items-center gap-2 text-sm text-slate-800">
          <input
            id={ids.sem}
            type="checkbox"
            checked={semData}
            onChange={(e) => {
              setSemData(e.target.checked);
              setErroServidor([]);
            }}
            className={`size-4 accent-slate-800 ${FOCO_VISIVEL}`}
          />
          Sem data de regresso
        </label>
        <div id={ids.erros} role="alert" className="empty:hidden">
          {mostrarErros && problemas.length > 0 && (
            <ul className="flex flex-col gap-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-sm text-red-900">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
              {frases.length > 0 && (
                <li>Os períodos não se podem sobrepor: muda as datas ou o outro período.</li>
              )}
            </ul>
          )}
          {avisado && (
            <p className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-sm text-amber-900">
              {aviso} Carrega outra vez para marcar na mesma.
            </p>
          )}
          {erroServidor.length > 0 && (
            <ul className="flex flex-col gap-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-sm text-red-900">
              {erroServidor.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>
        <p className="text-xs text-slate-600">
          Na carrinha o lugar fica livre enquanto estiver fora; na casa a cama continua ocupada. Um período
          mais antigo do que 30 dias que se sobreponha é recusado ao guardar.
        </p>
      </form>
    </Dialogo>
  );
}
