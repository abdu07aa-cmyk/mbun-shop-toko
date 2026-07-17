/* =====================================================
   MBUN COLLECTION — TOKO ONLINE — APP.JS
   ===================================================== */

const CONFIG = {
  SUPABASE_URL: 'https://marelgsluzshkwxwcjod.supabase.co',
  SUPABASE_ANON_KEY: localStorage.getItem('toko_supabase_key') || '',
  STORAGE_BUCKET_PRODUCT_IMAGES: 'product-images',
  STORAGE_BUCKET_PAYMENT_PROOFS: 'payment-proofs',
  CURRENCY_LOCALE: 'id-ID',
  PAYMENT_INFO: [
    { label: 'GoPay', value: '0897-3488-963 a.n. MBUN COLLECTION' },
    { label: 'Transfer BCA', value: '1234567890 a.n. MBUN COLLECTION' },
  ],
  STORAGE_KEYS: {
    CART: 'toko_cart',
    CUSTOMER_NAME: 'toko_customer_name',
    CUSTOMER_PHONE: 'toko_customer_phone',
    SUPABASE_KEY: 'toko_supabase_key',
    ORDER_STATUSES: 'order_statuses',
  },
  ADMIN_PASSWORD: 'mbun123',
};

CONFIG.SUPABASE_REST_URL = `${CONFIG.SUPABASE_URL}/rest/v1`;

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
  get cartCount() { return this.cart.reduce((sum, i) => sum + i.qty, 0); },
  get cartTotal() { return this.cart.reduce((sum, i) => sum + i.price * i.qty, 0); },
  saveCart() { localStorage.setItem(CONFIG.STORAGE_KEYS.CART, JSON.stringify(this.cart)); },
  saveIdentity(name, phone) {
    this.customerName = name; this.customerPhone = phone;
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME, name);
    localStorage.setItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE, phone);
  },
};

const Utils = {
  formatCurrency(v) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0).replace('IDR', 'Rp'); },
  escapeHtml(s) { const d=document.createElement('div'); d.textContent=String(s??''); return d.innerHTML; },
  debounce(fn,d=300){let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),d);};},
  showToast(msg,type='info',d=3000){const c=document.getElementById('toastContainer');if(!c)return;const t=document.createElement('div');t.className=`toast is-${type}`;t.textContent=msg;c.appendChild(t);setTimeout(()=>t.remove(),d);},
  showLoading(s){const e=document.getElementById('loadingOverlay');if(e)e.hidden=!s;},
  compressImage(file,maxDim=800,q=0.75){return new Promise((r,j)=>{const img=new Image();const reader=new FileReader();reader.onload=(e)=>{img.src=e.target.result;};reader.onerror=()=>j('Gagal baca file');img.onload=()=>{let w=img.width,h=img.height;if(w>h&&w>maxDim){h=Math.round(h*(maxDim/w));w=maxDim;}else if(h>maxDim){w=Math.round(w*(maxDim/h));h=maxDim;}const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);ctx.drawImage(img,0,0,w,h);c.toBlob(b=>b?r(b):j('Gagal kompres'),'image/jpeg',q);};img.onerror=()=>j('Bukan gambar valid');reader.readAsDataURL(file);});},
};

