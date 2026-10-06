-- APLICADA (2026-10-06). Pedidos. RLS sin policies: solo la service role lee/escribe.
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_session_id TEXT NOT NULL UNIQUE,
    customer_email TEXT NOT NULL,
    product_slug TEXT NOT NULL,
    amount_cents INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_session_id ON orders(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_orders_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_orders_product_slug ON orders(product_slug);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
