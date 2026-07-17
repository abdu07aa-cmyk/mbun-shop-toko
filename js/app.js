/* =====================================================
   MBUN COLLECTION — TOKO ONLINE — APP.JS (FINAL)
   ===================================================== */

/* ---------- KONFIGURASI ---------- */
const CONFIG = {
  SUPABASE_URL: 'https://marelgsluzshkwxwcjod.supabase.co',
  SUPABASE_ANON_KEY: localStorage.getItem('toko_supabase_key') || '',
  STORAGE_BUCKET_PRODUCT_IMAGES: 'product-images',
  STORAGE_BUCKET_PAYMENT_PROOFS: 'payment-proofs',
  CURRENCY_LOCALE: 'id-ID',
  LOW_STOCK_THRESHOLD: 5,
  PAYMENT_INFO: [
    { label: 'GoPay', value: '0897-3488-963 a.n. MBUN COLLECTION' },
    { label: 'Transfer BCA', value: '1234567890 a.n. MBUN COLLECTION' },
    { label: 'Transfer Mandiri', value: '9876543210 a.n. MBUN COLLECTION' },
  ],
  STORAGE_KEYS: {
    CART: 'toko_cart',
    CUSTOMER_NAME: 'toko_customer_name',
    CUSTOMER_PHONE: 'toko_customer_phone',
    SUPABASE_KEY: 'toko_supabase_key',
    ORDER_STATUSES: 'order_statuses',
  },
  ADMIN_PASSWORD: 'mbun123', // Ganti password admin di sini
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

/* ---------- API ---------- */
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

/* ---------- SECURITY ---------- */
const Security = {
  validatePhone(phone) {
    const clean = phone.replace(/\s/g, '');
    const pattern = /^(08|62|8)[0-9]{8,12}$/;
    return pattern.test(clean);
  },
  sanitizeInput(input) {
    if (!input) return '';
    return String(input).replace(/[<>]/g, '').trim();
  },
  validateAddress(address) {
    return address && address.trim().length >= 10;
  },
  validateImageFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    const maxSize = 2 * 1024 * 1024;
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Format file tidak didukung. Gunakan JPG, PNG, atau WEBP.');
    }
    if (file.size > maxSize) {
      throw new Error('Ukuran file terlalu besar. Maksimal 2MB.');
    }
    return true;
  }
};

/* ---------- LAZY LOADER ---------- */
const LazyLoader = {
  observer: null,
  init() {
    if ('IntersectionObserver' in window) {
      this.observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const img = entry.target;
            const src = img.dataset.src;
            if (src) {
              img.src = src;
              img.removeAttribute('data-src');
              img.classList.add('loaded');
            }
            this.observer.unobserve(img);
          }
        });
      }, { rootMargin: '50px' });
    }
  },
  observe(images) {
    if (this.observer) {
      images.forEach(img => this.observer.observe(img));
    } else {
      images.forEach(img => {
        if (img.dataset.src) img.src = img.dataset.src;
      });
    }
  }
};

