-- APLICADA (2026-10-06). Producto inactivo hasta el merge a main. Precio en euros (como el resto).
-- Su enlace va en product_files y se inserta a mano en el SQL Editor.
INSERT INTO products (slug, name, price, stock, type, images, active)
VALUES (
    'album-halloween-2026',
    'Álbum Halloween 2026',
    4,
    NULL,
    'digital',
    ARRAY[
        'img/album-halloween-1.jpg', 'img/album-halloween-2.jpg',
        'img/album-halloween-3.jpg', 'img/album-halloween-4.jpg',
        'img/album-halloween-5.jpg', 'img/album-halloween-6.jpg',
        'img/album-halloween-7.jpg', 'img/album-halloween-8.jpg'
    ],
    false
)
ON CONFLICT (slug) DO NOTHING;
