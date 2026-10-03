// Um lugar de uma casa ou carrinha, na posição calculada (layout/medidas.ts).
// Nível "lugares": quadradinho da cor do cliente (ou vazio, tracejado).
// Nível "nomes": o nome da pessoa (NomeChip) ou um lugar vazio tracejado.
// Os lugares a mais (gente acima da lotação) ficam com contorno vermelho.

import { clienteEfetivoId } from '../../../dominio/cores';
import type { Pessoa } from '../../../dominio/tipos';
import { NomeChip } from '../../comum/NomeChip';
import { useLoja } from '../../estado/loja';
import type { Retangulo } from '../layout/geometria';
import type { NivelCartao } from '../layout/niveis';
import { CLASSE_FOCO_BOTAO } from './comum';

interface Props {
  pessoa: Pessoa | null;
  retangulo: Retangulo;
  nivel: NivelCartao;
  /** Lugar acima da lotação. */
  aMais: boolean;
}

function posicao(r: Retangulo) {
  return { left: r.x, top: r.y, width: r.largura, height: r.altura };
}

function QuadradoPessoa({
  pessoa,
  retangulo,
  aMais,
}: {
  pessoa: Pessoa;
  retangulo: Retangulo;
  aMais: boolean;
}) {
  const indices = useLoja((s) => s.indices);
  const clienteDestacado = useLoja((s) => s.clienteDestacado);
  const emFoco = useLoja((s) => s.foco?.tipo === 'pessoa' && s.foco.id === pessoa.id);
  const definirFoco = useLoja((s) => s.definirFoco);
  if (!indices) return null;

  const clienteId = clienteEfetivoId(pessoa, indices.obras);
  const cliente = indices.clientes.get(clienteId);
  const apagado = clienteDestacado !== null && clienteDestacado !== clienteId;
  const aConfirmar = pessoa.casaAConfirmar || pessoa.carrinhaAConfirmar;
  const descricao = [
    pessoa.nomeCurto,
    cliente?.nome,
    aConfirmar ? 'a confirmar' : null,
    aMais ? 'lugar a mais' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <button
      type="button"
      data-pessoa-id={pessoa.id}
      className={[
        'absolute z-[1] cursor-pointer rounded-[2px] transition-opacity',
        aMais ? 'border-2 border-red-600' : 'border border-black/40',
        // Anel e não outline: o Leaflet apaga o outline do botão clicado (ver comum.tsx).
        emFoco ? CLASSE_FOCO_BOTAO : '',
        apagado ? 'opacity-20' : 'opacity-100',
      ].join(' ')}
      style={{ ...posicao(retangulo), backgroundColor: cliente?.cor ?? '#ffffff' }}
      title={`${pessoa.nome} ${pessoa.apelidos}${cliente ? ` · ${cliente.nome}` : ''}${aConfirmar ? ' · a confirmar' : ''}${aMais ? ' · lugar a mais' : ''}`}
      aria-label={descricao}
      aria-pressed={emFoco}
      onClick={(e) => {
        e.stopPropagation();
        definirFoco(emFoco ? null : { tipo: 'pessoa', id: pessoa.id });
      }}
    />
  );
}

export function Lugar({ pessoa, retangulo, nivel, aMais }: Props) {
  if (nivel === 'nomes') {
    return (
      <div
        className={[
          'absolute z-[1]',
          // Vazio: o clique passa para o cartão (põe a casa/carrinha em foco).
          pessoa ? '' : 'pointer-events-none',
          aMais ? 'rounded outline-2 outline-offset-1 outline-red-600' : '',
        ].join(' ')}
        style={posicao(retangulo)}
        title={aMais ? 'Lugar a mais (acima da lotação)' : undefined}
      >
        {pessoa ? (
          <NomeChip pessoa={pessoa} />
        ) : (
          <div className="pointer-events-none h-full w-full rounded border border-dashed border-slate-400 bg-white/70" />
        )}
      </div>
    );
  }

  if (pessoa) return <QuadradoPessoa pessoa={pessoa} retangulo={retangulo} aMais={aMais} />;
  return (
    <span
      className="pointer-events-none absolute z-[1] rounded-[2px] border border-dashed border-slate-400 bg-white"
      style={posicao(retangulo)}
    />
  );
}
