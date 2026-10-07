-- Orden de los productos en la tienda (menor = antes). Sin valor: al final, los más nuevos primero.
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER;
UPDATE products SET sort_order = 1 WHERE slug = 'album-halloween-2026';
UPDATE products SET sort_order = 2 WHERE slug = 'libreta-parejas';
UPDATE products SET sort_order = 3 WHERE slug = 'carnet-raton-biblioteca';
