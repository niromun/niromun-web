-- PENDIENTE: aplicar YA (no depende del merge). El código de main no lee esta columna
-- y era legible por cualquiera con la clave anon. Antes, comprobar que 002 copió los enlaces:
--   SELECT p.slug, pf.file_url IS NOT NULL AS tiene_enlace
--   FROM products p LEFT JOIN product_files pf ON pf.product_id = p.id
--   WHERE p.type = 'digital';
ALTER TABLE products DROP COLUMN IF EXISTS digital_file_url;
