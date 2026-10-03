// Peças do modo de edição para o painel de foco: marca "alterado — por guardar", o valor gravado
// ao lado do que mudou, quem entra e sai de uma casa/carrinha, os botões "Mudar casa/carrinha/obra"
// (o caminho garantido no telemóvel, sem arrastar) e o condutor da carrinha ("Tornar condutor",
// "Tirar condutor"). Mudar o condutor só se faz aqui dentro, como um passo do rascunho.

import type { CampoMovivel } from '../../dominio/operacoes';
import type { Carrinha, Id, Pessoa } from '../../dominio/tipos';
import { IconeVolante } from '../comum/IconeVolante';
import { formatarMatricula } from '../comum/Matricula';
import { NomeChip } from '../comum/NomeChip';
import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { definirCondutorComAviso, entrarEdicaoComAviso } from './acoes';
import { BOTAO_MINI, BOTAO_PEQUENO, MARCA_ALTERADO } from './classes';
import type { TipoDestino } from './destinos';
import { IconeCarrinha, IconeCasa, IconeLapis, IconeObra } from './icones';
import {
  alteracoesDaPessoa,
  condutorPendente,
  movimentosDoSitio,
  pessoaTemAlteracoes,
  rotuloDoCondutor,
  rotuloDoValor,
  sitioTemAlteracoes,
} from './resumo';
import { abrirMoverPara } from './ui';

export function MarcaAlterado() {
  return (
    <span className={MARCA_ALTERADO}>
      <span aria-hidden="true">●</span>
      alterado — por guardar
    </span>
  );
}

/** A pessoa tem alterações por guardar, incluindo passar a (ou deixar de) conduzir (só no modo de edição). */
export function usePessoaAlterada(pessoaId: Id): boolean {
  return useLoja((s) => s.modoEdicao && pessoaTemAlteracoes(s.pendentes, pessoaId));
}

/** Alguém entra ou sai desta casa/carrinha (ou muda o condutor da carrinha) nas alterações por guardar. */
export function useSitioAlterado(campo: CampoMovivel, id: Id): boolean {
  return useLoja((s) => s.modoEdicao && sitioTemAlteracoes(s.pendentes, campo, id));
}

/** "antes: Casa Um", por baixo de um valor que mudou no rascunho. */
export function ValorGravado({ pessoaId, campo }: { pessoaId: Id; campo: CampoMovivel }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const pendentes = useLoja((s) => s.pendentes);
  const estadoServidor = useLoja((s) => s.estadoServidor);
  if (!modoEdicao || !estadoServidor) return null;
  const op = alteracoesDaPessoa(pendentes, pessoaId).get(campo);
  if (!op) return null;
  return (
    <span className="block w-full text-xs text-amber-900">
      <span aria-hidden="true">● </span>
      antes: {rotuloDoValor(estadoServidor, campo, op.de)}
    </span>
  );
}

/** "antes: Ana T." (ou "antes: sem condutor"), por baixo do condutor de uma carrinha que mudou no rascunho. */
export function CondutorGravado({ carrinhaId }: { carrinhaId: Id }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const pendentes = useLoja((s) => s.pendentes);
  const estadoServidor = useLoja((s) => s.estadoServidor);
  if (!modoEdicao || !estadoServidor) return null;
  const op = condutorPendente(pendentes, carrinhaId);
  if (!op) return null;
  return (
    <span className="block w-full text-xs text-amber-900">
      <span aria-hidden="true">● </span>
      antes: {rotuloDoCondutor(estadoServidor, op.de)}
    </span>
  );
}

/**
 * Muda o condutor e devolve o foco ao botão da mesma pessoa: a lista reordena-se (o condutor passa para
 * cima) e o botão muda de texto, mas quem usa o teclado não perde o sítio.
 */
function mudarCondutor(carrinhaId: Id, pessoaId: Id | null, focarPessoa: Id): void {
  if (!definirCondutorComAviso(carrinhaId, pessoaId)) return;
  requestAnimationFrame(() => {
    document.querySelector<HTMLElement>(`[data-botao-condutor="${CSS.escape(focarPessoa)}"]`)?.focus();
  });
}

const BOTOES: { tipo: TipoDestino; rotulo: string; Icone: typeof IconeCasa }[] = [
  { tipo: 'casa', rotulo: 'Mudar casa', Icone: IconeCasa },
  { tipo: 'carrinha', rotulo: 'Mudar carrinha', Icone: IconeCarrinha },
  { tipo: 'obra', rotulo: 'Mudar obra', Icone: IconeObra },
];

/**
 * No modo de edição: "Mudar casa", "Mudar carrinha", "Mudar obra" (esta só se houver obras) e, a quem vai
 * numa carrinha, "Tornar condutor da …" (ou "Deixar de conduzir a …", a quem já conduz).
 * Fora dele: como se muda (entrar no modo de edição).
 */
