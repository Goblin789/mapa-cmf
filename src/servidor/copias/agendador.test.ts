import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inserirDadosFicticios } from '../dados-de-teste';
import { abrirBd } from '../db/ligacao';
import { criarServicoCopias, type DependenciasServico, mensagemSegura, TEMPOS } from './agendador';
import { iniciarCopias } from './index';
import { nomeCopia } from './nomes';
import type { CopiaNoDestino, MotivoCopia } from './tipos';

const AGORA = new Date('2026-10-04T12:00:00.000Z');
const MINUTO = 60_000;
const HORA = 60 * MINUTO;

/** Destino em memória: cada cópia fica com a data do nome. */
function dependenciasFalsas(iniciais: Date[] = []) {
  const copias = new Map<string, CopiaNoDestino>();
  for (const data of iniciais) {
    const nome = nomeCopia(data, 'hora');
    copias.set(nome, { nome, tamanho: 1, data });
  }
  const motivos: MotivoCopia[] = [];
  const dependencias: DependenciasServico & { copias: typeof copias; motivos: typeof motivos } = {
    tipoDestino: 's3',
    copias,
    motivos,
    copiar: vi.fn(async (motivo: MotivoCopia, agora: Date) => {
      motivos.push(motivo);
      const nome = nomeCopia(agora, motivo);
      copias.set(nome, { nome, tamanho: 1, data: agora });
      return nome;
    }),
    listar: vi.fn(async () => [...copias.values()]),
    apagar: vi.fn(async (nome: string) => {
      copias.delete(nome);
    }),
    atrasoArranqueMs: 10_000,
  };
  return dependencias;
}

describe('agendador das cópias', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] });
    vi.setSystemTime(AGORA);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sem cópias no destino: faz a cópia de arranque pouco depois de arrancar e fica em dia', async () => {
    const dependencias = dependenciasFalsas();
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    expect(servico.estado()).toMatchObject({
      ativas: true,
      ultimaCopiaEm: null,
      atrasada: true,
      destino: 's3',
    });
    expect(dependencias.copiar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);
    expect(dependencias.motivos).toEqual(['arranque']);
    expect(servico.estado()).toMatchObject({
      ultimaCopiaEm: '2026-10-04T12:00:10.000Z',
      ultimaTentativaEm: '2026-10-04T12:00:10.000Z',
      atrasada: false,
      ultimoErro: null,
    });
    servico.parar();
  });

  it('depois de um reinício lê a última cópia do destino e não repete a cópia se for recente', async () => {
    const dependencias = dependenciasFalsas([new Date(AGORA.getTime() - 30 * MINUTO)]);
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    expect(servico.estado()).toMatchObject({ ultimaCopiaEm: '2026-10-04T11:30:00.000Z', atrasada: false });
    await vi.advanceTimersByTimeAsync(5 * MINUTO);
    expect(dependencias.copiar).not.toHaveBeenCalled();
    servico.parar();
  });

  it('ao arrancar, cópias "pc" e objetos fora do formato não contam como última cópia do servidor', async () => {
    const dependencias = dependenciasFalsas([new Date(AGORA.getTime() - 5 * HORA)]);
    const recente = new Date(AGORA.getTime() - 10 * MINUTO);
    const pc = nomeCopia(recente, 'pc');
    dependencias.copias.set(pc, { nome: pc, tamanho: 1, data: recente });
    dependencias.copias.set('mapa-guardada-a-mao.db.gz.enc', {
      nome: 'mapa-guardada-a-mao.db.gz.enc',
      tamanho: 1,
      data: recente,
    });
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    expect(servico.estado()).toMatchObject({ ultimaCopiaEm: '2026-10-04T07:00:00.000Z', atrasada: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dependencias.motivos).toEqual(['arranque']);
    // A retenção que corre depois da cópia nunca apaga o objeto fora do formato.
    expect(dependencias.apagar).not.toHaveBeenCalledWith('mapa-guardada-a-mao.db.gz.enc');
    expect(dependencias.copias.has('mapa-guardada-a-mao.db.gz.enc')).toBe(true);
    servico.parar();
  });

  it('última cópia com mais de 1 h → cópia de arranque', async () => {
    const dependencias = dependenciasFalsas([new Date(AGORA.getTime() - 2 * HORA)]);
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dependencias.motivos).toEqual(['arranque']);
    servico.parar();
  });

  it('faz uma cópia de hora a hora e aplica a retenção depois de cada uma', async () => {
    // Cópias antigas: a de 2 anos é apagada pela retenção na primeira cópia.
    const muitoAntiga = new Date('2024-01-01T00:00:00Z');
    const dependencias = dependenciasFalsas([
      muitoAntiga,
      new Date(AGORA.getTime() - 3 * MINUTO),
      new Date(AGORA.getTime() - 2 * MINUTO),
      new Date(AGORA.getTime() - MINUTO),
    ]);
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    await vi.advanceTimersByTimeAsync(HORA);
    expect(dependencias.motivos).toEqual(['hora']);
    expect(dependencias.apagar).toHaveBeenCalledWith(nomeCopia(muitoAntiga, 'hora'));
    await vi.advanceTimersByTimeAsync(2 * HORA);
    expect(dependencias.motivos).toEqual(['hora', 'hora', 'hora']);
    servico.parar();
  });

  it('nunca faz duas cópias ao mesmo tempo', async () => {
    const dependencias = dependenciasFalsas([new Date(AGORA.getTime() - MINUTO)]);
    let terminar: (nome: string) => void = () => {};
    // A primeira cópia só acaba quando o teste quiser; as seguintes acabam logo.
    dependencias.copiar = vi
      .fn<DependenciasServico['copiar']>()
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolver) => {
            terminar = resolver;
          }),
      )
      .mockResolvedValue('mapa-y');
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    const primeira = servico.fazerAgora('manual');
    const segunda = servico.fazerAgora('manual');
    await vi.advanceTimersByTimeAsync(HORA); // a cópia de hora também espera pela que está a correr
    expect(dependencias.copiar).toHaveBeenCalledTimes(1);
    terminar('mapa-x');
    await Promise.all([primeira, segunda]);
    await servico.fazerAgora('manual');
    expect(dependencias.copiar).toHaveBeenCalledTimes(2);
    servico.parar();
  });

  it('falhas: fazerAgora não lança, o erro fica no estado (sem segredos) e passa a atrasada depois de 3 h', async () => {
    const dependencias = dependenciasFalsas([new Date(AGORA.getTime() - 30 * MINUTO)]);
    dependencias.segredos = ['SEGREDO-FALSO-XYZ'];
    dependencias.copiar = vi.fn(async () => {
      throw new Error('falhou com SEGREDO-FALSO-XYZ em https://conta.example.com/x?X-Amz-Signature=abc');
    });
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    await expect(servico.fazerAgora('manual')).resolves.toBeUndefined();
    const estado = servico.estado();
    expect(estado.ultimoErro).toBe('falhou com *** em <endereço>');
    expect(estado.atrasada).toBe(false);
    expect(estado.ultimaTentativaEm).toBe(AGORA.toISOString());

    await vi.advanceTimersByTimeAsync(3 * HORA);
    expect(servico.estado().atrasada).toBe(true);
    expect(servico.estado().ultimaCopiaEm).toBe('2026-10-04T11:30:00.000Z');
    servico.parar();
  });

  it('uma falha na retenção não falha a cópia', async () => {
    const dependencias = dependenciasFalsas();
    dependencias.apagar = vi.fn(async () => {
      throw new Error('sem permissão');
    });
    const velha = new Date('2020-01-01');
    dependencias.listar = vi.fn(async () => [{ nome: nomeCopia(velha, 'hora'), tamanho: 1, data: velha }]);
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    dependencias.listar = vi.fn(async () =>
      ['2020-01-01', '2026-10-04T10:00:00Z', '2026-10-04T11:00:00Z', '2026-10-04T11:30:00Z'].map((d) => ({
        nome: nomeCopia(new Date(d), 'hora'),
        tamanho: 1,
        data: new Date(d),
      })),
    );
    await servico.fazerAgora('manual');
    expect(servico.estado().ultimaCopiaEm).toBe(AGORA.toISOString());
    expect(servico.estado().atrasada).toBe(false);
    expect(servico.estado().ultimoErro).toContain('limpeza das antigas falhou: sem permissão');
    servico.parar();
  });

  it('se não conseguir ler o destino ao arrancar, tenta a cópia de arranque na mesma', async () => {
    const dependencias = dependenciasFalsas();
    dependencias.listar = vi.fn(async () => {
      throw new Error('S3: não foi possível listar as cópias (falha de rede).');
    });
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    expect(servico.estado().ultimoErro).toContain('Não foi possível ler o destino');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(dependencias.motivos).toEqual(['arranque']);
    servico.parar();
  });

  it('parar() limpa os temporizadores', async () => {
    const dependencias = dependenciasFalsas();
    const servico = criarServicoCopias(dependencias);
    await servico.arrancado;
    servico.parar();
    await vi.advanceTimersByTimeAsync(5 * HORA);
    expect(dependencias.copiar).not.toHaveBeenCalled();
  });

  it('os tempos são os do desenho (1 h, 3 h)', () => {
    expect(TEMPOS.intervalo).toBe(HORA);
    expect(TEMPOS.atrasadaDepoisDe).toBe(3 * HORA);
    expect(TEMPOS.copiaAoArrancarSeMaisDe).toBe(HORA);
  });
});

