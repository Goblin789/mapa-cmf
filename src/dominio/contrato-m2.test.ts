// Testes do CONTRATO DO M2 (docs/m2.md): o que a interface já pode usar. O módulo base acrescenta os
// testes completos (compactar com dobras, validar, conflitos escondidos, frases, reverter) nos ficheiros de
// cada módulo do domínio. Dados fictícios.

import { describe, expect, it } from 'vitest';
import { dentroDaRegiao, LIMITES, localCriadoNoPrograma, RAIO_OMISSAO, REGIAO_MAPA } from './campos';
import { dataNoLuxemburgo, eDia, formatarDiaMes, somarDias } from './datas';
import { indexar } from './indices';
import {
  indisponiveisEm,
  operacoesMarcarIndisponivel,
  operacoesTerminarPeriodo,
  periodosSobrepoem,
  textoAte,
  textoPeriodo,
} from './indisponibilidade';
import { lugaresTemporarios, ocupacaoDaCarrinha, textoLugaresTemporarios } from './ocupacao';
import {
  aplicarOperacoes,
  chaveOperacao,
  compactarOperacoes,
  encontrarConflitos,
  novoId,
  type Operacao,
  operacaoApagar,
  operacaoCampo,
  operacaoCriar,
  operacaoSemEfeito,
  valoresIguais,
} from './operacoes';
import {
  AVISO_COMENTARIO_SEM_MOTIVO,
  avisoTextoProblema,
  avisoTextoSaude,
  operacaoNovoProblema,
  problemasDe,
} from './problemas';
import {
  criarCarrinha,
  criarCasa,
  criarEstado,
  criarIndisponibilidade,
  criarLocal,
  criarObra,
  criarPessoa,
  criarProblema,
} from './teste-fabrica';

describe('datas (M2)', () => {
  it('o dia é o do Luxemburgo, não o UTC', () => {
    // 22:30 UTC em outubro (hora de verão, UTC+2) já é o dia seguinte no Luxemburgo.
    expect(dataNoLuxemburgo(new Date('2026-10-04T22:30:00Z'))).toBe('2026-10-05');
    expect(dataNoLuxemburgo(new Date('2026-10-04T10:00:00Z'))).toBe('2026-10-04');
  });

  it('valida, soma e formata dias', () => {
    expect(eDia('2026-02-28')).toBe(true);
    expect(eDia('2026-02-30')).toBe(false);
    expect(eDia('2026-10-04T10:00')).toBe(false);
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30');
    expect(formatarDiaMes('2026-10-12')).toBe('12/10');
  });
});

describe('indisponível (M2)', () => {
  const casa = criarCasa({ id: 'casa-a', lotacao: 4 });
  const carrinha = criarCarrinha({ id: 'zz1001', lugares: 5 });
  const ana = criarPessoa({ id: 'p-ana', nomeCurto: 'Ana T.', casaId: 'casa-a', carrinhaId: 'zz1001' });
  const rui = criarPessoa({ id: 'p-rui', nomeCurto: 'Rui S.', casaId: 'casa-a', carrinhaId: 'zz1001' });
  const ferias = criarIndisponibilidade({
    id: 'i1',
    pessoaId: 'p-ana',
    inicio: '2026-10-01',
    fim: '2026-10-12',
  });
  const estado = criarEstado({
    casas: [casa],
    carrinhas: [carrinha],
    pessoas: [ana, rui],
    indisponibilidades: [ferias],
  });

  it('liberta o lugar na carrinha mas não a cama na casa', () => {
    const ind = indexar(estado, '2026-10-04');
    expect([...ind.indisponiveis.keys()]).toEqual(['p-ana']);
    expect(ind.passageiros.get('zz1001')?.length).toBe(2);
    expect(ind.ocupadosCarrinha.get('zz1001')).toBe(1);
    expect(ocupacaoDaCarrinha(ind, carrinha).ocupados).toBe(1);
    expect(ind.moradores.get('casa-a')?.length).toBe(2);
  });

  it('o lugar libertado é só até a pessoa voltar ("1 livre até 12/10")', () => {
    const ind = indexar(estado, '2026-10-04');
    const lugares = lugaresTemporarios(ind, 'zz1001');
    expect(lugares).toEqual([{ pessoaId: 'p-ana', ate: '2026-10-12' }]);
    expect(textoLugaresTemporarios(lugares)).toBe('1 livre até 12/10');
    expect(textoLugaresTemporarios([...lugares, { pessoaId: 'x', ate: null }])).toBe(
      '1 livre até 12/10 · 1 sem data de regresso',
    );
    expect(textoLugaresTemporarios([{ pessoaId: 'x', ate: null }])).toBe('1 livre (sem data de regresso)');
    expect(textoLugaresTemporarios(lugaresTemporarios(indexar(estado, null), 'zz1001'))).toBeNull();
  });

  it('sem hoje ninguém está indisponível; fora do período também não', () => {
    expect(indexar(estado).ocupadosCarrinha.get('zz1001')).toBe(2);
    expect(indisponiveisEm(estado, '2026-10-13').size).toBe(0);
  });

  it('textos e sobreposições', () => {
    expect(textoAte(ferias)).toBe('até 12/10');
    expect(textoAte({ ...ferias, fim: null })).toBe('sem data de regresso');
    expect(textoPeriodo(ferias)).toBe('01/10 a 12/10');
    expect(periodosSobrepoem(ferias, { ...ferias, id: 'i2', inicio: '2026-10-12', fim: null })).toBe(true);
    expect(periodosSobrepoem(ferias, { ...ferias, id: 'i2', inicio: '2026-10-13', fim: null })).toBe(false);
  });

  it('marcar cria um período por pessoa; "já voltou" acaba ontem ou apaga o que começou hoje', () => {
    const ops = operacoesMarcarIndisponivel(['p-rui', 'p-rui'], '2026-10-05', null, () => 'x');
    expect(ops).toEqual([
      {
        tipo: 'registo',
        entidade: 'indisponibilidade',
        id: 'indisp-x',
        de: null,
        para: { id: 'indisp-x', pessoaId: 'p-rui', inicio: '2026-10-05', fim: null },
      },
    ]);
    expect(operacoesTerminarPeriodo(estado, 'i1', '2026-10-04')).toEqual([
      {
        tipo: 'campo',
        entidade: 'indisponibilidade',
        id: 'i1',
        campo: 'fim',
        de: '2026-10-12',
        para: '2026-10-03',
      },
    ]);
    expect(operacoesTerminarPeriodo(estado, 'i1', '2026-10-01')[0]).toMatchObject({
      tipo: 'registo',
      para: null,
    });
    expect(operacoesTerminarPeriodo(estado, 'i1', '2026-10-20')).toEqual([]);
  });
});

