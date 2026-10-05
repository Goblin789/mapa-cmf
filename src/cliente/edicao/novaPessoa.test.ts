// Nova pessoa (M2): o nome no mapa proposto, o registo, o passo (criar + casa + carrinha) e os erros.
// Só dados fictícios (dominio/teste-fabrica.ts).

import { describe, expect, it } from 'vitest';
import { validarRegisto } from '../../dominio/campos';
import { indexar } from '../../dominio/indices';
import { aplicarOperacoes, compactarOperacoes, validarOperacoes } from '../../dominio/operacoes';
import { pesquisar } from '../../dominio/pesquisa';
import { estadoExemplo } from '../../dominio/teste-fabrica';
import {
  type DadosNovaPessoa,
  errosNovaPessoa,
  passoNovaPessoa,
  pessoaNova,
  proporNomeNoMapa,
} from '../paineis/fichas';
import { nomeCompleto } from '../paineis/textos';
import { linhasDaTabela } from '../vistas/linhasTabela';

const ID = 'pessoa-0000aaaa-1111-2222-3333-444455556666';

function dados(parcial: Partial<DadosNovaPessoa> = {}): DadosNovaPessoa {
  return {
    nome: 'Zita',
    apelidos: 'Maria Fictícia',
    nomeNoMapa: 'Zita F.',
    numero: '',
    clienteId: 'cliente-a',
    telefone: '',
    carta: 'nao-sei',
    validade: '',
    casaId: null,
    carrinhaId: null,
    ...parcial,
  };
}

describe('proporNomeNoMapa', () => {
  it('1.º nome e a inicial do último apelido', () => {
    expect(proporNomeNoMapa('Ana Maria', 'Silva Teixeira')).toBe('Ana T.');
    expect(proporNomeNoMapa('  zé ', ' óscar ')).toBe('zé Ó.');
    expect(proporNomeNoMapa('Ana', '')).toBe('Ana');
    expect(proporNomeNoMapa('', 'Teixeira Silva')).toBe('Teixeira');
    expect(proporNomeNoMapa(' ', ' ')).toBe('');
  });
});

describe('pessoaNova', () => {
  it('na forma que o domínio aceita: sem casa, carrinha nem obra, ativa, sem marcas, vazios a null', () => {
    const p = pessoaNova(dados({ numero: '  ', telefone: ' 691 000 000 ', nome: ' Zita  Ana ' }), ID);
    expect(p).toMatchObject({
      id: ID,
      nome: 'Zita Ana',
      numero: null,
      numeroOriginal: null,
      telefone: '691 000 000',
      casaId: null,
      carrinhaId: null,
      obraId: null,
      ativa: true,
      casaAConfirmar: false,
      carrinhaAConfirmar: false,
      nomesAlternativos: [],
      temCarta: null,
      cartaValidade: null,
    });
    expect(validarRegisto('pessoa', p)).toEqual([]);
  });

  it('a validade da carta só fica com "Tem"', () => {
    expect(pessoaNova(dados({ carta: 'tem', validade: '2027-03-01' }), ID)).toMatchObject({
      temCarta: true,
      cartaValidade: '2027-03-01',
    });
    expect(pessoaNova(dados({ carta: 'nao-tem', validade: '2027-03-01' }), ID)).toMatchObject({
      temCarta: false,
      cartaValidade: null,
    });
  });
});

describe('passoNovaPessoa', () => {
  it('cria e, no mesmo passo, põe na casa e na carrinha escolhidas', () => {
    const estado = estadoExemplo();
    const passo = passoNovaPessoa(estado, dados({ casaId: 'casa-3', carrinhaId: 'zz1003' }), ID);
    expect(passo.map((op) => op.tipo)).toEqual(['registo', 'mover', 'mover']);
    expect(passo.slice(1)).toEqual([
      { tipo: 'mover', pessoaId: ID, campo: 'casaId', de: null, para: 'casa-3' },
      { tipo: 'mover', pessoaId: ID, campo: 'carrinhaId', de: null, para: 'zz1003' },
    ]);
    expect(validarOperacoes(estado, passo)).toEqual([]);
    const final = aplicarOperacoes(estado, passo);
    expect(final.pessoas.find((p) => p.id === ID)).toMatchObject({
      casaId: 'casa-3',
      carrinhaId: 'zz1003',
      ativa: true,
    });
    // Ao guardar, compactar não dobra os 'mover' na criação: o servidor aplica-os depois de criar.
    expect(compactarOperacoes(passo).map((op) => op.tipo)).toEqual(['registo', 'mover', 'mover']);
  });

  it('sem casa nem carrinha, só a criação (fica fora das casas e sem transporte)', () => {
    const passo = passoNovaPessoa(estadoExemplo(), dados(), ID);
    expect(passo).toHaveLength(1);
    expect(passo[0]).toMatchObject({ tipo: 'registo', entidade: 'pessoa', id: ID, de: null });
  });
});

