// Tabela, "Mostrar quem saiu" (M2 junto com a main): na Tabela não há ficha da pessoa, por isso a linha de
// quem saiu tem, no sítio do "Ver no mapa", o botão "Voltou à empresa…", que entra no modo de edição (se
// preciso) e abre o DialogoSaida desse caso. Só dados fictícios (estadoTeste.ts).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { indexar } from '../../dominio/indices';
import { abrirVoltouAEmpresa } from '../edicao/acoes';
import { useUiEdicao } from '../edicao/ui';
import { useLoja } from '../estado/loja';
import { passoVoltar } from '../paineis/fichas';
import { estadoVistas } from './estadoTeste';
import { botaoDaLinha, linhasDaTabela } from './linhasTabela';

const INICIAL_LOJA = useLoja.getState();
const INICIAL_UI = useUiEdicao.getState();

beforeEach(() => {
  useLoja.setState(INICIAL_LOJA, true);
  useUiEdicao.setState(INICIAL_UI, true);
  const dados = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (k: string) => dados.get(k) ?? null,
    setItem: (k: string, v: string) => dados.set(k, v),
    removeItem: (k: string) => dados.delete(k),
  });
});

afterEach(() => {
  useLoja.getState().cancelarEdicao();
  vi.unstubAllGlobals();
});

describe('Tabela: o botão a seguir ao nome', () => {
  const estado = estadoVistas();
  const linhas = linhasDaTabela(estado, indexar(estado), { comQuemSaiu: true });

  it('"Ver no mapa" para quem está na empresa; "Voltou à empresa…" para quem saiu (não está no mapa)', () => {
    const velho = linhas.find((l) => l.pessoa.id === 'p-9');
    expect(velho?.saiu).toBe(true);
    expect(velho && botaoDaLinha(velho)).toBe('voltou');
    const outras = linhas.filter((l) => l.pessoa.id !== 'p-9');
    expect(outras.length).toBeGreaterThan(0);
    expect(outras.every((l) => botaoDaLinha(l) === 'ver-no-mapa')).toBe(true);
  });

  it('"Voltou à empresa…" fora do modo de edição entra nele e abre o diálogo de quem saiu', () => {
    expect(useLoja.getState().modoEdicao).toBe(false);
    abrirVoltouAEmpresa('p-9');
    expect(useLoja.getState().modoEdicao).toBe(true);
    expect(useUiEdicao.getState().dialogo).toEqual({ tipo: 'saida', pessoaId: 'p-9' });
    expect(useUiEdicao.getState().aviso?.texto).toContain('Modo de edição');
    // O diálogo, para quem saiu, é o "Voltou à empresa": ativa = true (fica fora das casas e sem transporte).
    expect(passoVoltar(estado, 'p-9')).toEqual([
      { tipo: 'campo', entidade: 'pessoa', id: 'p-9', campo: 'ativa', de: false, para: true },
    ]);
  });

  it('já no modo de edição só abre o diálogo (não volta a entrar nem repete o aviso)', () => {
    useLoja.getState().entrarEdicao();
    abrirVoltouAEmpresa('p-9');
    expect(useLoja.getState().modoEdicao).toBe(true);
    expect(useUiEdicao.getState().dialogo).toEqual({ tipo: 'saida', pessoaId: 'p-9' });
    expect(useUiEdicao.getState().aviso).toBeNull();
  });
});
