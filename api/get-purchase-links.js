const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Cliente con service role: puede leer product_files y escribir orders (ambas con RLS sin policies).
// Solo se usa en servidor; nunca se envía al navegador.
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'missing-service-role-key'
);

const SESSION_ID_RE = /^cs_(test|live)_[A-Za-z0-9]+$/;

module.exports = async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.STRIPE_SECRET_KEY) {
        console.error('[get-purchase-links] Faltan variables de entorno: SUPABASE_SERVICE_ROLE_KEY y/o STRIPE_SECRET_KEY');
        return res.status(500).json({ error: 'Configuración incompleta' });
    }

    var sessionId = req.body && req.body.sessionId;
    if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) {
        return res.status(400).json({ error: 'Sesión no válida' });
    }

    // === 1. Verificar el pago en Stripe ===
    var session, lineItems;
    try {
        session = await stripe.checkout.sessions.retrieve(sessionId);
    } catch (err) {
        if (err && err.code === 'resource_missing') {
            return res.status(404).json({ error: 'Sesión no encontrada' });
        }
        console.error('[get-purchase-links] Error recuperando sesión de Stripe:', err.message);
        return res.status(502).json({ error: 'No se pudo verificar el pago' });
    }

    // 'no_payment_required' cubre compras con un código promocional del 100%
    var isPaid = session.status === 'complete' &&
        (session.payment_status === 'paid' || session.payment_status === 'no_payment_required');
    if (!isPaid) {
        if (session.status === 'complete') {
            // Método de pago diferido: Stripe lo confirmará más tarde
            console.error('[get-purchase-links] Pago completado pero pendiente de confirmar:', sessionId);
            return res.status(202).json({ pending: true, error: 'Pago en proceso' });
        }
        return res.status(402).json({ error: 'Pago no completado' });
    }

    try {
        var li = await stripe.checkout.sessions.listLineItems(sessionId, {
            limit: 100,
            expand: ['data.price.product']
        });
        lineItems = li.data;
    } catch (err) {
        console.error('[get-purchase-links] Error leyendo line items de Stripe:', err.message);
        return res.status(502).json({ error: 'No se pudo verificar el pago' });
    }

    // Slug, cantidad e importe pagado de cada producto (la línea de envío no tiene slug)
    var purchased = [];
    lineItems.forEach(function (item) {
        var product = item.price && item.price.product;
        var slug = product && product.metadata && product.metadata.slug;
        if (!slug) return;
        purchased.push({ slug: slug, quantity: item.quantity || 1, amount_cents: item.amount_total });
    });

    if (purchased.length === 0) {
        console.error('[get-purchase-links] Sesión pagada sin productos identificables:', sessionId);
        return res.status(422).json({ error: 'No se encontraron productos en la compra' });
    }

    // === 2. Leer productos y enlaces (sin filtrar por active: lo comprado se entrega siempre) ===
    var slugs = purchased.map(function (p) { return p.slug; });
    var { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, slug, name, type')
        .in('slug', slugs);

    if (productsError) {
        console.error('[get-purchase-links] Error leyendo products:', productsError.message);
        return res.status(500).json({ error: 'Error al recuperar la compra' });
    }

    var digitalIds = products.filter(function (p) { return p.type === 'digital'; })
        .map(function (p) { return p.id; });

    var filesMap = {};
    if (digitalIds.length > 0) {
        var { data: files, error: filesError } = await supabase
            .from('product_files')
            .select('product_id, file_url')
            .in('product_id', digitalIds);

        if (filesError) {
            console.error('[get-purchase-links] Error leyendo product_files:', filesError.message);
            return res.status(500).json({ error: 'Error al recuperar los enlaces' });
        }
        files.forEach(function (f) { filesMap[f.product_id] = f.file_url; });
    }

    var result = products.map(function (p) {
        var url = p.type === 'digital' ? (filesMap[p.id] || null) : null;
        if (p.type === 'digital' && !url) {
            console.error('[get-purchase-links] ENTREGA FALLIDA: producto digital sin enlace en product_files', {
                slug: p.slug, sessionId: sessionId
            });
        }
        return { slug: p.slug, name: p.name, type: p.type, url: url };
    });

    // === 3. Registrar el pedido (independiente: si falla, el comprador recibe igualmente su enlace) ===
    try {
        var email = (session.customer_details && session.customer_details.email) || session.customer_email || '';
        var rows = purchased.map(function (p) {
            return {
                stripe_session_id: sessionId,
                customer_email: email,
                product_slug: p.slug,
                quantity: p.quantity,
                amount_cents: p.amount_cents,
                status: session.livemode ? 'completed' : 'test'
            };
        });
        // Idempotente: recargar la página no duplica (UNIQUE stripe_session_id + product_slug)
        var { error: orderError } = await supabase
            .from('orders')
            .upsert(rows, { onConflict: 'stripe_session_id,product_slug', ignoreDuplicates: true });
        if (orderError) {
            console.error('[get-purchase-links] Error registrando pedido:', orderError.code, orderError.message, orderError.details, { sessionId: sessionId });
        }
    } catch (err) {
        console.error('[get-purchase-links] Error inesperado registrando pedido:', err.message, { sessionId: sessionId });
    }

    // === 4. Devolver solo lo necesario para la página de gracias ===
    return res.status(200).json({ success: true, purchases: result });
};
