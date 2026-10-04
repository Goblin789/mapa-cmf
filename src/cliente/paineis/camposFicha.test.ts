// Editores das fichas (M2): ler o que se escreveu num campo, o texto com que o campo abre e a validação de
// um passo antes de o aplicar. Só dados fictícios (dominio/teste-fabrica.ts).

import { describe, expect, it } from 'vitest';
import { formatarMatricula } from '../../dominio/matricula';
import { operacaoCampo } from '../../dominio/operacoes';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import {
  type EditorCampo,
  errosDoPasso,
  lerValorEditado,
  normalizarMatricula,
  textoParaEditar,
} from './fichas';
import { rotuloDoCampo, textoMorada } from './textos';

const texto = (opcional: boolean): EditorCampo => ({ tipo: 'texto', opcional, max: 80 });
const inteiro = (nulo: boolean, min = 0, max = 60): EditorCampo => ({ tipo: 'inteiro', nulo, min, max });

describe('lerValorEditado', () => {
  it('apara os textos; nos opcionais o vazio é null (nunca "")', () => {
    expect(lerValorEditado(texto(true), '  691 000 000  ')).toEqual({ valor: '691 000 000' });
    expect(lerValorEditado(texto(true), '   ')).toEqual({ valor: null });
    // Nos obrigatórios fica "" e o domínio recusa ("não pode ficar vazio").
    expect(lerValorEditado(texto(false), '  ')).toEqual({ valor: '' });
  });

  it('uma colagem com quebras de linha fica numa linha', () => {
    expect(lerValorEditado(texto(true), 'Rua A\r\n2.º andar')).toEqual({ valor: 'Rua A 2.º andar' });
  });

  it('números inteiros dentro dos limites; vazio só quando pode ficar vazio', () => {
    expect(lerValorEditado(inteiro(false), ' 9 ')).toEqual({ valor: 9 });
    expect(lerValorEditado(inteiro(true), '')).toEqual({ valor: null });
    expect(lerValorEditado(inteiro(false), '')).toEqual({ erro: 'falta o número.' });
    expect(lerValorEditado(inteiro(false), '8,5')).toEqual({
      erro: 'tem de ser um número inteiro de 0 a 60.',
    });
    expect(lerValorEditado(inteiro(false, 1, 20), '0')).toEqual({
      erro: 'tem de ser um número inteiro de 1 a 20.',
    });
    expect(lerValorEditado(inteiro(false), '-3')).toHaveProperty('erro');
  });

  it('matrículas em maiúsculas, na forma dos dados iniciais; as outras separadas por vírgulas', () => {
    expect(normalizarMatricula(' cf 5001 ')).toBe('CF5001');
    expect(normalizarMatricula('cf-5001')).toBe('CF5001');
    expect(normalizarMatricula('ab  12 cd')).toBe('AB 12 CD');
    expect(lerValorEditado({ tipo: 'matricula' }, 'zz 1001')).toEqual({ valor: 'ZZ1001' });
    expect(lerValorEditado({ tipo: 'matriculas' }, 'qq 9999, , ab-12;')).toEqual({
      valor: ['QQ9999', 'AB12'],
    });
    expect(lerValorEditado({ tipo: 'matriculas' }, '  ')).toEqual({ valor: [] });
  });

  it('listas e sim/não', () => {
    const opcoes: EditorCampo = {
      tipo: 'escolha',
      opcoes: [
        { valor: 'carrinha', rotulo: 'Carrinha' },
        { valor: 'carro', rotulo: 'Carro' },
      ],
    };
    expect(lerValorEditado(opcoes, 'carro')).toEqual({ valor: 'carro' });
    expect(lerValorEditado(opcoes, '')).toEqual({ erro: 'falta escolher.' });
    expect(lerValorEditado({ tipo: 'simNao' }, 'sim')).toEqual({ valor: true });
    expect(lerValorEditado({ tipo: 'simNao' }, 'nao')).toEqual({ valor: false });
  });
});

describe('textoParaEditar', () => {
  it('abre com o valor atual: matrículas formatadas, listas por vírgulas, vazio = ""', () => {
    expect(textoParaEditar({ tipo: 'matricula' }, 'ZZ1001', formatarMatricula)).toBe('ZZ 1001');
    expect(textoParaEditar({ tipo: 'matriculas' }, ['QQ9999', 'AB12'], formatarMatricula)).toBe(
      'QQ 9999, AB 12',
    );
    expect(textoParaEditar(texto(true), null, formatarMatricula)).toBe('');
    expect(textoParaEditar(inteiro(true), 8, formatarMatricula)).toBe('8');
    expect(textoParaEditar({ tipo: 'simNao' }, false, formatarMatricula)).toBe('nao');
  });

  it('o que abre e se aplica sem mudar nada não dá operação (a matrícula guardada fica igual)', () => {
    const estado = estadoExemplo();
    const aberto = textoParaEditar({ tipo: 'matricula' }, 'ZZ1001', formatarMatricula);
    const lido = lerValorEditado({ tipo: 'matricula' }, aberto);
    expect(lido).toEqual({ valor: 'ZZ1001' });
    expect(operacaoCampo(estado, 'carrinha', 'zz1001', 'matricula', 'ZZ1001')).toBeNull();
  });
});

describe('errosDoPasso', () => {
  it('passa um passo válido', () => {
    const estado = estadoExemplo();
    const op = operacaoCampo(estado, 'casa', 'casa-1', 'lotacao', 4);
    expect(op).not.toBeNull();
    expect(errosDoPasso(estado, 'casa', 'casa-1', op ? [op] : [])).toEqual([]);
  });

  it('as frases do domínio sem o nome do registo à frente (está à vista na ficha)', () => {
    const estado = estadoExemplo();
    const tolerado = operacaoCampo(estado, 'casa', 'casa-1', 'tolerado', 1);
    expect(errosDoPasso(estado, 'casa', 'casa-1', tolerado ? [tolerado] : [])).toEqual([
      'O tolerado (1) não pode ser menor do que o máx. do contrato (2).',
    ]);
    const nome = operacaoCampo(estado, 'pessoa', 'p-ana', 'nomeCurto', 'bruno e.');
    expect(errosDoPasso(estado, 'pessoa', 'p-ana', nome ? [nome] : [])).toEqual([
      'Nome no mapa repetido: já há outra pessoa com «Bruno E.».',
    ]);
    const matricula = operacaoCampo(estado, 'carrinha', 'zz1001', 'matricula', 'ZZ1002');
    expect(errosDoPasso(estado, 'carrinha', 'zz1001', matricula ? [matricula] : [])).toEqual([
      'Já há outro veículo com esta matrícula.',
    ]);
  });
});

describe('rótulos e morada', () => {
  it('o rótulo do domínio com maiúscula', () => {
    expect(rotuloDoCampo('pessoa', 'nomeCurto')).toBe('Nome no mapa');
    expect(rotuloDoCampo('casa', 'maxContrato')).toBe('Máx. do contrato');
  });

  it('a morada com o país quando não é o Luxemburgo; sem morada, o nome do local', () => {
    expect(textoMorada({ morada: '1 Rue X', pais: 'LU', nome: 'Casa' })).toBe('1 Rue X');
    expect(textoMorada({ morada: '1 Rue X', pais: 'FR', nome: 'Casa' })).toBe('1 Rue X (FR)');
    expect(textoMorada({ morada: ' ', pais: 'LU', nome: 'Estaleiro' })).toBe('Estaleiro');
  });
});
