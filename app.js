const SUPABASE_URL = 'https://qmyseukcqlkphsxiivrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFteXNldWtjcWxrcGhzeGlpdnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTIyMzksImV4cCI6MjExMDM2ODIzOX0.srJB8lCXD6e58SJ-ceiNYLBUmf0TOdgViMcFc3QMwI8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let registeredEstablishmentId = localStorage.getItem('gabstock_est_id') || null;
let clientSessions = [];
let activeClientId = null;
let cachedProducts = [];
let currentEstablishmentName = "GABSTOCK";

window.addEventListener('DOMContentLoaded', () => {
    if (registeredEstablishmentId) {
        checkAccountStatus();
    } else {
        showLoginScreen();
    }
});

function togglePassword(inputId, iconId) {
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (input.type === 'password') {
        input.type = 'text';
        icon.className = 'fa-solid fa-eye-slash';
    } else {
        input.type = 'password';
        icon.className = 'fa-solid fa-eye';
    }
}

function showLoginScreen() {
    document.getElementById('login-screen').classList.remove('hidden');
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('pending-screen').classList.add('hidden');
    document.getElementById('app-container').classList.add('hidden');
}

function showRegisterScreen() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
}

function logoutToLogin() {
    localStorage.removeItem('gabstock_est_id');
    registeredEstablishmentId = null;
    showLoginScreen();
}

async function handleLogin(event) {
    event.preventDefault();
    const identity = document.getElementById('login-identity').value.trim();
    const password = document.getElementById('login-password').value.trim();

    const { data, error } = await supabaseClient
        .from('establishments')
        .select('*')
        .or(`name.ilike.%${identity}%,phone.eq.${identity}`)
        .eq('password', password)
        .single();

    if (error || !data) {
        alert("Nom d'établissement ou mot de passe incorrect.");
        return;
    }

    registeredEstablishmentId = data.id;
    currentEstablishmentName = data.name;
    localStorage.setItem('gabstock_est_id', data.id);
    checkAccountStatus();
}

async function handleRegistration(event) {
    event.preventDefault();
    const name = document.getElementById('est-name').value;
    const phone = document.getElementById('est-phone').value;
    const password = document.getElementById('est-password').value;
    const activityType = document.querySelector('input[name="activity_type"]:checked').value;
    const provider = document.getElementById('payment-provider').value;
    const paymentRef = document.getElementById('payment-ref').value;

    const { data, error } = await supabaseClient
        .from('establishments')
        .insert([{ name, phone, password, activity_type: activityType, setup_fee_paid: false, subscription_status: 'pending' }])
        .select();

    if (error) { alert("Erreur : " + error.message); return; }
    const est = data[0];
    registeredEstablishmentId = est.id;
    localStorage.setItem('gabstock_est_id', est.id);

    await supabaseClient.from('saas_payments').insert([{
        establishment_id: est.id, amount: 50000, payment_type: 'setup_fee', reference_number: `${provider} - ${paymentRef}`
    }]);

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('pending-screen').classList.remove('hidden');
}

async function checkAccountStatus() {
    if (!registeredEstablishmentId) return;
    const { data, error } = await supabaseClient.from('establishments').select('*').eq('id', registeredEstablishmentId).single();

    if (error || !data) { logoutToLogin(); return; }
    currentEstablishmentName = data.name;

    if (data.subscription_status === 'active') {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('pending-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        const icons = { 'bar': '🍸', 'bar-restaurant': '🍽️', 'boutique': '🛍️' };
        document.getElementById('header-est-name').innerHTML = `${icons[data.activity_type] || ''} ${data.name}`;
        document.getElementById('header-est-type').innerText = data.activity_type;
        
        if (data.next_due_date) {
            const dueDate = new Date(data.next_due_date);
            document.getElementById('sub-due').innerText = dueDate.toLocaleDateString();
            const diffDays = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7 && diffDays >= 0) {
                document.getElementById('sub-warning-banner').classList.remove('hidden');
            }
        }

        loadProducts();
        loadDashboardStats();
    } else {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('pending-screen').classList.remove('hidden');
    }
}

