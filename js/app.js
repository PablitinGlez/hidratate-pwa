/**
 * HIDRÁTATE - Progressive Web App Logic
 * Manejo de estado, LocalStorage, animaciones de agua y Notificaciones
 */

// ==========================================
// 1. ESTADO DE LA APLICACIÓN
// ==========================================
const DEFAULT_GOAL = 2000;
let appState = {
    intake: 0,
    goal: DEFAULT_GOAL,
    glasses: 0,
    streak: 1,
    lastDate: new Date().toLocaleDateString(),
    reminderInterval: 0, // Minutos (0 = desactivado)
    notificationsEnabled: false,
    halfNotified: false,
    goalNotified: false
};

let reminderTimer = null;

// ==========================================
// 2. ELEMENTOS DEL DOM
// ==========================================
const currentDateEl = document.getElementById('current-date');
const percentageTxtEl = document.getElementById('percentage-txt');
const currentAmountEl = document.getElementById('current-amount');
const goalDisplayEl = document.getElementById('goal-display');
const statusMsgEl = document.getElementById('status-msg');
const waterWaveEl = document.getElementById('water-wave');

const streakValEl = document.getElementById('streak-val');
const remainingValEl = document.getElementById('remaining-val');
const glassesValEl = document.getElementById('glasses-val');

const addWaterBtns = document.querySelectorAll('.add-water-btn');
const customAmountInput = document.getElementById('custom-amount-input');
const customAddBtn = document.getElementById('custom-add-btn');
const resetDayBtn = document.getElementById('reset-day-btn');

const notifToggleBtn = document.getElementById('notif-toggle-btn');
const notifBadge = document.getElementById('notif-badge');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings-btn');
const saveSettingsBtn = document.getElementById('save-settings-btn');
const testNotifBtn = document.getElementById('test-notif-btn');

const goalInput = document.getElementById('goal-input');
const reminderIntervalSelect = document.getElementById('reminder-interval');
const offlineBanner = document.getElementById('offline-banner');
const toastEl = document.getElementById('toast');

// ==========================================
// 3. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    initDateHeader();
    loadFromStorage();
    setupEventListeners();
    initOnlineOfflineListeners();
    registerServiceWorker();
    checkExistingNotificationPermission();
    renderUI();
});

function initDateHeader() {
    const options = { weekday: 'long', day: 'numeric', month: 'short' };
    const dateStr = new Date().toLocaleDateString('es-ES', options);
    currentDateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
}

// ==========================================
// 4. ALMACENAMIENTO LOCAL (PERSISTENCIA OFFLINE)
// ==========================================
function loadFromStorage() {
    const saved = localStorage.getItem('hidratate_state');
    const today = new Date().toLocaleDateString();

    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            
            // Si es un nuevo día, reiniciar conteo pero mantener o actualizar racha
            if (parsed.lastDate !== today) {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const wasYesterday = parsed.lastDate === yesterday.toLocaleDateString();

                appState = {
                    intake: 0,
                    goal: parsed.goal || DEFAULT_GOAL,
                    glasses: 0,
                    streak: wasYesterday && parsed.intake >= parsed.goal ? (parsed.streak || 1) + 1 : 1,
                    lastDate: today,
                    reminderInterval: parsed.reminderInterval || 0,
                    notificationsEnabled: parsed.notificationsEnabled || false,
                    halfNotified: false,
                    goalNotified: false
                };
            } else {
                appState = { ...appState, ...parsed };
            }
        } catch (e) {
            console.error('Error cargando estado:', e);
        }
    } else {
        appState.lastDate = today;
    }

    saveToStorage();
    setupReminderTimer();
}

function saveToStorage() {
    localStorage.setItem('hidratate_state', JSON.stringify(appState));
}

// ==========================================
// 5. LÓGICA DE AGREGAR Y RENDERIZAR
// ==========================================
function addWater(amount) {
    if (isNaN(amount) || amount <= 0) return;

    appState.intake += amount;
    appState.glasses += Math.max(1, Math.round(amount / 250));
    
    showToast(`+${amount} ml agregados 💧`);
    checkMilestones();
    saveToStorage();
    renderUI();
}

