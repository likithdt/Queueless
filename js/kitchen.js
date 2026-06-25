// Kitchen Staff Dashboard Logic

let html5QrcodeScanner = null;
let orderCheckInterval = null;
let currentScanningOrderId = null; // Track order currently waiting for student payment
let localOrdersCount = 0;
let notifications = [];

// DOM Elements
const loginView = document.getElementById('kitchenLoginView');
const dashboardView = document.getElementById('kitchenDashboardView');
const navStaffProfile = document.getElementById('navStaffProfile');

const staffUser = document.getElementById('staffUser');
const staffPass = document.getElementById('staffPass');
const staffLoginBtn = document.getElementById('staffLoginBtn');

const ordersTableBody = document.getElementById('ordersTableBody');
const activeOrdersBadge = document.getElementById('activeOrdersBadge');

const kpiPreorders = document.getElementById('kpiPreorders');
const kpiRevenue = document.getElementById('kpiRevenue');
const kpiServed = document.getElementById('kpiServed');

const notifBell = document.getElementById('notifBell');
const notifBadge = document.getElementById('notifBadge');
const notifDropdown = document.getElementById('notifDropdown');
const notifItemsContainer = document.getElementById('notifItemsContainer');

const manualOrderIdInput = document.getElementById('manualOrderIdInput');
const manualScanBtn = document.getElementById('manualScanBtn');
const scanResultContainer = document.getElementById('scanResultContainer');

const startScanBtn = document.getElementById('startScanBtn');
const stopScanBtn = document.getElementById('stopScanBtn');
const scannerLaser = document.getElementById('scannerLaser');

const menuEditorList = document.getElementById('menuEditorList');
const saveMenuBtn = document.getElementById('saveMenuBtn');

// Initialize State
document.addEventListener('DOMContentLoaded', () => {
    const isLogged = sessionStorage.getItem('queueless_staff_logged');
    if (isLogged) {
        showDashboardView();
    } else {
        showLoginView();
    }

    // Set initial local orders count
    localOrdersCount = DB.getOrders().length;

    // Toggle Notifications Dropdown
    notifBell.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('show');
        // Clear badge when opened
        if (notifDropdown.classList.contains('show')) {
            notifBadge.style.display = 'none';
            notifBadge.textContent = '0';
        }
    });

    document.addEventListener('click', () => {
        notifDropdown.classList.remove('show');
    });

    // Scanner Buttons
    startScanBtn.addEventListener('click', startWebcamScanner);
    stopScanBtn.addEventListener('click', stopWebcamScanner);
    manualScanBtn.addEventListener('click', triggerManualScan);
    saveMenuBtn.addEventListener('click', saveMenuEdits);
});

// Sync time preset changes
window.onTimeChanged = () => {
    refreshDashboard();
};

// Listen to localstorage updates (from student order placements or payments)
window.addEventListener('storage', () => {
    refreshDashboard();
    checkNewOrders();
});

// --- LOGIN SECTION ---
function showLoginView() {
    loginView.style.display = 'block';
    dashboardView.style.display = 'none';
    navStaffProfile.style.display = 'none';
}

staffLoginBtn.addEventListener('click', () => {
    const user = staffUser.value.trim();
    const pass = staffPass.value;

    if ((user === 'canteen_staff' && pass === 'password') || (user === 'Admin' && pass === 'Admin123')) {
        CanteenSound.play('success');
        sessionStorage.setItem('queueless_staff_logged', 'true');
        showDashboardView();
    } else {
        alert("Invalid Username or Password! (Use Admin / Admin123)");
        CanteenSound.play('error');
    }
});

// --- DASHBOARD SECTION ---
function showDashboardView() {
    loginView.style.display = 'none';
    dashboardView.style.display = 'flex';
    navStaffProfile.style.display = 'flex';

    refreshDashboard();
    renderMenuEditor();
    switchTab('dashboard');

    // Start background poller for orders
    if (orderCheckInterval) clearInterval(orderCheckInterval);
    orderCheckInterval = setInterval(() => {
        refreshDashboard();
        checkNewOrders();
    }, 1000);
}

window.handleLogout = function() {
    CanteenSound.play('click');
    sessionStorage.removeItem('queueless_staff_logged');
    if (orderCheckInterval) clearInterval(orderCheckInterval);
    stopWebcamScanner();
    showLoginView();
};