const API = {
  _headers(returnRep=false){const h={'Content-Type':'application/json','apikey':CONFIG.SUPABASE_ANON_KEY,'Authorization':`Bearer ${CONFIG.SUPABASE_ANON_KEY}`};if(returnRep)h['Prefer']='return=representation';return h;},
  isConfigured(){return !!CONFIG.SUPABASE_ANON_KEY;},
  async fetchAll(table,params={}){const q=new URLSearchParams({select:'*',...params}).toString();const r=await fetch(`${CONFIG.SUPABASE_REST_URL}/${table}?${q}`,{headers:this._headers()});if(!r.ok)throw new Error(`Gagal memuat ${table}: ${r.status}`);return r.json();},
  async insert(table,payload){const r=await fetch(`${CONFIG.SUPABASE_REST_URL}/${table}`,{method:'POST',headers:this._headers(true),body:JSON.stringify(payload)});if(!r.ok){const e=await r.json().catch(()=>null);throw new Error(e?.message||`Gagal menyimpan ke ${table}: ${r.status}`);}return r.json();},
  async update(table,filter,payload){const q=new URLSearchParams(filter).toString();const r=await fetch(`${CONFIG.SUPABASE_REST_URL}/${table}?${q}`,{method:'PATCH',headers:this._headers(true),body:JSON.stringify(payload)});if(!r.ok)throw new Error(`Gagal update ${table}: ${r.status}`);return r.json();},
  async uploadImage(blob,bucket,filename){const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${filename}`,{method:'POST',headers:{'apikey':CONFIG.SUPABASE_ANON_KEY,'Authorization':`Bearer ${CONFIG.SUPABASE_ANON_KEY}`,'Content-Type':blob.type||'image/jpeg'},body:blob});if(!r.ok)throw new Error('Gagal upload');return `${CONFIG.SUPABASE_URL}/storage/v1/object/public/${bucket}/${filename}`;},
};

const Security = {
  validatePhone(p){return /^(08|62|8)[0-9]{8,12}$/.test(p.replace(/\s/g,''));},
  sanitizeInput(i){return i?String(i).replace(/[<>]/g,'').trim():'';},
  validateAddress(a){return a&&a.trim().length>=10;},
  validateImageFile(f){const types=['image/jpeg','image/png','image/webp','image/jpg'];if(!types.includes(f.type))throw new Error('Format tidak didukung. Gunakan JPG, PNG, atau WEBP.');if(f.size>2*1024*1024)throw new Error('Ukuran max 2MB.');return true;},
};

const LazyLoader = {
  observer:null,
  init(){if('IntersectionObserver'in window){this.observer=new IntersectionObserver((entries)=>{entries.forEach(e=>{if(e.isIntersecting){const img=e.target;const src=img.dataset.src;if(src){img.src=src;img.removeAttribute('data-src');img.classList.add('loaded');}this.observer.unobserve(img);}});},{rootMargin:'50px'});}},
  observe(images){if(this.observer){images.forEach(i=>this.observer.observe(i));}else{images.forEach(i=>{if(i.dataset.src)i.src=i.dataset.src;});}},
};

const Promo = {
  activePromos:[],
  async loadPromos(){try{this.activePromos=await API.fetchAll('promos',{status:'eq.active',limit:5}).catch(()=>[]);}catch{this.activePromos=[];}},
  applyDiscount(total){let disc=0,promo=null;for(const p of this.activePromos){if(p.type==='percentage'){const d=total*(p.value/100);if(d>disc){disc=d;promo=p;}}else if(p.type==='fixed'){if(p.value>disc){disc=p.value;promo=p;}}}if(promo&&promo.max_discount)disc=Math.min(disc,promo.max_discount);return{discount:disc,promo,totalAfterDiscount:total-disc};},
  renderPromoBadge(){const c=document.getElementById('promoContainer');if(!c)return;if(this.activePromos.length===0){c.innerHTML='';return;}c.innerHTML=this.activePromos.map(p=>`<div class="promo-badge"><i class="fa-solid fa-tag"></i> ${p.name}: ${p.type==='percentage'?`${p.value}%`:`Rp${p.value}`} OFF</div>`).join('');},
};

const Catalog = {
  async load(){Utils.showLoading(true);try{STATE.products=await API.fetchAll('products',{deleted_at:'is.null',order:'name.asc'});STATE.categories=[...new Set(STATE.products.map(p=>p.category).filter(Boolean))];this.renderCategoryPills();this.render();}catch(e){console.error(e);Utils.showToast('Gagal memuat produk. Cek koneksi internet.','error',5000);}finally{Utils.showLoading(false);}},
  renderCategoryPills(){const c=document.getElementById('categoryPills');if(!c)return;const cats=['all',...STATE.categories];c.innerHTML=cats.map(cat=>`<button class="pill ${STATE.activeCategory===cat?'is-active':''}" data-category="${Utils.escapeHtml(cat)}">${cat==='all'?'Semua':Utils.escapeHtml(cat)}</button>`).join('');c.querySelectorAll('[data-category]').forEach(btn=>{btn.addEventListener('click',()=>{STATE.activeCategory=btn.dataset.category;this.renderCategoryPills();this.render();});});},
  _filteredProducts(){let list=STATE.products;if(STATE.activeCategory!=='all')list=list.filter(p=>p.category===STATE.activeCategory);if(STATE.searchQuery.trim()){const q=STATE.searchQuery.trim().toLowerCase();list=list.filter(p=>p.name.toLowerCase().includes(q));}return list;},
  render(){const grid=document.getElementById('productGrid');const empty=document.getElementById('catalogEmpty');if(!grid)return;const list=this._filteredProducts();if(list.length===0){grid.innerHTML='';if(empty)empty.hidden=false;return;}if(empty)empty.hidden=true;grid.innerHTML=list.map(p=>this._cardHtml(p)).join('');grid.querySelectorAll('[data-add-product]').forEach(card=>{card.addEventListener('click',()=>Cart.addItem(card.dataset.addProduct));});const lazy=grid.querySelectorAll('.lazy-image');if(lazy.length)LazyLoader.observe(lazy);},
  _cardHtml(p){const out=p.stock<=0;const img=p.image_url?`<img data-src="${p.image_url}" alt="" class="lazy-image">`:`<div class="emoji-fallback">${p.emoji||'📦'}</div>`;return `<button class="product-card ${out?'is-out-of-stock':''}" data-add-product="${p.id}" ${out?'disabled':''}><div class="product-card-image">${img}${out?'<span class="stock-badge">Habis</span>':''}</div><div class="product-card-body"><div class="product-card-name">${Utils.escapeHtml(p.name)}</div><div class="product-card-price">${Utils.formatCurrency(p.price)}</div><div class="product-card-stock">${out?'Stok habis':`Stok: ${p.stock}`}</div><div class="product-card-add">${out?'Habis':'+ Keranjang'}</div></div></button>`;},
};

const Cart = {
  addItem(id){const p=STATE.products.find(pr=>String(pr.id)===String(id));if(!p)return;if(p.stock<=0){Utils.showToast('Stok habis','error');return;}const existing=STATE.cart.find(i=>i.productId===String(id));if(existing){if(existing.qty>=p.stock){Utils.showToast('Stok tidak mencukupi','error');return;}existing.qty+=1;}else{STATE.cart.push({productId:String(p.id),name:p.name,price:p.price,image_url:p.image_url||null,emoji:p.emoji||'📦',qty:1,});}STATE.saveCart();this.render();Utils.showToast(`${p.name} ditambahkan`,'success',1500);},
  setQty(id,qty){const item=STATE.cart.find(i=>i.productId===String(id));const p=STATE.products.find(pr=>String(pr.id)===String(id));if(!item)return;if(qty<=0){STATE.cart=STATE.cart.filter(i=>i.productId!==String(id));}else if(p&&qty>p.stock){Utils.showToast('Stok tidak mencukupi','warning');return;}else{item.qty=qty;}STATE.saveCart();this.render();},
  open(){document.getElementById('cartDrawer')?.classList.add('is-open');document.getElementById('cartOverlay')?.classList.add('is-open');this.render();},
  close(){document.getElementById('cartDrawer')?.classList.remove('is-open');document.getElementById('cartOverlay')?.classList.remove('is-open');},
  render(){const badge=document.getElementById('cartBadge');if(badge){badge.textContent=STATE.cartCount;badge.hidden=STATE.cartCount===0;}const items=document.getElementById('cartItems');const total=document.getElementById('cartTotal');const checkout=document.getElementById('checkoutBtn');if(!items)return;if(STATE.cart.length===0){items.innerHTML=`<div class="empty-state"><i class="fa-solid fa-cart-shopping"></i><p>Keranjang masih kosong</p></div>`;}else{items.innerHTML=STATE.cart.map(i=>`<div class="cart-item"><div class="cart-item-image">${i.image_url?`<img src="${i.image_url}" alt="">`:i.emoji}</div><div class="cart-item-info"><div class="cart-item-name">${Utils.escapeHtml(i.name)}</div><div class="cart-item-price">${Utils.formatCurrency(i.price)}</div></div><div class="qty-control"><button data-decr="${i.productId}"><i class="fa-solid fa-minus"></i></button><span>${i.qty}</span><button data-incr="${i.productId}"><i class="fa-solid fa-plus"></i></button></div></div>`).join('');items.querySelectorAll('[data-incr]').forEach(b=>b.addEventListener('click',()=>{const item=STATE.cart.find(i=>i.productId===b.dataset.incr);this.setQty(b.dataset.incr,item.qty+1);}));items.querySelectorAll('[data-decr]').forEach(b=>b.addEventListener('click',()=>{const item=STATE.cart.find(i=>i.productId===b.dataset.decr);this.setQty(b.dataset.decr,item.qty-1);}));}if(total)total.textContent=Utils.formatCurrency(STATE.cartTotal);if(checkout)checkout.disabled=STATE.cart.length===0;},
};

const Checkout = {
  open(){if(STATE.cart.length===0){Utils.showToast('Keranjang kosong','warning');return;}Cart.close();document.getElementById('checkoutDrawer')?.classList.add('is-open');document.getElementById('checkoutOverlay')?.classList.add('is-open');this.render();},
  close(){document.getElementById('checkoutDrawer')?.classList.remove('is-open');document.getElementById('checkoutOverlay')?.classList.remove('is-open');},
  render(){const body=document.getElementById('checkoutBody');if(!body)return;if(!STATE.customerName||!STATE.customerPhone){body.innerHTML=`<div class="login-box"><i class="fa-solid fa-user"></i><p style="margin-bottom:16px;color:var(--color-text-secondary);font-size:14px;">Isi nama & nomor HP dulu.</p></div><div class="form-field"><span>Nama Lengkap</span><input type="text" id="ckName" placeholder="Nama kamu"></div><div class="form-field"><span>Nomor HP (WhatsApp)</span><input type="tel" id="ckPhone" placeholder="08xxxxxxxxxx"></div><button class="btn btn-primary btn-block" id="ckSaveIdentityBtn">Lanjutkan</button>`;document.getElementById('ckSaveIdentityBtn')?.addEventListener('click',()=>{const name=document.getElementById('ckName')?.value.trim();const phone=document.getElementById('ckPhone')?.value.trim();if(!name||!phone){Utils.showToast('Isi nama dan HP','error');return;}if(!Security.validatePhone(phone)){Utils.showToast('Nomor HP tidak valid','error');return;}STATE.saveIdentity(name,phone);this.render();});return;}const disc=Promo.applyDiscount(STATE.cartTotal);body.innerHTML=`<div class="form-field" style="margin-bottom:20px;"><span>Pemesan</span><div style="display:flex;justify-content:space-between;align-items:center;"><strong>${Utils.escapeHtml(STATE.customerName)} — ${Utils.escapeHtml(STATE.customerPhone)}</strong><button class="btn btn-secondary" id="ckChangeIdentityBtn" style="padding:6px 10px;font-size:11px;">Ganti</button></div></div><span style="font-size:13px;font-weight:600;color:var(--color-text-secondary);display:block;margin-bottom:10px;">Metode Pengambilan</span><div class="fulfillment-options"><button class="fulfillment-option ${STATE.fulfillmentType==='pickup'?'is-selected':''}" data-fulfillment="pickup"><i class="fa-solid fa-store"></i> Ambil Sendiri</button><button class="fulfillment-option ${STATE.fulfillmentType==='delivery'?'is-selected':''}" data-fulfillment="delivery"><i class="fa-solid fa-motorcycle"></i> Diantar</button></div><div id="addressFieldWrap" ${STATE.fulfillmentType!=='delivery'?'hidden':''}><div class="form-field"><span>Alamat Pengiriman</span><textarea id="ckAddress" rows="3" placeholder="Alamat lengkap + patokan"></textarea></div></div><div class="summary-row" style="margin-top:16px;"><span>Total Belanja</span><span>${Utils.formatCurrency(STATE.cartTotal)}</span></div>${disc.discount>0?`<div class="summary-row" style="color:var(--color-success);"><span>Diskon (${disc.promo?.name||'Promo'})</span><span>-${Utils.formatCurrency(disc.discount)}</span></div><div class="summary-row summary-total"><span>Total Setelah Diskon</span><span>${Utils.formatCurrency(disc.totalAfterDiscount)}</span></div>`:''}<div class="payment-info-box"><strong>Transfer ke salah satu rekening ini:</strong>${CONFIG.PAYMENT_INFO.map(p=>`<div class="payment-info-row"><span>${p.label}</span><span>${p.value}</span></div>`).join('')}<p style="margin-top:8px;color:var(--color-text-muted);font-size:12px;">Upload bukti transfer di bawah</p></div><div class="upload-box" id="uploadProofBox"><input type="file" id="proofFileInput" accept="image/*" style="display:none;">${STATE.paymentProofUrl?`<img src="${STATE.paymentProofUrl}" alt="Bukti transfer">`:`<i class="fa-solid fa-camera" style="font-size:24px;display:block;margin-bottom:8px;"></i><span>Tap untuk upload bukti transfer</span>`}</div><button class="btn btn-primary btn-block" id="ckSubmitBtn" style="margin-top:20px;"><i class="fa-solid fa-paper-plane"></i> Kirim Pesanan</button>`;document.getElementById('ckChangeIdentityBtn')?.addEventListener('click',()=>{STATE.customerName='';STATE.customerPhone='';localStorage.removeItem(CONFIG.STORAGE_KEYS.CUSTOMER_NAME);localStorage.removeItem(CONFIG.STORAGE_KEYS.CUSTOMER_PHONE);this.render();});body.querySelectorAll('[data-fulfillment]').forEach(btn=>{btn.addEventListener('click',()=>{STATE.fulfillmentType=btn.dataset.fulfillment;this.render();});});const uploadBox=document.getElementById('uploadProofBox');const fileInput=document.getElementById('proofFileInput');uploadBox?.addEventListener('click',()=>fileInput?.click());fileInput?.addEventListener('change',async(e)=>{const file=e.target.files?.[0];if(!file)return;try{Security.validateImageFile(file);Utils.showLoading(true);const blob=await Utils.compressImage(file,800,0.75);const filename=`bukti_${Date.now()}_${Math.random().toString(36).slice(2,8)}.jpg`;const url=await API.uploadImage(blob,CONFIG.STORAGE_BUCKET_PAYMENT_PROOFS,filename);STATE.paymentProofUrl=url;this.render();Utils.showToast('Bukti transfer terupload','success');}catch(err){Utils.showToast('Gagal upload: '+err.message,'error');}finally{Utils.showLoading(false);}});document.getElementById('ckSubmitBtn')?.addEventListener('click',()=>this.submit());},
  async submit(){const address=document.getElementById('ckAddress')?.value.trim()||'';if(STATE.fulfillmentType==='delivery'&&!Security.validateAddress(address)){Utils.showToast('Isi alamat lengkap','error');return;}Utils.showLoading(true);try{const disc=Promo.applyDiscount(STATE.cartTotal);await API.insert('online_orders',{customer_name:STATE.customerName,customer_phone:STATE.customerPhone,fulfillment_type:STATE.fulfillmentType,address:STATE.fulfillmentType==='delivery'?address:null,items:STATE.cart,total_amount:disc.totalAfterDiscount,payment_proof_url:STATE.paymentProofUrl,status:'menunggu_konfirmasi',notes:disc.promo?`Diskon: ${disc.promo.name}`:null});STATE.cart=[];STATE.saveCart();STATE.paymentProofUrl=null;Cart.render();this.close();Utils.showToast('Pesanan berhasil dikirim!','success',4000);Orders.open();}catch(e){console.error(e);Utils.showToast('Gagal kirim: '+e.message,'error',5000);}finally{Utils.showLoading(false);}},
};

const Orders = {
  async open(){document.getElementById('ordersDrawer')?.classList.add('is-open');document.getElementById('ordersOverlay')?.classList.add('is-open');await this.load();OrderStatus.startWatching();},
  close(){document.getElementById('ordersDrawer')?.classList.remove('is-open');document.getElementById('ordersOverlay')?.classList.remove('is-open');OrderStatus.stopWatching();},
  async load(){const body=document.getElementById('ordersBody');if(!body)return;if(!STATE.customerPhone){body.innerHTML=`<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada riwayat.</p></div>`;return;}Utils.showLoading(true);try{const orders=await API.fetchAll('online_orders',{customer_phone:`eq.${STATE.customerPhone}`,order:'created_at.desc',limit:50});if(orders.length===0){body.innerHTML=`<div class="empty-state"><i class="fa-solid fa-receipt"></i><p>Belum ada pesanan.</p></div>`;return;}const label={menunggu_konfirmasi:'Menunggu Konfirmasi',dibayar:'Dibayar',diproses:'Diproses',siap:'Siap Diambil/Dikirim',selesai:'Selesai',dibatalkan:'Dibatalkan'};body.innerHTML=orders.map(o=>`<div class="order-card"><div class="order-card-header"><div><strong style="font-size:13px;">#${o.id}</strong><div style="font-size:11px;color:var(--color-text-muted);">${new Date(o.created_at).toLocaleString('id-ID')}</div></div><span class="order-status st-${o.status}">${label[o.status]||o.status}</span></div><div class="order-items-list">${(o.items||[]).map(i=>`${Utils.escapeHtml(i.name)} x${i.qty}`).join(', ')}</div><div class="summary-row" style="margin-bottom:0;"><span>${o.fulfillment_type==='delivery'?'🛵 Diantar':'🏪 Ambil Sendiri'}</span><strong style="color:var(--color-text);">${Utils.formatCurrency(o.total_amount)}</strong></div>${o.notes?`<div style="font-size:11px;color:var(--color-text-muted);margin-top:4px;">${Utils.escapeHtml(o.notes)}</div>`:''}</div>`).join('');}catch(e){body.innerHTML=`<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>Gagal memuat riwayat.</p></div>`;}finally{Utils.showLoading(false);}},
};

const OrderStatus = {
  intervalId:null,isWatching:false,
  startWatching(){if(this.isWatching)return;this.isWatching=true;this.checkStatus();this.intervalId=setInterval(()=>this.checkStatus(),30000);},
  stopWatching(){this.isWatching=false;if(this.intervalId){clearInterval(this.intervalId);this.intervalId=null;}},
  async checkStatus(){if(!STATE.customerPhone)return;try{const orders=await API.fetchAll('online_orders',{customer_phone:`eq.${STATE.customerPhone}`,order:'created_at.desc',limit:10});const pending=orders.filter(o=>o.status==='menunggu_konfirmasi'||o.status==='diproses');const badge=document.getElementById('orderStatusBadge');if(badge){if(pending.length>0){badge.textContent=pending.length;badge.hidden=false;}else{badge.hidden=true;}}const prev=JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.ORDER_STATUSES)||'{}');let changed=false;orders.forEach(o=>{if(prev[o.id]&&prev[o.id]!==o.status){changed=true;const label={menunggu_konfirmasi:'Menunggu Konfirmasi',dibayar:'Dibayar',diproses:'Diproses',siap:'Siap',selesai:'Selesai',dibatalkan:'Dibatalkan'};Utils.showToast(`Status #${o.id}: ${label[o.status]||o.status}`,'info',4000);}prev[o.id]=o.status;});if(changed)localStorage.setItem(CONFIG.STORAGE_KEYS.ORDER_STATUSES,JSON.stringify(prev));if(document.getElementById('ordersDrawer')?.classList.contains('is-open'))await Orders.load();}catch(e){console.warn('Gagal cek status:',e);}},
};