function switchTab(tabId, event) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('bg-white/20'));
    if (event && event.currentTarget) event.currentTarget.classList.add('bg-white/20');
    if (tabId === 'pos') { renderClientTabs(); loadPOSProducts(); loadCashboxSummary(); }
    if (tabId === 'dashboard') loadDashboardStats();
    if (tabId === 'stock') loadProducts();
}

function openTodayDetailsModal() { document.getElementById('today-details-modal').classList.remove('hidden'); }
function closeTodayDetailsModal() { document.getElementById('today-details-modal').classList.add('hidden'); }

async function handleAddProduct(event) {
    event.preventDefault();
    if (!registeredEstablishmentId) return;

    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const addedQty = parseInt(document.getElementById('prod-qty').value);
    const alert_threshold = parseInt(document.getElementById('prod-alert').value);

    const { data: existingProducts } = await supabaseClient
        .from('products').select('*').eq('establishment_id', registeredEstablishmentId).ilike('name', name);

    if (existingProducts && existingProducts.length > 0) {
        const existing = existingProducts[0];
        const newStockQty = existing.stock_quantity + addedQty;
        const newInitialStock = (existing.initial_stock || existing.stock_quantity) + addedQty;

        await supabaseClient.from('products').update({ 
            stock_quantity: newStockQty, 
            initial_stock: newInitialStock,
            price, 
            unit_price: price, 
            alert_threshold 
        }).eq('id', existing.id);

        alert(`Réapprovisionnement réussi ! +${addedQty} unités ajoutées.`);
    } else {
        await supabaseClient.from('products').insert([{ 
            establishment_id: registeredEstablishmentId, 
            name, 
            price, 
            unit_price: price, 
            stock_quantity: addedQty, 
            initial_stock: addedQty, 
            sold_quantity: 0,
            alert_threshold 
        }]);
        alert("Article enregistré !");
    }
    document.getElementById('add-product-form').reset();
    loadProducts();
}

async function loadProducts() {
    if (!registeredEstablishmentId) return;
    const { data } = await supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId);
    const tbody = document.getElementById('inventory-table-body');
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-slate-400">Aucun article enregistré.</td></tr>`;
        return;
    }
    tbody.innerHTML = '';
    data.forEach(prod => {
        const initial = prod.initial_stock !== undefined ? prod.initial_stock : prod.stock_quantity;
        const sold = prod.sold_quantity || 0;
        const remaining = prod.stock_quantity;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";
        tr.innerHTML = `
            <td class="p-3 font-bold text-slate-800">${prod.name}</td>
            <td class="p-3 font-mono text-slate-700">${prod.price.toLocaleString()} F</td>
            <td class="p-3 font-mono text-slate-600">${initial}</td>
            <td class="p-3 font-mono font-bold text-rose-600">-${sold}</td>
            <td class="p-3 font-mono font-extrabold text-success">${remaining}</td>
            <td class="p-3 text-right"><button onclick="deleteProduct('${prod.id}')" class="text-rose-600 p-1.5"><i class="fa-solid fa-trash"></i></button></td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteProduct(prodId) {
    if (!confirm("Voulez-vous supprimer cet article ?")) return;
    await supabaseClient.from('products').delete().eq('id', prodId);
    loadProducts();
}

function addNewClientSession() {
    const input = document.getElementById('new-client-name');
    const clientName = input.value.trim() || `Client ${clientSessions.length + 1}`;
    const newSession = { id: Date.now().toString(), name: clientName, cart: [] };
    clientSessions.push(newSession);
    activeClientId = newSession.id;
    input.value = '';
    renderClientTabs();
    loadPOSProducts();
}

function renderClientTabs() {
    const container = document.getElementById('clients-tabs');
    if (clientSessions.length === 0) { container.innerHTML = `<p class="text-xs text-slate-400">Aucun client ouvert.</p>`; return; }
    container.innerHTML = '';
    clientSessions.forEach(session => {
        const isActive = session.id === activeClientId;
        const btn = document.createElement('button');
        btn.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${isActive ? 'bg-primary text-white shadow-md' : 'bg-slate-100 text-slate-700'}`;
        btn.innerHTML = `<i class="fa-solid fa-user"></i> ${session.name} (${session.cart.length})`;
        btn.onclick = () => { activeClientId = session.id; renderClientTabs(); updateCartUI(); };
        container.appendChild(btn);
    });
    if (!activeClientId && clientSessions.length > 0) activeClientId = clientSessions[0].id;
    updateCartUI();
}

