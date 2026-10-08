const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let currentCategory = 'ALL';

// 左側分類的中法翻譯對照表
const categoryMap = {
  'ALL': { fr: 'Tout', zh: '全部' },
  'Viandes': { fr: 'Viandes', zh: '荤菜' },
  '荤菜': { fr: 'Viandes', zh: '荤菜' },
  'Poissons & Bœuf': { fr: 'Poissons/Bœuf', zh: '鱼/牛肉类' },
  '鱼/牛肉类': { fr: 'Poissons/Bœuf', zh: '鱼/牛肉类' },
  'Légumes': { fr: 'Légumes', zh: '素菜' },
  '素菜': { fr: 'Légumes', zh: '素菜' },
  'Accompagnements': { fr: 'Riz/Nouilles', zh: '主食' },
  '主食': { fr: 'Riz/Nouilles', zh: '主食' }
};

// 載入菜單
async function fetchMenu() {
  const { data, error } = await supabaseClient.from('menu_items').select('*').eq('is_available', true);
  if (error) console.error(error);
  menuData = data || [];
  renderCategoryBar();
  renderMenu();
}

// 渲染左側分類（法文在上、中文在下）
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

// 渲染菜品列表（✅ 已修正：法文大字粗體在上，中文小字在下）
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
        <!-- 法文大字粗體在上 -->
        <div class="font-bold text-gray-800 text-sm leading-snug">${item.name_fr}</div>
        <!-- 中文小字灰體在下 -->
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

// 更新購物車
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

// 彈窗控制
function openCheckoutModal() {
  if (Object.keys(cart).length === 0) return alert('Votre panier est vide ! / 购物车是空的！');
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

// 提交訂單
async function submitOrder() {
  const name = document.getElementById('cust-name').value;
  const phone = document.getElementById('cust-phone').value;
  const note = document.getElementById('cust-note').value;

  if (!name || !phone) return alert('Veuillez remplir votre nom et téléphone ! / 请填写姓名与电话！');

  const items = Object.keys(cart).map(id => {
    const item = menuData.find(i => i.id === id);
    return { name: `${item.name_fr} (${item.name_zh})`, qty: cart[id], price: item.price };
  });
  const total = parseFloat(document.getElementById('total-price').innerText);

  const { error } = await supabaseClient.from('orders').insert([
    { customer_name: name, phone: `${phone} ${note ? '| Adresse:' + note : ''}`, items, total_price: total }
  ]);

  if (!error) {
    alert('🎉 Commande envoyée ! / 订单提交成功！');
    cart = {};
    closeCheckoutModal();
    location.reload();
  } else {
    alert('Échec de l\'envoi / 提交失败，请重试');
  }
}

// 後台切換與監聽
function toggleMode() {
  const adminView = document.getElementById('admin-view');
  const customerView = document.getElementById('customer-view');
  adminView.classList.toggle('hidden');
  customerView.classList.toggle('hidden');

  if (!adminView.classList.contains('hidden')) {
    fetchOrders();
    supabaseClient.channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        alert('🔔 Nouvelle commande reçue ! / 收到新订单！');
        fetchOrders();
      }).subscribe();
  }
}

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
