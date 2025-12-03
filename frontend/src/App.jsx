import React, { useState, useEffect, useRef } from 'react';
import { CreditCard, Heart, CheckCircle, AlertCircle, Loader2, Server, WifiOff, Globe } from 'lucide-react';

export default function App() {
  const [givingStep, setGivingStep] = useState('input'); // input, processing, success, error
  const [errorMessage, setErrorMessage] = useState('');
  const [checkoutRequestID, setCheckoutRequestID] = useState(null);
  
  // To switch between localhost and your Render URL easily
  const [useRenderUrl, setUseRenderUrl] = useState(false);
  const backendUrl = useRenderUrl 
    ? 'https://YOUR-RENDER-APP-NAME.onrender.com' // REPLACE THIS AFTER DEPLOYING
    : 'http://localhost:5000';

  const [givingData, setGivingData] = useState({
    phone: '254',
    amount: '',
    type: 'Tithe'
  });

  // Polling interval ref
  const pollInterval = useRef(null);

  const handleChange = (e) => {
    setGivingData({ ...givingData, [e.target.name]: e.target.value });
  };

  const handleGive = async (e) => {
    e.preventDefault();
    setGivingStep('processing');
    setErrorMessage('');
    setCheckoutRequestID(null);

    try {
      const res = await fetch(`${backendUrl}/api/mpesa/stkpush`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(givingData),
      });

      const data = await res.json();

      if (res.ok && data.ResponseCode === '0') {
        // Success! Now we wait for the user to enter PIN
        setCheckoutRequestID(data.CheckoutRequestID);
      } else {
        setGivingStep('error');
        setErrorMessage(data.details?.errorMessage || data.ResponseDescription || 'Failed to initiate STK Push');
      }
    } catch (err) {
      console.error(err);
      setGivingStep('error');
      setErrorMessage(`Could not connect to ${useRenderUrl ? 'Render' : 'Localhost'}. Is the server running?`);
    }
  };

  // --- REALTIME POLLING LOGIC ---
  useEffect(() => {
    if (givingStep === 'processing' && checkoutRequestID) {
      
      const checkStatus = async () => {
        try {
          const res = await fetch(`${backendUrl}/api/mpesa/status/${checkoutRequestID}`);
          const data = await res.json();
          
          console.log('Payment Status:', data.status);

          if (data.status === 'COMPLETED') {
            setGivingStep('success');
            clearInterval(pollInterval.current);
          } else if (data.status === 'FAILED') {
            setGivingStep('error');
            setErrorMessage('Transaction failed or was cancelled by user.');
            clearInterval(pollInterval.current);
          }
          // If PENDING, do nothing, keep waiting
        } catch (err) {
          console.error('Polling error', err);
        }
      };

      // Poll every 3 seconds
      pollInterval.current = setInterval(checkStatus, 3000);

      // Stop polling after 2 minutes (timeout)
      const timeoutId = setTimeout(() => {
        if (pollInterval.current) {
          clearInterval(pollInterval.current);
          if (givingStep === 'processing') {
            setGivingStep('error');
            setErrorMessage('Transaction timed out. Did you enter your PIN?');
          }
        }
      }, 120000);

      return () => {
        clearInterval(pollInterval.current);
        clearTimeout(timeoutId);
      };
    }
  }, [givingStep, checkoutRequestID, backendUrl]);

  const resetForm = () => {
    setGivingStep('input');
    setGivingData({ phone: '254', amount: '', type: 'Tithe' });
    setCheckoutRequestID(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans text-slate-800">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-emerald-600 p-6 text-center text-white">
          <Heart className="w-12 h-12 mx-auto mb-2 text-emerald-100" />
          <h1 className="text-2xl font-bold">Kambeke SDA Giving</h1>
          <p className="text-emerald-100 text-sm">Secure M-Pesa Donation</p>
        </div>

        {/* Content */}
        <div className="p-8">
          
          {givingStep === 'input' && (
            <form onSubmit={handleGive} className="space-y-4">
              
              {/* Server Selector Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-2 rounded-lg border border-gray-200 mb-4">
                <div className="flex items-center gap-2">
                  {useRenderUrl ? <Globe className="w-4 h-4 text-purple-600"/> : <Server className="w-4 h-4 text-blue-500"/>}
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-700">
                      {useRenderUrl ? 'Production (Render)' : 'Development (Localhost)'}
                    </span>
                    <span className="text-[10px] text-gray-400 truncate w-32">
                      {useRenderUrl ? 'https://...onrender.com' : 'http://localhost:5000'}
                    </span>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={useRenderUrl}
                    onChange={(e) => setUseRenderUrl(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-600"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Giving Type</label>
                <select
                  name="type"
                  value={givingData.type}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                >
                  <option value="Tithe">Tithe</option>
                  <option value="Offering">Offering</option>
                  <option value="Thanksgiving">Thanksgiving</option>
                  <option value="Project">Project Fund</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                <input
                  type="text"
                  name="phone"
                  placeholder="2547XXXXXXXX"
                  value={givingData.phone}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                />
                <p className="text-xs text-gray-500 mt-1">Format: 254712345678</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">KES</span>
                  <input
                    type="number"
                    name="amount"
                    placeholder="100"
                    value={givingData.amount}
                    onChange={handleChange}
                    required
                    min="1"
                    className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <CreditCard className="w-5 h-5" />
                Donate Now
              </button>
            </form>
          )}

          {givingStep === 'processing' && (
            <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
              <Loader2 className="w-16 h-16 text-emerald-600 animate-spin mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-800">Check your phone</h3>
              <p className="text-gray-500 mt-2">We've sent an M-Pesa request to <span className="font-mono font-medium text-gray-700">{givingData.phone}</span></p>
              <div className="mt-4 bg-yellow-50 p-3 rounded-lg text-xs text-yellow-800 border border-yellow-200">
                 Waiting for you to enter PIN...<br/>
                 (We will update automatically)
              </div>
            </div>
          )}

          {givingStep === 'success' && (
            <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-xl font-semibold text-green-700">Payment Received!</h3>
              <p className="text-gray-500 mt-2">Thank you for your generous giving.</p>
              
              <button onClick={resetForm} className="mt-6 text-emerald-600 font-medium hover:underline">
                Give Again
              </button>
            </div>
          )}

          {givingStep === 'error' && (
            <div className="text-center py-8 animate-in fade-in zoom-in duration-300">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-8 h-8 text-red-600" />
              </div>
              <h3 className="text-xl font-semibold text-red-700">Transaction Failed</h3>
              <p className="text-gray-500 mt-2 text-sm">{errorMessage}</p>
              
              <button 
                onClick={() => setGivingStep('input')} 
                className="mt-6 w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 rounded-lg transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

        </div>
        
        <div className="bg-gray-50 p-4 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-400">Powered by Safaricom Daraja API</p>
        </div>
      </div>
    </div>
  );
}