async function loadPOSProducts() {
    if (!registeredEstablishmentId) return;
    const { data } = await supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId);
    cachedProducts = data || [];
    renderPOSGrid(cachedProducts);
}

function filterPOSProducts() {
    const query = document.getElementById('pos-search').value.toLowerCase();
    const filtered = cachedProducts.filter(p => p.name.toLowerCase().includes(query));
    renderPOSGrid(filtered);
}

function renderPOSGrid(productsList) {
    const grid = document.getElementById('pos-products-grid');
    if (!productsList || productsList.length === 0) {
        grid.innerHTML = `<p class="text-xs text-slate-400">Aucun produit trouvé.</p>`;
        return;
    }
    grid.innerHTML = '';
    productsList.forEach(prod => {
        const div = document.createElement('div');
        div.className = "p-3 rounded-xl border border-slate-200 hover:border-primary transition flex justify-between items-center bg-slate-50 text-xs";
        div.innerHTML = `<div><span class="font-bold block">${prod.name}</span><span class="text-slate-500 font-mono">${prod.price.toLocaleString()} F | Stock: ${prod.stock_quantity}</span></div><button onclick='addToActiveCart(${JSON.stringify(prod)})' class="bg-primary text-white px-2.5 py-1.5 rounded-lg font-bold"><i class="fa-solid fa-plus"></i></button>`;
        grid.appendChild(div);
    });
}

function addToActiveCart(product) {
    if (!activeClientId) { alert("Ouvrez ou sélectionnez un client en haut."); return; }
    const session = clientSessions.find(s => s.id === activeClientId);
    const existing = session.cart.find(item => item.id === product.id);
    if (existing) {
        if (existing.quantity < product.stock_quantity) existing.quantity++;
        else { alert("Stock insuffisant !"); return; }
    } else {
        if (product.stock_quantity <= 0) { alert("Rupture de stock !"); return; }
        session.cart.push({ ...product, quantity: 1 });
    }
    updateCartUI();
    renderClientTabs();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    const badgeEl = document.getElementById('active-client-badge');
    const session = clientSessions.find(s => s.id === activeClientId);
    if (!session || session.cart.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-center py-2 text-xs">Panier vide</p>`;
        if (totalEl) totalEl.innerText = "0 FCFA";
        if (badgeEl) badgeEl.innerText = session ? session.name : "Aucun";
        return;
    }
    badgeEl.innerText = session.name;
    container.innerHTML = '';
    let total = 0;
    session.cart.forEach((item, idx) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        const row = document.createElement('div');
        row.className = "py-1.5 flex justify-between items-center text-xs";
        row.innerHTML = `<div><span class="font-bold">${item.name}</span><span class="text-slate-500 text-[10px] block">${item.quantity} x ${item.price.toLocaleString()}</span></div><div class="flex items-center gap-2"><span class="font-mono font-semibold">${subtotal.toLocaleString()}</span><button onclick="session.cart.splice(${idx}, 1); updateCartUI(); renderClientTabs();" class="text-rose-500"><i class="fa-solid fa-trash"></i></button></div>`;
        container.appendChild(row);
    });
    totalEl.innerText = total.toLocaleString() + " FCFA";
}

