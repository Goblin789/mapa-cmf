import { describe, expect, it } from 'vitest';
import { RAIO_OMISSAO } from '../../dominio/campos';
import { aplicarOperacoes, type Operacao, validarOperacoes } from '../../dominio/operacoes';
import { criarCliente, criarObra } from '../../dominio/teste-fabrica';
import type { Estado, Local } from '../../dominio/tipos';
import { MORADA_VAZIA } from '../comum/morada';
import { estadoVistas } from '../vistas/estadoTeste';
import {
  clientesDeObras,
  type DadosObra,
  dadosDaObra,
  nomeEstacionamento,
  passoApagarObra,
  passoCriarObra,
  passoEditarObra,
  resumoApagarObra,
  usosDoLocal,
} from './passosObra';

/** Ids previsíveis ("local-teste-00000001"…), no formato que o servidor aceita. */
function gerador(prefixo = 'teste') {
  let n = 0;
  return () => `${prefixo}-${String(++n).padStart(8, '0')}`;
}

/** Estado fictício das vistas com um grupo interno (não pode ter obras). */
function estadoBase(): Estado {
  const e = estadoVistas();
  return {
    ...e,
    clientes: [
      ...e.clientes,
      criarCliente({ id: 'interno', nome: 'Grupo Interno', interno: true, ordem: 9 }),
    ],
  };
}

const NOVA: DadosObra = {
  nome: '  Obra   Fictícia  ',
  clienteId: 'alfa',
  morada: { morada: ' 1 Rue Fictícia,\n L-0000 Lugar ', pais: 'LU', lat: 49.61, lng: 6.13 },
  estacionamento: null,
};

/** Cria a obra (validada) e devolve o estado visível depois do passo. */
function comObraCriada(dados: DadosObra = NOVA) {
  const base = estadoBase();
  const r = passoCriarObra(base, dados, gerador());
  if (!r.ops || !r.obraId) throw new Error(r.erros.join(' '));
  expect(validarOperacoes(base, r.ops)).toEqual([]);
  return { estado: aplicarOperacoes(base, r.ops), obraId: r.obraId, ops: r.ops };
}

describe('clientesDeObras', () => {
  it('só os clientes que não são grupos internos, pela ordem', () => {
    expect(clientesDeObras(estadoBase()).map((c) => c.id)).toEqual(['alfa', 'beta']);
  });
});