function switchTab(tabName) {
    CanteenSound.play('click');
    
    // Toggle active state in buttons
    document.getElementById('tabBtnDashboard').classList.toggle('active', tabName === 'dashboard');
    document.getElementById('tabBtnScan').classList.toggle('active', tabName === 'scan');
    document.getElementById('tabBtnMenu').classList.toggle('active', tabName === 'menu');

    // Toggle views
    document.getElementById('tabDashboard').style.display = tabName === 'dashboard' ? 'block' : 'none';
    document.getElementById('tabScan').style.display = tabName === 'scan' ? 'block' : 'none';
    document.getElementById('tabMenu').style.display = tabName === 'menu' ? 'block' : 'none';

    // Stop scanner if leaving scan tab
    if (tabName !== 'scan') {
        stopWebcamScanner();
    }
}

function refreshDashboard() {
    const orders = DB.getOrders();
    
    // Filter active orders based on current simulated time
    const activePlacedOrders = orders.filter(o => o.status === 'PLACED' || o.status === 'PENDING_PAYMENT');
    activeOrdersBadge.textContent = `${activePlacedOrders.length} Preorders`;

    // KPI Metrics calculation
    const servedOrders = orders.filter(o => o.status === 'REDEEMED' || o.status === 'PAID');
    const revenue = servedOrders.reduce((sum, o) => sum + o.total, 0);

    kpiPreorders.textContent = activePlacedOrders.length;
    kpiServed.textContent = servedOrders.length;
    kpiRevenue.textContent = `₹${revenue}`;

    // Update table
    ordersTableBody.innerHTML = '';
    
    if (orders.length === 0) {
        ordersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px 0;">No pre-orders placed yet.</td></tr>`;
        return;
    }

    orders.forEach(order => {
        const tr = document.createElement('tr');
        
        let statusClass = 'badge-primary';
        if (order.status === 'REDEEMED' || order.status === 'PAID') statusClass = 'badge-success';
        else if (order.status === 'PENDING_PAYMENT') statusClass = 'badge-warning';
        else if (order.status === 'EXPIRED') statusClass = 'badge-error';

        // Build list of items
        const itemsText = order.items.map(i => `${i.qty}x ${i.name}`).join(', ');

        let actionBtn = '';
        if (order.status === 'PLACED' || order.status === 'PENDING_PAYMENT') {
            actionBtn = `<button class="btn btn-secondary" style="padding: 4px 10px; font-size:12px; border-color:var(--primary); color:var(--primary);" onclick="virtualScanOrder('${order.id}')">Virtual Scan</button>`;
        } else {
            actionBtn = `<span style="font-size:12px; color: var(--text-light); font-weight:600;">SERVED</span>`;
        }

        tr.innerHTML = `
            <td style="font-weight: 700; color: var(--text);">${order.id}</td>
            <td style="font-weight: 600; color: var(--text-muted);">${order.usn}</td>
            <td><span class="badge badge-primary">${order.slot}</span></td>
            <td class="order-items-list" title="${itemsText}">${itemsText}</td>
            <td style="font-weight: 700; color: var(--primary);">₹${order.total}</td>
            <td><span class="badge ${statusClass}">${order.status}</span></td>
            <td>${actionBtn}</td>
        `;
        ordersTableBody.appendChild(tr);
    });

    // Check if the order we are currently scanning completes payment
    if (currentScanningOrderId) {
        const scannedOrder = orders.find(o => o.id === currentScanningOrderId);
        if (scannedOrder && (scannedOrder.status === 'REDEEMED' || scannedOrder.status === 'PAID')) {
            showScanSuccess(scannedOrder);
            currentScanningOrderId = null;
        }
    }
}

// Check if new pre-orders have been created by students (triggers sound/notif)
function checkNewOrders() {
    const orders = DB.getOrders();
    if (orders.length > localOrdersCount) {
        const diff = orders.length - localOrdersCount;
        // Grab new orders (first elements in array)
        for (let i = 0; i < diff; i++) {
            const order = orders[i];
            addCanteenNotification(`New Preorder placed: ${order.id} by USN ${order.usn} for ₹${order.total}`);
        }
        CanteenSound.play('chime');
        localOrdersCount = orders.length;
    } else if (orders.length < localOrdersCount) {
        // Database was cleared
        localOrdersCount = orders.length;
    }
}

function addCanteenNotification(message) {
    notifications.unshift({
        msg: message,
        time: CanteenClock.getSimulatedTime().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });

    // Update bell badge
    notifBadge.style.display = 'flex';
    notifBadge.textContent = parseInt(notifBadge.textContent) + 1;

    // Render in container
    renderNotificationsList();
}

function renderNotificationsList() {
    notifItemsContainer.innerHTML = '';
    if (notifications.length === 0) {
        notifItemsContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 10px; font-size: 12px;">No new alerts</div>`;
        return;
    }

    notifications.forEach(n => {
        const item = document.createElement('div');
        item.className = 'notification-item';
        item.innerHTML = `
            <div style="font-weight:600; color: var(--text);">${n.msg}</div>
            <div style="font-size:10px; color: var(--text-light); text-align:right; margin-top:2px;">${n.time}</div>
        `;
        notifItemsContainer.appendChild(item);
    });
}