export function AcoesPessoa({ pessoa }: { pessoa: Pessoa }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const haObras = useLoja((s) => (s.estado?.obras.length ?? 0) > 0);
  const carrinha = useLoja((s) =>
    pessoa.carrinhaId ? s.indices?.carrinhas.get(pessoa.carrinhaId) : undefined,
  );
  if (!pessoa.ativa) return null;

  if (!modoEdicao) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span className="min-w-0 flex-1">Para mudar a casa, a carrinha, a obra ou o condutor:</span>
        <button type="button" onClick={entrarEdicaoComAviso} className={BOTAO_PEQUENO}>
          <IconeLapis className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
    );
  }

  const conduz = carrinha?.condutorId === pessoa.id;
  return (
    <div className="mt-3 border-t border-slate-200 pt-2">
      <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-600 uppercase">Mudar</p>
      <div className="flex flex-wrap gap-1.5">
        {BOTOES.filter((b) => b.tipo !== 'obra' || haObras || pessoa.obraId !== null).map(
          ({ tipo, rotulo, Icone }) => (
            <button
              key={tipo}
              type="button"
              onClick={() => abrirMoverPara([pessoa.id], tipo)}
              className={BOTAO_PEQUENO}
            >
              <Icone className="h-3.5 w-3.5" />
              {rotulo}…
            </button>
          ),
        )}
        {carrinha && (
          <button
            type="button"
            data-botao-condutor={pessoa.id}
            onClick={() => mudarCondutor(carrinha.id, conduz ? null : pessoa.id, pessoa.id)}
            className={BOTAO_PEQUENO}
          >
            <IconeVolante tamanho={14} />
            {conduz
              ? `Deixar de conduzir a ${formatarMatricula(carrinha.matricula)}`
              : `Tornar condutor da ${formatarMatricula(carrinha.matricula)}`}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Passageiros de uma carrinha no modo de edição: o condutor em primeiro, com "Condutor" e "Tirar condutor";
 * os outros com "Tornar condutor". Cada botão é um passo do rascunho (Ctrl+Z desfaz).
 */
export function PassageirosEmEdicao({
  carrinha,
  passageiros,
}: {
  carrinha: Carrinha;
  passageiros: Pessoa[];
}) {
  const matricula = formatarMatricula(carrinha.matricula);
  if (passageiros.length === 0) return <p className="text-xs text-slate-600 italic">Sem passageiros.</p>;
  return (
    <ul className="space-y-1">
      {passageiros.map((p) => {
        const conduz = carrinha.condutorId === p.id;
        return (
          <li key={p.id} className="flex min-w-0 items-center gap-1.5">
            <span className="min-w-0 flex-1">
              <NomeChip pessoa={p} condutor={conduz} />
            </span>
            {conduz && (
              <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-slate-700">
                <IconeVolante tamanho={12} />
                Condutor
              </span>
            )}
            <button
              type="button"
              data-botao-condutor={p.id}
              onClick={() => mudarCondutor(carrinha.id, conduz ? null : p.id, p.id)}
              aria-label={
                conduz
                  ? `Tirar ${p.nomeCurto} de condutor da ${matricula}`
                  : `Tornar ${p.nomeCurto} condutor da ${matricula}`
              }
              className={BOTAO_MINI}
            >
              {conduz ? 'Tirar condutor' : 'Tornar condutor'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Numa casa ou carrinha: quem entra e quem sai (e, numa carrinha, o condutor) nas alterações por guardar. */
export function MovimentosPendentes({ campo, id }: { campo: CampoMovivel; id: Id }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const pendentes = useLoja((s) => s.pendentes);
  const estadoServidor = useLoja((s) => s.estadoServidor);
  if (!modoEdicao || !estadoServidor) return null;
  const { entram, saem } = movimentosDoSitio(pendentes, campo, id);
  const condutor = campo === 'carrinhaId' ? condutorPendente(pendentes, id) : null;
  if (entram.length === 0 && saem.length === 0 && !condutor) return null;
  const nome = (pessoaId: Id) => estadoServidor.pessoas.find((p) => p.id === pessoaId)?.nomeCurto ?? pessoaId;
  const partes = [
    entram.length > 0 ? comPlural(entram.length, 'entra', 'entram') : null,
    saem.length > 0 ? comPlural(saem.length, 'sai', 'saem') : null,
    condutor ? 'muda o condutor' : null,
  ].filter(Boolean);

  return (
    <section className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
      <h3 className="mb-1 font-semibold">Por guardar: {partes.join(', ')}</h3>
      <ul className="space-y-0.5">
        {entram.map((op) => (
          <li key={`e:${op.pessoaId}`}>
            <span aria-hidden="true" className="font-bold text-emerald-700">
              +{' '}
            </span>
            <span className="sr-only">Entra </span>
            <strong className="font-semibold">{nome(op.pessoaId)}</strong>{' '}
            <span className="text-amber-900">(de {rotuloDoValor(estadoServidor, campo, op.de)})</span>
          </li>
        ))}
        {saem.map((op) => (
          <li key={`s:${op.pessoaId}`}>
            <span aria-hidden="true" className="font-bold text-red-700">
              −{' '}
            </span>
            <span className="sr-only">Sai </span>
            <strong className="font-semibold">{nome(op.pessoaId)}</strong>{' '}
            <span className="text-amber-900">(para {rotuloDoValor(estadoServidor, campo, op.para)})</span>
          </li>
        ))}
        {condutor && (
          <li className="flex items-center gap-1">
            <IconeVolante tamanho={12} className="text-amber-900" />
            <span>
              Condutor: {rotuloDoCondutor(estadoServidor, condutor.de)}
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> passa para </span>
              <strong className="font-semibold">{rotuloDoCondutor(estadoServidor, condutor.para)}</strong>
            </span>
          </li>
        )}
      </ul>
    </section>
  );
}
