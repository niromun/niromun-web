const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY
);

// URL base a la que vuelve Stripe tras pagar o cancelar.
// Se calcula con variables de sistema de Vercel (no con cabeceras del cliente),
// para que una preview vuelva a su propia URL y producción a su dominio.
function getBaseUrl() {
    if (process.env.VERCEL_ENV === 'production') {
        return 'https://' + (process.env.VERCEL_PROJECT_PRODUCTION_URL || 'niromun-web.vercel.app');
    }
    if (process.env.VERCEL_URL) {
        var host = process.env.VERCEL_URL;
        var isLocal = host.indexOf('localhost') === 0 || host.indexOf('127.0.0.1') === 0;
        return (isLocal ? 'http://' : 'https://') + host;
    }
    return 'http://localhost:3000';
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido' });
    }

    try {
        var items = req.body && req.body.items;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'La cesta está vacía' });
        }

        // Validate and limit items
        if (items.length > 20) {
            return res.status(400).json({ error: 'Demasiados productos en la cesta' });
        }

        // Extract slugs and fetch real prices from Supabase (only active products)
        var slugs = items.map(function (i) { return i.slug; });
        var { data: products, error: dbError } = await supabase
            .from('products')
            .select('slug, name, price, stock, type, images')
            .eq('active', true)
            .in('slug', slugs);

        if (dbError) {
            console.error('Supabase error:', dbError.message);
            return res.status(500).json({ error: 'Error al verificar los productos' });
        }

        // Build a map for quick lookup
        var productMap = {};
        products.forEach(function (p) { productMap[p.slug] = p; });

        var baseUrl = getBaseUrl();
        var lineItems = [];
        var hasPhysical = false;
        var purchasedSlugs = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var slug = item.slug;
            var quantity = parseInt(item.quantity, 10);

            if (!slug || !quantity || quantity < 1) continue;
            if (purchasedSlugs.indexOf(slug) !== -1) continue; // no duplicar líneas

            var product = productMap[slug];
            if (!product) {
                return res.status(400).json({ error: 'Producto no disponible: ' + slug });
            }

            // Validate stock for physical products
            if (product.type === 'fisico') {
                if (product.stock === 0 || product.stock === null) {
                    return res.status(400).json({ error: product.name + ' está agotado' });
                }
                if (product.stock != null && quantity > product.stock) {
                    return res.status(400).json({
                        error: 'Solo quedan ' + product.stock + ' unidades de ' + product.name
                    });
                }
                hasPhysical = true;
            }

            // Digital products: max quantity 1
            if (product.type === 'digital') {
                quantity = 1;
            }

            // Stripe necesita URLs absolutas para las imágenes
            var image = (product.images && product.images.length > 0) ? product.images[0] : undefined;
            if (image && !/^https?:\/\//.test(image)) {
                image = baseUrl + '/' + image.replace(/^\//, '');
            }

            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: product.name,
                        images: image ? [encodeURI(image)] : [],
                        metadata: { slug: slug }
                    },
                    unit_amount: Math.round(product.price * 100)
                },
                quantity: quantity
            });

            purchasedSlugs.push(slug);
        }

        if (lineItems.length === 0) {
            return res.status(400).json({ error: 'No hay productos válidos en la cesta' });
        }

        // Add shipping cost (3€) once if there are physical products
        if (hasPhysical) {
            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: 'Gastos de envío'
                    },
                    unit_amount: 300
                },
                quantity: 1
            });
        }

        // Build checkout session options
        var sessionOptions = {
            mode: 'payment',
            line_items: lineItems,
            success_url: baseUrl + '/?session_id={CHECKOUT_SESSION_ID}#gracias',
            cancel_url: baseUrl + '/#contenido',
            locale: 'es',
            allow_promotion_codes: true,
            // Sin webhook solo se entregan pagos confirmados al volver de Stripe:
            // se excluyen los métodos que se confirman días después.
            excluded_payment_method_types: ['sepa_debit', 'multibanco', 'customer_balance'],
            metadata: {
                slugs: purchasedSlugs.join(',')
            }
        };

        if (hasPhysical) {
            sessionOptions.shipping_address_collection = {
                allowed_countries: ['ES']
            };
        }

        var session = await stripe.checkout.sessions.create(sessionOptions);

        return res.status(200).json({ url: session.url });

    } catch (err) {
        console.error('Stripe checkout error:', err.message);
        return res.status(500).json({ error: 'Error al iniciar el pago. Inténtalo de nuevo.' });
    }
};
