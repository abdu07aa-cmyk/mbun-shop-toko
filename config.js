// Konfigurasi Supabase
const SUPABASE_URL = 'https://gnpjzhwbjeidabxdturx.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImducGp6aHdiamVpZGFieGR0dXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc3ODc4NTUsImV4cCI6MjA4MzM2Mzg1NX0.Lsdt0mC1MCPeUATPukRRnXFwEpsaQdNzs927086vxjY';

// Constants
const ROWS_PER_PAGE = 10;
const BERAT_LAYER_KG = 0.00618;

// Global state
let supabaseClient = null;
let currentPage = 1;
let currentSearch = "";
let currentEditId = null;
let currentOrderBy = "id";
let currentOrderAsc = false;
let allDataCache = [];