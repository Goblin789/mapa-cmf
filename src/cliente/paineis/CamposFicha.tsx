// Editores dos campos das fichas (M2, docs/m2.md, "Fichas editáveis"): no modo de edição cada campo de
// CAMPOS_EDITAVEIS da pessoa, da casa e da carrinha muda-se no sítio. O lápis abre o campo; Enter ou ✓
// aplica (UM passo do rascunho: operacaoCampo sobre o estado VISÍVEL, Ctrl+Z desfaz); Esc ou ✕ cancela.
// Antes de aplicar valida-se com o domínio (validarValorCampo e validarOperacoes, que vê os únicos, o
// tolerado ≥ máx. do contrato…) e o erro fica ao lado do campo (role=alert). Por baixo do que mudou,
// "antes: …" (o `de` da operação 'campo' pendente). Fora do modo de edição as linhas só se leem.
// Peças: CampoFicha (texto, número, sim/não, lista, matrículas), CampoCarta (Tem / Não tem / Não sei e a
// validade, no mesmo passo), CampoMoradaCasa (o LOCAL da casa, com o comum/CampoMorada.tsx do módulo Obras)
// e CampoOutraMorada (a casa passa para outro local já conhecido).
// No telemóvel os campos têm letra de 16 px (o iOS não amplia a página) e partem de linha em vez de
// deslizar de lado.
// Tempo real: cada editor guarda os valores de quando abriu. Se outra pessoa gravar o mesmo campo com ele
// aberto, aparece "Mudou entretanto: agora é X." e o `de` do passo é o valor de quando abriu
// (comDeDeQuandoAbriu): o Guardar dá conflito em vez de escrever por cima em silêncio.

import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  type CampoEditavel,
  type EntidadeEditavel,
  type ValorCampo,
  type ValorDoCampo,
  validarValorCampo,
} from '../../dominio/campos';
import { nomeDoRegisto, operacaoCampo, valoresIguais } from '../../dominio/operacoes';
import type { Casa, Id, Local, Pessoa } from '../../dominio/tipos';
import { CampoMorada, type ValorMorada } from '../comum/CampoMorada';
import { formatarMatricula } from '../comum/Matricula';
import { aplicarComAviso, resumoDoPasso } from '../edicao/acoes';
import { BOTAO_PEQUENO } from '../edicao/classes';
import { IconeLapis } from '../edicao/icones';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from './classes';
import {
  avisoOutraMorada,
  campoPendente,
  comDeDeQuandoAbriu,
  type EditorCampo,
  type EscolhaCarta,
  erroOutrasMatriculas,
  errosDoPasso,
  escolhaCarta,
  lerValorEditado,
  mudouDesdeQueAbriu,
  notaMudouEntretanto,
  opcoesOutraMorada,
  operacoesCarta,
  operacoesMoradaDoLocal,
  teclaDoCampoAberto,
  textoParaEditar,
  type ValoresAoAbrir,
} from './fichas';
import {
  ROTULO_ESCOLHA_CARTA,
  rotuloDoCampo,
  textoAntes,
  textoCarta,
  textoMorada,
  textoValorCampo,
} from './textos';

/** Campos de escrever: 16 px no telemóvel (o iOS amplia a página com menos), 14 px no PC. */
const CLASSE_CAMPO = `min-w-0 rounded border border-slate-400 bg-white px-1.5 py-1 text-base text-slate-900 sm:py-0.5 sm:text-sm ${FOCO_VISIVEL}`;

/** ✓ e ✕ do campo aberto. */
const CLASSE_BOTAO_CAMPO = `inline-flex size-8 shrink-0 items-center justify-center rounded border text-sm font-semibold sm:size-7 ${FOCO_VISIVEL}`;