// ENCAISSEMENT & IMPRESSION EXCLUSIVE DE LA FACTURE CLIENT
async function checkoutSale(actionType) {
    const session = clientSessions.find(s => s.id === activeClientId);
    if (!session || session.cart.length === 0) { alert("Panier vide."); return; }
    const paymentMethod = document.getElementById('payment-method').value;
    const clientPhone = document.getElementById('client-phone').value.trim();
    const totalAmount = session.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    await supabaseClient.from('orders').insert([{ establishment_id: registeredEstablishmentId, table_or_client: session.name, total_amount: totalAmount, payment_method: paymentMethod }]);

    for (const item of session.cart) {
        const currentSold = item.sold_quantity || 0;
        const newStock = item.stock_quantity - item.quantity;
        const newSold = currentSold + item.quantity;

        await supabaseClient.from('products').update({ 
            stock_quantity: newStock,
            sold_quantity: newSold
        }).eq('id', item.id);
    }

    // Préparation du reçu masqué pour impression propre
    document.getElementById('receipt-est-name').innerText = currentEstablishmentName.toUpperCase();
    document.getElementById('receipt-date').innerText = new Date().toLocaleString();
    document.getElementById('receipt-client-name').innerText = session.name;
    document.getElementById('receipt-total-amount').innerText = totalAmount.toLocaleString() + " FCFA";
    document.getElementById('receipt-payment-method').innerText = paymentMethod;

    const receiptBody = document.getElementById('receipt-items-body');
    receiptBody.innerHTML = '';
    session.cart.forEach(i => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="text-align: left; padding: 2px 0;">${i.name}</td>
            <td style="text-align: center; padding: 2px 0;">${i.quantity}</td>
            <td style="text-align: right; padding: 2px 0;">${(i.price * i.quantity).toLocaleString()} F</td>
        `;
        receiptBody.appendChild(tr);
    });

    if (actionType === 'whatsapp' && clientPhone) {
        let receiptText = `*FACTURE ${currentEstablishmentName.toUpperCase()}*\nClient: ${session.name}\n-------------------\n`;
        session.cart.forEach(i => { receiptText += `- ${i.name} x${i.quantity} : ${(i.price*i.quantity).toLocaleString()} F\n`; });
        receiptText += `-------------------\n*TOTAL : ${totalAmount.toLocaleString()} FCFA*\nMode: ${paymentMethod}\nMerci de votre visite !`;

        const cleanPhone = clientPhone.replace(/[^0-9]/g, '');
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(receiptText)}`, '_blank');
        alert("Vente encaissée et facture envoyée sur WhatsApp !");
    } else {
        alert("Vente encaissée avec succès !");
        // Déclenche l'impression ciblée uniquement sur le ticket
        window.print();
    }

    clientSessions = clientSessions.filter(s => s.id !== activeClientId);
    activeClientId = clientSessions.length > 0 ? clientSessions[0].id : null;
    renderClientTabs();
    loadDashboardStats();
    loadCashboxSummary();
    loadProducts();
    loadPOSProducts();
}

async function handleCashWithdrawal(event) {
    event.preventDefault();
    if (!registeredEstablishmentId) return;
    const reason = document.getElementById('withdrawal-reason').value.trim();
    const amount = parseFloat(document.getElementById('withdrawal-amount').value);
    await supabaseClient.from('cash_withdrawals').insert([{ establishment_id: registeredEstablishmentId, amount, reason }]);
    alert("Retrait enregistré.");
    document.getElementById('withdrawal-reason').value = '';
    document.getElementById('withdrawal-amount').value = '';
    loadCashboxSummary();
}

