// Student Pre-Ordering Application Logic

let cart = {}; // itemId -> quantity
let currentOrder = null; // Holds the active order object
let orderStatusPollInterval = null;

// DOM Elements
const loginView = document.getElementById('loginView');
const menuView = document.getElementById('menuView');
const orderView = document.getElementById('orderView');
const successView = document.getElementById('successView');
const appHeader = document.getElementById('appHeader');
const userUsnDisplay = document.getElementById('userUsnDisplay');

const usnInput = document.getElementById('usnInput');
const loginBtn = document.getElementById('loginBtn');

const menuGridContainer = document.getElementById('menuGridContainer');
const timeSlotInfoCard = document.getElementById('timeSlotInfoCard');
const slotTitle = document.getElementById('slotTitle');
const slotBadge = document.getElementById('slotBadge');
const slotTime = document.getElementById('slotTime');
const slotDescription = document.getElementById('slotDescription');

const cartStickyBar = document.getElementById('cartStickyBar');
const cartTotalDisplay = document.getElementById('cartTotalDisplay');
const cartCountDisplay = document.getElementById('cartCountDisplay');
const checkoutBtn = document.getElementById('checkoutBtn');

const orderIdText = document.getElementById('orderIdText');
const qrTimeLimitText = document.getElementById('qrTimeLimitText');
const orderItemsSummaryList = document.getElementById('orderItemsSummaryList');
const cancelOrderBtn = document.getElementById('cancelOrderBtn');
const newOrderBtn = document.getElementById('newOrderBtn');

const paymentSheet = document.getElementById('paymentSheet');
const paymentAmountDisplay = document.getElementById('paymentAmountDisplay');
const paymentLoading = document.getElementById('paymentLoading');

// Initialize State
document.addEventListener('DOMContentLoaded', () => {
    // Check if USN exists in session
    const savedUsn = sessionStorage.getItem('queueless_student_usn');
    if (savedUsn) {
        showMenuView(savedUsn);
    } else {
        showLoginView();
    }
    
    // Setup simulated status bar time ticking
    updateStatusBarTime();
    setInterval(updateStatusBarTime, 10000);

    // Check if there's an active unpaid/unserved order on load
    checkActiveOrderOnLoad();
});

// Sync time from CanteenClock
function updateStatusBarTime() {
    const time = CanteenClock.getSimulatedTime();
    const hrs = String(time.getHours()).padStart(2, '0');
    const mins = String(time.getMinutes()).padStart(2, '0');
    document.getElementById('statusBarTime').textContent = `${hrs}:${mins}`;
}

// Global clock hook to trigger updates instantly on time preset change
window.onTimeChanged = () => {
    updateStatusBarTime();
    if (menuView.style.display === 'block') {
        renderMenu();
    }
    if (currentOrder) {
        verifyOrderExpiry();
    }
};

// Listen to localstorage updates (e.g. staff changes menu or scans QR)
window.addEventListener('storage', () => {
    if (menuView.style.display === 'block') {
        renderMenu();
    }
    if (currentOrder) {
        // Fetch fresh copy from localStorage
        const orders = DB.getOrders();
        const updated = orders.find(o => o.id === currentOrder.id);
        if (updated) {
            currentOrder = updated;
            handleOrderStateChange();
        }
    }
});

// --- LOGIN SECTION ---
function showLoginView() {
    loginView.style.display = 'flex';
    menuView.style.display = 'none';
    orderView.style.display = 'none';
    successView.style.display = 'none';
    appHeader.style.display = 'none';
}

loginBtn.addEventListener('click', () => {
    const usn = usnInput.value.trim().toUpperCase();
    
    // Simple USN Pattern Validation (Alphanumeric, e.g. 1RV21CS001, 10 chars)
    const usnRegex = /^[1-4][A-Z]{2}\d{2}[A-Z]{2}\d{3}$/;
    
    if (usn.length < 5) {
        alert("Please enter a valid USN registration code.");
        CanteenSound.play('error');
        return;
    }
    
    CanteenSound.play('click');
    sessionStorage.setItem('queueless_student_usn', usn);
    showMenuView(usn);
});

