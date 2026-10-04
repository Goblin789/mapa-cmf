// Relatório HTML da sincronização dos dados iniciais (dados/relatorio-sincronizacao.html): autónomo e
// legível por quem não programa. Todo o texto passa por escaparHtml. Função pura.

import type { Estado } from '../dominio/tipos';
import { ESTILO, escaparHtml } from './relatorio';
import {
  consequenciasDaSaida,
  contarPlano,
  formatarValor,
  frasesDoPlano,
  nomeCampo,
  PALAVRAS,
  type PlanoSincronizacao,
  plural,
  rotuloVeiculo,
  textoContagem,
} from './sincronizar';

const e = escaparHtml;

export type ModoSincronizacao = 'ensaio' | 'aplicado' | 'vazio' | 'recusado' | 'falhou';

export interface MetaSincronizacao {
  agora: Date;
  modo: ModoSincronizacao;
  /** Caminho da base de dados. */
  bd: string;
  /** Versão do estado lido (antes de gravar). */
  versao: number | null;
  loteId: number | null;
  /** Mensagem do erro quando a gravação falhou. */
  falha: string | null;
}

const formatoData = new Intl.DateTimeFormat('pt-PT', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'Europe/Luxembourg',
});

function tabela(cabecalhos: string[], linhas: string[][]): string {
  if (linhas.length === 0) return '<p class="nada">Nada.</p>';
  const cab = `<thead><tr>${cabecalhos.map((c) => `<th>${e(c)}</th>`).join('')}</tr></thead>`;
  const corpo = linhas.map((l) => `<tr>${l.map((c) => `<td>${e(c || '—')}</td>`).join('')}</tr>`).join('');
  return `<div class="rolar"><table>${cab}<tbody>${corpo}</tbody></table></div>`;
}

function secao(id: string, titulo: string, corpo: string): string {
  return `<section id="${id}"><h2>${e(titulo)}</h2>${corpo}</section>`;
}

function caixaEstado(plano: PlanoSincronizacao, meta: MetaSincronizacao): string {
  const erros = plano.erros.length;
  switch (meta.modo) {
    case 'ensaio':
      return `<div class="caixa ensaio"><b>Modo de ensaio: nada foi gravado.</b> ${e(
        erros > 0
          ? `Há ${plural(erros, 'erro bloqueante', 'erros bloqueantes')}: é preciso corrigi-los antes de gravar.`
          : 'Para gravar: npm run sincronizar -- --aplicar',
      )}</div>`;
    case 'aplicado':
      return `<div class="caixa ok"><b>Gravado na base de dados.</b> ${e(
        `Lote nº ${meta.loteId ?? '?'} no histórico (autor "dados-iniciais").`,
      )}</div>`;
    case 'vazio':
      return `<div class="caixa ok"><b>Nada a mudar.</b> ${e(
        'A base de dados já está igual aos dados iniciais: não se gravou nada nem se criou lote.',
      )}</div>`;
    case 'recusado':
      return `<div class="caixa erro"><b>Não foi gravado.</b> ${e(
        `Há ${plural(erros, 'erro bloqueante', 'erros bloqueantes')}. A base de dados ficou como estava.`,
      )}</div>`;
    case 'falhou':
      return `<div class="caixa erro"><b>A gravação falhou.</b> ${e(
        `${meta.falha ?? ''} A base de dados ficou como estava.`,
      )}</div>`;
  }
}

function numero(titulo: string, valor: string): string {
  return `<div><b>${e(valor)}</b>${e(titulo)}</div>`;
}

