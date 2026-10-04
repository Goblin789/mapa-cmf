import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { criarLocal, criarObra } from '../../dominio/teste-fabrica';
import type { Estado } from '../../dominio/tipos';
import {
  blocosDoQuadro,
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
});
