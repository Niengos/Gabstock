// ==========================================
// CONFIGURATION SUPABASE CLIENT GABSTOCK
// ==========================================
const SUPABASE_URL = 'https://qmyseukcqlkphsxiivrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFteXNldWtjcWxrcGhzeGlpdnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTIyMzksImV4cCI6MjExMDM2ODIzOX0.srJB8lCXD6e58SJ-ceiNYLBUmf0TOdgViMcFc3QMwI8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let registeredEstablishmentId = localStorage.getItem('gabstock_est_id') || null;
let currentCart = [];

window.addEventListener('DOMContentLoaded', () => {
    if (registeredEstablishmentId) {
        checkAccountStatus();
    }
});

// Enregistrement d'un nouvel établissement (Statut 'pending')
async function handleRegistration(event) {
    event.preventDefault();
    const name = document.getElementById('est-name').value;
    const phone = document.getElementById('est-phone').value;
    const activityType = document.querySelector('input[name="activity_type"]:checked').value;
    const provider = document.getElementById('payment-provider').value;
    const paymentRef = document.getElementById('payment-ref').value;

    const { data, error } = await supabaseClient
        .from('establishments')
        .insert([{
            name: name,
            activity_type: activityType,
            phone: phone,
            setup_fee_paid: false,
            subscription_status: 'pending'
        }])
        .select();

    if (error) {
        alert("Erreur lors de l'inscription : " + error.message);
        return;
    }

    const est = data[0];
    registeredEstablishmentId = est.id;
    localStorage.setItem('gabstock_est_id', est.id);

    await supabaseClient.from('saas_payments').insert([{
        establishment_id: est.id,
        amount: 50000,
        payment_type: 'setup_fee',
        reference_number: `${provider} - ${paymentRef}`
    }]);

    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('pending-screen').classList.remove('hidden');
}

// Vérification du statut d'activation
async function checkAccountStatus() {
    if (!registeredEstablishmentId) return;

    const { data, error } = await supabaseClient
        .from('establishments')
        .select('*')
        .eq('id', registeredEstablishmentId)
        .single();

    if (error || !data) {
        localStorage.removeItem('gabstock_est_id');
        registeredEstablishmentId = null;
        alert("Votre compte a été réinitialisé ou supprimé. Veuillez vous réinscrire.");
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
            document.getElementById('sub-due').innerText = new Date(data.next_due_date).toLocaleDateString();
        }
        
        loadProducts();
        loadPOSProducts();
        loadDashboardStats();
    } else {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('pending-screen').classList.remove('hidden');
    }
}

// Navigation entre onglets
function switchTab(tabId, event) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('bg-white/20'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('bg-white/20');
    }
    if (tabId === 'pos') loadPOSProducts();
    if (tabId === 'dashboard') loadDashboardStats();
}

// Ajout d'un produit au stock
async function handleAddProduct(event) {
    event.preventDefault();
    if (!registeredEstablishmentId) return;

    const name = document.getElementById('prod-name').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const quantity = parseInt(document.getElementById('prod-qty').value);

    const { error } = await supabaseClient.from('products').insert([{
        establishment_id: registeredEstablishmentId,
        name: name,
        price: price,
        unit_price: price,
        stock_quantity: quantity
    }]);

    if (error) {
        alert("Erreur : " + error.message);
    } else {
        document.getElementById('add-product-form').reset();
        loadProducts();
        loadPOSProducts();
    }
}

