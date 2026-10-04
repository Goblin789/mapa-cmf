import { describe, expect, it } from 'vitest';
import { dormidasDasCarrinhas } from '../../dominio/dormidas';
import { indexar } from '../../dominio/indices';
import { criarLocal } from '../../dominio/teste-fabrica';
import {
  blocosDoQuadro,
  escolherAjuste,
  maiorLetraQueCabe,
  montarQuadro,
  nomeNaZona,
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
    expect(c1.vazios).toBe(0);
    expect(bloco(carrinhas, 'carrinha:XX1005').detalhe).toBe('Carro · Marca Ligeiro');
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
    { compacto: false, minimo: 14, maximo: 30 },
    { compacto: true, minimo: 13, maximo: 30 },
  ];
  const senao = { letra: 13, compacto: true };

  it('se couber tudo com letra legível, não tira nada', () => {
    // Completo cabe até 17; compacto até 19: fica o completo.
    expect(escolherAjuste(degraus, senao, (f, compacto) => f <= (compacto ? 19 : 17))).toEqual({
      letra: 17,
      compacto: false,
      desliza: false,
    });
  });

  it('se o completo só coubesse abaixo do mínimo, passa a compacto em vez de encolher a letra', () => {
    // Completo só cabe a 12 (abaixo de 14); compacto cabe a 15.
    expect(escolherAjuste(degraus, senao, (f, compacto) => f <= (compacto ? 15 : 12))).toEqual({
      letra: 15,
      compacto: true,
      desliza: false,
    });
  });

  it('se nem compacto couber, fica o mínimo e desliza', () => {
    expect(escolherAjuste(degraus, senao, () => false)).toEqual({ letra: 13, compacto: true, desliza: true });
  });
});
