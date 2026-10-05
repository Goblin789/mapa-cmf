// Nova casa (pedido do Rafael, 05/10/2026: "em 'novo' devia ter nova casa e nova obra também e haver maneira
// de as remover também"): nome, morada (uma que já existe — um local de casas, ex.: Himeling, onde já há
// quatro — ou uma morada nova com o CampoMorada das obras: procurar e/ou pino no mini-mapa; com o serviço de
// moradas desligado o pino chega), apartamento (opcional), lotação e, opcionais, o máx. do contrato e o
// tolerado (com o aviso quando o tolerado fica abaixo do máximo). Os "lugares iguais aos moradores" não se
// mostram (uma casa nova não os tem). Criar = UM passo do rascunho (o local, se for novo, e a casa); Ctrl+Z
// desfaz. No fim a casa nova fica em foco (no Mapa, o mapa vai lá).
// - ConfirmarApagarCasa: a confirmação do "Apagar casa…" da ficha da casa (modo de edição). Diz o que impede
//   (ex.: "Tem 3 moradores e a CF 5010 dorme lá.") e oferece, como o "Apagar obra…", tirar no mesmo passo os
//   moradores (ficam "Fora das casas CMF") e as carrinhas que lá dormem (ficam com onde dorme "por
//   definir"). Com problemas por resolver não apaga: diz para os resolver antes.
// Os passos montam-se em passosCasa.ts e validam-se com validarOperacoes antes de entrarem no rascunho.

