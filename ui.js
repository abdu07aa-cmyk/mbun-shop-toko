// UI functions
const UI = {
  // Render tabel dengan pagination
  renderTable() {
    let filtered = [...allDataCache];
    
    // Sorting
    if (currentOrderBy === "no_po") {
      filtered.sort((a, b) => {
        let valA = a.no_po || "";
        let valB = b.no_po || "";
        return currentOrderAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
      });
    } else {
      filtered.sort((a, b) => {
        let valA = a.id;
        let valB = b.id;
        return currentOrderAsc ? valA - valB : valB - valA;
      });
    }

    const totalData = filtered.length;
    const totalPages = Math.ceil(totalData / ROWS_PER_PAGE);
    const start = (currentPage - 1) * ROWS_PER_PAGE;
    const pageData = filtered.slice(start, start + ROWS_PER_PAGE);

    const tbody = document.getElementById('riwayatBody');
    if (pageData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">📭 Tidak ada data. Silakan timbang dan simpan.</td></tr>';
      document.getElementById('pagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = "";
    for (let i = 0; i < pageData.length; i++) {
      const d = pageData[i];
      const tanggalDisplay = d.tanggal || '';
      tbody.innerHTML += `
        <tr>
          <td style="text-align:center"><input type="checkbox" class="rowCheckbox" data-id="${d.id}"></td>
          <td style="text-align:center">${start + i + 1}</td>
          <td>${tanggalDisplay}</td>
          <td>${d.no_po || '-'}</td>
          <td>${d.brand || '-'}</td>
          <td>${(d.size_kertas || '').substring(0, 18)}</td>
          <td>${d.gsm}</td>
          <td>${d.leaves_per_bundle || '-'}</td>
          <td style="text-align:center; font-weight:bold">${d.jumlah_bundles}</td>
          <td class="aksi-cell">
            <button class="btn-edit-small" onclick="UI.openEditModal(${d.id})">✏️ Edit</button>
            <button class="btn-hapus-small" onclick="UI.deleteSingleData(${d.id})">🗑️ Hapus</button>
          </td>
        </tr>
      `;
    }

    // Render pagination
    let pagHtml = '';
    for (let i = 1; i <= totalPages; i++) {
      pagHtml += `<button onclick="UI.goToPage(${i})" class="${i === currentPage ? 'active-page-btn' : ''}">${i}</button>`;
    }
    document.getElementById('pagination').innerHTML = pagHtml;
  },

  // Go to page
  goToPage(p) {
    currentPage = p;
    this.loadAndRender();
  },

  // Load data dan render
  async loadAndRender() {
    await API.getData();
    this.renderTable();
  },

  // Delete single data
  async deleteSingleData(id) {
    if (confirm("Hapus data ini?")) {
      try {
        await API.deleteData(id);
        Utils.showStatus('Data terhapus!', 'success');
        await this.loadAndRender();
      } catch (error) {
        Utils.showStatus('Gagal hapus: ' + error.message, 'error');
      }
    }
  },

  // Open edit modal
  openEditModal(id) {
    const data = allDataCache.find(item => item.id === id);
    if (!data) return;
    
    currentEditId = id;
    document.getElementById('editTanggal').value = Utils.formatDateForInput(data.tanggal);
    document.getElementById('editNoPo').value = data.no_po || '';
    document.getElementById('editBrand').value = data.brand || '';
    document.getElementById('editSize').value = data.size_kertas || '';
    document.getElementById('editGsm').value = data.gsm || '';
    document.getElementById('editBox').value = data.jenis_box || '';
    document.getElementById('editBundles').value = data.jumlah_bundles || 0;
    document.getElementById('editModal').style.display = 'flex';
  },

  // Save edit
  async saveEdit() {
    const updatedData = {
      tanggal: Utils.formatDateToDB(document.getElementById('editTanggal').value),
      no_po: document.getElementById('editNoPo').value,
      brand: document.getElementById('editBrand').value,
      size_kertas: document.getElementById('editSize').value,
      gsm: parseInt(document.getElementById('editGsm').value),
      jenis_box: document.getElementById('editBox').value,
      jumlah_bundles: parseInt(document.getElementById('editBundles').value)
    };
    
    try {
      await API.updateData(currentEditId, updatedData);
      Utils.showStatus('Data berhasil diupdate!', 'success');
      document.getElementById('editModal').style.display = 'none';
      await this.loadAndRender();
    } catch (error) {
      Utils.showStatus('Gagal update: ' + error.message, 'error');
    }
  },

  // Get checked IDs
  getCheckedIds() {
    const checkboxes = document.querySelectorAll('.rowCheckbox:checked');
    return Array.from(checkboxes).map(cb => parseInt(cb.dataset.id));
  },

  // Toggle select all
  toggleSelectAll(e) {
    const checkboxes = document.querySelectorAll('.rowCheckbox');
    checkboxes.forEach(cb => cb.checked = e.target.checked);
  }
};