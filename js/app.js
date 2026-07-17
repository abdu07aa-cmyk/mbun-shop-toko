/* =====================================================
   MBUN COLLECTION — TOKO ONLINE — APP.JS
   Aplikasi belanja terpisah untuk pelanggan, terhubung ke
   Supabase project yang SAMA dengan aplikasi kasir internal
   (produk & stok otomatis sinkron), tapi kode & tampilannya
   sepenuhnya independen.
   ===================================================== */

/* ---------- KONFIGURASI ---------- */
const CONFIG = {
  // URL project HARUS sama persis dengan aplikasi kasir kamu.
  SUPABASE_URL: 'https://marelgsluzshkwxwcjod.supabase.co',
  // Anon key disimpan di localStorage supaya tidak perlu ditulis
  // manual di kode (sama seperti pola di aplikasi kasir).
  SUPABASE_ANON_KEY: localStorage.getItem('toko_supabase_key') || '',

  STORAGE_BUCKET_PRODUCT_IMAGES: 'product-images',
  STORAGE_BUCKET_PAYMENT_PROOFS: 'payment-proofs',

  CURRENCY_LOCALE: 'id-ID',
  LOW_STOCK_THRESHOLD: 5,

  // GANTI dengan info rekening/e-wallet asli toko kamu.
  PAYMENT_INFO: [
    { label: 'GoPay', value: '0897-3488-963 a.n. MBUN COLLECTION' },
    { label: 'Transfer BCA', value: '(isi nomor rekening BCA di sini) a.n. MBUN COLLECTION' },
  ],

  STORAGE_KEYS: {
    CART: 'toko_cart',
    CUSTOMER_NAME: 'toko_customer_name',
    CUSTOMER_PHONE: 'toko_customer_phone',
    SUPABASE_KEY: 'toko_supabase_key',
  },
};

CONFIG.SUPABASE_REST_URL = `${CONFIG.SUPABASE_URL}/rest/v1`;

/* ---------- STATE ---------- */
const STATE = {
  products: [],
  categories: [],
  activeCategory: 'all',
  searchQuery: '',
  cart: JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CART) || '[]'),
  customerName: localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME) || '',
  customerPhone: localStorage.getItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE) || '',
  fulfillmentType: 'pickup',
  paymentProofUrl: null,

  get cartCount() {
    return this.cart.reduce((sum, i) => sum + i.qty, 0);
  },
  get cartTotal() {
    return this.cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  },
  saveCart() {
    localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(this.cart));
  },
  saveIdentity(name, phone) {
    this.customerName = name;
    this.customerPhone = phone;
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME, name);
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE, phone);
  },
};

/* ---------- UTILS ---------- */
const Utils = {
  formatCurrency(value) {
    return new Intl.NumberFormat(CONFIG.CURRENCY_LOCALE, {
      style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
    }).format(Number(value) || 0).replace('IDR', 'Rp');
  },
  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = String(str ?? '');
    return div.innerHTML;
  },
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
  },
  showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast is-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  },
  showLoading(show) {
    const el = document.getElementById('loadingOverlay');
    if (el) el.hidden = !show;
  },
  compressImage(file, maxDimension = 800, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.onerror = () => reject(new Error('Gagal membaca file'));
      img.onload = () => {
        let { width, height } = img;
        if (width > height && width > maxDimension) { height = Math.round(height * (maxDimension / width)); width = maxDimension; }
        else if (height > maxDimension) { width = Math.round(width * (maxDimension / height)); height = maxDimension; }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gagal kompres gambar')), 'image/jpeg', quality);
      };
      img.onerror = () => reject(new Error('File bukan gambar yang valid'));
      reader.readAsDataURL(file);
    });
  },
};

