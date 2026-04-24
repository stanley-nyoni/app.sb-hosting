'use strict';

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
const App = {
  view: 'dashboard',
  clientId: null,
  websiteId: null,
  history: [],

  // ─────────────────────────────────────────────────────────
  //  INIT
  // ─────────────────────────────────────────────────────────
  async init() {
    this.registerSW();
    this.bindNav();
    this.bindModalClose();
    this.bindDelegation();
    await this.navigate('dashboard');
    this.scheduleNotificationCheck();
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.warn);
    }
  },

  // ─────────────────────────────────────────────────────────
  //  NAVIGATION
  // ─────────────────────────────────────────────────────────
  async navigate(view, params = {}) {
    if (this.view !== view || JSON.stringify(params) !== '{}') {
      this.history.push({ view: this.view, clientId: this.clientId });
    }
    this.view = view;
    this.clientId = params.clientId || null;

    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-nav="${view}"]`);
    if (navBtn) navBtn.classList.add('active');

    const header = document.getElementById('app-header-title');

    switch (view) {
      case 'dashboard':
        header.textContent = 'Dashboard';
        await this.loadDashboard();
        break;
      case 'clients':
        header.textContent = 'Clients';
        await this.loadClients();
        break;
      case 'client-detail':
        header.textContent = 'Client Profile';
        await this.loadClientDetail(params.clientId);
        break;
      case 'search':
        header.textContent = 'Search';
        this.renderSearch();
        break;
    }
    document.getElementById('main-content').scrollTop = 0;
  },

  goBack() {
    const prev = this.history.pop();
    if (prev) {
      this.navigate(prev.view, { clientId: prev.clientId });
    } else {
      this.navigate('dashboard');
    }
  },

  // ─────────────────────────────────────────────────────────
  //  API WRAPPER
  // ─────────────────────────────────────────────────────────
  async api(method, url, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  },

  get: (url) => App.api('GET', url),
  post: (url, body) => App.api('POST', url, body),
  put: (url, body) => App.api('PUT', url, body),
  del: (url) => App.api('DELETE', url),

  // ─────────────────────────────────────────────────────────
  //  DASHBOARD
  // ─────────────────────────────────────────────────────────
  async loadDashboard() {
    const mc = document.getElementById('main-content');
    mc.innerHTML = this.html.loader();
    try {
      const data = await this.get('/api/dashboard');
      mc.innerHTML = this.html.dashboard(data);
    } catch (e) {
      mc.innerHTML = this.html.error(e.message);
    }
  },

  // ─────────────────────────────────────────────────────────
  //  CLIENTS
  // ─────────────────────────────────────────────────────────
  async loadClients(search = '') {
    const mc = document.getElementById('main-content');
    mc.innerHTML = this.html.loader();
    try {
      const clients = await this.get(`/api/clients?search=${encodeURIComponent(search)}`);
      mc.innerHTML = this.html.clientList(clients, search);
    } catch (e) {
      mc.innerHTML = this.html.error(e.message);
    }
  },

  async loadClientDetail(id) {
    const mc = document.getElementById('main-content');
    mc.innerHTML = this.html.loader();
    try {
      const client = await this.get(`/api/clients/${id}`);
      mc.innerHTML = this.html.clientDetail(client);
    } catch (e) {
      mc.innerHTML = this.html.error(e.message);
    }
  },

  // ─────────────────────────────────────────────────────────
  //  SEARCH
  // ─────────────────────────────────────────────────────────
  renderSearch() {
    document.getElementById('main-content').innerHTML = this.html.searchPage();
    const input = document.getElementById('global-search-input');
    if (input) input.focus();
  },

  async performSearch(q) {
    if (!q.trim()) {
      document.getElementById('search-results').innerHTML = '';
      return;
    }
    document.getElementById('search-results').innerHTML = this.html.loader();
    try {
      const results = await this.get(`/api/search?q=${encodeURIComponent(q)}`);
      document.getElementById('search-results').innerHTML = this.html.searchResults(results);
    } catch (e) {
      document.getElementById('search-results').innerHTML = this.html.error(e.message);
    }
  },

  // ─────────────────────────────────────────────────────────
  //  MODALS — CLIENT
  // ─────────────────────────────────────────────────────────
  showClientForm(client = null) {
    this.showModal(this.html.clientForm(client));
  },

  async saveClient(e) {
    e.preventDefault();
    const form = e.target;
    const data = {
      name: form.name.value.trim(),
      business_name: form.business_name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      notes: form.notes.value.trim(),
    };
    const id = form.dataset.id;
    try {
      if (id) {
        await this.put(`/api/clients/${id}`, data);
        this.showToast('Client updated ✓', 'success');
      } else {
        await this.post('/api/clients', data);
        this.showToast('Client added ✓', 'success');
      }
      this.closeModal();
      if (id) {
        await this.loadClientDetail(id);
      } else {
        await this.loadClients();
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async deleteClient(id) {
    if (!confirm('Delete this client and all their websites/payments?')) return;
    try {
      await this.del(`/api/clients/${id}`);
      this.showToast('Client deleted', 'success');
      await this.navigate('clients');
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ─────────────────────────────────────────────────────────
  //  MODALS — WEBSITE
  // ─────────────────────────────────────────────────────────
  showWebsiteForm(clientId, website = null) {
    this.showModal(this.html.websiteForm(clientId, website));
  },

  async saveWebsite(e) {
    e.preventDefault();
    const form = e.target;
    const clientId = form.dataset.clientId;
    const websiteId = form.dataset.websiteId;
    const data = {
      domain: form.domain.value.trim(),
      hosting_provider: form.hosting_provider.value.trim(),
      start_date: form.start_date.value,
      billing_cycle: form.billing_cycle.value,
      price: parseFloat(form.price.value) || 0,
      status: form.status.value,
    };
    try {
      if (websiteId) {
        await this.put(`/api/websites/${websiteId}`, data);
        this.showToast('Website updated ✓', 'success');
      } else {
        await this.post(`/api/clients/${clientId}/websites`, data);
        this.showToast('Website added ✓', 'success');
      }
      this.closeModal();
      await this.loadClientDetail(clientId);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async deleteWebsite(websiteId, clientId) {
    if (!confirm('Delete this website and all its payment history?')) return;
    try {
      await this.del(`/api/websites/${websiteId}`);
      this.showToast('Website deleted', 'success');
      await this.loadClientDetail(clientId);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ─────────────────────────────────────────────────────────
  //  MODALS — PAYMENT
  // ─────────────────────────────────────────────────────────
  showPaymentForm(websiteId, domain, price, billingCycle) {
    this.showModal(this.html.paymentForm(websiteId, domain, price, billingCycle));
  },

  async savePayment(e) {
    e.preventDefault();
    const form = e.target;
    const websiteId = form.dataset.websiteId;
    const clientId = form.dataset.clientId;
    const data = {
      amount: parseFloat(form.amount.value) || 0,
      payment_date: form.payment_date.value,
      notes: form.notes.value.trim(),
    };
    try {
      await this.post(`/api/websites/${websiteId}/payments`, data);
      this.showToast('Payment recorded ✓', 'success');
      this.closeModal();
      if (clientId) {
        await this.loadClientDetail(clientId);
      } else {
        await this.loadDashboard();
      }
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async deletePayment(paymentId, clientId) {
    if (!confirm('Delete this payment record?')) return;
    try {
      await this.del(`/api/payments/${paymentId}`);
      this.showToast('Payment deleted', 'success');
      await this.loadClientDetail(clientId);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  // ─────────────────────────────────────────────────────────
  //  NOTIFICATIONS
  // ─────────────────────────────────────────────────────────
  async scheduleNotificationCheck() {
    await this.checkAndNotify();
    // Re-check every hour
    setInterval(() => this.checkAndNotify(), 60 * 60 * 1000);
  },

  async checkAndNotify() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // Silently wait — we'll ask on button click
      return;
    }
    if (Notification.permission !== 'granted') return;
    try {
      const data = await this.get('/api/dashboard');
      const { overdue_count, due_soon_count } = data.stats;
      if (overdue_count > 0) {
        new Notification('<i class="fas fa-exclamation-triangle"></i> Overdue Hosting Payments', {
          body: `${overdue_count} client${overdue_count > 1 ? 's' : ''} have overdue hosting invoices`,
          icon: '/static/icons/icon.svg',
          tag: 'overdue',
        });
      } else if (due_soon_count > 0) {
        new Notification('<i class="fas fa-clock"></i> Payments Due Soon', {
          body: `${due_soon_count} hosting payment${due_soon_count > 1 ? 's' : ''} due within 7 days`,
          icon: '/static/icons/icon.svg',
          tag: 'due-soon',
        });
      }
    } catch (_) {}
  },

  async requestNotificationPermission() {
    if (!('Notification' in window)) {
      this.showToast('Notifications not supported in this browser', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm === 'granted') {
      this.showToast('Notifications enabled ✓', 'success');
      await this.checkAndNotify();
    } else {
      this.showToast('Notification permission denied', 'error');
    }
  },

  // ─────────────────────────────────────────────────────────
  //  WHATSAPP
  // ─────────────────────────────────────────────────────────
  openWhatsApp(phone, domain, daysInfo, amount) {
    const msg = this.generateReminderMessage(domain, daysInfo, amount);
    const clean = phone.replace(/\D/g, '');
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  },

  generateReminderMessage(domain, daysInfo, amount) {
    return `Hi, this is a friendly reminder that your hosting renewal for *${domain}* is ${daysInfo}.\n\nAmount due: *${amount}*\n\nPlease confirm your payment at your earliest convenience. Thank you! 🙏`;
  },

  copyReminder(domain, daysInfo, amount) {
    const msg = this.generateReminderMessage(domain, daysInfo, amount);
    navigator.clipboard.writeText(msg).then(() => {
      this.showToast('Message copied ✓', 'success');
    }).catch(() => {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = msg;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.showToast('Message copied ✓', 'success');
    });
  },

  // ─────────────────────────────────────────────────────────
  //  MODAL SYSTEM
  // ─────────────────────────────────────────────────────────
  showModal(content) {
    const overlay = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.innerHTML = content;
    overlay.classList.remove('hidden');
    overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
    // Attach form listeners
    const forms = container.querySelectorAll('form[data-form]');
    forms.forEach((form) => {
      const type = form.dataset.form;
      if (type === 'client') form.addEventListener('submit', (e) => this.saveClient(e));
      if (type === 'website') form.addEventListener('submit', (e) => this.saveWebsite(e));
      if (type === 'payment') form.addEventListener('submit', (e) => this.savePayment(e));
    });
    // Billing cycle change → update price hint
    const cycleSelect = container.querySelector('select[name="billing_cycle"]');
    if (cycleSelect) {
      cycleSelect.addEventListener('change', () => this.updatePriceHint());
    }
  },

  updatePriceHint() {
    const container = document.getElementById('modal-container');
    const cycle = container.querySelector('select[name="billing_cycle"]')?.value;
    const hint = container.querySelector('#price-hint');
    if (!hint || !cycle) return;
    const labels = { monthly: 'per month', quarterly: 'per 3 months', 'semi-annual': 'per 6 months', annual: 'per year' };
    hint.textContent = labels[cycle] || '';
  },

  closeModal() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('visible');
    overlay.classList.add('hidden');
    document.body.style.overflow = '';
  },

  bindModalClose() {
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });
  },

  // ─────────────────────────────────────────────────────────
  //  EVENT DELEGATION
  // ─────────────────────────────────────────────────────────
  bindDelegation() {
    document.getElementById('main-content').addEventListener('click', (e) => {
      this.handleAction(e);
    });
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset;
      if (!action) return;
      if (action.action === 'close-modal') this.closeModal();
    });
  },

  handleAction(e) {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const { action } = el.dataset;

    switch (action) {
      case 'view-client':
        this.navigate('client-detail', { clientId: el.dataset.id });
        break;
      case 'back':
        this.goBack();
        break;
      case 'add-client':
        this.showClientForm();
        break;
      case 'edit-client':
        this.loadAndEditClient(el.dataset.id);
        break;
      case 'delete-client':
        this.deleteClient(el.dataset.id);
        break;
      case 'add-website':
        this.showWebsiteForm(el.dataset.clientId);
        break;
      case 'edit-website':
        this.loadAndEditWebsite(el.dataset.websiteId, el.dataset.clientId);
        break;
      case 'delete-website':
        this.deleteWebsite(el.dataset.websiteId, el.dataset.clientId);
        break;
      case 'add-payment':
        this.showPaymentForm(
          el.dataset.websiteId, el.dataset.domain,
          el.dataset.price, el.dataset.cycle
        );
        document.querySelector('#modal-container form')?.setAttribute('data-client-id', el.dataset.clientId || '');
        break;
      case 'quick-payment-dashboard':
        this.showPaymentFormFromDashboard(el.dataset.websiteId, el.dataset.domain, el.dataset.price, el.dataset.cycle);
        break;
      case 'delete-payment':
        this.deletePayment(el.dataset.paymentId, el.dataset.clientId);
        break;
      case 'whatsapp':
        this.openWhatsApp(el.dataset.phone, el.dataset.domain, el.dataset.daysInfo, el.dataset.amount);
        break;
      case 'copy-reminder':
        this.copyReminder(el.dataset.domain, el.dataset.daysInfo, el.dataset.amount);
        break;
      case 'toggle-payments':
        this.togglePaymentHistory(el.dataset.websiteId);
        break;
      case 'enable-notifications':
        this.requestNotificationPermission();
        break;
      case 'clients-search-submit': {
        const q = document.getElementById('clients-search-input')?.value || '';
        this.loadClients(q);
        break;
      }
    }
  },

  showPaymentFormFromDashboard(websiteId, domain, price, cycle) {
    this.showPaymentForm(websiteId, domain, price, cycle);
    // We're on dashboard, so after save reload dashboard
    const form = document.querySelector('#modal-container form[data-form="payment"]');
    if (form) form.dataset.clientId = '';
  },

  async loadAndEditClient(id) {
    try {
      const client = await this.get(`/api/clients/${id}`);
      this.showClientForm(client);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  async loadAndEditWebsite(websiteId, clientId) {
    try {
      const website = await this.get(`/api/websites/${websiteId}`);
      this.showWebsiteForm(clientId, website);
    } catch (err) {
      this.showToast(err.message, 'error');
    }
  },

  togglePaymentHistory(websiteId) {
    const el = document.getElementById(`payments-${websiteId}`);
    if (!el) return;
    el.classList.toggle('expanded');
    const btn = document.querySelector(`[data-action="toggle-payments"][data-website-id="${websiteId}"]`);
    if (btn) btn.innerHTML = el.classList.contains('expanded') ? '<i class="fas fa-eye-slash"></i> Hide History' : '<i class="fas fa-eye"></i>  Payment History';
  },

  // ─────────────────────────────────────────────────────────
  //  BOTTOM NAV
  // ─────────────────────────────────────────────────────────
  bindNav() {
    document.querySelectorAll('.nav-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.nav;
        this.navigate(view);
      });
    });

    // Search input in search page — delegated via input event
    document.getElementById('main-content').addEventListener('input', (e) => {
      if (e.target.id === 'global-search-input') {
        clearTimeout(this._searchTimer);
        this._searchTimer = setTimeout(() => this.performSearch(e.target.value), 300);
      }
      if (e.target.id === 'clients-search-input') {
        clearTimeout(this._clientSearchTimer);
        this._clientSearchTimer = setTimeout(() => this.loadClients(e.target.value), 400);
      }
    });
  },

  // ─────────────────────────────────────────────────────────
  //  TOAST
  // ─────────────────────────────────────────────────────────
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  },

  // ─────────────────────────────────────────────────────────
  //  UTILITIES
  // ─────────────────────────────────────────────────────────
  fmt: {
    date(d) {
      if (!d) return '—';
      const dt = new Date(d + 'T00:00:00');
      return dt.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
    },
    currency(n) {
      if (n === null || n === undefined) return '—';
      return 'R ' + Number(n).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    initials(name) {
      if (!name) return '?';
      return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('');
    },
    daysInfo(delta) {
      if (delta === null || delta === undefined) return 'No payment recorded';
      if (delta < 0) return `${Math.abs(delta)} day${Math.abs(delta) !== 1 ? 's' : ''} overdue`;
      if (delta === 0) return 'due today';
      return `due in ${delta} day${delta !== 1 ? 's' : ''}`;
    },
    cycleLabel(c) {
      const m = { monthly: 'Monthly', quarterly: 'Quarterly', 'semi-annual': 'Semi-Annual', annual: 'Annual' };
      return m[c] || c;
    },
    statusBadge(status) {
      const m = {
        overdue: ['badge-red', 'OVERDUE'],
        due_soon: ['badge-amber', 'DUE SOON'],
        active: ['badge-green', 'ACTIVE'],
        pending: ['badge-gray', 'PENDING'],
      };
      const [cls, label] = m[status] || ['badge-gray', status.toUpperCase()];
      return `<span class="badge ${cls}">${label}</span>`;
    },
  },

  // ─────────────────────────────────────────────────────────
  //  HTML TEMPLATES
  // ─────────────────────────────────────────────────────────
  html: {
    loader() {
      return `<div class="loader-wrap"><div class="loader"></div></div>`;
    },
    error(msg) {
      return `<div class="empty-state"><div class="empty-icon"><i class="fas fa-exclamation-triangle"></i></div><p>${msg}</p></div>`;
    },

    // ── DASHBOARD ──────────────────────────────────────────
    dashboard(data) {
      const { stats, overdue, due_soon, active } = data;
      const notifBanner = ('Notification' in window && Notification.permission === 'default')
        ? `<div class="notif-banner"><span> <i class="fas fa-bell"></i> Enable push notifications to never miss a renewal</span><button class="btn-sm btn-cyan" data-action="enable-notifications">Enable</button></div>`
        : '';
      return `
      <div class="dashboard">
        ${notifBanner}
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">${stats.total_clients}</div>
            <div class="stat-label">Clients</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">${stats.total_websites}</div>
            <div class="stat-label">Active Sites</div>
          </div>
          <div class="stat-card stat-danger">
            <div class="stat-value">${stats.overdue_count}</div>
            <div class="stat-label">Overdue</div>
          </div>
          <div class="stat-card stat-warn">
            <div class="stat-value">${stats.due_soon_count}</div>
            <div class="stat-label">Due Soon</div>
          </div>
        </div>
        <div class="revenue-bar">
          <span class="revenue-label">Est. Monthly Revenue</span>
          <span class="revenue-value">${App.fmt.currency(stats.monthly_revenue)}</span>
        </div>

        ${overdue.length ? `
        <section class="status-section">
          <div class="section-header section-header-red">
            <span class="section-dot dot-red"></span>
            OVERDUE <span class="section-count">${overdue.length}</span>
          </div>
          ${overdue.map((i) => App.html.dashboardItem(i, 'overdue')).join('')}
        </section>` : ''}

        ${due_soon.length ? `
        <section class="status-section">
          <div class="section-header section-header-amber">
            <span class="section-dot dot-amber"></span>
            DUE SOON <span class="section-count">${due_soon.length}</span>
          </div>
          ${due_soon.map((i) => App.html.dashboardItem(i, 'due_soon')).join('')}
        </section>` : ''}

        ${active.length ? `
        <section class="status-section">
          <div class="section-header section-header-green">
            <span class="section-dot dot-green"></span>
            ACTIVE <span class="section-count">${active.length}</span>
          </div>
          ${active.map((i) => App.html.dashboardItem(i, 'active')).join('')}
        </section>` : ''}

        ${!overdue.length && !due_soon.length && !active.length ? `
        <div class="empty-state">
          <div class="empty-icon"><i class="fas fa-globe"></i></div>
          <p>No active websites yet.</p>
          <p class="empty-sub">Add clients and websites to get started.</p>
        </div>` : ''}
      </div>`;
    },

    dashboardItem(item, status) {
      const daysInfo = App.fmt.daysInfo(item.days_delta);
      const border = status === 'overdue' ? 'item-red' : status === 'due_soon' ? 'item-amber' : 'item-green';
      const pulse = status === 'overdue' ? 'pulse' : '';
      return `
      <div class="hosting-item ${border} ${pulse}">
        <div class="item-top">
          <div class="item-domain">${item.domain}</div>
          <div class="item-amount">${App.fmt.currency(item.price)}</div>
        </div>
        <div class="item-meta">
          <span class="item-client" data-action="view-client" data-id="${item.client_id}">${item.client_name}</span>
          <span class="item-due-info ${status}">${daysInfo}</span>
        </div>
        <div class="item-cycle">${App.fmt.cycleLabel(item.billing_cycle)} · Next: ${App.fmt.date(item.next_due_date)}</div>
        <div class="item-actions">
          <button class="btn-action btn-green" data-action="quick-payment-dashboard"
            data-website-id="${item.website_id}" data-domain="${item.domain}"
            data-price="${item.price}" data-cycle="${item.billing_cycle}">
            <i class="fas fa-check"></i> Record Payment
          </button>
          ${item.phone ? `
          <button class="btn-action btn-wa" data-action="whatsapp"
            data-phone="${item.phone}" data-domain="${item.domain}"
            data-days-info="${daysInfo}" data-amount="${App.fmt.currency(item.price)}">
            <i class="fa-brands fa-whatsapp"></i> WhatsApp
          </button>` : ''}
          <button class="btn-action btn-copy" data-action="copy-reminder"
            data-domain="${item.domain}" data-days-info="${daysInfo}"
            data-amount="${App.fmt.currency(item.price)}">
            <i class="fas fa-copy"></i> Copy
          </button>
        </div>
      </div>`;
    },

    // ── CLIENT LIST ────────────────────────────────────────
    clientList(clients, search) {
      return `
      <div class="clients-page">
        <div class="search-bar-wrap">
          <input class="search-input" id="clients-search-input" type="text"
            placeholder="Search by name, business or email…" value="${search}">
        </div>
        <div class="client-cards">
          ${clients.length
            ? clients.map((c) => App.html.clientCard(c)).join('')
            : `<div class="empty-state"><div class="empty-icon"><i class="fas fa-user"></i></div><p>No clients found</p></div>`
          }
        </div>
        <button class="fab" data-action="add-client" title="Add Client">＋</button>
      </div>`;
    },

    clientCard(c) {
      const overdueBadge = c.overdue_count > 0
        ? `<span class="badge badge-red">${c.overdue_count} OVERDUE</span>`
        : `<span class="badge badge-green">${c.website_count} SITE${c.website_count !== 1 ? 'S' : ''}</span>`;
      return `
      <div class="client-card" data-action="view-client" data-id="${c.id}">
        <div class="client-avatar">${App.fmt.initials(c.name)}</div>
        <div class="client-info">
          <div class="client-name">${c.name}</div>
          <div class="client-biz">${c.business_name || '—'}</div>
          <div class="client-contact">${c.email || c.phone || '—'}</div>
        </div>
        <div class="client-badge">${overdueBadge}</div>
      </div>`;
    },

    // ── CLIENT DETAIL ──────────────────────────────────────
    clientDetail(c) {
      const websites = c.websites || [];
      return `
      <div class="client-detail">
        <div class="detail-topbar">
          <button class="back-btn" data-action="back">← Back</button>
          <div class="topbar-actions">
            <button class="btn-sm btn-outline" data-action="edit-client" data-id="${c.id}">Edit</button>
            <button class="btn-sm btn-danger" data-action="delete-client" data-id="${c.id}">Delete</button>
          </div>
        </div>

        <div class="client-header-card">
          <div class="client-avatar large">${App.fmt.initials(c.name)}</div>
          <div class="client-header-info">
            <h2>${c.name}</h2>
            ${c.business_name ? `<p class="biz-name">${c.business_name}</p>` : ''}
            ${c.phone ? `<p><i class="fas fa-phone"></i> ${c.phone}</p>` : ''}
            ${c.email ? `<p><i class="fas fa-envelope"></i> ${c.email}</p>` : ''}
          </div>
        </div>

        ${c.notes ? `<div class="notes-card"><div class="notes-label">NOTES</div>${c.notes}</div>` : ''}

        <div class="websites-section">
          <div class="section-title-row">
            <h3>Websites</h3>
            <button class="btn-sm btn-cyan" data-action="add-website" data-client-id="${c.id}">+ Add Site</button>
          </div>
          ${websites.length
            ? websites.map((w) => App.html.websiteCard(w, c.id, c.phone)).join('')
            : `<div class="empty-state small"><div class="empty-icon"><i class="fas fa-globe"></i></div><p>No websites yet</p></div>`
          }
        </div>
      </div>`;
    },

    websiteCard(w, clientId, phone) {
      const daysInfo = App.fmt.daysInfo(w.days_delta);
      const border = { overdue: 'item-red', due_soon: 'item-amber', active: 'item-green', pending: 'item-gray' }[w.payment_status] || 'item-gray';
      const payments = w.payments || [];
      return `
      <div class="website-card ${border}">
        <div class="wc-top">
          <div class="wc-domain">${w.domain}</div>
          ${App.fmt.statusBadge(w.payment_status)}
        </div>
        <div class="wc-meta">
          <span>${w.hosting_provider || 'Unknown provider'}</span>
          <span>${App.fmt.cycleLabel(w.billing_cycle)}</span>
          <span class="wc-price">${App.fmt.currency(w.price)}</span>
        </div>
        <div class="wc-due">
          <span>Next due: <strong>${App.fmt.date(w.next_due_date)}</strong></span>
          <span class="${w.payment_status}">${daysInfo}</span>
        </div>
        <div class="wc-actions">
          <button class="btn-action btn-green" data-action="add-payment"
            data-website-id="${w.id}" data-client-id="${clientId}"
            data-domain="${w.domain}" data-price="${w.price}" data-cycle="${w.billing_cycle}">
            <i class="fas fa-coins"></i> Record Payment
          </button>
          ${phone ? `
          <button class="btn-action btn-wa" data-action="whatsapp"
            data-phone="${phone}" data-domain="${w.domain}"
            data-days-info="${daysInfo}" data-amount="${App.fmt.currency(w.price)}">
            <i class="fa-brands fa-whatsapp"></i> WhatsApp
          </button>` : ''}
          <button class="btn-action btn-copy" data-action="copy-reminder"
            data-domain="${w.domain}" data-days-info="${daysInfo}"
            data-amount="${App.fmt.currency(w.price)}">
            <i class="fas fa-copy"></i> Copy
          </button>
          <button class="btn-action btn-outline" data-action="edit-website"
            data-website-id="${w.id}" data-client-id="${clientId}"> <i class="fas fa-edit"></i> Edit</button>
          <button class="btn-action btn-danger" data-action="delete-website"
            data-website-id="${w.id}" data-client-id="${clientId}"> <i class="fas fa-trash"></i> Delete</button>
        </div>
        <div class="payment-history-toggle" data-action="toggle-payments" data-website-id="${w.id}">
          ▼ Payment History (${payments.length})
        </div>
        <div class="payment-history" id="payments-${w.id}">
          ${payments.length
            ? `<table class="payment-table">
                <thead><tr><th>Date</th><th>Amount</th><th>Next Due</th><th>Notes</th><th></th></tr></thead>
                <tbody>
                  ${payments.map((p) => `
                  <tr>
                    <td>${App.fmt.date(p.payment_date)}</td>
                    <td>${App.fmt.currency(p.amount)}</td>
                    <td>${App.fmt.date(p.next_due_date)}</td>
                    <td class="notes-cell">${p.notes || '—'}</td>
                    <td><button class="btn-icon-danger" data-action="delete-payment"
                      data-payment-id="${p.id}" data-client-id="${clientId}">✕</button></td>
                  </tr>`).join('')}
                </tbody>
              </table>`
            : '<p class="no-payments">No payments recorded yet</p>'
          }
        </div>
      </div>`;
    },

    // ── SEARCH ─────────────────────────────────────────────
    searchPage() {
      return `
      <div class="search-page">
        <div class="search-bar-wrap">
          <input class="search-input" id="global-search-input" type="text"
            placeholder="Search clients, businesses, domains…" autocomplete="off">
        </div>
        <div id="search-results"></div>
      </div>`;
    },

    searchResults(results) {
      const { clients, websites } = results;
      if (!clients.length && !websites.length) {
        return `<div class="empty-state"><div class="empty-icon"><i class="fas fa-search"></i></div><p>No results found</p></div>`;
      }
      return `
      ${clients.length ? `
      <div class="search-group">
        <div class="search-group-label">CLIENTS</div>
        ${clients.map((c) => `
        <div class="search-result-item" data-action="view-client" data-id="${c.id}">
          <div class="sr-avatar">${App.fmt.initials(c.name)}</div>
          <div>
            <div class="sr-name">${c.name}</div>
            <div class="sr-sub">${c.business_name || c.email || ''}</div>
          </div>
        </div>`).join('')}
      </div>` : ''}
      ${websites.length ? `
      <div class="search-group">
        <div class="search-group-label">WEBSITES</div>
        ${websites.map((w) => `
        <div class="search-result-item" data-action="view-client" data-id="${w.client_id}">
          <div class="sr-domain-icon"><i class="fas fa-globe"></i></div>
          <div>
            <div class="sr-name">${w.domain}</div>
            <div class="sr-sub">${w.client_name}</div>
          </div>
        </div>`).join('')}
      </div>` : ''}`;
    },

    // ── CLIENT FORM ────────────────────────────────────────
    clientForm(client) {
      const isEdit = !!client;
      return `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Client' : 'Add New Client'}</h3>
          <button class="modal-close" data-action="close-modal">✕</button>
        </div>
        <form data-form="client" ${isEdit ? `data-id="${client.id}"` : ''}>
          <div class="form-group">
            <label>Full Name *</label>
            <input name="name" type="text" required value="${isEdit ? client.name : ''}" placeholder="John Smith">
          </div>
          <div class="form-group">
            <label>Business Name</label>
            <input name="business_name" type="text" value="${isEdit ? (client.business_name || '') : ''}" placeholder="Smith & Co.">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Phone</label>
              <input name="phone" type="tel" value="${isEdit ? (client.phone || '') : ''}" placeholder="+27 82 000 0000">
            </div>
            <div class="form-group">
              <label>Email</label>
              <input name="email" type="email" value="${isEdit ? (client.email || '') : ''}" placeholder="john@example.com">
            </div>
          </div>
          <div class="form-group">
            <label>Notes</label>
            <textarea name="notes" rows="3" placeholder="Payment preferences, special notes…">${isEdit ? (client.notes || '') : ''}</textarea>
          </div>
          <button type="submit" class="btn-primary">${isEdit ? 'Update Client' : 'Add Client'}</button>
        </form>
      </div>`;
    },

    // ── WEBSITE FORM ───────────────────────────────────────
    websiteForm(clientId, website) {
      const isEdit = !!website;
      const today = new Date().toISOString().split('T')[0];
      return `
      <div class="modal-content">
        <div class="modal-header">
          <h3>${isEdit ? 'Edit Website' : 'Add Website'}</h3>
          <button class="modal-close" data-action="close-modal">✕</button>
        </div>
        <form data-form="website" data-client-id="${clientId}" ${isEdit ? `data-website-id="${website.id}"` : ''}>
          <div class="form-group">
            <label>Domain Name *</label>
            <input name="domain" type="text" required value="${isEdit ? website.domain : ''}" placeholder="example.co.za">
          </div>
          <div class="form-group">
            <label>Hosting Provider</label>
            <input name="hosting_provider" type="text" value="${isEdit ? (website.hosting_provider || '') : ''}" placeholder="Afrihost, Hetzner, Cloudflare…">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Start Date</label>
              <input name="start_date" type="date" value="${isEdit ? (website.start_date || today) : today}">
            </div>
            <div class="form-group">
              <label>Status</label>
              <select name="status">
                <option value="active" ${!isEdit || website.status === 'active' ? 'selected' : ''}>Active</option>
                <option value="inactive" ${isEdit && website.status === 'inactive' ? 'selected' : ''}>Inactive</option>
              </select>
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label>Billing Cycle</label>
              <select name="billing_cycle">
                <option value="monthly" ${!isEdit || website.billing_cycle === 'monthly' ? 'selected' : ''}>Monthly</option>
                <option value="quarterly" ${isEdit && website.billing_cycle === 'quarterly' ? 'selected' : ''}>Quarterly</option>
                <option value="semi-annual" ${isEdit && website.billing_cycle === 'semi-annual' ? 'selected' : ''}>Semi-Annual</option>
                <option value="annual" ${isEdit && website.billing_cycle === 'annual' ? 'selected' : ''}>Annual</option>
              </select>
            </div>
            <div class="form-group">
              <label>Price <span id="price-hint" class="hint-text">per month</span></label>
              <input name="price" type="number" step="0.01" min="0"
                value="${isEdit ? website.price : ''}" placeholder="0.00">
            </div>
          </div>
          <button type="submit" class="btn-primary">${isEdit ? 'Update Website' : 'Add Website'}</button>
        </form>
      </div>`;
    },

    // ── PAYMENT FORM ───────────────────────────────────────
    paymentForm(websiteId, domain, price, billingCycle) {
      const today = new Date().toISOString().split('T')[0];
      const cycleText = { monthly: '1 month', quarterly: '3 months', 'semi-annual': '6 months', annual: '1 year' }[billingCycle] || '';
      return `
      <div class="modal-content">
        <div class="modal-header">
          <h3>Record Payment</h3>
          <button class="modal-close" data-action="close-modal">✕</button>
        </div>
        <div class="payment-domain-label">${domain}</div>
        <form data-form="payment" data-website-id="${websiteId}">
          <div class="form-row">
            <div class="form-group">
              <label>Payment Date</label>
              <input name="payment_date" type="date" value="${today}" required>
            </div>
            <div class="form-group">
              <label>Amount Paid</label>
              <input name="amount" type="number" step="0.01" min="0" value="${price || ''}" placeholder="0.00" required>
            </div>
          </div>
          ${cycleText ? `<p class="cycle-note">Next due date will be auto-calculated <strong>${cycleText}</strong> from payment date.</p>` : ''}
          <div class="form-group">
            <label>Notes (optional)</label>
            <input name="notes" type="text" placeholder="Invoice #, reference…">
          </div>
          <button type="submit" class="btn-primary"> <i class="fas fa-save"></i> Save Payment</button>
        </form>
      </div>`;
    },
  },
};

// ═══════════════════════════════════════════════════════════
//  BOOT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => App.init());