const Admin = {
  isAdminMode:false,
  toggleAdminMode(){this.isAdminMode=!this.isAdminMode;const btn=document.getElementById('adminToggleBtn');if(btn)btn.classList.toggle('is-active',this.isAdminMode);document.getElementById('adminPanel')?.classList.toggle('is-open',this.isAdminMode);document.getElementById('adminOverlay')?.classList.toggle('is-open',this.isAdminMode);if(this.isAdminMode)this.loadAdminData();},
  close(){this.isAdminMode=false;document.getElementById('adminToggleBtn')?.classList.remove('is-active');document.getElementById('adminPanel')?.classList.remove('is-open');document.getElementById('adminOverlay')?.classList.remove('is-open');},
  async loadAdminData(){Utils.showLoading(true);try{const products=await API.fetchAll('products',{deleted_at:'is.null',order:'name.asc'});this.renderProductTable(products);}catch(e){Utils.showToast('Gagal memuat data admin: '+e.message,'error');}finally{Utils.showLoading(false);}},
  renderProductTable(products){const c=document.getElementById('adminProductList');if(!c)return;c.innerHTML=`<div style="margin-bottom:16px;display:flex;gap:8px;flex-wrap:wrap;"><button class="btn btn-primary" id="adminAddProductBtn"><i class="fa-solid fa-plus"></i> Tambah Produk</button><button class="btn btn-secondary" id="adminRefreshBtn"><i class="fa-solid fa-sync"></i> Refresh</button></div><div class="admin-table-wrap"><table class="admin-table"><thead><tr><th>Nama</th><th>Kategori</th><th style="text-align:right;">Harga</th><th style="text-align:center;">Stok</th><th style="text-align:center;">Aksi</th></tr></thead><tbody>${products.map(p=>`<tr><td>${Utils.escapeHtml(p.name)}</td><td>${Utils.escapeHtml(p.category||'-')}</td><td style="text-align:right;">${Utils.formatCurrency(p.price)}</td><td style="text-align:center;"><span style="color:${p.stock<=5?'var(--color-danger)':'inherit'}">${p.stock}</span></td><td style="text-align:center;"><button class="admin-edit-btn" data-id="${p.id}"><i class="fa-solid fa-pen"></i></button><button class="admin-delete-btn" data-id="${p.id}"><i class="fa-solid fa-trash"></i></button></td></tr>`).join('')}</tbody></table></div>`;document.getElementById('adminAddProductBtn')?.addEventListener('click',()=>this.showProductForm());document.getElementById('adminRefreshBtn')?.addEventListener('click',()=>this.loadAdminData());c.querySelectorAll('.admin-edit-btn').forEach(btn=>{btn.addEventListener('click',()=>{const id=btn.dataset.id;const product=STATE.products.find(p=>String(p.id)===String(id));if(product)this.showProductForm(product);});});c.querySelectorAll('.admin-delete-btn').forEach(btn=>{btn.addEventListener('click',async()=>{if(!confirm('Yakin hapus produk ini?'))return;const id=btn.dataset.id;Utils.showLoading(true);try{await API.update('products',{id:`eq.${id}`},{deleted_at:new Date().toISOString()});Utils.showToast('Produk dihapus','success');await Catalog.load();await this.loadAdminData();}catch(e){Utils.showToast('Gagal hapus: '+e.message,'error');}finally{Utils.showLoading(false);}});});},
  showProductForm(product=null){const c=document.getElementById('adminProductList');if(!c)return;const isEdit=!!product;const html=`<div class="admin-form-container"><h3 style="margin-bottom:12px;">${isEdit?'Edit':'Tambah'} Produk</h3><div class="form-field"><span>Nama Produk *</span><input type="text" id="adminProductName" value="${isEdit?Utils.escapeHtml(product.name):''}"></div><div class="form-field"><span>Kategori</span><input type="text" id="adminProductCategory" value="${isEdit?Utils.escapeHtml(product.category||''):''}"></div><div class="form-field"><span>Harga (Rp) *</span><input type="number" id="adminProductPrice" value="${isEdit?product.price:''}"></div><div class="form-field"><span>Stok *</span><input type="number" id="adminProductStock" value="${isEdit?product.stock:''}"></div><div class="form-field"><span>Emoji</span><input type="text" id="adminProductEmoji" value="${isEdit?Utils.escapeHtml(product.emoji||'📦'):'📦'}"></div><div class="form-field"><span>URL Gambar (opsional)</span><input type="url" id="adminProductImage" value="${isEdit?Utils.escapeHtml(product.image_url||''):''}"></div><div style="display:flex;gap:8px;margin-top:8px;"><button class="btn btn-primary" id="adminSaveProductBtn"><i class="fa-solid fa-save"></i> ${isEdit?'Update':'Simpan'}</button><button class="btn btn-secondary" id="adminCancelFormBtn">Batal</button></div></div>`;const existing=c.querySelector('.admin-form-container');if(existing){existing.outerHTML=html;}else{const div=document.createElement('div');div.innerHTML=html;c.prepend(div.firstElementChild);}document.getElementById('adminSaveProductBtn')?.addEventListener('click',async()=>{const name=document.getElementById('adminProductName')?.value.trim();const price=parseFloat(document.getElementById('adminProductPrice')?.value);const stock=parseInt(document.getElementById('adminProductStock')?.value);const category=document.getElementById('adminProductCategory')?.value.trim()||null;const emoji=document.getElementById('adminProductEmoji')?.value.trim()||'📦';const image_url=document.getElementById('adminProductImage')?.value.trim()||null;if(!name||!price||isNaN(stock)){Utils.showToast('Isi nama,harga,stok dengan benar','error');return;}Utils.showLoading(true);try{if(isEdit){await API.update('products',{id:`eq.${product.id}`},{name,price,stock,category,emoji,image_url});Utils.showToast('Produk diupdate','success');}else{await API.insert('products',{name,price,stock,category,emoji,image_url});Utils.showToast('Produk ditambahkan','success');}await Catalog.load();await this.loadAdminData();}catch(e){Utils.showToast('Gagal simpan: '+e.message,'error');}finally{Utils.showLoading(false);}});document.getElementById('adminCancelFormBtn')?.addEventListener('click',()=>{this.loadAdminData();});},
};

