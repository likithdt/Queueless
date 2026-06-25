// Central State & Business Logic for QueueLess Pre-Ordering System

const DEFAULT_MENU = [
    { id: 'item-1', name: 'Steaming Idli Sambar (2 pcs)', price: 30, emoji: '🥞', slot: 'break1', available: true },
    { id: 'item-2', name: 'Crispy Masala Dosa', price: 50, emoji: '🌯', slot: 'all', available: true },
    { id: 'item-3', name: 'Canteen Club Sandwich', price: 45, emoji: '🥪', slot: 'all', available: true },
    { id: 'item-4', name: 'Spicy Veg Samosa (2 pcs)', price: 25, emoji: '🥟', slot: 'break1', available: true },
    { id: 'item-5', name: 'Premium Veg Biryani Meal', price: 80, emoji: '🍛', slot: 'lunch', available: true },
    { id: 'item-6', name: 'North Indian Lunch Thali', price: 90, emoji: '🍱', slot: 'lunch', available: true },
    { id: 'item-7', name: 'Rich Cold Coffee', price: 35, emoji: '🧋', slot: 'all', available: true },
    { id: 'item-8', name: 'Hot Masala Chai / Tea', price: 12, emoji: '☕', slot: 'all', available: true }
];

// Time Slots Configuration
const TIME_SLOTS = {
    break1: {
        name: '1st Break',
        orderStart: '10:00',
        collectEnd: '11:00',
        displayName: '10:00 AM - 11:00 AM'
    },
    lunch: {
        name: 'Lunch Break',
        orderStart: '12:30',
        collectEnd: '15:30',
        displayName: '12:30 PM - 3:30 PM'
    },
    break2: {
        name: 'Last Break',
        orderStart: '14:30',
        collectEnd: '16:00',
        displayName: '2:30 PM - 4:00 PM'
    }
};

// --- SIMULATED CLOCK MANAGEMENT ---
const CLOCK_KEY = 'queueless_simulated_time';

class CanteenClock {
    static getSimulatedTime() {
        const stored = localStorage.getItem(CLOCK_KEY);
        if (!stored) {
            return new Date(); // Real time fallback
        }
        
        const config = JSON.parse(stored);
        if (config.mode === 'real') {
            return new Date();
        } else {
            // Calculate time passed since the preset was selected
            const elapsed = Date.now() - config.setAt;
            return new Date(config.baseTimeMs + elapsed);
        }
    }

    static setPreset(mode) {
        if (mode === 'real') {
            localStorage.setItem(CLOCK_KEY, JSON.stringify({ mode: 'real' }));
        } else {
            const now = new Date();
            let hours = 10, minutes = 15; // default 1st break
            
            if (mode === 'break1') { hours = 10; minutes = 15; }
            else if (mode === 'break1_exp') { hours = 11; minutes = 15; }
            else if (mode === 'lunch') { hours = 13; minutes = 0; }
            else if (mode === 'lunch_exp') { hours = 15; minutes = 45; }
            else if (mode === 'break2') { hours = 15; minutes = 0; }
            else if (mode === 'break2_exp') { hours = 16; minutes = 15; }

            const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);
            
            localStorage.setItem(CLOCK_KEY, JSON.stringify({
                mode: 'simulated',
                baseTimeMs: target.getTime(),
                setAt: Date.now(),
                preset: mode
            }));
        }
        
        // Dispatch storage event to alert other tabs immediately
        window.dispatchEvent(new Event('storage'));
        // Trigger local callback if active
        if (window.onTimeChanged) window.onTimeChanged();
    }

    static getActiveSlotInfo(date = this.getSimulatedTime()) {
        const timeStr = date.toTimeString().substring(0, 5); // "HH:MM"
        
        let activeSlot = null;
        let activeKey = null;

        for (const [key, slot] of Object.entries(TIME_SLOTS)) {
            if (timeStr >= slot.orderStart && timeStr <= slot.collectEnd) {
                activeSlot = slot;
                activeKey = key;
                break;
            }
        }

        return { activeKey, activeSlot, timeStr };
    }
}

// --- STATE STORAGE MANAGEMENT ---
class DB {
    static getMenu() {
        const menu = localStorage.getItem('queueless_menu');
        if (!menu) {
            localStorage.setItem('queueless_menu', JSON.stringify(DEFAULT_MENU));
            return DEFAULT_MENU;
        }
        return JSON.parse(menu);
    }

