import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { criarIndisponibilidade, criarLocal, criarObra } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import {
  algarismosAMais,
  algarismosDaPastilha,
  assinaturaCabecalhos,
  blocosDoQuadro,
  colunasLadoALado,
  DEGRAUS_AJUSTE,
  escolherAjuste,
  type FiltroQuadro,
  filtroQuadroAtivo,
  LARGURA_MIN_BLOCO,
  LARGURA_MIN_NOME,
  LETRA_NORMAL,
  largurasMinimas,
  maiorLetraQueCabe,
  montarQuadro,
  nomeNaZona,
  opcoesObrasQuadro,
  passaFiltroQuadro,
  SEM_FILTRO,
  SEM_OBRA,
  type SeccaoQuadro,
  zonasDeVizinhos,
} from './agrupamentoQuadro';
import { estadoVistas } from './estadoTeste';

const estado = estadoVistas();
const ind = indexar(estado);
const dormidas = dormidasDasCarrinhas(estado, ind);
const casas = montarQuadro('casas', estado, ind, dormidas);
const carrinhas = montarQuadro('carrinhas', estado, ind, dormidas);

const bloco = (seccoes: SeccaoQuadro[], chave: string) => {
  const b = blocosDoQuadro(seccoes).find((x) => x.chave === chave);
  if (!b) throw new Error(`Sem o bloco ${chave}`);
  return b;
};
const nomes = (b: { pessoas: { nomeCurto: string }[] }) => b.pessoas.map((p) => p.nomeCurto);

describe('Quadro por casas', () => {
  it('secções por país, pela ordem das casas, e no fim "Fora das casas CMF"', () => {
    expect(casas.map((s) => s.titulo)).toEqual(['França', 'Luxemburgo', null]);
    expect(casas.map((s) => s.nBlocos)).toEqual([3, 2, 0]);
    expect(casas.map((s) => s.nPessoas)).toEqual([3, 3, 2]);
  });

  it('ruas vizinhas lado a lado: a de oeste à esquerda, mesmo vindo depois na ordem', () => {
    const [franca] = casas;
    expect(franca?.faixas).toHaveLength(1);
    const zona = franca?.faixas[0];
    expect(zona?.titulo).toBe('Vila Fictícia');
    expect(zona?.partes.map((p) => p.titulo)).toEqual(['Rua Oeste', 'Rua Leste']);
    expect(zona?.partes.map((p) => p.blocos.map((b) => b.titulo))).toEqual([
      ['Casa O1'],
      ['Casa L1', 'Casa L2'],
    ]);
  });

  it('os outros locais do país vão numa só grelha, pela ordem das casas', () => {
    const lu = casas[1];
    expect(lu?.faixas).toHaveLength(1);
    expect(lu?.faixas[0]?.titulo).toBeNull();
    expect(lu?.faixas[0]?.partes[0]?.blocos.map((b) => b.titulo)).toEqual(['Aldeia', 'Monte']);
  });

  it('cada casa: lotação, lugares livres, moradores pelo cliente e as carrinhas que lá dormem', () => {
    const l1 = bloco(casas, 'casa:casa-l1');
    expect(l1.lotacao).toEqual({ ocupados: 2, lugares: 3, nivel: 'livre' });
    expect(l1.vazios).toBe(1);
    // Alfa (ordem 0) antes de Beta.
    expect(nomes(l1)).toEqual(['Ana B.', 'Zé A.']);
    expect(l1.ligacoes).toEqual([{ tipo: 'carrinha', id: 'XX1001', rotulo: 'XX 1001', sugerida: false }]);

    // A pessoa inativa não conta.
    const l2 = bloco(casas, 'casa:casa-l2');
    expect(l2.pessoas).toEqual([]);
    expect(l2.vazios).toBe(2);
  });

  it('a sugestão de onde dorme aparece marcada como sugerida; o aviso de contrato também vem', () => {
    const aldeia = bloco(casas, 'casa:casa-a');
    expect(aldeia.ligacoes).toEqual([{ tipo: 'carrinha', id: 'XX1002', rotulo: 'XX 1002', sugerida: true }]);
    expect(aldeia.aviso).toEqual({ tipo: 'acima_maximo', usados: 2, maximo: 1, tolerado: 2 });
    expect(aldeia.lotacao?.nivel).toBe('cheio');
  });

  it('uma casa que conta sempre como cheia não tem lugares livres', () => {
    const monte = bloco(casas, 'casa:casa-m');
    expect(monte.sempreCheia).toBe(true);
    expect(monte.lotacao).toEqual({ ocupados: 1, lugares: 1, nivel: 'cheio' });
    expect(monte.vazios).toBe(0);
  });

  it('fora das casas: bloco largo, pelo cliente e depois pelo nome, com a divisão por cliente', () => {
    const fora = bloco(casas, 'fora');
    expect(fora.largo).toBe(true);
    expect(fora.lotacao).toBeNull();
    expect(nomes(fora)).toEqual(['Ivo F.', 'Óscar G.']);
    expect(fora.porCliente.map((p) => [p.clienteId, p.n])).toEqual([
      ['alfa', 1],
      ['beta', 1],
    ]);
  });
});

