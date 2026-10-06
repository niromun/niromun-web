-- APLICADA (2026-10-06). Enlaces de entrega. RLS sin policies: solo la service role los lee.
-- Los enlaces se insertan directamente en el SQL Editor, nunca en el repo.
CREATE TABLE IF NOT EXISTS product_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL UNIQUE REFERENCES products(id) ON DELETE CASCADE,
    file_url TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
ALTER TABLE product_files ENABLE ROW LEVEL SECURITY;

-- Copia de los enlaces que había en products.digital_file_url
INSERT INTO product_files (product_id, file_url)
SELECT id, digital_file_url FROM products WHERE digital_file_url IS NOT NULL
ON CONFLICT (product_id) DO NOTHING;
