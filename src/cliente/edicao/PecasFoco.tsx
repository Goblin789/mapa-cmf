// Peças do modo de edição para o painel de foco: marca "alterado — por guardar", o valor gravado
// ao lado do que mudou, quem entra e sai de uma casa/carrinha, e os botões "Mudar casa/carrinha/obra"
// (o caminho garantido no telemóvel, sem arrastar).

import type { CampoMovivel } from '../../dominio/operacoes';
import type { Id, Pessoa } from '../../dominio/tipos';
import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { entrarEdicaoComAviso } from './acoes';
import { BOTAO_PEQUENO, MARCA_ALTERADO } from './classes';
import type { TipoDestino } from './destinos';
import { IconeCarrinha, IconeCasa, IconeLapis, IconeObra } from './icones';
import { alteracoesDaPessoa, movimentosDoSitio, rotuloDoValor } from './resumo';
import { abrirMoverPara } from './ui';

export function MarcaAlterado() {
  return (
    <span className={MARCA_ALTERADO}>
      <span aria-hidden="true">●</span>
      alterado — por guardar
    </span>
  );
}

/** A pessoa tem alterações por guardar (só no modo de edição). */
export function usePessoaAlterada(pessoaId: Id): boolean {
  return useLoja((s) => s.modoEdicao && s.pendentes.some((op) => op.pessoaId === pessoaId));
}

/** Alguém entra ou sai desta casa/carrinha nas alterações por guardar. */
export function useSitioAlterado(campo: CampoMovivel, id: Id): boolean {
  return useLoja(
    (s) => s.modoEdicao && s.pendentes.some((op) => op.campo === campo && (op.de === id || op.para === id)),
  );
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

const BOTOES: { tipo: TipoDestino; rotulo: string; Icone: typeof IconeCasa }[] = [
  { tipo: 'casa', rotulo: 'Mudar casa', Icone: IconeCasa },
  { tipo: 'carrinha', rotulo: 'Mudar carrinha', Icone: IconeCarrinha },
  { tipo: 'obra', rotulo: 'Mudar obra', Icone: IconeObra },
];

/**
 * No modo de edição: "Mudar casa", "Mudar carrinha", "Mudar obra" (esta só se houver obras).
 * Fora dele: como se muda (entrar no modo de edição).
 */
export function AcoesPessoa({ pessoa }: { pessoa: Pessoa }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const haObras = useLoja((s) => (s.estado?.obras.length ?? 0) > 0);
  if (!pessoa.ativa) return null;

  if (!modoEdicao) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-200 pt-2 text-xs text-slate-600">
        <span className="min-w-0 flex-1">Para mudar a casa, a carrinha ou a obra:</span>
        <button type="button" onClick={entrarEdicaoComAviso} className={BOTAO_PEQUENO}>
          <IconeLapis className="h-3.5 w-3.5" />
          Editar
        </button>
      </div>
    );
  }

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
      </div>
    </div>
  );
}

/** Numa casa ou carrinha: quem entra e quem sai nas alterações por guardar. */
export function MovimentosPendentes({ campo, id }: { campo: CampoMovivel; id: Id }) {
  const modoEdicao = useLoja((s) => s.modoEdicao);
  const pendentes = useLoja((s) => s.pendentes);
  const estadoServidor = useLoja((s) => s.estadoServidor);
  if (!modoEdicao || !estadoServidor) return null;
  const { entram, saem } = movimentosDoSitio(pendentes, campo, id);
  if (entram.length === 0 && saem.length === 0) return null;
  const nome = (pessoaId: Id) => estadoServidor.pessoas.find((p) => p.id === pessoaId)?.nomeCurto ?? pessoaId;

  return (
    <section className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
      <h3 className="mb-1 font-semibold">
        Por guardar: {entram.length > 0 && comPlural(entram.length, 'entra', 'entram')}
        {entram.length > 0 && saem.length > 0 && ', '}
        {saem.length > 0 && comPlural(saem.length, 'sai', 'saem')}
      </h3>
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
      </ul>
    </section>
  );
}