// Allow press Enter to login
usnInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') loginBtn.click();
});

// --- MENU / DASHBOARD SECTION ---
function showMenuView(usn) {
    loginView.style.display = 'none';
    menuView.style.display = 'block';
    orderView.style.display = 'none';
    successView.style.display = 'none';
    
    appHeader.style.display = 'flex';
    userUsnDisplay.textContent = `USN: ${usn}`;
    
    // Set Canteen Date Banner
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const now = CanteenClock.getSimulatedTime();
    document.getElementById('menuDateBadge').textContent = days[now.getDay()];

    cart = {};
    updateCartBar();
    renderMenu();
}

function renderMenu() {
    const { activeKey, activeSlot, timeStr } = CanteenClock.getActiveSlotInfo();
    const menu = DB.getMenu();
    menuGridContainer.innerHTML = '';
    
    if (!activeSlot) {
        // Canteen Closed State
        timeSlotInfoCard.className = 'timeline-card';
        slotTitle.textContent = 'Canteen Ordering Closed';
        slotBadge.textContent = 'CLOSED';
        slotBadge.className = 'badge badge-error';
        slotTime.textContent = `${timeStr}`;
        slotDescription.textContent = 'Next opening: 1st Break at 10:00 AM. Ordering disabled.';

        // Render menu items but disable "Add"
        menu.forEach(item => {
            renderMenuItem(item, false); // disabled
        });
        
        cart = {};
        updateCartBar();
        return;
    }

    // Active Break State
    timeSlotInfoCard.className = 'timeline-card active';
    slotTitle.textContent = `${activeSlot.name} Pre-Ordering`;
    slotBadge.textContent = 'ACTIVE';
    slotBadge.className = 'badge badge-success';
    slotTime.textContent = `Collect before ${formatHHMM(activeSlot.collectEnd)}`;
    slotDescription.textContent = `Place your order now! Slot ends at ${formatHHMM(activeSlot.collectEnd)}.`;

    // Render filtered items
    let itemsRendered = 0;
    menu.forEach(item => {
        if (item.available && (item.slot === 'all' || item.slot === activeKey)) {
            renderMenuItem(item, true); // enabled
            itemsRendered++;
        }
    });

    if (itemsRendered === 0) {
        menuGridContainer.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">No menu items available for this break slot.</div>`;
    }
}

function renderMenuItem(item, orderable) {
    const qty = cart[item.id] || 0;
    const itemCard = document.createElement('div');
    itemCard.className = 'food-card';
    if (!orderable || !item.available) {
        itemCard.style.opacity = '0.7';
    }

    let controlHtml = '';
    if (!orderable) {
        controlHtml = `<span style="font-size: 11px; font-weight:700; color: var(--error);">CLOSED</span>`;
    } else if (!item.available) {
        controlHtml = `<span style="font-size: 11px; font-weight:700; color: var(--text-light);">SOLD OUT</span>`;
    } else if (qty > 0) {
        controlHtml = `
            <div class="quantity-selector">
                <button onclick="changeQty('${item.id}', -1)">-</button>
                <span class="count">${qty}</span>
                <button onclick="changeQty('${item.id}', 1)">+</button>
            </div>
        `;
    } else {
        controlHtml = `
            <button class="add-to-cart" onclick="changeQty('${item.id}', 1)">+</button>
        `;
    }

    itemCard.innerHTML = `
        <div class="food-img-fallback">${item.emoji}</div>
        <div class="details">
            <div class="name">${item.name}</div>
            <div class="price">₹${item.price}</div>
        </div>
        <div class="control-box">
            ${controlHtml}
        </div>
    `;

    menuGridContainer.appendChild(itemCard);
}

function changeQty(itemId, change) {
    CanteenSound.play('click');
    const menu = DB.getMenu();
    const item = menu.find(i => i.id === itemId);
    if (!item) return;

    if (!cart[itemId]) cart[itemId] = 0;
    cart[itemId] += change;

    if (cart[itemId] <= 0) {
        delete cart[itemId];
    }
    
    updateCartBar();
    renderMenu();
}

