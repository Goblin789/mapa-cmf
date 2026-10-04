// Ficha da obra (M2, docs/m2.md, "Obras"): "quem vem para esta obra e de onde" — o cliente, a morada, o
// estacionamento, as pessoas da obra agrupadas pela casa e pela carrinha de onde vêm e, no modo de edição,
// "Editar obra…" (DialogoObra) e "Apagar obra" (só sem pessoas, ou tirando-as no mesmo passo).
// CONTRATO DO M2: o módulo Obras implementa (este ficheiro é dele). Montada no PainelFoco (foco 'obra').
//
// - Por casa (pela ordem das casas; "Sem casa" no fim): a casa abre a ficha dela (BotaoFoco) e cada nome
//   (NomeChip, com o "até 12/10" de quem está indisponível) leva a carrinha em que vai. Por baixo, as
//   carrinhas que lá chegam, com quantas pessoas da obra.
// - Recolhida (vista, telemóvel): cliente, nº de pessoas e de casas numa linha; as ações do modo de edição.
// - Modo de edição: "Editar obra…", "Apagar obra…" (confirmação: DialogoObra.tsx, ConfirmarApagarObra) e,
//   com pessoas selecionadas, "Trazer as N selecionadas para aqui" (um passo, como largar no cartão).

import { useState } from 'react';
import type { Indices } from '../../dominio/indices';
import { formatarMatricula } from '../../dominio/matricula';
import type { Id, Obra } from '../../dominio/tipos';
import { NomeChip } from '../comum/NomeChip';
import { entrarEdicaoComAviso, moverComAviso } from '../edicao/acoes';
import { BOTAO_PEQUENO } from '../edicao/classes';
import { ConfirmarApagarObra } from '../edicao/DialogoObra';
import { IconeLapis, IconeMover } from '../edicao/icones';
import { MovimentosPendentes } from '../edicao/PecasFoco';
import { abrirObra } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { obraTemAlteracoes } from '../vistas/realceQuadro';
import { BotaoFoco, Linha, Moldura, Secao, Vazio } from './MolduraFicha';
import { MarcaCliente } from './pecas';
import { carrinhasDaObra, quemVemParaAObra } from './quemVemObra';
import { comPlural, ROTULO_FORA_DAS_CASAS, ROTULO_SEM_TRANSPORTE } from './textos';

/** As ações do modo de edição (também na ficha recolhida). */
function AcoesObra({ obra }: { obra: Obra }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const selecao = useLoja((s) => s.selecao);
  const [apagar, setApagar] = useState(false);
  if (!modoEdicao) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span className="min-w-0 flex-1">Para mudar a obra ou quem lá trabalha:</span>
        <button type="button" onClick={entrarEdicaoComAviso} className={BOTAO_PEQUENO}>
          <IconeLapis className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
    );
  }
  const selecionadas: Id[] = [...selecao];
  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">Mudar</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={() => abrirObra(obra.id)} className={BOTAO_PEQUENO}>
          <IconeLapis className="h-3.5 w-3.5" />
          Editar obra…
        </button>
        {selecionadas.length > 0 && (
          <button
            type="button"
            onClick={() => moverComAviso(selecionadas, { tipo: 'obra', id: obra.id })}
            title="Põe as pessoas selecionadas nesta obra (um passo; Ctrl+Z desfaz)"
            className={BOTAO_PEQUENO}
          >
            <IconeMover className="h-3.5 w-3.5" />
            {selecionadas.length === 1
              ? 'Trazer a selecionada para aqui'
              : `Trazer as ${selecionadas.length} selecionadas para aqui`}
          </button>
        )}
        <button
          type="button"
          onClick={() => setApagar(true)}
          className={`${BOTAO_PEQUENO} text-red-800 hover:bg-red-50`}
        >
          Apagar obra…
        </button>
      </div>
      {selecionadas.length === 0 && (
        <p className="mt-1.5 text-[11px] leading-snug text-slate-600">
          Para trazer pessoas: arrasta-as para o cartão da obra, ou seleciona-as e volta aqui.
        </p>
      )}
      {apagar && <ConfirmarApagarObra obraId={obra.id} aoFechar={() => setApagar(false)} />}
    </div>
  );
}