describe('Quadro por carrinhas', () => {
  it('pelo sítio onde dormem: as mesmas zonas e países; por definir e sem transporte no fim', () => {
    expect(carrinhas.map((s) => s.titulo)).toEqual(['França', 'Luxemburgo', 'Onde dorme: por definir', null]);
    const zona = carrinhas[0]?.faixas[0];
    expect(zona?.partes.map((p) => p.titulo)).toEqual(['Rua Oeste', 'Rua Leste']);
    expect(zona?.partes.map((p) => p.blocos.map((b) => b.id))).toEqual([['XX1005'], ['XX1001']]);
    // A Aldeia (sugestão) antes do parque (local sem casas: depois de todas).
    expect(carrinhas[1]?.faixas[0]?.partes[0]?.blocos.map((b) => b.id)).toEqual(['XX1002', 'XX1003']);
    expect(carrinhas[2]?.faixas[0]?.partes[0]?.blocos.map((b) => b.id)).toEqual(['XX1004']);
  });

  it('o condutor vem sempre primeiro, mesmo que o cliente o pusesse depois', () => {
    expect(nomes(bloco(carrinhas, 'carrinha:XX1001'))).toEqual(['Zé A.', 'Ana B.']);
  });

  it('matrícula formatada, marca e modelo (num carro diz "Carro") e lotação', () => {
    const c1 = bloco(carrinhas, 'carrinha:XX1001');
    expect(c1.titulo).toBe('XX 1001');
    expect(c1.detalhe).toBe('Marca Furgão');
    expect(c1.lotacao).toEqual({ ocupados: 2, lugares: 5, nivel: 'livre' });
    expect(bloco(carrinhas, 'carrinha:XX1005').detalhe).toBe('Carro · Marca Ligeiro');
  });

  it('lugares livres até ao número de lugares, como nas casas; com gente a mais, nenhum', () => {
    expect(bloco(carrinhas, 'carrinha:XX1001').vazios).toBe(3);
    expect(bloco(carrinhas, 'carrinha:XX1002').vazios).toBe(1);
    // Vazia: todos os lugares livres.
    expect(bloco(carrinhas, 'carrinha:XX1004').vazios).toBe(5);
    // A XX1002 (2 passageiros) passa a ter 1 lugar: gente a mais, sem lugares livres.
    const apertado: Estado = {
      ...estado,
      carrinhas: estado.carrinhas.map((c) => (c.id === 'XX1002' ? { ...c, lugares: 1 } : c)),
    };
    const ind2 = indexar(apertado);
    const b = bloco(
      montarQuadro('carrinhas', apertado, ind2, dormidasDasCarrinhas(apertado, ind2)),
      'carrinha:XX1002',
    );
    expect(b.lotacao).toEqual({ ocupados: 2, lugares: 1, nivel: 'excesso' });
    expect(b.vazios).toBe(0);
    // Sem transporte: bloco largo, sem lugares.
    expect(bloco(carrinhas, 'sem-transporte').vazios).toBe(0);
  });

  it('onde dorme: a casa, a sugestão, um local que não é casa ou por definir', () => {
    expect(bloco(carrinhas, 'carrinha:XX1001').ligacoes).toEqual([
      { tipo: 'casa', id: 'casa-l1', rotulo: 'Casa L1', sugerida: false },
    ]);
    expect(bloco(carrinhas, 'carrinha:XX1002').ligacoes).toEqual([
      { tipo: 'casa', id: 'casa-a', rotulo: 'Aldeia', sugerida: true },
    ]);
    expect(bloco(carrinhas, 'carrinha:XX1003').ligacoes).toEqual([
      { tipo: 'local', id: 'parque', rotulo: 'Parque Norte', sugerida: false },
    ]);
    expect(bloco(carrinhas, 'carrinha:XX1004').ligacoes[0]?.tipo).toBe('por-definir');
  });

  it('assinala a carrinha com gente e sem condutor', () => {
    expect(bloco(carrinhas, 'carrinha:XX1003').semCondutor).toBe(true);
    expect(bloco(carrinhas, 'carrinha:XX1001').semCondutor).toBe(false);
    expect(bloco(carrinhas, 'carrinha:XX1004').semCondutor).toBe(false);
  });

  it('sem transporte: bloco largo com quem não tem carrinha', () => {
    const sem = bloco(carrinhas, 'sem-transporte');
    expect(sem.largo).toBe(true);
    expect(nomes(sem)).toEqual(['Inês H.', 'Óscar G.']);
  });
});