/* ---------- PROMO ---------- */
const Promo = {
  activePromos: [],
  
  async loadPromos() {
    try {
      const result = await API.fetchAll('promos', {
        status: 'eq.active',
        limit: 5
      }).catch(() => []);
      this.activePromos = result;
    } catch {
      this.activePromos = [];
    }
  },

  applyDiscount(cartTotal) {
    let discount = 0;
    let appliedPromo = null;
    
    for (const promo of this.activePromos) {
      if (promo.type === 'percentage') {
        const disc = cartTotal * (promo.value / 100);
        if (disc > discount) {
          discount = disc;
          appliedPromo = promo;
        }
      } else if (promo.type === 'fixed') {
        if (promo.value > discount) {
          discount = promo.value;
          appliedPromo = promo;
        }
      }
    }
    
    if (appliedPromo && appliedPromo.max_discount) {
      discount = Math.min(discount, appliedPromo.max_discount);
    }
    
    return {
      discount,
      promo: appliedPromo,
      totalAfterDiscount: cartTotal - discount
    };
  },

  renderPromoBadge() {
    const container = document.getElementById('promoContainer');
    if (!container) return;
    
    if (this.activePromos.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    container.innerHTML = this.activePromos.map(p => `
      <div class="promo-badge">
        <i class="fa-solid fa-tag"></i>
        ${p.name}: ${p.type === 'percentage' ? `${p.value}%` : `Rp${p.value}`} OFF
      </div>
    `).join('');
  }
};

/* ---------- CATALOG ---------- */
const Catalog = {
  async load() {
    Utils.showLoading(true);
    try {
      STATE.products = await API.fetchAll('products', { 
        deleted_at: 'is.null',
        order: 'name.asc' 
      });
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

    const lazyImages = grid.querySelectorAll('.lazy-image');
    if (lazyImages.length) LazyLoader.observe(lazyImages);
  },

  _cardHtml(p) {
    const outOfStock = p.stock <= 0;
    const imageBlock = p.image_url
      ? `<img data-src="${p.image_url}" alt="" class="lazy-image">`
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

/* ---------- CART ---------- */
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

    if (!STATE.customerName || !STATE.customerPhone) {
      body.innerHTML = `
        <div class="login-box">
          <i class="fa-solid fa-user"></i>
          <p style="margin-bottom: 16px; color: var(--color-text-secondary); font-size:14px;">
            Isi nama & nomor HP dulu, biar pesanan bisa dilacak.
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
        if (!Security.validatePhone(phone)) { Utils.showToast('Nomor HP tidak valid', 'error'); return; }
        STATE.saveIdentity(name, phone);
        this.render();
      });
      return;
    }

    const discountResult = Promo.applyDiscount(STATE.cartTotal);
    const { discount, promo, totalAfterDiscount } = discountResult;

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
      ${discount > 0 ? `
        <div class="summary-row" style="color:var(--color-success);">
          <span>Diskon (${promo?.name || 'Promo'})</span>
          <span>-${Utils.formatCurrency(discount)}</span>
        </div>
        <div class="summary-row summary-total">
          <span>Total Setelah Diskon</span>
          <span>${Utils.formatCurrency(totalAfterDiscount)}</span>
        </div>
      ` : ''}

      <div class="payment-info-box">
        <strong>Transfer ke salah satu rekening ini:</strong>
        ${CONFIG.PAYMENT_INFO.map(p => `<div class="payment-info-row"><span>${p.label}</span><span>${p.value}</span></div>`).join('')}
        <p style="margin-top:8px; color:var(--color-text-muted); font-size:12px;">
          Upload bukti transfer di bawah
        </p>
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
      try {
        Security.validateImageFile(file);
        Utils.showLoading(true);
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
    if (STATE.fulfillmentType === 'delivery' && !Security.validateAddress(address)) {
      Utils.showToast('Isi alamat lengkap (minimal 10 karakter)', 'error');
      return;
    }

    Utils.showLoading(true);
    try {
      const discountResult = Promo.applyDiscount(STATE.cartTotal);
      const payload = {
        customer_name: STATE.customerName,
        customer_phone: STATE.customerPhone,
        fulfillment_type: STATE.fulfillmentType,
        address: STATE.fulfillmentType === 'delivery' ? address : null,
        items: STATE.cart,
        total_amount: discountResult.totalAfterDiscount,
        payment_proof_url: STATE.paymentProofUrl,
        status: 'menunggu_konfirmasi',
        notes: discountResult.promo ? `Diskon: ${discountResult.promo.name}` : null,
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

/* ---------- ORDERS ---------- */
const Orders = {
  async open() {
    document.getElementById('ordersDrawer')?.classList.add('is-open');
    document.getElementById('ordersOverlay')?.classList.add('is-open');
    await this.load();
    OrderStatus.startWatching();
  },
  close() {
    document.getElementById('ordersDrawer')?.classList.remove('is-open');
    document.getElementById('ordersOverlay')?.classList.remove('is-open');
    OrderStatus.stopWatching();
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
        limit: 50,
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
          ${o.notes ? `<div style="font-size:11px; color:var(--color-text-muted); margin-top:4px;">${Utils.escapeHtml(o.notes)}</div>` : ''}
        </div>
      `).join('');
    } catch (err) {
      body.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat riwayat pesanan.</p></div>`;
    } finally {
      Utils.showLoading(false);
    }
  },
};

/* ---------- ORDER STATUS ---------- */
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
        limit: 10,
      });

      const pendingOrders = orders.filter(o => 
        o.status === 'menunggu_konfirmasi' || o.status === 'diproses'
      );
      
      const badge = document.getElementById('orderStatusBadge');
      if (badge) {
        if (pendingOrders.length > 0) {
          badge.textContent = pendingOrders.length;
          badge.hidden = false;
        } else {
          badge.hidden = true;
        }
      }

      const previousStatuses = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.ORDER_STATUSES) || '{}');
      let hasChange = false;

      orders.forEach(o => {
        const prevStatus = previousStatuses[o.id];
        if (prevStatus && prevStatus !== o.status) {
          hasChange = true;
          const statusLabel = {
            menunggu_konfirmasi: 'Menunggu Konfirmasi',
            dibayar: 'Dibayar',
            diproses: 'Diproses',
            siap: 'Siap Diambil/Dikirim',
            selesai: 'Selesai',
            dibatalkan: 'Dibatalkan'
          };
          Utils.showToast(`Status pesanan #${o.id}: ${statusLabel[o.status] || o.status}`, 'info', 4000);
        }
        previousStatuses[o.id] = o.status;
      });

      if (hasChange) {
        localStorage.setItem(CONFIG.STORAGE_KEYS.ORDER_STATUSES, JSON.stringify(previousStatuses));
      }

      if (document.getElementById('ordersDrawer')?.classList.contains('is-open')) {
        await Orders.load();
      }

    } catch (err) {
      console.warn('Gagal cek status order:', err);
    }
  }
};