function updateCartBar() {
    const menu = DB.getMenu();
    let total = 0;
    let itemsCount = 0;

    for (const [id, qty] of Object.entries(cart)) {
        const item = menu.find(i => i.id === id);
        if (item) {
            total += item.price * qty;
            itemsCount += qty;
        }
    }

    if (itemsCount > 0) {
        cartStickyBar.style.display = 'flex';
        cartTotalDisplay.textContent = `₹${total}`;
        cartCountDisplay.textContent = `${itemsCount} item${itemsCount > 1 ? 's' : ''} in cart`;
    } else {
        cartStickyBar.style.display = 'none';
    }
}

// --- CHECKOUT & ORDER CREATION ---
checkoutBtn.addEventListener('click', () => {
    const usn = sessionStorage.getItem('queueless_student_usn');
    if (!usn) return;

    const { activeKey, activeSlot } = CanteenClock.getActiveSlotInfo();
    if (!activeSlot) {
        alert("Pre-ordering is currently closed.");
        CanteenSound.play('error');
        return;
    }

    // Build items payload
    const menu = DB.getMenu();
    const orderedItems = [];
    let total = 0;

    for (const [id, qty] of Object.entries(cart)) {
        const item = menu.find(i => i.id === id);
        if (item) {
            orderedItems.push({
                id: item.id,
                name: item.name,
                qty: qty,
                price: item.price
            });
            total += item.price * qty;
        }
    }

    if (orderedItems.length === 0) return;

    // Save to Database
    const newOrder = DB.addOrder(usn, orderedItems, total, activeSlot.name);
    currentOrder = newOrder;

    CanteenSound.play('success');
    showOrderView();
});

// --- RECEIPT & QR SCREEN ---
function showOrderView() {
    loginView.style.display = 'none';
    menuView.style.display = 'none';
    orderView.style.display = 'flex';
    successView.style.display = 'none';
    
    orderIdText.textContent = currentOrder.id;

    // Dynamic QR generation
    const qrCanvas = document.getElementById('qrCodeCanvas');
    new QRious({
        element: qrCanvas,
        value: currentOrder.id,
        size: 200,
        background: 'white',
        foreground: '#0F172A',
        level: 'H'
    });

    // Determine collection time window
    const { activeSlot } = CanteenClock.getActiveSlotInfo();
    const limit = activeSlot ? activeSlot.collectEnd : "11:00"; // fallback
    qrTimeLimitText.textContent = `Collect before ${formatHHMM(limit)}`;

    // Render items summary
    orderItemsSummaryList.innerHTML = '';
    currentOrder.items.forEach(item => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justify = 'space-between';
        div.innerHTML = `
            <span>${item.qty}x ${item.name}</span>
            <span style="font-weight:700; color: var(--text);">₹${item.price * item.qty}</span>
        `;
        orderItemsSummaryList.appendChild(div);
    });

    // Add total row
    const totalDiv = document.createElement('div');
    totalDiv.style.borderTop = '1px solid var(--border)';
    totalDiv.style.paddingTop = '6px';
    totalDiv.style.marginTop = '6px';
    totalDiv.style.display = 'flex';
    totalDiv.style.justify = 'space-between';
    totalDiv.style.fontWeight = '800';
    totalDiv.innerHTML = `
        <span>Total Price</span>
        <span style="color: var(--primary);">₹${currentOrder.total}</span>
    `;
    orderItemsSummaryList.appendChild(totalDiv);

    // Start checking for updates (Counter Scan)
    startPollingOrderUpdates();
}

function checkActiveOrderOnLoad() {
    const usn = sessionStorage.getItem('queueless_student_usn');
    if (!usn) return;

    // Search active placed orders
    const orders = DB.getOrders();
    const active = orders.find(o => o.usn === usn && (o.status === 'PLACED' || o.status === 'PENDING_PAYMENT'));
    
    if (active) {
        currentOrder = active;
        // If loaded directly on order page
        showOrderView();
    }
}