/** Uma linha "rótulo: valor" da ficha (como a Linha da MolduraFicha), com o rótulo ligado ao campo aberto. */
function LinhaCampo({
  rotulo,
  idCampo,
  children,
}: {
  rotulo: string;
  /** O campo aberto (o rótulo passa a <label>). */
  idCampo?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="w-24 shrink-0 text-xs leading-5 text-slate-600">
        {idCampo ? <label htmlFor={idCampo}>{rotulo}</label> : rotulo}
      </dt>
      <dd className="min-w-0 flex-1 leading-5">{children}</dd>
    </div>
  );
}

/** O lápis que abre o campo (só no modo de edição). */
function BotaoLapis({
  rotulo,
  aoAbrir,
  refBotao,
}: {
  rotulo: string;
  aoAbrir: () => void;
  refBotao: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={refBotao}
      type="button"
      onClick={aoAbrir}
      aria-label={`Mudar: ${rotulo}`}
      title={`Mudar: ${rotulo}`}
      className={`-my-1 ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded align-middle text-slate-500 hover:bg-slate-100 hover:text-slate-900 ${FOCO_VISIVEL}`}
    >
      <IconeLapis className="h-3.5 w-3.5" />
    </button>
  );
}

/** "● antes: 8", por baixo de um campo que mudou no rascunho (o valor gravado). */
function Antes({ children }: { children: ReactNode }) {
  return (
    <span className="block w-full text-xs text-amber-900">
      <span aria-hidden="true">● </span>
      {children}
    </span>
  );
}

/** O "antes: …" de um campo: o `de` da operação 'campo' pendente (só no modo de edição). */
export function AntesDoCampo<E extends EntidadeEditavel>({
  entidade,
  id,
  campo,
}: {
  entidade: E;
  id: Id;
  campo: CampoEditavel<E>;
}) {
  const op = useLoja((s) => (s.modoEdicao ? campoPendente(s.pendentes, entidade, id, campo) : null));
  const estadoServidor = useLoja((s) => s.estadoServidor);
  if (!op || !estadoServidor) return null;
  return <Antes>{textoAntes(estadoServidor, entidade, campo, op.de)}</Antes>;
}

/** O erro do campo (ao lado dele, lido logo pelos leitores de ecrã). */
function ErroDoCampo({ id, erro }: { id: string; erro: string | null }) {
  if (!erro) return null;
  return (
    <MensagemDoCampo id={id} papel="alert" texto={erro} classe="mt-0.5 text-xs font-medium text-red-800">
      <span aria-hidden="true">▲ </span>
      {erro}
    </MensagemDoCampo>
  );
}

/** "Mudou entretanto: agora é X." por baixo do campo aberto, quando outra pessoa gravou o mesmo campo. */
function MudouEntretanto({ texto }: { texto: string | null }) {
  if (!texto) return null;
  return (
    <MensagemDoCampo papel="status" texto={texto} classe="mt-0.5 text-xs font-medium text-amber-900">
      <span aria-hidden="true">● </span>
      {texto}
    </MensagemDoCampo>
  );
}

