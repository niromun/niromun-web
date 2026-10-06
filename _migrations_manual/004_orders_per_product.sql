-- PENDIENTE: aplicar ANTES de probar la preview.
-- Una fila por producto comprado; la idempotencia pasa a (sesión, producto).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_stripe_session_id_key;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS orders_session_product_uniq ON orders(stripe_session_id, product_slug);
