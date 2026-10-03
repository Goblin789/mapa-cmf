import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { estadoFicticio, pessoaFicticia } from './dadosFicticios';
import {
  artigoDoVeiculo,
  comPlural,
  deArtigoDoVeiculo,
  detalheCarrinha,
  formatarData,
  hojeISO,
  nomeCompleto,
  textoApartamento,
  textoCarta,
  textoContrato,
  textoDormida,
  textoLotacao,
  textoMarcaModelo,
  textoTelefone,
} from './textos';

describe('comPlural', () => {
  it('usa o singular só para 1', () => {
    expect(comPlural(1, 'lugar livre', 'lugares livres')).toBe('1 lugar livre');
    expect(comPlural(0, 'lugar livre', 'lugares livres')).toBe('0 lugares livres');
    expect(comPlural(3, 'lugar livre', 'lugares livres')).toBe('3 lugares livres');
  });
});

describe('nomeCompleto', () => {
  it('junta nome e apelidos', () => {
    expect(
      nomeCompleto(pessoaFicticia({ id: 'x', nomeCurto: 'Ana T.', nome: 'Ana', apelidos: 'Teste' })),
    ).toBe('Ana Teste');
  });

  it('cai no nome curto se faltar tudo', () => {
    expect(nomeCompleto(pessoaFicticia({ id: 'x', nomeCurto: 'Ana T.', nome: ' ', apelidos: '' }))).toBe(
      'Ana T.',
    );
  });
});

