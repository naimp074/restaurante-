import type { ConteoCierre } from './avisoCierreCaja';
import { supabase } from './supabase';

/** Pide a la función de Supabase que mande el mail. El texto lo arma el servidor. */
export const enviarAvisoCierreCaja = async (conteo: ConteoCierre): Promise<boolean> => {
  if (!supabase) throw new Error('No está configurado el envío por Gmail.');
  const { data, error } = await supabase.functions.invoke('aviso-caja', {
    body: {
      fecha: conteo.fecha,
      cajero: conteo.cajero,
      esperado_efectivo: conteo.esperadoEfectivo,
      contado_efectivo: conteo.contadoEfectivo,
      esperado_transferencia: conteo.esperadoTransferencia,
      contado_transferencia: conteo.contadoTransferencia,
    },
  });
  if (error) {
    const respuesta = (error as { context?: Response }).context;
    const detalle = await respuesta?.json?.().catch(() => null) as { error?: string } | null;
    throw new Error(detalle?.error || 'No pude avisar por Gmail.');
  }
  const cuerpo = data as { error?: string; enviado?: boolean } | null;
  if (cuerpo?.error) throw new Error(cuerpo.error);
  return Boolean(cuerpo?.enviado);
};
