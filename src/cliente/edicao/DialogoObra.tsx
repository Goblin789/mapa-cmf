// Nova obra / editar obra (M2, docs/m2.md, "Obras"): nome, cliente, morada e posição (CampoMorada:
// geocodificação no servidor ou clique no mini-mapa) e estacionamento (opcional). Criar = um passo com
// 'registo' do local (tipo 'obra') e da obra (origem 'manual'); apagar só sem pessoas (ou tirando-as no
// mesmo passo). Tudo no rascunho.
// CONTRATO DO M2: o módulo Obras implementa (este ficheiro é dele).
//
// - abrirObra(null, posicao?) cria (a posição vem do "Nova obra aqui" do mapa); abrirObra(id) edita.
// - Os passos montam-se em passosObra.ts e validam-se com validarOperacoes sobre o estado visível antes de
//   entrarem no rascunho (as frases dos erros aparecem no diálogo, com role=alert). Ctrl+Z desfaz o passo.
// - No fim de criar, a obra nova fica em foco (a ficha abre na vista onde se está; no Mapa, o mapa vai lá).
// - ConfirmarApagarObra: a confirmação do "Apagar obra…" da ficha da obra.

import { type FormEvent, useId, useMemo, useState } from 'react';
import { validarOperacoes } from '../../dominio/operacoes';
import type { Id, Local } from '../../dominio/tipos';
import { CampoMorada } from '../comum/CampoMorada';
import { MORADA_VAZIA, type ValorMorada } from '../comum/morada';
import { useLoja } from '../estado/loja';
import { FOCO_VISIVEL } from '../paineis/classes';
import { comPlural } from '../paineis/textos';
import { mostrarElemento } from '../vistas/mostrar';
import { BOTAO_PERIGO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import {
  clientesDeObras,
  type DadosObra,
  dadosDaObra,
  descreverLocalApagar,
  limparNome,
  passoApagarObra,
  passoCriarObra,
  passoEditarObra,
  resumoApagarObra,
  tituloApagarObra,
  usosDoLocal,
} from './passosObra';
import { type PosicaoMapa, useUiEdicao } from './ui';

function dadosIniciais(posicao: PosicaoMapa | null): DadosObra {
  return {
    nome: '',
    clienteId: null,
    morada: { ...MORADA_VAZIA, lat: posicao?.lat ?? null, lng: posicao?.lng ?? null },
    estacionamento: null,
  };
}

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

export function DialogoObra({
  obraId,
  posicao,
  aoFechar,
}: {
  obraId: Id | null;
  posicao: PosicaoMapa | null;
  aoFechar: () => void;
}) {
  const estado = useLoja((s) => s.estado);
  const obra = obraId !== null ? estado?.obras.find((o) => o.id === obraId) : undefined;
  // O que o diálogo tinha ao abrir: ao editar, só vai para o rascunho o que a pessoa mudou face a isto (uma
  // mudança de outra pessoa que chegue entretanto pelo tempo real não se desfaz).
  const [iniciais] = useState<DadosObra>(() =>
    estado && obra ? dadosDaObra(estado, obra) : dadosIniciais(posicao),
  );
  const [dados, setDados] = useState<DadosObra>(iniciais);
  const [erros, setErros] = useState<string[]>([]);
  const idForm = useId();
  const idNome = useId();
  const idCliente = useId();
  const idEstacionamento = useId();
  const criar = obraId === null;

  const clientes = useMemo(() => {
    if (!estado) return [];
    const lista = clientesDeObras(estado);
    // A obra a editar pode ter um cliente que já não é escolhível (não devia acontecer): fica na lista.
    const atual = obra ? estado.clientes.find((c) => c.id === obra.clienteId) : undefined;
    return atual && !lista.some((c) => c.id === atual.id) ? [atual, ...lista] : lista;
  }, [estado, obra]);

  // A morada da obra que se edita é partilhada com outros (casas, outras obras)? Muda para todos.
  const partilhada = useMemo(
    () => (estado && obra ? usosDoLocal(estado, obra.localId, new Set([obra.id])) : []),
    [estado, obra],
  );

  if (!estado || (!criar && !obra)) {
    return (
      <Dialogo
        titulo="Obra"
        aoFechar={aoFechar}
        rodape={
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Fechar
          </button>
        }
      >
        <p className="text-sm text-slate-700">Esta obra já não existe.</p>
      </Dialogo>
    );
  }

  const mudar = (mudanca: Partial<DadosObra>) => setDados((d) => ({ ...d, ...mudanca }));

  const submeter = (e: FormEvent) => {
    e.preventDefault();
    const { aplicar, estado: visivel } = useLoja.getState();
    if (!visivel) return;
    const { avisar } = useUiEdicao.getState();
    const nome = limparNome(dados.nome);
    if (criar) {
      const r = passoCriarObra(visivel, dados);
      if (r.ops === null) return setErros(r.erros);
      const invalidos = validarOperacoes(visivel, r.ops);
      if (invalidos.length > 0) return setErros(invalidos);
      aplicar(r.ops);
      aoFechar();
      // Primeiro o foco e só depois o aviso: no Quadro por casas ou carrinhas, mostrar uma obra sem ninguém
      // avisa "ninguém trabalha nesta obra", e o aviso é um só (a confirmação e o Ctrl+Z ficam por cima).
      if (r.obraId) mostrarElemento({ tipo: 'obra', id: r.obraId }, { noMapa: 'ir' });
      avisar(`Obra criada: ${nome} (por guardar). Ctrl+Z desfaz.`);
      return;
    }
    if (!obraId) return;
    const r = passoEditarObra(visivel, obraId, dados, iniciais);
    if (r.ops === null) return setErros(r.erros);
    if (r.ops.length === 0) {
      aoFechar();
      avisar('Nada mudou na obra.');
      return;
    }
    const invalidos = validarOperacoes(visivel, r.ops);
    if (invalidos.length > 0) return setErros(invalidos);
    aplicar(r.ops);
    aoFechar();
    avisar(`Obra mudada: ${nome} (por guardar). Ctrl+Z desfaz.`);
  };

  const comEstacionamento = dados.estacionamento !== null;
  return (
    <Dialogo
      titulo={criar ? 'Nova obra' : `Editar a obra ${obra?.nome ?? ''}`}
      descricao={
        criar
          ? 'Fica no rascunho: só é gravada quando carregares em Guardar.'
          : 'As mudanças ficam no rascunho até carregares em Guardar.'
      }
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Cancelar
          </button>
          <button type="submit" form={idForm} className={BOTAO_PRIMARIO}>
            {criar ? 'Criar obra' : 'Mudar a obra'}
          </button>
        </>
      }
    >
      <form id={idForm} onSubmit={submeter} noValidate className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <label htmlFor={idNome} className="flex min-w-0 flex-[2_1_12rem] flex-col gap-0.5 text-sm">
            <span className="text-xs font-medium text-slate-700">Nome da obra</span>
            <input
              id={idNome}
              type="text"
              data-foco-inicial
              required
              maxLength={80}
              autoComplete="off"
              value={dados.nome}
              onChange={(e) => mudar({ nome: e.target.value })}
              className={`h-9 rounded-md border border-slate-300 px-2 text-base sm:text-sm ${FOCO_VISIVEL}`}
            />
          </label>
          <label htmlFor={idCliente} className="flex min-w-0 flex-[1_1_10rem] flex-col gap-0.5 text-sm">
            <span className="text-xs font-medium text-slate-700">Cliente</span>
            <select
              id={idCliente}
              required
              value={dados.clienteId ?? ''}
              onChange={(e) => mudar({ clienteId: e.target.value || null })}
              className={`h-9 rounded-md border border-slate-300 bg-white px-2 ${FOCO_VISIVEL}`}
            >
              <option value="">Escolhe o cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        <CampoMorada
          rotulo="Morada e sítio da obra"
          valor={dados.morada}
          moradaDoPinoAoAbrir={criar}
          aoMudar={(morada: ValorMorada) => mudar({ morada })}
        />
        {partilhada.length > 0 && (
          <p className="-mt-1 text-xs text-amber-800">
            Esta morada também é de: {partilhada.join(', ')}. Mudá-la muda-a para todos.
          </p>
        )}

        <label htmlFor={idEstacionamento} className="flex items-center gap-2 text-sm">
          <input
            id={idEstacionamento}
            type="checkbox"
            checked={comEstacionamento}
            onChange={(e) =>
              mudar({
                estacionamento: e.target.checked ? { ...MORADA_VAZIA, pais: dados.morada.pais } : null,
              })
            }
            className={`size-4 ${FOCO_VISIVEL}`}
          />
          Tem estacionamento noutro sítio
        </label>
        {dados.estacionamento && (
          <CampoMorada
            rotulo="Estacionamento"
            valor={dados.estacionamento}
            centroInicial={
              dados.morada.lat !== null && dados.morada.lng !== null
                ? { lat: dados.morada.lat, lng: dados.morada.lng }
                : null
            }
            aoMudar={(estacionamento: ValorMorada) => mudar({ estacionamento })}
          />
        )}
        <Erros erros={erros} />
      </form>
    </Dialogo>
  );
}

