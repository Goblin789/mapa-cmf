// lerConfig: modos, validações e omissões (ambientes fictícios; nenhum valor é real).

import { describe, expect, it } from 'vitest';
import { ErroConfig, lerConfig } from './config';

const INQUILINO = '00000000-0000-4000-8000-0000000000aa';

/** Ambiente mínimo do modo entra. */
const ENTRA = {
  ENTRA_INQUILINO: INQUILINO,
  ENTRA_CLIENTE: 'cliente-teste',
  ENTRA_SEGREDO: 'segredo-teste',
  ENDERECO_PUBLICO: 'https://mapa.exemplo.test',
};

/** Ambiente mínimo do modo entra em produção. */
const PRODUCAO = { ...ENTRA, NODE_ENV: 'production', UTILIZADORES_PERMITIDOS: 'ana@exemplo.test' };

function erro(env: NodeJS.ProcessEnv): string {
  try {
    lerConfig(env);
  } catch (e) {
    expect(e).toBeInstanceOf(ErroConfig);
    return (e as Error).message;
  }
  throw new Error('Devia ter recusado a configuração.');
}

describe('modo local', () => {
  it('sem ENTRA_SEGREDO é local, só no próprio PC, com as omissões', () => {
    const c = lerConfig({ ENTRA_INQUILINO: INQUILINO, ENTRA_CLIENTE: 'cliente-teste', ENTRA_SEGREDO: ' ' });
    expect(c).toStrictEqual({
      producao: false,
      porta: 8787,
      bd: 'dados/mapa.db',
      pastaOrigem: '',
      modo: 'local',
      host: '127.0.0.1',
      anfitrioes: ['localhost', '127.0.0.1', '[::1]'],
      enderecoPublico: null,
      entra: null,
      utilizadoresPermitidos: null,
    });
  });

  it('força 127.0.0.1 mesmo com HOST e ignora ENDERECO_PUBLICO', () => {
    const c = lerConfig({
      HOST: '0.0.0.0',
      ENDERECO_PUBLICO: 'https://mapa.exemplo.test',
      ANFITRIOES: 'x.test',
    });
    expect(c.host).toBe('127.0.0.1');
    expect(c.enderecoPublico).toBeNull();
    expect(c.anfitrioes).toStrictEqual(['localhost', '127.0.0.1', '[::1]']);
  });

  it('mantém BD e PASTA_ORIGEM', () => {
    const c = lerConfig({ BD: 'dados/copia.db', PASTA_ORIGEM: 'C:\\Pasta Fictícia' });
    expect(c.bd).toBe('dados/copia.db');
    expect(c.pastaOrigem).toBe('C:\\Pasta Fictícia');
  });

  it('é recusado em produção, dizendo o que falta (sem valores)', () => {
    const msg = erro({ NODE_ENV: 'production', ENTRA_INQUILINO: INQUILINO, ENTRA_CLIENTE: 'c' });
    expect(msg).toMatch(/produção/);
    expect(msg).toContain('ENTRA_SEGREDO');
    expect(msg).not.toContain('ENTRA_CLIENTE');
    expect(msg).not.toContain(INQUILINO);
  });
});

describe('porta', () => {
  it('PORT tem prioridade sobre PORTA; omissão 8787', () => {
    expect(lerConfig({ PORT: '10000', PORTA: '8811' }).porta).toBe(10000);
    expect(lerConfig({ PORTA: '8811' }).porta).toBe(8811);
    expect(lerConfig({ PORT: '', PORTA: '8811' }).porta).toBe(8811);
    expect(lerConfig({}).porta).toBe(8787);
  });

  it.each(['abc', '0', '70000', '80.5', '-1'])('recusa PORTA=%s', (porta) => {
    expect(erro({ PORTA: porta })).toMatch(/PORTA/);
  });
});

