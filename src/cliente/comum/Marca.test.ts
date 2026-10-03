import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Marca } from './Marca';

/** Pasta pública do Vite (root em src/cliente): o que lá está serve-se a partir de "/". */
const PUBLICA = fileURLToPath(new URL('../public', import.meta.url));
const existeNoSite = (caminho: string) => existsSync(`${PUBLICA}${caminho}`);

describe('Marca (título da página)', () => {
  const html = renderToStaticMarkup(createElement(Marca, { className: 'order-1' }));

  it('é o único <h1> e o nome acessível é "Mapa CMF"', () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 class="marca [^"]*order-1">/);
    expect(html).toContain('<span class="sr-only">Mapa CMF</span>');
  });

  it('as imagens são decorativas e a palavra visível não se lê duas vezes', () => {
    const imagens = html.match(/<img\b[^>]*>/g) ?? [];
    expect(imagens).toHaveLength(2);
    for (const img of imagens) expect(img).toContain('alt=""');
    expect(html).toMatch(/<span class="marca-titulo" aria-hidden="true">Mapa<\/span>/);
  });

  it('o logótipo e o símbolo existem na pasta pública, com as medidas do manual (120 px de largura)', () => {
    const fontes = [...html.matchAll(/src="([^"]+)"/g)].map((m) => m[1] as string);
    expect(fontes).toEqual(['/marca/cmf-logo.svg', '/marca/cmf-marca.svg']);
    for (const f of fontes) expect(existeNoSite(f), f).toBe(true);
    expect(html).toMatch(
      /<img class="marca-logotipo" src="\/marca\/cmf-logo.svg" alt="" width="120" height="45"/,
    );
  });
});

describe('index.html', () => {
  const html = readFileSync(fileURLToPath(new URL('../index.html', import.meta.url)), 'utf8');

  it('título "Mapa CMF" e língua pt-PT', () => {
    expect(html).toContain('<title>Mapa CMF</title>');
    expect(html).toContain('<html lang="pt-PT">');
  });

  it('todos os ícones apontam para ficheiros que existem', () => {
    const icones = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)].map(
      (m) => m[1] as string,
    );
    expect(icones.length).toBeGreaterThanOrEqual(3);
    for (const i of icones) expect(existeNoSite(i), i).toBe(true);
  });

  it('nada vem do Google Fonts (RGPD)', () => {
    expect(html).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
  });
});
