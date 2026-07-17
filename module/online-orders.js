/* =====================================================
   MBUN COLLECTION — FEATURES/ONLINE-ORDERS.JS
   Menampilkan & mengelola pesanan yang masuk dari toko
   online pelanggan (aplikasi terpisah, tabel Supabase
   yang sama: online_orders). Pemilik bisa lihat detail,
   cek bukti transfer, dan ubah status pesanan di sini.
   ===================================================== */

const OnlineOrdersModule = {
  orders: [],
  activeFilter: 'all',

  _statusLabel: {
    menunggu_konfirmasi: 'Menunggu Konfirmasi',
    dibayar: 'Dibayar',
    diproses: 'Diproses',
    siap: 'Siap Diambil/Dikirim',
    selesai: 'Selesai',
    dibatalkan: 'Dibatalkan',
  },

  _statusBadgeClass: {
    menunggu_konfirmasi: 'badge-warning',
    dibayar: 'badge-info',
    diproses: 'badge-info',
    siap: 'badge-success',
    selesai: 'badge-success',
    dibatalkan: 'badge-danger',
  },

  async load() {
    try {
      this.orders = await API.fetchAll(CONFIG.TABLES.ONLINE_ORDERS, { order: 'created_at.desc' });
    } catch (err) {
      console.warn('[OnlineOrders] Gagal memuat pesanan online:', err.message);
      this.orders = [];
    }
    this.render();
    this._syncBadge();
  },

  setFilter(status) {
    this.activeFilter = status;
    document.querySelectorAll('#orderStatusFilter [data-status-filter]').forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.statusFilter === status);
    });
    this.render();
  },

  render() {
    const tbody = document.querySelector('#onlineOrdersTable tbody');
    if (!tbody) return;

    const filtered = this.activeFilter === 'all'
      ? this.orders
      : this.orders.filter(o => o.status === this.activeFilter);

    if (filtered.length === 0) {
      tbody.innerHTML = `<tr class="table-empty-row"><td colspan="7">Tidak ada pesanan${this.activeFilter !== 'all' ? ' dengan status ini' : ' online masuk'}.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(o => `
      <tr>
        <td><small>#${o.id}</small></td>
        <td>${Utils.formatDateTime(o.created_at)}</td>
        <td>${Utils.escapeHtml(o.customer_name)}<br><small style="color:var(--color-text-muted);">${Utils.escapeHtml(o.customer_phone)}</small></td>
        <td>${o.fulfillment_type === 'delivery' ? '🛵 Diantar' : '🏪 Ambil Sendiri'}</td>
        <td>${Utils.formatCurrency(o.total_amount)}</td>
        <td><span class="badge ${this._statusBadgeClass[o.status] || 'badge-info'}">${this._statusLabel[o.status] || o.status}</span></td>
        <td>
          <button class="icon-btn" data-view-order="${o.id}" title="Detail Pesanan">
            <i class="fa-solid fa-eye"></i>
          </button>
        </td>
      </tr>
    `).join('');

    Utils.qsa('[data-view-order]').forEach(btn => {
      btn.addEventListener('click', () => this.openDetailModal(btn.dataset.viewOrder));
    });
  },

  openDetailModal(orderId) {
    const o = this.orders.find(x => String(x.id) === String(orderId));
    if (!o) return;

    const itemsHtml = (o.items || []).map(item => `
      <div class="receipt-row">
        <span>${Utils.escapeHtml(item.name)} x${item.qty}</span>
        <span>${Utils.formatCurrency(item.price * item.qty)}</span>
      </div>`).join('') || '<p style="font-size:13px; color:var(--color-text-muted);">Tidak ada rincian item.</p>';

    ModalManager.open('orderDetail', {
      title: `Pesanan #${o.id}`,
      size: 'md',
      bodyHtml: `
        <div class="receipt">
          <div class="receipt-row"><span>Pelanggan</span><span>${Utils.escapeHtml(o.customer_name)}</span></div>
          <div class="receipt-row"><span>No. HP</span><span>${Utils.escapeHtml(o.customer_phone)}</span></div>
          <div class="receipt-row"><span>Metode</span><span>${o.fulfillment_type === 'delivery' ? 'Diantar' : 'Ambil Sendiri'}</span></div>
          ${o.fulfillment_type === 'delivery' ? `<div class="receipt-row"><span>Alamat</span><span style="text-align:right; max-width:60%;">${Utils.escapeHtml(o.address || '-')}</span></div>` : ''}
          <div class="receipt-divider"></div>
          ${itemsHtml}
          <div class="receipt-divider"></div>
          <div class="receipt-total-row"><span>Total</span><span>${Utils.formatCurrency(o.total_amount)}</span></div>
        </div>

        <p style="margin: var(--space-4) 0 var(--space-2); font-weight:600; font-size:14px;">Bukti Transfer</p>
        ${o.payment_proof_url
          ? `<img src="${o.payment_proof_url}" alt="Bukti transfer" style="width:100%; border-radius:var(--radius-md); cursor:pointer;" onclick="window.open('${o.payment_proof_url}','_blank')">`
          : `<p style="color:var(--color-text-muted); font-size:13px;">Pelanggan belum upload bukti transfer.</p>`}

        <div class="form-field" style="margin-top: var(--space-5);">
          <span>Ubah Status Pesanan</span>
          <select id="orderStatusSelect" class="select-field">
            ${Object.entries(this._statusLabel).map(([k, v]) =>
              `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v}</option>`
            ).join('')}
          </select>
        </div>
      `,
      footerHtml: `
        <button class="btn btn-secondary" data-modal-close>Tutup</button>
        <button class="btn btn-primary" id="saveOrderStatusBtn">Simpan Status</button>
      `,
    });

    document.getElementById('saveOrderStatusBtn')?.addEventListener('click', () => {
      const newStatus = document.getElementById('orderStatusSelect')?.value;
      this.updateStatus(o.id, newStatus);
    });
  },

  async updateStatus(orderId, status) {
    try {
      await API.update(CONFIG.TABLES.ONLINE_ORDERS, { id: `eq.${orderId}` }, { status });
      const order = this.orders.find(o => String(o.id) === String(orderId));
      if (order) order.status = status;
      this.render();
      this._syncBadge();
      ModalManager.close();
      Utils.showToast('Status pesanan diperbarui', 'success');
    } catch (err) {
      console.error('[OnlineOrders] Gagal update status:', err);
      Utils.showToast('Gagal memperbarui status pesanan', 'error');
    }
  },

  /** Badge titik merah di sidebar kalau ada pesanan yang masih "Menunggu Konfirmasi" */
  _syncBadge() {
    const badge = document.getElementById('onlineOrdersBadge');
    if (!badge) return;
    const pendingCount = this.orders.filter(o => o.status === 'menunggu_konfirmasi').length;
    badge.style.display = pendingCount > 0 ? 'block' : 'none';
  },

  init() {
    document.querySelectorAll('#orderStatusFilter [data-status-filter]').forEach(btn => {
      btn.addEventListener('click', () => this.setFilter(btn.dataset.statusFilter));
    });

    this.load();

    // Cek pesanan baru tiap 60 detik, biar badge notifikasi update
    // otomatis walau pemilik lagi buka menu lain.
    setInterval(() => this.load(), 60000);
  },
};