const AdminOrders = {
  orders:[],currentStatus:'all',
  open(){if(!this.checkAdminAccess())return;document.getElementById('adminOrdersDrawer')?.classList.add('is-open');document.getElementById('adminOrdersOverlay')?.classList.add('is-open');this.load();},
  close(){document.getElementById('adminOrdersDrawer')?.classList.remove('is-open');document.getElementById('adminOrdersOverlay')?.classList.remove('is-open');},
  checkAdminAccess(){const p=localStorage.getItem('admin_password');if(p===CONFIG.ADMIN_PASSWORD)return true;const input=prompt('Masukkan password admin:');if(input===CONFIG.ADMIN_PASSWORD){localStorage.setItem('admin_password',CONFIG.ADMIN_PASSWORD);return true;}Utils.showToast('Password salah!','error');return false;},
  async load(){Utils.showLoading(true);try{this.orders=await API.fetchAll('online_orders',{order:'created_at.desc',limit:100});this.render();this.updateBadge();}catch(e){console.error(e);Utils.showToast('Gagal memuat pesanan','error');}finally{Utils.showLoading(false);}},
  render(){const c=document.getElementById('adminOrdersContent');if(!c)return;const stats={total:this.orders.length,menunggu:this.orders.filter(o=>o.status==='menunggu_konfirmasi').length,diproses:this.orders.filter(o=>o.status==='diproses').length,selesai:this.orders.filter(o=>o.status==='selesai').length};let filtered=this.orders;if(this.currentStatus!=='all')filtered=filtered.filter(o=>o.status===this.currentStatus);c.innerHTML=`<div class="admin-stats"><div class="stat-card"><span class="stat-label">Total Pesanan</span><span class="stat-number">${stats.total}</span></div><div class="stat-card stat-warning"><span class="stat-label">⏳ Menunggu</span><span class="stat-number">${stats.menunggu}</span></div><div class="stat-card stat-primary"><span class="stat-label">📦 Diproses</span><span class="stat-number">${stats.diproses}</span></div><div class="stat-card stat-success"><span class="stat-label">✅ Selesai</span><span class="stat-number">${stats.selesai}</span></div></div><div class="admin-order-filters"><button class="filter-btn ${this.currentStatus==='all'?'active':''}" data-status="all">Semua (${stats.total})</button><button class="filter-btn ${this.currentStatus==='menunggu_konfirmasi'?'active':''}" data-status="menunggu_konfirmasi">⏳ Menunggu (${stats.menunggu})</button><button class="filter-btn ${this.currentStatus==='dibayar'?'active':''}" data-status="dibayar">💳 Dibayar</button><button class="filter-btn ${this.currentStatus==='diproses'?'active':''}" data-status="diproses">📦 Diproses</button><button class="filter-btn ${this.currentStatus==='siap'?'active':''}" data-status="siap">✅ Siap</button><button class="filter-btn ${this.currentStatus==='selesai'?'active':''}" data-status="selesai">🏁 Selesai</button><button class="filter-btn ${this.currentStatus==='dibatalkan'?'active':''}" data-status="dibatalkan">❌ Dibatalkan</button></div><div class="admin-order-list">${filtered.length===0?`<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>Tidak ada pesanan</p></div>`:filtered.map(o=>this._orderCardHtml(o)).join('')}</div>`;c.querySelectorAll('.filter-btn').forEach(btn=>{btn.addEventListener('click',(e)=>{e.preventDefault();this.currentStatus=btn.dataset.status;this.render();});});c.querySelectorAll('.order-action-btn').forEach(btn=>{btn.addEventListener('click',async(e)=>{e.preventDefault();e.stopPropagation();const id=parseInt(btn.dataset.id);const action=btn.dataset.action;await this.updateStatus(id,action);});});c.querySelectorAll('.view-proof-btn').forEach(btn=>{btn.addEventListener('click',(e)=>{e.preventDefault();e.stopPropagation();const url=btn.dataset.url;if(url)window.open(url,'_blank');});});},
  _orderCardHtml(order){const label={menunggu_konfirmasi:'⏳ Menunggu Konfirmasi',dibayar:'💳 Dibayar',diproses:'📦 Diproses',siap:'✅ Siap',selesai:'🏁 Selesai',dibatalkan:'❌ Dibatalkan'};const cls={menunggu_konfirmasi:'status-warning',dibayar:'status-info',diproses:'status-primary',siap:'status-success',selesai:'status-success',dibatalkan:'status-danger'};const actions=[];if(order.status==='menunggu_konfirmasi'){actions.push({label:'✅ Konfirmasi Bayar',action:'dibayar',class:'btn-success'});actions.push({label:'❌ Tolak',action:'dibatalkan',class:'btn-danger'});}if(order.status==='dibayar'){actions.push({label:'📦 Proses',action:'diproses',class:'btn-primary'});}if(order.status==='diproses'){actions.push({label:'✅ Siap',action:'siap',class:'btn-success'});}if(order.status==='siap'){actions.push({label:'🏁 Selesai',action:'selesai',class:'btn-secondary'});}return `<div class="admin-order-card"><div class="admin-order-header"><div><span class="order-id">#${order.id}</span><span class="order-date">${new Date(order.created_at).toLocaleString('id-ID')}</span></div><span class="order-status-badge ${cls[order.status]}">${label[order.status]}</span></div><div class="admin-order-body"><div class="order-customer-info"><strong>${Utils.escapeHtml(order.customer_name)}</strong><span>📱 ${Utils.escapeHtml(order.customer_phone)}</span></div><div class="order-delivery-info"><span>${order.fulfillment_type==='delivery'?'🛵 Diantar':'🏪 Ambil Sendiri'}</span>${order.address?`<span class="address">📍 ${Utils.escapeHtml(order.address)}</span>`:''}</div><div class="order-items-list">${(order.items||[]).map(i=>`<div class="order-item-row"><span>${Utils.escapeHtml(i.name)}</span><span>${i.qty} × ${Utils.formatCurrency(i.price)}</span></div>`).join('')}</div><div class="order-total-amount"><strong>Total: ${Utils.formatCurrency(order.total_amount)}</strong></div>${order.payment_proof_url?`<button class="btn btn-sm btn-info view-proof-btn" data-url="${order.payment_proof_url}"><i class="fa-solid fa-image"></i> Lihat Bukti Transfer</button>`:'<span class="no-proof">Tidak ada bukti transfer</span>'}${order.notes?`<div class="order-note">📝 ${Utils.escapeHtml(order.notes)}</div>`:''}</div><div class="admin-order-footer">${actions.map(a=>`<button class="btn btn-sm ${a.class} order-action-btn" data-id="${order.id}" data-action="${a.action}">${a.label}</button>`).join('')}</div></div>`;},
  async updateStatus(id,newStatus){console.log('Update:',id,newStatus);if(!confirm(`Ubah status #${id} menjadi "${newStatus}"?`))return;Utils.showLoading(true);try{await API.update('online_orders',{id:`eq.${id}`},{status:newStatus,updated_at:new Date().toISOString()});if(newStatus==='diproses')await this.updateStock(id);Utils.showToast(`Status #${id} berhasil diubah`,'success');await this.load();}catch(e){console.error(e);Utils.showToast('Gagal update status','error');}finally{Utils.showLoading(false);}},
  async updateStock(id){const order=this.orders.find(o=>o.id===id);if(!order)return;try{for(const item of(order.items||[])){const p=STATE.products.find(pr=>String(pr.id)===String(item.productId));if(p){const newStock=p.stock-item.qty;await API.update('products',{id:`eq.${item.productId}`},{stock:Math.max(0,newStock)});}}await Catalog.load();Utils.showToast('Stok produk diupdate','success');}catch(e){console.error('Gagal update stok:',e);}},
  updateBadge(){const count=this.orders.filter(o=>o.status==='menunggu_konfirmasi').length;const badge=document.getElementById('adminOrdersBadge');if(badge){badge.textContent=count;badge.style.display=count>0?'inline':'none';}},
};

