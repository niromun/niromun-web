// ===== SUPABASE CLIENT =====
const SUPABASE_URL = 'https://uzvxrwwobtzsvhanznsg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_y1nq-c6XUcbpiAkhmMxP5Q_4w7mCmGc';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Keep-alive: una consulta mínima al cargar la página resetea el contador
// de inactividad del plan gratis (se pausa tras ~7 días sin actividad).
(async function supabaseKeepAlive() {
    try {
        await supabaseClient.from('products').select('id').limit(1);
    } catch (_) { /* silencioso: no bloquear la web si falla */ }
})();
