// ==========================================
// CONFIGURATION SUPABASE (CORRIGÉE AVEC GUILLEMETS)
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

// Vérification du statut d'activation par le Super-Admin
async function checkAccountStatus() {
    if (!registeredEstablishmentId) return;

    const { data, error } = await supabaseClient
        .from('establishments')
        .select('*')
        .eq('id', registeredEstablishmentId)
        .single();

    if (error || !data) {
        localStorage.removeItem('gabstock_est_id');
        return;
    }

    // Vérifier si l'abonnement a expiré
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
    } else {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('pending-screen').classList.remove('hidden');
    }
}

// Navigation entre les onglets
function switchTab(tabId, event) {
    document.querySelectorAll('main > section').forEach(sec => sec.classList.add('hidden'));
    document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('bg-white/20'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('bg-white/20');
    }
}