// --- SCANNER SYSTEM ---

// Webcam Scanner Integration (using html5-qrcode)
function startWebcamScanner() {
    CanteenSound.play('click');
    scannerLaser.style.display = 'block';
    startScanBtn.disabled = true;
    stopScanBtn.disabled = false;

    scanResultContainer.innerHTML = `
        <div style="text-align: center; padding: 20px; font-weight:600; color: var(--primary);">
            📷 Initializing camera feed...
        </div>
    `;

    html5QrcodeScanner = new Html5Qrcode("qr-reader");
    html5QrcodeScanner.start(
        { facingMode: "environment" }, 
        {
            fps: 10,
            qrbox: { width: 220, height: 220 }
        },
        (decodedText) => {
            // Successfully scanned text
            stopWebcamScanner();
            verifyScannedCode(decodedText);
        },
        (errorMessage) => {
            // Silence debugging scanner errors
        }
    ).catch(err => {
        console.error("Camera access failed:", err);
        scanResultContainer.innerHTML = `
            <div class="scan-result-card invalid">
                <strong>Camera Error:</strong> Could not open camera. Permission denied or webcam occupied. Use the simulator tools below.
            </div>
        `;
        stopWebcamScanner();
    });
}

function stopWebcamScanner() {
    scannerLaser.style.display = 'none';
    startScanBtn.disabled = false;
    stopScanBtn.disabled = true;

    if (html5QrcodeScanner) {
        html5QrcodeScanner.stop().then(() => {
            html5QrcodeScanner = null;
        }).catch(err => console.error("Error stopping scanner", err));
    }
}

function triggerManualScan() {
    CanteenSound.play('click');
    const orderId = manualOrderIdInput.value.trim().toUpperCase();
    if (!orderId) {
        alert("Please enter a valid Order ID!");
        return;
    }
    verifyScannedCode(orderId);
}

// Simulate Scanning from the Preorders table
window.virtualScanOrder = function(orderId) {
    switchTab('scan');
    manualOrderIdInput.value = orderId;
    verifyScannedCode(orderId);
};

// Main Verification Logic
function verifyScannedCode(orderId) {
    const orders = DB.getOrders();
    const order = orders.find(o => o.id === orderId);

    if (!order) {
        showScanInvalid("INVALID CODE", `The scanned code "${orderId}" is not associated with any active order in the system.`);
        return;
    }

    // Verify break timing limits
    const time = CanteenClock.getSimulatedTime();
    const timeStr = time.toTimeString().substring(0, 5); // "HH:MM"
    
    let limit = "11:00";
    if (order.slot === '1st Break') limit = TIME_SLOTS.break1.collectEnd;
    else if (order.slot === 'Lunch Break') limit = TIME_SLOTS.lunch.collectEnd;
    else if (order.slot === 'Last Break') limit = TIME_SLOTS.break2.collectEnd;

    // Check expiration
    if (timeStr > limit || order.status === 'EXPIRED') {
        order.status = 'EXPIRED';
        DB.saveOrders(orders);
        showScanInvalid("EXPIRED QR CODE", `This preorder was placed for the ${order.slot} which expired at ${limit}. Food collection is disabled.`);
        return;
    }

    // Check status
    if (order.status === 'REDEEMED' || order.status === 'PAID') {
        showScanInvalid("INVALID: ALREADY REDEEMED", `Order ${orderId} has already been scanned, paid, and collected by student USN ${order.usn}. Double collection blocked.`);
    } 
    else if (order.status === 'PLACED') {
        // Trigger transition on Student App (Pending payment)
        order.status = 'PENDING_PAYMENT';
        DB.saveOrders(orders);
        
        currentScanningOrderId = order.id; // Watch this order for payment
        showScanAwaitingPayment(order);
    } 
    else if (order.status === 'PENDING_PAYMENT') {
        currentScanningOrderId = order.id;
        showScanAwaitingPayment(order);
    }
}