import { type FormEvent, type ReactNode, useId, useMemo, useState } from 'react';
import { LIMITES } from '../../dominio/campos';
import { validarOperacoes } from '../../dominio/operacoes';
import type { Estado, Id } from '../../dominio/tipos';
import { CampoMorada } from '../comum/CampoMorada';
import { MORADA_VAZIA, type ValorMorada } from '../comum/morada';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { comPlural, ROTULO_FORA_DAS_CASAS } from '../paineis/textos';
import { mostrarElemento } from '../vistas/mostrar';
import { BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import {
  avisoToleradoCasa,
  type DadosCasa,
  opcoesMoradasDeCasas,
  passoApagarCasa,
  passoCriarCasa,
  resumoApagarCasa,
  textoOQueImpede,
  tituloApagarCasa,
} from './passosCasa';
import { limparNome } from './passosObra';
import { useUiEdicao } from './ui';

const CLASSE_CAMPO = `h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-2 text-base sm:text-sm ${FOCO_VISIVEL}`;

const DADOS_INICIAIS: DadosCasa = {
  nome: '',
  morada: { tipo: 'existente', localId: null },
  apartamento: '',
  lotacao: '',
  maxContrato: '',
  tolerado: '',
};

function Erros({ erros }: { erros: readonly string[] }) {
  if (erros.length === 0) return null;
  return (
    <div
      role="alert"
      className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900"
    >
      {erros.length === 1 ? (
        <p>{erros[0]}</p>
      ) : (
        <ul className="list-disc space-y-0.5 pl-4">
          {erros.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Campo({
  id,
  rotulo,
  opcional = false,
  className = '',
  children,
}: {
  id: string;
  rotulo: string;
  opcional?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label htmlFor={id} className={`flex min-w-0 flex-col gap-0.5 text-sm ${className}`}>
      <span className="text-xs font-medium text-slate-700">
        {rotulo}
        {opcional && <span className="font-normal text-slate-500"> (opcional)</span>}
      </span>
      {children}
    </label>
  );
}

/** O que impede criar a casa com estes dados (vazio = pode criar-se). */
function errosDaCasaNova(estado: Estado, dados: DadosCasa): string[] {
  const r = passoCriarCasa(estado, dados);
  return r.ops === null ? r.erros : validarOperacoes(estado, r.ops);
}

export function DialogoNovaCasa({ aoFechar }: { aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const [dados, setDados] = useState<DadosCasa>(DADOS_INICIAIS);
  // A morada nova escrita (ou o pino) não se perde se se espreitar a lista das que já existem.
  const [moradaNova, setMoradaNova] = useState<ValorMorada>(MORADA_VAZIA);
  // Depois de um "Criar casa" recusado, os erros acompanham o que se escreve (somem quando se corrige).
  const [tentou, setTentou] = useState(false);
  const idForm = useId();
  const idNome = useId();
  const idMorada = useId();
  const idApartamento = useId();
  const idLotacao = useId();
  const idMax = useId();
  const idTolerado = useId();
  const idAviso = useId();
  const opcoes = useMemo(() => (estado ? opcoesMoradasDeCasas(estado) : []), [estado]);
  const erros = useMemo(
    () => (tentou && estado ? errosDaCasaNova(estado, dados) : []),
    [tentou, estado, dados],
  );
  if (!estado) return null;

  const mudar = (mudanca: Partial<DadosCasa>) => setDados((d) => ({ ...d, ...mudanca }));
  const escolherNova = (nova: boolean) =>
    mudar({
      morada: nova
        ? { tipo: 'nova', valor: moradaNova }
        : { tipo: 'existente', localId: dados.morada.tipo === 'existente' ? dados.morada.localId : null },
    });

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    const { aplicar, estado: visivel } = useLoja.getState();
    if (!visivel) return;
    const r = passoCriarCasa(visivel, dados);
    if (r.ops === null || validarOperacoes(visivel, r.ops).length > 0) return setTentou(true);
    aplicar(r.ops);
    aoFechar();
    if (r.casaId) mostrarElemento({ tipo: 'casa', id: r.casaId }, { noMapa: 'ir' });
    useUiEdicao.getState().avisar(`Casa criada: ${limparNome(dados.nome)} (por guardar). Ctrl+Z desfaz.`);
  };

  const aviso = avisoToleradoCasa(dados.maxContrato, dados.tolerado);
  const nova = dados.morada.tipo === 'nova';
  const localEscolhido = dados.morada.tipo === 'existente' ? dados.morada.localId : null;
  const escolhida = localEscolhido ? opcoes.find((o) => o.valor === localEscolhido) : undefined;
  const numero = { type: 'text', inputMode: 'numeric', autoComplete: 'off', maxLength: 2 } as const;

  return (
    <Dialogo
      titulo="Nova casa"
      descricao="Fica no rascunho: só é gravada quando carregares em Guardar."
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={idForm} className={BOTAO_PRIMARIO}>
            Criar casa
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={submeter} noValidate className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <Campo id={idNome} rotulo="Nome da casa" className="flex-[2_1_12rem]">
            <input
              id={idNome}
              type="text"
              data-foco-inicial
              required
              maxLength={LIMITES.textoCurto}
              autoComplete="off"
              value={dados.nome}
              onChange={(e) => mudar({ nome: e.target.value })}
              className={CLASSE_CAMPO}
            />
          </Campo>
          <Campo id={idApartamento} rotulo="Apartamento" opcional className="flex-[1_1_8rem]">
            <input
              id={idApartamento}
              type="text"
              maxLength={LIMITES.textoCurto}
              autoComplete="off"
              value={dados.apartamento}
              onChange={(e) => mudar({ apartamento: e.target.value })}
              className={CLASSE_CAMPO}
            />
          </Campo>
        </div>

        <fieldset className="min-w-0">
          <legend className="mb-1 text-xs font-medium text-slate-700">Morada</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${idForm}-morada`}
                checked={!nova}
                onChange={() => escolherNova(false)}
                className={`size-4 ${FOCO_VISIVEL}`}
              />
              Numa morada que já existe
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name={`${idForm}-morada`}
                checked={nova}
                onChange={() => escolherNova(true)}
                className={`size-4 ${FOCO_VISIVEL}`}
              />
              Numa morada nova
            </label>
          </div>
          {dados.morada.tipo === 'existente' ? (
            <div className="mt-2">
              <label htmlFor={idMorada} className="sr-only">
                Morada que já existe
              </label>
              <select
                id={idMorada}
                value={dados.morada.localId ?? ''}
                onChange={(e) => mudar({ morada: { tipo: 'existente', localId: e.target.value || null } })}
                className={CLASSE_CAMPO}
              >
                <option value="">Escolhe a morada…</option>
                {opcoes.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
              {escolhida && escolhida.casas.length > 0 && (
                <p className="mt-1 text-xs text-slate-600">
                  Fica na mesma morada que {escolhida.casas.join(', ')}: mudar a morada de uma muda a de
                  todas.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-2">
              <CampoMorada
                rotulo="Morada e sítio da casa"
                valor={dados.morada.valor}
                aoMudar={(valor: ValorMorada) => {
                  setMoradaNova(valor);
                  mudar({ morada: { tipo: 'nova', valor } });
                }}
              />
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <Campo id={idLotacao} rotulo="Lotação (lugares)" className="flex-[1_1_7rem]">
            <input
              id={idLotacao}
              {...numero}
              required
              value={dados.lotacao}
              onChange={(e) => mudar({ lotacao: e.target.value })}
              className={CLASSE_CAMPO}
            />
          </Campo>
          <Campo id={idMax} rotulo="Máx. do contrato" opcional className="flex-[1_1_7rem]">
            <input
              id={idMax}
              {...numero}
              value={dados.maxContrato}
              aria-describedby={aviso ? idAviso : undefined}
              onChange={(e) => mudar({ maxContrato: e.target.value })}
              className={CLASSE_CAMPO}
            />
          </Campo>
          <Campo id={idTolerado} rotulo="Tolerado" opcional className="flex-[1_1_7rem]">
            <input
              id={idTolerado}
              {...numero}
              value={dados.tolerado}
              aria-describedby={aviso ? idAviso : undefined}
              onChange={(e) => mudar({ tolerado: e.target.value })}
              className={CLASSE_CAMPO}
            />
          </Campo>
        </div>
        {aviso && (
          <p id={idAviso} className="-mt-1 text-xs font-medium text-amber-800">
            {aviso}
          </p>
        )}
        <Erros erros={erros} />
      </form>
    </Dialogo>
  );
}

/**
 * "Apagar casa…" (ficha da casa, modo de edição): diz o que impede apagar sem mais nada e o que o passo faz
 * (quem passa para "Fora das casas CMF", que carrinhas ficam com onde dorme por definir, se a morada se apaga
 * ou fica) e, confirmado, junta UM passo ao rascunho (Ctrl+Z desfaz). Com problemas por resolver só explica.
 */
export function ConfirmarApagarCasa({ casaId, aoFechar }: { casaId: Id; aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const casa = estado?.casas.find((c) => c.id === casaId);
  const resumo = estado ? resumoApagarCasa(estado, casaId) : null;
  const [erros, setErros] = useState<string[]>([]);
  if (!estado || !casa || !resumo) return null;

  const impede = textoOQueImpede(resumo);
  const comProblemas = resumo.problemasAbertos > 0;
  const apagar = () => {
    const { estado: visivel, aplicar, definirFoco } = useLoja.getState();
    if (!visivel) return;
    const ops = passoApagarCasa(visivel, casaId);
    if (!ops) return setErros(['Esta casa já não existe.']);
    const invalidos = validarOperacoes(visivel, ops);
    if (invalidos.length > 0) return setErros(invalidos);
    aplicar(ops);
    definirFoco(null);
    aoFechar();
    useUiEdicao.getState().avisar(`Casa apagada: ${casa.nome} (por guardar). Ctrl+Z desfaz.`);
  };

  const local = resumo.localApagado ?? resumo.localQueFica;
  const morada = local ? local.morada.trim() || local.nome : null;
  const n = resumo.moradores.length;
  return (
    <Dialogo
      titulo={tituloApagarCasa(casa.nome)}
      alerta
      largura="estreito"
      aoFechar={aoFechar}
      rodape={
        comProblemas ? (
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Fechar
          </button>
        ) : (
          <>
            <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
              Não apagar
            </button>
            <button type="button" onClick={apagar} className={BOTAO_PERIGO}>
              {impede ? 'Tirar e apagar a casa' : 'Apagar a casa'}
            </button>
          </>
        )
      }
    >
      {comProblemas ? (
        <p className="text-sm text-slate-800">
          {resumo.problemasAbertos === 1
            ? 'Tem 1 problema por resolver: resolve-o (na ficha da casa) antes de a apagar.'
            : `Tem ${resumo.problemasAbertos} problemas por resolver: resolve-os (na ficha da casa) antes de a apagar.`}
        </p>
      ) : (
        <>
          {impede && <p className="mb-2 text-sm font-medium text-slate-900">{impede}</p>}
          <ul className="list-disc space-y-1 pl-4 text-sm text-slate-800">
            {n > 0 && (
              <li>
                {comPlural(n, 'morador passa', 'moradores passam')} para "{ROTULO_FORA_DAS_CASAS}":{' '}
                {resumo.moradores.map((p) => p.nomeCurto).join(', ')}.
              </li>
            )}
            {resumo.carrinhas.length > 0 && (
              <li>
                {resumo.carrinhas.length === 1
                  ? 'A carrinha fica com onde dorme "por definir".'
                  : 'As carrinhas ficam com onde dormem "por definir".'}
              </li>
            )}
            {resumo.problemasResolvidos > 0 && (
              <li>Os problemas já resolvidos desta casa apagam-se com ela (ficam no histórico).</li>
            )}
            {morada && (
              <li>
                {resumo.localApagado
                  ? `Apaga-se também a morada ${morada}.`
                  : `Fica a morada ${morada} (veio dos dados iniciais ou tem outros usos).`}
              </li>
            )}
            <li>Fica no rascunho até carregares em Guardar; Ctrl+Z desfaz.</li>
          </ul>
        </>
      )}
      <Erros erros={erros} />
    </Dialogo>
  );
}