describe('operações do M2 (o que já está no contrato)', () => {
  const local = criarLocal({ id: 'local-obra', tipo: 'obra' });
  const casa = criarCasa({ id: 'casa-a', lotacao: 4 });
  const ana = criarPessoa({ id: 'p-ana', nomeCurto: 'Ana T.' });
  const estado = criarEstado({ locais: [local], casas: [casa], pessoas: [ana] });

  it('campo: lê o `de` do estado; nada quando o valor é o mesmo', () => {
    expect(operacaoCampo(estado, 'casa', 'casa-a', 'lotacao', 5)).toEqual({
      tipo: 'campo',
      entidade: 'casa',
      id: 'casa-a',
      campo: 'lotacao',
      de: 4,
      para: 5,
    });
    expect(operacaoCampo(estado, 'casa', 'casa-a', 'lotacao', 4)).toBeNull();
    expect(operacaoCampo(estado, 'casa', 'nao-existe', 'lotacao', 4)).toBeNull();
  });

  it('sem efeito compara pelo conteúdo (listas e registos)', () => {
    const op: Operacao = {
      tipo: 'campo',
      entidade: 'carrinha',
      id: 'x',
      campo: 'matriculasAlternativas',
      de: ['A1'],
      para: ['A1'],
    };
    expect(operacaoSemEfeito(op)).toBe(true);
  });

  it('registos iguais com as chaves por outra ordem, ou sem a chave em vez de null, são iguais', () => {
    const obra = criarObra({ id: 'obra-x1', localId: 'local-obra', estacionamentoLocalId: null });
    const outraOrdem = Object.fromEntries(Object.entries(obra).reverse());
    const semNulos = Object.fromEntries(Object.entries(obra).filter(([, v]) => v !== null));
    expect(valoresIguais(obra, outraOrdem)).toBe(true);
    expect(valoresIguais(obra, semNulos)).toBe(true);
    expect(valoresIguais(undefined, null)).toBe(true);
    expect(valoresIguais(['A1', 'B2'], ['B2', 'A1'])).toBe(false);
    expect(valoresIguais(obra, { ...obra, nome: 'Outra' })).toBe(false);
    // Apagar com o registo noutra ordem não dá um 409 falso.
    const comObra = criarEstado({ locais: [local], obras: [obra] });
    const apagar = { tipo: 'registo', entidade: 'obra', id: obra.id, de: outraOrdem, para: null } as Operacao;
    expect(encontrarConflitos(comObra, [apagar])).toEqual([]);
  });

  it('a chave da operação junta o mesmo campo do mesmo registo', () => {
    const a = operacaoCampo(estado, 'casa', 'casa-a', 'lotacao', 5) as Operacao;
    const b = operacaoCampo(estado, 'casa', 'casa-a', 'lotacao', 6) as Operacao;
    const c = operacaoCampo(estado, 'casa', 'casa-a', 'nome', 'Outra') as Operacao;
    expect(chaveOperacao(a)).toBe(chaveOperacao(b));
    expect(chaveOperacao(a)).not.toBe(chaveOperacao(c));
  });

  it('compactar junta os campos e anula criar + apagar', () => {
    const obra = criarObra({ id: novoId('obra', () => 'n1'), localId: 'local-obra' });
    const criar = operacaoCriar('obra', obra);
    const apagar = { ...criar, de: obra, para: null } as Operacao;
    const a = operacaoCampo(estado, 'casa', 'casa-a', 'lotacao', 5) as Operacao;
    const b = { ...a, de: 5, para: 6 } as Operacao;
    expect(compactarOperacoes([a, b])).toEqual([{ ...a, para: 6 }]);
    expect(compactarOperacoes([criar, apagar])).toEqual([]);
  });

  it('aplicar cria primeiro e apaga no fim: uma pessoa pode ir para uma obra nova', () => {
    const obra = criarObra({ id: 'obra-n1', localId: 'local-obra' });
    const ops: Operacao[] = [
      operacaoCriar('obra', obra),
      { tipo: 'mover', pessoaId: 'p-ana', campo: 'obraId', de: null, para: 'obra-n1' },
    ];
    const depois = aplicarOperacoes(estado, ops);
    expect(depois.obras.map((o) => o.id)).toEqual(['obra-n1']);
    expect(depois.pessoas[0]?.obraId).toBe('obra-n1');
    const apagada = aplicarOperacoes(depois, [operacaoApagar(depois, 'obra', 'obra-n1') as Operacao]);
    expect(apagada.obras).toEqual([]);
  });

  it('conflito de campo quando alguém mudou entretanto', () => {
    const op = operacaoCampo(estado, 'casa', 'casa-a', 'lotacao', 5) as Operacao;
    const outro = { ...estado, casas: [{ ...casa, lotacao: 6 }] };
    expect(encontrarConflitos(outro, [op])).toEqual([
      {
        tipo: 'campo',
        entidade: 'casa',
        id: 'casa-a',
        campo: 'lotacao',
        esperado: 4,
        atual: 6,
        existe: true,
      },
    ]);
    expect(encontrarConflitos(estado, [op])).toEqual([]);
  });
});

