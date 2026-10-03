// Esqueleto do ecrã principal: topo (contadores + pesquisa), mapa ao centro, caixas laterais à direita.

import { useEffect } from 'react';
import { useLoja } from './estado/loja';
import { Mapa } from './mapa/Mapa';
import { CaixasLaterais } from './paineis/CaixasLaterais';
import { Contadores } from './paineis/Contadores';
import { Legenda } from './paineis/Legenda';
import { PainelFoco } from './paineis/PainelFoco';
import { Pesquisa } from './paineis/Pesquisa';

export function App() {
  const estado = useLoja((s) => s.estado);
  const erro = useLoja((s) => s.erro);
  const carregar = useLoja((s) => s.carregar);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (erro) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="font-semibold text-red-700">Não foi possível carregar os dados.</p>
          <p className="mt-1 text-sm text-slate-600">{erro}</p>
          <button
            type="button"
            className="mt-4 rounded bg-slate-900 px-3 py-1.5 text-sm text-white"
            onClick={() => void carregar()}
          >
            Tentar outra vez
          </button>
        </div>
      </div>
    );
  }

  if (!estado) {
    return <div className="grid h-full place-items-center text-slate-500">A carregar…</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-slate-200 bg-white px-3 py-2">
        <h1 className="text-base font-bold tracking-tight">Mapa CMF</h1>
        <Contadores />
        <div className="ml-auto w-full sm:w-72">
          <Pesquisa />
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <main className="relative min-h-0 min-w-0 flex-1">
          <Mapa />
          <Legenda />
          <PainelFoco />
        </main>
        <CaixasLaterais />
      </div>
    </div>
  );
}
