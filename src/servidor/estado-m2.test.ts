// O Estado do M2: períodos de indisponibilidade e problemas, filtrados (GET /api/estado: só os recentes) ou
// completos (gravarLote). Base de dados em memória, dados fictícios.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { criarApp } from './app';
import { inserirDadosFicticios, inserirDadosM2 } from './dados-de-teste';
import { abrirBd, type Bd } from './db/ligacao';
import { carregarEstado, registoNaFormaDoEstado } from './estado';

/** 2026-10-04 no Luxemburgo. */
const AGORA = new Date('2026-10-04T10:00:00.000Z');

let bd: Bd;

beforeEach(() => {
  bd = abrirBd(':memory:');
  inserirDadosFicticios(bd);
  inserirDadosM2(bd);
});

afterEach(() => {
  if (bd.$client.open) bd.$client.close();
});

describe('Estado com indisponibilidades e problemas', () => {
  it('filtrado: os períodos sem fim, futuros ou acabados há 30 dias ou menos; problemas abertos ou resolvidos há 30 dias ou menos', () => {
    const estado = carregarEstado(bd, AGORA);
    expect(estado.indisponibilidades.map((p) => p.id)).toEqual([
      'indisp-limite01',
      'indisp-futuro01',
      'indisp-atual001',
    ]);
    expect(estado.problemas.map((p) => p.id)).toEqual([
      'problema-aberto2',
      'problema-aberto1',
      'problema-limite1',
    ]);
  });

  it('completo: tudo, pela mesma ordem (períodos por pessoa e início; problemas abertos e mais recentes primeiro)', () => {
    const estado = carregarEstado(bd, AGORA, { completo: true });
    expect(estado.indisponibilidades.map((p) => [p.pessoaId, p.inicio])).toEqual([
      ['p-elia', '2026-08-20'],
      ['p-elia', '2026-12-01'],
      ['p-ze', '2026-08-01'],
      ['p-ze', '2026-10-01'],
    ]);
    expect(estado.problemas.map((p) => p.id)).toEqual([
      'problema-aberto2',
      'problema-aberto1',
      'problema-limite1',
      'problema-velho01',
    ]);
  });

  it('os registos vêm na forma do domínio (sem motivo; um só alvo; null em vez de vazio)', () => {
    const estado = carregarEstado(bd, AGORA);
    expect(estado.indisponibilidades.find((p) => p.id === 'indisp-atual001')).toStrictEqual({
      id: 'indisp-atual001',
      pessoaId: 'p-ze',
      inicio: '2026-10-01',
      fim: null,
    });
    expect(estado.problemas.find((p) => p.id === 'problema-aberto2')).toStrictEqual({
      id: 'problema-aberto2',
      casaId: null,
      carrinhaId: 'car-2',
      texto: 'Pneu furado',
      abertoEm: '2026-10-02',
      resolvidoEm: null,
    });
  });

  it('o "hoje" é o dia no Luxemburgo: à meia-noite e meia (hora de verão) já é o dia seguinte', () => {
    // 2026-10-04T22:30Z = 05/10 00:30 no Luxemburgo: o período que acabou a 04/09 passa a ter 31 dias.
    const estado = carregarEstado(bd, new Date('2026-10-04T22:30:00.000Z'));
    expect(estado.indisponibilidades.map((p) => p.id)).not.toContain('indisp-limite01');
  });

  it('GET /api/estado leva só os recentes', async () => {
    const app = criarApp({ bd, agora: () => AGORA });
    const resposta = await app.request('/api/estado');
    const estado = (await resposta.json()) as ReturnType<typeof carregarEstado>;
    // A rota usa o relógio verdadeiro: os antigos (2026-09-03) já lá não estão.
    expect(estado.indisponibilidades.map((p) => p.id)).not.toContain('indisp-antigo01');
    expect(estado.problemas.map((p) => p.id)).not.toContain('problema-velho01');
    expect(estado.problemas.map((p) => p.id)).toContain('problema-aberto1');
  });

  it('registoNaFormaDoEstado: as mesmas chaves, pela mesma ordem, que o Estado', () => {
    const estado = carregarEstado(bd, AGORA);
    const periodo = estado.indisponibilidades[0];
    if (!periodo) throw new Error('falta o período');
    const baralhado = Object.fromEntries(Object.entries(periodo).reverse()) as typeof periodo;
    expect(JSON.stringify(registoNaFormaDoEstado('indisponibilidade', baralhado))).toBe(
      JSON.stringify(periodo),
    );
    const obra = estado.obras[0];
    if (!obra) throw new Error('falta a obra');
    expect(JSON.stringify(registoNaFormaDoEstado('obra', { ...obra }))).toBe(JSON.stringify(obra));
    const pessoa = estado.pessoas[0];
    if (!pessoa) throw new Error('falta a pessoa');
    const { nomesAlternativos: _n, ...semLista } = pessoa;
    expect(registoNaFormaDoEstado('pessoa', semLista as typeof pessoa).nomesAlternativos).toEqual([]);
  });
});
