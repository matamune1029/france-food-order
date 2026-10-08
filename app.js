const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let currentCategory = 'ALL';
let lastOrderDetails = null; // Stores last order data for receipt modal

// Category mapping (French on top, Chinese below)
const categoryMap = {
  'ALL': { fr: 'Tout', zh: '全部' },
  'Viandes': { fr: 'Viandes', zh: '荤菜' },
  '荤菜': { fr: 'Viandes', zh: '荤菜' },
  'Viandes / 荤菜': { fr: 'Viandes', zh: '荤菜' },
  'Poissons & Bœuf': { fr: 'Poissons/Bœuf', zh: '鱼/牛肉类' },
  '鱼/牛肉类': { fr: 'Poissons/Bœuf', zh: '鱼/牛肉类' },
  'Poissons & Bœuf / 鱼牛肉类': { fr: 'Poissons/Bœuf', zh: '鱼/牛肉类' },
  'Légumes': { fr: 'Légumes', zh: '素菜' },
  '素菜': { fr: 'Légumes', zh: '素菜' },
  'Légumes / 素菜': { fr: 'Légumes', zh: '素菜' },
  'Accompagnements': { fr: 'Riz/Nouilles', zh: '主食' },
  '主食': { fr: 'Riz/Nouilles', zh: '主食' },
  'Accompagnements / 主食': { fr: 'Riz/Nouilles', zh: '主食' }
};

// Fetch Menu Data
async function fetchMenu() {
  const { data, error } = await supabaseClient.from('menu_items').select('*').eq('is_available', true);
  if (error) console.error(error);
  menuData = data || [];
  renderCategoryBar();
  renderMenu();
}

// Render Left Sidebar Categories
function renderCategoryBar() {
  const rawCategories = ['ALL', ...new Set(menuData.map(i => i.category || 'Viandes'))];
  const categoryContainer = document.getElementById('category-bar');

  categoryContainer.innerHTML = rawCategories.map(cat => {
    const info = categoryMap[cat] || { fr: cat, zh: cat };
    const isSelected = currentCategory === cat;
    return `
      <button onclick="switchCategory('${cat}')" 
        class="w-full py-3 px-1 text-center border-b border-gray-300 transition ${isSelected ? 'bg-white text-green-600 font-bold border-l-4 border-l-green-500' : 'text-gray-600'}">
        <div class="text-xs font-bold leading-tight">${info.fr}</div>
        <div class="text-[10px] text-gray-400 font-normal mt-0.5">${info.zh}</div>
      </button>
    `;
  }).join('');
}

function switchCategory(cat) {
  currentCategory = cat;
  renderCategoryBar();
  renderMenu();
}

