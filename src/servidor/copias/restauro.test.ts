import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { inserirDadosFicticios, inserirLotes } from '../dados-de-teste';
import { abrirBd } from '../db/ligacao';
import { contarPessoas } from '../estado';
import { empacotar } from './cifra';
import { criarDestinoPasta } from './destinos/pasta';
import { enviarCopia, tirarInstantaneo, tirarInstantaneoDoFicheiro } from './instantaneo';
import { lerJournal, migracoesPendentes } from './migracoes';
import { nomeCopia } from './nomes';
import { prepararBd } from './preparar';
import { restaurarCopia, verificarBd } from './restauro';
import type { ConfigCopias } from './tipos';

const CHAVE = new Uint8Array(randomBytes(32));
const AGORA = new Date('2026-10-04T12:00:00.000Z');

let pasta: string;
let config: ConfigCopias;

/** BD de teste com dados fictícios e alguns lotes. Fica fechada. */
function criarBdDeTeste(caminho: string, lotes = 3): void {
  const bd = abrirBd(caminho);
  inserirDadosFicticios(bd);
  inserirLotes(bd, lotes);
  bd.$client.close();
}

function hashDe(caminho: string): string {
  return createHash('sha256').update(readFileSync(caminho)).digest('hex');
}

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), 'mapa-cmf-copias-restauro-'));
  config = { chave: CHAVE, destino: { tipo: 'pasta', caminho: join(pasta, 'destino') } };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  rmSync(pasta, { recursive: true, force: true });
});

describe('instantâneo', () => {
  it('copia a BD aberta (com o servidor a usá-la) e a cópia passa a verificação', async () => {
    const bd = abrirBd(join(pasta, 'mapa.db'));
    inserirDadosFicticios(bd);
    inserirLotes(bd, 4);
    const bytes = await tirarInstantaneo(bd.$client);
    const pessoas = contarPessoas(bd);
    bd.$client.close();

    expect(bytes.subarray(0, 15).toString()).toBe('SQLite format 3');
    const copia = join(pasta, 'copia.db');
    writeFileSync(copia, bytes);
    expect(verificarBd(copia)).toEqual({
      pessoas,
      lotes: 4,
      versao: 4,
      migracoes: lerJournal().length,
    });
  });

  it('de um ficheiro fechado, abrindo-o só para leitura (sem lhe mexer)', async () => {
    const caminho = join(pasta, 'mapa.db');
    criarBdDeTeste(caminho);
    const antes = hashDe(caminho);
    const bytes = await tirarInstantaneoDoFicheiro(caminho);
    expect(bytes.length).toBeGreaterThan(0);
    expect(hashDe(caminho)).toBe(antes);
  });
});

describe('verificarBd', () => {
  it('recusa uma BD SQLite que não é do Mapa', () => {
    const caminho = join(pasta, 'outra.db');
    const cliente = new Database(caminho);
    cliente.exec('CREATE TABLE coisas (id INTEGER)');
    cliente.close();
    expect(() => verificarBd(caminho)).toThrow('faltam as tabelas pessoas, lotes, __drizzle_migrations');
  });

  it('recusa um ficheiro que não é SQLite', () => {
    const caminho = join(pasta, 'lixo.db');
    writeFileSync(caminho, randomBytes(8192));
    expect(() => verificarBd(caminho)).toThrow(/não é uma base de dados SQLite/);
  });
});