// Chargement de l'inventaire
async function loadProducts() {
    if (!registeredEstablishmentId) return;

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('establishment_id', registeredEstablishmentId)
        .order('created_at', { ascending: false });

    const tbody = document.getElementById('inventory-table-body');
    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">Aucun article enregistré.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    data.forEach(prod => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50 transition";
        tr.innerHTML = `
            <td class="p-4 font-bold text-slate-800">${prod.name}</td>
            <td class="p-4 font-mono text-slate-700">${prod.price.toLocaleString()} FCFA</td>
            <td class="p-4 font-mono text-slate-700 font-semibold">${prod.stock_quantity}</td>
            <td class="p-4 text-right">
                <button onclick="deleteProduct('${prod.id}')" class="text-rose-600 hover:text-rose-800 p-2"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function deleteProduct(prodId) {
    if (!confirm("Supprimer cet article ?")) return;
    await supabaseClient.from('products').delete().eq('id', prodId);
    loadProducts();
    loadPOSProducts();
}

// Chargement POS
function loadPOSProducts() {
    if (!registeredEstablishmentId) return;

    supabaseClient
        .from('products')
        .select('*')
        .eq('establishment_id', registeredEstablishmentId)
        .then(({ data }) => {
            const grid = document.getElementById('pos-products-grid');
            if (!data || data.length === 0) {
                grid.innerHTML = `<p class="text-sm text-slate-400 col-span-2">Aucun produit en stock.</p>`;
                return;
            }

            grid.innerHTML = '';
            data.forEach(prod => {
                const card = document.createElement('div');
                card.className = "p-4 rounded-xl border border-slate-200 hover:border-primary transition flex flex-col justify-between space-y-2 bg-slate-50";
                card.innerHTML = `
                    <div>
                        <h5 class="font-bold text-slate-800 text-sm">${prod.name}</h5>
                        <p class="text-xs text-slate-500">Stock : <span class="font-mono font-semibold">${prod.stock_quantity}</span></p>
                    </div>
                    <div class="flex justify-between items-center mt-2">
                        <span class="font-mono font-extrabold text-primary text-sm">${prod.price.toLocaleString()} FCFA</span>
                        <button onclick='pressAddToCart(${JSON.stringify(prod)})' class="bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-900 transition">
                            <i class="fa-solid fa-plus"></i> Ajouter
                        </button>
                    </div>
                `;
                grid.appendChild(card);
            });
        });
}

function pressAddToCart(product) {
    const existing = currentCart.find(item => item.id === product.id);
    if (existing) {
        if (existing.quantity < product.stock_quantity) existing.quantity++;
        else { alert("Stock insuffisant !"); return; }
    } else {
        if (product.stock_quantity <= 0) { alert("Rupture de stock !"); return; }
        currentCart.push({ ...product, quantity: 1 });
    }
    renderCart();
}

function renderCart() {
    const container = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');
    
    if (currentCart.length === 0) {
        container.innerHTML = `<p class="text-slate-400 text-xs text-center py-4">Le panier est vide</p>`;
        totalEl.innerText = "0 FCFA";
        return;
    }

    container.innerHTML = '';
    let total = 0;
    currentCart.forEach((item, idx) => {
        const subtotal = item.price * item.quantity;
        total += subtotal;
        const row = document.createElement('div');
        row.className = "py-2 flex justify-between items-center text-xs";
        row.innerHTML = `
            <div>
                <span class="font-bold text-slate-800 block">${item.name}</span>
                <span class="text-slate-500">${item.quantity} x ${item.price.toLocaleString()} FCFA</span>
            </div>
            <div class="flex items-center gap-2">
                <span class="font-mono font-semibold">${subtotal.toLocaleString()} FCFA</span>
                <button onclick="currentCart.splice(${idx}, 1); renderCart();" class="text-rose-500"><i class="fa-solid fa-trash"></i></button>
            </div>
        `;
        container.appendChild(row);
    });
    totalEl.innerText = total.toLocaleString() + " FCFA";
}

async function checkoutSale() {
    if (currentCart.length === 0) { alert("Panier vide."); return; }
    const tableClient = document.getElementById('pos-table-client').value;
    const paymentMethod = document.getElementById('payment-method').value;
    const totalAmount = currentCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);

    const { error } = await supabaseClient.from('orders').insert([{
        establishment_id: registeredEstablishmentId,
        table_or_client: tableClient,
        total_amount: totalAmount,
        payment_method: paymentMethod
    }]);

    if (error) { alert("Erreur : " + error.message); return; }

    for (const item of currentCart) {
        await supabaseClient.from('products')
            .update({ stock_quantity: item.stock_quantity - item.quantity })
            .eq('id', item.id);
    }

    alert("Vente encaissée avec succès !");
    currentCart = [];
    renderCart();
    loadPOSProducts();
    loadProducts();
    loadDashboardStats();
}

async function loadDashboardStats() {
    if (!registeredEstablishmentId) return;

    const { data: prods } = await supabaseClient.from('products').select('*').eq('establishment_id', registeredEstablishmentId);
    const { data: ords } = await supabaseClient.from('orders').select('*').eq('establishment_id', registeredEstablishmentId);

    let stockVal = 0, totalCA = 0;
    if (prods) prods.forEach(p => stockVal += (p.price * p.stock_quantity));
    if (ords) ords.forEach(o => totalCA += Number(o.total_amount));

    document.getElementById('stat-ca').innerText = totalCA.toLocaleString() + " FCFA";
    document.getElementById('stat-stock-val').innerText = stockVal.toLocaleString() + " FCFA";
    document.getElementById('stat-orders').innerText = ords ? ords.length : 0;
}