// Render Food Menu
function renderMenu() {
  const container = document.getElementById('menu-container');
  const filtered = currentCategory === 'ALL' 
    ? menuData 
    : menuData.filter(i => (i.category || 'Viandes') === currentCategory);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-10">Aucun plat / 暂无菜品</div>';
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-gray-100">
      <div class="flex-1 pr-2">
        <div class="font-bold text-gray-800 text-sm leading-snug">${item.name_fr}</div>
        <div class="text-xs text-gray-500 font-normal mt-1">${item.name_zh}</div>
        <div class="text-green-600 font-extrabold text-base mt-1.5">${item.price} €</div>
      </div>
      <div class="flex items-center gap-2">
        ${cart[item.id] ? `
          <button onclick="updateCart('${item.id}', -1)" class="w-7 h-7 bg-gray-100 text-gray-700 rounded-full font-bold flex items-center justify-center active:scale-90">-</button>
          <span class="text-sm font-bold w-4 text-center">${cart[item.id]}</span>
        ` : ''}
        <button onclick="updateCart('${item.id}', 1)" class="w-7 h-7 bg-green-500 text-white rounded-full font-bold flex items-center justify-center shadow-md active:scale-90">+</button>
      </div>
    </div>
  `).join('');
}

// Update Shopping Cart
function updateCart(id, delta) {
  cart[id] = (cart[id] || 0) + delta;
  if (cart[id] <= 0) delete cart[id];
  renderMenu();

  let total = 0;
  let count = 0;
  for (let itemId in cart) {
    const item = menuData.find(i => i.id === itemId);
    if (item) {
      total += item.price * cart[itemId];
      count += cart[itemId];
    }
  }

  document.getElementById('total-price').innerText = total.toFixed(2);
  document.getElementById('modal-total-price').innerText = total.toFixed(2);
  
  const badge = document.getElementById('cart-badge');
  if (count > 0) {
    badge.innerText = count;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

// Modal Controls
function openCheckoutModal() {
  if (Object.keys(cart).length === 0) return alert('Votre panier est vide ! / 购物车是空的！');
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

// Submit Order
async function submitOrder() {
  try {
    const name = document.getElementById('cust-name').value.trim();
    const phone = document.getElementById('cust-phone').value.trim();
    const address = document.getElementById('cust-address').value.trim();
    const note = document.getElementById('cust-note').value.trim();

    if (!name) return alert('Veuillez entrer votre nom ! / 请填写姓名！');

    const cleanPhone = phone.replace(/[\s\.\-\(\)]/g, '');
    const frPhoneRegex = /^(?:(?:\+33|0033)[1-9]|0[1-9])\d{8}$/;
    if (!frPhoneRegex.test(cleanPhone)) {
      return alert('Veuillez entrer un numéro de téléphone français valide (ex: 0612345678) ! / 请填写有效的法国手机号码！');
    }

    if (!address) return alert('Veuillez entrer votre adresse de livraison ! / 请填写送餐地址！');

    const items = Object.keys(cart).map(id => {
      const item = menuData.find(i => i.id === id);
      return { 
        name_fr: item ? item.name_fr : 'Plat', 
        name_zh: item ? item.name_zh : '菜品', 
        qty: cart[id], 
        price: item ? item.price : 0 
      };
    });
    
    const total = parseFloat(document.getElementById('total-price').innerText);
    const orderId = 'CC-' + Date.now().toString().slice(-6);

    const fullContactInfo = `${phone} | Adresse: ${address}${note ? ' | Note: ' + note : ''}`;
    const dbItems = items.map(i => ({ name: `${i.name_fr} (${i.name_zh})`, qty: i.qty, price: i.price }));

    const { error } = await supabaseClient.from('orders').insert([
      { customer_name: name, phone: fullContactInfo, items: dbItems, total_price: total }
    ]);

    if (error) {
      console.error('Supabase Error:', error);
      alert('Échec / 数据库写入错误: ' + error.message);
      return;
    }

    lastOrderDetails = { orderId, name, phone, address, note, items, total };

    cart = {};
    closeCheckoutModal();
    showReceiptModal(lastOrderDetails);

  } catch (err) {
    console.error('Submission Error:', err);
    alert('Erreur / 提交过程发生错误: ' + err.message);
  }
}

// Show Receipt Modal
function showReceiptModal(order) {
  document.getElementById('receipt-id').innerText = '#' + order.orderId;
  document.getElementById('receipt-name').innerText = order.name;
  document.getElementById('receipt-phone').innerText = order.phone;
  document.getElementById('receipt-address').innerText = order.address;
  document.getElementById('receipt-total').innerText = order.total.toFixed(2);

  const itemsContainer = document.getElementById('receipt-items');
  itemsContainer.innerHTML = order.items.map(i => `
    <li class="flex justify-between">
      <span>${i.name_fr} (${i.name_zh}) x${i.qty}</span>
      <span class="font-bold">${(i.price * i.qty).toFixed(2)} €</span>
    </li>
  `).join('');

  document.getElementById('receipt-modal').classList.remove('hidden');
}

// Copy Receipt Details
function copyReceiptText() {
  if (!lastOrderDetails) return;
  const o = lastOrderDetails;
  const itemText = o.items.map(i => `- ${i.name_fr} (${i.name_zh}) x${i.qty}`).join('\n');
  const text = `🧾 【Cici Cuisine 订单凭证 #${o.orderId}】\n👤 姓名: ${o.name}\n📞 电话: ${o.phone}\n📍 地址: ${o.address}\n\n🍲 订购餐点:\n${itemText}\n\n💰 总计: ${o.total.toFixed(2)} €`;

  navigator.clipboard.writeText(text).then(() => {
    alert('📋 订单明细已复制到剪贴板！可以直接发送给群主微信。');
  }).catch(() => {
    alert('复制失败，请直接截图保存。');
  });
}

// Close Receipt Modal
function closeReceiptModal() {
  document.getElementById('receipt-modal').classList.add('hidden');
  renderMenu();
}

// Admin Toggle & Real-time Orders
// 後台切換（帶密碼保護）
function toggleMode() {
  const adminView = document.getElementById('admin-view');
  const customerView = document.getElementById('customer-view');

  // 如果當前在顧客畫面，要進入後台时驗證密碼
  if (adminView.classList.contains('hidden')) {
    const password = prompt("Veuillez entrer le mot de passe Admin / 請輸入後台管理密碼：");
    if (password !== "8888") { // 👈 在這裡修改你的專屬密碼
      return alert("Mot de passe incorrect / 密碼錯誤！");
    }
  }

  adminView.classList.toggle('hidden');
  customerView.classList.toggle('hidden');

  if (!adminView.classList.contains('hidden')) {
    fetchOrders();
    supabaseClient.channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        alert('🔔 Nouvelle commande reçue ! / 收到新訂單！');
        fetchOrders();
      }).subscribe();
  }
}

// Fetch Admin Orders
async function fetchOrders() {
  const { data } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
  const container = document.getElementById('order-list');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-gray-400">Aucune commande / 暂无订单</div>';
    return;
  }
  container.innerHTML = data.map(o => `
    <div class="bg-white p-3.5 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2">
      <div class="flex justify-between font-bold text-gray-800">
        <span>👤 ${o.customer_name}</span>
        <span class="text-green-600 text-lg">${o.total_price} €</span>
      </div>
      <div class="text-xs text-gray-600">📞 ${o.phone || 'N/A'}</div>
      <div class="text-[10px] text-gray-400">${new Date(o.created_at).toLocaleString()}</div>
      <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1">
        ${o.items.map(i => `<li class="flex justify-between"><span>${i.name}</span><span class="font-bold">x${i.qty}</span></li>`).join('')}
      </ul>
    </div>
  `).join('');
}

fetchMenu();
