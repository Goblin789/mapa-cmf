// Painel ao lado do mapa: a lista lateral (lista/ListaLateral.tsx), com "Fora das casas CMF" e
// "Sem transporte da empresa" no fim das vistas por casas e por carrinhas.
// Está sempre montado, por isso é também daqui que se instala o motor de arrastar (lista e mapa).

import { MotorArrastar } from '../arrastar/MotorArrastar';
import { ListaLateral } from '../lista/ListaLateral';

export function CaixasLaterais() {
  return (
    <>
      <MotorArrastar />
      <ListaLateral />
    </>
  );
}