/**
 * "Apagar obra…" (ficha da obra, modo de edição): diz o que vai acontecer (quem passa para "sem obra", que
 * moradas se apagam e quais ficam) e, confirmado, junta UM passo ao rascunho (Ctrl+Z desfaz).
 */
export function ConfirmarApagarObra({ obraId, aoFechar }: { obraId: Id; aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const obra = estado?.obras.find((o) => o.id === obraId);
  const resumo = estado ? resumoApagarObra(estado, obraId) : null;
  const [erros, setErros] = useState<string[]>([]);
  if (!estado || !obra || !resumo) return null;

  const apagar = () => {
    const { estado: visivel, aplicar, definirFoco } = useLoja.getState();
    if (!visivel) return;
    const ops = passoApagarObra(visivel, obraId);
    if (!ops) return setErros(['Esta obra já não existe.']);
    const invalidos = validarOperacoes(visivel, ops);
    if (invalidos.length > 0) return setErros(invalidos);
    aplicar(ops);
    definirFoco(null);
    aoFechar();
    useUiEdicao.getState().avisar(`Obra apagada: ${obra.nome} (por guardar). Ctrl+Z desfaz.`);
  };

  const descrever = (locais: readonly Local[]) => locais.map(descreverLocalApagar).join(' e ');
  return (
    <Dialogo
      titulo={tituloApagarObra(obra.nome)}
      alerta
      largura="estreito"
      aoFechar={aoFechar}
      rodape={
        <>
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Não apagar
          </button>
          <button type="button" onClick={apagar} className={BOTAO_PERIGO}>
            Apagar a obra
          </button>
        </>
      }
    >
      <ul className="list-disc space-y-1 pl-4 text-sm text-slate-800">
        <li>
          {resumo.pessoas === 0
            ? 'Ninguém trabalha nesta obra.'
            : `${comPlural(resumo.pessoas, 'pessoa passa', 'pessoas passam')} para "sem obra" (cada uma volta à cor do seu cliente).`}
        </li>
        {resumo.locaisApagados.length > 0 && (
          <li>
            {resumo.locaisApagados.length === 1 ? 'Apaga-se também' : 'Apagam-se também'}{' '}
            {descrever(resumo.locaisApagados)}.
          </li>
        )}
        {resumo.locaisQueFicam.length > 0 && (
          <li>
            {resumo.locaisQueFicam.length === 1 ? 'Fica' : 'Ficam'} {descrever(resumo.locaisQueFicam)} (veio
            dos dados iniciais ou tem outros usos).
          </li>
        )}
        <li>Fica no rascunho até carregares em Guardar; Ctrl+Z desfaz.</li>
      </ul>
      <Erros erros={erros} />
    </Dialogo>
  );
}