function showScanAwaitingPayment(order) {
    CanteenSound.play('chime');
    
    const itemsList = order.items.map(i => `<li>${i.qty}x ${i.name}</li>`).join('');
    
    scanResultContainer.innerHTML = `
        <div class="scan-result-card" style="background: var(--warning-light); border: 1px solid var(--warning); color: #92400E;">
            <div style="font-weight: 800; font-size: 16px; margin-bottom: 6px;">⏳ COUNTER SCAN SUCCESSFUL</div>
            <div style="font-size: 14px; margin-bottom: 12px;">Waiting for student <strong>${order.usn}</strong> to complete payment on their application.</div>
            
            <div style="font-weight: 700; font-size: 13px; text-transform: uppercase;">Order Summary (₹${order.total})</div>
            <ul style="padding-left: 18px; font-size: 13px; margin-top: 4px; line-height: 1.4;">
                ${itemsList}
            </ul>
            
            <div style="font-size: 11px; margin-top: 12px; font-style: italic;">
                Student device has been prompted with the payment interface...
            </div>
            
            <!-- Quick payment simulator button for staff page testing -->
            <button onclick="simulateStudentPayment('${order.id}')" class="btn btn-primary" style="margin-top: 12px; font-size:11px; padding:6px 12px;">Simulate Student Completing Payment</button>
        </div>
    `;
}

// Help simulate student paying when testing on a single tab/tab combo
window.simulateStudentPayment = function(orderId) {
    const orders = DB.getOrders();
    const idx = orders.findIndex(o => o.id === orderId);
    if (idx !== -1) {
        orders[idx].status = 'REDEEMED';
        DB.saveOrders(orders);
    }
};

function showScanSuccess(order) {
    CanteenSound.play('success');
    addCanteenNotification(`💰 Money Received: ₹${order.total} from USN ${order.usn}!`);
    
    const itemsList = order.items.map(i => `<li>${i.qty}x ${i.name}</li>`).join('');

    scanResultContainer.innerHTML = `
        <div class="scan-result-card success">
            <div style="font-weight: 800; font-size: 16px; margin-bottom: 6px;">🎉 SUCCESS: TRANSACTION RECEIVED</div>
            <div style="font-size: 14px; margin-bottom: 12px;">Payment confirmed! Serve food immediately to student USN <strong>${order.usn}</strong>.</div>
            
            <div style="font-weight: 700; font-size: 13px; text-transform: uppercase;">Items to Serve:</div>
            <ul style="padding-left: 18px; font-size: 14px; font-weight:700; margin-top: 4px; line-height: 1.5;">
                ${itemsList}
            </ul>
        </div>
    `;
    refreshDashboard();
}

function showScanInvalid(title, detail) {
    CanteenSound.play('error');
    scanResultContainer.innerHTML = `
        <div class="scan-result-card invalid">
            <div style="font-weight: 800; font-size: 16px; margin-bottom: 6px;">❌ SCAN FAILED: ${title}</div>
            <div style="font-size: 13px; line-height: 1.4;">${detail}</div>
        </div>
    `;
}

// --- MENU MANAGEMENT SECTION ---
function renderMenuEditor() {
    const menu = DB.getMenu();
    menuEditorList.innerHTML = '';

    menu.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'editor-item';

        card.innerHTML = `
            <span style="font-size: 22px;">${item.emoji}</span>
            <input type="text" value="${item.name}" data-index="${index}" class="edit-name-input">
            <input type="number" value="${item.price}" data-index="${index}" class="edit-price-input" min="1">
            
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
                <span style="font-size:10px; font-weight:700; color: var(--text-muted);">AVAILABILITY</span>
                <label class="switch">
                    <input type="checkbox" ${item.available ? 'checked' : ''} data-index="${index}" class="edit-avail-input">
                    <span class="slider"></span>
                </label>
            </div>
        `;
        menuEditorList.appendChild(card);
    });
}

function saveMenuEdits() {
    CanteenSound.play('click');
    const menu = DB.getMenu();
    
    const names = document.querySelectorAll('.edit-name-input');
    const prices = document.querySelectorAll('.edit-price-input');
    const avails = document.querySelectorAll('.edit-avail-input');

    names.forEach((el) => {
        const idx = el.getAttribute('data-index');
        menu[idx].name = el.value.trim();
        menu[idx].price = parseInt(prices[idx].value) || 0;
        menu[idx].available = avails[idx].checked;
    });

    DB.saveMenu(menu);
    alert("Menu changes saved and pushed to student apps!");
    renderMenuEditor();
}

window.resetMenuToDefault = function() {
    if (confirm("Reset menu to original college specifications?")) {
        CanteenSound.play('click');
        localStorage.removeItem('queueless_menu');
        renderMenuEditor();
        alert("Menu reset to defaults!");
    }
};

window.clearAllOrdersSim = function() {
    if (confirm("Reset preorder list database? All histories will be wiped.")) {
        CanteenSound.play('click');
        DB.saveOrders([]);
        notifications = [];
        renderNotificationsList();
        refreshDashboard();
        alert("Preorder database wiped!");
    }
};