function renderUI() {
    const { intake, goal, streak, glasses } = appState;
    const percentage = Math.min(100, Math.round((intake / goal) * 100));
    const remaining = Math.max(0, goal - intake);

    // Textos
    currentAmountEl.textContent = intake.toLocaleString();
    goalDisplayEl.textContent = goal.toLocaleString();
    percentageTxtEl.textContent = `${percentage}%`;
    streakValEl.textContent = `${streak} día${streak > 1 ? 's' : ''}`;
    remainingValEl.textContent = `${remaining.toLocaleString()} ml`;
    glassesValEl.textContent = glasses;

    // Altura del agua animada
    waterWaveEl.style.height = `${percentage}%`;

    // Mensaje dinámico motivacional
    if (percentage === 0) {
        statusMsgEl.textContent = '¡Empieza a hidratarte! 💧';
    } else if (percentage < 50) {
        statusMsgEl.textContent = 'Buen comienzo, sigue así ✨';
    } else if (percentage < 100) {
        statusMsgEl.textContent = '¡Ya vas más de la mitad! 💪';
    } else {
        statusMsgEl.textContent = '🎉 ¡Meta diaria completada!';
    }

    // Modal inputs
    goalInput.value = goal;
    reminderIntervalSelect.value = appState.reminderInterval;
}

function resetDay() {
    if (confirm('¿Deseas reiniciar tu conteo de agua de hoy a 0 ml?')) {
        appState.intake = 0;
        appState.glasses = 0;
        appState.halfNotified = false;
        appState.goalNotified = false;
        saveToStorage();
        renderUI();
        showToast('Conteo diario reiniciado 🔄');
    }
}

// ==========================================
// 6. GESTIÓN DE NOTIFICACIONES (PWA NOTIFICATIONS)
// ==========================================
async function toggleNotifications() {
    if (!('Notification' in window)) {
        showToast('Tu navegador no soporta notificaciones ❌');
        return;
    }

    if (Notification.permission === 'granted') {
        appState.notificationsEnabled = true;
        updateNotifBadge();
        saveToStorage();
        setupReminderTimer();
        showLocalNotification('💧 ¡Notificación de Hidrátate!', '¡Excelente! Las notificaciones están funcionando al 100%.');
        showToast('¡Notificación enviada! 🔔');
    } else if (Notification.permission !== 'denied') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            appState.notificationsEnabled = true;
            updateNotifBadge();
            saveToStorage();
            setupReminderTimer();
            showLocalNotification('💧 ¡Hidrátate Activado!', '¡Bienvenido! Te recordaremos mantenerte hidratado todo el día.');
            showToast('¡Permiso concedido y notificación enviada! 🎉');
        } else {
            showToast('Permiso de notificaciones no concedido 🚫');
        }
    } else {
        showToast('Notificaciones bloqueadas en el navegador. Revisa el candado de la URL ⚠️');
    }
}

function checkExistingNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'granted') {
        updateNotifBadge();
    }
}

function updateNotifBadge() {
    if (appState.notificationsEnabled && Notification.permission === 'granted') {
        notifBadge.classList.remove('hidden');
    } else {
        notifBadge.classList.add('hidden');
    }
}

function showLocalNotification(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const options = {
        body: body,
        icon: './img/icons/icon-192x192.png',
        badge: './img/icons/icon-72x72.png',
        vibrate: [100, 50, 100],
        data: { url: './index.html' }
    };

    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.ready.then(reg => {
            reg.showNotification(title, options);
        });
    } else {
        new Notification(title, options);
    }
}