describe('restaurarCopia', () => {
  it('restaura, recusa substituir e com substituir põe a antiga de lado', async () => {
    const origem = join(pasta, 'origem.db');
    criarBdDeTeste(origem, 5);
    const destino = criarDestinoPasta(join(pasta, 'destino'));
    const nome = await enviarCopia(await tirarInstantaneoDoFicheiro(origem), destino, CHAVE, 'pc', AGORA);

    const para = join(pasta, 'restaurada', 'mapa.db');
    const resultado = await restaurarCopia({ destino, chave: CHAVE, qual: 'ultima', para, agora: AGORA });
    expect(resultado.nome).toBe(nome);
    expect(resultado.verificacao).toMatchObject({ lotes: 5, versao: 5 });
    expect(resultado.antiga).toBeNull();
    // Nenhum temporário fica para trás.
    expect(readdirSync(join(pasta, 'restaurada'))).toEqual(['mapa.db']);

    await expect(restaurarCopia({ destino, chave: CHAVE, qual: nome, para })).rejects.toThrow(
      'não a substituo',
    );

    const segunda = await restaurarCopia({
      destino,
      chave: CHAVE,
      qual: nome,
      para,
      substituir: true,
      agora: AGORA,
    });
    expect(segunda.antiga).toBe(`${para}.antes-restauro-2026-10-04T12-00-00Z`);
    expect(existsSync(segunda.antiga as string)).toBe(true);
    // A restaurada abre-se normalmente com o abrirBd (e já não tem migrações por aplicar).
    expect(migracoesPendentes(para)).toEqual([]);
    const bd = abrirBd(para);
    expect(contarPessoas(bd)).toBeGreaterThan(0);
    bd.$client.close();
  });

  it('com substituir, recusa se a BD estiver a ser usada (servidor ligado) e não lhe mexe', async () => {
    const origem = join(pasta, 'origem.db');
    criarBdDeTeste(origem, 2);
    const destino = criarDestinoPasta(join(pasta, 'destino'));
    await enviarCopia(await tirarInstantaneoDoFicheiro(origem), destino, CHAVE, 'pc', AGORA);

    const para = join(pasta, 'em-uso', 'mapa.db');
    criarBdDeTeste(para, 1);
    const servidor = abrirBd(para); // como o servidor: aberta e já lida
    const antes = contarPessoas(servidor);
    await expect(
      restaurarCopia({ destino, chave: CHAVE, qual: 'ultima', para, substituir: true, agora: AGORA }),
    ).rejects.toThrow('está a ser usada');
    expect(readdirSync(join(pasta, 'em-uso')).filter((n) => n.includes('antes-restauro'))).toEqual([]);
    expect(contarPessoas(servidor)).toBe(antes);
    servidor.$client.close();

    // Com o servidor parado, já se substitui.
    const resultado = await restaurarCopia({
      destino,
      chave: CHAVE,
      qual: 'ultima',
      para,
      substituir: true,
      agora: AGORA,
    });
    expect(resultado.verificacao).toMatchObject({ lotes: 2 });
  });

  it('uma cópia que falha a verificação nunca chega ao destino', async () => {
    const destino = criarDestinoPasta(join(pasta, 'destino'));
    const nome = nomeCopia(AGORA, 'pc');
    await destino.enviar(nome, await empacotar(randomBytes(4096), CHAVE));
    const para = join(pasta, 'r', 'mapa.db');
    await expect(restaurarCopia({ destino, chave: CHAVE, qual: nome, para })).rejects.toThrow(
      /não é uma base de dados SQLite/,
    );
    expect(readdirSync(join(pasta, 'r'))).toEqual([]);
  });

  it('cópia inexistente ou destino vazio → erro claro', async () => {
    const destino = criarDestinoPasta(join(pasta, 'destino'));
    const para = join(pasta, 'mapa.db');
    await expect(restaurarCopia({ destino, chave: CHAVE, qual: 'ultima', para })).rejects.toThrow(
      'Não há nenhuma cópia no destino',
    );
    await expect(
      restaurarCopia({ destino, chave: CHAVE, qual: nomeCopia(AGORA, 'hora'), para }),
    ).rejects.toThrow('Não há nenhuma cópia com o nome');
  });
});