async function loadCashboxSummary() {
    if (!registeredEstablishmentId) return;
    const { data: ords } = await supabaseClient.from('orders').select('*').eq('establishment_id', registeredEstablishmentId);
    const { data: withdrawals } = await supabaseClient.from('cash_withdrawals').select('*').eq('establishment_id', registeredEstablishmentId);
    let totalIn = 0; if (ords) ords.forEach(o => totalIn += Number(o.total_amount));
    let totalOut = 0; if (withdrawals) withdrawals.forEach(w => totalOut += Number(w.amount));
    document.getElementById('cashbox-total').innerText = totalIn.toLocaleString() + " FCFA";
    document.getElementById('cashbox-withdrawals').innerText = totalOut.toLocaleString() + " FCFA";
    document.getElementById('cashbox-balance').innerText = (totalIn - totalOut).toLocaleString() + " FCFA";
}

async function printDailyReport() {
    if (!registeredEstablishmentId) return;
    const { data: prods } = await supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId);
    const { data: ords } = await supabaseClient.from('orders').select('*').eq('establishment_id', registeredEstablishmentId);

    const todayStr = new Date().toISOString().split('T')[0];
    let todayTotal = 0;
    let todayOrders = [];

    if (ords) {
        ords.forEach(o => {
            const orderDate = o.created_at ? o.created_at.split('T')[0] : '';
            if (orderDate === todayStr) {
                todayTotal += Number(o.total_amount);
                todayOrders.push(o);
            }
        });
    }

    let reportWindow = window.open('', '_blank');
    let htmlContent = `
        <html>
        <head>
            <title>Rapport Journalier - Gabstock</title>
            <style>
                body { font-family: sans-serif; padding: 20px; color: #1e293b; max-width: 600px; margin: auto; }
                h2, h3 { text-align: center; margin-bottom: 5px; }
                .subtitle { text-align: center; font-size: 12px; color: #64748b; margin-bottom: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 15px; font-size: 12px; }
                th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; }
                th { background-color: #f1f5f9; }
            </style>
        </head>
        <body>
            <h2>${currentEstablishmentName.toUpperCase()} - BILAN DE LA JOURNÉE</h2>
            <div class="subtitle">Date : ${new Date().toLocaleDateString()}</div>
            
            <h3>Chiffre d'Affaires du Jour : <span style="color: #059669;">${todayTotal.toLocaleString()} FCFA</span></h3>
            <p>Nombre de commandes encaissées : <b>${todayOrders.length}</b></p>

            <h3>Mouvements de Stock du Jour</h3>
            <table>
                <thead>
                    <tr>
                        <th>Article</th>
                        <th>Stock Initial</th>
                        <th>Sorties (Ventes)</th>
                        <th>Reste (Stock Final)</th>
                    </tr>
                </thead>
                <tbody>
    `;

    if (prods) {
        prods.forEach(p => {
            const initial = p.initial_stock !== undefined ? p.initial_stock : p.stock_quantity;
            const sold = p.sold_quantity || 0;
            htmlContent += `
                <tr>
                    <td><b>${p.name}</b></td>
                    <td>${initial}</td>
                    <td style="color: #dc2626;">-${sold}</td>
                    <td><b>${p.stock_quantity}</b></td>
                </tr>
            `;
        });
    }

    htmlContent += `
                </tbody>
            </table>
            <div style="margin-top: 40px; display: flex; justify-content: space-between; font-size: 12px;">
                <div>Signature du Gérant : ___________________</div>
                <div>Visa Administration : ___________________</div>
            </div>
            <script>window.print();</script>
        </body>
        </html>
    `;

    reportWindow.document.write(htmlContent);
    reportWindow.document.close();
}