function checkMilestones() {
    if (!appState.notificationsEnabled || Notification.permission !== 'granted') return;

    const percentage = (appState.intake / appState.goal) * 100;

    if (percentage >= 50 && !appState.halfNotified && percentage < 100) {
        appState.halfNotified = true;
        showLocalNotification('💧 ¡50% de tu Meta!', `Llevas ${appState.intake} ml de agua hoy. ¡Gran trabajo!`);
    } else if (percentage >= 100 && !appState.goalNotified) {
        appState.goalNotified = true;
        showLocalNotification('🎉 ¡Meta Diaria Cumplida!', `¡Excelente! Has alcanzado los ${appState.goal} ml de hoy.`);
    }
}

function setupReminderTimer() {
    if (reminderTimer) clearInterval(reminderTimer);

    if (appState.notificationsEnabled && appState.reminderInterval > 0) {
        const intervalMs = appState.reminderInterval * 60 * 1000;
        reminderTimer = setInterval(() => {
            if (appState.intake < appState.goal) {
                showLocalNotification('⏰ ¡Hora de tomar agua!', 'Un sorbo ahora te mantiene con energía y saludable.');
            }
        }, intervalMs);
    }
}

// ==========================================
// 7. EVENT LISTENERS
// ==========================================
function setupEventListeners() {
    // Botones rápidos de agua
    addWaterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount, 10);
            addWater(amount);
        });
    });

    // Agregar cantidad personalizada
    customAddBtn.addEventListener('click', () => {
        const val = parseInt(customAmountInput.value, 10);
        if (val && val > 0) {
            addWater(val);
            customAmountInput.value = '';
        } else {
            showToast('Ingresa una cantidad válida en ml ⚠️');
        }
    });

    customAmountInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') customAddBtn.click();
    });

    // Reiniciar día
    resetDayBtn.addEventListener('click', resetDay);

    // Botón de notificaciones
    notifToggleBtn.addEventListener('click', toggleNotifications);

    // Modal de Configuración
    settingsBtn.addEventListener('click', () => {
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.classList.add('hidden');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) settingsModal.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', () => {
        const newGoal = parseInt(goalInput.value, 10);
        const newInterval = parseInt(reminderIntervalSelect.value, 10);

        if (newGoal >= 500 && newGoal <= 6000) {
            appState.goal = newGoal;
            appState.reminderInterval = newInterval;
            saveToStorage();
            setupReminderTimer();
            renderUI();
            settingsModal.classList.add('hidden');
            showToast('Configuración guardada correctamente ✅');
        } else {
            showToast('La meta debe estar entre 500 y 6000 ml');
        }
    });

    // Botón de prueba de notificación en 3 segundos
    testNotifBtn.addEventListener('click', () => {
        if (Notification.permission !== 'granted') {
            Notification.requestPermission().then(p => {
                if (p === 'granted') {
                    triggerTestNotification();
                } else {
                    showToast('Debes conceder permisos para probar 🚫');
                }
            });
        } else {
            triggerTestNotification();
        }
    });
}

function triggerTestNotification() {
    showToast('Enviando notificación en 3 segundos... ⏳');
    setTimeout(() => {
        showLocalNotification('💧 Prueba de Hidrátate', '¡Tu sistema de notificaciones PWA funciona al 100%!');
    }, 3000);
}

// ==========================================
// 8. SOPORTE ONLINE / OFFLINE
// ==========================================
function initOnlineOfflineListeners() {
    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineBanner.classList.add('hidden');
        } else {
            offlineBanner.classList.remove('hidden');
            showToast('Estás sin conexión. Trabajando offline ⚡');
        }
    }

    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    if (!navigator.onLine) {
        offlineBanner.classList.remove('hidden');
    }
}

// ==========================================
// 9. REGISTRO DEL SERVICE WORKER
// ==========================================
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => {
                    console.log('Service Worker registrado con éxito:', reg.scope);
                })
                .catch(err => {
                    console.error('Error registrando Service Worker:', err);
                });
        });
    }
}

// ==========================================
// 10. UTILIDAD TOAST
// ==========================================
let toastTimeout;
function showToast(message) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    toastTimeout = setTimeout(() => {
        toastEl.classList.add('hidden');
    }, 2800);
}