/* ---------- API (Supabase REST + Storage) ---------- */
const API = {
  _headers(returnRepresentation = false) {
    const h = {
      'Content-Type': 'application/json',
      'apikey': CONFIG.SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
    };
    if (returnRepresentation) h['Prefer'] = 'return=representation';
    return h;
  },

  isConfigured() {
    return !!CONFIG.SUPABASE_ANON_KEY;
  },

  async fetchAll(table, params = {}) {
    const query = new URLSearchParams({ select: '*', ...params }).toString();
    const res = await fetch(`${CONFIG.SUPABASE_REST_URL}/${table}?${query}`, { headers: this._headers() });
    if (!res.ok) throw new Error(`Gagal memuat ${table}: ${res.status}`);
    return res.json();
  },

  async insert(table, payload) {
    const res = await fetch(`${CONFIG.SUPABASE_REST_URL}/${table}`, {
      method: 'POST', headers: this._headers(true), body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message || `Gagal menyimpan ke ${table}: ${res.status}`);
    }
    return res.json();
  },

  async update(table, filter, payload) {
    const query = new URLSearchParams(filter).toString();
    const res = await fetch(`${CONFIG.SUPABASE_REST_URL}/${table}?${query}`, {
      method: 'PATCH', headers: this._headers(true), body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Gagal memperbarui ${table}: ${res.status}`);
    return res.json();
  },

  async uploadImage(blob, bucket, filename) {
    const res = await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
        'Content-Type': blob.type || 'image/jpeg',
      },
      body: blob,
    });
    if (!res.ok) throw new Error('Gagal upload gambar');
    return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;
  },
};

/* ---------- KATALOG ---------- */
const Catalog = {
  async load() {
    Utils.showLoading(true);
    try {
      STATE.products = await API.fetchAll('products', { order: 'name.asc' });
      STATE.categories = [...new Set(STATE.products.map(p => p.category).filter(Boolean))];
      this.renderCategoryPills();
      this.render();
    } catch (err) {
      console.error(err);
      Utils.showToast('Gagal memuat produk. Cek koneksi internet.', 'error', 5000);
    } finally {
      Utils.showLoading(false);
    }
  },

  renderCategoryPills() {
    const container = document.getElementById('categoryPills');
    if (!container) return;
    const cats = ['all', ...STATE.categories];
    container.innerHTML = cats.map(c => `
      <button class="pill ${STATE.activeCategory === c ? 'is-active' : ''}" data-category="${Utils.escapeHtml(c)}">
        ${c === 'all' ? 'Semua' : Utils.escapeHtml(c)}
      </button>
    `).join('');

    container.querySelectorAll('[data-category]').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.activeCategory = btn.dataset.category;
        this.renderCategoryPills();
        this.render();
      });
    });
  },

  _filteredProducts() {
    let list = STATE.products;
    if (STATE.activeCategory !== 'all') list = list.filter(p => p.category === STATE.activeCategory);
    if (STATE.searchQuery.trim()) {
      const q = STATE.searchQuery.trim().toLowerCase();
      list = list.filter(p => p.name.toLowerCase().includes(q));
    }
    return list;
  },

  render() {
    const grid = document.getElementById('productGrid');
    const emptyEl = document.getElementById('catalogEmpty');
    if (!grid) return;

    const list = this._filteredProducts();

    if (list.length === 0) {
      grid.innerHTML = '';
      if (emptyEl) emptyEl.hidden = false;
      return;
    }
    if (emptyEl) emptyEl.hidden = true;

    grid.innerHTML = list.map(p => this._cardHtml(p)).join('');

    grid.querySelectorAll('[data-add-product]').forEach(card => {
      card.addEventListener('click', () => Cart.addItem(card.dataset.addProduct));
    });
  },

  _cardHtml(p) {
    const outOfStock = p.stock <= 0;
    const imageBlock = p.image_url
      ? `<img src="${p.image_url}" alt="" loading="lazy">`
      : `<div class="emoji-fallback">${p.emoji || '📦'}</div>`;

    return `
      <button class="product-card ${outOfStock ? 'is-out-of-stock' : ''}" data-add-product="${p.id}" ${outOfStock ? 'disabled' : ''}>
        <div class="product-card-image">
          ${imageBlock}
          ${outOfStock ? '<span class="stock-badge">Habis</span>' : ''}
        </div>
        <div class="product-card-body">
          <div class="product-card-name">${Utils.escapeHtml(p.name)}</div>
          <div class="product-card-price">${Utils.formatCurrency(p.price)}</div>
          <div class="product-card-stock">${outOfStock ? 'Stok habis' : `Stok: ${p.stock}`}</div>
          <div class="product-card-add">${outOfStock ? 'Habis' : '+ Keranjang'}</div>
        </div>
      </button>`;
  },
};

/* ---------- KERANJANG ---------- */
const Cart = {
  addItem(productId) {
    const product = STATE.products.find(p => String(p.id) === String(productId));
    if (!product) return;
    if (product.stock <= 0) { Utils.showToast('Stok habis', 'error'); return; }

    const existing = STATE.cart.find(i => i.productId === String(productId));
    if (existing) {
      if (existing.qty >= product.stock) { Utils.showToast('Stok tidak mencukupi', 'error'); return; }
      existing.qty += 1;
    } else {
      STATE.cart.push({
        productId: String(product.id), name: product.name, price: product.price,
        image_url: product.image_url || null, emoji: product.emoji || '📦', qty: 1,
      });
    }
    STATE.saveCart();
    this.render();
    Utils.showToast(`${product.name} ditambahkan`, 'success', 1500);
  },

  setQty(productId, qty) {
    const item = STATE.cart.find(i => i.productId === String(productId));
    const product = STATE.products.find(p => String(p.id) === String(productId));
    if (!item) return;
    if (qty <= 0) { STATE.cart = STATE.cart.filter(i => i.productId !== String(productId)); }
    else if (product && qty > product.stock) { Utils.showToast('Stok tidak mencukupi', 'warning'); return; }
    else { item.qty = qty; }
    STATE.saveCart();
    this.render();
  },

  open() {
    document.getElementById('cartDrawer')?.classList.add('is-open');
    document.getElementById('cartOverlay')?.classList.add('is-open');
    this.render();
  },
  close() {
    document.getElementById('cartDrawer')?.classList.remove('is-open');
    document.getElementById('cartOverlay')?.classList.remove('is-open');
  },

  render() {
    const badge = document.getElementById('cartBadge');
    if (badge) { badge.textContent = STATE.cartCount; badge.hidden = STATE.cartCount === 0; }

    const itemsEl = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const checkoutBtn = document.getElementById('checkoutBtn');
    if (!itemsEl) return;

    if (STATE.cart.length === 0) {
      itemsEl.innerHTML = `<div class="empty-state"><i class="fa-solid fa-cart-shopping"></i><p>Keranjang masih kosong</p></div>`;
    } else {
      itemsEl.innerHTML = STATE.cart.map(i => `
        <div class="cart-item">
          <div class="cart-item-image">${i.image_url ? `<img src="${i.image_url}" alt="">` : i.emoji}</div>
          <div class="cart-item-info">
            <div class="cart-item-name">${Utils.escapeHtml(i.name)}</div>
            <div class="cart-item-price">${Utils.formatCurrency(i.price)}</div>
          </div>
          <div class="qty-control">
            <button data-decr="${i.productId}"><i class="fa-solid fa-minus"></i></button>
            <span>${i.qty}</span>
            <button data-incr="${i.productId}"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>`).join('');

      itemsEl.querySelectorAll('[data-incr]').forEach(b => b.addEventListener('click', () => {
        const item = STATE.cart.find(i => i.productId === b.dataset.incr);
        this.setQty(b.dataset.incr, item.qty + 1);
      }));
      itemsEl.querySelectorAll('[data-decr]').forEach(b => b.addEventListener('click', () => {
        const item = STATE.cart.find(i => i.productId === b.dataset.decr);
        this.setQty(b.dataset.decr, item.qty - 1);
      }));
    }

    if (totalEl) totalEl.textContent = Utils.formatCurrency(STATE.cartTotal);
    if (checkoutBtn) checkoutBtn.disabled = STATE.cart.length === 0;
  },
};

/* ---------- CHECKOUT ---------- */
const Checkout = {
  open() {
    if (STATE.cart.length === 0) { Utils.showToast('Keranjang masih kosong', 'warning'); return; }
    Cart.close();
    document.getElementById('checkoutDrawer')?.classList.add('is-open');
    document.getElementById('checkoutOverlay')?.classList.add('is-open');
    this.render();
  },
  close() {
    document.getElementById('checkoutDrawer')?.classList.remove('is-open');
    document.getElementById('checkoutOverlay')?.classList.remove('is-open');
  },

  render() {
    const body = document.getElementById('checkoutBody');
    if (!body) return;

    // Kalau belum ada identitas (nama+HP), minta isi dulu sebelum lanjut.
    if (!STATE.customerName || !STATE.customerPhone) {
      body.innerHTML = `
        <div class="login-box">
          <i class="fa-solid fa-user"></i>
          <p style="margin-bottom: 16px; color: var(--color-text-secondary); font-size:14px;">
            Isi nama & nomor HP dulu, biar pesanan bisa dilacak dan kamu bisa lihat riwayat belanja.
          </p>
        </div>
        <div class="form-field"><span>Nama Lengkap</span><input type="text" id="ckName" placeholder="Nama kamu"></div>
        <div class="form-field"><span>Nomor HP (WhatsApp)</span><input type="tel" id="ckPhone" placeholder="08xxxxxxxxxx"></div>
        <button class="btn btn-primary btn-block" id="ckSaveIdentityBtn">Lanjutkan</button>
      `;
      document.getElementById('ckSaveIdentityBtn')?.addEventListener('click', () => {
        const name = document.getElementById('ckName')?.value.trim();
        const phone = document.getElementById('ckPhone')?.value.trim();
        if (!name || !phone) { Utils.showToast('Isi nama dan nomor HP dulu', 'error'); return; }
        STATE.saveIdentity(name, phone);
        this.render();
      });
      return;
    }

    body.innerHTML = `
      <div class="form-field" style="margin-bottom:20px;">
        <span>Pemesan</span>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong>${Utils.escapeHtml(STATE.customerName)} — ${Utils.escapeHtml(STATE.customerPhone)}</strong>
          <button class="btn btn-secondary" id="ckChangeIdentityBtn" style="padding:6px 10px; font-size:11px;">Ganti</button>
        </div>
      </div>

      <span style="font-size:13px; font-weight:600; color:var(--color-text-secondary); display:block; margin-bottom:10px;">Metode Pengambilan</span>
      <div class="fulfillment-options">
        <button class="fulfillment-option ${STATE.fulfillmentType === 'pickup' ? 'is-selected' : ''}" data-fulfillment="pickup">
          <i class="fa-solid fa-store"></i> Ambil Sendiri
        </button>
        <button class="fulfillment-option ${STATE.fulfillmentType === 'delivery' ? 'is-selected' : ''}" data-fulfillment="delivery">
          <i class="fa-solid fa-motorcycle"></i> Diantar
        </button>
      </div>

      <div id="addressFieldWrap" ${STATE.fulfillmentType !== 'delivery' ? 'hidden' : ''}>
        <div class="form-field">
          <span>Alamat Pengiriman</span>
          <textarea id="ckAddress" rows="3" placeholder="Alamat lengkap + patokan"></textarea>
        </div>
      </div>

      <div class="summary-row" style="margin-top:16px;"><span>Total Belanja</span><span>${Utils.formatCurrency(STATE.cartTotal)}</span></div>

      <div class="payment-info-box">
        <strong>Transfer ke salah satu rekening ini:</strong>
        ${CONFIG.PAYMENT_INFO.map(p => `<div class="payment-info-row"><span>${p.label}</span><span>${p.value}</span></div>`).join('')}
        <p style="margin-top:8px; color:var(--color-text-muted);">Upload bukti transfer di bawah (opsional saat ini, bisa juga diupload nanti dari menu "Pesanan Saya").</p>
      </div>

      <div class="upload-box" id="uploadProofBox">
        <input type="file" id="proofFileInput" accept="image/*" style="display:none;">
        ${STATE.paymentProofUrl
          ? `<img src="${STATE.paymentProofUrl}" alt="Bukti transfer">`
          : `<i class="fa-solid fa-camera" style="font-size:24px; display:block; margin-bottom:8px;"></i><span>Tap untuk upload bukti transfer</span>`}
      </div>

      <button class="btn btn-primary btn-block" id="ckSubmitBtn" style="margin-top:20px;">
        <i class="fa-solid fa-paper-plane"></i> Kirim Pesanan
      </button>
    `;

    document.getElementById('ckChangeIdentityBtn')?.addEventListener('click', () => {
      STATE.customerName = ''; STATE.customerPhone = '';
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME);
      localStorage.removeItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE);
      this.render();
    });

    body.querySelectorAll('[data-fulfillment]').forEach(btn => {
      btn.addEventListener('click', () => {
        STATE.fulfillmentType = btn.dataset.fulfillment;
        this.render();
      });
    });

    const uploadBox = document.getElementById('uploadProofBox');
    const fileInput = document.getElementById('proofFileInput');
    uploadBox?.addEventListener('click', () => fileInput?.click());
    fileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      Utils.showLoading(true);
      try {
        const blob = await Utils.compressImage(file, 800, 0.75);
        const filename = `bukti_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const url = await API.uploadImage(blob, CONFIG.STORAGE_BUCKET_PAYMENT_PROOFS, filename);
        STATE.paymentProofUrl = url;
        this.render();
        Utils.showToast('Bukti transfer terupload', 'success');
      } catch (err) {
        Utils.showToast('Gagal upload: ' + err.message, 'error');
      } finally {
        Utils.showLoading(false);
      }
    });

    document.getElementById('ckSubmitBtn')?.addEventListener('click', () => this.submit());
  },

  async submit() {
    const address = document.getElementById('ckAddress')?.value.trim() || '';
    if (STATE.fulfillmentType === 'delivery' && !address) {
      Utils.showToast('Isi alamat pengiriman dulu', 'error');
      return;
    }

    Utils.showLoading(true);
    try {
      const payload = {
        customer_name: STATE.customerName,
        customer_phone: STATE.customerPhone,
        fulfillment_type: STATE.fulfillmentType,
        address: STATE.fulfillmentType === 'delivery' ? address : null,
        items: STATE.cart,
        total_amount: STATE.cartTotal,
        payment_proof_url: STATE.paymentProofUrl,
        status: 'menunggu_konfirmasi',
      };
      await API.insert('online_orders', payload);

      STATE.cart = [];
      STATE.saveCart();
      STATE.paymentProofUrl = null;
      Cart.render();
      this.close();
      Utils.showToast('Pesanan berhasil dikirim! Menunggu konfirmasi toko.', 'success', 4000);
      Orders.open();
    } catch (err) {
      console.error(err);
      Utils.showToast('Gagal mengirim pesanan: ' + err.message, 'error', 5000);
    } finally {
      Utils.showLoading(false);
    }
  },
};

