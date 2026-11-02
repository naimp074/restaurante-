import type { Ambiente } from './cliente.ts';

/**
 * Credenciales de cada empresa. Con ARCA_CERTIFICADO_<CUIT> usa las propias de ese CUIT;
 * sin ellas, las generales (ARCA_CERTIFICADO), que también sirven para CUIT delegados.
 */
export type Credenciales = {
  /** CUIT dueño de las credenciales. Vacío en las generales. */
  id: string;
  certificado: string;
  clave: string;
  ambiente: Ambiente;
  /** Único local que puede usar credenciales propias. Sin definir en las generales. */
  local?: string;
};

const ambienteDe = (valor?: string): Ambiente => (valor === 'produccion' ? 'produccion' : 'homologacion');

export const credencialesDe = (cuit: string, leer: (nombre: string) => string | undefined): Credenciales => {
  const certificado = leer(`ARCA_CERTIFICADO_${cuit}`);
  if (certificado) {
    return {
      id: cuit,
      certificado,
      clave: leer(`ARCA_CLAVE_PRIVADA_${cuit}`) || '',
      ambiente: ambienteDe(leer(`ARCA_AMBIENTE_${cuit}`)),
      // Vacío no coincide con ningún local: sin este secreto, nadie factura con ese certificado.
      local: leer(`ARCA_LOCAL_${cuit}`) || '',
    };
  }
  return {
    id: '',
    certificado: leer('ARCA_CERTIFICADO') || '',
    clave: leer('ARCA_CLAVE_PRIVADA') || '',
    ambiente: ambienteDe(leer('ARCA_AMBIENTE')),
  };
};
