import { describe, expect, it } from 'vitest';
import { dadosFicticios, folhaExtraFicticia, folhaPessoalFicticia } from './dadosFicticios';
import { lerDadosReferencia } from './executar';
import { lerFolhaExtra, lerFolhaPessoal } from './listaMestra';
import {
  montarEntidades,
  montarReferencias,
  RAIO_CASA_M,
  RAIO_ESTACIONAMENTO_M,
  separarExtras,
} from './montar';
import type { LinhaLista } from './tipos';

function montar(pessoal = lerFolhaPessoal(folhaPessoalFicticia()).linhas, dados = dadosFicticios()) {
  return montarEntidades(pessoal, lerFolhaExtra(folhaExtraFicticia()).linhas, dados);
}

function linha(dados: Partial<LinhaLista>): LinhaLista {
  return {
    folha: 'Pessoal',
    linha: 2,
    numero: null,
    apelidos: 'Teste',
    nome: 'Nome',
    nomeCurto: 'Nome Teste',
    cliente: 'ALFA',
    casa: 'Casa B',
    carrinha: 'BB2222',
    observacoes: null,
    ...dados,
  };
}

describe('montarEntidades', () => {
  it('monta clientes, locais, casas e carrinhas pela ordem dos JSON', () => {
    const { entidades } = montar();
    expect(entidades.clientes.map((c) => [c.id, c.ordem])).toEqual([
      ['alfa', 0],
      ['beta', 1],
    ]);
    expect(entidades.casas.map((c) => [c.id, c.ordem, c.senhorio, c.equipamento])).toEqual([
      ['casa-1-foret', 0, null, null],
      ['casa-b', 1, null, null],
    ]);
    expect(entidades.carrinhas.map((c) => [c.id, c.ordem, c.dormeCasaId, c.temporaria])).toEqual([
      ['AA1111', 0, null, false],
      ['BB2222', 1, null, false],
      ['CC3333', 2, null, false],
    ]);
    expect(entidades.locais.map((l) => [l.id, l.raioM])).toEqual([
      ['local-a', RAIO_CASA_M],
      ['parque', RAIO_ESTACIONAMENTO_M],
    ]);
    expect(entidades.obras).toEqual([]);
  });

  it('lê "sempreCheia" de casas.json (por omissão, false) e as carrinhas entram sem condutor', () => {
    const dados = dadosFicticios();
    const b = dados.casas.find((c) => c.id === 'casa-b');
    if (b) b.sempreCheia = true;
    const { entidades } = montar(undefined, dados);
    expect(entidades.casas.map((c) => [c.id, c.sempreCheia])).toEqual([
      ['casa-1-foret', false],
      ['casa-b', true],
    ]);
    expect(entidades.carrinhas.every((c) => c.condutorId === null)).toBe(true);
  });

  it('valores especiais e casas/carrinhas pelo nome do Excel ou matrícula alternativa', () => {
    const { entidades } = montar();
    const porNome = new Map(entidades.pessoas.map((p) => [p.nomeCurto, p]));
    expect(porNome.get('João Teste')).toMatchObject({ casaId: 'casa-1-foret', carrinhaId: 'AA1111' });
    expect(porNome.get('Maria Teste')).toMatchObject({ casaId: 'casa-b', carrinhaId: 'AA1111' });
    expect(porNome.get('Rui Teste')).toMatchObject({
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      clienteId: 'beta',
      nomesAlternativos: ['Rui Outro'],
    });
  });

  it('casa e carrinha vazias → sem casa/transporte e "a confirmar"', () => {
    const { entidades, pendentes, erros } = montar();
    const pedro = entidades.pessoas.find((p) => p.nomeCurto === 'Pedro Teste');
    expect(pedro).toMatchObject({
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: true,
      carrinhaAConfirmar: true,
    });
    const pendente = pendentes.find((x) => x.nomeCurto === 'Pedro Teste');
    expect(pendente?.motivos).toHaveLength(2);
    expect(pendente?.observacoes).toBe('sem dados');
    expect(erros.filter((x) => x.mensagem.startsWith('Pedro'))).toEqual([]);
  });

  it('casa e matrícula desconhecidas → erro não bloqueante e "a confirmar"', () => {
    const { entidades, erros } = montar();
    const ze = entidades.pessoas.find((p) => p.nomeCurto === 'Zé Teste');
    expect(ze).toMatchObject({
      casaId: null,
      carrinhaId: null,
      casaAConfirmar: true,
      carrinhaAConfirmar: true,
    });
    const errosZe = erros.filter((x) => x.mensagem.startsWith('Zé Teste'));
    expect(errosZe.map((x) => x.bloqueante)).toEqual([false, false]);
    expect(errosZe[0]?.mensagem).toContain('Casa Inexistente');
    expect(errosZe[1]?.mensagem).toContain('XX0000');
  });

  it('cliente desconhecido → erro bloqueante e a pessoa não entra', () => {
    const r = montar([linha({ cliente: 'ÓMEGA' }), linha({ nomeCurto: 'Outra Pessoa', cliente: null })]);
    expect(r.entidades.pessoas.map((p) => p.nomeCurto)).toEqual(['Ana Extra']);
    expect(r.erros.filter((x) => x.bloqueante)).toHaveLength(2);
    expect(r.erros[0]?.mensagem).toContain('ÓMEGA');
  });

  it('Nº: guarda o original, tira espaços e mantém o sufixo', () => {
    const { entidades, normalizacoes } = montar();
    const rui = entidades.pessoas.find((p) => p.nomeCurto === 'Rui Teste');
    expect(rui).toMatchObject({ numero: '900-002_3', numeroOriginal: '900- 002_3', id: 'p-900-002_3' });
    const numeros = entidades.pessoas.map((p) => p.numero);
    expect(numeros).toContain('900-001');
    expect(numeros).toContain('900-001_2');
    expect(normalizacoes).toContainEqual({
      tipo: 'numero',
      de: '900- 002_3',
      para: '900-002_3',
      pessoas: 1,
      nota: 'Rui Teste',
    });
  });

  it('regista as normalizações de casas, matrículas e nomes alternativos', () => {
    const { normalizacoes } = montar();
    expect(normalizacoes).toContainEqual({
      tipo: 'casa',
      de: 'Casa 1 Rue de la Foret',
      para: 'Casa 1 Rue de la Forêt',
      pessoas: 1,
      nota: null,
    });
    expect(normalizacoes).toContainEqual({
      tipo: 'carrinha',
      de: 'ZZ9999',
      para: 'AA1111',
      pessoas: 1,
      nota: null,
    });
    expect(normalizacoes).toContainEqual(
      expect.objectContaining({ tipo: 'nomeAlternativo', de: 'Rui Teste', para: 'Rui Outro' }),
    );
  });

  it('Nº repetido depois de normalizar → erro bloqueante', () => {
    const r = montar([
      linha({ numero: '900-005', nomeCurto: 'Um Teste' }),
      linha({ numero: '900- 005', nomeCurto: 'Dois Teste' }),
    ]);
    const bloqueantes = r.erros.filter((x) => x.bloqueante);
    expect(bloqueantes).toHaveLength(1);
    expect(bloqueantes[0]?.mensagem).toContain('Nº repetido');
  });

  it('nome curto repetido (mesmo sem acentos) → erro bloqueante', () => {
    const r = montar([linha({ nomeCurto: 'José Teste' }), linha({ nomeCurto: 'Jose teste' })]);
    expect(r.erros.filter((x) => x.bloqueante).map((x) => x.mensagem)).toEqual([
      'Nome curto repetido: "José Teste", "Jose teste".',
    ]);
    // Os ids continuam únicos.
    expect(new Set(r.entidades.pessoas.map((p) => p.id)).size).toBe(r.entidades.pessoas.length);
  });

  it('ids estáveis: não dependem da ordem das linhas', () => {
    const linhas = lerFolhaPessoal(folhaPessoalFicticia()).linhas;
    const ids = (ls: LinhaLista[]) =>
      Object.fromEntries(montar(ls).entidades.pessoas.map((p) => [p.nomeCurto, p.id]));
    expect(ids(linhas)).toEqual(ids([...linhas].reverse()));
    expect(ids(linhas)).toMatchObject({
      'João Teste': 'p-900-001',
      'Maria Teste': 'p-900-001_2',
      'Pedro Teste': 'p-pedro-teste',
      'Ana Extra': 'p-ana-extra',
    });
  });

  it('ids estáveis mesmo quando dois nomes dão a mesma base (o "-2" não depende da ordem)', () => {
    const linhas = [
      linha({ nomeCurto: 'Ana-Rita Teste', linha: 2 }),
      linha({ nomeCurto: 'Ana Rita Teste', linha: 3 }),
      linha({ numero: '900/050', nomeCurto: 'Um Teste', linha: 4 }),
      linha({ numero: '900-050', nomeCurto: 'Dois Teste', linha: 5 }),
    ];
    const ids = (ls: LinhaLista[]) =>
      Object.fromEntries(montar(ls).entidades.pessoas.map((p) => [p.nomeCurto, p.id]));
    expect(ids(linhas)).toEqual(ids([...linhas].reverse()));
    expect(ids(linhas)).toMatchObject({
      'Ana Rita Teste': 'p-ana-rita-teste',
      'Ana-Rita Teste': 'p-ana-rita-teste-2',
      'Dois Teste': 'p-900-050',
      'Um Teste': 'p-900-050-2',
    });
  });

  it('extra com cliente desconhecido: erro bloqueante e não conta como incluído', () => {
    const extras = [linha({ folha: 'Não estão na lista', nomeCurto: 'Ana Extra', cliente: 'ÓMEGA' })];
    const r = montarEntidades(lerFolhaPessoal(folhaPessoalFicticia()).linhas, extras, dadosFicticios());
    expect(r.erros.filter((x) => x.bloqueante)).toHaveLength(1);
    expect(r.extrasIncluidos).toEqual([]);
    expect(r.entidades.pessoas.some((p) => p.nomeCurto === 'Ana Extra')).toBe(false);
  });

  it('extras: só entram os de extrasAIncluir', () => {
    const r = montar();
    expect(r.extrasIncluidos.map((l) => l.nomeCurto)).toEqual(['Ana Extra']);
    expect(r.extrasExcluidos.map((l) => l.nomeCurto)).toEqual(['Bruno Fora']);
    const ana = r.entidades.pessoas.find((p) => p.nomeCurto === 'Ana Extra');
    expect(ana).toMatchObject({
      numero: null,
      numeroOriginal: null,
      nome: 'Ana',
      apelidos: 'Extra',
      clienteId: 'beta',
      casaId: 'casa-b',
      carrinhaId: 'BB2222',
    });
    expect(r.entidades.pessoas).toHaveLength(6);
    expect(r.entidades.pessoas.some((p) => p.nomeCurto === 'Bruno Fora')).toBe(false);
  });

  it('extra configurado que não está na folha → aviso', () => {
    const dados = dadosFicticios();
    dados.importacao.extrasAIncluir = ['Ana Extra', 'Ninguém Teste'];
    const r = montar(undefined, dados);
    expect(r.erros).toContainEqual(
      expect.objectContaining({ bloqueante: false, mensagem: expect.stringContaining('Ninguém Teste') }),
    );
    expect(separarExtras([], ['X']).emFalta).toEqual(['X']);
  });

  it('campos sem fonte ficam vazios e as pessoas ativas', () => {
    for (const p of montar().entidades.pessoas) {
      expect(p).toMatchObject({
        telefone: null,
        temCarta: null,
        cartaValidade: null,
        obraId: null,
        ativa: true,
      });
    }
  });

  it('local sem coordenadas ou casa com local inexistente → erro bloqueante', () => {
    const dados = dadosFicticios();
    const local = dados.locais[0];
    if (local) local.lat = null;
    const casa = dados.casas[1];
    if (casa) casa.localId = 'nao-existe';
    const r = montar(undefined, dados);
    const mensagens = r.erros.filter((x) => x.bloqueante).map((x) => x.mensagem);
    expect(mensagens).toHaveLength(2);
    expect(mensagens[0]).toContain('sem coordenadas');
    expect(mensagens[1]).toContain('nao-existe');
  });
});