async function loadDashboardStats() {
    if (!registeredEstablishmentId) return;
    const { data: prods } = await supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId);
    const { data: ords } = await supabaseClient.from('orders').select('*').eq('establishment_id', registeredEstablishmentId);

    let stockVal = 0, totalCA = 0, totalCash = 0, totalMomo = 0;
    if (prods) prods.forEach(p => stockVal += (p.price * p.stock_quantity));
    
    const todayStr = new Date().toISOString().split('T')[0];
    document.getElementById('today-date-label').innerText = new Date().toLocaleDateString();

    let todayTotal = 0;
    const todayBody = document.getElementById('today-orders-body');
    todayBody.innerHTML = '';
    let todayOrdersCount = 0;

    let dailyTotals = {};
    for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const dateKey = d.toISOString().split('T')[0];
        dailyTotals[dateKey] = { label: d.toLocaleDateString('fr-FR', { weekday: 'short' }), amount: 0 };
    }

    if (ords) {
        ords.forEach(o => {
            const amt = Number(o.total_amount);
            totalCA += amt;
            if (o.payment_method === 'Espèces') totalCash += amt; else totalMomo += amt;
            const orderDate = o.created_at ? o.created_at.split('T')[0] : '';
            if (dailyTotals[orderDate] !== undefined) dailyTotals[orderDate].amount += amt;
            if (orderDate === todayStr) {
                todayTotal += amt; todayOrdersCount++;
                const orderTime = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50";
                tr.innerHTML = `<td class="p-3 font-mono">${orderTime}</td><td class="p-3 font-bold">${o.table_or_client || 'Comptoir'}</td><td class="p-3">${o.payment_method}</td><td class="p-3 text-right font-mono font-bold text-success">${amt.toLocaleString()} F</td>`;
                todayBody.appendChild(tr);
            }
        });
    }

    if (todayOrdersCount === 0) todayBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Aucune vente aujourd'hui.</td></tr>`;

    document.getElementById('stat-ca').innerText = totalCA.toLocaleString() + " FCFA";
    document.getElementById('stat-ca-cash').innerText = totalCash.toLocaleString() + " FCFA";
    document.getElementById('stat-ca-momo').innerText = totalMomo.toLocaleString() + " FCFA";
    document.getElementById('stat-stock-val').innerText = stockVal.toLocaleString() + " FCFA";
    document.getElementById('stat-today-total').innerText = todayTotal.toLocaleString() + " FCFA";

    const barsContainer = document.getElementById('weekly-chart-bars');
    const labelsContainer = document.getElementById('weekly-chart-labels');
    barsContainer.innerHTML = ''; labelsContainer.innerHTML = '';
    const maxAmount = Math.max(...Object.values(dailyTotals).map(d => d.amount), 10000);

    Object.values(dailyTotals).forEach(day => {
        const heightPercent = Math.round((day.amount / maxAmount) * 100);
        const barDiv = document.createElement('div');
        barDiv.className = "w-full bg-blue-100 rounded-t-lg flex flex-col justify-end items-center group relative h-full";
        barDiv.innerHTML = `<div class="absolute -top-7 hidden group-hover:block bg-slate-900 text-white text-[9px] px-1 py-0.5 rounded font-mono z-10">${day.amount.toLocaleString()} F</div><div class="w-full bg-primary rounded-t-lg" style="height: ${heightPercent}%"></div>`;
        barsContainer.appendChild(barDiv);
        const labelDiv = document.createElement('div'); labelDiv.innerText = day.label; labelsContainer.appendChild(labelDiv);
    });

    const alertsContainer = document.getElementById('dashboard-alerts-list');
    alertsContainer.innerHTML = '';
    const alertProducts = prods ? prods.filter(p => p.stock_quantity <= (p.alert_threshold || 5)) : [];
    if (alertProducts.length === 0) {
        alertsContainer.innerHTML = `<p class="text-sm text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i> Stock normal.</p>`;
    } else {
        alertProducts.forEach(p => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs";
            div.innerHTML = `<span class="font-bold text-rose-900"><i class="fa-solid fa-triangle-exclamation mr-2"></i> ${p.name}</span><span class="bg-rose-600 text-white font-mono px-2 py-1 rounded-lg font-bold">Stock : ${p.stock_quantity}</span>`;
            alertsContainer.appendChild(div);
        });
    }
}