describe('zonasDeVizinhos e nomeNaZona', () => {
  it('junta locais a menos de 500 m (em cadeia), de oeste para leste; sem coordenadas fica sozinho', () => {
    const a = criarLocal({ id: 'a', lat: 49.5, lng: 6.004 });
    const b = criarLocal({ id: 'b', lat: 49.5, lng: 6.0 });
    const c = criarLocal({ id: 'c', lat: 49.5, lng: 6.008 });
    const longe = criarLocal({ id: 'longe', lat: 49.6, lng: 6.0 });
    const semCoordenadas = criarLocal({ id: 'sem', lat: null, lng: null });
    const zonas = zonasDeVizinhos([a, b, c, longe, semCoordenadas]).map((z) => z.map((l) => l.id));
    expect(zonas).toEqual([['b', 'a', 'c'], ['longe'], ['sem']]);
  });

  it('tira o nome da zona do nome da rua', () => {
    expect(nomeNaZona('Vila Fictícia, Rua Leste', 'Vila Fictícia')).toBe('Rua Leste');
    expect(nomeNaZona('Outro Sítio, Rua', 'Vila Fictícia')).toBe('Outro Sítio, Rua');
    expect(nomeNaZona('Vila Fictícia', 'Vila Fictícia')).toBe('Vila Fictícia');
  });
});

describe('maiorLetraQueCabe', () => {
  it('a maior letra com que ainda cabe', () => {
    expect(maiorLetraQueCabe(11, 30, (f) => f <= 17)).toBe(17);
    expect(maiorLetraQueCabe(11, 30, () => true)).toBe(30);
    expect(maiorLetraQueCabe(11, 11, () => true)).toBe(11);
  });

  it('null se nem com a mais pequena couber', () => {
    expect(maiorLetraQueCabe(11, 30, () => false)).toBeNull();
    expect(maiorLetraQueCabe(20, 10, () => true)).toBeNull();
  });

  it('mede poucas vezes (pesquisa binária)', () => {
    let medicoes = 0;
    maiorLetraQueCabe(11, 30, (f) => {
      medicoes++;
      return f <= 23;
    });
    expect(medicoes).toBeLessThanOrEqual(7);
  });
});

describe('escolherAjuste (reunião: menos informação antes de letra pequena demais)', () => {
  const degraus = [
    { modo: 'completo', minimo: 14, maximo: 30 },
    { modo: 'compacto', minimo: 13, maximo: 30 },
  ] as const;
  const senao = { letra: 13, modo: 'compacto' } as const;

  it('se couber tudo com letra legível, não tira nada', () => {
    // Completo cabe até 17; compacto até 19: fica o completo.
    expect(escolherAjuste(degraus, senao, (f, modo) => f <= (modo === 'compacto' ? 19 : 17))).toEqual({
      letra: 17,
      modo: 'completo',
      nomesCortados: false,
      desliza: false,
    });
  });

  it('se o completo só coubesse abaixo do mínimo, passa a compacto em vez de encolher a letra', () => {
    // Completo só cabe a 12 (abaixo de 14); compacto cabe a 15.
    expect(escolherAjuste(degraus, senao, (f, modo) => f <= (modo === 'compacto' ? 15 : 12))).toEqual({
      letra: 15,
      modo: 'compacto',
      nomesCortados: false,
      desliza: false,
    });
  });

  it('se nem compacto couber, fica o mínimo e desliza', () => {
    expect(escolherAjuste(degraus, senao, () => false)).toEqual({
      letra: 13,
      modo: 'compacto',
      nomesCortados: false,
      desliza: true,
    });
  });
});

