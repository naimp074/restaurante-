/** Cliente SOAP de ARCA: WSAA (acceso) y WSFEv1 (factura electrónica). */

export type Ambiente = 'homologacion' | 'produccion';

const servidores: Record<Ambiente, { wsaa: string; wsfe: string }> = {
  homologacion: {
    wsaa: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  },
  produccion: {
    wsaa: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
    wsfe: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
  },
};

const nsWsfe = 'http://ar.gov.afip.dif.FEV1/';

/** ARCA no respondió o está caída: el comprobante queda pendiente y se puede reintentar. */
export class ErrorTemporal extends Error {}

export type Acceso = { token: string; firma: string; vence: string };

export interface AlmacenTokens {
  leer(ambiente: Ambiente): Promise<Acceso | null>;
  guardar(ambiente: Ambiente, acceso: Acceso): Promise<void>;
}

export type DetalleCAE = {
  concepto: number; docTipo: number; docNro: string; numero: number; fecha: string;
  total: number; neto: number; iva: number; alicuotaId?: number; condicionIva: number;
  asociado?: { tipo: number; puntoVenta: number; numero: number; cuit: string; fecha: string };
};

export type RespuestaCAE =
  | { resultado: 'A'; cae: string; vencimiento: string; observaciones: string }
  | { resultado: 'R'; errores: { codigo: number; mensaje: string }[] };

const escapar = (texto: string) => texto
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const desescapar = (texto: string) => texto
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

/** Contenido de cada <etiqueta>, con o sin prefijo de espacio de nombres. */
export const bloques = (xml: string, etiqueta: string) =>
  [...xml.matchAll(new RegExp(`<(?:[\\w-]+:)?${etiqueta}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${etiqueta}>`, 'g'))].map(m => m[1]);

export const valor = (xml: string, etiqueta: string) => {
  const encontrado = bloques(xml, etiqueta)[0];
  return encontrado === undefined ? '' : desescapar(encontrado.trim());
};

const errores = (xml: string, contenedor: string, item: string) =>
  bloques(bloques(xml, contenedor)[0] || '', item).map(b => ({ codigo: Number(valor(b, 'Code')), mensaje: valor(b, 'Msg') }));

// 500-599: fallas internas de ARCA. 600-699: problemas con el acceso, salvo 602 (no existe).
const esTemporal = (codigo: number) => (codigo >= 500 && codigo < 600) || (codigo >= 600 && codigo < 700 && codigo !== 602);

const importe = (n: number) => n.toFixed(2);

