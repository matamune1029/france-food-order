// ----------------------------------------------------
// 🛠️ 群主后台 Tab 切换与菜单管理逻辑
// ----------------------------------------------------

let activeAdminTab = 'orders';

function switchAdminTab(tab) {
  activeAdminTab = tab;
  const ordersTab = document.getElementById('admin-orders-tab');
  const menuTab = document.getElementById('admin-menu-tab');
  const ordersBtn = document.getElementById('tab-orders-btn');
  const menuBtn = document.getElementById('tab-menu-btn');

  if (tab === 'orders') {
    ordersTab.classList.remove('hidden');
    menuTab.classList.add('hidden');
    ordersBtn.className = "flex-1 py-2 rounded-lg bg-white shadow text-gray-800 transition";
    menuBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";
    fetchOrders();
  } else {
    ordersTab.classList.add('hidden');
    menuTab.classList.remove('hidden');
    menuBtn.className = "flex-1 py-2 rounded-lg bg-white shadow text-gray-800 transition";
    ordersBtn.className = "flex-1 py-2 rounded-lg text-gray-500 transition";
    fetchAdminMenu();
  }
}

// 获取后台菜单列表（带上架/下架开关与编辑按钮）
async function fetchAdminMenu() {
  const { data, error } = await supabaseClient.from('menu_items').select('*').order('created_at', { ascending: false });
  const container = document.getElementById('admin-menu-list');
  if (!container) return;

  if (error || !data || data.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-xs text-center py-4">Aucun plat / 暂无菜品</div>';
    return;
  }

  container.innerHTML = data.map(item => `
    <div class="bg-white p-3 rounded-xl border flex justify-between items-center shadow-sm">
      <div class="flex-1 pr-2">
        <div class="font-bold text-gray-800 text-xs">${item.name_fr} (${item.name_zh})</div>
        <div class="text-green-600 font-extrabold text-xs mt-0.5">${item.price} € <span class="text-gray-400 font-normal">| ${item.category || 'Viandes'}</span></div>
      </div>
      <div class="flex items-center gap-2">
        <!-- 上/下架开关按钮 -->
        <button onclick="toggleDishAvailability('${item.id}', ${!item.is_available})" class="px-2 py-1 rounded text-[10px] font-bold ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}">
          ${item.is_available ? 'En vente / 上架中' : 'Masqué / 已下架'}
        </button>
        <!-- 编辑按钮 -->
        <button onclick="openDishModal('${item.id}')" class="bg-orange-100 text-orange-600 px-2 py-1 rounded text-[10px] font-bold">
          Modifier / 编辑
        </button>
      </div>
    </div>
  `).join('');
}

// 快速切换菜品上下架状态
async function toggleDishAvailability(id, newStatus) {
  const { error } = await supabaseClient.from('menu_items').update({ is_available: newStatus }).eq('id', id);
  if (error) {
    alert('修改状态失败: ' + error.message);
  } else {
    fetchAdminMenu();
    fetchMenu(); // 同步刷新前台
  }
}

// 打开菜品编辑/新增弹窗
function openDishModal(id = null) {
  const modal = document.getElementById('dish-modal');
  const title = document.getElementById('dish-modal-title');
  
  if (id) {
    const item = menuData.find(m => m.id === id);
    if (!item) return;
    title.innerText = 'Modifier le plat / 编辑菜品';
    document.getElementById('dish-id').value = item.id;
    document.getElementById('dish-name-fr').value = item.name_fr;
    document.getElementById('dish-name-zh').value = item.name_zh;
    document.getElementById('dish-price').value = item.price;
    document.getElementById('dish-category').value = item.category || 'Viandes';
  } else {
    title.innerText = 'Ajouter un plat / 新增菜品';
    document.getElementById('dish-id').value = '';
    document.getElementById('dish-name-fr').value = '';
    document.getElementById('dish-name-zh').value = '';
    document.getElementById('dish-price').value = '';
    document.getElementById('dish-category').value = 'Viandes';
  }
  modal.classList.remove('hidden');
}

function closeDishModal() {
  document.getElementById('dish-modal').classList.add('hidden');
}

// 保存菜品（新增或修改）
async function saveDish() {
  const id = document.getElementById('dish-id').value;
  const name_fr = document.getElementById('dish-name-fr').value.trim();
  const name_zh = document.getElementById('dish-name-zh').value.trim();
  const price = parseFloat(document.getElementById('dish-price').value);
  const category = document.getElementById('dish-category').value;

  if (!name_fr || !name_zh || isNaN(price)) {
    return alert('Veuillez remplir tous les champs / 请完整填写名称与价格！');
  }

  const payload = { name_fr, name_zh, price, category, is_available: true };

  let res;
  if (id) {
    res = await supabaseClient.from('menu_items').update(payload).eq('id', id);
  } else {
    res = await supabaseClient.from('menu_items').insert([payload]);
  }

  if (res.error) {
    alert('保存失败: ' + res.error.message);
  } else {
    closeDishModal();
    fetchAdminMenu();
    fetchMenu(); // 实时同步前台菜单
  }
}
