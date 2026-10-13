import { useEffect, useState } from 'react';

/**
 * Los navegadores dejan unos 5 millones de caracteres por sitio en localStorage. Si se
 * llena, los cobros dejan de guardarse: conviene avisar antes de llegar.
 */
const limiteCaracteres = 5_000_000;

export const usoAlmacenamientoLocal = (): number => {
  if (typeof window === 'undefined') return 0;
  try {
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const clave = window.localStorage.key(i) || '';
      total += clave.length + (window.localStorage.getItem(clave)?.length || 0);
    }
    return total / limiteCaracteres;
  } catch {
    return 0;
  }
};

/** Porcentaje (0 a 1) del espacio usado, revisado cada minuto. */
export const useUsoAlmacenamientoLocal = () => {
  const [uso, setUso] = useState(usoAlmacenamientoLocal);
  useEffect(() => {
    const intervalo = window.setInterval(() => setUso(usoAlmacenamientoLocal()), 60_000);
    return () => window.clearInterval(intervalo);
  }, []);
  return uso;
};