export function gerarRelatorioSincronizacao(
  plano: PlanoSincronizacao,
  estado: Pick<Estado, 'locais' | 'pessoas' | 'casas' | 'carrinhas'>,
  meta: MetaSincronizacao,
): string {
  const n = contarPlano(plano);
  const nomeLocal = (id: string) =>
    [...estado.locais, ...plano.novos.locais].find((l) => l.id === id)?.nome ?? id;

  const numeros = `<div class="numeros">${[
    numero('veículos', textoContagem(n.veiculos, PALAVRAS.veiculos)),
    numero('clientes', textoContagem(n.clientes)),
    numero('casas', textoContagem(n.casas, PALAVRAS.casas)),
    numero('locais', textoContagem(n.locais)),
    numero('pessoas ficam sem transporte (a confirmar)', String(n.semTransporte)),
    numero('condutores retirados', String(n.condutoresRetirados)),
    numero('campos ficaram com o valor do programa', String(n.mantidos)),
  ].join('')}</div>`;

  const frases = frasesDoPlano(plano, estado);
  const resumo = secao(
    'resumo',
    '1. Resumo',
    caixaEstado(plano, meta) +
      numeros +
      '<h3>O que muda</h3>' +
      (frases.length > 0
        ? `<ul>${frases.map((f) => `<li>${e(f)}</li>`).join('')}</ul>`
        : '<p class="nada">Nada: a base de dados já está igual aos dados iniciais.</p>'),
  );

  const erros = secao(
    'erros',
    '2. Erros bloqueantes',
    plano.erros.length > 0
      ? tabela(
          ['Erro', 'Onde'],
          plano.erros.map((x) => [x.mensagem, x.onde ?? '']),
        )
      : '<p class="nada">Nenhum.</p>',
  );

  const pessoas = new Map(estado.pessoas.map((p) => [p.id, p]));
  const veiculosQueSaem = new Map(plano.removidos.carrinhas.map((c) => [c.id, c]));
  const saem = secao(
    'saem',
    '3. O que sai',
    tabela(
      ['Registo', 'O que acontece'],
      [
        ...plano.removidos.carrinhas.map((c) => [rotuloVeiculo(c), consequenciasDaSaida(plano, c)]),
        ...plano.removidos.casas.map((c) => [c.nome, 'Sai (não tinha moradores).']),
        ...plano.removidos.clientes.map((c) => [`Cliente ${c.nome}`, 'Sai (não tinha pessoas nem obras).']),
        ...plano.problemasApagados.map((p) => {
          const casa = estado.casas.find((c) => c.id === p.casaId);
          const carrinha = estado.carrinhas.find((c) => c.id === p.carrinhaId);
          const de = casa ? casa.nome : carrinha ? rotuloVeiculo(carrinha) : (p.casaId ?? p.carrinhaId ?? '');
          return [`Problema resolvido de ${de}`, `«${p.texto}»: apaga-se antes (fica no histórico).`];
        }),
      ],
    ) +
      (plano.semTransporte.length > 0
        ? '<h3>Pessoas que ficam sem transporte</h3>' +
          '<p class="nota">Ficam em "Sem transporte da empresa" e marcadas "a confirmar": é preciso decidir no ' +
          'modo de edição em que veículo vão.</p>' +
          tabela(
            ['Pessoa', 'Ia em', 'Era o condutor'],
            plano.semTransporte.map((s) => {
              const veiculo = veiculosQueSaem.get(s.carrinhaId);
              const condutor = plano.condutoresRetirados.some(
                (c) => c.carrinhaId === s.carrinhaId && c.pessoaId === s.pessoaId,
              );
              return [
                pessoas.get(s.pessoaId)?.nomeCurto ?? s.nomeCurto,
                veiculo ? rotuloVeiculo(veiculo) : s.carrinhaId,
                condutor ? 'sim' : 'não',
              ];
            }),
          )
        : '') +
      (plano.dormidasRetiradas.length > 0
        ? '<h3>Carrinhas que ficam com onde dorme por definir</h3>' +
          tabela(
            ['Carrinha', 'Dormia em'],
            plano.dormidasRetiradas.map((d) => {
              const carrinha = estado.carrinhas.find((c) => c.id === d.carrinhaId);
              return [
                carrinha ? rotuloVeiculo(carrinha) : d.carrinhaId,
                estado.casas.find((c) => c.id === d.casaId)?.nome ?? d.casaId,
              ];
            }),
          )
        : ''),
  );

  const entram = secao(
    'entram',
    '4. O que entra',
    tabela(
      ['Registo', 'Detalhes'],
      [
        ...plano.novos.carrinhas.map((c) => [
          rotuloVeiculo(c),
          [[c.marca, c.modelo].filter(Boolean).join(' '), plural(c.lugares, 'lugar', 'lugares'), c.nota]
            .filter(Boolean)
            .join(' · '),
        ]),
        ...plano.novos.casas.map((c) => [c.nome, `Lotação ${c.lotacao} · ${nomeLocal(c.localId)}`]),
        ...plano.novos.clientes.map((c) => [`Cliente ${c.nome}`, `Cor ${c.cor} · sigla ${c.sigla}`]),
        ...plano.novos.locais.map((l) => [`Local ${l.nome}`, l.morada]),
      ],
    ),
  );

  const linhasMudam = plano.alterados.flatMap((a) =>
    a.mudancas
      .filter((m) => m.campo !== 'ordem')
      .map((m) => [
        a.rotulo,
        nomeCampo(m.campo),
        formatarValor(m.antes, nomeLocal, m.campo),
        formatarValor(m.depois, nomeLocal, m.campo),
      ]),
  );
  const soOrdem = plano.alterados.filter((a) => a.mudancas.some((m) => m.campo === 'ordem')).length;
  const mudam = secao(
    'mudam',
    '5. O que muda',
    tabela(['Registo', 'Campo', 'Antes', 'Depois'], linhasMudam) +
      (soOrdem > 0
        ? `<p class="nota">${e(
            `Também muda a ordem (a posição nos JSON, usada nas listas) de ${plural(soOrdem, 'registo', 'registos')}.`,
          )}</p>`
        : ''),
  );

  const mantidos = secao(
    'programa',
    '6. Ficou o valor do programa',
    '<p class="nota">' +
      e(
        'Estes campos mudaram nos JSON, mas tinham sido mudados no programa: a sincronização nunca desfaz uma ' +
          'edição, por isso fica o valor do programa. Daí em diante estes campos mudam-se no programa. Para ' +
          'aplicar mesmo o valor do JSON: npm run sincronizar -- --aplicar --usar-json entidade:id:campo ' +
          '(ex.: casa:<id>:lotacao; pode repetir-se).',
      ) +
      '</p>' +
      tabela(
        ['Registo', 'Campo', 'No programa (fica)', 'No JSON', 'Para usar o do JSON'],
        plano.mantidos.map((m) => [
          m.rotulo,
          nomeCampo(m.campo),
          formatarValor(m.valorPrograma, nomeLocal, m.campo),
          formatarValor(m.valorJson, nomeLocal, m.campo),
          `--usar-json ${m.entidade}:${m.id}:${m.campo}`,
        ]),
      ) +
      (plano.apagadosNoPrograma.length > 0
        ? `<p class="nota">${e(
            `Apagados no programa (não voltam a entrar): ${plano.apagadosNoPrograma.map((a) => a.rotulo).join(', ')}.`,
          )}</p>`
        : ''),
  );

  const naoSeMexe = secao(
    'nao-mexe',
    '7. O que nunca se mexe',
    '<ul>' +
      [
        'Campos dos JSON que foram mudados no programa (secção 6), a não ser com --usar-json.',
        'Pessoas: casa, carrinha, obra e "a confirmar" (só mudam as pessoas dos veículos que saem da frota).',
        'Condutores das carrinhas (só se retira o dos veículos que saem).',
        'Onde dorme cada carrinha (só fica por definir se a casa onde dormia sair).',
        'Veículos temporários (carros de substituição): geram-se no programa e nunca saem, mesmo que não estejam em carrinhas.json.',
        'Senhorio e equipamento das casas, obras e histórico.',
        'Locais: nunca se apagam (podem ter obras e carrinhas a dormir lá).',
      ]
        .map((t) => `<li>${e(t)}</li>`)
        .join('') +
      '</ul>' +
      (plano.locaisSoNaBd.length > 0
        ? `<p class="nota">${e(
            `Locais que só existem na base de dados (ficam): ${plano.locaisSoNaBd.map((l) => l.nome).join(', ')}.`,
          )}</p>`
        : '') +
      (plano.temporariasSoNaBd.length > 0
        ? `<p class="nota">${e(
            `Veículos temporários que só existem na base de dados (ficam): ${plano.temporariasSoNaBd.map(rotuloVeiculo).join(', ')}.`,
          )}</p>`
        : ''),
  );

  return `<!doctype html>
<html lang="pt-PT">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de sincronização</title>
<style>${ESTILO}</style>
</head>
<body>
<main>
<h1>Relatório de sincronização — Mapa CMF</h1>
<p class="sub">${e(
    `Gerado em ${formatoData.format(meta.agora)}. Base de dados: ${meta.bd}` +
      (meta.versao === null ? '' : ` (versão ${meta.versao})`) +
      '. Compara dados-iniciais/{clientes,casas,carrinhas,locais}.json com a base de dados. ' +
      'Contém nomes de pessoas: não partilhar nem pôr no git.',
  )}</p>
${[resumo, erros, saem, entram, mudam, mantidos, naoSeMexe].join('\n')}
</main>
</body>
</html>
`;
}