/** ✓ (aplicar, Enter) e ✕ (cancelar, Esc) do campo aberto. */
function BotoesDoCampo({ aoCancelar }: { aoCancelar: () => void }) {
  return (
    <>
      <button
        type="submit"
        aria-label="Aplicar"
        title="Aplicar (Enter)"
        className={`${CLASSE_BOTAO_CAMPO} border-slate-900 bg-slate-900 text-white hover:bg-slate-700`}
      >
        <span aria-hidden="true">✓</span>
      </button>
      <button
        type="button"
        aria-label="Cancelar"
        title="Cancelar (Esc)"
        onClick={aoCancelar}
        className={`${CLASSE_BOTAO_CAMPO} border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </>
  );
}

/**
 * Teclado do campo aberto (fichas.ts, teclaDoCampoAberto): Esc cancela-o e não chega à ficha (que fechava)
 * nem aos atalhos do modo de edição; Enter numa lista (ou num botão de opção) também aplica, como nos campos
 * de escrever; Ctrl/⌘+Z e Ctrl+Y não chegam aos atalhos (não desfazem o passo anterior com o campo aberto).
 */
function escCancela(aoCancelar: () => void) {
  return (e: KeyboardEvent<HTMLFormElement>) => {
    const alvo = e.target;
    const acao = teclaDoCampoAberto({
      key: e.key,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      altKey: e.altKey,
      emListaOuOpcao:
        alvo instanceof HTMLSelectElement || (alvo instanceof HTMLInputElement && alvo.type === 'radio'),
    });
    if (acao === 'aplicar') {
      e.preventDefault();
      e.currentTarget.requestSubmit();
    } else if (acao === 'reter') {
      e.stopPropagation();
    } else if (acao === 'cancelar') {
      e.preventDefault();
      e.stopPropagation();
      aoCancelar();
    }
  };
}

/**
 * Marca do formulário de um campo aberto: no telemóvel, a ficha da vista cresce enquanto há um aberto
 * (MolduraFicha.tsx), para o campo, o aviso e o erro caberem.
 */
const CAMPO_ABERTO = { 'data-campo-aberto': '' } as const;

/**
 * Uma mensagem por baixo do campo aberto (o aviso enquanto se escreve, o erro): quando aparece ou muda,
 * desliza a ficha até ela (no telemóvel a ficha é baixa e ficava fora da parte à vista).
 */
function MensagemDoCampo({
  id,
  papel,
  texto,
  classe,
  children,
}: {
  id?: string;
  papel: 'alert' | 'status';
  /** O texto da mensagem: quando muda, desliza outra vez até ela. */
  texto: string;
  classe: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLParagraphElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: só quando a mensagem aparece ou muda.
  useEffect(() => {
    ref.current?.scrollIntoView?.({ block: 'nearest' });
  }, [texto]);
  return (
    <p ref={ref} id={id} role={papel} className={classe}>
      {children}
    </p>
  );
}

/**
 * Abrir/fechar um campo: ao abrir o foco vai para o campo (a escolha marcada, nos botões de opção; o texto
 * fica selecionado) e ao fechar volta ao lápis.
 */
function useAberto() {
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const refLapis = useRef<HTMLButtonElement>(null);
  const refForm = useRef<HTMLFormElement>(null);
  const modoEdicao = useLoja((s) => s.modoEdicao);
  // Sair do modo de edição (Guardar, Cancelar) fecha o campo: ao voltar, não reabre com o texto antigo.
  useEffect(() => {
    if (!modoEdicao) {
      setAberto(false);
      setErro(null);
    }
  }, [modoEdicao]);
  useEffect(() => {
    if (!aberto) return;
    const form = refForm.current;
    const alvo =
      form?.querySelector<HTMLElement>('input[type=radio]:checked') ??
      form?.querySelector<HTMLElement>('input, select');
    alvo?.focus();
    if (alvo instanceof HTMLInputElement && alvo.type === 'text') alvo.select();
  }, [aberto]);
  const fechar = () => {
    setAberto(false);
    setErro(null);
    requestAnimationFrame(() => refLapis.current?.focus());
  };
  return { aberto, setAberto, erro, setErro, refLapis, refForm, fechar };
}

/** Quando mostrar a linha fora do modo de edição: sempre, só com valor, ou nunca (só a editar). */
export type ForaDaEdicao = 'sempre' | 'com-valor' | 'nunca';

function temValor(valor: ValorCampo): boolean {
  if (valor === null || valor === '') return false;
  return !Array.isArray(valor) || valor.length > 0;
}

/**
 * Um campo da ficha (texto, número, sim/não, lista, matrícula, outras matrículas).
 * @param valor o valor no estado visível.
 * @param mostrar como aparece o valor (por omissão textoValorCampo: "—", "Sim", dias, nomes…).
 * @param aoEscrever aviso enquanto se escreve (ex.: nome no mapa repetido); não impede aplicar (o domínio
 *   decide).
 * @param nota frase pequena por baixo (ex.: "só o contacto da casa").
 */
export function CampoFicha<E extends EntidadeEditavel, C extends CampoEditavel<E>>({
  entidade,
  id,
  campo,
  editor,
  valor,
  rotulo = rotuloDoCampo(entidade, campo),
  mostrar,
  foraDaEdicao = 'com-valor',
  nota,
  aoEscrever,
  tipoTeclado,
}: {
  entidade: E;
  id: Id;
  campo: C;
  editor: EditorCampo;
  valor: ValorDoCampo<E, C>;
  rotulo?: string;
  mostrar?: ReactNode;
  foraDaEdicao?: ForaDaEdicao;
  nota?: ReactNode;
  aoEscrever?: (texto: string) => string | null;
  /** O teclado do telemóvel (inputMode): 'tel' no telefone; os números já levam 'numeric'. */
  tipoTeclado?: 'tel' | 'text';
}) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const estado = useLoja((s) => s.estado);
  const { aberto, setAberto, erro, setErro, refLapis, refForm, fechar } = useAberto();
  const [texto, setTexto] = useState('');
  // O valor de quando o editor abriu (tempo real: comDeDeQuandoAbriu).
  const [aoAbrir, setAoAbrir] = useState<ValorCampo>(null);
  const idCampo = useId();
  const idErro = useId();
  const v = (valor ?? null) as ValorCampo;
  if (!estado) return null;
  if (!modoEdicao && (foraDaEdicao === 'nunca' || (foraDaEdicao === 'com-valor' && !temValor(v)))) {
    return null;
  }
  const valorVisivel = mostrar ?? (temValor(v) ? textoValorCampo(estado, entidade, campo, v) : <SemValor />);

  if (!modoEdicao || !aberto) {
    return (
      <LinhaCampo rotulo={rotulo}>
        <span className="break-words">{valorVisivel}</span>
        {modoEdicao && (
          <BotaoLapis
            rotulo={rotulo}
            refBotao={refLapis}
            aoAbrir={() => {
              setTexto(textoParaEditar(editor, v, formatarMatricula));
              setAoAbrir(v);
              setErro(null);
              setAberto(true);
            }}
          />
        )}
        {nota && <span className="block text-xs text-slate-600">{nota}</span>}
        <AntesDoCampo entidade={entidade} id={id} campo={campo} />
      </LinhaCampo>
    );
  }

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    const atual = useLoja.getState().estado;
    if (!atual) return;
    const lido = lerValorEditado(editor, texto);
    if ('erro' in lido) {
      setErro(`${rotulo}: ${lido.erro}`);
      return;
    }
    const erroValor =
      validarValorCampo(entidade, campo, lido.valor) ??
      (entidade === 'carrinha' && campo === 'matriculasAlternativas' && Array.isArray(lido.valor)
        ? erroOutrasMatriculas(atual, id, lido.valor)
        : null);
    if (erroValor) {
      setErro(erroValor);
      return;
    }
    const calculada = operacaoCampo(atual, entidade, id, campo, lido.valor as ValorDoCampo<E, C>);
    if (!calculada) {
      fechar();
      return;
    }
    const ops = comDeDeQuandoAbriu([calculada], { [campo]: aoAbrir });
    const erros = errosDoPasso(atual, entidade, id, ops);
    if (erros.length > 0) {
      setErro(erros.join(' '));
      return;
    }
    aplicarComAviso(ops);
    fechar();
  };
  const aviso = aoEscrever?.(texto) ?? null;
  const mudou = valoresIguais(aoAbrir, v)
    ? null
    : notaMudouEntretanto(textoValorCampo(estado, entidade, campo, v));
  const propsComuns = {
    id: idCampo,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': erro ? idErro : undefined,
    className: `${CLASSE_CAMPO} flex-1 basis-32`,
  } as const;

  return (
    <LinhaCampo rotulo={rotulo} idCampo={idCampo}>
      <form
        {...CAMPO_ABERTO}
        ref={refForm}
        onSubmit={aplicar}
        onKeyDown={escCancela(fechar)}
        className="flex flex-wrap items-center gap-1"
      >
        {editor.tipo === 'escolha' || editor.tipo === 'simNao' ? (
          <select {...propsComuns} value={texto} onChange={(e) => setTexto(e.target.value)}>
            {texto === '' && <option value="">— escolher —</option>}
            {(editor.tipo === 'simNao'
              ? [
                  { valor: 'sim', rotulo: 'Sim' },
                  { valor: 'nao', rotulo: 'Não' },
                ]
              : editor.opcoes
            ).map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        ) : (
          <input
            {...propsComuns}
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            inputMode={editor.tipo === 'inteiro' ? 'numeric' : (tipoTeclado ?? 'text')}
            autoCapitalize={
              editor.tipo === 'matricula' || editor.tipo === 'matriculas' ? 'characters' : undefined
            }
            autoComplete="off"
            spellCheck={false}
            maxLength={editor.tipo === 'texto' ? editor.max : undefined}
            placeholder={editor.tipo === 'matriculas' ? 'separadas por vírgulas' : undefined}
          />
        )}
        <BotoesDoCampo aoCancelar={fechar} />
      </form>
      <MudouEntretanto texto={mudou} />
      {aviso && (
        <MensagemDoCampo papel="status" texto={aviso} classe="mt-0.5 text-xs font-medium text-amber-900">
          {aviso}
        </MensagemDoCampo>
      )}
      <ErroDoCampo id={idErro} erro={erro} />
      {nota && <span className="block text-xs text-slate-600">{nota}</span>}
      <AntesDoCampo entidade={entidade} id={id} campo={campo} />
    </LinhaCampo>
  );
}

/** Valor em falta ("—"), discreto. */
function SemValor() {
  return (
    <span className="text-slate-500">
      <span aria-hidden="true">—</span>
      <span className="sr-only">sem dados</span>
    </span>
  );
}

/**
 * A carta: Tem / Não tem / Não sei e, com "Tem", a validade (dia). "Não tem" e "Não sei" limpam a validade
 * no mesmo passo (operacoesCarta). A validade compara com o dia de hoje no Luxemburgo (loja.hoje).
 */
export function CampoCarta({ pessoa }: { pessoa: Pessoa }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const hoje = useLoja((s) => s.hoje);
  const { aberto, setAberto, erro, setErro, refLapis, refForm, fechar } = useAberto();
  const [escolha, setEscolha] = useState<EscolhaCarta>('nao-sei');
  const [validade, setValidade] = useState('');
  const [aoAbrir, setAoAbrir] = useState<ValoresAoAbrir>({});
  const idGrupo = useId();
  const idValidade = useId();
  const idErro = useId();
  const servidor = useLoja((s) =>
    s.modoEdicao &&
    (campoPendente(s.pendentes, 'pessoa', pessoa.id, 'temCarta') ||
      campoPendente(s.pendentes, 'pessoa', pessoa.id, 'cartaValidade'))
      ? s.estadoServidor?.pessoas.find((p) => p.id === pessoa.id)
      : undefined,
  );
  const texto = textoCarta(pessoa, hoje);
  const antes = servidor ? <Antes>antes: {textoCarta(servidor, hoje)}</Antes> : null;

  if (!modoEdicao || !aberto) {
    return (
      <LinhaCampo rotulo="Carta">
        {pessoa.temCarta === null ? <span className="text-slate-600 italic">{texto}</span> : texto}
        {modoEdicao && (
          <BotaoLapis
            rotulo="carta"
            refBotao={refLapis}
            aoAbrir={() => {
              setEscolha(escolhaCarta(pessoa.temCarta));
              setValidade(pessoa.cartaValidade ?? '');
              setAoAbrir({ temCarta: pessoa.temCarta, cartaValidade: pessoa.cartaValidade });
              setErro(null);
              setAberto(true);
            }}
          />
        )}
        {antes}
      </LinhaCampo>
    );
  }

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    const atual = useLoja.getState().estado;
    if (!atual) return;
    if (escolha === 'tem' && validade !== '') {
      const erroDia = validarValorCampo('pessoa', 'cartaValidade', validade);
      if (erroDia) {
        setErro(erroDia);
        return;
      }
    }
    const ops = comDeDeQuandoAbriu(operacoesCarta(atual, pessoa.id, escolha, validade), aoAbrir);
    if (ops.length === 0) {
      fechar();
      return;
    }
    const erros = errosDoPasso(atual, 'pessoa', pessoa.id, ops);
    if (erros.length > 0) {
      setErro(erros.join(' '));
      return;
    }
    aplicarComAviso(ops);
    fechar();
  };
  const mudou = mudouDesdeQueAbriu(aoAbrir, {
    temCarta: pessoa.temCarta,
    cartaValidade: pessoa.cartaValidade,
  })
    ? notaMudouEntretanto(texto)
    : null;

  return (
    <LinhaCampo rotulo="Carta">
      <form
        {...CAMPO_ABERTO}
        ref={refForm}
        onSubmit={aplicar}
        onKeyDown={escCancela(fechar)}
        className="space-y-1"
      >
        <fieldset aria-labelledby={idGrupo} className="flex flex-wrap gap-x-3 gap-y-1">
          <legend id={idGrupo} className="sr-only">
            Carta de condução
          </legend>
          {(Object.keys(ROTULO_ESCOLHA_CARTA) as EscolhaCarta[]).map((opcao) => (
            <label key={opcao} className="inline-flex min-h-7 items-center gap-1.5 text-sm">
              <input
                type="radio"
                name={idGrupo}
                value={opcao}
                checked={escolha === opcao}
                onChange={() => setEscolha(opcao)}
                className={`size-4 ${FOCO_VISIVEL}`}
              />
              {ROTULO_ESCOLHA_CARTA[opcao]}
            </label>
          ))}
        </fieldset>
        {escolha === 'tem' && (
          <span className="flex flex-wrap items-center gap-1.5">
            <label htmlFor={idValidade} className="text-xs text-slate-700">
              Válida até
            </label>
            <input
              id={idValidade}
              type="date"
              value={validade}
              onChange={(e) => setValidade(e.target.value)}
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? idErro : undefined}
              className={`${CLASSE_CAMPO} w-40`}
            />
            {validade !== '' && validade < hoje && (
              <span className="text-xs font-medium text-red-800">já caducou</span>
            )}
          </span>
        )}
        {escolha !== 'tem' && pessoa.cartaValidade && (
          <span className="block text-xs text-slate-600">A validade da carta deixa de estar guardada.</span>
        )}
        <span className="flex gap-1">
          <BotoesDoCampo aoCancelar={fechar} />
        </span>
      </form>
      <MudouEntretanto texto={mudou} />
      <ErroDoCampo id={idErro} erro={erro} />
      {antes}
    </LinhaCampo>
  );
}

/**
 * A morada de uma casa: edita o LOCAL (morada, país e posição) num só passo. Quando o local é partilhado
 * por outras casas (Himeling), avisa que também muda para elas.
 */
export function CampoMoradaCasa({ casa, local, outras }: { casa: Casa; local: Local; outras: Casa[] }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const { aberto, setAberto, erro, setErro, refLapis, refForm, fechar } = useAberto();
  const [valor, setValor] = useState<ValorMorada>({ morada: '', pais: 'LU', lat: null, lng: null });
  const [aoAbrir, setAoAbrir] = useState<ValoresAoAbrir>({});
  const idErro = useId();
  // Um seletor por campo: devolvem a operação guardada na loja (a mesma referência), não uma lista nova
  // (uma lista nova a cada leitura fazia o React redesenhar sem fim).
  const opMorada = useLoja((s) =>
    s.modoEdicao ? campoPendente(s.pendentes, 'local', local.id, 'morada') : null,
  );
  const opPais = useLoja((s) =>
    s.modoEdicao ? campoPendente(s.pendentes, 'local', local.id, 'pais') : null,
  );
  const opLat = useLoja((s) => (s.modoEdicao ? campoPendente(s.pendentes, 'local', local.id, 'lat') : null));
  const opLng = useLoja((s) => (s.modoEdicao ? campoPendente(s.pendentes, 'local', local.id, 'lng') : null));
  const estadoServidor = useLoja((s) => s.estadoServidor);
  const antes =
    estadoServidor && (opMorada || opPais) ? (
      <Antes>
        antes:{' '}
        {textoMorada({
          morada: String(opMorada ? (opMorada.de ?? '') : local.morada),
          pais: (opPais?.de ?? local.pais) as Local['pais'],
          nome: local.nome,
        })}
      </Antes>
    ) : opLat || opLng ? (
      <Antes>pino mudado de sítio</Antes>
    ) : null;
  const tambem =
    outras.length > 0 ? (
      <span className="block text-xs font-medium text-amber-900">
        Também muda para: {outras.map((c) => c.nome).join(', ')}
      </span>
    ) : null;

  if (!modoEdicao || !aberto) {
    return (
      <LinhaCampo rotulo="Morada">
        <span className="break-words">{local.morada.trim() ? textoMorada(local) : <SemValor />}</span>
        {modoEdicao && (
          <BotaoLapis
            rotulo="morada"
            refBotao={refLapis}
            aoAbrir={() => {
              setValor({ morada: local.morada, pais: local.pais, lat: local.lat, lng: local.lng });
              setAoAbrir({ morada: local.morada, pais: local.pais, lat: local.lat, lng: local.lng });
              setErro(null);
              setAberto(true);
            }}
          />
        )}
        {modoEdicao && outras.length > 0 && (
          <span className="block text-xs text-slate-600">
            Morada partilhada com {outras.map((c) => c.nome).join(', ')}.
          </span>
        )}
        {antes}
        <AntesDoCampo entidade="casa" id={casa.id} campo="localId" />
        {modoEdicao && <CampoOutraMorada casa={casa} />}
      </LinhaCampo>
    );
  }

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    const atual = useLoja.getState().estado;
    if (!atual) return;
    const ops = comDeDeQuandoAbriu(operacoesMoradaDoLocal(atual, local.id, valor), aoAbrir);
    for (const op of ops) {
      const erroValor = validarValorCampo('local', op.campo as CampoEditavel<'local'>, op.para);
      if (erroValor) {
        setErro(erroValor);
        return;
      }
    }
    if (ops.length === 0) {
      fechar();
      return;
    }
    const erros = errosDoPasso(atual, 'local', local.id, ops);
    if (erros.length > 0) {
      setErro(erros.join(' '));
      return;
    }
    // O aviso fala desta casa (e das outras na mesma morada), não da 1.ª casa do local.
    const resumo = resumoDoPasso(atual, ops);
    const prefixo = `${nomeDoRegisto(atual, 'local', local.id)} — `;
    const quem = outras.length > 0 ? `${casa.nome} (e ${outras.map((c) => c.nome).join(', ')})` : casa.nome;
    aplicarComAviso(ops, resumo.startsWith(prefixo) ? `${quem} — ${resumo.slice(prefixo.length)}` : resumo);
    fechar();
  };
  const moradaAgora = { morada: local.morada, pais: local.pais };
  const mudou = mudouDesdeQueAbriu(aoAbrir, { ...moradaAgora, lat: local.lat, lng: local.lng })
    ? mudouDesdeQueAbriu({ morada: aoAbrir.morada ?? null, pais: aoAbrir.pais ?? null }, moradaAgora)
      ? notaMudouEntretanto(textoMorada(local))
      : 'Mudou entretanto: o pino mudou de sítio.'
    : null;

  return (
    <LinhaCampo rotulo="Morada">
      {/* O CampoMorada é do módulo Obras: a letra dos campos dele também fica com 16 px no telemóvel. */}
      <form
        {...CAMPO_ABERTO}
        ref={refForm}
        onSubmit={aplicar}
        onKeyDown={escCancela(fechar)}
        className="space-y-1 [&_input]:text-base sm:[&_input]:text-sm [&_select]:text-base sm:[&_select]:text-sm"
      >
        <CampoMorada valor={valor} aoMudar={setValor} rotulo="Morada da casa" />
        {tambem}
        <span className="flex gap-1">
          <BotoesDoCampo aoCancelar={fechar} />
        </span>
      </form>
      <MudouEntretanto texto={mudou} />
      <ErroDoCampo id={idErro} erro={erro} />
      {antes}
    </LinhaCampo>
  );
}

/**
 * "Mudar para outra morada…": a casa passa para outro local já conhecido (campo casa.localId). Mostra os
 * locais das casas (os sítios onde há ou houve casas), pelo nome, com as casas que já lá estão, e avisa
 * antes de aplicar que passa a partilhar a morada com elas.
 */
export function CampoOutraMorada({ casa }: { casa: Casa }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const estado = useLoja((s) => s.estado);
  const { aberto, setAberto, erro, setErro, refLapis, refForm, fechar } = useAberto();
  const [escolhido, setEscolhido] = useState('');
  const [aoAbrir, setAoAbrir] = useState<Id>(casa.localId);
  const idCampo = useId();
  const idErro = useId();
  const idAviso = useId();
  if (!modoEdicao || !estado) return null;
  const opcoes = opcoesOutraMorada(estado, casa);

  if (!aberto) {
    return (
      <span className="mt-1 block">
        <button
          ref={refLapis}
          type="button"
          disabled={opcoes.length === 0}
          onClick={() => {
            setEscolhido('');
            setAoAbrir(casa.localId);
            setErro(null);
            setAberto(true);
          }}
          className={BOTAO_PEQUENO}
        >
          Mudar para outra morada…
        </button>
      </span>
    );
  }

  const aplicar = (e: FormEvent) => {
    e.preventDefault();
    const atual = useLoja.getState().estado;
    if (!atual) return;
    if (!escolhido) {
      setErro('Escolhe a morada.');
      return;
    }
    const calculada = operacaoCampo(atual, 'casa', casa.id, 'localId', escolhido);
    if (!calculada) {
      fechar();
      return;
    }
    const ops = comDeDeQuandoAbriu([calculada], { localId: aoAbrir });
    const erros = errosDoPasso(atual, 'casa', casa.id, ops);
    if (erros.length > 0) {
      setErro(erros.join(' '));
      return;
    }
    aplicarComAviso(ops);
    fechar();
  };
  const aviso = avisoOutraMorada(opcoes.find((o) => o.valor === escolhido));
  const mudou =
    aoAbrir === casa.localId
      ? null
      : notaMudouEntretanto(textoValorCampo(estado, 'casa', 'localId', casa.localId));

  return (
    <form
      {...CAMPO_ABERTO}
      ref={refForm}
      onSubmit={aplicar}
      onKeyDown={escCancela(fechar)}
      className="mt-1 space-y-1"
    >
      <label htmlFor={idCampo} className="block text-xs text-slate-700">
        Outra morada para {casa.nome}
      </label>
      <span className="flex flex-wrap items-center gap-1">
        <select
          id={idCampo}
          value={escolhido}
          onChange={(e) => {
            setEscolhido(e.target.value);
            setErro(null);
          }}
          aria-invalid={erro ? true : undefined}
          aria-describedby={[erro ? idErro : '', aviso ? idAviso : ''].filter(Boolean).join(' ') || undefined}
          className={`${CLASSE_CAMPO} flex-1 basis-32`}
        >
          <option value="">— escolher —</option>
          {opcoes.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
        <BotoesDoCampo aoCancelar={fechar} />
      </span>
      <MudouEntretanto texto={mudou} />
      {aviso && (
        <MensagemDoCampo
          id={idAviso}
          papel="status"
          texto={aviso}
          classe="text-xs font-medium text-amber-900"
        >
          {aviso}
        </MensagemDoCampo>
      )}
      <ErroDoCampo id={idErro} erro={erro} />
    </form>
  );
}
