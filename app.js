// Main Application
document.addEventListener('DOMContentLoaded', async () => {
  // Set default date
  Utils.setDefaultDate();
  
  // Initialize Supabase
  API.init();
  
  // Test connection
  const isConnected = await API.testConnection();
  if (isConnected) {
    Utils.showStatus('✅ Terhubung ke Supabase Cloud!', 'success');
  } else {
    Utils.showStatus('⚠️ Gagal terhubung ke Supabase', 'error');
  }
  
  // Load initial data
  await UI.loadAndRender();

  // ============ EVENT LISTENERS ============
  
  // Tab switching
  document.querySelectorAll('.tab').forEach(tab => {
    tab.onclick = () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
      document.getElementById(tab.dataset.page).classList.add('active-page');
      if (tab.dataset.page === 'page2') {
        UI.loadAndRender();
      }
    };
  });

  // Hitung dan Simpan
  document.getElementById('hitungBtn').onclick = async () => {
    const beratTimbang = parseFloat(document.getElementById('berat').value);
    if (isNaN(beratTimbang) || beratTimbang <= 0) {
      alert("Masukkan berat timbang!");
      return;
    }

    const size = document.getElementById('size').value;
    const gsm = document.getElementById('gsm').value;
    const leaves = document.getElementById('leaves').value;
    const boxType = document.getElementById('box').value;
    const jumlahLayer = parseInt(document.getElementById('layer').value) || 0;
    
    const beratBox = beratBoxMap[boxType];
    const beratLayer = jumlahLayer * BERAT_LAYER_KG;
    const beratBersih = beratTimbang - beratBox - beratLayer;

    if (beratBersih <= 0) {
      alert("Berat bersih negatif!");
      return;
    }

    const beratBundleKG = getBeratBundleKG(size, gsm, leaves);
    if (!beratBundleKG) {
      alert(`Data tidak ditemukan! Size: ${size} | GSM: ${gsm} | Leaves: ${leaves}`);
      return;
    }

    const bundlesDesimal = beratBersih / beratBundleKG;
    const bundlesBulat = Math.ceil(bundlesDesimal);

    document.getElementById('beratBersih').innerHTML = beratBersih.toFixed(4);
    document.getElementById('jumlahBundles').innerHTML = bundlesBulat;
    document.getElementById('hasilCard').style.display = "block";

    const tanggalRaw = document.getElementById('tanggal').value;
    const tanggalFormatted = Utils.formatDateToDB(tanggalRaw);

    const dataToSave = {
      tanggal: tanggalFormatted,
      no_po: document.getElementById('noPo').value || "-",
      brand: document.getElementById('brand').value || "-",
      size_kertas: size,
      gsm: parseInt(gsm),
      leaves_per_bundle: parseInt(leaves),
      jenis_box: boxType,
      jumlah_layer: jumlahLayer,
      berat_timbang_kg: beratTimbang,
      berat_bersih_kg: beratBersih,
      jumlah_bundles: bundlesBulat,
      bundles_desimal: bundlesDesimal
    };

    Utils.showStatus('⏳ Menyimpan ke cloud...', 'loading');
    try {
      await API.insertData(dataToSave);
      Utils.showStatus('✅ Tersimpan ke cloud!', 'success');
      document.getElementById('berat').value = '';
      currentPage = 1;
      currentSearch = "";
      document.getElementById('searchInput').value = "";
      await UI.loadAndRender();
    } catch (error) {
      Utils.showStatus('❌ Gagal: ' + error.message, 'error');
      alert('Gagal simpan! ' + error.message);
    }
  };

  // Reset form
  document.getElementById('resetFormBtn').onclick = () => {
    if (confirm("Reset form? PO dan Brand akan dikosongkan.")) {
      document.getElementById('noPo').value = '';
      document.getElementById('brand').value = '';
      document.getElementById('berat').value = '';
      document.getElementById('hasilCard').style.display = 'none';
      Utils.showStatus('Form direset', 'success');
    }
  };

  // Cari data
  document.getElementById('cariBtn').onclick = () => {
    currentSearch = document.getElementById('searchInput').value.trim();
    currentPage = 1;
    UI.loadAndRender();
  };

  // Reset cari
  document.getElementById('resetCariBtn').onclick = () => {
    currentSearch = '';
    document.getElementById('searchInput').value = '';
    currentPage = 1;
    UI.loadAndRender();
  };

  // Urutkan PO A-Z
  document.getElementById('urutPOBtn').onclick = () => {
    currentOrderBy = "no_po";
    currentOrderAsc = true;
    currentPage = 1;
    UI.loadAndRender();
  };

  // Urutkan PO Z-A
  document.getElementById('urutPOTerbalikBtn').onclick = () => {
    currentOrderBy = "no_po";
    currentOrderAsc = false;
    currentPage = 1;
    UI.loadAndRender();
  };

  // Export Excel
  document.getElementById('exportExcelBtn').onclick = () => Print.exportToExcel();

  // Hapus semua data
  document.getElementById('hapusSemuaBtn').onclick = async () => {
    if (confirm("⚠️ Hapus SEMUA data dari cloud?")) {
      try {
        await API.deleteAllData();
        alert("✅ Semua data telah dihapus!");
        await UI.loadAndRender();
      } catch (error) {
        alert("Gagal hapus: " + error.message);
      }
    }
  };

  // Select all checkbox
  document.getElementById('selectAllCheckbox').onclick = (e) => UI.toggleSelectAll(e);

  // Edit modal save
  document.getElementById('saveEditBtn').onclick = () => UI.saveEdit();

  // Cetak modal handlers
  const cetakModal = document.getElementById('cetakModal');
  const cetakMetode = document.getElementById('cetakMetode');
  const cetakPoInput = document.getElementById('cetakPoInput');
  const cetakBrandInput = document.getElementById('cetakBrandInput');
  const cetakTanggalInput = document.getElementById('cetakTanggalInput');

  document.getElementById('cetakBtn').onclick = () => {
    cetakModal.style.display = 'flex';
  };

  cetakMetode.onchange = () => {
    const metode = cetakMetode.value;
    cetakPoInput.style.display = metode === 'po' ? 'block' : 'none';
    cetakBrandInput.style.display = metode === 'brand' ? 'block' : 'none';
    cetakTanggalInput.style.display = metode === 'tanggal' ? 'block' : 'none';
  };
  cetakMetode.onchange();

  document.getElementById('prosesCetakBtn').onclick = async () => {
    const metode = cetakMetode.value;
    
    if (metode === 'po') {
      const poValue = document.getElementById('cetakPoValue').value.trim();
      if (!poValue) { alert("Masukkan No. PO!"); return; }
      await Print.printData('po', poValue);
    } 
    else if (metode === 'brand') {
      const brandValue = document.getElementById('cetakBrandValue').value.trim();
      if (!brandValue) { alert("Masukkan Brand!"); return; }
      await Print.printData('brand', brandValue);
    }
    else if (metode === 'tanggal') {
      const tglAwal = document.getElementById('cetakTglAwal').value;
      const tglAkhir = document.getElementById('cetakTglAkhir').value;
      if (!tglAwal || !tglAkhir) { alert("Pilih rentang tanggal!"); return; }
      await Print.printData('tanggal', {
        start: Utils.formatDateToDB(tglAwal),
        end: Utils.formatDateToDB(tglAkhir)
      });
    }
    else if (metode === 'checklist') {
      const ids = UI.getCheckedIds();
      if (ids.length === 0) { alert("Pilih data yang ingin dicetak!"); return; }
      await Print.printData('checklist', null, ids);
    }
    else {
      await Print.printData('semua');
    }
    
    cetakModal.style.display = 'none';
  };

  // Close modals
  document.getElementById('closeCetakModalBtn').onclick = () => {
    cetakModal.style.display = 'none';
  };
  
  document.getElementById('closeModalBtn').onclick = () => {
    document.getElementById('editModal').style.display = 'none';
  };
  
  window.onclick = (e) => {
    if (e.target === document.getElementById('editModal')) {
      document.getElementById('editModal').style.display = 'none';
    }
    if (e.target === cetakModal) {
      cetakModal.style.display = 'none';
    }
  };
});