describe('DEGRAUS_AJUSTE (os lugares livres das carrinhas também na reunião e no PC)', () => {
  /**
   * Alturas (px) medidas no browser com um Quadro por carrinhas do tamanho do de outubro de 2026 (por
   * letra e modo), para comparar com o espaço que há. Fictícias no conteúdo: só os números importam.
   */
  const ALTURAS: Record<string, Record<number, number>> = {
    completo: { 12: 1007, 13: 1101, 14: 1174, 15: 1499 },
    'livres-numa-linha': { 12: 849, 13: 931, 14: 991, 15: 1285 },
    compacto: { 12: 813, 13: 892, 14: 950, 15: 1219 },
  };
  const cabeEm = (disponivel: number) => (letra: number, modo: string) =>
    (ALTURAS[modo]?.[letra] ?? Number.POSITIVE_INFINITY) <= disponivel;

  it('reunião (TV 1920×1080, 968 px): os livres numa linha a 13 px antes do compacto sem livres a 14', () => {
    const { degraus, senaoCouber } = DEGRAUS_AJUSTE.reuniao;
    expect(escolherAjuste(degraus, senaoCouber, cabeEm(968))).toEqual({
      letra: 13,
      modo: 'livres-numa-linha',
      nomesCortados: false,
      desliza: false,
    });
  });

  it('reunião num ecrã maior: o completo, um "livre" por lugar', () => {
    const { degraus, senaoCouber } = DEGRAUS_AJUSTE.reuniao;
    expect(escolherAjuste(degraus, senaoCouber, cabeEm(1200))).toMatchObject({
      letra: 14,
      modo: 'completo',
    });
  });

  it('reunião sem espaço nem para os livres numa linha: compacto, sem livres', () => {
    const { degraus, senaoCouber } = DEGRAUS_AJUSTE.reuniao;
    expect(escolherAjuste(degraus, senaoCouber, cabeEm(900))).toEqual({
      letra: 13,
      modo: 'compacto',
      nomesCortados: false,
      desliza: false,
    });
  });

  it('reunião sem espaço com os nomes inteiros: corta os poucos nomes compridos antes de deslizar', () => {
    const { degraus, senaoCouber } = DEGRAUS_AJUSTE.reuniao;
    // Medido a 1920×1080 no Quadro por carrinhas (outubro de 2026): com os nomes inteiros nem o compacto
    // cabe a 13 (há 954 px); com as colunas de sempre, os livres numa linha cabem a 13 (916 px).
    const inteiros: Record<string, number> = { completo: 1290, 'livres-numa-linha': 1120, compacto: 1060 };
    const cortados: Record<string, number> = { completo: 1100, 'livres-numa-linha': 916, compacto: 880 };
    const cabe = (letra: number, modo: string, cortar: boolean) =>
      letra <= 13 && ((cortar ? cortados : inteiros)[modo] ?? Number.POSITIVE_INFINITY) <= 954;
    expect(escolherAjuste(degraus, senaoCouber, cabe)).toEqual({
      letra: 13,
      modo: 'livres-numa-linha',
      nomesCortados: true,
      desliza: false,
    });
    // Com os nomes inteiros a caber em qualquer modo, nunca se cortam.
    expect(escolherAjuste(degraus, senaoCouber, (l, m, c) => l <= 13 && (m === 'compacto' || c))).toEqual({
      letra: 13,
      modo: 'compacto',
      nomesCortados: false,
      desliza: false,
    });
    // Se nem cortados couberem, desliza com os nomes inteiros.
    expect(escolherAjuste(degraus, senaoCouber, () => false)).toMatchObject({
      nomesCortados: false,
      desliza: true,
    });
  });

  it('PC: os nomes nunca se cortam (desliza)', () => {
    expect(DEGRAUS_AJUSTE.normal.degraus.some((d) => d.nomesCortados)).toBe(false);
  });

  it('PC (920 px): nunca junta os livres numa linha (um "livre" por lugar, como nas casas): desliza', () => {
    const { degraus, senaoCouber } = DEGRAUS_AJUSTE.normal;
    expect(degraus.every((d) => d.modo === 'completo')).toBe(true);
    expect(escolherAjuste(degraus, senaoCouber, cabeEm(920))).toEqual({
      letra: LETRA_NORMAL,
      modo: 'completo',
      nomesCortados: false,
      desliza: true,
    });
  });

  it('PC sem espaço: 14 px, completo, a deslizar (nunca compacto fora da reunião)', () => {
    const { degraus, senaoCouber } = DEGRAUS_AJUSTE.normal;
    expect(escolherAjuste(degraus, senaoCouber, cabeEm(600))).toEqual({
      letra: LETRA_NORMAL,
      modo: 'completo',
      nomesCortados: false,
      desliza: true,
    });
    expect(degraus.some((d) => d.modo === 'compacto')).toBe(false);
  });
});

