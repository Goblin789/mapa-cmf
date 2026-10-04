// Nova pessoa (M2, docs/m2.md, "Fichas"): nome e apelidos, nome no mapa (proposto como "Nome A.", a partir
// do 1.º nome e da inicial do último apelido; único), nº (opcional, único), cliente, telefone e carta
// (opcionais) e, se se quiser, a casa e a carrinha. Entra como UM passo do rascunho: a operação 'registo'
// (novoId('pessoa'); sem casa, carrinha nem obra, ativa, sem marcas) e, no mesmo passo, os 'mover' para a
// casa e a carrinha escolhidas. Valida-se o passo com o domínio (validarOperacoes) antes de aplicar. No fim,
// a pessoa nova fica em foco. Abre por abrirNovaPessoa() (o "Novo…" da barra), só no modo de edição.
// CONTRATO DO M2: o módulo Fichas implementa (este ficheiro é dele).

import { type FormEvent, type ReactNode, useId, useMemo, useState } from 'react';
import { LIMITES } from '../../dominio/campos';
import { ocupacaoDaCarrinha, ocupacaoDaCasa } from '../../dominio/ocupacao';
import { novoId } from '../../dominio/operacoes';
import { formatarMatricula } from '../comum/Matricula';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import {
  avisoNomeNoMapa,
  type DadosNovaPessoa,
  type EscolhaCarta,
  errosNovaPessoa,
  linhaDeTexto,
  passoNovaPessoa,
  proporNomeNoMapa,
} from '../paineis/fichas';
import { ROTULO_ESCOLHA_CARTA, ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from '../paineis/textos';
import { mostrarElemento } from '../vistas/mostrar';
import { aplicarComAviso } from './acoes';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';

const CLASSE_CAMPO = `w-full min-w-0 rounded-md border border-slate-400 bg-white px-2 py-1.5 text-base text-slate-900 sm:text-sm ${FOCO_VISIVEL}`;

function Campo({
  rotulo,
  id,
  opcional = false,
  children,
  nota,
}: {
  rotulo: string;
  id: string;
  opcional?: boolean;
  children: ReactNode;
  nota?: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-0.5 block text-xs font-medium text-slate-700">
        {rotulo}
        {opcional && <span className="font-normal text-slate-500"> (opcional)</span>}
      </label>
      {children}
      {nota}
    </div>
  );
}

const DADOS_INICIAIS: DadosNovaPessoa = {
  nome: '',
  apelidos: '',
  nomeNoMapa: '',
  numero: '',
  clienteId: '',
  telefone: '',
  carta: 'nao-sei',
  validade: '',
  casaId: null,
  carrinhaId: null,
};

export function DialogoNovaPessoa({ aoFechar }: { aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const indices = useLoja((s) => s.indices);
  const [dados, setDados] = useState<DadosNovaPessoa>(DADOS_INICIAIS);
  // O nome no mapa segue o nome e os apelidos até ser mudado à mão.
  const [nomeNoMapaMudado, setNomeNoMapaMudado] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [id] = useState(() => novoId('pessoa'));
  const ids = {
    nome: useId(),
    apelidos: useId(),
    nomeNoMapa: useId(),
    numero: useId(),
    cliente: useId(),
    telefone: useId(),
    carta: useId(),
    validade: useId(),
    casa: useId(),
    carrinha: useId(),
    form: useId(),
    aviso: useId(),
  };
  const comparar = useMemo(() => new Intl.Collator('pt', { sensitivity: 'base', numeric: true }).compare, []);
  if (!estado || !indices) return null;

  const mudar = (parcial: Partial<DadosNovaPessoa>) => {
    setDados((d) => {
      const novo = { ...d, ...parcial };
      if (!nomeNoMapaMudado && ('nome' in parcial || 'apelidos' in parcial)) {
        novo.nomeNoMapa = proporNomeNoMapa(novo.nome, novo.apelidos);
      }
      return novo;
    });
    setErros([]);
  };
  const aviso = avisoNomeNoMapa(estado.pessoas, dados.nomeNoMapa, null);
  const clientes = [...estado.clientes].sort((a, b) => a.ordem - b.ordem || comparar(a.nome, b.nome));
  const casas = [...estado.casas].sort((a, b) => a.ordem - b.ordem);
  const carrinhas = [...estado.carrinhas].sort((a, b) => a.ordem - b.ordem);

  const criar = (e?: FormEvent) => {
    e?.preventDefault();
    const atual = useLoja.getState().estado;
    if (!atual) return;
    const problemas = errosNovaPessoa(atual, dados, id);
    if (problemas.length > 0) {
      setErros(problemas);
      return;
    }
    const nome = linhaDeTexto(dados.nomeNoMapa);
    if (!aplicarComAviso(passoNovaPessoa(atual, dados, id), `Nova pessoa: ${nome} (por guardar)`)) return;
    aoFechar();
    // Depois de o diálogo devolver o foco a quem o abriu: a pessoa nova fica em foco (a ficha abre).
    requestAnimationFrame(() => mostrarElemento({ tipo: 'pessoa', id }, { noMapa: 'so-foco' }));
  };

  return (
    <Dialogo
      titulo="Nova pessoa"
      descricao="Entra no rascunho: só fica gravada quando carregares em Guardar."
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={ids.form} className={BOTAO_PRIMARIO}>
            Criar
          </button>
        </>
      }
    >
      <form id={ids.form} onSubmit={criar} noValidate className="grid gap-3 sm:grid-cols-2">
        <Campo rotulo="Nome" id={ids.nome}>
          <input
            id={ids.nome}
            data-foco-inicial
            type="text"
            value={dados.nome}
            maxLength={LIMITES.textoCurto}
            autoComplete="off"
            onChange={(e) => mudar({ nome: e.target.value })}
            className={CLASSE_CAMPO}
          />
        </Campo>
        <Campo rotulo="Apelidos" id={ids.apelidos}>
          <input
            id={ids.apelidos}
            type="text"
            value={dados.apelidos}
            maxLength={LIMITES.textoCurto}
            autoComplete="off"
            onChange={(e) => mudar({ apelidos: e.target.value })}
            className={CLASSE_CAMPO}
          />
        </Campo>
        <Campo
          rotulo="Nome no mapa"
          id={ids.nomeNoMapa}
          nota={
            aviso ? (
              <p id={ids.aviso} role="status" className="mt-0.5 text-xs font-medium text-amber-900">
                {aviso}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-600">Único; aparece nos cartões e nas listas.</p>
            )
          }
        >
          <input
            id={ids.nomeNoMapa}
            type="text"
            value={dados.nomeNoMapa}
            maxLength={LIMITES.textoCurto}
            autoComplete="off"
            aria-describedby={aviso ? ids.aviso : undefined}
            onChange={(e) => {
              setNomeNoMapaMudado(true);
              mudar({ nomeNoMapa: e.target.value });
            }}
            className={CLASSE_CAMPO}
          />
        </Campo>
        <Campo rotulo="Nº" id={ids.numero} opcional>
          <input
            id={ids.numero}
            type="text"
            value={dados.numero}
            maxLength={LIMITES.numero}
            autoComplete="off"
            onChange={(e) => mudar({ numero: e.target.value })}
            className={CLASSE_CAMPO}
          />
        </Campo>
        <Campo rotulo="Cliente" id={ids.cliente}>
          <select
            id={ids.cliente}
            value={dados.clienteId}
            onChange={(e) => mudar({ clienteId: e.target.value })}
            className={CLASSE_CAMPO}
          >
            <option value="">— escolher —</option>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Telefone" id={ids.telefone} opcional>
          <input
            id={ids.telefone}
            type="tel"
            value={dados.telefone}
            maxLength={LIMITES.telefone}
            autoComplete="off"
            onChange={(e) => mudar({ telefone: e.target.value })}
            className={CLASSE_CAMPO}
          />
        </Campo>
        <fieldset className="min-w-0 sm:col-span-2">
          <legend className="mb-0.5 text-xs font-medium text-slate-700">
            Carta de condução <span className="font-normal text-slate-500">(opcional)</span>
          </legend>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {(Object.keys(ROTULO_ESCOLHA_CARTA) as EscolhaCarta[]).map((opcao) => (
              <label key={opcao} className="inline-flex min-h-8 items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name={ids.carta}
                  value={opcao}
                  checked={dados.carta === opcao}
                  onChange={() => mudar({ carta: opcao })}
                  className={`size-4 ${FOCO_VISIVEL}`}
                />
                {ROTULO_ESCOLHA_CARTA[opcao]}
              </label>
            ))}
            {dados.carta === 'tem' && (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <label htmlFor={ids.validade} className="text-xs text-slate-700">
                  válida até
                </label>
                <input
                  id={ids.validade}
                  type="date"
                  value={dados.validade}
                  onChange={(e) => mudar({ validade: e.target.value })}
                  className={`${CLASSE_CAMPO} w-44`}
                />
              </span>
            )}
          </div>
        </fieldset>
        <Campo rotulo="Casa" id={ids.casa} opcional>
          <select
            id={ids.casa}
            value={dados.casaId ?? ''}
            onChange={(e) => mudar({ casaId: e.target.value || null })}
            className={CLASSE_CAMPO}
          >
            <option value="">{ROTULO_FORA_DAS_CASAS}</option>
            {casas.map((c) => {
              const oc = ocupacaoDaCasa(indices, c);
              return (
                <option key={c.id} value={c.id}>
                  {c.nome} · {oc.ocupados}/{oc.lotacao}
                </option>
              );
            })}
          </select>
        </Campo>
        <Campo rotulo="Carrinha" id={ids.carrinha} opcional>
          <select
            id={ids.carrinha}
            value={dados.carrinhaId ?? ''}
            onChange={(e) => mudar({ carrinhaId: e.target.value || null })}
            className={CLASSE_CAMPO}
          >
            <option value="">{ROTULO_SEM_TRANSPORTE}</option>
            {carrinhas.map((c) => {
              const oc = ocupacaoDaCarrinha(indices, c);
              return (
                <option key={c.id} value={c.id}>
                  {formatarMatricula(c.matricula)} · {oc.ocupados}/{oc.lugares}
                </option>
              );
            })}
          </select>
        </Campo>
        {erros.length > 0 && (
          <div
            role="alert"
            className="rounded border border-red-400 bg-red-50 px-2 py-1.5 text-xs text-red-900 sm:col-span-2"
          >
            <p className="font-semibold">Ainda não se pode criar:</p>
            <ul className="list-disc pl-4">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Dialogo>
  );
}
