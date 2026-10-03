// Confirmação antes de "Confirmar todas as sugestões": mostra, carrinha a carrinha, a casa sugerida (a da
// maioria dos passageiros) onde vai passar a dormir. É um só passo do rascunho (Ctrl+Z desfaz tudo) e só
// fica gravado ao Guardar.

import { useMemo } from 'react';
import { nomeDaDormida, type OperacaoDormida } from '../../dominio/operacoes';
import { Matricula } from '../comum/Matricula';
import { useLoja } from '../estado/loja';
import { comPlural } from '../paineis/textos';
import { confirmarTodasSugestoesComAviso } from './acoes';
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import { operacoesConfirmarSugestoes, textoConfirmarSugestoes } from './ondeDorme';
import { soDormidas } from './resumo';

export function DialogoConfirmarSugestoes({ aoFechar }: { aoFechar: () => void }) {
  const estado = useLoja((s) => s.estado);
  const dormidas = useLoja((s) => s.dormidas);
  const ops = useMemo<OperacaoDormida[]>(
    () => (estado && dormidas ? soDormidas(operacoesConfirmarSugestoes(estado, dormidas)) : []),
    [estado, dormidas],
  );
  if (!estado) return null;
  const n = ops.length;
  const matriculas = new Map(estado.carrinhas.map((c) => [c.id, c.matricula]));

  return (
    <Dialogo
      alerta
      largura="normal"
      titulo={n === 0 ? 'Não há sugestões por confirmar' : `${textoConfirmarSugestoes(n)}?`}
      descricao={
        n === 0
          ? 'Todas as carrinhas já têm onde dormem definido (ou não há casa a sugerir).'
          : 'Cada uma passa a dormir na casa onde moram mais passageiros. Só fica gravado ao Guardar.'
      }
      aoFechar={aoFechar}
      fecharFora
      rodape={
        <>
          <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
            Voltar
          </button>
          {n > 0 && (
            <button
              type="button"
              onClick={() => {
                aoFechar();
                confirmarTodasSugestoesComAviso();
              }}
              className={BOTAO_PRIMARIO}
            >
              Confirmar {comPlural(n, 'sugestão', 'sugestões')}
            </button>
          )}
        </>
      }
    >
      {n > 0 && (
        <ul className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2" aria-label="Onde vão dormir">
          {ops.map((op) => (
            <li key={op.carrinhaId} className="flex min-w-0 items-center gap-2 text-sm">
              <Matricula matricula={matriculas.get(op.carrinhaId) ?? op.carrinhaId} altura={16} />
              <span aria-hidden="true" className="text-slate-400">
                →
              </span>
              <span className="sr-only"> dorme em </span>
              <span className="min-w-0 truncate font-medium text-slate-900">
                {nomeDaDormida(estado, op.para)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Dialogo>
  );
}