describe('filtro do Quadro (clientes e obras, vários de cada)', () => {
  // A Ana B. (cliente alfa) trabalha na obra da Beta: conta como Beta (o cliente da obra manda).
  const comObras: Estado = {
    ...estadoVistas(),
    obras: [
      criarObra({ id: 'obra-a', nome: 'Obra Fictícia A', clienteId: 'alfa', localId: 'aldeia' }),
      criarObra({ id: 'obra-b', nome: 'Obra Fictícia B', clienteId: 'beta', localId: 'monte' }),
    ],
    pessoas: estadoVistas().pessoas.map((p) =>
      p.id === 'p-2' ? { ...p, obraId: 'obra-b' } : p.id === 'p-3' ? { ...p, obraId: 'obra-a' } : p,
    ),
  };
  const indO = indexar(comObras);
  const dormO = dormidasDasCarrinhas(comObras, indO);
  const filtro = (clientes: string[], obras: string[] = []): FiltroQuadro => ({
    clientes: new Set(clientes),
    obras: new Set(obras),
  });
  const quadro = (f: FiltroQuadro, agrup: 'casas' | 'carrinhas' = 'casas') =>
    montarQuadro(agrup, comObras, indO, dormO, f);

  it('sem escolhas não filtra: igual ao Quadro sem filtro, nada recolhido', () => {
    expect(filtroQuadroAtivo(SEM_FILTRO)).toBe(false);
    const sem = blocosDoQuadro(quadro(SEM_FILTRO));
    expect(sem.map(nomes)).toEqual(blocosDoQuadro(montarQuadro('casas', comObras, indO, dormO)).map(nomes));
    expect(sem.every((b) => !b.recolhido && b.escondidas === 0)).toBe(true);
  });

  it('ficam só as pessoas do cliente efetivo (o da obra); a lotação e os livres continuam os reais', () => {
    const s = quadro(filtro(['alfa']));
    const l1 = bloco(s, 'casa:casa-l1');
    // Zé A. é Beta e a Ana B. trabalha numa obra da Beta: nenhum fica.
    expect(nomes(l1)).toEqual([]);
    expect(l1.recolhido).toBe(true);
    expect(l1.escondidas).toBe(2);
    expect(l1.lotacao).toEqual({ ocupados: 2, lugares: 3, nivel: 'livre' });
    expect(l1.vazios).toBe(1);
    const aldeia = bloco(s, 'casa:casa-a');
    expect(nomes(aldeia)).toEqual(['Luís E.']);
    expect(aldeia.escondidas).toBe(1);
    expect(aldeia.recolhido).toBe(false);
    // Casa sem ninguém (só um inativo): recolhida com o filtro ligado.
    expect(bloco(s, 'casa:casa-l2').recolhido).toBe(true);
  });

  it('vários clientes ao mesmo tempo (OU): a Beta junta os dois de volta à Casa L1', () => {
    const s = quadro(filtro(['alfa', 'beta']));
    expect(nomes(bloco(s, 'casa:casa-l1')).sort()).toEqual(['Ana B.', 'Zé A.']);
  });

  it('obras (OU) e "Sem obra"; entre clientes e obras é E', () => {
    expect(nomes(bloco(quadro(filtro([], ['obra-b'])), 'casa:casa-l1'))).toEqual(['Ana B.']);
    expect(nomes(bloco(quadro(filtro([], [SEM_OBRA])), 'casa:casa-l1'))).toEqual(['Zé A.']);
    const obras = quadro(filtro([], ['obra-a', 'obra-b']));
    expect(blocosDoQuadro(obras).flatMap(nomes).sort()).toEqual(['Ana B.', 'Rui C.']);
    // Alfa E obra B: a Ana B. é da Beta pela obra, por isso ninguém.
    expect(blocosDoQuadro(quadro(filtro(['alfa'], ['obra-b']))).flatMap(nomes)).toEqual([]);
    const ana = indO.pessoas.get('p-2');
    if (!ana) throw new Error('Sem a Ana B.');
    expect(passaFiltroQuadro(ana, filtro(['beta'], ['obra-b']), indO.obras)).toBe(true);
    expect(passaFiltroQuadro(ana, filtro(['alfa']), indO.obras)).toBe(false);
  });

  it('uma obra que já não existe conta como "Sem obra" (no filtro e na contagem da opção)', () => {
    const ana = indO.pessoas.get('p-2');
    if (!ana) throw new Error('Sem a Ana B.');
    const perdida = { ...ana, obraId: 'obra-apagada' };
    expect(passaFiltroQuadro(perdida, filtro([], [SEM_OBRA]), indO.obras)).toBe(true);
    expect(passaFiltroQuadro(perdida, filtro([], ['obra-b']), indO.obras)).toBe(false);
    const comPerdida = {
      ...comObras,
      pessoas: comObras.pessoas.map((p) => (p.id === 'p-2' ? perdida : p)),
    };
    const indP = indexar(comPerdida);
    const semObra = opcoesObrasQuadro(comPerdida, indP).find((o) => o.valor === SEM_OBRA)?.contagem;
    const passam = comPerdida.pessoas.filter(
      (p) => p.ativa && passaFiltroQuadro(p, filtro([], [SEM_OBRA]), indP.obras),
    ).length;
    expect(semObra).toBe(7);
    expect(passam).toBe(semObra);
  });

  it('as secções contam só quem passa; os blocos largos e as carrinhas também filtram', () => {
    const s = quadro(filtro(['beta']));
    expect(s.map((x) => x.nPessoas)).toEqual([2, 1, 1]);
    const fora = bloco(s, 'fora');
    expect(nomes(fora)).toEqual(['Óscar G.']);
    expect(fora.porCliente.map((p) => p.clienteId)).toEqual(['beta']);
    const c = quadro(filtro(['beta']), 'carrinhas');
    const xx1001 = bloco(c, 'carrinha:XX1001');
    // O condutor (Zé A., Beta) continua primeiro; a lotação é a real.
    expect(nomes(xx1001)).toEqual(['Zé A.', 'Ana B.']);
    expect(bloco(c, 'carrinha:XX1003').recolhido).toBe(true);
    expect(bloco(c, 'carrinha:XX1003').lotacao?.ocupados).toBe(1);
  });

  it('opções das obras: agrupadas pelo cliente, com o nº de pessoas, e "Sem obra" no fim', () => {
    const opcoes = opcoesObrasQuadro(comObras, indO);
    expect(opcoes.map((o) => [o.valor, o.grupo, o.contagem])).toEqual([
      ['obra-a', 'Alfa Obras', 1],
      ['obra-b', 'Beta Construções', 1],
      [SEM_OBRA, 'especiais', 6],
    ]);
    // Sem obras nenhumas: sem opções (o botão fica "Obra: sem obras", desativado).
    expect(opcoesObrasQuadro(estado, ind)).toEqual([]);
  });
});