export const crearClienteArca = (opciones: {
  ambiente: Ambiente;
  firmar: (texto: string) => string;
  tokens: AlmacenTokens;
  fetchApi?: typeof fetch;
  milisegundos?: number;
}) => {
  const { ambiente, firmar, tokens } = opciones;
  const fetchApi = opciones.fetchApi || fetch;
  const espera = opciones.milisegundos ?? 20_000;
  const urls = servidores[ambiente];

  const enviar = async (url: string, accion: string, sobre: string) => {
    let respuesta: Response;
    try {
      respuesta = await fetchApi(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${accion}"` },
        body: sobre,
        signal: AbortSignal.timeout(espera),
      });
    } catch (error) {
      throw new ErrorTemporal(`No pude comunicarme con ARCA: ${error instanceof Error ? error.message : 'sin detalle'}`);
    }
    const texto = await respuesta.text();
    if (!respuesta.ok && !texto.includes('Fault')) throw new ErrorTemporal(`ARCA respondió ${respuesta.status}.`);
    return texto;
  };

  const acceder = async (): Promise<Acceso> => {
    const guardado = await tokens.leer(ambiente);
    if (guardado && new Date(guardado.vence).getTime() > Date.now() + 5 * 60_000) return guardado;

    const ahora = Date.now();
    const pedido = `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header>`
      + `<uniqueId>${Math.floor(ahora / 1000)}</uniqueId>`
      + `<generationTime>${new Date(ahora - 600_000).toISOString()}</generationTime>`
      + `<expirationTime>${new Date(ahora + 600_000).toISOString()}</expirationTime>`
      + `</header><service>wsfe</service></loginTicketRequest>`;
    const sobre = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:wsaa="http://wsaa.view.sua.dvadac.desein.afip.gov">`
      + `<soapenv:Header/><soapenv:Body><wsaa:loginCms><wsaa:in0>${firmar(pedido)}</wsaa:in0></wsaa:loginCms></soapenv:Body></soapenv:Envelope>`;
    const xml = await enviar(urls.wsaa, '', sobre);

    const retorno = valor(xml, 'loginCmsReturn');
    if (!retorno) {
      const falla = valor(xml, 'faultstring');
      throw new ErrorTemporal(`ARCA no dio acceso: ${falla || 'respuesta inesperada'}. Revisá el certificado y que el servicio wsfe esté autorizado para este CUIT.`);
    }
    const acceso = { token: valor(retorno, 'token'), firma: valor(retorno, 'sign'), vence: valor(retorno, 'expirationTime') };
    if (!acceso.token || !acceso.firma) throw new ErrorTemporal('ARCA respondió el acceso sin token.');
    await tokens.guardar(ambiente, acceso);
    return acceso;
  };

  const llamar = async (cuit: string, metodo: string, contenido: string) => {
    const acceso = await acceder();
    const sobre = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>`
      + `<${metodo} xmlns="${nsWsfe}"><Auth><Token>${escapar(acceso.token)}</Token><Sign>${escapar(acceso.firma)}</Sign><Cuit>${cuit}</Cuit></Auth>`
      + `${contenido}</${metodo}></soap:Body></soap:Envelope>`;
    const xml = await enviar(urls.wsfe, `${nsWsfe}${metodo}`, sobre);
    const falla = valor(xml, 'faultstring');
    if (falla) throw new ErrorTemporal(`ARCA: ${falla}`);
    return xml;
  };

  return {
    async ultimoNumero(cuit: string, puntoVenta: number, cbteTipo: number) {
      const xml = await llamar(cuit, 'FECompUltimoAutorizado', `<PtoVta>${puntoVenta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo>`);
      const fallas = errores(xml, 'Errors', 'Err');
      if (fallas.length) {
        const texto = fallas.map(f => `${f.codigo}: ${f.mensaje}`).join(' · ');
        if (fallas.some(f => esTemporal(f.codigo))) throw new ErrorTemporal(texto);
        throw new Error(texto);
      }
      return Number(valor(xml, 'CbteNro')) || 0;
    },

    /** Busca un comprobante ya emitido. null si ARCA no lo tiene. */
    async consultar(cuit: string, puntoVenta: number, cbteTipo: number, numero: number) {
      const xml = await llamar(cuit, 'FECompConsultar',
        `<FeCompConsReq><CbteTipo>${cbteTipo}</CbteTipo><CbteNro>${numero}</CbteNro><PtoVta>${puntoVenta}</PtoVta></FeCompConsReq>`);
      const fallas = errores(xml, 'Errors', 'Err');
      if (fallas.some(f => f.codigo === 602)) return null;
      if (fallas.length) throw new ErrorTemporal(fallas.map(f => `${f.codigo}: ${f.mensaje}`).join(' · '));
      return {
        resultado: valor(xml, 'Resultado'),
        cae: valor(xml, 'CodAutorizacion'),
        vencimiento: valor(xml, 'FchVto'),
        fecha: valor(xml, 'CbteFch'),
        docNro: valor(xml, 'DocNro'),
        total: Number(valor(xml, 'ImpTotal')),
      };
    },

    async solicitarCAE(cuit: string, puntoVenta: number, cbteTipo: number, d: DetalleCAE): Promise<RespuestaCAE> {
      const servicios = d.concepto === 1 ? '' : `<FchServDesde>${d.fecha}</FchServDesde><FchServHasta>${d.fecha}</FchServHasta><FchVtoPago>${d.fecha}</FchVtoPago>`;
      const asociado = d.asociado
        ? `<CbtesAsoc><CbteAsoc><Tipo>${d.asociado.tipo}</Tipo><PtoVta>${d.asociado.puntoVenta}</PtoVta><Nro>${d.asociado.numero}</Nro><Cuit>${d.asociado.cuit}</Cuit><CbteFch>${d.asociado.fecha}</CbteFch></CbteAsoc></CbtesAsoc>`
        : '';
      const iva = d.alicuotaId ? `<Iva><AlicIva><Id>${d.alicuotaId}</Id><BaseImp>${importe(d.neto)}</BaseImp><Importe>${importe(d.iva)}</Importe></AlicIva></Iva>` : '';
      // El orden de los campos es el del WSDL: ARCA lo exige.
      const contenido = `<FeCAEReq><FeCabReq><CantReg>1</CantReg><PtoVta>${puntoVenta}</PtoVta><CbteTipo>${cbteTipo}</CbteTipo></FeCabReq><FeDetReq><FECAEDetRequest>`
        + `<Concepto>${d.concepto}</Concepto><DocTipo>${d.docTipo}</DocTipo><DocNro>${d.docNro}</DocNro>`
        + `<CbteDesde>${d.numero}</CbteDesde><CbteHasta>${d.numero}</CbteHasta><CbteFch>${d.fecha}</CbteFch>`
        + `<ImpTotal>${importe(d.total)}</ImpTotal><ImpTotConc>0.00</ImpTotConc><ImpNeto>${importe(d.neto)}</ImpNeto><ImpOpEx>0.00</ImpOpEx><ImpTrib>0.00</ImpTrib><ImpIVA>${importe(d.iva)}</ImpIVA>`
        + `${servicios}<MonId>PES</MonId><MonCotiz>1</MonCotiz><CondicionIVAReceptorId>${d.condicionIva}</CondicionIVAReceptorId>${asociado}${iva}`
        + `</FECAEDetRequest></FeDetReq></FeCAEReq>`;
      const xml = await llamar(cuit, 'FECAESolicitar', contenido);

      const fallas = errores(xml, 'Errors', 'Err');
      if (fallas.some(f => esTemporal(f.codigo))) throw new ErrorTemporal(fallas.map(f => `${f.codigo}: ${f.mensaje}`).join(' · '));
      const detalle = bloques(xml, 'FECAEDetResponse')[0] || '';
      const observaciones = errores(detalle, 'Observaciones', 'Obs');
      if (valor(detalle, 'Resultado') === 'A') {
        return {
          resultado: 'A',
          cae: valor(detalle, 'CAE'),
          vencimiento: valor(detalle, 'CAEFchVto'),
          observaciones: observaciones.map(o => o.mensaje).join(' · '),
        };
      }
      const motivos = [...fallas, ...observaciones];
      if (!detalle && !fallas.length) throw new ErrorTemporal('ARCA respondió sin resultado.');
      return { resultado: 'R', errores: motivos.length ? motivos : [{ codigo: 0, mensaje: 'ARCA rechazó el comprobante sin dar motivo.' }] };
    },
  };
};

export type ClienteArca = ReturnType<typeof crearClienteArca>;
