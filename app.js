const SUPABASE_URL = 'https://zcivplddxtaqlefrtajr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_eQG7FVgOU36Z8edfnrf27w_5A7tlNiq';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let cart = {};
let menuData = [];
let currentCategory = '全部';

// 载入菜单
async function fetchMenu() {
  const { data, error } = await supabaseClient.from('menu_items').select('*').eq('is_available', true);
  if (error) console.error(error);
  menuData = data || [];
  renderCategoryBar();
  renderMenu();
}

// 渲染分类侧边栏
function renderCategoryBar() {
  const categories = ['全部', ...new Set(menuData.map(i => i.category || '主推菜品'))];
  const categoryContainer = document.getElementById('category-bar');
  categoryContainer.innerHTML = categories.map(cat => `
    <button onclick="switchCategory('${cat}')" 
      class="w-full py-3.5 px-2 text-xs font-medium text-center border-b border-gray-300 transition ${currentCategory === cat ? 'bg-white text-green-600 font-bold border-l-4 border-l-green-500' : 'text-gray-600'}">
      ${cat}
    </button>
  `).join('');
}

function switchCategory(cat) {
  currentCategory = cat;
  renderCategoryBar();
  renderMenu();
}

// 渲染菜品列表
function renderMenu() {
  const container = document.getElementById('menu-container');
  const filtered = currentCategory === '全部' 
    ? menuData 
    : menuData.filter(i => (i.category || '主推菜品') === currentCategory);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="text-center text-gray-400 py-10">该分类下暂无菜品</div>';
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="bg-white p-3 rounded-xl shadow-sm flex justify-between items-center border border-gray-100">
      <div class="flex-1 pr-2">
        <div class="font-bold text-gray-800 text-sm">${item.name_zh}</div>
        <div class="text-xs text-gray-400 italic">${item.name_fr}</div>
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

// 更新购物车
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

// 弹窗控制
function openCheckoutModal() {
  if (Object.keys(cart).length === 0) return alert('购物车是空的，请先选择菜品！');
  document.getElementById('checkout-modal').classList.remove('hidden');
}

function closeCheckoutModal() {
  document.getElementById('checkout-modal').classList.add('hidden');
}

// 提交订单
async function submitOrder() {
  const name = document.getElementById('cust-name').value;
  const phone = document.getElementById('cust-phone').value;
  const note = document.getElementById('cust-note').value;

  if (!name || !phone) return alert('请填写姓名和联系电话！');

  const items = Object.keys(cart).map(id => {
    const item = menuData.find(i => i.id === id);
    return { name: `${item.name_zh} (${item.name_fr})`, qty: cart[id], price: item.price };
  });
  const total = parseFloat(document.getElementById('total-price').innerText);

  const { error } = await supabaseClient.from('orders').insert([
    { customer_name: name, phone: `${phone} ${note ? '| 备注:' + note : ''}`, items, total_price: total }
  ]);

  if (!error) {
    alert('🎉 订单提交成功！请通知群主接单！');
    cart = {};
    closeCheckoutModal();
    location.reload();
  } else {
    alert('提交失败，请重试');
  }
}

// 后台切换与监听
function toggleMode() {
  const adminView = document.getElementById('admin-view');
  const customerView = document.getElementById('customer-view');
  adminView.classList.toggle('hidden');
  customerView.classList.toggle('hidden');

  if (!adminView.classList.contains('hidden')) {
    fetchOrders();
    supabaseClient.channel('public:orders')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, payload => {
        alert('🔔 收到新的点餐订单！');
        fetchOrders();
      }).subscribe();
  }
}

async function fetchOrders() {
  const { data } = await supabaseClient.from('orders').select('*').order('created_at', { ascending: false });
  const container = document.getElementById('order-list');
  if (!data || data.length === 0) {
    container.innerHTML = '<div class="text-gray-400">暂无新订单</div>';
    return;
  }
  container.innerHTML = data.map(o => `
    <div class="bg-white p-3.5 rounded-xl border-l-4 border-orange-500 shadow-sm space-y-2">
      <div class="flex justify-between font-bold text-gray-800">
        <span>👤 ${o.customer_name}</span>
        <span class="text-green-600 text-lg">${o.total_price} €</span>
      </div>
      <div class="text-xs text-gray-600">📞 ${o.phone || '无电话/备注'}</div>
      <div class="text-[10px] text-gray-400">${new Date(o.created_at).toLocaleString()}</div>
      <ul class="text-xs bg-gray-50 p-2.5 rounded-lg border space-y-1">
        ${o.items.map(i => `<li class="flex justify-between"><span>${i.name}</span><span class="font-bold">x${i.qty}</span></li>`).join('')}
      </ul>
    </div>
  `).join('');
}

fetchMenu();