describe('largurasMinimas (nomes numa só linha)', () => {
  it('nunca abaixo das de sempre', () => {
    expect(largurasMinimas(0)).toEqual({ nome: LARGURA_MIN_NOME, bloco: LARGURA_MIN_BLOCO });
    expect(largurasMinimas(Number.NaN)).toEqual({ nome: LARGURA_MIN_NOME, bloco: LARGURA_MIN_BLOCO });
  });

  it('um nome comprido alarga o bloco: o nome mais as margens do bloco', () => {
    const { nome, bloco: b } = largurasMinimas(13.3);
    expect(nome).toBeGreaterThanOrEqual(13.3);
    expect(b).toBeGreaterThanOrEqual(13.3 + 0.7);
    expect(b - nome).toBeLessThan(1.1);
  });

  it('um cabeçalho largo (título comprido e pastilha) alarga o bloco, mas não a coluna dos nomes', () => {
    const { nome, bloco: b } = largurasMinimas(10, 17.3);
    expect(b).toBeGreaterThanOrEqual(17.3);
    expect(b).toBeLessThan(17.5);
    expect(nome).toBeLessThan(10.2);
  });

  it('nunca abaixo das de sempre (cabeçalho)', () => {
    expect(largurasMinimas(0, 3)).toEqual({ nome: LARGURA_MIN_NOME, bloco: LARGURA_MIN_BLOCO });
  });

  it('o maior dos dois manda; um cabeçalho estreito não muda nada', () => {
    expect(largurasMinimas(13.3, 5)).toEqual(largurasMinimas(13.3));
    expect(largurasMinimas(0, 13).bloco).toBeGreaterThanOrEqual(13);
    expect(largurasMinimas(0, Number.NaN)).toEqual(largurasMinimas(0));
  });
});

describe('colunasLadoALado (Himeling: Forêt à esquerda, Grotte à direita)', () => {
  // Forêt: títulos compridos (17 em por bloco); Grotte: 14 em. 4 blocos cada.
  const himeling = [
    { min: 17, n: 4 },
    { min: 14, n: 4 },
  ];
  const precisa = (colunas: number[], partes = himeling) =>
    colunas.reduce((s, c, i) => s + c * ((partes[i]?.min ?? 0) + 0.45) - 0.45, 0) +
    0.6 * (colunas.length - 1);

  it('com espaço, todos numa linha', () => {
    expect(colunasLadoALado(200, himeling)).toEqual([4, 4]);
  });

  it('sem espaço para os 8, só a parte larga passa um bloco à linha de baixo (a outra fica inteira)', () => {
    // 4+4 precisa de ~127 em; com 115, 3+4 cabe (~110) e tem a mesma altura máxima que 3+3, mas menos linhas.
    const colunas = colunasLadoALado(115, himeling);
    expect(colunas).toEqual([3, 4]);
    expect(precisa(colunas)).toBeLessThanOrEqual(115);
  });

  it('prefere 2+2 dos dois lados (2 linhas cada) a 3+1 de um lado e 1 coluna do outro (4 linhas)', () => {
    const colunas = colunasLadoALado(70, himeling);
    expect(colunas).toEqual([2, 2]);
    expect(precisa(colunas)).toBeLessThanOrEqual(70);
  });

  it('nem uma coluna cada cabe: uma coluna cada', () => {
    expect(colunasLadoALado(10, himeling)).toEqual([1, 1]);
  });

  it('sem partes, nada; partes sem blocos contam como um', () => {
    expect(colunasLadoALado(100, [])).toEqual([]);
    expect(colunasLadoALado(100, [{ min: 12.5, n: 0 }])).toEqual([1]);
  });
});

