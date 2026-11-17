// ==========================================
// CONFIGURATION SUPABASE CLIENT
// ==========================================
const SUPABASE_URL = 'https://qmyseukcqlkphsxiivrm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFteXNldWtjcWxrcGhzeGlpdnJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ3OTIyMzksImV4cCI6MjExMDM2ODIzOX0.srJB8lCXD6e58SJ-ceiNYLBUmf0TOdgViMcFc3QMwI8';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let registeredEstablishmentId = localStorage.getItem('gabstock_est_id') || null;

window.addEventListener('DOMContentLoaded', () => {
    if (registeredEstablishmentId) {
        checkAccountStatus();
    }
});

// Inscription et enregistrement de la preuve de paiement (statut 'pending')
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

// Vérification intelligente du statut d'activation par le client
async function checkAccountStatus() {
    if (!registeredEstablishmentId) return;

    const btn = event ? event.currentTarget : null;
    const originalText = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fa-solid fa-rotate fa-spin mr-1"></i> Vérification en cours...';

    const { data, error } = await supabaseClient
        .from('establishments')
        .select('*')
        .eq('id', registeredEstablishmentId)
        .single();

    if (btn) btn.innerHTML = originalText;

    // Si le compte a été supprimé ou refusé par l'admin
    if (error || !data) {
        localStorage.removeItem('gabstock_est_id');
        registeredEstablishmentId = null;
        alert("Votre précédente demande a été refusée ou réinitialisée (référence incorrecte). Veuillez soumettre une nouvelle demande.");
        location.reload();
        return;
    }

    if (data.subscription_status === 'active' && data.next_due_date && new Date(data.next_due_date) < new Date()) {
        data.subscription_status = 'expired';
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
    } else {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('pending-screen').classList.remove('hidden');
        alert("Votre paiement n'a pas encore été validé par l'administration. Si vous avez effectué le dépôt, contactez-nous sur WhatsApp.");
    }
}

// Gestion des onglets
function switchTab(tabId, event) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('bg-white/20'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('bg-white/20');
    }
}

// Ajouter un article dans Supabase
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
        stock_quantity: quantity
    }]);

    if (error) {
        alert("Erreur lors de l'ajout de l'article : " + error.message);
    } else {
        document.getElementById('add-product-form').reset();
        loadProducts();
    }
}

// Charger la liste des produits de l'établissement
async function loadProducts() {
    if (!registeredEstablishmentId) return;

    const { data, error } = await supabaseClient
        .from('products')
        .select('*')
        .eq('establishment_id', registeredEstablishmentId)
        .order('created_at', { ascending: false });

    const tbody = document.getElementById('inventory-table-body');
    if (error || !data || data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-6 text-center text-slate-400">Aucun article enregistré pour le moment.</td></tr>`;
        return;
    }

    tbody.innerHTML = '';
    let totalStockVal = 0;

    data.forEach(prod => {
        totalStockVal += (prod.price * prod.stock_quantity);
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

    document.getElementById('stat-stock-val').innerText = totalStockVal.toLocaleString() + " FCFA";
}

// Supprimer un article
async function deleteProduct(prodId) {
    if (!confirm("Voulez-vous supprimer cet article ?")) return;
    const { error } = await supabaseClient.from('products').delete().eq('id', prodId);
    if (error) alert("Erreur : " + error.message);
    else loadProducts();
}