    static saveMenu(menu) {
        localStorage.setItem('queueless_menu', JSON.stringify(menu));
        window.dispatchEvent(new Event('storage'));
    }

    static getOrders() {
        const orders = localStorage.getItem('queueless_orders');
        return orders ? JSON.parse(orders) : [];
    }

    static saveOrders(orders) {
        localStorage.setItem('queueless_orders', JSON.stringify(orders));
        window.dispatchEvent(new Event('storage'));
    }

    static addOrder(usn, items, total, slotName) {
        const orders = this.getOrders();
        const newOrder = {
            id: 'QL-' + Math.floor(100000 + Math.random() * 900000),
            usn: usn.toUpperCase(),
            items: items,
            total: total,
            timestamp: CanteenClock.getSimulatedTime().getTime(),
            status: 'PLACED', // PLACED -> (when scanned by kitchen) -> PENDING_PAYMENT -> PAID -> REDEEMED
            slot: slotName
        };
        orders.unshift(newOrder);
        this.saveOrders(orders);
        return newOrder;
    }
}

// --- AUDIO FEEDBACK GENERATOR ---
class CanteenSound {
    static play(type) {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            if (type === 'success') {
                // Happy high double beep
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
                gain.gain.setValueAtTime(0.1, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.1);
                
                setTimeout(() => {
                    const osc2 = ctx.createOscillator();
                    const gain2 = ctx.createGain();
                    osc2.connect(gain2);
                    gain2.connect(ctx.destination);
                    osc2.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
                    gain2.gain.setValueAtTime(0.1, ctx.currentTime);
                    osc2.start();
                    osc2.stop(ctx.currentTime + 0.15);
                }, 120);
            } else if (type === 'error') {
                // Sad low beep
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, ctx.currentTime);
                gain.gain.setValueAtTime(0.15, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.4);
            } else if (type === 'click' || type === 'chime') {
                // Soft chime
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
                gain.gain.setValueAtTime(0.05, ctx.currentTime);
                osc.start();
                osc.stop(ctx.currentTime + 0.05);
            }
        } catch(e) {
            console.warn("Web Audio API blocked or not supported", e);
        }
    }
}

// --- RENDER FLOATING TIME SIMULATOR ---
function initTimeSimulatorWidget() {
    if (document.getElementById('time-simulator-ui')) return;

    const widget = document.createElement('div');
    widget.id = 'time-simulator-ui';
    widget.className = 'time-simulator-widget';
    
    // Check current state preset
    let currentPreset = 'real';
    const stored = localStorage.getItem(CLOCK_KEY);
    if (stored) {
        const config = JSON.parse(stored);
        if (config.mode === 'simulated') {
            currentPreset = config.preset;
        }
    }

    widget.innerHTML = `
        <span class="clock-icon">⏰</span>
        <span class="time-display" id="widget-clock">00:00:00</span>
        <select id="widget-preset-selector">
            <option value="real" ${currentPreset === 'real' ? 'selected' : ''}>⏱️ Real Time</option>
            <option value="break1" ${currentPreset === 'break1' ? 'selected' : ''}>🥐 Break 1 (10:15 AM)</option>
            <option value="break1_exp" ${currentPreset === 'break1_exp' ? 'selected' : ''}>🥐 Break 1 Expired (11:15 AM)</option>
            <option value="lunch" ${currentPreset === 'lunch' ? 'selected' : ''}>🍛 Lunch (1:00 PM)</option>
            <option value="lunch_exp" ${currentPreset === 'lunch_exp' ? 'selected' : ''}>🍛 Lunch Expired (3:45 PM)</option>
            <option value="break2" ${currentPreset === 'break2' ? 'selected' : ''}>☕ Last Break (3:00 PM)</option>
            <option value="break2_exp" ${currentPreset === 'break2_exp' ? 'selected' : ''}>☕ Last Break Expired (4:15 PM)</option>
        </select>
    `;

    document.body.appendChild(widget);

    // Watch preset changes
    const selector = document.getElementById('widget-preset-selector');
    selector.addEventListener('change', (e) => {
        CanteenClock.setPreset(e.target.value);
    });

    // Start clock ticking
    function updateClockDisplay() {
        const time = CanteenClock.getSimulatedTime();
        const display = document.getElementById('widget-clock');
        if (display) {
            display.textContent = time.toTimeString().split(' ')[0];
        }
    }
    
    setInterval(updateClockDisplay, 1000);
    updateClockDisplay();
}

// Run on page load
document.addEventListener('DOMContentLoaded', () => {
    initTimeSimulatorWidget();
});