describe('passoCriarObra', () => {
  it('um passo: o local da obra (tipo obra, raio por omissão) e a obra (manual), válido', () => {
    const base = estadoBase();
    const r = passoCriarObra(base, NOVA, gerador());
    expect(r.erros).toEqual([]);
    expect(r.obraId).toBe('obra-teste-00000002');
    expect(r.ops).toEqual([
      {
        tipo: 'registo',
        entidade: 'local',
        id: 'local-teste-00000001',
        de: null,
        para: {
          id: 'local-teste-00000001',
          tipo: 'obra',
          nome: 'Obra Fictícia',
          morada: '1 Rue Fictícia, L-0000 Lugar',
          pais: 'LU',
          lat: 49.61,
          lng: 6.13,
          raioM: RAIO_OMISSAO,
        },
      },
      {
        tipo: 'registo',
        entidade: 'obra',
        id: 'obra-teste-00000002',
        de: null,
        para: {
          id: 'obra-teste-00000002',
          nome: 'Obra Fictícia',
          clienteId: 'alfa',
          localId: 'local-teste-00000001',
          estacionamentoLocalId: null,
          origem: 'manual',
        },
      },
    ]);
    expect(validarOperacoes(base, r.ops ?? [])).toEqual([]);
  });

  it('com estacionamento: mais um local (tipo estacionamento) e a obra liga-se a ele', () => {
    const r = passoCriarObra(
      estadoBase(),
      { ...NOVA, estacionamento: { morada: '', pais: 'FR', lat: 49.5, lng: 6.2 } },
      gerador(),
    );
    const locais = (r.ops ?? []).flatMap((op) =>
      op.tipo === 'registo' && op.entidade === 'local' ? [op.para as Local] : [],
    );
    expect(locais.map((l) => [l.tipo, l.nome, l.morada, l.pais])).toEqual([
      ['obra', 'Obra Fictícia', '1 Rue Fictícia, L-0000 Lugar', 'LU'],
      ['estacionamento', 'Estacionamento Obra Fictícia', '', 'FR'],
    ]);
    const obra = (r.ops ?? []).at(-1);
    expect(
      obra?.tipo === 'registo' &&
        obra.para &&
        'estacionamentoLocalId' in obra.para &&
        obra.para.estacionamentoLocalId,
    ).toBe(locais[1]?.id);
    expect(validarOperacoes(estadoBase(), r.ops ?? [])).toEqual([]);
  });

  it('a morada pode ficar vazia (só o sítio no mapa); o pino não', () => {
    const r = passoCriarObra(
      estadoBase(),
      { ...NOVA, morada: { ...MORADA_VAZIA, lat: 49.6, lng: 6.1 } },
      gerador(),
    );
    expect(r.erros).toEqual([]);
    expect(validarOperacoes(estadoBase(), r.ops ?? [])).toEqual([]);
  });

  it('falta o nome, o cliente (ou é interno) ou o pino (ou fica fora da região): não se monta', () => {
    const erros = (d: Partial<DadosObra>) => passoCriarObra(estadoBase(), { ...NOVA, ...d }).erros;
    expect(erros({ nome: '   ' })).toEqual(['Falta o nome da obra.']);
    expect(erros({ clienteId: null })).toEqual(['Falta escolher o cliente.']);
    expect(erros({ clienteId: 'nao-existe' })).toEqual(['Falta escolher o cliente.']);
    expect(erros({ clienteId: 'interno' })).toEqual([
      'Grupo Interno é um grupo interno: escolhe o cliente da obra.',
    ]);
    expect(erros({ morada: MORADA_VAZIA })).toEqual([
      'Falta o pino da obra: procura a morada ou clica no mini-mapa.',
    ]);
    // Paris: fora da região do mapa.
    expect(erros({ morada: { ...NOVA.morada, lat: 48.85, lng: 2.35 } })).toEqual([
      'Falta o pino da obra: procura a morada ou clica no mini-mapa.',
    ]);
    expect(erros({ estacionamento: MORADA_VAZIA })).toEqual([
      'Falta o pino do estacionamento (ou tira o estacionamento).',
    ]);
    expect(passoCriarObra(estadoBase(), { ...NOVA, nome: '' }).ops).toBeNull();
  });

  it('a obra criada aparece no estado visível, pronta para receber pessoas no mesmo rascunho', () => {
    const { estado, obraId } = comObraCriada();
    expect(estado.obras.find((o) => o.id === obraId)?.nome).toBe('Obra Fictícia');
    const mover: Operacao[] = [{ tipo: 'mover', pessoaId: 'p-1', campo: 'obraId', de: null, para: obraId }];
    expect(validarOperacoes(estado, mover)).toEqual([]);
  });
});

