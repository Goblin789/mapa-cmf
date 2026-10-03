import { describe, expect, it } from 'vitest';
import { formatarMatricula } from './Matricula';

describe('formatarMatricula', () => {
  it('separa as letras dos algarismos, como nas matrículas luxemburguesas', () => {
    expect(formatarMatricula('CF5001')).toBe('CF 5001');
    expect(formatarMatricula('ks9412')).toBe('KS 9412');
    expect(formatarMatricula(' KS 9412 ')).toBe('KS 9412');
    expect(formatarMatricula('AB-123')).toBe('AB 123');
  });

  it('o que não tem esse formato passa sem mudança', () => {
    expect(formatarMatricula('1-ABC-123')).toBe('1-ABC-123');
    expect(formatarMatricula('Substituta')).toBe('Substituta');
  });
});