describe('prepararBd', () => {
  async function copiaNoDestino(lotes = 2): Promise<string> {
    const origem = join(pasta, `origem-${lotes}.db`);
    criarBdDeTeste(origem, lotes);
    return enviarCopia(
      await tirarInstantaneoDoFicheiro(origem),
      criarDestinoPasta(join(pasta, 'destino')),
      CHAVE,
      'pc',
      new Date(AGORA.getTime() + lotes * 1000),
    );
  }

  it('BD em falta + RESTAURAR_AO_ARRANCAR=ultima → restaura a mais recente', async () => {
    await copiaNoDestino(2);
    await copiaNoDestino(3);
    const caminho = join(pasta, 'disco', 'mapa.db');
    await prepararBd(caminho, config, { RESTAURAR_AO_ARRANCAR: 'ultima' });
    expect(verificarBd(caminho)).toMatchObject({ lotes: 3 });
  });

  it('restaura uma cópia pelo nome', async () => {
    const nome = await copiaNoDestino(2);
    await copiaNoDestino(3);
    const caminho = join(pasta, 'mapa.db');
    await prepararBd(caminho, config, { RESTAURAR_AO_ARRANCAR: nome });
    expect(verificarBd(caminho)).toMatchObject({ lotes: 2 });
  });

  it('BD em falta sem RESTAURAR_AO_ARRANCAR e destino vazio (ou sem cópias) → não faz nada', async () => {
    const caminho = join(pasta, 'mapa.db');
    await prepararBd(caminho, config, {});
    await prepararBd(caminho, null, {});
    expect(existsSync(caminho)).toBe(false);
  });

  it('BD em falta sem RESTAURAR_AO_ARRANCAR mas com cópias no destino → recusa arrancar', async () => {
    const nome = await copiaNoDestino(2);
    // Um objeto fora do formato não conta como cópia.
    writeFileSync(join(pasta, 'destino', 'mapa-guardada-a-mao.db.gz.enc'), 'x');
    const caminho = join(pasta, 'disco', 'mapa.db');
    const erro = await prepararBd(caminho, config, {}).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('já tem 1 cópia(s)');
    expect((erro as Error).message).toContain(nome);
    expect((erro as Error).message).toContain('RESTAURAR_AO_ARRANCAR=ultima');
    expect((erro as Error).message).toContain('RESTAURAR_AO_ARRANCAR=nenhuma');
    expect(existsSync(caminho)).toBe(false);

    // Começar de propósito com uma BD nova: não restaura nem recusa.
    await prepararBd(caminho, config, { RESTAURAR_AO_ARRANCAR: 'nenhuma' });
    expect(existsSync(caminho)).toBe(false);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('base de dados nova'));
  });

  it('BD em falta e o destino não responde → recusa arrancar (sem segredos na mensagem)', async () => {
    const s3: ConfigCopias = {
      chave: CHAVE,
      destino: {
        tipo: 's3',
        endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
        balde: 'balde-teste',
        regiao: 'auto',
        id: 'ID-FALSO',
        segredo: 'SEGREDO-FALSO',
      },
    };
    const erro = await prepararBd(
      join(pasta, 'mapa.db'),
      s3,
      {},
      {
        fetch: async () => {
          throw new TypeError('fetch failed');
        },
      },
    ).catch((e: Error) => e);
    expect((erro as Error).message).toContain('não foi possível ver se há cópias');
    expect((erro as Error).message).not.toContain('SEGREDO-FALSO');
  });

  it('restaurar uma cópia de uma BD vazia avisa', async () => {
    const vazia = join(pasta, 'vazia.db');
    abrirBd(vazia).$client.close();
    await enviarCopia(
      await tirarInstantaneoDoFicheiro(vazia),
      criarDestinoPasta(join(pasta, 'destino')),
      CHAVE,
      'arranque',
      AGORA,
    );
    await prepararBd(join(pasta, 'disco', 'mapa.db'), config, { RESTAURAR_AO_ARRANCAR: 'ultima' });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('não tem nenhuma pessoa'));
  });

  it('nunca substitui uma BD que exista (só avisa que a variável foi ignorada)', async () => {
    await copiaNoDestino(4);
    const caminho = join(pasta, 'mapa.db');
    criarBdDeTeste(caminho, 1);
    const antes = hashDe(caminho);
    await prepararBd(caminho, config, { RESTAURAR_AO_ARRANCAR: 'ultima' });
    expect(hashDe(caminho)).toBe(antes);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('RESTAURAR_AO_ARRANCAR foi ignorada'));
  });

  it('RESTAURAR_AO_ARRANCAR sem cópias configuradas → lança', async () => {
    await expect(
      prepararBd(join(pasta, 'mapa.db'), null, { RESTAURAR_AO_ARRANCAR: 'ultima' }),
    ).rejects.toThrow('as cópias não estão configuradas');
  });

  it('restauro que falha → lança e não deixa BD nenhuma', async () => {
    await copiaNoDestino(2);
    const caminho = join(pasta, 'mapa.db');
    const outraChave = { ...config, chave: new Uint8Array(randomBytes(32)) };
    await expect(prepararBd(caminho, outraChave, { RESTAURAR_AO_ARRANCAR: 'ultima' })).rejects.toThrow(
      'A cópia está danificada ou a chave não é a certa.',
    );
    expect(existsSync(caminho)).toBe(false);
  });

  it('com migrações por aplicar faz uma cópia "migracao" antes; sem migrações não faz', async () => {
    const caminho = join(pasta, 'mapa.db');
    criarBdDeTeste(caminho, 2);
    await prepararBd(caminho, config, {}, { agora: () => AGORA });
    expect(existsSync(join(pasta, 'destino'))).toBe(false);

    // Simula uma BD de uma versão anterior: a última migração ainda não está aplicada.
    const cliente = new Database(caminho);
    cliente.exec(
      'DELETE FROM __drizzle_migrations WHERE created_at = (SELECT MAX(created_at) FROM __drizzle_migrations)',
    );
    cliente.close();
    const ultima = lerJournal().at(-1)?.tag;
    expect(migracoesPendentes(caminho)).toEqual([ultima]);

    await prepararBd(caminho, config, {}, { agora: () => AGORA });
    expect(readdirSync(join(pasta, 'destino'))).toEqual([nomeCopia(AGORA, 'migracao')]);
  });

  it('BD sem a tabela de migrações conta todas como pendentes', () => {
    const caminho = join(pasta, 'vazia.db');
    new Database(caminho).close();
    expect(migracoesPendentes(caminho)).toEqual(lerJournal().map((e) => e.tag));
  });

  it('se a cópia antes de migrar falhar → lança (não se migra sem cópia)', async () => {
    const caminho = join(pasta, 'mapa.db');
    const cliente = new Database(caminho);
    cliente.exec('CREATE TABLE coisas (id INTEGER)');
    cliente.close();
    const s3: ConfigCopias = {
      chave: CHAVE,
      destino: {
        tipo: 's3',
        endpoint: 'https://conta-ficticia.eu.r2.cloudflarestorage.com',
        balde: 'balde-teste',
        regiao: 'auto',
        id: 'ID-FALSO',
        segredo: 'SEGREDO-FALSO',
      },
    };
    const erro = await prepararBd(
      caminho,
      s3,
      {},
      {
        fetch: async () => new Response('<Error><Code>AccessDenied</Code></Error>', { status: 403 }),
      },
    ).catch((e: Error) => e);
    expect(erro).toBeInstanceOf(Error);
    expect((erro as Error).message).toContain('a cópia de segurança antes de migrar falhou');
    expect((erro as Error).message).toContain('HTTP 403, AccessDenied');
    expect((erro as Error).message).not.toContain('SEGREDO-FALSO');
  });

  it('sem cópias configuradas e com migrações por aplicar → só avisa', async () => {
    const caminho = join(pasta, 'mapa.db');
    new Database(caminho).close();
    await prepararBd(caminho, null, {});
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('migra-se sem cópia'));
  });

  it(':memory: não faz nada', async () => {
    await expect(
      prepararBd(':memory:', config, { RESTAURAR_AO_ARRANCAR: 'ultima' }),
    ).resolves.toBeUndefined();
  });
});