function initEvents(){
  document.getElementById('cartBtn')?.addEventListener('click',()=>Cart.open());
  document.getElementById('closeCartBtn')?.addEventListener('click',()=>Cart.close());
  document.getElementById('cartOverlay')?.addEventListener('click',()=>Cart.close());
  document.getElementById('checkoutBtn')?.addEventListener('click',()=>Checkout.open());
  document.getElementById('closeCheckoutBtn')?.addEventListener('click',()=>Checkout.close());
  document.getElementById('checkoutOverlay')?.addEventListener('click',()=>Checkout.close());
  document.getElementById('ordersBtn')?.addEventListener('click',()=>Orders.open());
  document.getElementById('closeOrdersBtn')?.addEventListener('click',()=>Orders.close());
  document.getElementById('ordersOverlay')?.addEventListener('click',()=>Orders.close());
  document.getElementById('adminToggleBtn')?.addEventListener('click',()=>Admin.toggleAdminMode());
  document.getElementById('closeAdminBtn')?.addEventListener('click',()=>Admin.close());
  document.getElementById('adminOverlay')?.addEventListener('click',()=>Admin.close());
  document.getElementById('adminOrdersBtn')?.addEventListener('click',()=>AdminOrders.open());
  document.getElementById('closeAdminOrdersBtn')?.addEventListener('click',()=>AdminOrders.close());
  document.getElementById('adminOrdersOverlay')?.addEventListener('click',()=>AdminOrders.close());
  document.getElementById('searchInput')?.addEventListener('input',Utils.debounce((e)=>{STATE.searchQuery=e.target.value;Catalog.render();},250));
}

