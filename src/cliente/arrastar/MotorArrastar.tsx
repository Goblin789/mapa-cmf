// Monta o motor de arrastar (motor.ts) enquanto o componente estiver no ecrã. Não desenha nada.
// Vive dentro das caixas laterais, que estão sempre montadas. Se for montado em dois sítios,
// o motor só se instala uma vez.

import { useEffect } from 'react';
import './arrastar.css';
import { instalarMotorArrastar } from './motor';

let utilizadores = 0;
let desinstalar: (() => void) | null = null;

function usarMotor(): () => void {
  utilizadores += 1;
  if (utilizadores === 1) desinstalar = instalarMotorArrastar();
  return () => {
    utilizadores -= 1;
    if (utilizadores === 0) {
      desinstalar?.();
      desinstalar = null;
    }
  };
}

export function MotorArrastar() {
  useEffect(usarMotor, []);
  return null;
}
