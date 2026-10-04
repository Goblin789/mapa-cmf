// Enquanto se pergunta ao servidor quem está dentro: a marca e "A verificar a sessão…". Se o servidor
// não responde (sem rede, a arrancar), diz porquê, quando volta a tentar sozinho e deixa tentar já.

import { useEffect, useState } from 'react';
import { BOTAO_SECUNDARIO } from '../edicao/classes';
import { IconeRodar } from '../edicao/icones';
import { CaixaErro, CartaoMarca, FundoEntrada } from './EcraEntrar';
import { useSessao } from './sessao';

/** Só aparece passado este tempo: com o servidor a responder logo, não pisca nada no ecrã. */
const ATRASO_MS = 400;

/** Segundos que faltam até `instante` (ms desde 1970), atualizados a cada segundo; null sem instante. */
function useSegundosAte(instante: number | null): number | null {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (instante === null) return;
    setAgora(Date.now());
    const t = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [instante]);
  return instante === null ? null : Math.max(0, Math.ceil((instante - agora) / 1000));
}

export function EcraVerificar() {
  const erro = useSessao((s) => s.erro);
  const aVerificar = useSessao((s) => s.aVerificar);
  const proximaTentativaEm = useSessao((s) => s.proximaTentativaEm);
  const verificar = useSessao((s) => s.verificar);
  const segundos = useSegundosAte(proximaTentativaEm);
  const [passouAtraso, setPassouAtraso] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setPassouAtraso(true), ATRASO_MS);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <FundoEntrada>
      <div className={passouAtraso || erro ? undefined : 'invisible'}>
        <CartaoMarca titulo="Mapa CMF">
          {erro ? (
            <div className="mt-5 space-y-3">
              <CaixaErro>
                <p>
                  <strong className="font-semibold">Não foi possível verificar a sessão.</strong> {erro}
                </p>
              </CaixaErro>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <button
                  type="button"
                  aria-disabled={aVerificar}
                  onClick={() => {
                    if (!aVerificar) void verificar();
                  }}
                  className={`${BOTAO_SECUNDARIO} min-h-10`}
                >
                  {aVerificar && <IconeRodar />}
                  {aVerificar ? 'A tentar…' : 'Tentar outra vez'}
                </button>
                {/* Fora da caixa de alerta: a contagem muda a cada segundo e não deve ser lida de cada vez. */}
                {!aVerificar && segundos !== null && (
                  <span className="text-sm text-[var(--cmf-cinzento-claro)] tabular-nums">
                    Nova tentativa daqui a {segundos} s.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p role="status" className="mt-5 flex items-center gap-2 text-[0.9375rem]">
              <IconeRodar />A verificar a sessão…
            </p>
          )}
        </CartaoMarca>
      </div>
    </FundoEntrada>
  );
}
