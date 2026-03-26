// ═══════════════════════════════════════════════════════════
//  AMBEY POOJA STORE — Shared In-Browser Database (localStorage)
//  All 3 pages (store, admin) share this module via <script src="db.js">
// ═══════════════════════════════════════════════════════════

const DB = {
  // ── keys ──────────────────────────────────────────────
  KEYS: {
    products:  'aps_products',
    orders:    'aps_orders',
    offers:    'aps_offers',
    feedback:  'aps_feedback',
    settings:  'aps_settings',
    cart:      'aps_cart',
  },

  // ── generic helpers ───────────────────────────────────
  get(key)        { try { return JSON.parse(localStorage.getItem(key)) || null; } catch{ return null; } },
  set(key, val)   { localStorage.setItem(key, JSON.stringify(val)); },

  // ── products ──────────────────────────────────────────
  getProducts()   { return this.get(this.KEYS.products) || this._seedProducts(); },
  saveProducts(p) { this.set(this.KEYS.products, p); },
  getProduct(id)  { return this.getProducts().find(p => p.id === id) || null; },

  addProduct(p) {
    const list = this.getProducts();
    p.id = 'PRD-' + Date.now();
    p.createdAt = new Date().toISOString();
    p.sold = 0;
    list.unshift(p);
    this.saveProducts(list);
    return p;
  },

  updateProduct(id, updates) {
    const list = this.getProducts();
    const idx  = list.findIndex(p => p.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...updates, updatedAt: new Date().toISOString() };
    this.saveProducts(list);
    return list[idx];
  },

  deleteProduct(id) {
    const list = this.getProducts().filter(p => p.id !== id);
    this.saveProducts(list);
  },

  decrementStock(id, qty = 1) {
    const p = this.getProduct(id);
    if (!p) return false;
    const newStock = Math.max(0, p.stock - qty);
    this.updateProduct(id, { stock: newStock, sold: (p.sold || 0) + qty });
    return true;
  },

  // ── offers ────────────────────────────────────────────
  getOffers()   { return this.get(this.KEYS.offers) || this._seedOffers(); },
  saveOffers(o) { this.set(this.KEYS.offers, o); },

  getActiveOffer() {
    const now = new Date();
    return this.getOffers().find(o => o.active && new Date(o.startDate) <= now && new Date(o.endDate) >= now) || null;
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
    if (idx === -1) return;
    list[idx] = { ...list[idx], ...updates };
    this.saveOffers(list);
  },

  deleteOffer(id) { this.saveOffers(this.getOffers().filter(o => o.id !== id)); },

  // ── orders ────────────────────────────────────────────
  getOrders()   { return this.get(this.KEYS.orders) || []; },
  saveOrders(o) { this.set(this.KEYS.orders, o); },

  addOrder(o) {
    const list = this.getOrders();
    o.id        = 'APS-' + Date.now().toString().slice(-6);
    o.createdAt = new Date().toISOString();
    o.status    = 'Placed';
    list.unshift(o);
    this.saveOrders(list);
    // decrement stock for each item
    (o.items || []).forEach(i => this.decrementStock(i.id, i.qty));
    return o;
  },

  updateOrderStatus(id, status) {
    const list = this.getOrders();
    const idx  = list.findIndex(o => o.id === id);
    if (idx !== -1) { list[idx].status = status; list[idx].updatedAt = new Date().toISOString(); this.saveOrders(list); }
  },

  // ── feedback ──────────────────────────────────────────
  getFeedback()    { return this.get(this.KEYS.feedback) || this._seedFeedback(); },
  addFeedback(f)   { const list = this.getFeedback(); f.id = 'FB-'+Date.now(); f.createdAt=new Date().toISOString(); f.approved=false; list.unshift(f); this.set(this.KEYS.feedback,list); },
  approveFeedback(id) { const l=this.getFeedback(); const i=l.findIndex(f=>f.id===id); if(i>-1){l[i].approved=true; this.set(this.KEYS.feedback,l);} },
  deleteFeedback(id)  { this.set(this.KEYS.feedback, this.getFeedback().filter(f=>f.id!==id)); },

  // ── settings ──────────────────────────────────────────
  getSettings()  {
    const s = this.get(this.KEYS.settings);
    if (!s || (s._v||0) < 2) {
      const fresh = this._defaultSettings();
      this.saveSettings(fresh);
      return fresh;
    }
    return s;
  },
  saveSettings(s){ this.set(this.KEYS.settings, s); },

  // ── cart ──────────────────────────────────────────────
  getCart()      { return this.get(this.KEYS.cart) || []; },
  saveCart(c)    { this.set(this.KEYS.cart, c); },

  // ── SEEDS ─────────────────────────────────────────────
  _defaultSettings() {
    return {
      _v:           2,
      storeName:    'Ambey Pooja Store',
      tagline:      'Devotion Delivered to Your Doorstep',
      phone:        '9318388626',
      whatsapp:     '919318388626',
      address:      'Green Field Colony, Faridabad, Haryana',
      deliveryRadius:'5 km',
      hours:        '6:00 AM – 9:00 PM, All Days',
      upiId:        'ambeypooja@okicici',
      razorpayKey:  'rzp_test_XXXXXXXXXXXXXXXX',
      sheetsUrl:    '',
      imgbbKey:     '',
      deliveryFree: 399,
      deliveryCharge: 30,
    };
  },

  _seedProducts() {
    const products = [
      { id:'PRD-001', name:'Mitti Diya (Pack of 6)', category:'Diyas & Lamps', price:30, mrp:40, stock:15, sold:22, emoji:'🪔', description:'Pure clay diyas hand-crafted by local artisans. Perfect for daily aarti and festival lighting. Each diya is 3 inches in diameter.', weight:'200g', size:'3 inch diameter', height:'2 cm', dimensions:'7.5cm × 7.5cm × 2cm', material:'Pure clay / Mitti', color:'Terracotta', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-002', name:'Marigold Garland (Fresh)', category:'Flowers & Garlands', price:50, mrp:60, stock:3, sold:41, emoji:'🌼', description:'Fresh marigold (genda phool) garlands handmade each morning. Ideal for deity decoration, door torans and festival decoration.', weight:'150g', size:'2 feet length', height:'N/A', dimensions:'60cm length', material:'Fresh Marigold flowers', color:'Golden Yellow / Orange', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-003', name:'Cycle Agarbatti (100 pcs)', category:'Incense & Dhoop', price:45, mrp:55, stock:0, sold:87, emoji:'🕯️', description:'Long-lasting fragrant incense sticks. Burns for 45 minutes each. Suitable for all deities. Available in Chandan, Rose, Jasmine fragrances.', weight:'100g', size:'9 inch length', height:'N/A', dimensions:'23cm × 1.5cm per stick', material:'Bamboo core with natural herbs', color:'Brown / Beige', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-004', name:'Rudraksha Mala (108 Beads)', category:'Mala & Beads', price:250, mrp:350, stock:8, sold:12, emoji:'📿', description:'Authentic 5-mukhi (five faced) rudraksha mala. 108+1 beads strung on silk thread. Ideal for Shiva mantra jaap, meditation and daily wear.', weight:'45g', size:'Standard 108 bead mala', height:'N/A', dimensions:'60cm circumference', material:'Natural Rudraksha seeds', color:'Brown', images:[], popular:false, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-005', name:'Complete Pooja Thali Set', category:'Pooja Sets', price:199, mrp:299, stock:5, sold:18, emoji:'🪄', description:'Complete stainless steel pooja thali with all accessories. Includes: 1 diya, 1 bell (ghanti), 1 sindoor box, 1 kumkum plate, 1 agarbatti stand, 1 small bowl (katori) for water.', weight:'350g', size:'10 inch diameter plate', height:'3 cm (thali depth)', dimensions:'25cm × 25cm × 3cm', material:'Food-grade stainless steel 202', color:'Silver', images:[], popular:true, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-006', name:'Gangajal (500 ml Bottle)', category:'Sacred Water', price:60, mrp:75, stock:20, sold:34, emoji:'🥛', description:'Pure Gangajal collected from Haridwar Har ki Pauri Ghat. Sealed plastic bottle. Use for daily pooja, abhishek, and holy rituals.', weight:'540g (with water)', size:'500 ml', height:'18 cm', dimensions:'6cm × 6cm × 18cm', material:'Food-grade sealed plastic bottle', color:'Transparent / Blue cap', images:[], popular:false, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-007', name:'Brass Puja Diya (Medium)', category:'Diyas & Lamps', price:120, mrp:150, stock:7, sold:9, emoji:'✨', description:'Handcrafted brass diya with long handle (panch aarti style). Polished finish. Holds ghee or oil. Easy to clean. Suitable for daily aarti.', weight:'180g', size:'Medium — 5 inch handle', height:'4 cm bowl height', dimensions:'12cm handle × 6cm bowl diameter', material:'Pure brass', color:'Golden brass', images:[], popular:false, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
      { id:'PRD-008', name:'Chandan Paste (50g)', category:'Daily Pooja', price:80, mrp:100, stock:12, sold:5, emoji:'🍂', description:'Pure white sandalwood (safed chandan) paste for tilak. Ready to apply. Cooling effect. Suitable for Lord Vishnu and Shiva worship.', weight:'60g (with jar)', size:'50g net weight', height:'5 cm jar height', dimensions:'5cm × 5cm × 5cm jar', material:'Pure sandalwood paste', color:'Pale yellow / cream', images:[], popular:false, active:true, createdAt:'2025-01-01T00:00:00Z', updatedAt:'2025-01-01T00:00:00Z', offerPercent:0 },
    ];
    this.saveProducts(products);
    return products;
  },

  _seedOffers() {
    const now = new Date();
    const offers = [
      {
        id:'OFF-001', name:'Navratri Mahotsav 2025', festival:'Navratri',
        subtitle:'9 Nights of Divine Deals', description:'Special discounts on all pooja items during Navratri. Stock up on diyas, flowers, and complete thali sets at unbeatable prices!',
        discountType:'percent', discountValue:20,
        startDate: new Date(now.getFullYear(), now.getMonth(), now.getDate()-1).toISOString().split('T')[0],
        endDate:   new Date(now.getFullYear(), now.getMonth(), now.getDate()+7).toISOString().split('T')[0],
        bannerColor:'#C0392B', accentColor:'#F5C842',
        emoji:'🪔', active:true,
        applyTo:'all', productIds:[],
        createdAt: new Date().toISOString(),
      }
    ];
    this.saveOffers(offers);
    return offers;
  },

  _seedFeedback() {
    const fb = [
      { id:'FB-001', name:'Sunita Devi', rating:5, message:'Bahut achhe products hain! Diyas bade sundar the. Same day delivery mili. Dil khush ho gaya 🙏', orderId:'APS-100101', createdAt:'2025-01-10T10:00:00Z', approved:true },
      { id:'FB-002', name:'Ramesh Sharma', rating:5, message:'Gangajal ekdum pure mila. Packaging bhi achi thi. Ambey Pooja Store best hai Faridabad mein!', orderId:'APS-100089', createdAt:'2025-01-09T14:00:00Z', approved:true },
      { id:'FB-003', name:'Anita Gupta', rating:4, message:'Agarbatti ki fragrance bahut achi hai. Price bhi reasonable. Will order again definitely!', orderId:'APS-100112', createdAt:'2025-01-08T09:00:00Z', approved:true },
    ];
    this.set(this.KEYS.feedback, fb);
    return fb;
  }
};
