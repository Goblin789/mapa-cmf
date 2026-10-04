// Nova obra / editar obra (M2, docs/m2.md, "Obras"): nome, cliente, morada e posição (CampoMorada:
// geocodificação no servidor ou clique no mini-mapa) e estacionamento (opcional). Criar = um passo com
// 'registo' do local (tipo 'obra') e da obra (origem 'manual'); apagar só sem pessoas (ou tirando-as no
// mesmo passo). Tudo no rascunho.
// CONTRATO DO M2: o módulo Obras implementa (este ficheiro é dele).

import type { Id } from '../../dominio/tipos';
import { BOTAO_SECUNDARIO } from './classes';
import { Dialogo } from './Dialogo';
import type { PosicaoMapa } from './ui';

export function DialogoObra({
  obraId,
  posicao,
  aoFechar,
}: {
  obraId: Id | null;
  posicao: PosicaoMapa | null;
  aoFechar: () => void;
}) {
  void posicao;
  return (
    <Dialogo
      titulo={obraId === null ? 'Nova obra' : 'Obra'}
      aoFechar={aoFechar}
      rodape={
        <button type="button" data-foco-inicial onClick={aoFechar} className={BOTAO_SECUNDARIO}>
          Fechar
        </button>
      }
    >
      <p className="text-sm text-slate-700">Em construção (M2).</p>
    </Dialogo>
  );
}
