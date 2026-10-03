import { describe, expect, it } from 'vitest';
import {
  alteracoesDoPlano,
  CAMPO_CONDUTOR,
  CAMPO_DORMIDA,
  contarPlano,
  descreverAlteracaoDosDados,
  formatarValor,
  frasesDoPlano,
  planearSincronizacao,
  planoVazio,
  resumoDoPlano,
  rotuloVeiculo,
  textoContagem,
} from './sincronizar';
import { estadoFicticio, referenciaFicticia } from './sincronizarFicticios';
import type { DadosReferencia } from './tipos';

/** Os dados fictícios com uma mudança. */
function dadosCom(mudar: (d: DadosReferencia) => void): DadosReferencia {
  const d = referenciaFicticia();
  mudar(d);
  return d;
}

describe('planearSincronizacao', () => {
  it('sem diferenças: plano vazio, mesmo com as edições feitas no programa', () => {
    const plano = planearSincronizacao(referenciaFicticia(), estadoFicticio());
    expect(plano.erros).toEqual([]);
    expect(planoVazio(plano)).toBe(true);
    expect(alteracoesDoPlano(plano)).toEqual([]);
    expect(frasesDoPlano(plano, estadoFicticio())).toEqual([]);
  });

  it('atualiza só os campos dos JSON (condutor, onde dorme, temporária, senhorio e equipamento ficam)', () => {
    const dados = dadosCom((d) => {
      const zz1002 = d.carrinhas.find((c) => c.id === 'ZZ1002');
      if (zz1002) Object.assign(zz1002, { marca: 'Marca B', modelo: 'Modelo B', tipo: 'carro', lugares: 7 });
      const casa = d.casas.find((c) => c.id === 'casa-um');
      if (casa) Object.assign(casa, { lotacao: 5, notaContrato: 'Nota nova.' });
      const alfa = d.clientes.find((c) => c.id === 'alfa');
      if (alfa) alfa.cor = '#F5D0D0';
      const rua = d.locais.find((l) => l.id === 'rua-a');
      if (rua) rua.lat = 49.61;
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(plano.erros).toEqual([]);
    expect(plano.alterados).toEqual([
      {
        entidade: 'local',
        id: 'rua-a',
        rotulo: 'Local Rua A',
        mudancas: [{ campo: 'lat', antes: 49.6, depois: 49.61 }],
      },
      {
        entidade: 'cliente',
        id: 'alfa',
        rotulo: 'Cliente Alfa',
        mudancas: [{ campo: 'cor', antes: '#F0C0C0', depois: '#F5D0D0' }],
      },
      {
        entidade: 'casa',
        id: 'casa-um',
        rotulo: 'Casa Um',
        mudancas: [
          { campo: 'lotacao', antes: 4, depois: 5 },
          { campo: 'notaContrato', antes: null, depois: 'Nota nova.' },
        ],
      },
      {
        entidade: 'carrinha',
        id: 'ZZ1002',
        rotulo: 'Carro ZZ 1002',
        mudancas: [
          { campo: 'tipo', antes: 'carrinha', depois: 'carro' },
          { campo: 'marca', antes: null, depois: 'Marca B' },
          { campo: 'modelo', antes: null, depois: 'Modelo B' },
          { campo: 'lugares', antes: 5, depois: 7 },
        ],
      },
    ]);
    expect(plano.semTransporte).toEqual([]);
    expect(plano.condutoresRetirados).toEqual([]);
  });

  it('novos registos entram pela ordem do JSON (e a ordem dos que vêm depois muda)', () => {
    const dados = dadosCom((d) => {
      d.locais.push({
        id: 'rua-b',
        tipo: 'casa',
        nome: 'Rua B',
        morada: '3 Rua Fictícia',
        pais: 'FR',
        lat: 49.1,
        lng: 6.2,
      });
      d.casas.push({
        id: 'casa-quatro',
        nome: 'Casa Quatro',
        nomeExcel: 'Casa Quatro',
        localId: 'rua-b',
        apartamento: null,
        lotacao: 6,
        moradoresDoc: null,
        maxContrato: null,
        tolerado: null,
        notaContrato: null,
      });
      d.carrinhas.unshift({
        id: 'ZZ1000',
        matricula: 'ZZ1000',
        matriculasAlternativas: [],
        tipo: 'carrinha',
        marca: 'Marca N',
        modelo: 'Modelo N',
        lugares: 9,
        pessoasDoc: 0,
        nota: null,
      });
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(plano.novos.locais.map((l) => [l.id, l.raioM])).toEqual([['rua-b', 150]]);
    expect(plano.novos.casas.map((c) => [c.id, c.ordem, c.senhorio, c.sempreCheia])).toEqual([
      ['casa-quatro', 3, null, false],
    ]);
    expect(plano.novos.carrinhas).toEqual([
      expect.objectContaining({
        id: 'ZZ1000',
        ordem: 0,
        condutorId: null,
        dormeCasaId: null,
        temporaria: false,
      }),
    ]);
    expect(plano.alterados.map((a) => [a.id, a.mudancas])).toEqual([
      ['ZZ1001', [{ campo: 'ordem', antes: 0, depois: 1 }]],
      ['ZZ1002', [{ campo: 'ordem', antes: 1, depois: 2 }]],
      ['ZZ1003', [{ campo: 'ordem', antes: 2, depois: 3 }]],
    ]);
    expect(frasesDoPlano(plano, estadoFicticio())).toEqual([
      'Carrinha ZZ 1000 entra na frota: Marca N Modelo N, 9 lugares',
      'Casa Quatro nova: lotação 6, em Rua B',
      'Local Rua B novo: 3 Rua Fictícia',
      'Ordem atualizada como nos JSON: 3 veículos',
    ]);
  });

  it('veículo que sai da frota: quem lá ia fica sem transporte (a confirmar) e o condutor é retirado', () => {
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(plano.erros).toEqual([]);
    expect(plano.removidos.carrinhas.map((c) => c.id)).toEqual(['ZZ1002']);
    expect(plano.semTransporte).toEqual([
      { pessoaId: 'p-rui', nomeCurto: 'Rui Fictício', carrinhaId: 'ZZ1002', aConfirmarAntes: false },
      { pessoaId: 'p-eva', nomeCurto: 'Eva Fictícia', carrinhaId: 'ZZ1002', aConfirmarAntes: true },
    ]);
    expect(plano.condutoresRetirados).toEqual([
      { carrinhaId: 'ZZ1002', pessoaId: 'p-rui', nomeCurto: 'Rui Fictício' },
    ]);
    // A ZZ1003 passa para a posição da ZZ1002.
    expect(plano.alterados).toEqual([
      expect.objectContaining({ id: 'ZZ1003', mudancas: [{ campo: 'ordem', antes: 2, depois: 1 }] }),
    ]);
    expect(frasesDoPlano(plano, estadoFicticio())[0]).toBe(
      'Carrinha ZZ 1002 sai da frota: 2 pessoas ficam sem transporte (a confirmar); condutor retirado',
    );
    expect(resumoDoPlano(plano)).toBe(
      'Sincronização dos dados iniciais. Veículos: 1 atualizado, 1 sai da frota. ' +
        '2 pessoas ficam sem transporte (a confirmar). 1 condutor retirado.',
    );
  });

  it('veículo vazio que sai: "não levava ninguém"', () => {
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1003');
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(frasesDoPlano(plano, estadoFicticio())).toEqual([
      'Carro ZZ 1003 sai da frota: não levava ninguém',
    ]);
    expect(plano.semTransporte).toEqual([]);
    expect(plano.condutoresRetirados).toEqual([]);
  });

  it('casa sem moradores sai e a carrinha que lá dormia fica com onde dorme por definir', () => {
    const dados = dadosCom((d) => {
      d.casas = d.casas.filter((c) => c.id !== 'casa-tres');
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(plano.erros).toEqual([]);
    expect(plano.removidos.casas.map((c) => c.id)).toEqual(['casa-tres']);
    expect(plano.dormidasRetiradas).toEqual([{ carrinhaId: 'ZZ1001', casaId: 'casa-tres' }]);
    expect(frasesDoPlano(plano, estadoFicticio())[0]).toBe(
      'Casa Três sai (sem moradores); 1 carrinha que lá dormia fica com onde dorme por definir',
    );
  });

  it('erros bloqueantes: casa com moradores, cliente com pessoas ou obras, JSON inválido', () => {
    const dados = dadosCom((d) => {
      d.casas = d.casas.filter((c) => c.id !== 'casa-um');
      d.clientes = d.clientes.filter((c) => c.id === 'gama');
      const zz1003 = d.carrinhas.find((c) => c.id === 'ZZ1003');
      if (zz1003) zz1003.tipo = 'mota';
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(plano.erros.every((e) => e.bloqueante)).toBe(true);
    expect(plano.erros.map((e) => e.mensagem)).toEqual([
      'Tipo de veículo desconhecido "mota" (tem de ser carrinha ou carro).',
      'O cliente "Alfa" já não está em clientes.json, mas tem 2 pessoas e 1 obra: não pode sair. ' +
        'Volte a pô-lo no JSON, ou mude primeiro essas pessoas/obras de cliente.',
      'O cliente "Beta" já não está em clientes.json, mas tem 2 pessoas: não pode sair. ' +
        'Volte a pô-lo no JSON, ou mude primeiro essas pessoas/obras de cliente.',
      'A casa "Casa Um" já não está em casas.json, mas tem 2 moradores: não pode sair. ' +
        'Volte a pô-la no JSON, ou mude primeiro os moradores no programa.',
    ]);
    expect(contarPlano(plano).erros).toBe(4);
  });

  it('veículo temporário que não está no JSON (carro de substituição) fica, com quem lá vai e o condutor', () => {
    // Sem mudanças nos JSON: o temporário não "sai da frota".
    const semMudancas = planearSincronizacao(referenciaFicticia(), estadoFicticio());
    expect(semMudancas.temporariasSoNaBd.map((c) => c.id)).toEqual(['ZZ1008']);
    expect(semMudancas.removidos.carrinhas).toEqual([]);
    expect(planoVazio(semMudancas)).toBe(true);

    // Mesmo quando outros veículos saem e a casa onde ele dorme sai.
    const estado = estadoFicticio();
    estado.carrinhas = estado.carrinhas.map((c) =>
      c.id === 'ZZ1008' ? { ...c, dormeLocalId: null, dormeCasaId: 'casa-tres' } : c,
    );
    const plano = planearSincronizacao(
      dadosCom((d) => {
        d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
        d.casas = d.casas.filter((c) => c.id !== 'casa-tres');
      }),
      estado,
    );
    expect(plano.erros).toEqual([]);
    expect(plano.removidos.carrinhas.map((c) => c.id)).toEqual(['ZZ1002']);
    expect(plano.semTransporte.map((s) => s.pessoaId)).toEqual(['p-rui', 'p-eva']);
    expect(plano.condutoresRetirados.map((c) => c.carrinhaId)).toEqual(['ZZ1002']);
    // Fica, mas deixa de dormir na casa que sai (como as outras carrinhas).
    expect(plano.dormidasRetiradas).toEqual([
      { carrinhaId: 'ZZ1001', casaId: 'casa-tres' },
      { carrinhaId: 'ZZ1008', casaId: 'casa-tres' },
    ]);
  });

  it('a matrícula de um temporário não pode aparecer no JSON (erro bloqueante, em vez de rebentar ao gravar)', () => {
    const plano = planearSincronizacao(
      dadosCom((d) => {
        d.carrinhas.push({
          id: 'ZZ1018',
          matricula: 'ZZ1008',
          matriculasAlternativas: [],
          tipo: 'carro',
          marca: null,
          modelo: null,
          lugares: 5,
          pessoasDoc: 0,
          nota: null,
        });
      }),
      estadoFicticio(),
    );
    expect(plano.erros).toEqual([
      {
        bloqueante: true,
        mensagem:
          'A matrícula ZZ 1008 de carrinhas.json já é do veículo temporário "ZZ1008" (criado no programa): ' +
          'não pode haver duas iguais.',
        onde: 'dados-iniciais/carrinhas.json (ZZ1018)',
      },
    ]);
  });

  it('JSON vazio: erro bloqueante (não tira a frota, as casas ou os clientes todos de uma vez)', () => {
    const plano = planearSincronizacao(
      dadosCom((d) => {
        d.carrinhas = [];
      }),
      estadoFicticio(),
    );
    expect(plano.erros.map((e) => [e.mensagem, e.onde])).toEqual([
      [
        'carrinhas.json está vazio: assim saía tudo o que lá estava. Confirme o ficheiro antes de sincronizar.',
        'dados-iniciais/carrinhas.json',
      ],
    ]);
    const semCasasNemClientes = planearSincronizacao(
      dadosCom((d) => {
        d.casas = [];
        d.clientes = [];
      }),
      estadoFicticio(),
    );
    expect(semCasasNemClientes.erros.map((e) => e.onde).slice(0, 2)).toEqual([
      'dados-iniciais/clientes.json',
      'dados-iniciais/casas.json',
    ]);
    // Uma base de dados só com temporários: um carrinhas.json vazio não tira nada.
    const estado = estadoFicticio();
    estado.carrinhas = estado.carrinhas.filter((c) => c.temporaria);
    estado.pessoas = estado.pessoas.map((p) => (p.carrinhaId === 'ZZ1008' ? p : { ...p, carrinhaId: null }));
    const soTemporarias = planearSincronizacao(
      dadosCom((d) => {
        d.carrinhas = [];
      }),
      estado,
    );
    expect(soTemporarias.erros).toEqual([]);
    expect(soTemporarias.removidos.carrinhas).toEqual([]);
  });

  it('locais que só existem na base de dados ficam (nunca se apagam)', () => {
    const dados = dadosCom((d) => {
      d.locais = d.locais.filter((l) => l.id !== 'parque');
    });
    const plano = planearSincronizacao(dados, estadoFicticio());
    expect(plano.erros).toEqual([]);
    expect(planoVazio(plano)).toBe(true);
    expect(plano.locaisSoNaBd.map((l) => l.id)).toEqual(['parque']);
    expect(frasesDoPlano(plano, estadoFicticio())).toEqual([
      'Local Parque só existe na base de dados: fica (os locais nunca se apagam)',
    ]);
  });
});

describe('alteracoesDoPlano', () => {
  it('uma linha por campo: primeiro as pessoas, o condutor e onde dorme; depois o que sai, entra e muda; a ordem no fim', () => {
    const dados = dadosCom((d) => {
      d.carrinhas = d.carrinhas.filter((c) => c.id !== 'ZZ1002');
      d.casas = d.casas.filter((c) => c.id !== 'casa-tres');
      d.carrinhas.push({
        id: 'ZZ1009',
        matricula: 'ZZ1009',
        matriculasAlternativas: [],
        tipo: 'carro',
        marca: 'Marca N',
        modelo: null,
        lugares: 5,
        pessoasDoc: 0,
        nota: null,
      });
      const alfa = d.clientes.find((c) => c.id === 'alfa');
      if (alfa) alfa.cor = '#F5D0D0';
    });
    const linhas = alteracoesDoPlano(planearSincronizacao(dados, estadoFicticio()));
    expect(linhas).toEqual([
      { entidade: 'pessoa', entidadeId: 'p-rui', campo: 'carrinhaId', antes: '"ZZ1002"', depois: 'null' },
      {
        entidade: 'pessoa',
        entidadeId: 'p-rui',
        campo: 'carrinhaAConfirmar',
        antes: 'false',
        depois: 'true',
      },
      // A Eva já estava "a confirmar": só muda a carrinha.
      { entidade: 'pessoa', entidadeId: 'p-eva', campo: 'carrinhaId', antes: '"ZZ1002"', depois: 'null' },
      { entidade: 'carrinha', entidadeId: 'ZZ1002', campo: CAMPO_CONDUTOR, antes: '"p-rui"', depois: 'null' },
      {
        entidade: 'carrinha',
        entidadeId: 'ZZ1001',
        campo: CAMPO_DORMIDA,
        antes: '"casa:casa-tres"',
        depois: 'null',
      },
      // O que sai: os campos com valor, depois = null (deixou de existir).
      { entidade: 'carrinha', entidadeId: 'ZZ1002', campo: 'matricula', antes: '"ZZ1002"', depois: null },
      {
        entidade: 'carrinha',
        entidadeId: 'ZZ1002',
        campo: 'matriculasAlternativas',
        antes: '["QQ9002"]',
        depois: null,
      },
      { entidade: 'carrinha', entidadeId: 'ZZ1002', campo: 'tipo', antes: '"carrinha"', depois: null },
      { entidade: 'carrinha', entidadeId: 'ZZ1002', campo: 'lugares', antes: '5', depois: null },
      { entidade: 'carrinha', entidadeId: 'ZZ1002', campo: 'nota', antes: '"Nota fictícia."', depois: null },
      {
        entidade: 'carrinha',
        entidadeId: 'ZZ1002',
        campo: CAMPO_DORMIDA,
        antes: '"local:parque"',
        depois: null,
      },
      { entidade: 'casa', entidadeId: 'casa-tres', campo: 'nome', antes: '"Casa Três"', depois: null },
      { entidade: 'casa', entidadeId: 'casa-tres', campo: 'localId', antes: '"rua-a"', depois: null },
      { entidade: 'casa', entidadeId: 'casa-tres', campo: 'lotacao', antes: '2', depois: null },
      // O que entra: antes = null (não existia).
      { entidade: 'carrinha', entidadeId: 'ZZ1009', campo: 'matricula', antes: null, depois: '"ZZ1009"' },
      { entidade: 'carrinha', entidadeId: 'ZZ1009', campo: 'tipo', antes: null, depois: '"carro"' },
      { entidade: 'carrinha', entidadeId: 'ZZ1009', campo: 'marca', antes: null, depois: '"Marca N"' },
      { entidade: 'carrinha', entidadeId: 'ZZ1009', campo: 'lugares', antes: null, depois: '5' },
      { entidade: 'cliente', entidadeId: 'alfa', campo: 'cor', antes: '"#F0C0C0"', depois: '"#F5D0D0"' },
      // A ordem fica no fim (a de quem entra não se regista: é só a posição no JSON).
      { entidade: 'carrinha', entidadeId: 'ZZ1003', campo: 'ordem', antes: '2', depois: '1' },
    ]);
  });
});

describe('textos', () => {
  it('rótulos, valores e contagens', () => {
    expect(rotuloVeiculo({ tipo: 'carro', matricula: 'ZZ1003' })).toBe('Carro ZZ 1003');
    expect(rotuloVeiculo({ tipo: 'carrinha', matricula: 'ZZ1001' })).toBe('Carrinha ZZ 1001');
    expect(formatarValor(null)).toBe('—');
    expect(formatarValor(true)).toBe('sim');
    expect(formatarValor([])).toBe('—');
    expect(formatarValor(['QQ1', 'QQ2'])).toBe('QQ1, QQ2');
    expect(formatarValor(49.61)).toBe('49,61');
    expect(formatarValor('rua-a', () => 'Rua A', 'localId')).toBe('Rua A');
    expect(textoContagem({ novos: 1, alterados: 2, removidos: 0 })).toBe('1 novo, 2 atualizados');
    expect(textoContagem({ novos: 0, alterados: 0, removidos: 0 })).toBe('sem mudanças');
  });

  it('frase do histórico para os campos dos dados iniciais (null para as linhas das pessoas e do condutor)', () => {
    const estado = estadoFicticio();
    expect(
      descreverAlteracaoDosDados(estado, {
        entidade: 'carrinha',
        entidadeId: 'ZZ1001',
        campo: 'marca',
        antes: 'null',
        depois: '"Marca B"',
      }),
    ).toBe('ZZ 1001 — marca: — → Marca B');
    expect(
      descreverAlteracaoDosDados(estado, {
        entidade: 'carrinha',
        entidadeId: 'ZZ1009',
        campo: 'modelo',
        antes: null,
        depois: '"Modelo N"',
      }),
    ).toBe('ZZ 1009 — modelo: Modelo N (entrou)');
    expect(
      descreverAlteracaoDosDados(estado, {
        entidade: 'casa',
        entidadeId: 'casa-um',
        campo: 'localId',
        antes: '"rua-a"',
        depois: null,
      }),
    ).toBe('Casa Um — local: Rua A (saiu)');
    expect(
      descreverAlteracaoDosDados(estado, {
        entidade: 'carrinha',
        entidadeId: 'ZZ1001',
        campo: CAMPO_CONDUTOR,
        antes: '"p-ana"',
        depois: 'null',
      }),
    ).toBeNull();
    expect(
      descreverAlteracaoDosDados(estado, {
        entidade: 'pessoa',
        entidadeId: 'p-ana',
        campo: 'nome',
        antes: '"A"',
        depois: '"B"',
      }),
    ).toBeNull();
  });
});
