import { describe, expect, it } from 'vitest';
import { textoConsola } from './executarSincronizacao';
import { gerarRelatorioSincronizacao, type MetaSincronizacao } from './relatorioSincronizacao';
import { planearSincronizacao } from './sincronizar';
import { estadoFicticio, referenciaFicticia } from './sincronizarFicticios';

const meta = (parcial: Partial<MetaSincronizacao> = {}): MetaSincronizacao => ({
  agora: new Date('2026-10-04T09:30:00.000Z'),
  modo: 'ensaio',
  bd: 'dados/teste.db',
  versao: 2,
  loteId: null,
  falha: null,
  ...parcial,
});

/** Plano fictício: a ZZ1002 sai (2 pessoas sem transporte, condutor retirado) e entra um carro. */
function plano() {
  const dados = referenciaFicticia();
  dados.carrinhas = dados.carrinhas.filter((c) => c.id !== 'ZZ1002');
  dados.carrinhas.push({
    id: 'ZZ1009',
    matricula: 'ZZ1009',
    matriculasAlternativas: [],
    tipo: 'carro',
    marca: 'Marca <N>',
    modelo: 'Modelo N',
    lugares: 5,
    pessoasDoc: 0,
    nota: null,
  });
  return planearSincronizacao(dados, estadoFicticio());
}

describe('relatório HTML da sincronização', () => {
  it('diz o modo, o que sai (com as pessoas), o que entra, e escapa o texto', () => {
    const html = gerarRelatorioSincronizacao(plano(), estadoFicticio(), meta());
    expect(html).toContain('Modo de ensaio: nada foi gravado.');
    expect(html).toContain(
      'Carrinha ZZ 1002 sai da frota: 2 pessoas ficam sem transporte (a confirmar); condutor retirado',
    );
    expect(html).toContain('<td>Rui Fictício</td><td>Carrinha ZZ 1002</td><td>sim</td>');
    expect(html).toContain('<td>Eva Fictícia</td><td>Carrinha ZZ 1002</td><td>não</td>');
    expect(html).toContain('Carro ZZ 1009');
    expect(html).toContain('Marca &lt;N&gt; Modelo N');
    expect(html).not.toContain('Marca <N>');
  });

  it('aplicado, vazio e recusado têm cada um a sua caixa', () => {
    expect(
      gerarRelatorioSincronizacao(plano(), estadoFicticio(), meta({ modo: 'aplicado', loteId: 7 })),
    ).toContain('Lote nº 7 no histórico');
    const vazio = planearSincronizacao(referenciaFicticia(), estadoFicticio());
    expect(gerarRelatorioSincronizacao(vazio, estadoFicticio(), meta({ modo: 'vazio' }))).toContain(
      'Nada a mudar.',
    );
    expect(gerarRelatorioSincronizacao(plano(), estadoFicticio(), meta({ modo: 'recusado' }))).toContain(
      'Não foi gravado.',
    );
  });
});

describe('resumo na consola', () => {
  it('contagens e o que muda, sem nomes de pessoas', () => {
    const texto = textoConsola(plano(), estadoFicticio(), meta(), 'dados/relatorio.html');
    expect(texto).toContain('Sincronização dos dados iniciais — modo de ensaio (nada foi gravado)');
    expect(texto).toContain('Veículos: 1 novo, 1 atualizado, 1 sai da frota');
    expect(texto).toContain('Pessoas que ficam sem transporte (a confirmar): 2 · Condutores retirados: 1');
    expect(texto).toContain(
      '- Carrinha ZZ 1002 sai da frota: 2 pessoas ficam sem transporte (a confirmar); condutor retirado',
    );
    expect(texto).toContain('Para gravar: npm run sincronizar -- --aplicar');
    expect(texto).not.toMatch(/Rui|Eva|Ana|Gil/);
  });

  it('só avisos (ex.: um local que só existe na base de dados): "nada" a mudar e sem convite a gravar', () => {
    const dados = referenciaFicticia();
    dados.locais = dados.locais.filter((l) => l.id !== 'parque');
    const texto = textoConsola(
      planearSincronizacao(dados, estadoFicticio()),
      estadoFicticio(),
      meta(),
      'dados/relatorio.html',
    );
    expect(texto).toContain('O que muda: nada (a base de dados já está igual aos dados iniciais).');
    expect(texto).toContain('- Local Parque só existe na base de dados: fica (os locais nunca se apagam)');
    expect(texto).not.toContain('Para gravar');
  });
});

describe('relatório: veículos temporários', () => {
  it('diz que o carro de substituição que só existe na base de dados fica', () => {
    const html = gerarRelatorioSincronizacao(plano(), estadoFicticio(), meta());
    expect(html).toContain('Veículos temporários que só existem na base de dados (ficam): Carro ZZ 1008.');
  });
});