describe('veículos: tipo e marca (carrinhas.json)', () => {
  it('lê o tipo e a marca; sem tipo é carrinha e sem marca fica null', () => {
    const dados = dadosFicticios();
    const [aa, bb, cc] = dados.carrinhas;
    if (aa) Object.assign(aa, { tipo: 'carro', marca: 'Marca Fictícia' });
    if (bb) Object.assign(bb, { tipo: 'carrinha', marca: '  ' });
    // cc fica sem tipo nem marca (como os JSON antigos).
    expect(cc?.tipo).toBeUndefined();
    const { entidades, erros } = montar(undefined, dados);
    expect(erros.filter((e) => e.bloqueante)).toEqual([]);
    expect(entidades.carrinhas.map((c) => [c.id, c.tipo, c.marca, c.modelo])).toEqual([
      ['AA1111', 'carro', 'Marca Fictícia', 'Modelo X'],
      ['BB2222', 'carrinha', null, null],
      ['CC3333', 'carrinha', null, null],
    ]);
  });

  it('tipo desconhecido → erro bloqueante (não passa a carrinha em silêncio)', () => {
    const dados = dadosFicticios();
    const aa = dados.carrinhas[0];
    if (aa) aa.tipo = 'Carro';
    const { erros } = montarReferencias(dados);
    expect(erros).toEqual([
      {
        bloqueante: true,
        mensagem: 'Tipo de veículo desconhecido "Carro" (tem de ser carrinha ou carro).',
        onde: 'dados-iniciais/carrinhas.json (AA1111)',
      },
    ]);
  });

  it('montarReferencias dá o mesmo que a importação, sem precisar das pessoas', () => {
    const dados = dadosFicticios();
    const { referencias, erros } = montarReferencias(dados);
    const { entidades } = montar(undefined, dados);
    expect(erros).toEqual([]);
    expect(referencias).toEqual({
      clientes: entidades.clientes,
      locais: entidades.locais,
      casas: entidades.casas,
      carrinhas: entidades.carrinhas,
    });
  });

  it('os dados iniciais do projeto montam sem erros e todos os veículos têm um tipo conhecido', () => {
    const { referencias, erros } = montarReferencias(lerDadosReferencia());
    expect(erros).toEqual([]);
    expect(referencias.carrinhas.length).toBeGreaterThan(0);
    for (const c of lerDadosReferencia().carrinhas) expect(['carrinha', 'carro']).toContain(c.tipo);
  });
});