describe('problemas (M2)', () => {
  it('abre um problema hoje na casa e lista-o com os abertos primeiro', () => {
    const op = operacaoNovoProblema(
      { tipo: 'casa', id: 'casa-a' },
      'Esquentador avariado',
      '2026-10-04',
      () => 'p1',
    );
    expect(op).toMatchObject({ tipo: 'registo', entidade: 'problema', id: 'problema-p1', de: null });
    const resolvido = criarProblema({
      id: 'r',
      casaId: 'casa-a',
      abertoEm: '2026-09-01',
      resolvidoEm: '2026-09-02',
    });
    const aberto = criarProblema({ id: 'a', casaId: 'casa-a', abertoEm: '2026-08-01' });
    const estado = criarEstado({ problemas: [resolvido, aberto] });
    expect(problemasDe(estado, { tipo: 'casa', id: 'casa-a' }).map((p) => p.id)).toEqual(['a', 'r']);
    expect(
      indexar(estado)
        .problemasAbertos.get('casa:casa-a')
        ?.map((p) => p.id),
    ).toEqual(['a']);
  });

  it('avisa (sem impedir) quando o texto parece ter dados pessoais ou de saúde', () => {
    const estado = { pessoas: [criarPessoa({ nomeCurto: 'Ana T.' })] };
    expect(avisoTextoProblema('Pneu furado', estado)).toBeNull();
    expect(avisoTextoProblema('A Ana T. partiu a janela', estado)).not.toBeNull();
    expect(avisoTextoProblema('Está de baixa', estado)).not.toBeNull();
  });

  it('o comentário do Guardar só avisa de saúde (nomes são normais num comentário)', () => {
    expect(avisoTextoSaude('Ana T. passa para a Casa Dois')).toBeNull();
    expect(avisoTextoSaude('O João está de baixa')).toBe(AVISO_COMENTARIO_SEM_MOTIVO);
    expect(avisoTextoSaude('')).toBeNull();
  });
});

describe('região do mapa e locais criados no programa (M2)', () => {
  it('a região tem o Luxemburgo, Metz e Sarrebruck, e não Paris', () => {
    expect(dentroDaRegiao(49.61, 6.13)).toBe(true);
    expect(dentroDaRegiao(49.12, 6.18)).toBe(true);
    expect(dentroDaRegiao(49.23, 6.99)).toBe(true);
    expect(dentroDaRegiao(48.86, 2.35)).toBe(false);
    expect(dentroDaRegiao(Number.NaN, 6)).toBe(false);
    expect(REGIAO_MAPA.sul).toBeLessThan(REGIAO_MAPA.norte);
  });

  it('só os locais "local-…" de obra/estacionamento são do programa', () => {
    expect(localCriadoNoPrograma({ id: 'local-123e4567', tipo: 'obra' })).toBe(true);
    expect(localCriadoNoPrograma({ id: 'local-123e4567', tipo: 'estacionamento' })).toBe(true);
    expect(localCriadoNoPrograma({ id: 'drusenheim', tipo: 'estacionamento' })).toBe(false);
    expect(localCriadoNoPrograma({ id: 'local-123e4567', tipo: 'oficina' })).toBe(false);
    expect(LIMITES.raioMinimo).toBeLessThanOrEqual(RAIO_OMISSAO);
    expect(RAIO_OMISSAO).toBeLessThanOrEqual(LIMITES.raioMaximo);
  });
});