describe('passoEditarObra', () => {
  it('nada mudou: passo vazio', () => {
    const { estado, obraId } = comObraCriada();
    const obra = estado.obras.find((o) => o.id === obraId);
    if (!obra) throw new Error('Sem a obra');
    const dados = dadosDaObra(estado, obra);
    expect(passoEditarObra(estado, obraId, dados, dados)).toEqual({ ops: [], erros: [] });
  });

  it('nome, cliente e pino: os "campo" da obra e do local (o nome do local acompanha o da obra)', () => {
    const { estado, obraId } = comObraCriada();
    const obra = estado.obras.find((o) => o.id === obraId);
    if (!obra) throw new Error('Sem a obra');
    const dados = dadosDaObra(estado, obra);
    const r = passoEditarObra(
      estado,
      obraId,
      {
        ...dados,
        nome: 'Obra Renomeada',
        clienteId: 'beta',
        morada: { ...dados.morada, lat: 49.62, lng: 6.14 },
      },
      dados,
    );
    const resumo = (r.ops ?? []).map((op) =>
      op.tipo === 'campo' ? `${op.entidade}.${op.campo}: ${String(op.de)} → ${String(op.para)}` : op.tipo,
    );
    expect(resumo).toEqual([
      'obra.nome: Obra Fictícia → Obra Renomeada',
      'obra.clienteId: alfa → beta',
      'local.nome: Obra Fictícia → Obra Renomeada',
      'local.lat: 49.61 → 49.62',
      'local.lng: 6.13 → 6.14',
    ]);
    expect(validarOperacoes(estado, r.ops ?? [])).toEqual([]);
  });

  it('estacionamento novo (local novo + campo), mudado (campos do local) e tirado (apaga o local criado)', () => {
    const { estado, obraId } = comObraCriada();
    const obra = estado.obras.find((o) => o.id === obraId);
    if (!obra) throw new Error('Sem a obra');
    const dados = dadosDaObra(estado, obra);
    const novo = passoEditarObra(
      estado,
      obraId,
      { ...dados, estacionamento: { morada: 'Parque', pais: 'LU', lat: 49.6, lng: 6.12 } },
      dados,
      gerador('outro'),
    );
    expect((novo.ops ?? []).map((op) => (op.tipo === 'campo' ? `campo ${op.campo}` : op.tipo))).toEqual([
      'registo',
      'campo estacionamentoLocalId',
    ]);
    expect(validarOperacoes(estado, novo.ops ?? [])).toEqual([]);
    const comEst = aplicarOperacoes(estado, novo.ops ?? []);
    const obraComEst = comEst.obras.find((o) => o.id === obraId);
    if (!obraComEst) throw new Error('Sem a obra');
    expect(comEst.locais.find((l) => l.id === obraComEst.estacionamentoLocalId)?.nome).toBe(
      nomeEstacionamento('Obra Fictícia'),
    );

    const dadosEst = dadosDaObra(comEst, obraComEst);
    const mudado = passoEditarObra(
      comEst,
      obraId,
      {
        ...dadosEst,
        estacionamento: { ...(dadosEst.estacionamento ?? MORADA_VAZIA), lat: 49.601 },
      },
      dadosEst,
    );
    expect(
      (mudado.ops ?? []).map((op) => (op.tipo === 'campo' ? `${op.entidade}.${op.campo}` : op.tipo)),
    ).toEqual(['local.lat']);

    const tirado = passoEditarObra(comEst, obraId, { ...dadosEst, estacionamento: null }, dadosEst);
    expect(
      (tirado.ops ?? []).map((op) => (op.tipo === 'campo' ? `campo ${op.campo}` : `apagar ${op.tipo}`)),
    ).toEqual(['campo estacionamentoLocalId', 'apagar registo']);
    expect(validarOperacoes(comEst, tirado.ops ?? [])).toEqual([]);
  });

  it('tirar um estacionamento dos dados iniciais não apaga o local (só deixa de ser da obra)', () => {
    const base = estadoBase();
    const estado: Estado = {
      ...base,
      obras: [
        criarObra({
          id: 'obra-velha',
          nome: 'Obra Velha',
          clienteId: 'alfa',
          localId: 'aldeia',
          estacionamentoLocalId: 'parque',
        }),
      ],
    };
    const obra = estado.obras[0];
    if (!obra) throw new Error('Sem a obra');
    const dados = dadosDaObra(estado, obra);
    const r = passoEditarObra(estado, 'obra-velha', { ...dados, estacionamento: null }, dados);
    expect((r.ops ?? []).map((op) => op.tipo)).toEqual(['campo']);
  });

  it('só vai o que a pessoa mudou: o que outra pessoa gravou com o diálogo aberto não se desfaz', () => {
    const { estado: aoAbrir, obraId } = comObraCriada();
    const obra = aoAbrir.obras.find((o) => o.id === obraId);
    if (!obra) throw new Error('Sem a obra');
    const iniciais = dadosDaObra(aoAbrir, obra);
    // Entretanto, outra pessoa grava (chega pelo tempo real): o cliente, a morada e o pino.
    const local = obra.localId;
    const outro: Operacao[] = [
      { tipo: 'campo', entidade: 'obra', id: obraId, campo: 'clienteId', de: 'alfa', para: 'beta' },
      {
        tipo: 'campo',
        entidade: 'local',
        id: local,
        campo: 'morada',
        de: '1 Rue Fictícia, L-0000 Lugar',
        para: '2 Rue Outra',
      },
      { tipo: 'campo', entidade: 'local', id: local, campo: 'lat', de: 49.61, para: 49.615 },
    ];
    expect(validarOperacoes(aoAbrir, outro)).toEqual([]);
    const agora = aplicarOperacoes(aoAbrir, outro);

    // Esta pessoa só mudou o nome: nada do cliente, da morada nem do pino.
    const soNome = passoEditarObra(agora, obraId, { ...iniciais, nome: 'Obra Fictícia B' }, iniciais);
    expect(
      (soNome.ops ?? []).map((op) => (op.tipo === 'campo' ? `${op.entidade}.${op.campo}` : op.tipo)),
    ).toEqual(['obra.nome', 'local.nome']);
    expect(validarOperacoes(agora, soNome.ops ?? [])).toEqual([]);

    // Mexeu no país: só o país (a morada e o pino do outro ficam).
    const soPais = passoEditarObra(
      agora,
      obraId,
      { ...iniciais, morada: { ...iniciais.morada, pais: 'FR' } },
      iniciais,
    );
    expect(soPais.ops).toEqual([
      { tipo: 'campo', entidade: 'local', id: local, campo: 'pais', de: 'LU', para: 'FR' },
    ]);

    // Mexeu no pino: lat e lng vão juntos, com o `de` de agora.
    const pino = passoEditarObra(
      agora,
      obraId,
      { ...iniciais, morada: { ...iniciais.morada, lat: 49.62, lng: 6.14 } },
      iniciais,
    );
    expect(pino.ops).toEqual([
      { tipo: 'campo', entidade: 'local', id: local, campo: 'lat', de: 49.615, para: 49.62 },
      { tipo: 'campo', entidade: 'local', id: local, campo: 'lng', de: 6.13, para: 6.14 },
    ]);
  });

  it('estacionamento tirado por outra pessoa e não mexido aqui: não volta', () => {
    const { estado: semEst, obraId } = comObraCriada();
    const obra0 = semEst.obras.find((o) => o.id === obraId);
    if (!obra0) throw new Error('Sem a obra');
    const d0 = dadosDaObra(semEst, obra0);
    const novo = passoEditarObra(
      semEst,
      obraId,
      { ...d0, estacionamento: { morada: 'Parque', pais: 'LU', lat: 49.6, lng: 6.12 } },
      d0,
      gerador('outro'),
    );
    const aoAbrir = aplicarOperacoes(semEst, novo.ops ?? []);
    const obra = aoAbrir.obras.find((o) => o.id === obraId);
    if (!obra) throw new Error('Sem a obra');
    const iniciais = dadosDaObra(aoAbrir, obra);
    const tirar = passoEditarObra(aoAbrir, obraId, { ...iniciais, estacionamento: null }, iniciais);
    const agora = aplicarOperacoes(aoAbrir, tirar.ops ?? []);
    expect(passoEditarObra(agora, obraId, iniciais, iniciais)).toEqual({ ops: [], erros: [] });
    // Mas se esta lhe mexeu, volta num local novo.
    const mexido = passoEditarObra(
      agora,
      obraId,
      { ...iniciais, estacionamento: { ...(iniciais.estacionamento ?? MORADA_VAZIA), lat: 49.602 } },
      iniciais,
      gerador('mais'),
    );
    expect((mexido.ops ?? []).map((op) => (op.tipo === 'campo' ? `campo ${op.campo}` : op.tipo))).toEqual([
      'registo',
      'campo estacionamentoLocalId',
    ]);
  });

  it('nome repetido: não se cria nem se muda para o de outra obra; mexer noutra coisa passa', () => {
    const { estado, obraId } = comObraCriada();
    const repetida = passoCriarObra(estado, { ...NOVA, nome: 'obra ficticia' }, gerador('dois'));
    expect(repetida.ops).toBeNull();
    expect(repetida.erros).toEqual([
      'Já há uma obra com este nome: escolhe outro (ex.: junta a localidade).',
    ]);

    const outra = passoCriarObra(estado, { ...NOVA, nome: 'Obra Dois' }, gerador('dois'));
    if (!outra.ops) throw new Error(outra.erros.join(' '));
    const comDuas = aplicarOperacoes(estado, outra.ops);
    const obra = comDuas.obras.find((o) => o.id === obraId);
    if (!obra) throw new Error('Sem a obra');
    const iniciais = dadosDaObra(comDuas, obra);
    expect(passoEditarObra(comDuas, obraId, { ...iniciais, nome: 'OBRA  DOIS' }, iniciais).erros).toEqual([
      'Já há uma obra com este nome: escolhe outro (ex.: junta a localidade).',
    ]);
    // O próprio nome não conta.
    expect(passoEditarObra(comDuas, obraId, { ...iniciais, nome: 'obra fictícia' }, iniciais).erros).toEqual(
      [],
    );
    // Uma obra antiga com o nome igual ao de outra: mudar o cliente passa (o nome não mudou).
    const gemeas: Estado = {
      ...comDuas,
      obras: comDuas.obras.map((o) => (o.id === obraId ? o : { ...o, nome: obra.nome })),
    };
    expect(passoEditarObra(gemeas, obraId, { ...iniciais, clienteId: 'beta' }, iniciais).erros).toEqual([]);
  });

  it('a obra já não existe: erro, sem passo', () => {
    expect(passoEditarObra(estadoBase(), 'obra-nao-existe', NOVA, NOVA)).toEqual({
      ops: null,
      erros: ['Esta obra já não existe.'],
    });
  });
});

