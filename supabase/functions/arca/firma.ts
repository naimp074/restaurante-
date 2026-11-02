import forge from 'npm:node-forge@1.4.2';

/** El CUIT del titular del certificado (campo serialNumber: "CUIT 20111111112"). */
export const cuitDelCertificado = (certificadoPem: string) => {
  const campo = forge.pki.certificateFromPem(certificadoPem).subject.attributes.find(a => a.type === '2.5.4.5');
  return String(campo?.value || '').replace(/\D/g, '');
};

/** Firma el pedido de acceso a WSAA (CMS con el contenido incluido) y lo devuelve en base64. */
export const firmarConCertificado = (certificadoPem: string, clavePem: string) => (texto: string): string => {
  const firma = forge.pkcs7.createSignedData();
  firma.content = forge.util.createBuffer(texto, 'utf8');
  const certificado = forge.pki.certificateFromPem(certificadoPem);
  firma.addCertificate(certificado);
  firma.addSigner({
    key: forge.pki.privateKeyFromPem(clavePem),
    certificate: certificado,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  firma.sign();
  return forge.util.encode64(forge.asn1.toDer(firma.toAsn1()).getBytes());
};