export function FichaObra({ obra, indices }: { obra: Obra; indices: Indices }) {
  const cliente = indices.clientes.get(obra.clienteId) ?? null;
  const local = indices.locais.get(obra.localId);
  const estacionamento =
    obra.estacionamentoLocalId !== null ? indices.locais.get(obra.estacionamentoLocalId) : undefined;
  const pessoas = indices.trabalhadores.get(obra.id) ?? [];
  const grupos = quemVemParaAObra(obra.id, indices);
  const { carrinhas, semTransporte } = carrinhasDaObra(grupos);
  const nCasas = grupos.filter((g) => g.casa !== null).length;
  // Como o useSitioAlterado, mais a morada e o pino do estacionamento (outro local).
  const alterada = useLoja((s) => s.modoEdicao && obraTemAlteracoes(s.pendentes, obra.id, s.estado));
  const morada = local?.morada.trim() ? local.morada : null;

  return (
    <Moldura
      tipo="Obra"
      titulo={obra.nome}
      subtitulo={morada ?? 'Sem morada (só o sítio no mapa)'}
      alterado={alterada}
      resumo={
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 leading-5">
          <MarcaCliente cliente={cliente} />
          <span className="text-slate-700">{cliente?.nome ?? 'Cliente desconhecido'}</span>
          <span className="text-slate-700">
            · {comPlural(pessoas.length, 'pessoa', 'pessoas')}
            {nCasas > 0 && ` de ${comPlural(nCasas, 'casa', 'casas')}`}
          </span>
        </p>
      }
      acoes={<AcoesObra obra={obra} />}
    >
      <dl>
        <Linha rotulo="Cliente">
          <span className="inline-flex items-center gap-1.5">
            <MarcaCliente cliente={cliente} />
            {cliente?.nome ?? <Vazio>Cliente desconhecido</Vazio>}
          </span>
        </Linha>
        <Linha rotulo="Morada">{morada ?? <Vazio>só o sítio no mapa</Vazio>}</Linha>
        <Linha rotulo="Estacionamento">
          {estacionamento ? (
            estacionamento.morada.trim() || <Vazio>só o sítio no mapa</Vazio>
          ) : (
            <Vazio>sem estacionamento</Vazio>
          )}
        </Linha>
        <Linha rotulo="Pessoas">{comPlural(pessoas.length, 'pessoa', 'pessoas')}</Linha>
      </dl>
      <MovimentosPendentes campo="obraId" id={obra.id} />

      <Secao titulo="Quem vem para esta obra e de onde">
        {grupos.length === 0 ? (
          <p className="text-xs text-slate-600 italic">Ninguém nesta obra.</p>
        ) : (
          <ul className="space-y-2">
            {grupos.map((g) => (
              <li key={g.casa?.id ?? 'sem-casa'}>
                <p className="mb-1 flex items-baseline gap-2 text-xs">
                  {g.casa ? (
                    <BotaoFoco foco={{ tipo: 'casa', id: g.casa.id }}>{g.casa.nome}</BotaoFoco>
                  ) : (
                    <Vazio>Sem casa ({ROTULO_FORA_DAS_CASAS})</Vazio>
                  )}
                  <span className="text-slate-600">{comPlural(g.pessoas.length, 'pessoa', 'pessoas')}</span>
                </p>
                <ul className="space-y-1">
                  {g.pessoas.map(({ pessoa, carrinha }) => (
                    <li key={pessoa.id} className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 flex-[0_1_11rem]">
                        <NomeChip pessoa={pessoa} textoIndisponivel />
                      </span>
                      <span className="min-w-0 truncate text-xs text-slate-700">
                        {carrinha ? (
                          <BotaoFoco foco={{ tipo: 'carrinha', id: carrinha.id }}>
                            {formatarMatricula(carrinha.matricula)}
                          </BotaoFoco>
                        ) : (
                          <Vazio>{ROTULO_SEM_TRANSPORTE}</Vazio>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {(carrinhas.length > 0 || semTransporte > 0) && (
        <Secao titulo="Carrinhas que lá chegam">
          <ul className="space-y-0.5">
            {carrinhas.map(({ carrinha, n }) => (
              <li key={carrinha.id} className="flex items-baseline gap-2">
                <BotaoFoco foco={{ tipo: 'carrinha', id: carrinha.id }}>
                  {formatarMatricula(carrinha.matricula)}
                </BotaoFoco>
                <span className="text-xs text-slate-700">{comPlural(n, 'pessoa', 'pessoas')} da obra</span>
              </li>
            ))}
            {semTransporte > 0 && (
              <li className="flex items-baseline gap-2">
                <Vazio>{ROTULO_SEM_TRANSPORTE}</Vazio>
                <span className="text-xs text-slate-700">
                  {comPlural(semTransporte, 'pessoa', 'pessoas')}
                </span>
              </li>
            )}
          </ul>
        </Secao>
      )}

      <AcoesObra obra={obra} />
    </Moldura>
  );
}
