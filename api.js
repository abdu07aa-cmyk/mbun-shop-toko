// API Layer untuk komunikasi dengan Supabase
const API = {
  // Inisialisasi Supabase client
  init() {
    if (!supabaseClient) {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabaseClient;
  },

  // Ambil semua data dengan filter dan sorting
  async getData() {
    const supabase = this.init();
    let query = supabase.from('riwayat_timbang').select('*');
    
    if (currentSearch) {
      query = query.or(`no_po.ilike.%${currentSearch}%,brand.ilike.%${currentSearch}%`);
    }
    
    const { data, error } = await query;
    if (error) {
      console.error('Error fetching data:', error);
      return [];
    }
    
    allDataCache = data || [];
    return allDataCache;
  },

  // Simpan data baru
  async insertData(data) {
    const supabase = this.init();
    const { error } = await supabase.from('riwayat_timbang').insert([data]);
    if (error) throw error;
    return true;
  },

  // Update data
  async updateData(id, data) {
    const supabase = this.init();
    const { error } = await supabase.from('riwayat_timbang').update(data).eq('id', id);
    if (error) throw error;
    return true;
  },

  // Hapus satu data
  async deleteData(id) {
    const supabase = this.init();
    const { error } = await supabase.from('riwayat_timbang').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  // Hapus semua data
  async deleteAllData() {
    const supabase = this.init();
    const { error } = await supabase.from('riwayat_timbang').delete().neq('id', 0);
    if (error) throw error;
    return true;
  },

  // Ambil data untuk cetak berdasarkan filter
  async getDataForPrint(filterType, filterValue = null, ids = null) {
    const supabase = this.init();
    let query = supabase.from('riwayat_timbang').select('*');
    
    if (filterType === 'po' && filterValue) {
      query = query.eq('no_po', filterValue);
    } else if (filterType === 'brand' && filterValue) {
      query = query.eq('brand', filterValue);
    } else if (filterType === 'checklist' && ids && ids.length > 0) {
      query = query.in('id', ids);
    } else if (filterType === 'tanggal' && filterValue) {
      query = query.gte('tanggal', filterValue.start).lte('tanggal', filterValue.end);
    }
    
    query = query.order('id', { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  // Test koneksi
  async testConnection() {
    const supabase = this.init();
    const { error } = await supabase.from('riwayat_timbang').select('id', { count: 'exact', head: true });
    return !error;
  }
};