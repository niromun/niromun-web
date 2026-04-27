const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY
);

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

        // Extract slugs and fetch real prices from Supabase
        var slugs = items.map(function (i) { return i.slug; });
        var { data: products, error: dbError } = await supabase
            .from('products')
            .select('slug, name, price, stock, type, images')
            .in('slug', slugs);

        if (dbError) {
            console.error('Supabase error:', dbError.message);
            return res.status(500).json({ error: 'Error al verificar los productos' });
        }

        // Build a map for quick lookup
        var productMap = {};
        products.forEach(function (p) { productMap[p.slug] = p; });

        var lineItems = [];
        var hasPhysical = false;
        var purchasedSlugs = [];

        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var slug = item.slug;
            var quantity = parseInt(item.quantity, 10);

            if (!slug || !quantity || quantity < 1) continue;

            var product = productMap[slug];
            if (!product) {
                return res.status(400).json({ error: 'Producto no encontrado: ' + slug });
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

            var image = (product.images && product.images.length > 0) ? product.images[0] : undefined;

            lineItems.push({
                price_data: {
                    currency: 'eur',
                    product_data: {
                        name: product.name,
                        images: image ? [image] : []
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
            success_url: 'https://niromun-web.vercel.app/#gracias',
            cancel_url: 'https://niromun-web.vercel.app/#productos',
            locale: 'es',
            allow_promotion_codes: true,
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
