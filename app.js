const SUPABASE_URL = 'https://qmyseukcqlkphsxiivrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFteXNldWtjcWxrcGhzeGlpdnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTIyMzksImV4cCI6MjExMDM2ODIzOX0.srJB8lCXD6e58SJ-ceiNYLBUmf0TOdgViMcFc3QMwI8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let registeredEstablishmentId = localStorage.getItem('gabstock_est_id') || null;
let clientSessions = [];
let activeClientId = null;

window.addEventListener('DOMContentLoaded', () => {
    if (registeredEstablishmentId) {
        checkAccountStatus();
    }
});

async function handleRegistration(event) {
    event.preventDefault();
    const name = document.getElementById('est-name').value;
    const phone = document.getElementById('est-phone').value;
    const activityType = document.querySelector('input[name="activity_type"]:checked').value;
    const provider = document.getElementById('payment-provider').value;
    const paymentRef = document.getElementById('payment-ref').value;

    const { data, error } = await supabaseClient
        .from('establishments')
        .insert([{ name, activity_type: activityType, phone, setup_fee_paid: false, subscription_status: 'pending' }])
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

    if (error || !data) {
        localStorage.removeItem('gabstock_est_id');
        registeredEstablishmentId = null;
        alert("Compte réinitialisé ou supprimé.");
        location.reload();
        return;
    }

    if (data.subscription_status === 'active') {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('pending-screen').classList.add('hidden');
        document.getElementById('app-container').classList.remove('hidden');

        const icons = { 'bar': '🍸', 'bar-restaurant': '🍽️', 'boutique': '🛍️' };
        document.getElementById('header-est-name').innerHTML = `${icons[data.activity_type] || ''} ${data.name}`;
        document.getElementById('header-est-type').innerText = data.activity_type;
        
        if (data.next_due_date) {
            const dueDate = new Date(data.next_due_date);
            document.getElementById('sub-due').innerText = dueDate.toLocaleDateString();
            
            // Calcul de l'alerte à 7 jours
            const diffDays = Math.ceil((dueDate - new Date()) / (1000 * 60 * 60 * 24));
            if (diffDays <= 7 && diffDays >= 0) {
                document.getElementById('sub-warning-banner').classList.remove('hidden');
                document.getElementById('sub-renewal-status').className = "p-3 rounded-xl text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300";
                document.getElementById('sub-renewal-status').innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Attention : Votre abonnement expire dans ${diffDays} jour(s) !`;
            } else if (diffDays < 0) {
                document.getElementById('sub-renewal-status').className = "p-3 rounded-xl text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300";
                document.getElementById('sub-renewal-status').innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Votre abonnement est expiré !`;
            }
        }

        loadProducts();
        loadDashboardStats();
    } else {
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

// AJOUT OU RÉAPPROVISIONNEMENT DE STOCK (ARTICLE FIXÉ)
async function handleAddProduct(event) {
    event.preventDefault();
    if (!registeredEstablishmentId) return;

    const name = document.getElementById('prod-name').value.trim();
    const price = parseFloat(document.getElementById('prod-price').value);
    const addedQty = parseInt(document.getElementById('prod-qty').value);
    const alert_threshold = parseInt(document.getElementById('prod-alert').value);

    // Vérifier si l'article existe déjà pour cet établissement
    const { data: existingProducts } = await supabaseClient
        .from('products')
        .select('*')
        .eq('establishment_id', registeredEstablishmentId)
        .ilike('name', name);

    if (existingProducts && existingProducts.length > 0) {
        // L'article existe : on met à jour en additionnant la quantité
        const existing = existingProducts[0];
        const newTotalQty = existing.stock_quantity + addedQty;

        const { error } = await supabaseClient
            .from('products')
            .update({ stock_quantity: newTotalQty, price: price, unit_price: price, alert_threshold: alert_threshold })
            .eq('id', existing.id);

        if (error) alert("Erreur de mise à jour : " + error.message);
        else {
            alert(`Article existant détecté ! ${addedQty} unités ajoutées. Nouveau stock total : ${newTotalQty}`);
            document.getElementById('add-product-form').reset();
            loadProducts();
        }
    } else {
        // Nouvel article
        const { error } = await supabaseClient.from('products').insert([{
            establishment_id: registeredEstablishmentId, name, price, unit_price: price, stock_quantity: addedQty, alert_threshold
        }]);

        if (error) alert("Erreur : " + error.message);
        else {
            document.getElementById('add-product-form').reset();
            loadProducts();
        }
    }
}

async function loadProducts() {
    if (!registeredEstablishmentId) return;
    const { data } = await supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId);
    const tbody = document.getElementById('inventory-table-body');
    if (!data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="p-6 text-center text-slate-400">Aucun article enregistré.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    data.forEach(prod => {
        const isAlert = prod.stock_quantity <= (prod.alert_threshold || 5);
        const alertBadge = isAlert 
            ? `<span class="px-2 py-1 bg-rose-100 text-rose-800 rounded-lg font-bold text-xs"><i class="fa-solid fa-triangle-exclamation mr-1"></i> Stock Bas</span>`
            : `<span class="px-2 py-1 bg-emerald-100 text-emerald-800 rounded-lg font-bold text-xs">Normal</span>`;

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="p-4 font-bold text-slate-800">${prod.name}</td>
            <td class="p-4 font-mono text-slate-700">${prod.price.toLocaleString()} FCFA</td>
            <td class="p-4 font-mono text-slate-700 font-semibold">${prod.stock_quantity} (Seuil: ${prod.alert_threshold || 5})</td>
            <td class="p-4">${alertBadge}</td>
            <td class="p-4 text-right">
                <button onclick="deleteProduct('${prod.id}')" class="text-rose-600 p-2"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteProduct(prodId) {
    if (!confirm("Supprimer cet article ?")) return;
    await supabaseClient.from('products').delete().eq('id', prodId);
    loadProducts();
}

// GESTION MULTI-CLIENTS & CAISSE
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
    if (clientSessions.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-400">Aucun client ouvert.</p>`;
        return;
    }

    container.innerHTML = '';
    clientSessions.forEach(session => {
        const isActive = session.id === activeClientId;
        const btn = document.createElement('button');
        btn.className = `px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-2 ${isActive ? 'bg-primary text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`;
        btn.innerHTML = `<i class="fa-solid fa-user"></i> ${session.name} (${session.cart.length})`;
        btn.onclick = () => { activeClientId = session.id; renderClientTabs(); updateCartUI(); };
        container.appendChild(btn);
    });

    if (!activeClientId && clientSessions.length > 0) activeClientId = clientSessions[0].id;
    updateCartUI();
}

function loadPOSProducts() {
    if (!registeredEstablishmentId) return;
    supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId).then(({ data }) => {
        const grid = document.getElementById('pos-products-grid');
        if (!data || data.length === 0) {
            grid.innerHTML = `<p class="text-xs text-slate-400">Aucun produit en stock.</p>`;
            return;
        }

        grid.innerHTML = '';
        data.forEach(prod => {
            const div = document.createElement('div');
            div.className = "p-3 rounded-xl border border-slate-200 hover:border-primary transition flex justify-between items-center bg-slate-50 text-xs";
            div.innerHTML = `
                <div>
                    <span class="font-bold text-slate-800 block">${prod.name}</span>
                    <span class="text-slate-500 font-mono">${prod.price.toLocaleString()} F | Stock: ${prod.stock_quantity}</span>
                </div>
                <button onclick='addToActiveCart(${JSON.stringify(prod)})' class="bg-primary text-white px-2.5 py-1.5 rounded-lg font-bold hover:bg-blue-900">
                    <i class="fa-solid fa-plus"></i>
                </button>
            `;
            grid.appendChild(div);
        });
    });
}

function addToActiveCart(product) {
    if (!activeClientId) { alert("Veuillez d'abord ouvrir un client."); return; }
    const session = clientSessions.find(s => s.id === activeClientId);
    if (!session) return;

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
        row.innerHTML = `
            <div>
                <span class="font-bold text-slate-800">${item.name}</span>
                <span class="text-slate-500 text-[10px] block">${item.quantity} x ${item.price.toLocaleString()}</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-mono font-semibold">${subtotal.toLocaleString()}</span>
                <button onclick="session.cart.splice(${idx}, 1); updateCartUI(); renderClientTabs();" class="text-rose-500"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(row);
    });
    totalEl.innerText = total.toLocaleString() + " FCFA";
}

// ENCAISSEMENT & ENVOI
async function checkoutSale(actionType) {
    const session = clientSessions.find(s => s.id === activeClientId);
    if (!session || session.cart.length === 0) { alert("Panier vide."); return; }

    const paymentMethod = document.getElementById('payment-method').value;
    const clientPhone = document.getElementById('client-phone').value.trim();
    const totalAmount = session.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const { error } = await supabaseClient.from('orders').insert([{
        establishment_id: registeredEstablishmentId,
        table_or_client: session.name,
        total_amount: totalAmount,
        payment_method: paymentMethod
    }]);

    if (error) { alert("Erreur : " + error.message); return; }

    for (const item of session.cart) {
        await supabaseClient.from('products')
            .update({ stock_quantity: item.stock_quantity - item.quantity })
            .eq('id', item.id);
    }

    alert(`Vente encaissée (${paymentMethod}) !`);

    let receiptText = `*REÇU GABSTOCK*%0AClient: ${session.name}%0A-------------------%0A`;
    session.cart.forEach(i => { receiptText += `- ${i.name} x${i.quantity} : ${(i.price*i.quantity).toLocaleString()} F%0A`; });
    receiptText += `-------------------%0A*TOTAL : ${totalAmount.toLocaleString()} FCFA*%0AMode: ${paymentMethod}`;

    if (actionType === 'whatsapp' && clientPhone) {
        window.open(`https://wa.me/${clientPhone.replace(/[^0-9]/g, '')}?text=${receiptText}`, '_blank');
    } else {
        window.print();
    }

    clientSessions = clientSessions.filter(s => s.id !== activeClientId);
    activeClientId = clientSessions.length > 0 ? clientSessions[0].id : null;
    renderClientTabs();
    loadDashboardStats();
    loadCashboxSummary();
    loadProducts();
}

// GESTION DES RETRAITS DE CAISSE
async function handleCashWithdrawal(event) {
    event.preventDefault();
    if (!registeredEstablishmentId) return;

    const reason = document.getElementById('withdrawal-reason').value.trim();
    const amount = parseFloat(document.getElementById('withdrawal-amount').value);

    const { error } = await supabaseClient.from('cash_withdrawals').insert([{
        establishment_id: registeredEstablishmentId,
        amount: amount,
        reason: reason,
        source: 'Cash',
        responsible: 'Gérant'
    }]);

    if (error) alert("Erreur : " + error.message);
    else {
        alert("Retrait de caisse enregistré avec succès.");
        document.getElementById('withdrawal-reason').value = '';
        document.getElementById('withdrawal-amount').value = '';
        loadCashboxSummary();
    }
}

async function loadCashboxSummary() {
    if (!registeredEstablishmentId) return;

    const { data: ords } = await supabaseClient.from('orders').select('*').eq('establishment_id', registeredEstablishmentId);
    const { data: withdrawals } = await supabaseClient.from('cash_withdrawals').select('*').eq('establishment_id', registeredEstablishmentId);

    let totalIn = 0;
    if (ords) {
        ords.forEach(o => { totalIn += Number(o.total_amount); });
    }

    let totalOut = 0;
    if (withdrawals) {
        withdrawals.forEach(w => { totalOut += Number(w.amount); });
    }

    const realBalance = totalIn - totalOut;

    document.getElementById('cashbox-total').innerText = totalIn.toLocaleString() + " FCFA";
    document.getElementById('cashbox-withdrawals').innerText = totalOut.toLocaleString() + " FCFA";
    document.getElementById('cashbox-balance').innerText = realBalance.toLocaleString() + " FCFA";
}

// TABLEAU DE BORD (VENTES DU JOUR & STATS)
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

    if (ords) {
        ords.forEach(o => {
            const amt = Number(o.total_amount);
            totalCA += amt;
            if (o.payment_method === 'Espèces') totalCash += amt;
            else totalMomo += amt;

            // Filtrer les ventes du jour
            const orderDate = o.created_at ? o.created_at.split('T')[0] : '';
            if (orderDate === todayStr) {
                todayTotal += amt;
                todayOrdersCount++;
                const orderTime = new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                const tr = document.createElement('tr');
                tr.className = "hover:bg-slate-50";
                tr.innerHTML = `
                    <td class="p-3 font-mono">${orderTime}</td>
                    <td class="p-3 font-bold text-slate-800">${o.table_or_client || 'Comptoir'}</td>
                    <td class="p-3"><span class="px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-semibold">${o.payment_method || 'Espèces'}</span></td>
                    <td class="p-3 text-right font-mono font-bold text-success">${amt.toLocaleString()} FCFA</td>
                `;
                todayBody.appendChild(tr);
            }
        });
    }

    if (todayOrdersCount === 0) {
        todayBody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">Aucune vente enregistrée aujourd'hui.</td></tr>`;
    }

    document.getElementById('stat-ca').innerText = totalCA.toLocaleString() + " FCFA";
    document.getElementById('stat-ca-cash').innerText = totalCash.toLocaleString() + " FCFA";
    document.getElementById('stat-ca-momo').innerText = totalMomo.toLocaleString() + " FCFA";
    document.getElementById('stat-stock-val').innerText = stockVal.toLocaleString() + " FCFA";
    document.getElementById('stat-today-total').innerText = todayTotal.toLocaleString() + " FCFA";

    // Alertes stock
    const alertsContainer = document.getElementById('dashboard-alerts-list');
    alertsContainer.innerHTML = '';
    const alertProducts = prods ? prods.filter(p => p.stock_quantity <= (p.alert_threshold || 5)) : [];

    if (alertProducts.length === 0) {
        alertsContainer.innerHTML = `<p class="text-sm text-emerald-600 font-semibold"><i class="fa-solid fa-circle-check mr-1"></i> Tous les stocks sont à un niveau satisfaisant.</p>`;
    } else {
        alertProducts.forEach(p => {
            const div = document.createElement('div');
            div.className = "flex justify-between items-center p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs";
            div.innerHTML = `
                <span class="font-bold text-rose-900"><i class="fa-solid fa-triangle-exclamation mr-2 text-rose-600"></i> ${p.name}</span>
                <span class="bg-rose-600 text-white font-mono px-2.5 py-1 rounded-lg font-bold">Stock : ${p.stock_quantity} (Seuil : ${p.alert_threshold || 5})</span>
            `;
            alertsContainer.appendChild(div);
        });
    }
}