/* ---------- RIWAYAT PESANAN ---------- */
const Orders = {
  async open() {
    document.getElementById('ordersDrawer')?.classList.add('is-open');
    document.getElementById('ordersOverlay')?.classList.add('is-open');
    await this.load();
  },
  close() {
    document.getElementById('ordersDrawer')?.classList.remove('is-open');
    document.getElementById('ordersOverlay')?.classList.remove('is-open');
  },

  async load() {
    const body = document.getElementById('ordersBody');
    if (!body) return;

    if (!STATE.customerPhone) {
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada riwayat. Checkout dulu buat mulai belanja.</p></div>`;
      return;
    }

    Utils.showLoading(true);
    try {
      const orders = await API.fetchAll('online_orders', {
        customer_phone: `eq.${STATE.customerPhone}`,
        order: 'created_at.desc',
      });

      if (orders.length === 0) {
        body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada pesanan.</p></div>`;
        return;
      }

      const statusLabel = {
        menunggu_konfirmasi: 'Menunggu Konfirmasi', dibayar: 'Dibayar', diproses: 'Diproses',
        siap: 'Siap Diambil/Dikirim', selesai: 'Selesai', dibatalkan: 'Dibatalkan',
      };

      body.innerHTML = orders.map(o => `
        <div class="order-card">
          <div class="order-card-header">
            <div>
              <strong style="font-size:13px;">#${o.id}</strong>
              <div style="font-size:11px; color:var(--color-text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</div>
            </div>
            <span class="order-status st-${o.status}">${statusLabel[o.status] || o.status}</span>
          </div>
          <div class="order-items-list">
            ${(o.items || []).map(i => `${Utils.escapeHtml(i.name)} x${i.qty}`).join(', ')}
          </div>
          <div class="summary-row" style="margin-bottom:0;">
            <span>${o.fulfillment_type === 'delivery' ? '🛵 Diantar' : '🏪 Ambil Sendiri'}</span>
            <strong style="color:var(--color-text);">${Utils.formatCurrency(o.total_amount)}</strong>
          </div>
        </div>
      `).join('');
    } catch (err) {
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat riwayat pesanan.</p></div>`;
    } finally {
      Utils.showLoading(false);
    }
  },
};

/* ---------- INIT ---------- */
function initEvents() {
  document.getElementById('cartBtn')?.addEventListener('click', () => Cart.open());
  document.getElementById('closeCartBtn')?.addEventListener('click', () => Cart.close());
  document.getElementById('cartOverlay')?.addEventListener('click', () => Cart.close());
  document.getElementById('checkoutBtn')?.addEventListener('click', () => Checkout.open());

  document.getElementById('closeCheckoutBtn')?.addEventListener('click', () => Checkout.close());
  document.getElementById('checkoutOverlay')?.addEventListener('click', () => Checkout.close());

  document.getElementById('ordersBtn')?.addEventListener('click', () => Orders.open());
  document.getElementById('closeOrdersBtn')?.addEventListener('click', () => Orders.close());
  document.getElementById('ordersOverlay')?.addEventListener('click', () => Orders.close());

  document.getElementById('searchInput')?.addEventListener('input', Utils.debounce((e) => {
    STATE.searchQuery = e.target.value;
    Catalog.render();
  }, 250));
}

function checkSupabaseConfigured() {
  if (API.isConfigured()) return true;
  const key = prompt('Masukkan Supabase Anon Key (sama dengan yang dipakai aplikasi kasir):');
  if (key) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SUPABASE_KEY, key.trim());
    CONFIG.SUPABASE_ANON_KEY = key.trim();
    return true;
  }
  Utils.showToast('Aplikasi butuh Supabase Anon Key untuk berjalan', 'error', 6000);
  return false;
}

document.addEventListener('DOMContentLoaded', () => {
  initEvents();
  Cart.render();
  if (checkSupabaseConfigured()) {
    Catalog.load();
  }
});