function startPollingOrderUpdates() {
    if (orderStatusPollInterval) clearInterval(orderStatusPollInterval);

    orderStatusPollInterval = setInterval(() => {
        verifyOrderExpiry(); // verify if expired first
        
        if (!currentOrder) return;
        
        const orders = DB.getOrders();
        const updated = orders.find(o => o.id === currentOrder.id);
        
        if (updated && updated.status !== currentOrder.status) {
            currentOrder = updated;
            handleOrderStateChange();
        }
    }, 500);
}

function verifyOrderExpiry() {
    if (!currentOrder) return;
    
    const time = CanteenClock.getSimulatedTime();
    const timeStr = time.toTimeString().substring(0, 5); // "HH:MM"
    
    // Check if simulated time has gone beyond slot limit
    let limit = "11:00";
    if (currentOrder.slot === '1st Break') limit = TIME_SLOTS.break1.collectEnd;
    else if (currentOrder.slot === 'Lunch Break') limit = TIME_SLOTS.lunch.collectEnd;
    else if (currentOrder.slot === 'Last Break') limit = TIME_SLOTS.break2.collectEnd;

    if (timeStr > limit && currentOrder.status !== 'PAID' && currentOrder.status !== 'REDEEMED') {
        currentOrder.status = 'EXPIRED';
        
        // Update database
        const orders = DB.getOrders();
        const idx = orders.findIndex(o => o.id === currentOrder.id);
        if (idx !== -1) {
            orders[idx].status = 'EXPIRED';
            DB.saveOrders(orders);
        }
        
        handleOrderStateChange();
    }
}

function handleOrderStateChange() {
    if (!currentOrder) return;

    if (currentOrder.status === 'PENDING_PAYMENT') {
        // Trigger payment slide-up drawer
        paymentAmountDisplay.textContent = `₹${currentOrder.total}.00`;
        paymentSheet.classList.add('show');
        CanteenSound.play('chime');
    } 
    else if (currentOrder.status === 'PAID' || currentOrder.status === 'REDEEMED') {
        // Close payment drawer and show verified green tick
        paymentSheet.classList.remove('show');
        clearInterval(orderStatusPollInterval);
        
        showSuccessView();
    } 
    else if (currentOrder.status === 'EXPIRED') {
        clearInterval(orderStatusPollInterval);
        alert("🚨 Collection deadline exceeded. This pre-order is now INVALID.");
        CanteenSound.play('error');
        showMenuView(sessionStorage.getItem('queueless_student_usn'));
        currentOrder = null;
    }
}

// --- PAYMENT PROCESSING ---
window.processMockPayment = function(method) {
    paymentLoading.style.display = 'block';
    
    // Simulate transaction delay
    setTimeout(() => {
        paymentLoading.style.display = 'none';
        
        // Save success in database
        const orders = DB.getOrders();
        const idx = orders.findIndex(o => o.id === currentOrder.id);
        if (idx !== -1) {
            orders[idx].status = 'REDEEMED'; // marks as completed
            DB.saveOrders(orders);
        }
    }, 1500);
};

// --- SUCCESS SCREEN ---
function showSuccessView() {
    loginView.style.display = 'none';
    menuView.style.display = 'none';
    orderView.style.display = 'none';
    successView.style.display = 'flex';
    CanteenSound.play('success');
}

newOrderBtn.addEventListener('click', () => {
    CanteenSound.play('click');
    currentOrder = null;
    showMenuView(sessionStorage.getItem('queueless_student_usn'));
});

// --- CANCEL ORDER ---
cancelOrderBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to cancel this pre-order?")) {
        CanteenSound.play('click');
        clearInterval(orderStatusPollInterval);
        
        // Remove from database
        const orders = DB.getOrders();
        const filtered = orders.filter(o => o.id !== currentOrder.id);
        DB.saveOrders(filtered);
        
        currentOrder = null;
        showMenuView(sessionStorage.getItem('queueless_student_usn'));
    }
});

// Helper formatting HH:MM to readable PM/AM
function formatHHMM(timeString) {
    const [h, m] = timeString.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hr = h % 12 || 12;
    return `${hr}:${String(m).padStart(2, '0')} ${ampm}`;
}