/* ---------- ADMIN PRODUK ---------- */
const Admin = {
  isAdminMode: false,
  
  toggleAdminMode() {
    this.isAdminMode = !this.isAdminMode;
    const btn = document.getElementById('adminToggleBtn');
    if (btn) {
      btn.classList.toggle('is-active', this.isAdminMode);
    }
    document.getElementById('adminPanel')?.classList.toggle('is-open', this.isAdminMode);
    document.getElementById('adminOverlay')?.classList.toggle('is-open', this.isAdminMode);
    if (this.isAdminMode) {
      this.loadAdminData();
    }
  },

  close() {
    this.isAdminMode = false;
    document.getElementById('adminToggleBtn')?.classList.remove('is-active');
    document.getElementById('adminPanel')?.classList.remove('is-open');
    document.getElementById('adminOverlay')?.classList.remove('is-open');
  },

  async loadAdminData() {
    Utils.showLoading(true);
    try {
      const products = await API.fetchAll('products', { 
        deleted_at: 'is.null',
        order: 'name.asc' 
      });
      this.renderProductTable(products);
    } catch (err) {
      Utils.showToast('Gagal memuat data admin: ' + err.message, 'error');
    } finally {
      Utils.showLoading(false);
    }
  },

  renderProductTable(products) {
    const container = document.getElementById('adminProductList');
    if (!container) return;
    
    container.innerHTML = `
      <div style="margin-bottom:16px; display:flex; gap:8px; flex-wrap:wrap;">
        <button class="btn btn-primary" id="adminAddProductBtn">
          <i class="fa-solid fa-plus"></i> Tambah Produk
        </button>
        <button class="btn btn-secondary" id="adminRefreshBtn">
          <i class="fa-solid fa-sync"></i> Refresh
        </button>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Nama</th>
              <th>Kategori</th>
              <th style="text-align:right;">Harga</th>
              <th style="text-align:center;">Stok</th>
              <th style="text-align:center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${products.map(p => `
              <tr>
                <td>${Utils.escapeHtml(p.name)}</td>
                <td>${Utils.escapeHtml(p.category || '-')}</td>
                <td style="text-align:right;">${Utils.formatCurrency(p.price)}</td>
                <td style="text-align:center;">
                  <span style="color:${p.stock <= 5 ? 'var(--color-danger)' : 'inherit'}">
                    ${p.stock}
                  </span>
                </td>
                <td style="text-align:center;">
                  <button class="admin-edit-btn" data-id="${p.id}" title="Edit">
                    <i class="fa-solid fa-pen"></i>
                  </button>
                  <button class="admin-delete-btn" data-id="${p.id}" title="Hapus">
                    <i class="fa-solid fa-trash"></i>
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;

    document.getElementById('adminAddProductBtn')?.addEventListener('click', () => this.showProductForm());
    document.getElementById('adminRefreshBtn')?.addEventListener('click', () => this.loadAdminData());
    
    container.querySelectorAll('.admin-edit-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const product = STATE.products.find(p => String(p.id) === String(id));
        if (product) this.showProductForm(product);
      });
    });

    container.querySelectorAll('.admin-delete-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Yakin ingin menghapus produk ini?')) return;
        const id = btn.dataset.id;
        Utils.showLoading(true);
        try {
          await API.update('products', { id: `eq.${id}` }, { deleted_at: new Date().toISOString() });
          Utils.showToast('Produk dihapus', 'success');
          await Catalog.load();
          await this.loadAdminData();
        } catch (err) {
          Utils.showToast('Gagal hapus: ' + err.message, 'error');
        } finally {
          Utils.showLoading(false);
        }
      });
    });
  },

  showProductForm(product = null) {
    const container = document.getElementById('adminProductList');
    if (!container) return;

    const isEdit = !!product;
    const formHtml = `
      <div class="admin-form-container">
        <h3 style="margin-bottom:12px;">${isEdit ? 'Edit' : 'Tambah'} Produk</h3>
        <div class="form-field">
          <span>Nama Produk *</span>
          <input type="text" id="adminProductName" value="${isEdit ? Utils.escapeHtml(product.name) : ''}">
        </div>
        <div class="form-field">
          <span>Kategori</span>
          <input type="text" id="adminProductCategory" value="${isEdit ? Utils.escapeHtml(product.category || '') : ''}">
        </div>
        <div class="form-field">
          <span>Harga (Rp) *</span>
          <input type="number" id="adminProductPrice" value="${isEdit ? product.price : ''}">
        </div>
        <div class="form-field">
          <span>Stok *</span>
          <input type="number" id="adminProductStock" value="${isEdit ? product.stock : ''}">
        </div>
        <div class="form-field">
          <span>Emoji</span>
          <input type="text" id="adminProductEmoji" value="${isEdit ? Utils.escapeHtml(product.emoji || '📦') : '📦'}">
        </div>
        <div class="form-field">
          <span>URL Gambar (opsional)</span>
          <input type="url" id="adminProductImage" value="${isEdit ? Utils.escapeHtml(product.image_url || '') : ''}">
        </div>
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button class="btn btn-primary" id="adminSaveProductBtn">
            <i class="fa-solid fa-save"></i> ${isEdit ? 'Update' : 'Simpan'}
          </button>
          <button class="btn btn-secondary" id="adminCancelFormBtn">Batal</button>
        </div>
      </div>
    `;

    const existingForm = container.querySelector('.admin-form-container');
    if (existingForm) {
      existingForm.outerHTML = formHtml;
    } else {
      const formContainer = document.createElement('div');
      formContainer.innerHTML = formHtml;
      container.prepend(formContainer.firstElementChild);
    }

    document.getElementById('adminSaveProductBtn')?.addEventListener('click', async () => {
      const name = document.getElementById('adminProductName')?.value.trim();
      const price = parseFloat(document.getElementById('adminProductPrice')?.value);
      const stock = parseInt(document.getElementById('adminProductStock')?.value);
      const category = document.getElementById('adminProductCategory')?.value.trim() || null;
      const emoji = document.getElementById('adminProductEmoji')?.value.trim() || '📦';
      const image_url = document.getElementById('adminProductImage')?.value.trim() || null;

      if (!name || !price || isNaN(stock)) {
        Utils.showToast('Isi nama, harga, dan stok dengan benar', 'error');
        return;
      }

      const payload = { name, price, stock, category, emoji, image_url };
      
      Utils.showLoading(true);
      try {
        if (isEdit) {
          await API.update('products', { id: `eq.${product.id}` }, payload);
          Utils.showToast('Produk berhasil diupdate', 'success');
        } else {
          await API.insert('products', payload);
          Utils.showToast('Produk berhasil ditambahkan', 'success');
        }
        await Catalog.load();
        await this.loadAdminData();
      } catch (err) {
        Utils.showToast('Gagal menyimpan: ' + err.message, 'error');
      } finally {
        Utils.showLoading(false);
      }
    });

    document.getElementById('adminCancelFormBtn')?.addEventListener('click', () => {
      this.loadAdminData();
    });
  }
};

