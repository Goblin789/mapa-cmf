import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { aplicarOperacoes, chaveDormida, type Operacao } from '../../dominio/operacoes';
import { criarCasa, criarLocal, estadoExemplo } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import {
  CHAVE_POR_DEFINIR,
  contagens,
  filtrarSitios,
  montarSitiosDormida,
  operacaoConfirmarSugestao,
  operacoesConfirmarSugestoes,
  rotuloConfirmarSugestao,
  rotuloMudarDormida,
  sitiosEscolhiveis,
  sugestaoDeDormida,
  textoConfirmarSugestoes,
  tituloDormida,
} from './ondeDorme';

const dormida = (carrinhaId: string, de: string | null, para: string | null): Operacao => ({
  tipo: 'dormida',
  carrinhaId,
  de,
  para,
});

function contexto(estado: Estado = estadoExemplo()) {
  const ind = indexar(estado);
  return { estado, ind, dormidas: dormidasDasCarrinhas(estado, ind) };
}

describe('sugestaoDeDormida', () => {
  it('a casa da maioria dos passageiros, mesmo quando já está definido onde dorme', () => {
    const { estado, ind } = contexto();
    // ZZ 1001: 2 passageiros na Casa Um, 1 na Casa Dois, 1 fora das casas.
    expect(sugestaoDeDormida(estado, ind, 'zz1001')).toBe('casa-1');
    // ZZ 1002 dorme no Parque (definido), mas os passageiros moram na Casa Um e na Casa Dois (empate → ordem).
    expect(sugestaoDeDormida(estado, ind, 'zz1002')).toBe('casa-1');
  });

  it('sem passageiros que morem numa casa CMF (ou carrinha que não existe): null', () => {
    const { estado, ind } = contexto();
    // ZZ 1003 só leva uma pessoa inativa.
    expect(sugestaoDeDormida(estado, ind, 'zz1003')).toBeNull();
    expect(sugestaoDeDormida(estado, ind, 'nao-existe')).toBeNull();
  });
});

