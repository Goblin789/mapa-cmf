import { describe, expect, it } from 'vitest';
import {
  descreverRespostaHook,
  lerDeployHook,
  ocultarSegredos,
  segredosDoHook,
  segredosDoValor,
  urlDoPedido,
} from './render';

// Hook fictício: nunca um verdadeiro nos testes.
const HOOK = 'https://api.render.com/deploy/srv-ficticio000?key=ChaveFalsa123';

describe('lerDeployHook', () => {
  it('aceita o formato do Render', () => {
    const r = lerDeployHook(` ${HOOK} `);
    expect('url' in r && r.url.href).toBe(HOOK);
  });

  it('em falta: erro que diz onde o buscar', () => {
    for (const valor of [undefined, '', '   ']) {
      const r = lerDeployHook(valor);
      expect('erro' in r && r.erro).toContain('Settings > Deploy Hook');
    }
  });

  it('recusa o que não é um hook do Render, sem mostrar o valor', () => {
    for (const valor of [
      'srv-ficticio000?key=ChaveFalsa123',
      'http://api.render.com/deploy/srv-ficticio000?key=ChaveFalsa123',
      'https://dashboard.render.com/web/srv-ficticio000',
      'https://api.render.com.exemplo.net/deploy/srv-x?key=ChaveFalsa123',
    ]) {
      const r = lerDeployHook(valor);
      expect(r).toHaveProperty('erro');
      expect(JSON.stringify(r)).not.toContain('ChaveFalsa123');
    }
  });
});

describe('urlDoPedido', () => {
  it('junta o commit (ref) sem perder a chave', () => {
    const url = new URL(urlDoPedido(new URL(HOOK), 'abc1234def'));
    expect(url.searchParams.get('key')).toBe('ChaveFalsa123');
    expect(url.searchParams.get('ref')).toBe('abc1234def');
  });
});

describe('ocultarSegredos', () => {
  it('oculta o hook, o URL do pedido e a chave', () => {
    const hook = new URL(HOOK);
    const pedido = urlDoPedido(hook, 'abc1234');
    const segredos = segredosDoHook(hook, pedido);
    const texto = `falhou ${pedido} e ${HOOK} (key=ChaveFalsa123)`;
    const oculto = ocultarSegredos(texto, segredos);
    expect(oculto).not.toContain('ChaveFalsa123');
    expect(oculto).toBe('falhou *** e *** (key=***)');
  });

  it('segredosDoValor funciona mesmo com um valor inválido', () => {
    expect(segredosDoValor(undefined)).toEqual([]);
    expect(segredosDoValor('nao-e-url-ChaveFalsa123')).toEqual(['nao-e-url-ChaveFalsa123']);
    expect(segredosDoValor(HOOK)).toContain('ChaveFalsa123');
  });
});

describe('descreverRespostaHook', () => {
  it('200: começou, com o id do deploy', () => {
    expect(descreverRespostaHook(200, '{"deploy":{"id":"dep-ficticio1"}}')).toEqual({
      ok: true,
      deployId: 'dep-ficticio1',
      emFila: false,
      mensagem: 'O Render aceitou: a publicação começou (deploy dep-ficticio1).',
    });
    expect(descreverRespostaHook(200, '')).toMatchObject({ ok: true, deployId: null, emFila: false });
  });

  it('202: fica na fila depois da que está a decorrer', () => {
    const r = descreverRespostaHook(202, '');
    expect(r).toMatchObject({ ok: true, emFila: true });
    expect(r.mensagem).toContain('já havia uma publicação a decorrer');
  });

  it('401/403: chave do hook recusada (regenerado?), com a mensagem do Render', () => {
    for (const status of [401, 403]) {
      const r = descreverRespostaHook(status, '{"message":"invalid key"}');
      expect(r.ok).toBe(false);
      expect(r.mensagem).toContain(`HTTP ${status}`);
      expect(r.mensagem).toContain('"invalid key"');
      expect(r.mensagem).toContain('regenerado');
    }
  });

  it('404: serviço recriado OU commit fora do repositório ligado ao Render', () => {
    const r = descreverRespostaHook(404, '{"message":"not found"}');
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('HTTP 404');
    expect(r.mensagem).toContain('"not found"');
    expect(r.mensagem).toContain('Settings > Deploy Hook');
    expect(r.mensagem).toContain('git remote get-url origin');
    expect(r.mensagem).not.toContain('regenerado');
  });

  it('409: serviço suspenso', () => {
    const r = descreverRespostaHook(409, '');
    expect(r.ok).toBe(false);
    expect(r.mensagem).toContain('suspenso');
  });

  it('429 e 5xx: tentar mais tarde', () => {
    expect(descreverRespostaHook(429, '').mensagem).toContain('uns minutos');
    expect(descreverRespostaHook(503, '<html>').mensagem).toContain('HTTP 503');
    expect(descreverRespostaHook(400, '{"message":"x"}').ok).toBe(false);
  });
});
