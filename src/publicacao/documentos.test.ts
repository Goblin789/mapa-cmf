// Os guias (README.md, docs/publicar.md, docs/recuperar.md) e a configuração da publicação (render.yaml,
// .github/workflows/) têm de bater com o código: comandos, variáveis, rotas e as mensagens do servidor que
// os guias mandam procurar nos Logs. Se alguém mudar uma destas coisas no código, este teste diz que guia
// atualizar. Só lê ficheiros do repositório (nada de rede).

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CAMINHO_SAUDE } from './saude';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const ler = (caminho: string): string => readFileSync(join(RAIZ, caminho), 'utf8');

const GUIAS = ['README.md', 'docs/publicar.md', 'docs/recuperar.md'] as const;
const guias = GUIAS.map((caminho) => ({ caminho, texto: ler(caminho) }));
const todosOsGuias = guias.map((g) => g.texto).join('\n');

/** Código do servidor (sem testes), onde estão as mensagens e a leitura das variáveis. */
const codigoServidor = readdirSync(join(RAIZ, 'src/servidor'), { recursive: true, encoding: 'utf8' })
  .filter((ficheiro) => ficheiro.endsWith('.ts') && !ficheiro.endsWith('.test.ts'))
  .map((ficheiro) => ler(join('src/servidor', ficheiro)))
  .join('\n');

const renderYaml = ler('render.yaml');

describe('os guias e o código', () => {
  it('cada "npm run …" dos guias existe no package.json', () => {
    const scripts = Object.keys(
      (JSON.parse(ler('package.json')) as { scripts: Record<string, string> }).scripts,
    );
    for (const { caminho, texto } of guias) {
      for (const [, nome] of texto.matchAll(/npm run ([\w:-]+)/g)) {
        expect(scripts, `${caminho}: npm run ${nome}`).toContain(nome);
      }
    }
  });

  it('cada "npm run copias -- …" usa um subcomando que existe (scripts/copias.ts)', () => {
    const subcomandos = new Set(
      [...ler('scripts/copias.ts').matchAll(/^\/\/\s+npm run copias -- (\w+)/gm)].map((m) => m[1]),
    );
    expect(subcomandos.size).toBeGreaterThanOrEqual(5);
    for (const { caminho, texto } of guias) {
      // No README a lista vem como chave\|fazer\|…: conta só a primeira.
      for (const [, sub] of texto.matchAll(/npm run copias -- (\w+)/g)) {
        expect(subcomandos.has(sub), `${caminho}: npm run copias -- ${sub}`).toBe(true);
      }
    }
  });

  it('os ficheiros do repositório citados nos guias existem', () => {
    for (const { caminho, texto } of guias) {
      for (const [, citado] of texto.matchAll(/`((?:docs|src|scripts|\.github)\/[\w./-]+)`/g)) {
        expect(existsSync(join(RAIZ, citado as string)), `${caminho}: ${citado}`).toBe(true);
      }
    }
  });

  // Mensagens que os guias mandam procurar nos Logs do Render: têm de continuar a existir no servidor.
  const MENSAGENS = [
    'BD restaurada da cópia',
    'Já podes apagar RESTAURAR_AO_ARRANCAR',
    'RESTAURAR_AO_ARRANCAR foi ignorada',
    'Configuração inválida: ',
    'Configuração das cópias inválida',
    'Não foi possível preparar a base de dados',
    'Não foi possível restaurar a cópia',
    'A cópia está danificada ou a chave não é a certa.',
    'Não há nenhuma cópia',
    'mas o destino das cópias',
    'decifrada e íntegra',
  ];
  it.each(MENSAGENS)('"%s": nos guias e no servidor', (mensagem) => {
    expect(todosOsGuias).toContain(mensagem.trim());
    expect(codigoServidor).toContain(mensagem);
  });

  it('RESTAURAR_AO_ARRANCAR=nenhuma (BD vazia de propósito) é o valor que o servidor aceita', () => {
    expect(codigoServidor).toContain("SEM_RESTAURO = 'nenhuma'");
    expect(ler('docs/recuperar.md')).toContain('`RESTAURAR_AO_ARRANCAR` = `nenhuma`');
  });

  // O servidor tem a BD de produção sempre aberta e o restauro recusa substituí-la (src/servidor/copias/
  // restauro.ts); no Render não se consegue parar o servidor e ficar com a Shell. Nenhum guia pode mandar
  // restaurar por cima da BD de produção, nem por cima da do PC no ensaio.
  it('nenhum guia manda restaurar por cima da BD de produção ou da do PC', () => {
    for (const { caminho, texto } of guias) {
      expect(texto, caminho).not.toMatch(/restaurar[^\n]*--para\s+\/var\/data\/mapa\.db/);
      expect(texto, caminho).not.toMatch(/restaurar[^\n]*--para\s+dados\/mapa\.db/);
    }
  });
});

describe('render.yaml e os workflows', () => {
  it('cada variável do render.yaml é lida pelo servidor', () => {
    const chaves = [...renderYaml.matchAll(/^\s*- key: (\w+)\s*$/gm)].map((m) => m[1] as string);
    expect(chaves).toContain('RESTAURAR_AO_ARRANCAR');
    for (const chave of chaves) {
      const lida = new RegExp(`env\\.${chave}\\b|['"\`]${chave}['"\`]`);
      expect(lida.test(codigoServidor), chave).toBe(true);
    }
  });

  it('o health check do Render e a vigilância perguntam à rota de saúde do servidor', () => {
    expect(renderYaml).toMatch(new RegExp(`^\\s*healthCheckPath: ${CAMINHO_SAUDE}\\s*$`, 'm'));
    expect(ler('.github/workflows/vigiar.yml')).toContain(`${CAMINHO_SAUDE}"`);
    expect(codigoServidor).toContain(`app.get('${CAMINHO_SAUDE}'`);
  });

  it('a BD fica no disco persistente', () => {
    const montagem = /^\s*mountPath: (\S+)\s*$/m.exec(renderYaml)?.[1];
    const bd = /- key: BD\s*\n\s*value: (\S+)/.exec(renderYaml)?.[1];
    expect(montagem).toBe('/var/data');
    expect(bd?.startsWith(`${montagem}/`)).toBe(true);
  });

  it('o GitHub usa a versão do Node do .node-version (a mesma que o Render)', () => {
    expect(ler('.node-version').trim()).toMatch(/^\d+/);
    expect(ler('.github/workflows/verificar.yml')).toMatch(/node-version-file: \.node-version/);
  });
});