describe('montarSitiosDormida', () => {
  it('Por definir; casas da mesma morada num grupo com o nome da morada; casas sozinhas; outros locais', () => {
    const { estado, ind, dormidas } = contexto();
    const grupos = montarSitiosDormida(estado, ind, dormidas, 'zz1001');
    expect(grupos.map((g) => [g.titulo, g.sitios.map((s) => s.chave)])).toStrictEqual([
      ['Por definir', [CHAVE_POR_DEFINIR]],
      ['Casas — Morada A', ['casa:casa-1', 'casa:casa-2']],
      ['Casas', ['casa:casa-3']],
      // Obras não entram; estacionamentos (e outros tipos que não casas) sim.
      ['Outros locais', ['local:local-parque']],
    ]);
  });

  it('a opção atual, a sugerida, os passageiros que moram em cada casa e as outras carrinhas', () => {
    const { estado, ind, dormidas } = contexto();
    const sitios = montarSitiosDormida(estado, ind, dormidas, 'zz1001').flatMap((g) => g.sitios);
    const por = (chave: string) => sitios.find((s) => s.chave === chave);
    expect(por(CHAVE_POR_DEFINIR)).toMatchObject({
      valor: null,
      atual: true,
      rotulo: 'Por definir (usar a sugestão)',
      detalhe: 'O mapa usa a sugestão: Casa Um',
    });
    expect(por('casa:casa-1')).toMatchObject({
      valor: 'casa:casa-1',
      atual: false,
      sugerida: true,
      passageirosAqui: 2,
      outrasCarrinhas: 0,
      // Numa morada com várias casas, o detalhe é o apartamento (aqui não há).
      detalhe: null,
    });
    expect(por('casa:casa-2')).toMatchObject({ sugerida: false, passageirosAqui: 1 });
    // Numa casa sozinha, o detalhe é a morada.
    expect(por('casa:casa-3')?.detalhe).toMatch(/Rue Fictícia/);
    // A ZZ 1002 dorme no Parque.
    expect(por('local:local-parque')).toMatchObject({
      tipo: 'local',
      outrasCarrinhas: 1,
      detalhe: expect.stringMatching(/^estacionamento · /),
    });
  });

  it('numa carrinha com sítio definido, esse é o atual e "Por definir" pode escolher-se', () => {
    const { estado, ind, dormidas } = contexto();
    const grupos = montarSitiosDormida(estado, ind, dormidas, 'zz1002');
    const atuais = grupos.flatMap((g) => g.sitios.filter((s) => s.atual).map((s) => s.chave));
    expect(atuais).toStrictEqual(['local:local-parque']);
    expect(sitiosEscolhiveis(grupos).map((s) => s.chave)).toStrictEqual([
      CHAVE_POR_DEFINIR,
      'casa:casa-1',
      'casa:casa-2',
      'casa:casa-3',
    ]);
    // A ZZ 1001 dorme (sugerido) na Casa Um: conta como outra carrinha lá.
    expect(grupos[1]?.sitios[0]?.outrasCarrinhas).toBe(1);
  });

  it('sem sugestão, "Por definir" diz porquê', () => {
    const { estado, ind, dormidas } = contexto();
    const [porDefinir] = montarSitiosDormida(estado, ind, dormidas, 'zz1003')[0]?.sitios ?? [];
    expect(porDefinir?.detalhe).toBe('Sem sugestão: nenhum passageiro mora numa casa CMF');
  });

  it('casas sozinhas seguidas ficam no mesmo grupo; uma morada com várias casas parte a sequência', () => {
    const base = estadoExemplo();
    const estado: Estado = {
      ...base,
      locais: [...base.locais, criarLocal({ id: 'local-c', nome: 'Morada C' })],
      casas: [
        criarCasa({ id: 's1', nome: 'Sozinha 1', localId: 'local-b', ordem: 1 }),
        criarCasa({ id: 's2', nome: 'Sozinha 2', localId: 'local-c', ordem: 2 }),
        criarCasa({ id: 'j1', nome: 'Junta 1', localId: 'local-a', ordem: 3, apartamento: 'Ap. 1' }),
        criarCasa({ id: 'j2', nome: 'Junta 2', localId: 'local-a', ordem: 5 }),
        criarCasa({ id: 's3', nome: 'Sozinha 3', localId: 'local-obra', ordem: 4 }),
      ],
    };
    const { ind, dormidas } = contexto(estado);
    const grupos = montarSitiosDormida(estado, ind, dormidas, 'zz1001');
    expect(grupos.slice(1, 4).map((g) => [g.titulo, g.sitios.map((s) => s.rotulo)])).toStrictEqual([
      ['Casas', ['Sozinha 1', 'Sozinha 2']],
      ['Casas — Morada A', ['Junta 1', 'Junta 2']],
      ['Casas', ['Sozinha 3']],
    ]);
    expect(grupos[2]?.sitios[0]?.detalhe).toBe('Ap. 1');
    // As chaves dos grupos são únicas (servem de key e de id no ecrã).
    const chaves = grupos.map((g) => g.chave);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it('um local de outro tipo onde a carrinha já dorme também aparece (para se ver o atual)', () => {
    const { estado } = contexto();
    const comObra = aplicarOperacoes(estado, [dormida('zz1001', null, 'local:local-obra')]);
    const c = contexto(comObra);
    const locais = montarSitiosDormida(comObra, c.ind, c.dormidas, 'zz1001').at(-1);
    expect(locais?.sitios.map((s) => [s.chave, s.atual])).toStrictEqual([
      ['local:local-obra', true],
      ['local:local-parque', false],
    ]);
  });

  it('carrinha que não existe: nada', () => {
    const { estado, ind, dormidas } = contexto();
    expect(montarSitiosDormida(estado, ind, dormidas, 'nao-existe')).toStrictEqual([]);
  });
});

describe('filtrarSitios', () => {
  const { estado, ind, dormidas } = contexto();
  const grupos = montarSitiosDormida(estado, ind, dormidas, 'zz1001');
  const chaves = (texto: string) => filtrarSitios(grupos, texto).flatMap((g) => g.sitios.map((s) => s.chave));

  it('sem texto, tudo; com texto, pelo nome, morada ou tipo, sem acentos nem maiúsculas', () => {
    expect(chaves('   ')).toHaveLength(5);
    expect(chaves('casa tres')).toStrictEqual(['casa:casa-3']);
    expect(chaves('MORADA a')).toStrictEqual(['casa:casa-1', 'casa:casa-2']);
    expect(chaves('estacionamento')).toStrictEqual(['local:local-parque']);
    expect(chaves('sugestao')).toStrictEqual([CHAVE_POR_DEFINIR]);
    expect(chaves('nada disto')).toStrictEqual([]);
  });

  it('os grupos vazios saem', () => {
    expect(filtrarSitios(grupos, 'parque').map((g) => g.titulo)).toStrictEqual(['Outros locais']);
  });
});

describe('confirmar sugestões', () => {
  it('uma carrinha: a casa sugerida passa a definida; sem sugestão, null', () => {
    const { estado, dormidas } = contexto();
    expect(operacaoConfirmarSugestao(estado, dormidas, 'zz1001')).toStrictEqual(
      dormida('zz1001', null, 'casa:casa-1'),
    );
    // Definida (ZZ 1002) ou desconhecida (ZZ 1003): não há sugestão a confirmar.
    expect(operacaoConfirmarSugestao(estado, dormidas, 'zz1002')).toBeNull();
    expect(operacaoConfirmarSugestao(estado, dormidas, 'zz1003')).toBeNull();
  });

  it('todas: só as sugeridas, pela ordem das carrinhas; depois de aplicar, já não há nenhuma', () => {
    const base = estadoExemplo();
    // A ZZ 1002 fica por definir (os passageiros moram na Casa Um e na Casa Dois: sugere-se a Casa Um).
    // A ZZ 1003 só leva uma pessoa inativa: continua sem sugestão.
    const estado = aplicarOperacoes(base, [dormida('zz1002', 'local:local-parque', null)]);
    const { dormidas } = contexto(estado);
    const ops = operacoesConfirmarSugestoes(estado, dormidas);
    expect(ops).toStrictEqual([
      dormida('zz1001', null, 'casa:casa-1'),
      dormida('zz1002', null, 'casa:casa-1'),
    ]);
    const depois = aplicarOperacoes(estado, ops);
    expect(depois.carrinhas.map((c) => chaveDormida(c))).toStrictEqual(['casa:casa-1', 'casa:casa-1', null]);
    expect(operacoesConfirmarSugestoes(depois, contexto(depois).dormidas)).toStrictEqual([]);
  });

  it('textos', () => {
    expect(textoConfirmarSugestoes(1)).toBe('Confirmar a sugestão de 1 carrinha');
    expect(textoConfirmarSugestoes(22)).toBe('Confirmar a sugestão de 22 carrinhas');
    expect(tituloDormida({ matricula: 'ZZ1001', tipo: 'carrinha' })).toBe('Onde dorme a ZZ 1001');
    expect(tituloDormida({ matricula: 'ZZ1001', tipo: 'carro' })).toBe('Onde dorme o ZZ 1001');
  });

  it('rótulos dos botões da ficha: artigo do carro ("o") e da carrinha ("a")', () => {
    expect(rotuloMudarDormida({ matricula: 'ZZ1001', tipo: 'carrinha' })).toBe('Mudar onde dorme a ZZ 1001…');
    expect(rotuloMudarDormida({ matricula: 'ZZ1002', tipo: 'carro' })).toBe('Mudar onde dorme o ZZ 1002…');
    expect(rotuloConfirmarSugestao({ matricula: 'ZZ1001', tipo: 'carrinha' }, 'Casa Um')).toBe(
      'Confirmar a sugestão: a ZZ 1001 dorme em Casa Um',
    );
    expect(rotuloConfirmarSugestao({ matricula: 'ZZ1002', tipo: 'carro' }, null)).toBe(
      'Confirmar a sugestão: o ZZ 1002 dorme em casa sugerida',
    );
  });
});

describe('contagens', () => {
  it('passageiros que moram no sítio e outras carrinhas que lá dormem', () => {
    expect(contagens({ passageirosAqui: 2, outrasCarrinhas: 3 })).toBe(
      '2 passageiros moram aqui · dormem aqui outras 3 carrinhas',
    );
    expect(contagens({ passageirosAqui: 1, outrasCarrinhas: 0 })).toBe('1 passageiro mora aqui');
    expect(contagens({ passageirosAqui: 0, outrasCarrinhas: 1 })).toBe('dorme aqui outra carrinha');
    expect(contagens({ passageirosAqui: 0, outrasCarrinhas: 0 })).toBeNull();
  });
});
