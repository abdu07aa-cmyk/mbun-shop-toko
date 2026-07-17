// ============================================================
// MBUN COLLECTION — APP.JS (VERSION FIXED)
// ============================================================

const CONFIG = {
  SUPABASE_URL: 'https://marelgsluzshkwxwcjod.supabase.co',
  SUPABASE_ANON_KEY: localStorage.getItem('toko_supabase_key') || '',
  STORAGE_BUCKET_PAYMENT_PROOFS: 'payment-proofs',
  PAYMENT_INFO: [
    { label: 'GoPay', value: '0897-3488-963 a.n. MBUN COLLECTION' },
    { label: 'Transfer BCA', value: '1234567890 a.n. MBUN COLLECTION' },
  ],
  ADMIN_PASSWORD: 'mbun123',
};

const STATE = {
  products: [],
  cart: JSON.parse(localStorage.getItem('toko_cart') || '[]'),
  customerName: localStorage.getItem('toko_customer_name') || '',
  customerPhone: localStorage.getItem('toko_customer_phone') || '',
};

// ============================================================
// UTILS
// ============================================================
const Utils = {
  formatCurrency(v) {
    return 'Rp ' + new Intl.NumberFormat('id-ID').format(v || 0);
  },
  escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = String(s || '');
    return d.innerHTML;
  },
  showToast(msg, type = 'info', duration = 3000) {
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const t = document.createElement('div');
    t.className = `toast is-${type}`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), duration);
  },
  showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.hidden = !show;
  }
};

// ============================================================
// API
// ============================================================
const API = {
  _headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    };
  },
  isConfigured() {
    return !!CONFIG.SUPABASE_ANON_KEY;
  },
  async fetchAll(table, params = {}) {
    const q = new URLSearchParams({ select: '*', ...params }).toString();
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?${q}`, {
      headers: this._headers()
    });
    if (!r.ok) throw new Error(`Gagal: ${r.status}`);
    return r.json();
  },
  async insert(table, payload) {
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        ...this._headers(),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Gagal insert: ${r.status}`);
    return r.json();
  },
  async update(table, filter, payload) {
    const q = new URLSearchParams(filter).toString();
    const r = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/${table}?${q}`, {
      method: 'PATCH',
      headers: {
        ...this._headers(),
        'Prefer': 'return=representation'
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(`Gagal update: ${r.status}`);
    return r.json();
  }
};

// ============================================================
// CATALOG
// ============================================================
const Catalog = {
  async load() {
    Utils.showLoading(true);
    try {
      console.log('📦 Memuat produk...');
      STATE.products = await API.fetchAll('products', { 
        deleted_at: 'is.null',
        order: 'name.asc' 
      });
      console.log('✅ Produk dimuat:', STATE.products.length);
      this.render();
    } catch (err) {
      console.error('❌ Gagal load produk:', err);
      Utils.showToast('Gagal memuat produk: ' + err.message, 'error', 5000);
      document.getElementById('productGrid').innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <p>Gagal memuat produk</p>
          <p style="font-size:12px;color:#ef4444;">${err.message}</p>
        </div>
      `;
    } finally {
      Utils.showLoading(false);
    }
  },

  render() {
    const grid = document.getElementById('productGrid');
    if (!grid) return;

    if (STATE.products.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open"></i>
          <p>Belum ada produk</p>
          <p style="font-size:12px;color:var(--color-text-muted);">Tambahkan produk di Supabase</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = STATE.products.map(p => `
      <button class="product-card" data-add="${p.id}">
        <div class="product-card-image">
          <div class="emoji-fallback">${p.emoji || '📦'}</div>
          ${p.stock <= 0 ? '<span class="stock-badge">Habis</span>' : ''}
        </div>
        <div class="product-card-body">
          <div class="product-card-name">${Utils.escapeHtml(p.name)}</div>
          <div class="product-card-price">${Utils.formatCurrency(p.price)}</div>
          <div class="product-card-stock">${p.stock <= 0 ? 'Stok habis' : `Stok: ${p.stock}`}</div>
          <div class="product-card-add">${p.stock <= 0 ? 'Habis' : '+ Keranjang'}</div>
        </div>
      </button>
    `).join('');

    grid.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.add;
        Cart.addItem(id);
      });
    });
  }
};