function checkSupabaseConfigured(){
  if(API.isConfigured())return true;
  const key=prompt('Masukkan Supabase Anon Key:');
  if(key){localStorage.setItem(CONFIG.STORAGE_KEYS.SUPABASE_KEY,key.trim());CONFIG.SUPABASE_ANON_KEY=key.trim();return true;}
  Utils.showToast('Aplikasi butuh Supabase Anon Key','error',6000);
  return false;
}

let lastOrderCount=0;
async function checkNewOrders(){
  try{
    const orders=await API.fetchAll('online_orders',{status:'eq.menunggu_konfirmasi',limit:100});
    const count=orders.length;
    if(count>lastOrderCount&&lastOrderCount>0){Utils.showToast(`🔔 Ada ${count-lastOrderCount} pesanan baru!`,'success',5000);try{new Audio('data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoAAACBhYqFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYaFhYWFhQ==').play();}catch(e){}}
    lastOrderCount=count;
    const badge=document.getElementById('adminOrdersBadge');
    if(badge){badge.textContent=count;badge.style.display=count>0?'inline':'none';}
  }catch(e){}
}

document.addEventListener('DOMContentLoaded',async()=>{
  initEvents();
  LazyLoader.init();
  Cart.render();
  if(!checkSupabaseConfigured())return;
  await Catalog.load();
  await Promo.loadPromos();
  Promo.renderPromoBadge();
  if(STATE.customerPhone)OrderStatus.startWatching();
  setInterval(checkNewOrders,30000);
  checkNewOrders();
  console.log('🛍️ MBUN COLLECTION Online Store loaded!');
});

window.__MBUN={STATE,API,Catalog,Cart,Checkout,Orders,Admin,AdminOrders,Promo,OrderStatus,Security,LazyLoader};
