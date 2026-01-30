import React, { useState, useEffect } from 'react';
import { AdminSettings, Order, Store } from '../types';
import CheckoutPage from './CheckoutPage';
import { db } from '../services/database';

interface AdminDashboardProps {
  settings: AdminSettings;
  setSettings: React.Dispatch<React.SetStateAction<AdminSettings>>;
  onLogout: () => void;
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ settings, setSettings, onLogout }) => {
  // Navigation State
  const [activeView, setActiveView] = useState<'dashboard' | 'orders' | 'links' | 'stores' | 'settings'>('dashboard');
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  
  // Data State
  const [stores, setStores] = useState<Store[]>([]);
  const [metrics, setMetrics] = useState({ totalOrders: 0, totalRevenue: 0, pendingOrders: 0, conversionRate: '0.0' });
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // Forms State
  const [amount, setAmount] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [newStoreName, setNewStoreName] = useState('');
  
  // Store Settings Form State
  const [storeSettingsForm, setStoreSettingsForm] = useState({ apiKey: '', feePercent: 0, feeFixed: 0 });
  
  const [previewIntentId, setPreviewIntentId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // Fee Calculation State
  const [feeSimulation, setFeeSimulation] = useState<{ fee: number, net: number, isValid: boolean, message: string } | null>(null);

  // Initial Load
  useEffect(() => {
    loadStores();
  }, []);

  // Data Refresh Cycle
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 10000); 
    return () => clearInterval(interval);
  }, [selectedStore]);

  // Sync Form when selecting a store
  useEffect(() => {
    if (selectedStore) {
        setStoreSettingsForm({
            apiKey: selectedStore.apiKey || '',
            feePercent: selectedStore.pixFeePercentage || 0,
            feeFixed: selectedStore.pixFeeFixed || 0
        });
    }
  }, [selectedStore]);

  // Simulation Effect
  useEffect(() => {
    if (!amount) {
        setFeeSimulation(null);
        return;
    }
    const val = parseFloat(amount);
    if (isNaN(val)) {
        setFeeSimulation(null);
        return;
    }

    // RULES:
    // Min R$ 10,00 / Max R$ 6.000,00
    // < R$ 50,00: 2% + R$ 1,00
    // > R$ 50,00: 2%
    
    let isValid = true;
    let message = '';
    
    if (val < 10) {
        isValid = false;
        message = 'Valor mínimo por transação é R$ 10,00';
    } else if (val > 6000) {
        isValid = false;
        message = 'Valor máximo por transação é R$ 6.000,00';
    }

    let fee = 0;
    if (val < 50) {
        fee = (val * 0.02) + 1.00; // 2% + R$ 1.00 fixed
    } else {
        fee = (val * 0.02); // 2%
    }

    setFeeSimulation({
        fee,
        net: val - fee,
        isValid,
        message
    });

  }, [amount]);

  const loadStores = async () => {
    const list = await db.getStores();
    setStores(list);
  };

  const refreshData = async () => {
    if (orders.length === 0) setIsLoading(true);
    const storeId = selectedStore ? selectedStore.id : null;

    try {
      const [newMetrics, newOrders] = await Promise.all([
        db.getMetrics(storeId),
        db.getAllOrders(storeId)
      ]);
      setMetrics(newMetrics);
      setOrders(newOrders);
    } catch (error) {
      console.error("Failed to refresh data", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnterStore = (store: Store) => {
      setSelectedStore(store);
      setActiveView('dashboard');
  };

  const handleExitStore = () => {
      setSelectedStore(null);
      setActiveView('dashboard');
  };

  const handleCreateStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) return;

    const newStore: Store = {
      id: Math.random().toString(36).substring(2, 10),
      name: newStoreName,
      createdAt: new Date().toISOString()
    };

    await db.createStore(newStore);
    await loadStores();
    setNewStoreName('');
    alert('Loja criada com sucesso!');
  };

  const handleSaveStoreSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) return;

    const updated: Store = {
        ...selectedStore,
        apiKey: storeSettingsForm.apiKey,
        pixFeePercentage: Number(storeSettingsForm.feePercent),
        pixFeeFixed: Number(storeSettingsForm.feeFixed)
    };

    await db.updateStore(updated);
    setSelectedStore(updated); // Update local context
    alert('Configurações da loja salvas com sucesso!');
  };

  const handleGenerateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    
    if (isNaN(val) || val < 10 || val > 6000) {
      alert('O valor deve estar entre R$ 10,00 e R$ 6.000,00');
      return;
    }

    const newOrder: Order = {
      id: Math.random().toString(36).substring(2, 15),
      amount: val,
      description: description || 'Link Rápido',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'pending',
      store_id: selectedStore?.id,
      store_name: selectedStore?.name
    };

    await db.saveOrder(newOrder);
    await refreshData();
    
    setAmount('');
    setDescription('');
    
    handleCopyLink(newOrder.id);
  };

  const handleCopyLink = (id: string) => {
    const baseUrl = window.location.href.split('#')[0];
    const url = `${baseUrl}#/checkout/${id}`;
    navigator.clipboard.writeText(url);
    setCopySuccess(id);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  // Calculations for Financial Card
  const estimatedFees = metrics.totalRevenue > 0 && selectedStore ? 
      (metrics.totalRevenue * (selectedStore.pixFeePercentage || 0) / 100) + (metrics.totalOrders * (selectedStore.pixFeeFixed || 0)) : 
      0;
  
  const estimatedNet = metrics.totalRevenue - estimatedFees;

  // --- RENDER HELPERS ---
  const StatusBadge = ({ status }: { status: string }) => {
      switch(status) {
          case 'completed': return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold">Pago</span>;
          case 'pending': return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold">Pendente</span>;
          case 'expired': return <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold">Expirado</span>;
          default: return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold">{status}</span>;
      }
  };

  // Theme Colors
  const themeColor = selectedStore ? 'bg-indigo-900' : 'bg-slate-900';
  const highlightColor = selectedStore ? 'text-indigo-500' : 'text-emerald-500';
  const btnColor = selectedStore ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* SIDEBAR */}
      <aside className={`w-full md:w-64 ${themeColor} text-white flex flex-col shrink-0 transition-colors duration-500`}>
         <div className="p-6 border-b border-white/10">
             {selectedStore ? (
                <div>
                     <p className="text-xs text-indigo-300 uppercase font-bold tracking-wider mb-1">Loja Selecionada</p>
                     <h1 className="text-xl font-black tracking-tighter text-white truncate">{selectedStore.name}</h1>
                </div>
             ) : (
                <h1 className="text-xl font-black tracking-tighter text-white">7D-bappe <span className={`${highlightColor} text-xs block font-normal tracking-normal`}>Painel Master</span></h1>
             )}
         </div>

         <nav className="flex-1 p-4 space-y-2">
             {selectedStore && (
                <button onClick={handleExitStore} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white mb-4 border border-white/10 transition-all">
                    <i className="fa-solid fa-arrow-left w-5"></i> Voltar ao Geral
                </button>
             )}

             <button onClick={() => setActiveView('dashboard')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'dashboard' ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}>
                 <i className="fa-solid fa-chart-line w-5"></i> Dashboard
             </button>
             <button onClick={() => setActiveView('orders')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'orders' ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}>
                 <i className="fa-solid fa-receipt w-5"></i> Pedidos
             </button>
             
             {!selectedStore && (
                <button onClick={() => setActiveView('stores')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'stores' ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}>
                    <i className="fa-solid fa-store w-5"></i> Gerenciar Lojas
                </button>
             )}

             <button onClick={() => setActiveView('links')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'links' ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}>
                 <i className="fa-solid fa-link w-5"></i> Gerar Link
             </button>
             <button onClick={() => setActiveView('settings')} className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeView === 'settings' ? 'bg-white/10 shadow-lg' : 'hover:bg-white/5 text-slate-400 hover:text-white'}`}>
                 <i className="fa-solid fa-gear w-5"></i> {selectedStore ? 'Config da Loja' : 'Config Geral'}
             </button>
         </nav>

         <div className="p-4 border-t border-white/10">
             <button onClick={onLogout} className="w-full flex items-center gap-3 px-4 py-2 text-red-400 hover:text-red-300 transition-colors text-sm font-medium">
                 <i className="fa-solid fa-right-from-bracket"></i> Sair
             </button>
         </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="flex-1 overflow-y-auto h-screen bg-slate-50 flex flex-col">
        
        {/* HEADER */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4 sticky top-0 z-20">
            <div>
                <h2 className="text-xl font-bold text-slate-800">
                    {activeView === 'dashboard' ? 'Visão Geral' : 
                     activeView === 'orders' ? 'Pedidos' :
                     activeView === 'links' ? 'Gerar Checkout' :
                     activeView === 'stores' ? 'Lojas' : 'Configurações'}
                </h2>
                <p className="text-xs text-slate-400">
                    {selectedStore ? 
                        `Ambiente da Loja: ${selectedStore.name}` : 
                        'Visualizando todas as lojas'}
                </p>
            </div>
            
            {!selectedStore && (
                <div className="px-4 py-1 bg-emerald-50 border border-emerald-100 rounded-full text-xs font-bold text-emerald-700">
                    Modo Master Admin
                </div>
            )}
            {selectedStore && (
                 <div className="px-4 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-xs font-bold text-indigo-700">
                    Modo Loja
                </div>
            )}
        </header>

        <div className="p-6 md:p-8 flex-1">
        
            {/* VIEW: DASHBOARD */}
            {activeView === 'dashboard' && (
                <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        {/* GROSS REVENUE */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Faturamento Bruto</p>
                                <h3 className="text-2xl font-black text-slate-800">R$ {metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                            </div>
                            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-600">
                                <i className="fa-solid fa-dollar-sign text-xl"></i>
                            </div>
                        </div>
                        
                        {/* NET REVENUE (Only visible in Store Mode or if calculated globally) */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Líquido Estimado</p>
                                <h3 className="text-2xl font-black text-emerald-600">R$ {selectedStore ? estimatedNet.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : metrics.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</h3>
                                {selectedStore && <p className="text-[10px] text-slate-400 mt-1">Desc. Taxas: R$ {estimatedFees.toFixed(2)}</p>}
                            </div>
                            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600">
                                <i className="fa-solid fa-wallet text-xl"></i>
                            </div>
                        </div>

                        {/* ORDERS COUNT */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total de Pedidos</p>
                                <h3 className="text-2xl font-black text-slate-800">{metrics.totalOrders}</h3>
                            </div>
                            <div className="w-12 h-12 bg-blue-50 rounded-full flex items-center justify-center text-blue-600">
                                <i className="fa-solid fa-shopping-bag text-xl"></i>
                            </div>
                        </div>

                        {/* CONVERSION */}
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Conversão</p>
                                <h3 className="text-2xl font-black text-indigo-600">{metrics.conversionRate}%</h3>
                            </div>
                            <div className="w-12 h-12 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600">
                                <i className="fa-solid fa-chart-pie text-xl"></i>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800">Últimos Pedidos</h3>
                            <button onClick={() => setActiveView('orders')} className="text-slate-500 text-sm font-medium hover:underline">Ver todos</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-400 text-xs uppercase font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-3">ID</th>
                                        <th className="px-6 py-3">Cliente</th>
                                        <th className="px-6 py-3">Valor</th>
                                        <th className="px-6 py-3">Status</th>
                                        <th className="px-6 py-3">Data</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {isLoading ? (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                                <i className="fa-solid fa-circle-notch fa-spin mr-2"></i> Carregando...
                                            </td>
                                        </tr>
                                    ) : orders.slice(0, 5).map(order => (
                                        <tr key={order.id} className="hover:bg-slate-50/50">
                                            <td className="px-6 py-4 text-xs font-mono text-slate-400">#{order.id.substring(0, 6)}</td>
                                            <td className="px-6 py-4">
                                                <p className="text-sm font-medium text-slate-800">{order.customer_name || 'Visitante'}</p>
                                            </td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-700">R$ {order.amount.toFixed(2)}</td>
                                            <td className="px-6 py-4"><StatusBadge status={order.status} /></td>
                                            <td className="px-6 py-4 text-sm text-slate-500">{new Date(order.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW: STORES MANAGER (MASTER ONLY) */}
            {activeView === 'stores' && !selectedStore && (
                <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8">
                        <h3 className="font-bold text-slate-800 mb-4">Adicionar Nova Loja</h3>
                        <form onSubmit={handleCreateStore} className="flex gap-4">
                            <input 
                                type="text"
                                placeholder="Nome da Loja (ex: Loja Centro)"
                                className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                value={newStoreName}
                                onChange={e => setNewStoreName(e.target.value)}
                            />
                            <button className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors">
                                Criar
                            </button>
                        </form>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {stores.map(store => (
                            <div key={store.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center group hover:border-emerald-200 transition-all">
                                <div>
                                    <h4 className="font-bold text-lg text-slate-800">{store.name}</h4>
                                    <p className="text-xs text-slate-400 font-mono">ID: {store.id}</p>
                                </div>
                                <button 
                                    onClick={() => handleEnterStore(store)}
                                    className="px-4 py-2 rounded-lg bg-slate-100 text-slate-600 hover:bg-emerald-600 hover:text-white text-sm font-bold transition-all"
                                >
                                    Gerenciar <i className="fa-solid fa-arrow-right ml-1"></i>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VIEW: ORDERS HISTORY */}
            {activeView === 'orders' && (
                 <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 text-slate-400 text-xs uppercase font-bold tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Detalhes</th>
                                        <th className="px-6 py-4">Loja</th>
                                        <th className="px-6 py-4">Cliente</th>
                                        <th className="px-6 py-4">Descrição</th>
                                        <th className="px-6 py-4">Valor</th>
                                        <th className="px-6 py-4">Status</th>
                                        <th className="px-6 py-4 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {orders.map(order => (
                                        <tr key={order.id} className="hover:bg-slate-50/50 group">
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-mono text-slate-400 mb-1">ID: {order.id}</p>
                                                <p className="text-xs text-slate-400">{new Date(order.createdAt).toLocaleDateString()} {new Date(order.createdAt).toLocaleTimeString()}</p>
                                            </td>
                                            <td className="px-6 py-4">
                                                {order.store_name ? (
                                                    <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-1 rounded">{order.store_name}</span>
                                                ) : (
                                                    <span className="text-xs text-slate-400">-</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4">
                                                {order.customer_name ? (
                                                    <>
                                                        <p className="text-sm font-medium text-slate-800">{order.customer_name}</p>
                                                        <p className="text-xs text-slate-400">{order.customer_cpf}</p>
                                                    </>
                                                ) : (
                                                    <span className="text-sm text-slate-400 italic">Checkout não iniciado</span>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 text-sm text-slate-600">{order.description}</td>
                                            <td className="px-6 py-4 text-sm font-bold text-slate-800">R$ {order.amount.toFixed(2)}</td>
                                            <td className="px-6 py-4"><StatusBadge status={order.status} /></td>
                                            <td className="px-6 py-4 text-center">
                                                <button 
                                                    onClick={() => setPreviewIntentId(order.id)}
                                                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                                                    title="Ver Checkout"
                                                >
                                                    <i className="fa-solid fa-eye"></i>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW: CREATE LINKS */}
            {activeView === 'links' && (
                <div className="max-w-xl mx-auto mt-10 animate-in fade-in zoom-in duration-300">
                    
                    {/* RULES CARD */}
                    <div className="bg-blue-50 border border-blue-100 p-4 rounded-xl mb-6 text-sm text-blue-800">
                        <div className="flex items-center gap-2 font-bold mb-2">
                            <i className="fa-solid fa-circle-info"></i> Regras e Taxas de Pagamento
                        </div>
                        <ul className="list-disc list-inside space-y-1 text-xs opacity-80">
                            <li>Acima de R$ 50,00: Taxa de <strong>2%</strong>.</li>
                            <li>Abaixo de R$ 50,00: Taxa de <strong>2% + R$ 1,00</strong>.</li>
                            <li>Limites: Mínimo <strong>R$ 10,00</strong> / Máximo <strong>R$ 6.000,00</strong>.</li>
                            <li>Limite diário de R$ 6.000,00 por CPF/CNPJ pagador.</li>
                        </ul>
                    </div>

                    <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
                        <div className={`${themeColor} px-6 py-4 flex justify-between items-center transition-colors duration-500`}>
                            <h2 className="text-white font-bold text-lg">Gerar Novo Link</h2>
                            {selectedStore ? (
                                <span className="text-xs bg-indigo-500 text-white px-2 py-1 rounded">Loja: {selectedStore.name}</span>
                            ) : (
                                <span className="text-xs bg-emerald-500 text-white px-2 py-1 rounded">Geral</span>
                            )}
                        </div>
                        <div className="p-8">
                            <form onSubmit={handleGenerateLink} className="space-y-6">
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Valor (R$)</label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-lg"
                                        placeholder="0,00"
                                    />
                                    {feeSimulation && !feeSimulation.isValid && (
                                        <p className="text-red-500 text-xs mt-2 font-bold"><i className="fa-solid fa-circle-exclamation mr-1"></i> {feeSimulation.message}</p>
                                    )}
                                </div>
                                
                                {/* REAL TIME CALCULATOR */}
                                {feeSimulation && feeSimulation.isValid && (
                                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2 animate-in fade-in slide-in-from-top-2">
                                        <div className="flex justify-between text-sm text-slate-500">
                                            <span>Valor Cobrado:</span>
                                            <span>R$ {parseFloat(amount).toFixed(2)}</span>
                                        </div>
                                        <div className="flex justify-between text-sm text-red-400">
                                            <span>Taxas do Sistema:</span>
                                            <span>- R$ {feeSimulation.fee.toFixed(2)}</span>
                                        </div>
                                        <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-bold text-emerald-600">
                                            <span>Líquido a Receber:</span>
                                            <span>R$ {feeSimulation.net.toFixed(2)}</span>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">Descrição</label>
                                    <input
                                        type="text"
                                        value={description}
                                        onChange={(e) => setDescription(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Ex: Consultoria VIP"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={feeSimulation ? !feeSimulation.isValid : true}
                                    className={`w-full py-4 ${btnColor} text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed`}
                                >
                                    Gerar Link
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* VIEW: SETTINGS */}
            {activeView === 'settings' && (
                <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6">{selectedStore ? `Configurações de: ${selectedStore.name}` : 'Configurações Gerais'}</h2>
                    
                    {/* STORE SPECIFIC SETTINGS */}
                    {selectedStore ? (
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
                             <div className="p-4 bg-indigo-50 border border-indigo-100 rounded-xl text-indigo-800 text-sm mb-6">
                                <i className="fa-solid fa-circle-info mr-2"></i>
                                Essas configurações se aplicam apenas aos checkouts desta loja.
                            </div>

                             <form onSubmit={handleSaveStoreSettings}>
                                <div>
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <i className="fa-solid fa-key text-indigo-500"></i> Credenciais de Pagamento (Gateway)
                                    </h3>
                                    <label className="block text-sm font-medium text-slate-700 mb-2">API Key da Loja</label>
                                    <input
                                        type="password"
                                        value={storeSettingsForm.apiKey}
                                        onChange={(e) => setStoreSettingsForm({ ...storeSettingsForm, apiKey: e.target.value })}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm mb-2"
                                        placeholder="pk_store_specific_..."
                                    />
                                    <p className="text-xs text-slate-400">Se deixar em branco, o sistema tentará usar a chave global.</p>
                                </div>

                                <div className="pt-6 border-t border-slate-100 mt-6">
                                    <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                        <i className="fa-solid fa-calculator text-indigo-500"></i> Estimativa de Custos (Interno)
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Taxa Fixa (R$)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={storeSettingsForm.feeFixed}
                                                onChange={(e) => setStoreSettingsForm({ ...storeSettingsForm, feeFixed: Number(e.target.value) })}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-2">Taxa Variável (%)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={storeSettingsForm.feePercent}
                                                onChange={(e) => setStoreSettingsForm({ ...storeSettingsForm, feePercent: Number(e.target.value) })}
                                                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                placeholder="0.99"
                                            />
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 mt-2">Usado apenas para cálculo de lucro líquido nos relatórios.</p>
                                </div>

                                <button type="submit" className="w-full mt-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">
                                    Salvar Configurações da Loja
                                </button>
                            </form>
                        </div>
                    ) : (
                        /* MASTER SETTINGS */
                        <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-6">
                            <div>
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <i className="fa-solid fa-key text-emerald-500"></i> Credenciais de Pagamento (Global)
                                </h3>
                                <label className="block text-sm font-medium text-slate-700 mb-2">API Key de Produção</label>
                                <input
                                    type="password"
                                    value={settings.apiKey}
                                    onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                                    placeholder="pk_..."
                                />
                                <p className="text-xs text-slate-400 mt-2">Usada para pedidos sem loja vinculada ou se a loja não tiver chave própria.</p>
                            </div>

                            <div className="pt-6 border-t border-slate-100">
                                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                                    <i className="fa-solid fa-lock text-emerald-500"></i> Segurança
                                </h3>
                                <label className="block text-sm font-medium text-slate-700 mb-2">Nova Senha Admin</label>
                                <input
                                    type="text"
                                    value={settings.adminPassword}
                                    onChange={(e) => setSettings({ ...settings, adminPassword: e.target.value })}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    placeholder="Alterar senha..."
                                />
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
      </main>

      {/* COMPONENT PREVIEW */}
      {previewIntentId && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="relative w-full max-w-[400px] h-[85vh] bg-black rounded-[3rem] shadow-2xl border-4 border-slate-800 flex flex-col overflow-hidden">
             {/* Simulator Header */}
            <div className="h-8 bg-slate-900 w-full flex items-center justify-center"><div className="w-20 h-4 bg-black rounded-b-xl"></div></div>
            <div className="bg-slate-800 px-4 py-2 flex justify-between items-center text-white shrink-0">
               <span className="text-xs font-mono text-slate-400">Simulador</span>
               <button onClick={() => setPreviewIntentId(null)} className="w-6 h-6 rounded-full bg-slate-700 hover:bg-red-500 flex items-center justify-center transition-colors"><i className="fa-solid fa-times text-xs"></i></button>
            </div>
            {/* Simulator Body */}
            <div className="flex-1 bg-slate-50 relative overflow-y-auto custom-scrollbar">
              <CheckoutPage settings={settings} previewIntentId={previewIntentId} />
            </div>
            {/* Simulator Footer */}
            <div className="h-4 bg-slate-900 w-full flex items-center justify-center shrink-0"><div className="w-1/3 h-1 bg-slate-700 rounded-full"></div></div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;