describe('mensagemSegura', () => {
  it('tira segredos e URLs e encurta', () => {
    expect(mensagemSegura(new Error('chave ABCDEFGH e http://x/y'), ['ABCDEFGH'])).toBe(
      'chave *** e <endereço>',
    );
    expect(mensagemSegura('x'.repeat(500)).length).toBe(200);
  });
});

describe('iniciarCopias', () => {
  let pasta: string;
  beforeEach(() => {
    pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-copias-agendador-'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(pasta, { recursive: true, force: true });
  });

  it('sem config: serviço inativo (atrasada só em produção)', async () => {
    const bd = abrirBd(':memory:');
    expect(iniciarCopias(bd, null).estado()).toEqual({
      ativas: false,
      ultimaCopiaEm: null,
      atrasada: false,
      destino: null,
      ultimaTentativaEm: null,
      ultimoErro: null,
    });
    expect(iniciarCopias(bd, null, { producao: true }).estado().atrasada).toBe(true);
    await iniciarCopias(bd, null).fazerAgora('manual');
    bd.$client.close();
  });

  it('com destino pasta: fazerAgora deixa uma cópia cifrada na pasta', async () => {
    const bd = abrirBd(join(pasta, 'mapa.db'));
    inserirDadosFicticios(bd);
    const servico = iniciarCopias(bd, {
      chave: new Uint8Array(32).fill(7),
      destino: { tipo: 'pasta', caminho: join(pasta, 'destino') },
    });
    await servico.fazerAgora('manual');
    servico.parar();
    expect(servico.estado()).toMatchObject({
      ativas: true,
      destino: 'pasta',
      atrasada: false,
      ultimoErro: null,
    });
    const ficheiros = readdirSync(join(pasta, 'destino'));
    expect(ficheiros).toHaveLength(1);
    expect(ficheiros[0]).toMatch(/^mapa-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z-manual\.db\.gz\.enc$/);
    bd.$client.close();
  });
});
