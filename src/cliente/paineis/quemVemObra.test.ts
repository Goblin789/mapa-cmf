import { describe, expect, it } from 'vitest';
import { indexar } from '../../dominio/indices';
import { criarObra } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import { estadoVistas } from '../vistas/estadoTeste';
import { carrinhasDaObra, quemVemParaAObra } from './quemVemObra';

// Na obra fictícia trabalham: Zé A. e Ana B. (Casa L1, XX1001), Eva D. (Aldeia, XX1002) e Óscar G. (sem
// casa nem carrinha).
const estado: Estado = {
  ...estadoVistas(),
  obras: [criarObra({ id: 'obra-f', nome: 'Obra Fictícia', clienteId: 'alfa', localId: 'aldeia' })],
  pessoas: estadoVistas().pessoas.map((p) =>
    ['p-1', 'p-2', 'p-4', 'p-7', 'p-9'].includes(p.id) ? { ...p, obraId: 'obra-f' } : p,
  ),
};
const ind = indexar(estado, null);

describe('quem vem para esta obra e de onde', () => {
  it('por casa (a ordem das casas), "sem casa" no fim; cada pessoa com a carrinha; os inativos não contam', () => {
    const grupos = quemVemParaAObra('obra-f', ind);
    expect(grupos.map((g) => g.casa?.nome ?? null)).toEqual(['Casa L1', 'Aldeia', null]);
    expect(grupos.map((g) => g.pessoas.map((x) => [x.pessoa.nomeCurto, x.carrinha?.id ?? null]))).toEqual([
      [
        ['Ana B.', 'XX1001'],
        ['Zé A.', 'XX1001'],
      ],
      [['Eva D.', 'XX1002']],
      [['Óscar G.', null]],
    ]);
  });

  it('as carrinhas que lá chegam (mais pessoas primeiro) e quantas vão sem transporte', () => {
    const { carrinhas, semTransporte } = carrinhasDaObra(quemVemParaAObra('obra-f', ind));
    expect(carrinhas.map((c) => [c.carrinha.id, c.n])).toEqual([
      ['XX1001', 2],
      ['XX1002', 1],
    ]);
    expect(semTransporte).toBe(1);
  });

  it('obra sem ninguém (ou que não existe): nada', () => {
    expect(quemVemParaAObra('nao-existe', ind)).toEqual([]);
    expect(carrinhasDaObra([])).toEqual({ carrinhas: [], semTransporte: 0 });
  });
});
