// Print and Export functions
const Print = {
  // Export ke Excel
  async exportToExcel() {
    try {
      const data = await API.getData();
      if (!data || data.length === 0) {
        alert("Tidak ada data untuk di export!");
        return;
      }
      
      const excelData = [["No", "Tanggal", "No. PO", "Brand", "Size", "GSM", "Leaves", "Jenis Box", "Jumlah Bundles", "Berat Timbang (kg)", "Berat Bersih (kg)"]];
      
      for (let i = 0; i < data.length; i++) {
        const d = data[i];
        excelData.push([
          i + 1,
          d.tanggal || '',
          d.no_po || '-',
          d.brand || '-',
          d.size_kertas || '',
          d.gsm || '',
          d.leaves_per_bundle || '',
          d.jenis_box || '',
          d.jumlah_bundles || 0,
          d.berat_timbang_kg || 0,
          d.berat_bersih_kg || 0
        ]);
      }
      
      const ws = XLSX.utils.aoa_to_sheet(excelData);
      ws['!cols'] = [
        { wch: 5 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
        { wch: 6 }, { wch: 8 }, { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 15 }
      ];
      
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Laporan Timbangan");
      XLSX.writeFile(wb, `laporan_timbangan_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.xlsx`);
      alert("Export Excel berhasil!");
    } catch (error) {
      alert("Gagal export: " + error.message);
    }
  },

  // Generate print HTML
  generatePrintHtml(dataToPrint, title) {
    // Kelompokkan berdasarkan PO
    const groupedByPO = {};
    for (const item of dataToPrint) {
      const po = item.no_po || "-";
      if (!groupedByPO[po]) groupedByPO[po] = [];
      groupedByPO[po].push(item);
    }

    let printHtml = `<!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Laporan Timbangan</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .header h1 { margin: 0; color: #1e3a8a; }
          .header h3 { margin: 5px 0; color: #555; }
          .po-group { margin-bottom: 30px; page-break-inside: avoid; }
          .po-title { background: #1e3a8a; color: white; padding: 10px; margin-bottom: 10px; border-radius: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #e2e8f0; }
          .total-row { background: #f1f5f9; font-weight: bold; }
          .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
      <div class="header">
        <h1>📦 LAPORAN TIMBANGAN KERTAS</h1>
        <h3>${title}</h3>
        <p>Dicetak: ${new Date().toLocaleString('id-ID')}</p>
      </div>`;

    for (const [po, items] of Object.entries(groupedByPO)) {
      const brand = items[0].brand || "-";
      const size = items[0].size_kertas || "-";
      const gsm = items[0].gsm || "-";
      const leaves = items[0].leaves_per_bundle || "-";
      const box = items[0].jenis_box || "-";

      let totalBundles = 0;
      let tableRows = "";
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        totalBundles += item.jumlah_bundles;
        tableRows += `
          <tr>
            <td style="text-align:center">${i + 1}</td>
            <td>${item.tanggal || ''}</td>
            <td>${item.berat_timbang_kg} kg</td>
            <td>${item.berat_bersih_kg} kg</td>
            <td style="text-align:center; font-weight:bold">${item.jumlah_bundles}</td>
          </tr>`;
      }
      const rataRata = Math.round(totalBundles / items.length);

      printHtml += `
        <div class="po-group">
          <div class="po-title">
            <strong>📄 NO. PO:</strong> ${po} &nbsp;|&nbsp;
            <strong>🏷️ BRAND:</strong> ${brand} &nbsp;|&nbsp;
            <strong>📏 SIZE:</strong> ${size} &nbsp;|&nbsp;
            <strong>📄 GSM:</strong> ${gsm} &nbsp;|&nbsp;
            <strong>📑 LEAVES:</strong> ${leaves} &nbsp;|&nbsp;
            <strong>📦 BOX:</strong> ${box}
          </div>
          <table>
            <thead>
              <tr><th>No</th><th>Tanggal</th><th>Berat Timbang</th><th>Berat Bersih</th><th>Jumlah Bundles</th></tr>
            </thead>
            <tbody>
              ${tableRows}
              <tr class="total-row"><td colspan="4"><strong>TOTAL</strong></td><td><strong>${totalBundles} bundles</strong></td></tr>
              <tr class="total-row"><td colspan="4"><strong>RATA-RATA</strong></td><td><strong>${rataRata} bundles/box</strong></td></tr>
            </tbody>
          </table>
        </div>`;
    }

    printHtml += `<div class="footer">Dicetak oleh Aplikasi Timbangan Kertas</div></body></html>`;
    return printHtml;
  },

  // Cetak
  async printData(filterType, filterValue = null, ids = null) {
    let dataToPrint = [];
    let title = "";

    if (filterType === 'po' && filterValue) {
      title = `LAPORAN TIMBANGAN - NO. PO: ${filterValue}`;
      dataToPrint = await API.getDataForPrint('po', filterValue);
    } else if (filterType === 'brand' && filterValue) {
      title = `LAPORAN TIMBANGAN - BRAND: ${filterValue}`;
      dataToPrint = await API.getDataForPrint('brand', filterValue);
    } else if (filterType === 'checklist' && ids && ids.length > 0) {
      title = `LAPORAN TIMBANGAN - DATA TERPILIH (${ids.length} box)`;
      dataToPrint = await API.getDataForPrint('checklist', null, ids);
    } else if (filterType === 'tanggal' && filterValue) {
      title = `LAPORAN TIMBANGAN - TANGGAL: ${filterValue.start} s/d ${filterValue.end}`;
      dataToPrint = await API.getDataForPrint('tanggal', filterValue);
    } else {
      title = `LAPORAN SEMUA DATA TIMBANGAN`;
      dataToPrint = await API.getDataForPrint('semua');
    }

    if (dataToPrint.length === 0) {
      alert("Tidak ada data untuk dicetak!");
      return;
    }

    const printHtml = this.generatePrintHtml(dataToPrint, title);
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printHtml);
    printWindow.document.close();
    printWindow.print();
  }
};