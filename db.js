// ═══════════════════════════════════════════════════════════════════════
//  AMBEY POOJA STORE — db.js  v3.0
//  Google Sheets = single source of truth for products, orders, feedback
//  localStorage  = settings, cart, offers, session cache only
// ═══════════════════════════════════════════════════════════════════════

const DB = {

  KEYS: {
    products:  'aps_products',
    orders:    'aps_orders',
    offers:    'aps_offers',
    feedback:  'aps_feedback',
    settings:  'aps_settings',
    cart:      'aps_cart',
    pCache:    'aps_products_cache',   // products cache from Sheets
    pCacheTs:  'aps_products_cache_ts',// timestamp of last fetch
  },

  CACHE_TTL: 5 * 60 * 1000, // 5 minutes cache

  // ── generic helpers ──────────────────────────────────────────────────
  get(key)      { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) { console.warn('localStorage full', e); } },

  // ── settings ─────────────────────────────────────────────────────────
  getSettings()  { return this.get(this.KEYS.settings) || this._defaultSettings(); },
  saveSettings(s){ this.set(this.KEYS.settings, s); },

  sheetsUrl()    { return this.getSettings().sheetsUrl || ''; },
  hasSheets()    { const u = this.sheetsUrl(); return u && !u.includes('XXXX') && u.startsWith('https://'); },

  // ── PRODUCTS — reads from Sheets, falls back to localStorage seed ─────

  // Async: always call with await in store/admin
  async getProductsAsync() {
    if (!this.hasSheets()) {
      // No Sheets configured — use localStorage seed (demo mode)
      return this.get(this.KEYS.products) || this._seedProducts();
    }

    // Check cache freshness
    const cacheTs = this.get(this.KEYS.pCacheTs) || 0;
    const cached  = this.get(this.KEYS.pCache);
    if (cached && (Date.now() - cacheTs) < this.CACHE_TTL) {
      return cached;
    }

    // Fetch from Sheets
    try {
      const url = `${this.sheetsUrl()}?action=getProducts`;
      const resp = await fetch(url, { cache: 'no-store' });
      const data = await resp.json();
      if (Array.isArray(data) && data.length >= 0) {
        this.set(this.KEYS.pCache, data);
        this.set(this.KEYS.pCacheTs, Date.now());
        return data;
      }
    } catch(e) {
      console.warn('Sheets fetch failed, using cache/seed', e);
    }

    // Fallback: stale cache or seed
    return cached || this.get(this.KEYS.products) || this._seedProducts();
  },

  // Sync fallback for code that hasn't been updated to async yet
  getProducts() {
    const cached = this.get(this.KEYS.pCache);
    if (cached && cached.length > 0) return cached;
    return this.get(this.KEYS.products) || this._seedProducts();
  },

  getProduct(id) { return this.getProducts().find(p => p.id === id) || null; },

  // Save product to Sheets (and update local cache)
  async addProduct(p) {
    p.id        = 'PRD-' + Date.now();
    p.createdAt = new Date().toISOString();
    p.sold      = 0;

    if (this.hasSheets()) {
      try {
        const resp = await fetch(this.sheetsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'saveProduct', product: p })
        });
        const result = await resp.json();
        if (result.success) {
          this._invalidateProductCache();
          return p;
        }
      } catch(e) { console.warn('addProduct to Sheets failed', e); }
    }

    // Fallback: localStorage only
    const list = this.getProducts();
    list.unshift(p);
    this.set(this.KEYS.products, list);
    this.set(this.KEYS.pCache, list);
    return p;
  },

  async updateProduct(id, updates) {
    if (this.hasSheets()) {
      try {
        const resp = await fetch(this.sheetsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'updateProduct', id, updates })
        });
        await resp.json();
        this._invalidateProductCache();
        return true;
      } catch(e) { console.warn('updateProduct to Sheets failed', e); }
    }

    // Fallback: localStorage
    const list = this.getProducts();
    const idx  = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    this.set(this.KEYS.products, list);
    this.set(this.KEYS.pCache, list);
    return list[idx];
  },

  async deleteProduct(id) {
    if (this.hasSheets()) {
      try {
        await fetch(this.sheetsUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deleteProduct', id })
        });
        this._invalidateProductCache();
        return;
      } catch(e) { console.warn('deleteProduct to Sheets failed', e); }
    }
    const list = this.getProducts().filter(p => p.id !== id);
    this.set(this.KEYS.products, list);
    this.set(this.KEYS.pCache, list);
  },

  async decrementStock(id, qty = 1) {
    const p = this.getProduct(id);
    if (!p) return;
    await this.updateProduct(id, {
      stock: Math.max(0, p.stock - qty),
      sold:  (p.sold || 0) + qty
    });
  },

  _invalidateProductCache() {
    this.set(this.KEYS.pCacheTs, 0); // force re-fetch next time
  },

  saveProducts(list) {
    this.set(this.KEYS.products, list);
    this.set(this.KEYS.pCache, list);
  },

  // ── OFFERS — still localStorage (admin-only, no cross-device needed) ─
  getOffers()   { return this.get(this.KEYS.offers) || this._seedOffers(); },
  saveOffers(o) { this.set(this.KEYS.offers, o); },

  getActiveOffer() {
    const now = new Date();
    return this.getOffers().find(o =>
      o.active &&
      new Date(o.startDate) <= now &&
      new Date(o.endDate)   >= now
    ) || null;
  },

  addOffer(o) {
    const list = this.getOffers();
    o.id = 'OFF-' + Date.now();
    o.createdAt = new Date().toISOString();
    list.unshift(o);
    this.saveOffers(list);
    return o;
  },

  updateOffer(id, updates) {
    const list = this.getOffers();
    const idx  = list.findIndex(o => o.id === id);
    if (idx !== -1) { list[idx] = { ...list[idx], ...updates }; this.saveOffers(list); }
  },

  deleteOffer(id) { this.saveOffers(this.getOffers().filter(o => o.id !== id)); },

  // ── ORDERS ────────────────────────────────────────────────────────────
  getOrders()   { return this.get(this.KEYS.orders) || []; },
  saveOrders(o) { this.set(this.KEYS.orders, o); },

  async addOrder(o) {
    const list  = this.getOrders();
    o.id        = 'APS-' + Date.now().toString().slice(-6);
    o.createdAt = new Date().toISOString();
    o.status    = 'Placed';
    list.unshift(o);
    this.saveOrders(list);

    // Decrement stock
    for (const item of (o.items || [])) {
      await this.decrementStock(item.id, item.qty);
    }

    // Push to Sheets
    if (this.hasSheets()) {
      fetch(this.sheetsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveOrder', ...o })
      }).catch(() => {});
    }
    return o;
  },

  updateOrderStatus(id, status) {
    const list = this.getOrders();
    const idx  = list.findIndex(o => o.id === id);
    if (idx !== -1) {
      list[idx].status    = status;
      list[idx].updatedAt = new Date().toISOString();
      this.saveOrders(list);
    }
    if (this.hasSheets()) {
      fetch(this.sheetsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'updateStatus', orderId: id, status })
      }).catch(() => {});
    }
  },

  // ── FEEDBACK ──────────────────────────────────────────────────────────
  getFeedback()    { return this.get(this.KEYS.feedback) || this._seedFeedback(); },
  addFeedback(f)   {
    const list = this.getFeedback();
    f.id = 'FB-' + Date.now();
    f.createdAt = new Date().toISOString();
    f.approved  = false;
    list.unshift(f);
    this.set(this.KEYS.feedback, list);
    if (this.hasSheets()) {
      fetch(this.sheetsUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'saveFeedback', ...f })
      }).catch(() => {});
    }
  },
  approveFeedback(id) {
    const l = this.getFeedback();
    const i = l.findIndex(f => f.id === id);
    if (i > -1) { l[i].approved = true; this.set(this.KEYS.feedback, l); }
  },
  deleteFeedback(id) { this.set(this.KEYS.feedback, this.getFeedback().filter(f => f.id !== id)); },

  // ── CART ──────────────────────────────────────────────────────────────
  getCart()   { return this.get(this.KEYS.cart) || []; },
  saveCart(c) { this.set(this.KEYS.cart, c); },

  // ── DEFAULT SETTINGS ─────────────────────────────────────────────────
  _defaultSettings() {
    return {
      storeName:      'Ambey Pooja Store',
      tagline:        'Devotion Delivered to Your Doorstep',
      phone:          '9999999999',
      whatsapp:       '919999999999',
      address:        'Green Field Colony, Faridabad, Haryana',
      deliveryRadius: '5 km',
      hours:          '6:00 AM – 9:00 PM, All Days',
      upiId:          'ambeypooja@okicici',
      razorpayKey:    'rzp_test_XXXXXXXXXXXXXXXX',
      sheetsUrl:      '',
      imgbbKey:       '',
      deliveryFree:   399,
      deliveryCharge: 30,
    };
  },

  // ── SEED DATA (used only when Sheets not configured) ─────────────────
  _seedProducts() {
    const p = [
      { id:'PRD-001', name:'Mitti Diya (Pack of 6)', category:'Diyas & Lamps', price:30, mrp:40, stock:15, sold:22, emoji:'🪔', description:'Pure clay diyas hand-crafted by local artisans. Perfect for daily aarti and festival lighting.', weight:'200g', size:'3 inch diameter', height:'2 cm', dimensions:'7.5cm × 7.5cm × 2cm', material:'Pure clay', color:'Terracotta', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z' },
      { id:'PRD-002', name:'Marigold Garland (Fresh)', category:'Flowers & Garlands', price:50, mrp:60, stock:3, sold:41, emoji:'🌼', description:'Fresh marigold garlands handmade each morning. Ideal for deity decoration.', weight:'150g', size:'2 feet', height:'N/A', dimensions:'60cm length', material:'Fresh flowers', color:'Golden Yellow', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z' },
      { id:'PRD-003', name:'Cycle Agarbatti (100 pcs)', category:'Incense & Dhoop', price:45, mrp:55, stock:0, sold:87, emoji:'🕯️', description:'Long-lasting fragrant incense sticks. Burns 45 minutes each.', weight:'100g', size:'9 inch', height:'N/A', dimensions:'23cm per stick', material:'Natural herbs', color:'Brown', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z' },
      { id:'PRD-004', name:'Rudraksha Mala (108 Beads)', category:'Mala & Beads', price:250, mrp:350, stock:8, sold:12, emoji:'📿', description:'Authentic 5-mukhi rudraksha mala for daily jaap.', weight:'45g', size:'108 beads', height:'N/A', dimensions:'60cm', material:'Rudraksha seeds', color:'Brown', images:[], popular:false, active:true, createdAt:'2025-01-01T00:00:00Z' },
      { id:'PRD-005', name:'Complete Pooja Thali Set', category:'Pooja Sets', price:199, mrp:299, stock:5, sold:18, emoji:'🪄', description:'Stainless steel thali with diya, bell, sindoor box, kumkum plate and agarbatti stand.', weight:'350g', size:'10 inch plate', height:'3 cm', dimensions:'25cm × 25cm × 3cm', material:'Stainless steel 202', color:'Silver', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z' },
      { id:'PRD-006', name:'Gangajal (500 ml)', category:'Sacred Water', price:60, mrp:75, stock:20, sold:34, emoji:'🥛', description:'Pure Gangajal from Haridwar Har ki Pauri Ghat. Sealed bottle.', weight:'540g', size:'500 ml', height:'18 cm', dimensions:'6cm × 6cm × 18cm', material:'Sealed plastic', color:'Transparent', images:[], popular:false, active:true, createdAt:'2025-01-01T00:00:00Z' },
    ];
    this.set(this.KEYS.products, p);
    this.set(this.KEYS.pCache, p);
    this.set(this.KEYS.pCacheTs, Date.now());
    return p;
  },

  _seedOffers() {
    const now = new Date();
    const offers = [{
      id:'OFF-001', name:'Navratri Mahotsav 2025', festival:'Navratri',
      subtitle:'9 Nights of Divine Deals', description:'Special discounts on all pooja items during Navratri.',
      discountType:'percent', discountValue:20,
      startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()-1).toISOString().split('T')[0],
      endDate:   new Date(now.getFullYear(), now.getMonth(), now.getDate()+7).toISOString().split('T')[0],
      bannerColor:'#C0392B', accentColor:'#F5C842', emoji:'🪔', active:true,
      applyTo:'all', productIds:[], createdAt: new Date().toISOString(),
    }];
    this.saveOffers(offers);
    return offers;
  },

  _seedFeedback() {
    const fb = [
      { id:'FB-001', name:'Sunita Devi', rating:5, message:'Bahut achhe products hain! Diyas bade sundar the. Same day delivery mili 🙏', orderId:'APS-100101', createdAt:'2025-01-10T10:00:00Z', approved:true },
      { id:'FB-002', name:'Ramesh Sharma', rating:5, message:'Gangajal ekdum pure mila. Packaging bhi achi thi. Ambey Pooja Store best hai!', orderId:'APS-100089', createdAt:'2025-01-09T14:00:00Z', approved:true },
      { id:'FB-003', name:'Anita Gupta', rating:4, message:'Agarbatti ki fragrance bahut achi hai. Will order again!', orderId:'APS-100112', createdAt:'2025-01-08T09:00:00Z', approved:true },
    ];
    this.set(this.KEYS.feedback, fb);
    return fb;
  }
};
