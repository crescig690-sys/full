import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AdminSettings, Order, PixGoCreateResponse } from '../types';
import { createPixPayment, checkPaymentStatus } from '../services/pixgoService';
import { db } from '../services/database';

interface CheckoutPageProps {
  settings: AdminSettings;
  previewIntentId?: string;
}

const CheckoutPage: React.FC<CheckoutPageProps> = ({ settings, previewIntentId }) => {
  const params = useParams<{ intentId: string }>();
  const navigate = useNavigate();
  // Use previewIntentId if provided (admin preview mode), otherwise use URL params
  const intentId = previewIntentId || params.intentId;

  const [intent, setIntent] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PixGoCreateResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [pollingActive, setPollingActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Specific Key for this checkout transaction (Global vs Store)
  const [activeApiKey, setActiveApiKey] = useState<string>('');

  // Form states
  const [formData, setFormData] = useState({
    name: '',
    cpf: '',
    email: '',
    phone: ''
  });

  useEffect(() => {
    const fetchIntent = async () => {
        if (!intentId) return;
        
        // 1. Get Order
        const dbOrder = await db.getOrderById(intentId);
        
        if (dbOrder) {
            setIntent(dbOrder);
            
            // 2. Determine API Key (Store Specific vs Global)
            let keyToUse = settings.apiKey;
            if (dbOrder.store_id) {
                const storeData = await db.getStoreById(dbOrder.store_id);
                if (storeData && storeData.apiKey) {
                    keyToUse = storeData.apiKey;
                }
            }
            setActiveApiKey(keyToUse);

            // 3. Restore Payment Data if exists
            if (dbOrder.pixgo_payment_id && dbOrder.qr_code && dbOrder.status === 'pending') {
                setPaymentData({
                    success: true,
                    data: {
                        payment_id: dbOrder.pixgo_payment_id,
                        external_id: dbOrder.id,
                        amount: dbOrder.amount,
                        status: dbOrder.status,
                        qr_code: dbOrder.qr_code,
                        qr_image_url: dbOrder.qr_image_url || '',
                        expires_at: '',
                        created_at: dbOrder.createdAt
                    }
                });
                setPaymentStatus(dbOrder.status);
                setPollingActive(true);
            }
        } else {
             setError('Pedido não encontrado no sistema.');
        }
    };

    fetchIntent();
  }, [intentId, settings.apiKey]);

  const pollStatus = useCallback(async () => {
    if (!paymentData || !activeApiKey) return;
    try {
      const statusRes = await checkPaymentStatus(activeApiKey, paymentData.data.payment_id);
      if (statusRes.success) {
        const currentStatus = statusRes.data.status;
        setPaymentStatus(currentStatus);
        
        // Update DB
        if (intent) {
            await db.updateStatus(intent.id, currentStatus);
        }

        if (currentStatus === 'completed' || currentStatus === 'expired' || currentStatus === 'cancelled') {
          setPollingActive(false);
        }
      }
    } catch (err) {
      console.error('Erro ao checar status:', err);
    }
  }, [paymentData, activeApiKey, intent]);

  useEffect(() => {
    let interval: any;
    if (pollingActive) {
      interval = setInterval(pollStatus, 5000);
    }
    return () => clearInterval(interval);
  }, [pollingActive, pollStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!intent || !activeApiKey) {
        setError("Configuração de pagamento incompleta (API Key ausente).");
        return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await createPixPayment(activeApiKey, {
        amount: intent.amount,
        description: intent.description,
        customer_name: formData.name,
        customer_cpf: formData.cpf.replace(/\D/g, ''),
        customer_email: formData.email,
        customer_phone: formData.phone,
        external_id: intent.id
      });

      if (result.success) {
        setPaymentData(result);
        setPaymentStatus('pending');
        setPollingActive(true);

        // SAVE TO DATABASE (Full Order History)
        const newOrder: Order = {
            ...intent,
            customer_name: formData.name,
            customer_cpf: formData.cpf,
            customer_email: formData.email,
            customer_phone: formData.phone,
            pixgo_payment_id: result.data.payment_id,
            qr_code: result.data.qr_code,
            qr_image_url: result.data.qr_image_url,
            status: 'pending',
            updatedAt: new Date().toISOString()
        };
        
        await db.saveOrder(newOrder);
        setIntent(newOrder); // Update local state with full info

      } else {
        setError(result.message || 'Ocorreu um erro ao gerar o PIX.');
      }
    } catch (err: any) {
      setError(err.message || 'Falha na conexão com o servidor de pagamento.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyPixCode = () => {
    if (paymentData?.data.qr_code) {
      navigator.clipboard.writeText(paymentData.data.qr_code);
      alert('Código copiado para a área de transferência!');
    }
  };

  if (error && !paymentData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-100">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <div className="text-red-500 text-5xl mb-4">
            <i className="fa-solid fa-circle-exclamation"></i>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">Erro</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <button 
            onClick={() => navigate('/admin')}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-all"
          >
            Voltar ao Início
          </button>
        </div>
      </div>
    );
  }

  if (!intent) return <div className="p-8 text-center text-slate-500">Carregando checkout...</div>;

  // -- RENDER: PAYMENT RESULT (Clean View) --
  if (paymentData) {
    return (
      <div className="min-h-screen py-8 px-4 bg-slate-50 flex justify-center items-center">
        <div className="w-full max-w-[380px] bg-white rounded-3xl p-6 relative shadow-xl text-center">
          
          {/* Amount Display */}
          <div className="mb-8 mt-4">
             <p className="text-sm text-slate-400 font-medium uppercase tracking-wider mb-1">Total a Pagar</p>
             <h2 className="text-3xl font-black text-slate-800">
               R$ {intent.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
             </h2>
             <p className="text-xs text-slate-400 mt-2">{intent.store_name ? `Loja: ${intent.store_name}` : ''}</p>
          </div>

          {paymentStatus === 'completed' ? (
             <div className="bg-green-50 text-green-800 p-6 rounded-2xl font-bold mb-6 flex flex-col items-center animate-in fade-in zoom-in">
               <i className="fa-solid fa-circle-check text-4xl mb-3 text-green-500"></i>
               <span>Pagamento Confirmado!</span>
             </div>
          ) : paymentStatus === 'expired' ? (
             <div className="bg-red-50 text-red-800 p-6 rounded-2xl font-bold mb-6 flex flex-col items-center">
               <i className="fa-solid fa-circle-xmark text-4xl mb-3 text-red-500"></i>
               <span>Pagamento Expirado</span>
             </div>
          ) : (
            <>
              {/* Copy Paste Section */}
              <div className="text-left mb-6">
                <div className="relative group">
                    <label className="absolute -top-3 left-3 bg-white px-2 text-xs font-bold text-emerald-600">
                      Código Pix Copia e Cola
                    </label>
                    <textarea 
                      readOnly 
                      value={paymentData.data.qr_code}
                      className="w-full h-32 bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 text-xs text-slate-600 font-mono resize-none focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                </div>
              </div>

              <div className="space-y-3">
                 <button
                   onClick={handleCopyPixCode}
                   className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-200/50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                 >
                   <i className="fa-regular fa-copy"></i> Copiar Código Pix
                 </button>

                 <div className="flex items-center justify-center gap-2 text-slate-400 text-xs py-2">
                   <i className="fa-solid fa-circle-notch fa-spin"></i> Aguardando confirmação automática...
                 </div>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  // -- RENDER: INPUT FORM (Initial Step) --
  return (
    <div className="min-h-screen py-10 px-4 bg-slate-100 flex items-center justify-center">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Checkout Header */}
        <div className="bg-slate-900 px-8 py-6 flex justify-between items-center">
           <div>
              <h2 className="text-white font-bold text-lg">Checkout Seguro</h2>
              <p className="text-slate-400 text-sm">{intent.store_name ? intent.store_name : 'Finalize sua compra'}</p>
           </div>
           <div className="w-10 h-10 bg-emerald-500 rounded-full flex items-center justify-center text-white">
              <i className="fa-solid fa-lock"></i>
           </div>
        </div>

        <div className="p-8">
          {/* Product Summary */}
          <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-100">
             <div>
               <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Produto</p>
               <p className="text-slate-800 font-medium text-lg">{intent.description}</p>
             </div>
             <div className="text-right">
               <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Valor</p>
               <p className="text-emerald-600 font-bold text-xl">R$ {intent.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
             </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nome Completo</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="Digite seu nome"
              />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">CPF</label>
                <input
                  type="text"
                  required
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="000.000.000-00"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Telefone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">E-mail</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                placeholder="seu@email.com"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-lg rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {loading ? (
                <>
                   <i className="fa-solid fa-circle-notch fa-spin"></i> Processando...
                </>
              ) : (
                <>
                   <span>Pagar com Pix</span> <i className="fa-brands fa-pix"></i>
                </>
              )}
            </button>
          </form>

          <p className="text-center text-xs text-slate-400 mt-6 flex items-center justify-center gap-2">
            <i className="fa-solid fa-shield-halved"></i> Seus dados estão protegidos
          </p>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;