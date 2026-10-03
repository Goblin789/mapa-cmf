import { describe, expect, it } from 'vitest';
import { dadosFicticios, folhaExtraFicticia, folhaPessoalFicticia, michaelFicticio } from './dadosFicticios';
import { processarImportacao } from './processar';
import { escaparHtml, gerarRelatorioHtml, type MetaRelatorio } from './relatorio';

const meta: MetaRelatorio = {
  agora: new Date('2026-10-03T10:00:00Z'),
  modo: 'ensaio',
  bd: null,
  loteId: null,
  falha: null,
  ficheiros: [{ nome: 'lista.xlsx', pasta: 'C:\\origem', modificadoEm: null, nota: 'Lista mestra (fonte)' }],
};

function resultado(pessoal = folhaPessoalFicticia()) {
  return processarImportacao({
    listaMestra: new Map([
      ['Pessoal', pessoal],
      ['Não estão na lista', folhaExtraFicticia()],
    ]),
    michael: michaelFicticio(),
    dados: dadosFicticios(),
  });
}

describe('escaparHtml', () => {
  it('escapa os caracteres especiais', () => {
    expect(escaparHtml(`<b class="x">'A' & B</b>`)).toBe(
      '&lt;b class=&quot;x&quot;&gt;&#39;A&#39; &amp; B&lt;/b&gt;',
    );
  });
});

describe('gerarRelatorioHtml', () => {
  it('tem as 10 secções e os números principais', () => {
    const html = gerarRelatorioHtml(resultado(), meta);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    for (let i = 1; i <= 10; i++) expect(html).toContain(`<h2>${i}. `);
    expect(html).toContain('Modo de ensaio: nada foi gravado.');
    expect(html).toContain('Casa 1 Rue de la Forêt');
    expect(html).toContain('3 (escreveu 2)'); // fora das casas: 3 nomes no Michael, escreveu 2
    expect(html).toContain('Talvez seja &quot;Maria Teste&quot;');
    expect(html).toContain('CC3333');
  });

  it('as diferenças não dependem só da cor (marca ≠ além do amarelo)', () => {
    const html = gerarRelatorioHtml(resultado(), meta);
    // Cliente Bêta: lista 2, Michael 3.
    expect(html).toContain('<td class="n dif difere">3</td>');
    expect(html).toContain('.difere::after { content: " ≠"');
  });

  it('escapa todo o texto vindo dos Excel', () => {
    const pessoal = folhaPessoalFicticia();
    pessoal.push(['900-099', 'X', 'Y', '<script>alert(1)</script>', 'ALFA', '<i>Casa</i>', null, null]);
    const html = gerarRelatorioHtml(resultado(pessoal), meta);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<i>Casa</i>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('mostra o resultado da gravação', () => {
    const r = resultado();
    expect(gerarRelatorioHtml(r, { ...meta, modo: 'aplicado', bd: 'dados/x.db', loteId: 7 })).toContain(
      'lote de importação nº 7',
    );
    expect(gerarRelatorioHtml(r, { ...meta, modo: 'recusado' })).toContain('Não foi gravado.');
    expect(gerarRelatorioHtml(r, { ...meta, modo: 'falhou', falha: 'disco <cheio>' })).toContain(
      'disco &lt;cheio&gt;',
    );
    const protegido = gerarRelatorioHtml(r, {
      ...meta,
      modo: 'protegido',
      falha: 'A base de dados tem 2 gravações feitas no programa; reimportar apagava-as.',
    });
    expect(protegido).toContain('Não foi gravado: a base de dados ficou como estava.');
    expect(protegido).toContain('2 gravações feitas no programa');
  });
});