/* ---------- ADMIN PESANAN ---------- */
const AdminOrders = {
  orders: [],
  currentStatus: 'all',
  
  open() {
    if (!this.checkAdminAccess()) return;
    
    document.getElementById('adminOrdersDrawer')?.classList.add('is-open');
    document.getElementById('adminOrdersOverlay')?.classList.add('is-open');
    this.load();
  },
  
  close() {
    document.getElementById('adminOrdersDrawer')?.classList.remove('is-open');
    document.getElementById('adminOrdersOverlay')?.classList.remove('is-open');
  },
  
  checkAdminAccess() {
    const password = localStorage.getItem('admin_password');
    if (password === CONFIG.ADMIN_PASSWORD) return true;
    
    const input = prompt('Masukkan password admin:');
    if (input === CONFIG.ADMIN_PASSWORD) {
      localStorage.setItem('admin_password', CONFIG.ADMIN_PASSWORD);
      return true;
    }
    Utils.showToast('Password salah!', 'error');
    return false;
  },
  
  async load() {
    Utils.showLoading(true);
    try {
      const orders = await API.fetchAll('online_orders', {
        order: 'created_at.desc',
        limit: 100
      });
      
      this.orders = orders || [];
      this.render();
      this.updateBadge();
      
    } catch (err) {
      console.error('Gagal load pesanan:', err);
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
        <div class="stat-card">
          <span class="stat-label">Total Pesanan</span>
          <span class="stat-number">${stats.total}</span>
        </div>
        <div class="stat-card stat-warning">
          <span class="stat-label">⏳ Menunggu</span>
          <span class="stat-number">${stats.menunggu}</span>
        </div>
        <div class="stat-card stat-primary">
          <span class="stat-label">📦 Diproses</span>
          <span class="stat-number">${stats.diproses}</span>
        </div>
        <div class="stat-card stat-success">
          <span class="stat-label">✅ Selesai</span>
          <span class="stat-number">${stats.selesai}</span>
        </div>
      </div>
      
      <div class="admin-order-filters">
        <button class="filter-btn ${this.currentStatus === 'all' ? 'active' : ''}" data-status="all">
          Semua (${stats.total})
        </button>
        <button class="filter-btn ${this.currentStatus === 'menunggu_konfirmasi' ? 'active' : ''}" data-status="menunggu_konfirmasi">
          ⏳ Menunggu (${stats.menunggu})
        </button>
        <button class="filter-btn ${this.currentStatus === 'dibayar' ? 'active' : ''}" data-status="dibayar">
          💳 Dibayar
        </button>
        <button class="filter-btn ${this.currentStatus === 'diproses' ? 'active' : ''}" data-status="diproses">
          📦 Diproses
        </button>
        <button class="filter-btn ${this.currentStatus === 'siap' ? 'active' : ''}" data-status="siap">
          ✅ Siap
        </button>
        <button class="filter-btn ${this.currentStatus === 'selesai' ? 'active' : ''}" data-status="selesai">
          🏁 Selesai
        </button>
        <button class="filter-btn ${this.currentStatus === 'dibatalkan' ? 'active' : ''}" data-status="dibatalkan">
          ❌ Dibatalkan
        </button>
      </div>
      
      <div class="admin-order-list">
        ${filtered.length === 0 ? `
          <div class="empty-state">
            <i class="fa-solid fa-inbox"></i>
            <p>Tidak ada pesanan</p>
          </div>
        ` : filtered.map(order => this._orderCardHtml(order)).join('')}
      </div>
    `;
    
    container.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.currentStatus = btn.dataset.status;
        this.render();
      });
    });
    
    container.querySelectorAll('.order-action-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const action = btn.dataset.action;
        await this.updateStatus(id, action);
      });
    });
    
    container.querySelectorAll('.view-proof-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url) window.open(url, '_blank');
      });
    });
  },
  
  _orderCardHtml(order) {
    const statusLabel = {
      menunggu_konfirmasi: '⏳ Menunggu Konfirmasi',
      dibayar: '💳 Dibayar',
      diproses: '📦 Diproses',
      siap: '✅ Siap',
      selesai: '🏁 Selesai',
      dibatalkan: '❌ Dibatalkan'
    };
    
    const statusClass = {
      menunggu_konfirmasi: 'status-warning',
      dibayar: 'status-info',
      diproses: 'status-primary',
      siap: 'status-success',
      selesai: 'status-success',
      dibatalkan: 'status-danger'
    };
    
    const actions = [];
    if (order.status === 'menunggu_konfirmasi') {
      actions.push({ label: '✅ Konfirmasi Bayar', action: 'dibayar', class: 'btn-success' });
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
          <div>
            <span class="order-id">#${order.id}</span>
            <span class="order-date">${new Date(order.created_at).toLocaleString('id-ID')}</span>
          </div>
          <span class="order-status-badge ${statusClass[order.status]}">${statusLabel[order.status]}</span>
        </div>
        
        <div class="admin-order-body">
          <div class="order-customer-info">
            <strong>${Utils.escapeHtml(order.customer_name)}</strong>
            <span>📱 ${Utils.escapeHtml(order.customer_phone)}</span>
          </div>
          
          <div class="order-delivery-info">
            <span>${order.fulfillment_type === 'delivery' ? '🛵 Diantar' : '🏪 Ambil Sendiri'}</span>
            ${order.address ? `<span class="address">📍 ${Utils.escapeHtml(order.address)}</span>` : ''}
          </div>
          
          <div class="order-items-list">
            ${(order.items || []).map(item => `
              <div class="order-item-row">
                <span>${Utils.escapeHtml(item.name)}</span>
                <span>${item.qty} × ${Utils.formatCurrency(item.price)}</span>
              </div>
            `).join('')}
          </div>
          
          <div class="order-total-amount">
            <strong>Total: ${Utils.formatCurrency(order.total_amount)}</strong>
          </div>
          
          ${order.payment_proof_url ? `
            <button class="btn btn-sm btn-info view-proof-btn" data-url="${order.payment_proof_url}">
              <i class="fa-solid fa-image"></i> Lihat Bukti Transfer
            </button>
          ` : '<span class="no-proof">Tidak ada bukti transfer</span>'}
          
          ${order.notes ? `<div class="order-note">📝 ${Utils.escapeHtml(order.notes)}</div>` : ''}
        </div>
        
        <div class="admin-order-footer">
          ${actions.map(action => `
            <button class="btn btn-sm ${action.class} order-action-btn" data-id="${order.id}" data-action="${action.action}">
              ${action.label}
            </button>
          `).join('')}
        </div>
      </div>
    `;
  },
  
  async updateStatus(orderId, newStatus) {
    if (!confirm(`Ubah status pesanan #${orderId} menjadi "${newStatus}"?`)) return;
    
    Utils.showLoading(true);
    try {
      await API.update('online_orders', 
        { id: `eq.${orderId}` }, 
        { 
          status: newStatus,
          updated_at: new Date().toISOString()
        }
      );
      
      if (newStatus === 'diproses') {
        await this.updateStock(orderId);
      }
      
      Utils.showToast(`Status pesanan #${orderId} berhasil diubah`, 'success');
      await this.load();
      
    } catch (err) {
      console.error('Gagal update status:', err);
      Utils.showToast('Gagal mengubah status', 'error');
    } finally {
      Utils.showLoading(false);
    }
  },
  
  async updateStock(orderId) {
    const order = this.orders.find(o => o.id === orderId);
    if (!order) return;
    
    try {
      for (const item of (order.items || [])) {
        const product = STATE.products.find(p => String(p.id) === String(item.productId));
        if (product) {
          const newStock = product.stock - item.qty;
          await API.update('products', 
            { id: `eq.${item.productId}` }, 
            { stock: Math.max(0, newStock) }
          );
        }
      }
      await Catalog.load();
      Utils.showToast('Stok produk berhasil diupdate', 'success');
    } catch (err) {
      console.error('Gagal update stok:', err);
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

/* ---------- INIT EVENTS ---------- */
function initEvents() {
  // Cart
  document.getElementById('cartBtn')?.addEventListener('click', () => Cart.open());
  document.getElementById('closeCartBtn')?.addEventListener('click', () => Cart.close());
  document.getElementById('cartOverlay')?.addEventListener('click', () => Cart.close());
  document.getElementById('checkoutBtn')?.addEventListener('click', () => Checkout.open());

  // Checkout
  document.getElementById('closeCheckoutBtn')?.addEventListener('click', () => Checkout.close());
  document.getElementById('checkoutOverlay')?.addEventListener('click', () => Checkout.close());

  // Orders
  document.getElementById('ordersBtn')?.addEventListener('click', () => Orders.open());
  document.getElementById('closeOrdersBtn')?.addEventListener('click', () => Orders.close());
  document.getElementById('ordersOverlay')?.addEventListener('click', () => Orders.close());

  // Admin Produk
  document.getElementById('adminToggleBtn')?.addEventListener('click', () => Admin.toggleAdminMode());
  document.getElementById('closeAdminBtn')?.addEventListener('click', () => Admin.close());
  document.getElementById('adminOverlay')?.addEventListener('click', () => Admin.close());

  // Admin Pesanan
  document.getElementById('adminOrdersBtn')?.addEventListener('click', () => AdminOrders.open());
  document.getElementById('closeAdminOrdersBtn')?.addEventListener('click', () => AdminOrders.close());
  document.getElementById('adminOrdersOverlay')?.addEventListener('click', () => AdminOrders.close());

  // Search
  document.getElementById('searchInput')?.addEventListener('input', Utils.debounce((e) => {
    STATE.searchQuery = e.target.value;
    Catalog.render();
  }, 250));
}

function checkSupabaseConfigured() {
  if (API.isConfigured()) return true;
  const key = prompt('Masukkan Supabase Anon Key:');
  if (key) {
    localStorage.setItem(CONFIG.STORAGE_KEYS.SUPABASE_KEY, key.trim());
    CONFIG.SUPABASE_ANON_KEY = key.trim();
    return true;
  }
  Utils.showToast('Aplikasi butuh Supabase Anon Key', 'error', 6000);
  return false;
}

/* ---------- AUTO REFRESH & NOTIFICATION ---------- */
let lastOrderCount = 0;

async function checkNewOrders() {
  try {
    const orders = await API.fetchAll('online_orders', {
      status: 'eq.menunggu_konfirmasi',
      limit: 100
    });
    
    const count = orders.length;
    if (count > lastOrderCount && lastOrderCount > 0) {
      Utils.showToast(`🔔 Ada ${count - lastOrderCount} pesanan baru!`, 'success', 5000);
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYWFhQ==');
        audio.play();
      } catch(e) {}
    }
    lastOrderCount = count;
    
    const badge = document.getElementById('adminOrdersBadge');
    if (badge) {
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline' : 'none';
    }
  } catch(e) {}
}

/* ---------- INIT ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  initEvents();
  LazyLoader.init();
  Cart.render();
  
  if (!checkSupabaseConfigured()) return;
  
  await Catalog.load();
  await Promo.loadPromos();
  Promo.renderPromoBadge();
  
  if (STATE.customerPhone) {
    OrderStatus.startWatching();
  }
  
  // Cek pesanan baru setiap 30 detik
  setInterval(checkNewOrders, 30000);
  checkNewOrders();
  
  console.log('🛍️ MBUN COLLECTION Online Store loaded!');
});

// Export untuk debugging
window.__MBUN = { STATE, API, Catalog, Cart, Checkout, Orders, Admin, AdminOrders, Promo, OrderStatus, Security, LazyLoader };