describe('pastilhas no modo de edição (o título não leva reticências depois de uma largada)', () => {
  it('reserva até à lotação e mais uma largada', () => {
    // 9/10 → 10/10: mais um algarismo.
    expect(algarismosDaPastilha(9, 10)).toBe(2);
    expect(algarismosAMais(9, 10)).toBe(1);
    expect(algarismosAMais(5, 12)).toBe(1);
    // Cheia com 9 lugares: a largada seguinte dá 10/9.
    expect(algarismosAMais(9, 9)).toBe(1);
    // Já com os algarismos todos: nada.
    expect(algarismosAMais(10, 10)).toBe(0);
    expect(algarismosAMais(3, 4)).toBe(0);
    expect(algarismosAMais(0, 0)).toBe(0);
    // 99 → 100.
    expect(algarismosAMais(99, 40)).toBe(1);
  });

  it('a assinatura dos cabeçalhos muda só quando a reserva deixa de chegar ou um bloco fica recolhido', () => {
    const comLotacao = (ocupados: number, lugares: number, recolhido = false) => {
      const s = structuredClone(casas);
      const b = bloco(s, 'casa:casa-o1');
      b.lotacao = { ocupados, lugares, nivel: 'livre' };
      b.recolhido = recolhido;
      return assinaturaCabecalhos(s);
    };
    // Os blocos largos (fora das casas) não contam.
    expect(assinaturaCabecalhos(casas).split('.')).toHaveLength(5);
    // 9/10 → 10/10 → 11/10: a reserva chega, não se volta a medir.
    expect(comLotacao(9, 10)).toBe(comLotacao(10, 10));
    expect(comLotacao(10, 10)).toBe(comLotacao(11, 10));
    // 3/4 → 4/4 → 8/4: igual; 9/4 já pede mais um algarismo (10/4 depois).
    expect(comLotacao(3, 4)).toBe(comLotacao(8, 4));
    expect(comLotacao(9, 4)).not.toBe(comLotacao(8, 4));
    expect(comLotacao(9, 4)).toBe(comLotacao(10, 4));
    expect(comLotacao(3, 4, true)).not.toBe(comLotacao(3, 4));
  });
});