// ============================================================
// CART
// ============================================================
const Cart = {
  addItem(id) {
    const p = STATE.products.find(pr => String(pr.id) === String(id));
    if (!p) return;
    if (p.stock <= 0) {
      Utils.showToast('Stok habis', 'error');
      return;
    }
    const existing = STATE.cart.find(i => i.productId === String(id));
    if (existing) {
      if (existing.qty >= p.stock) {
        Utils.showToast('Stok tidak cukup', 'error');
        return;
      }
      existing.qty += 1;
    } else {
      STATE.cart.push({
        productId: String(p.id),
        name: p.name,
        price: p.price,
        emoji: p.emoji || '📦',
        qty: 1
      });
    }
    localStorage.setItem('toko_cart', JSON.stringify(STATE.cart));
    this.render();
    Utils.showToast(`${p.name} ditambahkan`, 'success');
  },

  render() {
    const badge = document.getElementById('cartBadge');
    const count = STATE.cart.reduce((s, i) => s + i.qty, 0);
    if (badge) {
      badge.textContent = count;
      badge.hidden = count === 0;
    }

    const items = document.getElementById('cartItems');
    const total = document.getElementById('cartTotal');
    const checkout = document.getElementById('checkoutBtn');

    if (!items) return;

    if (STATE.cart.length === 0) {
      items.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-cart-shopping"></i>
          <p>Keranjang kosong</p>
        </div>
      `;
    } else {
      items.innerHTML = STATE.cart.map(i => `
        <div class="cart-item">
          <div class="cart-item-image">${i.emoji}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${Utils.escapeHtml(i.name)}</div>
            <div class="cart-item-price">${Utils.formatCurrency(i.price)}</div>
          </div>
          <div class="qty-control">
            <button data-decr="${i.productId}"><i class="fa-solid fa-minus"></i></button>
            <span>${i.qty}</span>
            <button data-incr="${i.productId}"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
      `).join('');

      items.querySelectorAll('[data-incr]').forEach(b => {
        b.addEventListener('click', () => {
          const item = STATE.cart.find(i => i.productId === b.dataset.incr);
          this.setQty(b.dataset.incr, item.qty + 1);
        });
      });
      items.querySelectorAll('[data-decr]').forEach(b => {
        b.addEventListener('click', () => {
          const item = STATE.cart.find(i => i.productId === b.dataset.decr);
          this.setQty(b.dataset.decr, item.qty - 1);
        });
      });
    }

    const totalAmount = STATE.cart.reduce((s, i) => s + i.price * i.qty, 0);
    if (total) total.textContent = Utils.formatCurrency(totalAmount);
    if (checkout) checkout.disabled = STATE.cart.length === 0;
  },

  setQty(id, qty) {
    const item = STATE.cart.find(i => i.productId === String(id));
    if (!item) return;
    if (qty <= 0) {
      STATE.cart = STATE.cart.filter(i => i.productId !== String(id));
    } else {
      const p = STATE.products.find(pr => String(pr.id) === String(id));
      if (p && qty > p.stock) {
        Utils.showToast('Stok tidak cukup', 'warning');
        return;
      }
      item.qty = qty;
    }
    localStorage.setItem('toko_cart', JSON.stringify(STATE.cart));
    this.render();
  },

  open() {
    document.getElementById('cartDrawer').classList.add('is-open');
    document.getElementById('cartOverlay').classList.add('is-open');
    this.render();
  },
  close() {
    document.getElementById('cartDrawer').classList.remove('is-open');
    document.getElementById('cartOverlay').classList.remove('is-open');
  }
};

// ============================================================
// CHECKOUT
// ============================================================
const Checkout = {
  open() {
    if (STATE.cart.length === 0) {
      Utils.showToast('Keranjang kosong', 'warning');
      return;
    }
    Cart.close();
    document.getElementById('checkoutDrawer').classList.add('is-open');
    document.getElementById('checkoutOverlay').classList.add('is-open');
    this.render();
  },
  close() {
    document.getElementById('checkoutDrawer').classList.remove('is-open');
    document.getElementById('checkoutOverlay').classList.remove('is-open');
  },
  render() {
    const body = document.getElementById('checkoutBody');
    if (!body) return;

    const total = STATE.cart.reduce((s, i) => s + i.price * i.qty, 0);

    body.innerHTML = `
      <div class="form-field">
        <span>Nama Lengkap</span>
        <input type="text" id="ckName" value="${Utils.escapeHtml(STATE.customerName)}" placeholder="Nama kamu">
      </div>
      <div class="form-field">
        <span>Nomor HP (WhatsApp)</span>
        <input type="tel" id="ckPhone" value="${Utils.escapeHtml(STATE.customerPhone)}" placeholder="08xxxxxxxxxx">
      </div>
      
      <div class="summary-row" style="margin-top:16px;">
        <span>Total Belanja</span>
        <span>${Utils.formatCurrency(total)}</span>
      </div>

      <div class="payment-info-box">
        <strong>Transfer ke:</strong>
        ${CONFIG.PAYMENT_INFO.map(p => `<div class="payment-info-row"><span>${p.label}</span><span>${p.value}</span></div>`).join('')}
      </div>

      <button class="btn btn-primary btn-block" id="ckSubmitBtn">
        <i class="fa-solid fa-paper-plane"></i> Kirim Pesanan
      </button>
    `;

    document.getElementById('ckSubmitBtn').addEventListener('click', async () => {
      const name = document.getElementById('ckName').value.trim();
      const phone = document.getElementById('ckPhone').value.trim();

      if (!name || !phone) {
        Utils.showToast('Isi nama dan HP', 'error');
        return;
      }

      Utils.showLoading(true);
      try {
        await API.insert('online_orders', {
          customer_name: name,
          customer_phone: phone,
          fulfillment_type: 'pickup',
          items: STATE.cart,
          total_amount: total,
          status: 'menunggu_konfirmasi'
        });

        STATE.cart = [];
        localStorage.setItem('toko_cart', JSON.stringify(STATE.cart));
        Cart.render();
        this.close();
        Utils.showToast('Pesanan berhasil dikirim!', 'success', 4000);
      } catch (err) {
        Utils.showToast('Gagal: ' + err.message, 'error');
      } finally {
        Utils.showLoading(false);
      }
    });
  }
};

// ============================================================
// ADMIN ORDERS
// ============================================================
const AdminOrders = {
  orders: [],
  currentStatus: 'all',

  open() {
    const pwd = localStorage.getItem('admin_password');
    if (pwd !== CONFIG.ADMIN_PASSWORD) {
      const input = prompt('Masukkan password admin:');
      if (input !== CONFIG.ADMIN_PASSWORD) {
        Utils.showToast('Password salah!', 'error');
        return;
      }
      localStorage.setItem('admin_password', CONFIG.ADMIN_PASSWORD);
    }
    document.getElementById('adminOrdersDrawer').classList.add('is-open');
    document.getElementById('adminOrdersOverlay').classList.add('is-open');
    this.load();
  },

  close() {
    document.getElementById('adminOrdersDrawer').classList.remove('is-open');
    document.getElementById('adminOrdersOverlay').classList.remove('is-open');
  },

  async load() {
    Utils.showLoading(true);
    try {
      this.orders = await API.fetchAll('online_orders', {
        order: 'created_at.desc',
        limit: 100
      });
      this.render();
      this.updateBadge();
    } catch (err) {
      Utils.showToast('Gagal memuat pesanan', 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  render() {
    const container = document.getElementById('adminOrdersContent');
    if (!container) return;

    const stats = {
      total: this.orders.length,
      menunggu: this.orders.filter(o => o.status === 'menunggu_konfirmasi').length,
      diproses: this.orders.filter(o => o.status === 'diproses').length,
      selesai: this.orders.filter(o => o.status === 'selesai').length,
    };

    let filtered = this.orders;
    if (this.currentStatus !== 'all') {
      filtered = filtered.filter(o => o.status === this.currentStatus);
    }

    container.innerHTML = `
      <div class="admin-stats">
        <div class="stat-card"><span class="stat-label">Total</span><span class="stat-number">${stats.total}</span></div>
        <div class="stat-card stat-warning"><span class="stat-label">⏳ Menunggu</span><span class="stat-number">${stats.menunggu}</span></div>
        <div class="stat-card stat-primary"><span class="stat-label">📦 Diproses</span><span class="stat-number">${stats.diproses}</span></div>
        <div class="stat-card stat-success"><span class="stat-label">✅ Selesai</span><span class="stat-number">${stats.selesai}</span></div>
      </div>
      <div class="admin-order-filters">
        <button class="filter-btn ${this.currentStatus === 'all' ? 'active' : ''}" data-status="all">Semua (${stats.total})</button>
        <button class="filter-btn ${this.currentStatus === 'menunggu_konfirmasi' ? 'active' : ''}" data-status="menunggu_konfirmasi">⏳ Menunggu (${stats.menunggu})</button>
        <button class="filter-btn ${this.currentStatus === 'dibayar' ? 'active' : ''}" data-status="dibayar">💳 Dibayar</button>
        <button class="filter-btn ${this.currentStatus === 'diproses' ? 'active' : ''}" data-status="diproses">📦 Diproses</button>
        <button class="filter-btn ${this.currentStatus === 'siap' ? 'active' : ''}" data-status="siap">✅ Siap</button>
        <button class="filter-btn ${this.currentStatus === 'selesai' ? 'active' : ''}" data-status="selesai">🏁 Selesai</button>
        <button class="filter-btn ${this.currentStatus === 'dibatalkan' ? 'active' : ''}" data-status="dibatalkan">❌ Dibatalkan</button>
      </div>
      <div class="admin-order-list">
        ${filtered.length === 0 ? '<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Tidak ada pesanan</p></div>' : filtered.map(o => this._orderCard(o)).join('')}
      </div>
    `;

    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentStatus = btn.dataset.status;
        this.render();
      });
    });

    container.querySelectorAll('.order-action-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const action = btn.dataset.action;
        await this.updateStatus(id, action);
      });
    });

    container.querySelectorAll('.view-proof-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const url = btn.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });
  },

  _orderCard(order) {
    const label = {
      menunggu_konfirmasi: '⏳ Menunggu Konfirmasi',
      dibayar: '💳 Dibayar',
      diproses: '📦 Diproses',
      siap: '✅ Siap',
      selesai: '🏁 Selesai',
      dibatalkan: '❌ Dibatalkan'
    };
    const cls = {
      menunggu_konfirmasi: 'status-warning',
      dibayar: 'status-info',
      diproses: 'status-primary',
      siap: 'status-success',
      selesai: 'status-success',
      dibatalkan: 'status-danger'
    };

    const actions = [];
    if (order.status === 'menunggu_konfirmasi') {
      actions.push({ label: '✅ Konfirmasi', action: 'dibayar', class: 'btn-success' });
      actions.push({ label: '❌ Tolak', action: 'dibatalkan', class: 'btn-danger' });
    }
    if (order.status === 'dibayar') {
      actions.push({ label: '📦 Proses', action: 'diproses', class: 'btn-primary' });
    }
    if (order.status === 'diproses') {
      actions.push({ label: '✅ Siap', action: 'siap', class: 'btn-success' });
    }
    if (order.status === 'siap') {
      actions.push({ label: '🏁 Selesai', action: 'selesai', class: 'btn-secondary' });
    }

    return `
      <div class="admin-order-card">
        <div class="admin-order-header">
          <div><span class="order-id">#${order.id}</span><span class="order-date">${new Date(order.created_at).toLocaleString('id-ID')}</span></div>
          <span class="order-status-badge ${cls[order.status]}">${label[order.status]}</span>
        </div>
        <div class="admin-order-body">
          <div class="order-customer-info"><strong>${Utils.escapeHtml(order.customer_name)}</strong><span>📱 ${Utils.escapeHtml(order.customer_phone)}</span></div>
          <div class="order-delivery-info"><span>${order.fulfillment_type === 'delivery' ? '🛵 Diantar' : '🏪 Ambil Sendiri'}</span>${order.address ? `<span class="address">📍 ${Utils.escapeHtml(order.address)}</span>` : ''}</div>
          <div class="order-items-list">${(order.items || []).map(i => `<div class="order-item-row"><span>${Utils.escapeHtml(i.name)}</span><span>${i.qty} × ${Utils.formatCurrency(i.price)}</span></div>`).join('')}</div>
          <div class="order-total-amount"><strong>Total: ${Utils.formatCurrency(order.total_amount)}</strong></div>
          ${order.payment_proof_url ? `<button class="btn btn-sm btn-info view-proof-btn" data-url="${order.payment_proof_url}"><i class="fa-solid fa-image"></i> Lihat Bukti</button>` : '<span class="no-proof">Tidak ada bukti</span>'}
          ${order.notes ? `<div class="order-note">📝 ${Utils.escapeHtml(order.notes)}</div>` : ''}
        </div>
        <div class="admin-order-footer">${actions.map(a => `<button class="btn btn-sm ${a.class} order-action-btn" data-id="${order.id}" data-action="${a.action}">${a.label}</button>`).join('')}</div>
      </div>
    `;
  },

  async updateStatus(id, newStatus) {
    if (!confirm(`Ubah status #${id} menjadi "${newStatus}"?`)) return;
    Utils.showLoading(true);
    try {
      await API.update('online_orders', { id: `eq.${id}` }, { status: newStatus });
      Utils.showToast(`Status #${id} diubah`, 'success');
      await this.load();
    } catch (err) {
      Utils.showToast('Gagal update status', 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  updateBadge() {
    const count = this.orders.filter(o => o.status === 'menunggu_konfirmasi').length;
    const badge = document.getElementById('adminOrdersBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline' : 'none';
    }
  }
};

// ============================================================
// ADMIN PRODUK
// ============================================================
const Admin = {
  isAdminMode: false,

  toggleAdminMode() {
    this.isAdminMode = !this.isAdminMode;
    document.getElementById('adminToggleBtn').classList.toggle('is-active', this.isAdminMode);
    document.getElementById('adminPanel').classList.toggle('is-open', this.isAdminMode);
    document.getElementById('adminOverlay').classList.toggle('is-open', this.isAdminMode);
    if (this.isAdminMode) this.loadAdminData();
  },

  close() {
    this.isAdminMode = false;
    document.getElementById('adminToggleBtn').classList.remove('is-active');
    document.getElementById('adminPanel').classList.remove('is-open');
    document.getElementById('adminOverlay').classList.remove('is-open');
  },

  async loadAdminData() {
    Utils.showLoading(true);
    try {
      const products = await API.fetchAll('products', { deleted_at: 'is.null', order: 'name.asc' });
      this.renderProductTable(products);
    } catch (err) {
      Utils.showToast('Gagal memuat data', 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  renderProductTable(products) {
    const c = document.getElementById('adminProductList');
    if (!c) return;
    c.innerHTML = `
      <div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary" id="adminAddProductBtn"><i class="fa-solid fa-plus"></i> Tambah Produk</button>
        <button class="btn btn-secondary" id="adminRefreshBtn"><i class="fa-solid fa-sync"></i> Refresh</button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Nama</th><th>Kategori</th><th style="text-align:right;">Harga</th><th style="text-align:center;">Stok</th><th style="text-align:center;">Aksi</th></tr></thead>
          <tbody>${products.map(p => `
            <tr>
              <td>${Utils.escapeHtml(p.name)}</td>
              <td>${Utils.escapeHtml(p.category || '-')}</td>
              <td style="text-align:right;">${Utils.formatCurrency(p.price)}</td>
              <td style="text-align:center;">${p.stock}</td>
              <td style="text-align:center;">
                <button class="admin-edit-btn" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button>
                <button class="admin-delete-btn" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
          `).join('')}</tbody>
        </table>
      </div>
    `;
    document.getElementById('adminAddProductBtn').addEventListener('click', () => this.showProductForm());
    document.getElementById('adminRefreshBtn').addEventListener('click', () => this.loadAdminData());
  },

  showProductForm(product = null) {
    // Simplified - just show toast
    Utils.showToast('Fitur ini sedang dikembangkan', 'info');
  }
};

// ============================================================
// ORDERS (Pelanggan)
// ============================================================
const Orders = {
  async open() {
    document.getElementById('ordersDrawer').classList.add('is-open');
    document.getElementById('ordersOverlay').classList.add('is-open');
    await this.load();
  },
  close() {
    document.getElementById('ordersDrawer').classList.remove('is-open');
    document.getElementById('ordersOverlay').classList.remove('is-open');
  },
  async load() {
    const body = document.getElementById('ordersBody');
    if (!body) return;
    if (!STATE.customerPhone) {
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada riwayat</p></div>`;
      return;
    }
    Utils.showLoading(true);
    try {
      const orders = await API.fetchAll('online_orders', {
        customer_phone: `eq.${STATE.customerPhone}`,
        order: 'created_at.desc',
        limit: 50
      });
      if (orders.length === 0) {
        body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada pesanan</p></div>`;
        return;
      }
      const label = {
        menunggu_konfirmasi: 'Menunggu Konfirmasi',
        dibayar: 'Dibayar',
        diproses: 'Diproses',
        siap: 'Siap',
        selesai: 'Selesai',
        dibatalkan: 'Dibatalkan'
      };
      body.innerHTML = orders.map(o => `
        <div class="order-card">
          <div class="order-card-header">
            <div><strong>#${o.id}</strong><div style="font-size:11px;color:var(--color-text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</div></div>
            <span class="order-status st-${o.status}">${label[o.status] || o.status}</span>
          </div>
          <div class="order-items-list">${(o.items || []).map(i => `${Utils.escapeHtml(i.name)} x${i.qty}`).join(', ')}</div>
          <div class="summary-row" style="margin-bottom:0;"><span>${o.fulfillment_type === 'delivery' ? '🛵 Diantar' : '🏪 Ambil Sendiri'}</span><strong>${Utils.formatCurrency(o.total_amount)}</strong></div>
        </div>
      `).join('');
    } catch (err) {
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat</p></div>`;
    } finally {
      Utils.showLoading(false);
    }
  }
};

// ============================================================
// ORDER STATUS (Auto Refresh)
// ============================================================
const OrderStatus = {
  intervalId: null,
  isWatching: false,
  startWatching() {
    if (this.isWatching) return;
    this.isWatching = true;
    this.checkStatus();
    this.intervalId = setInterval(() => this.checkStatus(), 30000);
  },
  stopWatching() {
    this.isWatching = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  },
  async checkStatus() {
    if (!STATE.customerPhone) return;
    try {
      const orders = await API.fetchAll('online_orders', {
        customer_phone: `eq.${STATE.customerPhone}`,
        order: 'created_at.desc',
        limit: 10
      });
      const pending = orders.filter(o => o.status === 'menunggu_konfirmasi' || o.status === 'diproses');
      const badge = document.getElementById('orderStatusBadge');
      if (badge) {
        badge.textContent = pending.length;
        badge.hidden = pending.length === 0;
      }
    } catch (e) {}
  }
};

// ============================================================
// INIT
// ============================================================
function checkSupabaseKey() {
  if (CONFIG.SUPABASE_ANON_KEY) return true;
  const key = prompt('Masukkan Supabase Anon Key:');
  if (key) {
    localStorage.setItem('toko_supabase_key', key.trim());
    CONFIG.SUPABASE_ANON_KEY = key.trim();
    return true;
  }
  return false;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Events
  document.getElementById('cartBtn').addEventListener('click', () => Cart.open());
  document.getElementById('closeCartBtn').addEventListener('click', () => Cart.close());
  document.getElementById('cartOverlay').addEventListener('click', () => Cart.close());
  document.getElementById('checkoutBtn').addEventListener('click', () => Checkout.open());
  document.getElementById('closeCheckoutBtn').addEventListener('click', () => Checkout.close());
  document.getElementById('checkoutOverlay').addEventListener('click', () => Checkout.close());
  document.getElementById('ordersBtn').addEventListener('click', () => Orders.open());
  document.getElementById('closeOrdersBtn').addEventListener('click', () => Orders.close());
  document.getElementById('ordersOverlay').addEventListener('click', () => Orders.close());
  document.getElementById('adminToggleBtn').addEventListener('click', () => Admin.toggleAdminMode());
  document.getElementById('closeAdminBtn').addEventListener('click', () => Admin.close());
  document.getElementById('adminOverlay').addEventListener('click', () => Admin.close());
  document.getElementById('adminOrdersBtn').addEventListener('click', () => AdminOrders.open());
  document.getElementById('closeAdminOrdersBtn').addEventListener('click', () => AdminOrders.close());
  document.getElementById('adminOrdersOverlay').addEventListener('click', () => AdminOrders.close());

  // Search
  document.getElementById('searchInput').addEventListener('input', (e) => {
    // Simple search for now
    console.log('Search:', e.target.value);
  });

  // Cek key
  if (!checkSupabaseKey()) {
    Utils.showToast('Butuh Supabase Key', 'error', 6000);
    return;
  }

  // Load
  await Catalog.load();
  Cart.render();

  console.log('✅ MBUN COLLECTION Online Store ready!');
});
