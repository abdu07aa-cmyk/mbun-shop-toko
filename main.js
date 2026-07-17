/* =====================================================
   WARUNGKITA PRO MAX — MAIN.JS
   Titik masuk (entry point) aplikasi. Mengoordinasikan
   urutan inisialisasi semua modul, merender data awal,
   dan menyediakan fungsi-fungsi level-app seperti
   switchView, renderDashboard, dan form modal produk/pelanggan.
   ===================================================== */

const AppMain = {
  /* ===================================================
     INISIALISASI APLIKASI
     =================================================== */

  async init() {
    // SAFETY NET: pastikan loading screen SELALU hilang maks 5 detik,
    // apapun yang terjadi (error JS, fetch timeout, dll)
    const safetyTimer = setTimeout(() => {
      console.warn('[AppMain] Safety timeout — paksa sembunyikan loading screen');
      this._hideLoadingScreen();
      this.switchView('dashboard');
    }, 5000);

    try {
      // 1. Terapkan tema tersimpan
      document.body.setAttribute('data-theme', STATE.theme);

      // 2. Init tiap modul dengan try-catch individual
      //    agar error di satu modul tidak menghentikan seluruh inisialisasi
      const modules = [
        ['Offline',        () => Offline.init()],
        ['BarcodeModule',  () => BarcodeModule.init()],
        ['HoldCartModule', () => HoldCartModule.init()],
        ['CartModule',     () => CartModule.init()],
        ['ProductsModule', () => ProductsModule.init()],
        ['StockModule',    () => StockModule.init()],
        ['Notifications',  () => Notifications.init()],
        ['OnlineOrdersModule', () => OnlineOrdersModule.init()],
        ['ShiftModule',    () => ShiftModule.init()],
        ['EventsModule',   () => EventsModule.init()],
        ['AuthModule',     () => AuthModule.init()],
      ];

      for (const [name, fn] of modules) {
        try { fn(); }
        catch (err) { console.error(`[AppMain] Gagal inisialisasi ${name}:`, err); }
      }

      // 3. Muat data dengan timeout agar tidak hang
      await this._loadInitialData();

      // 4. Semua aman — batalkan safety timer & lanjut
      clearTimeout(safetyTimer);
      this._hideLoadingScreen();
      this.switchView('dashboard');
      AuthModule.promptCashierNameIfNeeded();

      console.info('[MBUN COLLECTION] Aplikasi siap ✅');

    } catch (err) {
      console.error('[AppMain] Error fatal saat init:', err);
      clearTimeout(safetyTimer);
      this._hideLoadingScreen();
      this.switchView('dashboard');
    }
  },

  async _loadInitialData() {
    // Bungkus fetch dengan timeout 8 detik agar tidak hang selamanya
    const withTimeout = (promise, ms = 8000) =>
      Promise.race([
        promise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), ms)
        ),
      ]);

    try {
      await withTimeout(API.testConnection());
    } catch {
      console.warn('[AppMain] testConnection timeout/gagal — lanjut dengan data lokal');
      STATE.isSupabaseConnected = false;
    }

    // allSettled: jika satu gagal, yang lain tetap jalan
    await Promise.allSettled([
      ProductsModule.load().catch(e => console.warn('[AppMain] products:', e.message)),
      this._loadTransactions().catch(e => console.warn('[AppMain] transactions:', e.message)),
      this._loadCustomers().catch(e => console.warn('[AppMain] customers:', e.message)),
      this._loadShifts().catch(e => console.warn('[AppMain] shifts:', e.message)),
    ]);

    // Jika belum ada produk sama sekali, muat produk bawaan sembako
    if (typeof seedProductsIfEmpty === "function") {
      await seedProductsIfEmpty();
    }
  },

  async _loadTransactions() {
    const transactions = await API.transactions.getAll();

    // FIX: sebelumnya transaksi dimuat TANPA detail item-nya sama sekali
    // (cuma ada di memori sesaat setelah baru bayar, hilang lagi setelah
    // refresh). Sekarang transaction_items ikut diambil dan digabungkan
    // ke transaksi masing-masing berdasarkan transaction_id, supaya
    // struk, kolom "Item" di tabel, dan fitur Retur selalu punya data
    // lengkap walau transaksinya dari sesi sebelumnya.
    let itemsByTrx = {};
    try {
      const allItems = await API.fetchAll(CONFIG.TABLES.TRANSACTION_ITEMS);
      itemsByTrx = allItems.reduce((acc, item) => {
        const key = String(item.transaction_id);
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});
    } catch (err) {
      console.warn('[AppMain] Gagal memuat transaction_items:', err.message);
    }

    const merged = transactions.map(t => ({
      ...t,
      items: t.items || itemsByTrx[String(t.id)] || [],
    }));

    STATE.setTransactions(merged);
  },

  async _loadCustomers() {
    const customers = await API.customers.getAll();
    STATE.setCustomers(customers);
  },

  async _loadShifts() {
    const shifts = await API.shifts.getAll();
    STATE.shifts = shifts;
    const openShift = shifts.find(s => s.status === 'open');
    if (openShift) STATE.setCurrentShift(openShift);
  },

  _hideLoadingScreen() {
    const screen = document.getElementById('loadingScreen');
    if (!screen) return;
    screen.style.opacity = '0';
    screen.style.transition = 'opacity 0.4s ease';
    setTimeout(() => screen.remove(), 400);
  },

  /* ===================================================
     NAVIGASI VIEW
     =================================================== */

  switchView(view) {
    document.querySelectorAll('.view').forEach(el => el.hidden = true);

    const target = document.getElementById('view-' + view);
    if (target) target.hidden = false;

    // Reset pencarian tiap ganti menu, biar nggak ada filter yang
    // "nyangkut" dari menu sebelumnya bikin bingung (mis. pindah dari
    // Produk yang lagi difilter ke Transaksi, tapi Transaksi ikut
    // kefilter kata yang sama tanpa disadari).
    STATE.searchQuery = '';
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) searchInput.value = '';

    STATE.setCurrentView(view);
    document.querySelectorAll('[data-view]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.view === view);
    });

    document.getElementById('sidebar')?.classList.remove('is-mobile-open');
    this._onViewEnter(view);
  },

  _onViewEnter(view) {
    switch (view) {
      case 'dashboard':   this.renderDashboard(); break;
      case 'kasir':       ProductsModule.renderProductGrid(); ProductsModule.renderCategoryPills(); break;
      case 'produk':      ProductsModule.renderProductsTable(); break;
      case 'transaksi':   this.renderTransactionsTable(); break;
      case 'stok':        StockModule.renderStockTable(); break;
      case 'pelanggan':   this.renderCustomersTable(); break;
      case 'shift':       ShiftModule.renderShiftCard(); break;
      case 'laporan':     this.renderLaporanView(); break;
      case 'pesanan-online': OnlineOrdersModule.load(); break;
      case 'pengaturan':  ProductsModule.renderCategoryManageList(); break;
    }
  },

  /* ===================================================
     RENDER: DASHBOARD
     =================================================== */

  renderDashboard() {
    this._renderStatCards();
    this.renderDashboardCharts();
    this.renderRecentTransactionsTable();
  },

  _renderStatCards() {
    const grid = document.getElementById('statGrid');
    if (!grid) return;

    const todayKey = new Date().toISOString().slice(0, 10);
    const todayTrx = STATE.transactions.filter(t => (t.created_at || '').slice(0, 10) === todayKey);
    const todayRevenue = todayTrx.reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);
    const lowStock = STATE.lowStockProducts.length;

    const stats = [
      { icon: 'fa-coins',             color: 'is-purple', value: Utils.formatCurrency(todayRevenue), label: 'Omzet Hari Ini' },
      { icon: 'fa-receipt',           color: 'is-green',  value: todayTrx.length,                    label: 'Transaksi Hari Ini' },
      { icon: 'fa-boxes-stacked',     color: 'is-orange', value: STATE.products.length,               label: 'Total Produk' },
      { icon: 'fa-triangle-exclamation', color: 'is-red', value: lowStock,                            label: 'Stok Menipis/Habis' },
    ];

    grid.innerHTML = stats.map(s => `
      <div class="stat-card">
        <div class="stat-card-icon ${s.color}"><i class="fa-solid ${s.icon}"></i></div>
        <div class="stat-card-value">${s.value}</div>
        <div class="stat-card-label">${s.label}</div>
      </div>`).join('');
  },

  renderDashboardCharts() {
    try {
      const trendData = Charts.buildSalesTrendData();
      Charts.renderSalesTrend(trendData);

      const topData = Charts.buildTopProductsData([]);
      const dummy = STATE.products.slice(0, 5).map(p => ({
        label: p.name,
        qty: Math.floor(Math.random() * 20) + 1,
      }));
      Charts.renderTopProducts(topData.length > 0 ? topData : dummy);
    } catch (err) {
      console.warn('[AppMain] Gagal render charts:', err);
    }
  },

  renderRecentTransactionsTable() {
    const tbody = document.querySelector('#recentTransactionsTable tbody');
    if (!tbody) return;

    const recent = STATE.transactions.slice(0, 10);

    if (recent.length === 0) {
      tbody.innerHTML = `<tr class="table-empty-row"><td colspan="6">Belum ada transaksi.</td></tr>`;
      return;
    }

    tbody.innerHTML = recent.map(t => `
      <tr>
        <td><small>${Utils.escapeHtml(String(t.id).slice(-8))}</small></td>
        <td>${Utils.formatRelativeTime(t.created_at)}</td>
        <td>${Utils.escapeHtml(t.customer_name || 'Umum')}</td>
        <td>${Utils.escapeHtml(t.payment_method || '-')}</td>
        <td>${Utils.formatCurrency(t.total_amount)}</td>
        <td>${t.total_amount < 0
          ? '<span class="badge badge-danger">Retur</span>'
          : '<span class="badge badge-success">Lunas</span>'}
        </td>
      </tr>`).join('');
  },

  /* ===================================================
     RENDER: TABEL TRANSAKSI
     =================================================== */

  renderTransactionsTable() {
    const tbody = document.querySelector('#transactionsTable tbody');
    if (!tbody) return;

    const q = STATE.searchQuery.trim().toLowerCase();
    const filtered = !q ? STATE.transactions : STATE.transactions.filter(t =>
      String(t.id).toLowerCase().includes(q) ||
      (t.customer_name || '').toLowerCase().includes(q) ||
      (t.payment_method || '').toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr class="table-empty-row"><td colspan="9">${q ? 'Tidak ada transaksi yang cocok dengan pencarian.' : 'Belum ada riwayat transaksi.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => `
      <tr>
        <td><small>${Utils.escapeHtml(String(t.id).slice(-10))}</small></td>
        <td>${Utils.formatDateTime(t.created_at)}</td>
        <td>${Utils.escapeHtml(AuthModule.getCashierName())}</td>
        <td>${Utils.escapeHtml(t.customer_name || 'Umum')}</td>
        <td>${t.items ? t.items.length : '-'}</td>
        <td>${Utils.escapeHtml(t.payment_method || '-')}</td>
        <td>${Utils.formatCurrency(t.total_amount)}</td>
        <td>${t.total_amount < 0
          ? '<span class="badge badge-danger">Retur</span>'
          : '<span class="badge badge-success">Lunas</span>'}
        </td>
        <td style="display:flex; gap: var(--space-2);">
          <button class="icon-btn" data-view-transaction="${t.id}" title="Detail Transaksi">
            <i class="fa-solid fa-eye"></i>
          </button>
          ${(t.total_amount >= 0 && t.payment_status !== 'refunded') ? `
            <button class="icon-btn" data-return-transaction="${t.id}" title="Retur">
              <i class="fa-solid fa-rotate-left"></i>
            </button>` : ''}
          <button class="icon-btn" data-delete-transaction="${t.id}" title="Hapus (mis. transaksi uji coba)">
            <i class="fa-solid fa-trash"></i>
          </button>
        </td>
      </tr>`).join('');

    Utils.qsa('[data-view-transaction]').forEach(btn => {
      btn.addEventListener('click', () => this.openTransactionDetailModal(btn.dataset.viewTransaction));
    });

    Utils.qsa('[data-return-transaction]').forEach(btn => {
      btn.addEventListener('click', () => {
        const trx = STATE.transactions.find(t => String(t.id) === btn.dataset.returnTransaction);
        // FIX: sebelumnya memanggil ReturnsModule.openReturnDetailModal
        // yang TIDAK PERNAH ADA di returns.js (nama fungsi salah ketik),
        // sehingga tombol ini selalu gagal diam-diam. Nama yang benar
        // adalah openReturnItemsModal.
        if (trx) ReturnsModule.openReturnItemsModal(trx);
      });
    });

    Utils.qsa('[data-delete-transaction]').forEach(btn => {
      btn.addEventListener('click', () => this._deleteTransaction(btn.dataset.deleteTransaction));
    });
  },

  /** Menampilkan rincian item lengkap dari 1 transaksi */
  openTransactionDetailModal(transactionId) {
    const t = STATE.transactions.find(tr => String(tr.id) === String(transactionId));
    if (!t) return;

    const itemsHtml = (t.items || []).map(item => {
      const product = STATE.products.find(p => String(p.id) === String(item.product_id));
      return `
        <div class="receipt-row">
          <span>${Utils.escapeHtml(product?.name || 'Produk')} x${item.quantity}</span>
          <span>${Utils.formatCurrency(item.price * item.quantity)}</span>
        </div>`;
    }).join('') || '<p style="color:var(--color-text-muted); font-size: var(--font-size-sm); text-align:center; padding: var(--space-4) 0;">Detail item tidak tersedia untuk transaksi ini.</p>';

    ModalManager.open('transactionDetail', {
      title: 'Detail Transaksi',
      size: 'sm',
      bodyHtml: `
        <div class="receipt">
          <div class="receipt-row"><span>Waktu</span><span>${Utils.formatDateTime(t.created_at)}</span></div>
          <div class="receipt-row"><span>Pelanggan</span><span>${Utils.escapeHtml(t.customer_name || 'Umum')}</span></div>
          <div class="receipt-row"><span>Metode</span><span>${Utils.escapeHtml((t.payment_method || '-').toUpperCase())}</span></div>
          <div class="receipt-divider"></div>
          ${itemsHtml}
          <div class="receipt-divider"></div>
          <div class="receipt-row"><span>Diskon</span><span>-${Utils.formatCurrency(t.discount || 0)}</span></div>
          <div class="receipt-total-row"><span>Total</span><span>${Utils.formatCurrency(t.total_amount)}</span></div>
        </div>`,
      footerHtml: `<button class="btn btn-secondary btn-block" data-modal-close>Tutup</button>`,
    });
  },

  /**
   * Menghapus transaksi beserta transaction_items terkait. Berguna untuk
   * membersihkan transaksi uji coba yang tidak mencerminkan data asli.
   * @param {string} id
   */
  async _deleteTransaction(id) {
    const trx = STATE.transactions.find(t => String(t.id) === String(id));
    if (!trx) return;

    const confirmed = window.confirm(
      `Hapus transaksi ${Utils.formatCurrency(trx.total_amount)} (${Utils.formatDateTime(trx.created_at)})?\n\nIni tidak bisa dibatalkan.`
    );
    if (!confirmed) return;

    // PROTEKSI PIN: hapus transaksi adalah aksi permanen & sensitif,
    // wajib verifikasi PIN dulu supaya tidak sembarang orang bisa hapus.
    AuthModule.requirePin('menghapus transaksi ini', async () => {
      try {
        await API.transactionItems.deleteByTransaction(id);
        await API.transactions.delete(id);

        STATE.setTransactions(STATE.transactions.filter(t => String(t.id) !== String(id)));
        Utils.showToast('Transaksi dihapus', 'success');
      } catch (err) {
        console.error('[AppMain] Gagal menghapus transaksi:', err);
        Utils.showToast('Gagal menghapus transaksi, coba lagi', 'error');
      }
    });
  },

  /* ===================================================
     RENDER: TABEL PELANGGAN
     =================================================== */

  renderCustomersTable() {
    const tbody = document.querySelector('#customersTable tbody');
    if (!tbody) return;

    const q = STATE.searchQuery.trim().toLowerCase();
    const filtered = !q ? STATE.customers : STATE.customers.filter(c =>
      c.name.toLowerCase().includes(q) || (c.phone || '').toLowerCase().includes(q)
    );

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr class="table-empty-row"><td colspan="5">${q ? 'Tidak ada pelanggan yang cocok dengan pencarian.' : 'Belum ada data pelanggan.'}</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(c => `
      <tr>
        <td>${Utils.escapeHtml(c.name)}</td>
        <td>${Utils.escapeHtml(c.phone || '-')}</td>
        <td><span class="badge badge-info">${c.points || 0} poin</span></td>
        <td>${Utils.formatDate(c.created_at)}</td>
        <td>
          <button class="icon-btn" data-view-customer-history="${c.id}" aria-label="Riwayat Belanja" title="Riwayat Belanja">
            <i class="fa-solid fa-clock-rotate-left"></i>
          </button>
          <button class="icon-btn" data-edit-customer="${c.id}" aria-label="Edit">
            <i class="fa-solid fa-pen"></i>
          </button>
        </td>
      </tr>`).join('');

    Utils.qsa('[data-view-customer-history]').forEach(btn => {
      btn.addEventListener('click', () => this.openCustomerHistoryModal(btn.dataset.viewCustomerHistory));
    });
  },

  /** Menampilkan seluruh riwayat transaksi milik 1 pelanggan tertentu */
  openCustomerHistoryModal(customerId) {
    const customer = STATE.customers.find(c => String(c.id) === String(customerId));
    if (!customer) return;

    const trxList = STATE.transactions
      .filter(t => t.customer_name === customer.name)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const totalSpent = trxList.reduce((sum, t) => sum + (Number(t.total_amount) || 0), 0);

    const bodyHtml = trxList.length === 0
      ? `<div class="cart-empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada riwayat transaksi untuk pelanggan ini</p></div>`
      : `
        <p style="margin-bottom: var(--space-4); font-size: var(--font-size-sm); color: var(--color-text-secondary);">
          ${trxList.length} transaksi &middot; Total belanja ${Utils.formatCurrency(totalSpent)}
        </p>
        ${trxList.map(t => `
          <div class="card" style="margin-bottom: var(--space-3); padding: var(--space-4);">
            <div style="display:flex; justify-content:space-between; margin-bottom: var(--space-2); gap: var(--space-2);">
              <strong style="font-size: var(--font-size-sm);">${Utils.formatDateTime(t.created_at)}</strong>
              <strong style="font-size: var(--font-size-sm); flex-shrink:0;">${Utils.formatCurrency(t.total_amount)}</strong>
            </div>
            <div style="font-size: var(--font-size-xs); color: var(--color-text-secondary);">
              ${(t.items || []).map(item => {
                const product = STATE.products.find(p => String(p.id) === String(item.product_id));
                return `${Utils.escapeHtml(product?.name || 'Produk')} x${item.quantity}`;
              }).join(', ') || 'Detail item tidak tersedia'}
            </div>
          </div>
        `).join('')}
      `;

    ModalManager.open('customerHistory', {
      title: `Riwayat Belanja: ${Utils.escapeHtml(customer.name)}`,
      size: 'md',
      bodyHtml,
      footerHtml: `<button class="btn btn-secondary btn-block" data-modal-close>Tutup</button>`,
    });
  },

  /* ===================================================
     RENDER: LAPORAN
     =================================================== */

  renderLaporanView() {
    const paidTrx = STATE.transactions.filter(t => t.total_amount > 0);
    const totalRevenue = paidTrx.reduce((sum, t) => sum + Number(t.total_amount), 0);

    // FIX: sebelumnya laba cuma diestimasi 40% dari omzet secara asal
    // (angka tetap, tidak berdasarkan data apapun). Sekarang dihitung
    // RIIL dari selisih harga jual vs modal (modal_price) tiap item
    // yang beneran terjual.
    let totalCost = 0;
    paidTrx.forEach(t => {
      (t.items || []).forEach(item => {
        const product = STATE.products.find(p => String(p.id) === String(item.product_id));
        totalCost += (Number(product?.modal_price) || 0) * Number(item.quantity || 0);
      });
    });
    const totalProfit = totalRevenue - totalCost;
    const marginPercent = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

    // Perbandingan omzet minggu ini vs minggu lalu
    const now = new Date();
    const startOfThisWeek = new Date(now);
    startOfThisWeek.setHours(0, 0, 0, 0);
    startOfThisWeek.setDate(now.getDate() - now.getDay());
    const startOfLastWeek = new Date(startOfThisWeek);
    startOfLastWeek.setDate(startOfThisWeek.getDate() - 7);

    const thisWeekRevenue = paidTrx
      .filter(t => new Date(t.created_at) >= startOfThisWeek)
      .reduce((sum, t) => sum + Number(t.total_amount), 0);
    const lastWeekRevenue = paidTrx
      .filter(t => { const d = new Date(t.created_at); return d >= startOfLastWeek && d < startOfThisWeek; })
      .reduce((sum, t) => sum + Number(t.total_amount), 0);
    const weekChangePercent = lastWeekRevenue > 0
      ? Math.round(((thisWeekRevenue - lastWeekRevenue) / lastWeekRevenue) * 100)
      : (thisWeekRevenue > 0 ? 100 : 0);

    const grid = document.getElementById('reportStatGrid');
    if (grid) {
      grid.innerHTML = `
        <div class="stat-card">
          <div class="stat-card-icon is-purple"><i class="fa-solid fa-arrow-trend-up"></i></div>
          <div class="stat-card-value">${Utils.formatCurrency(totalRevenue)}</div>
          <div class="stat-card-label">Total Pendapatan</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon is-orange"><i class="fa-solid fa-box"></i></div>
          <div class="stat-card-value">${Utils.formatCurrency(totalCost)}</div>
          <div class="stat-card-label">Total Modal (HPP)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon is-green"><i class="fa-solid fa-hand-holding-dollar"></i></div>
          <div class="stat-card-value">${Utils.formatCurrency(totalProfit)}</div>
          <div class="stat-card-label">Laba Bersih (margin ${marginPercent}%)</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon ${weekChangePercent >= 0 ? 'is-green' : 'is-red'}"><i class="fa-solid fa-calendar-week"></i></div>
          <div class="stat-card-value">${Utils.formatCurrency(thisWeekRevenue)}</div>
          <div class="stat-card-label">
            Omzet Minggu Ini<br>
            <span class="stat-card-delta ${weekChangePercent >= 0 ? 'is-up' : 'is-down'}">
              <i class="fa-solid ${weekChangePercent >= 0 ? 'fa-arrow-up' : 'fa-arrow-down'}"></i> ${Math.abs(weekChangePercent)}% vs minggu lalu
            </span>
          </div>
        </div>`;
    }

    try {
      Charts.renderProfitLoss(this._computeDailyProfitData());
    } catch (err) {
      console.warn('[AppMain] Gagal render profit chart:', err);
    }

    this._renderTopProfitProducts(paidTrx);
  },

  /** Hitung revenue/modal/laba RIIL per hari, 7 hari terakhir */
  _computeDailyProfitData() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d);
    }

    return days.map(day => {
      const dayKey = day.toISOString().slice(0, 10);
      const dayTrx = STATE.transactions.filter(t =>
        t.total_amount > 0 && (t.created_at || '').slice(0, 10) === dayKey
      );

      let revenue = 0, cost = 0;
      dayTrx.forEach(t => {
        revenue += Number(t.total_amount) || 0;
        (t.items || []).forEach(item => {
          const product = STATE.products.find(p => String(p.id) === String(item.product_id));
          cost += (Number(product?.modal_price) || 0) * Number(item.quantity || 0);
        });
      });

      return {
        label: Utils.formatDate(day, { day: 'numeric', month: 'short' }),
        revenue,
        cost,
        profit: revenue - cost,
      };
    });
  },

  /** Menampilkan 5 produk dengan kontribusi laba terbesar */
  _renderTopProfitProducts(paidTrx) {
    const container = document.getElementById('topProfitList');
    if (!container) return;

    const profitByProduct = {};
    paidTrx.forEach(t => {
      (t.items || []).forEach(item => {
        const product = STATE.products.find(p => String(p.id) === String(item.product_id));
        if (!product) return;
        const margin = (Number(item.price) - (Number(product.modal_price) || 0)) * Number(item.quantity || 0);
        profitByProduct[product.name] = (profitByProduct[product.name] || 0) + margin;
      });
    });

    const sorted = Object.entries(profitByProduct).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (sorted.length === 0) {
      container.innerHTML = `<p style="color: var(--color-text-muted); font-size: var(--font-size-sm);">Belum ada data transaksi yang cukup.</p>`;
      return;
    }

    container.innerHTML = sorted.map(([name, profit], i) => `
      <div class="summary-row">
        <span>${i + 1}. ${Utils.escapeHtml(name)}</span>
        <strong style="color: var(--color-success);">${Utils.formatCurrency(profit)}</strong>
      </div>
    `).join('');
  },

  /* ===================================================
     MODAL FORM: TAMBAH / EDIT PRODUK
     =================================================== */

  openProductFormModal(productId = null) {
    const isEdit = productId !== null;
    // FIX: productId dari editBtn.dataset selalu berupa string (atribut
    // HTML), sedangkan p.id di STATE.products bisa berupa number/bigint
    // (tergantung tipe kolom id di database). Perbandingan "===" gagal
    // kalau tipenya beda meski nilainya sama (1 !== "1"), sehingga
    // produk "tidak ketemu" dan form edit tampil kosong. Disamakan
    // dulu jadi string di kedua sisi biar selalu cocok.
    const product = isEdit ? STATE.products.find(p => String(p.id) === String(productId)) : null;
    const currentEmoji = product?.emoji || '📦';

    ModalManager.open('productForm', {
      title: isEdit ? 'Edit Produk: ' + (product?.name || '') : 'Tambah Produk Baru',
      size: 'lg',
      bodyHtml: `
        <!-- ===== FOTO PRODUK ===== -->
        <div style="margin-bottom: var(--space-5);">
          <span style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); display:block; margin-bottom: var(--space-2);">
            Foto Produk
          </span>
          <div style="display:flex; align-items:center; gap: var(--space-3);">
            <div id="productImagePreview" style="width:72px; height:72px; border-radius: var(--radius-md); overflow:hidden; background: var(--color-surface-alt); border: 2px solid var(--color-border); display:flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${product?.image_url
                ? `<img src="${product.image_url}" alt="" style="width:100%; height:100%; object-fit:cover;">`
                : `<span style="font-size:36px;">${currentEmoji}</span>`}
            </div>
            <div style="flex:1;">
              <input type="file" id="pfImageFile" accept="image/*" style="display:none;">
              <button type="button" class="btn btn-secondary" id="pfImageUploadBtn">
                <i class="fa-solid fa-camera"></i> ${product?.image_url ? 'Ganti Foto' : 'Upload Foto'}
              </button>
              ${product?.image_url ? `<button type="button" class="link-btn-danger" id="pfImageRemoveBtn" style="margin-left: var(--space-3);">Hapus Foto</button>` : ''}
              <p style="font-size: var(--font-size-xs); color: var(--color-text-muted); margin-top: var(--space-2);">
                Kalau belum ada foto, ikon emoji di bawah dipakai sebagai gantinya.
              </p>
            </div>
          </div>
          <input type="hidden" id="pfImageUrl" value="${product?.image_url || ''}">
        </div>

        <!-- ===== EMOJI PICKER (fallback kalau belum ada foto) ===== -->
        <div style="margin-bottom: var(--space-5);">
          <span style="font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); color: var(--color-text-secondary); display:block; margin-bottom: var(--space-2);">
            Ikon Emoji (fallback kalau belum ada foto)
          </span>

          <!-- Preview emoji terpilih -->
          <div style="display:flex; align-items:center; gap: var(--space-3); margin-bottom: var(--space-3);">
            <div id="emojiPreview" style="width:56px; height:56px; font-size:36px; display:flex; align-items:center; justify-content:center; background: var(--color-surface-alt); border: 2px solid var(--color-primary); border-radius: var(--radius-md);">
              ${currentEmoji}
            </div>
            <div>
              <div style="font-size: var(--font-size-sm); font-weight: var(--font-weight-semibold);">Ikon terpilih</div>
              <div style="font-size: var(--font-size-xs); color: var(--color-text-muted);">Ketuk ikon di bawah untuk memilih</div>
            </div>
          </div>

          <!-- Filter kategori ikon -->
          <div style="display:flex; gap: var(--space-2); flex-wrap:wrap; margin-bottom: var(--space-3);" id="emojiCatFilter">
            <button class="pill is-active" data-emoji-cat="all">Semua</button>
            <button class="pill" data-emoji-cat="sembako">🌾 Sembako</button>
            <button class="pill" data-emoji-cat="minuman">🥤 Minuman</button>
            <button class="pill" data-emoji-cat="snack">🍿 Snack</button>
            <button class="pill" data-emoji-cat="dapur">🍳 Dapur</button>
            <button class="pill" data-emoji-cat="kebersihan">🧼 Kebersihan</button>
            <button class="pill" data-emoji-cat="kesehatan">💊 Kesehatan</button>
            <button class="pill" data-emoji-cat="rokok">🚬 Rokok</button>
            <button class="pill" data-emoji-cat="lainnya">📦 Lainnya</button>
          </div>

          <!-- Grid emoji -->
          <div id="emojiPickerGrid" style="display:flex; flex-wrap:wrap; gap: var(--space-2); max-height: 180px; overflow-y:auto; padding: var(--space-2); background: var(--color-surface-alt); border-radius: var(--radius-md); border: 1px solid var(--color-border);">
          </div>
        </div>

        <!-- ===== FORM FIELDS ===== -->
        <div class="form-grid">
          <label class="form-field">
            <span>Nama Produk *</span>
            <input type="text" id="pfName" value="${Utils.escapeHtml(product?.name || '')}" placeholder="mis. Beras Premium 5kg">
          </label>
          <label class="form-field">
            <span>Kategori</span>
            <select id="pfCategory" class="select-field">
              <option value="">-- Pilih Kategori --</option>
              ${ProductsModule.getCategories().map(c =>
                `<option value="${c}" ${(product?.category||'') === c ? 'selected' : ''}>${c}</option>`
              ).join('')}
            </select>
          </label>
          <label class="form-field">
            <span>Tanggal Kadaluarsa (opsional)</span>
            <input type="date" id="pfExpiryDate" value="${product?.expiry_date || ''}">
          </label>
          <label class="form-field">
            <span>Harga Jual *</span>
            <input type="number" id="pfPrice" value="${product?.price || ''}" placeholder="0" min="0">
          </label>
          <label class="form-field">
            <span>Harga Modal (HPP)</span>
            <input type="number" id="pfModalPrice" value="${product?.modal_price || ''}" placeholder="0" min="0">
          </label>
          <label class="form-field">
            <span>Stok</span>
            <input type="number" id="pfStock" value="${product?.stock ?? 0}" placeholder="0" min="0">
          </label>
          <label class="form-field">
            <span>Satuan</span>
            <select id="pfUnit" class="select-field">
              ${['pcs','kg','gram','liter','ml','dus','karton','lusin','pack','botol','bungkus','sachet','renteng','ikat','buah'].map(u =>
                `<option value="${u}" ${(product?.unit||'pcs') === u ? 'selected' : ''}>${u}</option>`
              ).join('')}
            </select>
          </label>
          <label class="form-field" style="grid-column: 1 / -1;">
            <span>Barcode (opsional)</span>
            <div style="display:flex; gap: var(--space-2);">
              <input type="text" id="pfBarcode" value="${Utils.escapeHtml(product?.barcode || '')}" placeholder="Pindai atau ketik manual" style="flex:1;">
              <button type="button" class="icon-btn" id="scanProductBarcodeBtn" aria-label="Scan barcode" title="Scan barcode">
                <i class="fa-solid fa-barcode"></i>
              </button>
            </div>
          </label>
        </div>
        <input type="hidden" id="pfEmoji" value="${currentEmoji}">
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-modal-close>Batal</button>
        <button class="btn btn-primary" id="saveProductBtn">
          <i class="fa-solid fa-floppy-disk"></i> ${isEdit ? 'Simpan Perubahan' : 'Tambah Produk'}
        </button>`,
    });

    // Render emoji picker
    EmojiPicker.render('all', currentEmoji);

    // ===== UPLOAD FOTO PRODUK =====
    const imageFileInput = document.getElementById('pfImageFile');
    const imageUploadBtn = document.getElementById('pfImageUploadBtn');
    const imagePreview = document.getElementById('productImagePreview');
    const imageUrlField = document.getElementById('pfImageUrl');

    imageUploadBtn?.addEventListener('click', () => imageFileInput?.click());

    imageFileInput?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const originalLabel = imageUploadBtn.innerHTML;
      imageUploadBtn.disabled = true;
      imageUploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengompres...';

      try {
        // Dikecilkan dulu (maks 400px, kualitas 75%) supaya upload cepat
        // dan aplikasi tetap ringan, tapi masih jelas buat ikon produk.
        const compressedBlob = await Utils.compressImage(file, 400, 0.75);

        imageUploadBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Mengupload...';
        const filename = `produk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        const url = await API.uploadProductImage(compressedBlob, filename);

        if (url) {
          if (imageUrlField) imageUrlField.value = url;
          if (imagePreview) imagePreview.innerHTML = `<img src="${url}" alt="" style="width:100%; height:100%; object-fit:cover;">`;
          imageUploadBtn.innerHTML = '<i class="fa-solid fa-camera"></i> Ganti Foto';
          Utils.showToast('Foto berhasil diupload', 'success');
        } else {
          imageUploadBtn.innerHTML = originalLabel;
        }
      } catch (err) {
        console.error('[Produk] Gagal proses foto:', err);
        Utils.showToast('Gagal memproses foto: ' + err.message, 'error');
        imageUploadBtn.innerHTML = originalLabel;
      } finally {
        imageUploadBtn.disabled = false;
        imageFileInput.value = '';
      }
    });

    document.getElementById('pfImageRemoveBtn')?.addEventListener('click', () => {
      if (imageUrlField) imageUrlField.value = '';
      if (imagePreview) imagePreview.innerHTML = `<span style="font-size:36px;">${document.getElementById('emojiPreview')?.textContent.trim() || '📦'}</span>`;
      Utils.showToast('Foto dihapus dari form (belum disimpan sampai kamu tekan Simpan)', 'info');
    });

    // Scan barcode untuk isi field barcode form produk
    document.getElementById('scanProductBarcodeBtn')?.addEventListener('click', () => {
      BarcodeModule.openScannerModal({
        mode: 'input-barcode',
        onScan: (code) => {
          const field = document.getElementById('pfBarcode');
          if (field) field.value = code;
        },
      });
    });

    // Filter kategori emoji
    document.getElementById('emojiCatFilter')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-emoji-cat]');
      if (!btn) return;
      document.querySelectorAll('#emojiCatFilter .pill').forEach(p => p.classList.remove('is-active'));
      btn.classList.add('is-active');
      EmojiPicker.render(btn.dataset.emojiCat, document.getElementById('pfEmoji')?.value);
    });

    // Simpan produk
    document.getElementById('saveProductBtn')?.addEventListener('click', async () => {
      const data = {
        name:        document.getElementById('pfName')?.value.trim(),
        category:    document.getElementById('pfCategory')?.value,
        price:       Number(document.getElementById('pfPrice')?.value) || 0,
        modal_price: Number(document.getElementById('pfModalPrice')?.value) || 0,
        stock:       Number(document.getElementById('pfStock')?.value) || 0,
        emoji:       document.getElementById('pfEmoji')?.value || '📦',
        barcode:     document.getElementById('pfBarcode')?.value.trim() || '',
        unit:        document.getElementById('pfUnit')?.value || 'pcs',
        expiry_date: document.getElementById('pfExpiryDate')?.value || null,
        image_url:   document.getElementById('pfImageUrl')?.value || null,
      };

      if (!data.name) { Utils.showToast('Nama produk wajib diisi', 'error'); return; }
      if (!data.price) { Utils.showToast('Harga jual wajib diisi', 'error'); return; }

      if (isEdit) {
        await ProductsModule.update(productId, data);
      } else {
        await ProductsModule.create(data);
      }
      ModalManager.close();
    });
  },


    /* ===================================================
     MODAL FORM: TAMBAH PELANGGAN
     =================================================== */

  openCustomerFormModal(customerId = null) {
    const isEdit = customerId !== null;
    // FIX: sama seperti bug produk sebelumnya — customerId dari dataset
    // HTML selalu string, sedangkan c.id di database bisa number/UUID.
    const customer = isEdit ? STATE.customers.find(c => String(c.id) === String(customerId)) : null;

    ModalManager.open('customerForm', {
      title: isEdit ? 'Edit Pelanggan' : 'Tambah Pelanggan Baru',
      size: 'sm',
      bodyHtml: `
        ${(!isEdit && 'contacts' in navigator && 'ContactsManager' in window) ? `
          <button type="button" class="btn btn-secondary btn-block" id="pickContactBtn" style="margin-bottom: var(--space-4);">
            <i class="fa-solid fa-address-book"></i> Ambil dari Kontak HP
          </button>` : ''}
        <div class="form-grid" style="grid-template-columns: 1fr;">
          <label class="form-field">
            <span>Nama Lengkap *</span>
            <input type="text" id="cfName" value="${Utils.escapeHtml(customer?.name || '')}" placeholder="mis. Budi Santoso">
          </label>
          <label class="form-field">
            <span>Nomor Telepon</span>
            <input type="tel" id="cfPhone" value="${Utils.escapeHtml(customer?.phone || '')}" placeholder="08xx-xxxx-xxxx">
          </label>
        </div>`,
      footerHtml: `
        <button class="btn btn-secondary" data-modal-close>Batal</button>
        <button class="btn btn-primary" id="saveCustomerBtn">
          <i class="fa-solid fa-floppy-disk"></i> ${isEdit ? 'Simpan' : 'Tambah'}
        </button>`,
    });

    document.getElementById('pickContactBtn')?.addEventListener('click', async () => {
      try {
        const contacts = await navigator.contacts.select(['name', 'tel'], { multiple: false });
        if (!contacts || contacts.length === 0) return;

        const contact = contacts[0];
        const nameField = document.getElementById('cfName');
        const phoneField = document.getElementById('cfPhone');

        if (nameField && contact.name?.[0]) nameField.value = contact.name[0];
        if (phoneField && contact.tel?.[0]) phoneField.value = contact.tel[0];

        Utils.showToast('Kontak berhasil diambil', 'success');
      } catch (err) {
        // Pengguna membatalkan pemilihan kontak — tidak perlu toast error
        if (err.name !== 'AbortError') {
          console.warn('[Customer] Gagal mengambil kontak:', err.message);
          Utils.showToast('Gagal mengambil kontak dari HP', 'error');
        }
      }
    });

    document.getElementById('saveCustomerBtn')?.addEventListener('click', async () => {
      const name  = document.getElementById('cfName')?.value.trim();
      const phone = document.getElementById('cfPhone')?.value.trim();

      if (Utils.isEmpty(name)) {
        Utils.showToast('Nama pelanggan wajib diisi', 'error');
        return;
      }

      if (isEdit) {
        await API.customers.update(customerId, { name, phone });
        STATE.setCustomers(STATE.customers.map(c => String(c.id) === String(customerId) ? { ...c, name, phone } : c));
        Utils.showToast('Data pelanggan diperbarui', 'success');
      } else {
        const [created] = await API.customers.create({ name, phone, points: 0 });
        STATE.setCustomers([...STATE.customers, created]);
        Utils.showToast('Pelanggan "' + name + '" ditambahkan', 'success');
      }
      ModalManager.close();
      this.renderCustomersTable();
    });
  },
};

/* =====================================================
   BOOTSTRAP — jalankan saat DOM siap
   ===================================================== */
document.addEventListener('DOMContentLoaded', () => AppMain.init());
