// Os lugares de uma casa, carrinha ou obra, nas posições calculadas (layout/medidas.ts):
// o nome da pessoa (NomeChip: cor do cliente, clique, seleção e arrastar) ou um lugar vazio discreto.
// Os lugares a mais (gente acima da lotação) ficam com contorno vermelho e "lugar a mais" no tooltip.
// A lista vai dentro de ContextoOrdemPessoas (Shift+clique escolhe um intervalo desta lista).

import type { Pessoa } from '../../../dominio/tipos';
import { NomeChip } from '../../comum/NomeChip';
import { ContextoOrdemPessoas } from '../../comum/ordemPessoas';
import type { Retangulo } from '../layout/geometria';
import { posicao } from './comum';

interface Props {
  pessoas: readonly Pessoa[];
  lugares: readonly Retangulo[];
  /** Lugares "normais" (lotação/lugares); daí para a frente são lugares a mais. null = sem limite (obra). */
  capacidade: number | null;
}

export function Lugares({ pessoas, lugares, capacidade }: Props) {
  const ids = pessoas.map((p) => p.id);
  return (
    <ContextoOrdemPessoas.Provider value={ids}>
      {lugares.map((r, i) => {
        const pessoa = pessoas[i];
        const aMais = capacidade !== null && i >= capacidade;
        if (!pessoa) {
          return (
            <span
              key={`vazio-${r.x}:${r.y}`}
              aria-hidden="true"
              className="lugar-vazio pointer-events-none absolute rounded-[3px] border border-dashed"
              style={posicao(r)}
            />
          );
        }
        return (
          <div
            key={pessoa.id}
            className={['absolute z-[1]', aMais ? 'rounded-[3px] outline-[1.5px] outline-red-600' : ''].join(' ')}
            style={posicao(r)}
            title={aMais ? 'Lugar a mais (acima da lotação)' : undefined}
          >
            <NomeChip pessoa={pessoa} compacto className="h-full" />
          </div>
        );
      })}
    </ContextoOrdemPessoas.Provider>
  );
}