describe('datas', () => {
  it('hojeISO usa o dia local', () => {
    expect(hojeISO(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('formatarData passa para DD/MM/AAAA', () => {
    expect(formatarData('2027-03-01')).toBe('01/03/2027');
    expect(formatarData('ontem')).toBe('ontem');
  });
});

describe('textoTelefone e textoCarta', () => {
  const base = pessoaFicticia({ id: 'x', nomeCurto: 'Teste' });

  it('sem dados ainda quando não há informação', () => {
    expect(textoTelefone(base)).toBe('sem dados ainda');
    expect(textoTelefone({ ...base, telefone: '  ' })).toBe('sem dados ainda');
    expect(textoCarta(base, '2026-10-03')).toBe('sem dados ainda');
  });

  it('mostra o telefone quando existe', () => {
    expect(textoTelefone({ ...base, telefone: '+000 000 000' })).toBe('+000 000 000');
  });

  it('carta: não tem, sem validade, válida e caducada', () => {
    expect(textoCarta({ ...base, temCarta: false }, '2026-10-03')).toBe('Não tem');
    expect(textoCarta({ ...base, temCarta: true }, '2026-10-03')).toBe('Tem (validade desconhecida)');
    expect(textoCarta({ ...base, temCarta: true, cartaValidade: '2026-10-03' }, '2026-10-03')).toBe(
      'Tem, válida até 03/10/2026',
    );
    expect(textoCarta({ ...base, temCarta: true, cartaValidade: '2026-10-02' }, '2026-10-03')).toBe(
      'Caducou a 02/10/2026',
    );
  });
});

describe('textoContrato', () => {
  const casa = estadoFicticio().casas[0];
  if (!casa) throw new Error('Faltam casas nos dados fictícios');

  it('mostra o máximo e o tolerado', () => {
    expect(textoContrato({ ...casa, maxContrato: 4, tolerado: 6 })).toBe('4 (tolerado 6)');
    expect(textoContrato({ ...casa, maxContrato: 6, tolerado: null })).toBe('6');
    expect(textoContrato({ ...casa, maxContrato: 6, tolerado: 6 })).toBe('6');
    expect(textoContrato({ ...casa, maxContrato: null, tolerado: null })).toBe('não fixado');
  });
});

describe('textoDormida', () => {
  const estado = estadoFicticio();
  const ind = indexar(estado);
  const dormidas = dormidasDasCarrinhas(estado, ind);

  it('sugerida: casa da maioria dos passageiros, com nota', () => {
    expect(textoDormida(dormidas.get('v1'), ind)).toEqual({
      casaId: 'casa-a',
      rotulo: 'Casa A',
      nota: 'sugerido (é onde moram mais passageiros)',
      desconhecida: false,
    });
  });

  it('definida numa casa ou noutro local', () => {
    expect(textoDormida(dormidas.get('v4'), ind)).toEqual({
      casaId: 'casa-b',
      rotulo: 'Casa B',
      nota: null,
      desconhecida: false,
    });
    expect(textoDormida(dormidas.get('v2'), ind)).toEqual({
      casaId: null,
      rotulo: 'Parque Teste',
      nota: null,
      desconhecida: false,
    });
  });

  it('por definir e sem sugestão', () => {
    expect(textoDormida(dormidas.get('v3'), ind)).toMatchObject({
      rotulo: 'Por definir',
      nota: 'Sem sugestão: nenhum passageiro mora numa casa CMF.',
      desconhecida: true,
    });
    expect(textoDormida(undefined, ind).desconhecida).toBe(true);
  });
});

describe('textoLotacao', () => {
  it('lugares livres, cheio ou gente a mais', () => {
    expect(textoLotacao(9, 10)).toBe('1 lugar livre');
    expect(textoLotacao(0, 5)).toBe('5 lugares livres');
    expect(textoLotacao(9, 9)).toBe('cheio');
    expect(textoLotacao(13, 12)).toBe('1 pessoa a mais');
    expect(textoLotacao(12, 8)).toBe('4 pessoas a mais');
  });
});

describe('textoApartamento', () => {
  const estado = estadoFicticio();
  const ind = indexar(estado);
  const casasNaMorada = (id: string) => {
    const casa = ind.casas.get(id);
    if (!casa) throw new Error(`Falta a casa ${id} nos dados fictícios`);
    return [casa, ind.casasPorLocal.get(casa.localId)?.length ?? 1] as const;
  };

  it('mostra o apartamento quando existe', () => {
    const [casa, n] = casasNaMorada('casa-a');
    expect(textoApartamento({ ...casa, apartamento: ' Ap. 2 ' }, n)).toBe('Ap. 2');
  });

  it('numa morada com várias casas, sem apartamento fica "por confirmar"', () => {
    const [casa, n] = casasNaMorada('casa-b');
    expect(n).toBe(2);
    expect(textoApartamento(casa, n)).toBe('por confirmar');
  });

  it('numa casa sozinha na morada não há apartamento a mostrar', () => {
    const [casa, n] = casasNaMorada('casa-c');
    expect(n).toBe(1);
    expect(textoApartamento(casa, n)).toBeNull();
    expect(textoApartamento({ ...casa, apartamento: '  ' }, n)).toBeNull();
  });
});

describe('textoMarcaModelo', () => {
  it('marca e modelo juntos; sem repetir a marca quando o modelo já a tem', () => {
    expect(textoMarcaModelo({ marca: 'Marca', modelo: 'Modelo X' })).toBe('Marca Modelo X');
    expect(textoMarcaModelo({ marca: 'Marca', modelo: 'marca Modelo X' })).toBe('marca Modelo X');
    expect(textoMarcaModelo({ marca: 'Marca', modelo: 'Marcante' })).toBe('Marca Marcante');
    expect(textoMarcaModelo({ marca: ' Marca ', modelo: 'Marca' })).toBe('Marca');
  });

  it('só um dos dois, ou nenhum', () => {
    expect(textoMarcaModelo({ marca: 'Marca', modelo: null })).toBe('Marca');
    expect(textoMarcaModelo({ marca: null, modelo: 'Modelo X' })).toBe('Modelo X');
    expect(textoMarcaModelo({ marca: '  ', modelo: '' })).toBeNull();
    expect(textoMarcaModelo({ marca: null, modelo: null })).toBeNull();
  });
});

describe('artigoDoVeiculo', () => {
  it('a carrinha, o carro', () => {
    expect(artigoDoVeiculo('carrinha')).toBe('a');
    expect(artigoDoVeiculo('carro')).toBe('o');
  });
});

describe('deArtigoDoVeiculo', () => {
  it('condutor da carrinha, condutor do carro', () => {
    expect(deArtigoDoVeiculo('carrinha')).toBe('da');
    expect(deArtigoDoVeiculo('carro')).toBe('do');
  });
});

describe('detalheCarrinha', () => {
  it('ocupação e marca com modelo; sem marca nem modelo, só a ocupação', () => {
    expect(detalheCarrinha({ lugares: 9, marca: 'Marca', modelo: 'Modelo X' }, 3)).toBe(
      '3/9 lugares · Marca Modelo X',
    );
    expect(detalheCarrinha({ lugares: 5, marca: null, modelo: null }, 0)).toBe('0/5 lugares');
  });
});
