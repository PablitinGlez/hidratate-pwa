/**
 * Service Worker - Hidrátate PWA
 * Estrategia de Caché: App Shell precacheado + Cache First con Network Fallback
 * Gestión de Notificaciones y ciclo de vida
 */

const STATIC_CACHE = 'hidratate-static-v1';
const DYNAMIC_CACHE = 'hidratate-dynamic-v1';
const INMUTABLE_CACHE = 'hidratate-inmutable-v1';

const APP_SHELL = [
    './',
    './index.html',
    './css/style.css',
    './js/app.js',
    './manifest.json',
    './img/icons/icon-72x72.png',
    './img/icons/icon-96x96.png',
    './img/icons/icon-128x128.png',
    './img/icons/icon-144x144.png',
    './img/icons/icon-152x152.png',
    './img/icons/icon-192x192.png',
    './img/icons/icon-384x384.png',
    './img/icons/icon-512x512.png'
];

const APP_SHELL_INMUTABLE = [
    'https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800&display=swap'
];

// ==========================================
// 1. INSTALACIÓN (PRECACHEO APP SHELL)
// ==========================================
self.addEventListener('install', (e) => {
    const cacheStatic = caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(APP_SHELL);
    });

    const cacheInmutable = caches.open(INMUTABLE_CACHE).then((cache) => {
        return cache.addAll(APP_SHELL_INMUTABLE).catch((err) => {
            console.log('Error cacheando fuentes externas (inmutable):', err);
        });
    });

    e.waitUntil(Promise.all([cacheStatic, cacheInmutable]));
    self.skipWaiting();
});

// ==========================================
// 2. ACTIVACIÓN (LIMPIEZA DE CACHÉS ANTIGUAS)
// ==========================================
self.addEventListener('activate', (e) => {
    const cleanCaches = caches.keys().then((keys) => {
        return Promise.all(
            keys.map((key) => {
                if (key !== STATIC_CACHE && key !== DYNAMIC_CACHE && key !== INMUTABLE_CACHE) {
                    console.log('Borrando caché antigua:', key);
                    return caches.delete(key);
                }
            })
        );
    });

    e.waitUntil(cleanCaches);
    self.clients.claim();
});

// ==========================================
// 3. FETCH (CACHE FIRST CON NETWORK FALLBACK)
// ==========================================
self.addEventListener('fetch', (e) => {
    // Si la petición no es GET, dejarla pasar a la red
    if (e.request.method !== 'GET') return;

    const respuesta = caches.match(e.request).then((cacheRes) => {
        if (cacheRes) {
            return cacheRes;
        }

        // Si no está en caché, ir a la red y guardar en caché dinámico
        return fetch(e.request).then((networkRes) => {
            if (networkRes.ok) {
                const resClone = networkRes.clone();
                caches.open(DYNAMIC_CACHE).then((cache) => {
                    cache.put(e.request, resClone);
                });
            }
            return networkRes;
        }).catch(() => {
            // Si no hay red y se intentó navegar, devolver el index.html
            if (e.request.mode === 'navigate') {
                return caches.match('./index.html');
            }
        });
    });

    e.respondWith(respuesta);
});

// ==========================================
// 4. CLICK EN NOTIFICACIÓN
// ==========================================
self.addEventListener('notificationclick', (e) => {
    const notification = e.notification;
    notification.close();

    e.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (let client of clientList) {
                if ('focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./index.html');
            }
        })
    );
});

// ==========================================
// 5. EVENTO PUSH (COMPATIBILIDAD CON SERVIDOR WEB PUSH)
// ==========================================
self.addEventListener('push', (e) => {
    let data = { title: 'Hidrátate 💧', body: '¡Es momento de tomar agua!' };

    if (e.data) {
        try {
            data = e.data.json();
        } catch (err) {
            data.body = e.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: './img/icons/icon-192x192.png',
        badge: './img/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: { url: './index.html' }
    };

    e.waitUntil(self.registration.showNotification(data.title, options));
});