describe('errosNovaPessoa', () => {
  it('pede o que falta (o nome e o nome no mapa; os apelidos são opcionais) e o cliente', () => {
    const estado = estadoExemplo();
    expect(errosNovaPessoa(estado, dados({ apelidos: ' ', nomeNoMapa: '' }), ID)).toEqual([
      'Falta o nome no mapa.',
    ]);
    expect(errosNovaPessoa(estado, dados({ nome: '', apelidos: '', nomeNoMapa: '' }), ID)).toEqual([
      'Faltam o nome e o nome no mapa.',
    ]);
    expect(errosNovaPessoa(estado, dados({ clienteId: '' }), ID)).toEqual(['Falta escolher o cliente.']);
    // O nome no mapa repetido vê-se logo, junto com o que falta.
    expect(errosNovaPessoa(estado, dados({ clienteId: '', nomeNoMapa: 'Gil N.' }), ID)).toEqual([
      'Falta escolher o cliente.',
      'Nome no mapa repetido: já há outra pessoa com «Gil N.».',
    ]);
  });

  it('o nome no mapa e o nº são únicos (sem acentos nem maiúsculas)', () => {
    const estado = estadoExemplo();
    expect(errosNovaPessoa(estado, dados({ nomeNoMapa: 'ana t.' }), ID)).toEqual([
      'Nome no mapa repetido: já há outra pessoa com «Ana T.».',
    ]);
    const comNumero = {
      ...estado,
      pessoas: estado.pessoas.map((p) => (p.id === 'p-ana' ? { ...p, numero: '900-001' } : p)),
    };
    expect(errosNovaPessoa(comNumero, dados({ numero: '900-001' }), ID)).toEqual([
      'O nº 900-001 já é de Ana T..',
    ]);
  });

  it('a validade tem de ser um dia que exista', () => {
    expect(errosNovaPessoa(estadoExemplo(), dados({ carta: 'tem', validade: '2027-02-30' }), ID)).toEqual([
      'Carta válida até: tem de ser um dia que exista (AAAA-MM-DD).',
    ]);
  });

  it('um passo completo e válido não tem erros', () => {
    expect(
      errosNovaPessoa(estadoExemplo(), dados({ casaId: 'casa-3', carrinhaId: 'zz1001', carta: 'tem' }), ID),
    ).toEqual([]);
  });
});

describe('pessoa nova sem apelidos (opcionais: o Rafael, 05/10/2026)', () => {
  const semApelidos = dados({ nome: 'Zita', apelidos: '  ', nomeNoMapa: proporNomeNoMapa('Zita', '  ') });

  it('o nome no mapa proposto é só o nome; o registo leva "" e o domínio aceita-o', () => {
    expect(semApelidos.nomeNoMapa).toBe('Zita');
    expect(errosNovaPessoa(estadoExemplo(), semApelidos, ID)).toEqual([]);
    const p = pessoaNova(semApelidos, ID);
    expect(p).toMatchObject({ nome: 'Zita', apelidos: '', nomeCurto: 'Zita' });
    expect(validarRegisto('pessoa', p)).toEqual([]);
  });

  it('os nomes funcionam sem apelidos: nome completo, Tabela (e Excel), pesquisa', () => {
    const estado = estadoExemplo();
    const final = aplicarOperacoes(estado, passoNovaPessoa(estado, semApelidos, ID));
    const p = final.pessoas.find((x) => x.id === ID);
    if (!p) throw new Error('A pessoa nova não entrou');
    // Sem espaço a mais no fim.
    expect(nomeCompleto(p)).toBe('Zita');
    const ind = indexar(final);
    const linha = linhasDaTabela(final, ind).find((l) => l.pessoa.id === ID);
    expect(linha).toMatchObject({ nome: 'Zita', nomeCompleto: 'Zita', nomeMostrado: 'Zita' });
    expect(pesquisar(final, ind, 'zita')[0]).toMatchObject({ tipo: 'pessoa', id: ID });
  });
});