describe('Quadro por obras (M2)', () => {
  // Três obras fictícias: A (Alfa, na Aldeia), B e C (Beta; a C sem ninguém). A Ana B. (alfa) trabalha na B.
  const comObras: Estado = {
    ...estadoVistas(),
    obras: [
      criarObra({ id: 'obra-c', nome: 'Obra Fictícia C', clienteId: 'beta', localId: 'parque' }),
      criarObra({ id: 'obra-b', nome: 'Obra Fictícia B', clienteId: 'beta', localId: 'monte' }),
      criarObra({ id: 'obra-a', nome: 'Obra Fictícia A', clienteId: 'alfa', localId: 'aldeia' }),
    ],
    pessoas: estadoVistas().pessoas.map((p) =>
      p.id === 'p-2' || p.id === 'p-4' || p.id === 'p-7'
        ? { ...p, obraId: 'obra-b' }
        : p.id === 'p-3'
          ? { ...p, obraId: 'obra-a' }
          : p,
    ),
  };
  const indO = indexar(comObras);
  const dormO = dormidasDasCarrinhas(comObras, indO);
  const obras = montarQuadro('obras', comObras, indO, dormO);

  it('uma secção por cliente (a ordem dos clientes), um bloco por obra (pelo nome) e "Sem obra" no fim', () => {
    expect(obras.map((s) => s.titulo)).toEqual(['Alfa Obras', 'Beta Construções', null]);
    expect(obras.map((s) => s.nBlocos)).toEqual([1, 2, 0]);
    expect(obras.map((s) => s.nPessoas)).toEqual([1, 3, 4]);
    expect(obras[1]?.faixas[0]?.partes[0]?.blocos.map((b) => b.chave)).toEqual([
      'obra:obra-b',
      'obra:obra-c',
    ]);
  });

  it('cada obra: alvo "obra:<id>", sem lotação nem livres, a morada no detalhe, nomes pela casa de onde vêm', () => {
    const b = bloco(obras, 'obra:obra-b');
    expect(b.tipo).toBe('obra');
    expect(b.id).toBe('obra-b');
    expect(b.titulo).toBe('Obra Fictícia B');
    expect(b.lotacao).toBeNull();
    expect(b.vazios).toBe(0);
    expect(b.largo).toBe(false);
    expect(b.detalhe).toBe(indO.locais.get('monte')?.morada);
    // Casa L1 (ordem 0) antes da Aldeia (3); quem não tem casa no fim.
    expect(nomes(b)).toEqual(['Ana B.', 'Eva D.', 'Óscar G.']);
    expect([...(b.deOnde ?? new Map())]).toEqual([
      ['p-2', 'Casa L1'],
      ['p-4', 'Aldeia'],
      ['p-7', 'Fora das casas CMF'],
    ]);
    // Uma obra sem ninguém continua lá (é um alvo de largar).
    const c = bloco(obras, 'obra:obra-c');
    expect(c.pessoas).toEqual([]);
    expect(c.recolhido).toBe(false);
  });

  it('"Sem obra": bloco largo, pelo cliente e pelo nome, também com a casa de onde vem cada um', () => {
    const s = bloco(obras, 'sem-obra');
    expect(s.largo).toBe(true);
    expect(s.tipo).toBe('sem-obra');
    expect(s.titulo).toBe('Sem obra');
    expect(nomes(s)).toEqual(['Inês H.', 'Ivo F.', 'Luís E.', 'Zé A.']);
    expect(s.porCliente.map((p) => [p.clienteId, p.n])).toEqual([
      ['alfa', 3],
      ['beta', 1],
    ]);
    expect(s.deOnde?.get('p-6')).toBe('Fora das casas CMF');
    expect(s.deOnde?.get('p-1')).toBe('Casa L1');
  });

  it('nos outros agrupamentos não há "de onde"', () => {
    for (const agrup of ['casas', 'carrinhas'] as const) {
      expect(blocosDoQuadro(montarQuadro(agrup, comObras, indO, dormO)).every((b) => b.deOnde === null)).toBe(
        true,
      );
    }
  });

  it('o filtro de clientes funciona: a obra da Beta fica recolhida com a Alfa; o "Sem obra" filtra', () => {
    const f: FiltroQuadro = { clientes: new Set(['alfa']), obras: new Set() };
    const s = montarQuadro('obras', comObras, indO, dormO, f);
    const b = bloco(s, 'obra:obra-b');
    expect(b.recolhido).toBe(true);
    expect(b.escondidas).toBe(3);
    expect(nomes(bloco(s, 'obra:obra-a'))).toEqual(['Rui C.']);
    expect(nomes(bloco(s, 'sem-obra'))).toEqual(['Inês H.', 'Ivo F.', 'Luís E.']);
    // E o das obras: só a B.
    const so = montarQuadro('obras', comObras, indO, dormO, {
      clientes: new Set(),
      obras: new Set(['obra-b']),
    });
    expect(blocosDoQuadro(so).flatMap(nomes)).toEqual(['Ana B.', 'Eva D.', 'Óscar G.']);
  });

  it('uma obra de um cliente que não se conhece vai para "Cliente desconhecido", antes do "Sem obra"', () => {
    const estranho: Estado = {
      ...comObras,
      obras: [
        ...comObras.obras,
        criarObra({ id: 'obra-z', nome: 'Obra Z', clienteId: 'zeta', localId: 'aldeia' }),
      ],
    };
    const indZ = indexar(estranho);
    const s = montarQuadro('obras', estranho, indZ, dormidasDasCarrinhas(estranho, indZ));
    expect(s.map((x) => x.titulo)).toEqual(['Alfa Obras', 'Beta Construções', 'Cliente desconhecido', null]);
  });

  it('sem obras nenhumas: só o "Sem obra" com toda a gente', () => {
    const s = montarQuadro('obras', estado, ind, dormidas);
    expect(s).toHaveLength(1);
    expect(bloco(s, 'sem-obra').pessoas).toHaveLength(8);
  });
});

describe('lotação das carrinhas sem os indisponíveis (M2)', () => {
  it('quem está indisponível hoje não conta na pastilha (o lugar fica livre); o nome continua lá', () => {
    const comPeriodo: Estado = {
      ...estadoVistas(),
      indisponibilidades: [
        criarIndisponibilidade({ id: 'indisp-ficticio-1', pessoaId: 'p-2', inicio: '2026-10-01' }),
      ],
    };
    const indH = indexar(comPeriodo, '2026-10-04');
    const c = montarQuadro('carrinhas', comPeriodo, indH, dormidasDasCarrinhas(comPeriodo, indH));
    const xx1001 = bloco(c, 'carrinha:XX1001');
    expect(xx1001.lotacao).toEqual({ ocupados: 1, lugares: 5, nivel: 'livre' });
    // 2 nomes + 3 vazios = 5 caixas, como o cartão do Mapa (o livre lê-se na pastilha e na marca).
    expect(xx1001.vazios).toBe(3);
    expect(nomes(xx1001)).toEqual(['Zé A.', 'Ana B.']);
    // Na casa a cama não se liberta.
    const casasH = montarQuadro('casas', comPeriodo, indH, dormidasDasCarrinhas(comPeriodo, indH));
    expect(bloco(casasH, 'casa:casa-l1').lotacao?.ocupados).toBe(2);
  });
});
