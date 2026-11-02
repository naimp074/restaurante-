/*
  # Acceso a ARCA por empresa

  Cada certificado tiene su propio acceso de 12 horas. cuit vacío: las credenciales generales,
  así el acceso ya guardado sigue sirviendo.
*/

ALTER TABLE arca_tokens ADD COLUMN IF NOT EXISTS cuit text NOT NULL DEFAULT '';
ALTER TABLE arca_tokens DROP CONSTRAINT IF EXISTS arca_tokens_pkey;
ALTER TABLE arca_tokens ADD PRIMARY KEY (ambiente, cuit);