describe('modo entra', () => {
  it('com os três ENTRA_* é entra, com o emissor da Microsoft e as omissões', () => {
    const c = lerConfig({ ...ENTRA, ENTRA_INQUILINO: INQUILINO.toUpperCase() });
    expect(c).toStrictEqual({
      producao: false,
      porta: 8787,
      bd: 'dados/mapa.db',
      pastaOrigem: '',
      modo: 'entra',
      host: '127.0.0.1',
      anfitrioes: ['mapa.exemplo.test'],
      enderecoPublico: 'https://mapa.exemplo.test',
      entra: {
        inquilino: INQUILINO,
        cliente: 'cliente-teste',
        segredo: 'segredo-teste',
        emissor: `https://login.microsoftonline.com/${INQUILINO}/v2.0`,
        permitirHttp: false,
      },
      utilizadoresPermitidos: null,
    });
  });

  it('em produção escuta em 0.0.0.0 por omissão; HOST manda', () => {
    expect(lerConfig(PRODUCAO).host).toBe('0.0.0.0');
    expect(lerConfig({ ...PRODUCAO, HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
    expect(lerConfig({ ...ENTRA, HOST: '0.0.0.0' }).host).toBe('0.0.0.0');
  });

  it('ANFITRIOES acrescentam-se ao nome de ENDERECO_PUBLICO (minúsculas, sem repetidos)', () => {
    const c = lerConfig({ ...ENTRA, ANFITRIOES: ' Mapa-CMF.onrender.test , ,mapa.exemplo.test' });
    expect(c.anfitrioes).toStrictEqual(['mapa.exemplo.test', 'mapa-cmf.onrender.test']);
  });

  it.each(['https://x.test', 'x.test:443', 'x.test/a'])('recusa ANFITRIOES=%s', (a) => {
    expect(erro({ ...ENTRA, ANFITRIOES: a })).toMatch(/ANFITRIOES/);
  });

  it('UTILIZADORES_PERMITIDOS em minúsculas, separados por vírgulas', () => {
    const c = lerConfig({
      ...ENTRA,
      UTILIZADORES_PERMITIDOS: ' Ana@Exemplo.test,rui@exemplo.test,, ana@exemplo.test ',
    });
    expect(c.utilizadoresPermitidos).toStrictEqual(['ana@exemplo.test', 'rui@exemplo.test']);
    expect(lerConfig({ ...ENTRA, UTILIZADORES_PERMITIDOS: ' , ' }).utilizadoresPermitidos).toBeNull();
  });

  it('em produção UTILIZADORES_PERMITIDOS é obrigatória (a atribuição no Entra pode estar desligada)', () => {
    expect(erro({ ...PRODUCAO, UTILIZADORES_PERMITIDOS: '' })).toMatch(/UTILIZADORES_PERMITIDOS/);
    expect(erro({ ...PRODUCAO, UTILIZADORES_PERMITIDOS: ' , ' })).toMatch(/UTILIZADORES_PERMITIDOS/);
    expect(lerConfig(PRODUCAO).utilizadoresPermitidos).toStrictEqual(['ana@exemplo.test']);
  });

  it('UTILIZADORES_PERMITIDOS só aceita e-mails', () => {
    expect(erro({ ...ENTRA, UTILIZADORES_PERMITIDOS: 'ana@exemplo.test;rui@exemplo.test' })).toMatch(
      /não é um e-mail/,
    );
    expect(erro({ ...ENTRA, UTILIZADORES_PERMITIDOS: 'ana' })).toMatch(/não é um e-mail/);
  });

  it('sem ENDERECO_PUBLICO recusa', () => {
    expect(erro({ ...ENTRA, ENDERECO_PUBLICO: '' })).toMatch(/ENDERECO_PUBLICO/);
  });

  it.each([
    'mapa.exemplo.test',
    'ftp://mapa.exemplo.test',
    'https://mapa.exemplo.test/mapa',
    'https://mapa.exemplo.test/?a=1',
    'https://utilizador:x@mapa.exemplo.test',
  ])('ENDERECO_PUBLICO tem de ser uma origem http(s): recusa %s', (endereco) => {
    expect(erro({ ...ENTRA, ENDERECO_PUBLICO: endereco })).toMatch(/ENDERECO_PUBLICO/);
  });

  it('ENDERECO_PUBLICO com barra no fim ou porta fica a origem', () => {
    expect(lerConfig({ ...ENTRA, ENDERECO_PUBLICO: 'https://mapa.exemplo.test/' }).enderecoPublico).toBe(
      'https://mapa.exemplo.test',
    );
    const c = lerConfig({ ...ENTRA, ENDERECO_PUBLICO: 'http://localhost:5173' });
    expect(c.enderecoPublico).toBe('http://localhost:5173');
    expect(c.anfitrioes).toStrictEqual(['localhost']);
  });

  it('em produção o ENDERECO_PUBLICO tem de ser https', () => {
    expect(erro({ ...ENTRA, NODE_ENV: 'production', ENDERECO_PUBLICO: 'http://mapa.exemplo.test' })).toMatch(
      /https/,
    );
  });

  it('ENTRA_INQUILINO tem de ser um GUID', () => {
    expect(erro({ ...ENTRA, ENTRA_INQUILINO: 'exemplo.onmicrosoft.com' })).toMatch(/ENTRA_INQUILINO/);
  });

  it('as mensagens nunca mostram o segredo', () => {
    for (const env of [
      { ...ENTRA, ENDERECO_PUBLICO: '' },
      { ...ENTRA, ENTRA_INQUILINO: 'x' },
      { ...ENTRA, ENTRA_EMISSOR: 'http://atacante.test' },
    ]) {
      expect(erro(env)).not.toContain('segredo-teste');
    }
  });
});

describe('ENTRA_EMISSOR (fornecedor falso)', () => {
  it('aceita http://localhost e http://127.0.0.1 fora de produção', () => {
    const c = lerConfig({ ...ENTRA, ENTRA_EMISSOR: 'http://localhost:8890' });
    expect(c.entra).toMatchObject({ emissor: 'http://localhost:8890', permitirHttp: true });
    expect(lerConfig({ ...ENTRA, ENTRA_EMISSOR: 'http://127.0.0.1:8890/' }).entra?.emissor).toBe(
      'http://127.0.0.1:8890',
    );
  });

  it('aceita https noutro sítio (sem permitir http)', () => {
    const c = lerConfig({ ...ENTRA, ENTRA_EMISSOR: 'https://emissor.exemplo.test/v2.0' });
    expect(c.entra).toMatchObject({ emissor: 'https://emissor.exemplo.test/v2.0', permitirHttp: false });
  });

  it.each(['http://emissor.exemplo.test', 'http://192.168.1.5:8890', 'ftp://localhost', 'nada'])(
    'recusa %s',
    (emissor) => {
      expect(erro({ ...ENTRA, ENTRA_EMISSOR: emissor })).toMatch(/ENTRA_EMISSOR/);
    },
  );

  it('é recusado em produção, mesmo em https', () => {
    expect(erro({ ...ENTRA, NODE_ENV: 'production', ENTRA_EMISSOR: 'https://emissor.exemplo.test' })).toMatch(
      /ENTRA_EMISSOR.*produção/,
    );
  });
});

describe('config da importação', () => {
  it('importar o módulo não lê o .env nem valida o login: config só dá a BD e a pasta de origem', async () => {
    const modulo = await import('./config');
    expect(Object.keys(modulo.config).sort()).toStrictEqual(['bd', 'pastaOrigem']);
  });
});