describe('passoApagarObra', () => {
  it('quem lá está passa para "sem obra", a obra e os locais criados no programa apagam-se, num passo válido', () => {
    const criada = comObraCriada({
      ...NOVA,
      estacionamento: { morada: '', pais: 'LU', lat: 49.6, lng: 6.12 },
    });
    // Duas pessoas vão para a obra (o Zé A. conduz a XX1001: continua a conduzir).
    const estado = aplicarOperacoes(criada.estado, [
      { tipo: 'mover', pessoaId: 'p-1', campo: 'obraId', de: null, para: criada.obraId },
      { tipo: 'mover', pessoaId: 'p-3', campo: 'obraId', de: null, para: criada.obraId },
    ]);
    const ops = passoApagarObra(estado, criada.obraId) ?? [];
    expect(
      ops.map((op) =>
        op.tipo === 'mover'
          ? `mover ${op.pessoaId} → ${String(op.para)}`
          : `${op.tipo} ${'entidade' in op ? op.entidade : ''}`,
      ),
    ).toEqual(['mover p-1 → null', 'mover p-3 → null', 'registo obra', 'registo local', 'registo local']);
    expect(validarOperacoes(estado, ops)).toEqual([]);
    const depois = aplicarOperacoes(estado, ops);
    expect(depois.obras.some((o) => o.id === criada.obraId)).toBe(false);
    expect(depois.locais.some((l) => l.id.startsWith('local-teste-'))).toBe(false);
    expect(depois.pessoas.filter((p) => p.obraId !== null)).toEqual([]);
    expect(resumoApagarObra(estado, criada.obraId)).toMatchObject({ pessoas: 2, locaisQueFicam: [] });
  });

  it('nunca apaga um local dos dados iniciais (nem um que outra obra usa)', () => {
    const base = estadoBase();
    const estado: Estado = {
      ...base,
      obras: [
        criarObra({
          id: 'obra-a',
          nome: 'Obra A',
          clienteId: 'alfa',
          localId: 'aldeia',
          estacionamentoLocalId: 'parque',
        }),
      ],
    };
    const ops = passoApagarObra(estado, 'obra-a') ?? [];
    expect(ops.map((op) => op.tipo)).toEqual(['registo']);
    expect(validarOperacoes(estado, ops)).toEqual([]);
    const resumo = resumoApagarObra(estado, 'obra-a');
    expect(resumo?.locaisApagados).toEqual([]);
    expect(resumo?.locaisQueFicam.map((l) => l.id)).toEqual(['aldeia', 'parque']);

    // Um local criado no programa partilhado por duas obras: apagar uma deixa-o à outra.
    const partilhado = comObraCriada();
    const obraNova = partilhado.estado.obras.find((o) => o.id === partilhado.obraId);
    if (!obraNova) throw new Error('Sem a obra');
    const comOutra: Estado = {
      ...partilhado.estado,
      obras: [
        ...partilhado.estado.obras,
        criarObra({ id: 'obra-outra', clienteId: 'beta', localId: obraNova.localId }),
      ],
    };
    const ops2 = passoApagarObra(comOutra, partilhado.obraId) ?? [];
    expect(ops2.map((op) => op.tipo)).toEqual(['registo']);
    expect(usosDoLocal(comOutra, obraNova.localId, new Set([partilhado.obraId]))).toEqual([
      'Obra obra-outra',
    ]);
  });

  it('a obra já não existe: null', () => {
    expect(passoApagarObra(estadoBase(), 'nao-existe')).toBeNull();
  });
});
