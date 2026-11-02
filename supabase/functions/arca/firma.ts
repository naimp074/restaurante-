import forge from 'npm:node-forge@1.4.2';

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
