require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors()); // Allow requests from any frontend (important for Render)
app.use(express.json());

// --- IN-MEMORY DATABASE (For Demo/MVP) ---
// In a large production app, use Redis or MongoDB instead.
const transactions = {}; 

// --- UTILS ---
const getTimestamp = () => {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hour}${minute}${second}`;
};

// Token Cache
let tokenCache = { token: null, expiry: 0 };

const getAccessToken = async () => {
  // Return cached token if valid (expires in 3599s, we buffer 5 mins)
  if (tokenCache.token && Date.now() < tokenCache.expiry) {
    return tokenCache.token;
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

  try {
    const response = await axios.get(
      'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      { headers: { Authorization: `Basic ${auth}` } }
    );
    
    tokenCache.token = response.data.access_token;
    tokenCache.expiry = Date.now() + (3500 * 1000); // Set expiry slightly less than 1 hour
    return tokenCache.token;
  } catch (error) {
    console.error("Token Error:", error.response?.data || error.message);
    throw new Error("Failed to generate Access Token");
  }
};

// --- ROUTES ---

// 1. Health Check (Useful for Render auto-ping)
app.get('/', (req, res) => {
  res.send('M-Pesa Backend is Running!');
});

// 2. Initiate STK Push
app.post('/api/mpesa/stkpush', async (req, res) => {
  const { phone, amount, type } = req.body;

  if (!phone || !amount) return res.status(400).json({ error: 'Phone and Amount required' });

  try {
    const token = await getAccessToken();
    const shortCode = process.env.MPESA_SHORTCODE;
    const passkey = process.env.MPESA_PASSKEY;
    const timestamp = getTimestamp();
    const password = Buffer.from(shortCode + passkey + timestamp).toString('base64');
    
    // IMPORTANT: When deploying to Render, this URL must be your REAL Render URL
    // Format: https://your-app-name.onrender.com/api/mpesa/callback
    const callbackUrl = process.env.MPESA_CALLBACK_URL;

    const stkData = {
      BusinessShortCode: shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: Math.floor(amount), // Ensure integer
      PartyA: phone,
      PartyB: shortCode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: type || 'Donation',
      TransactionDesc: `Payment for ${type}`,
    };

    const response = await axios.post(
      'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      stkData,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    // Save the CheckoutRequestID to track status
    const checkoutRequestID = response.data.CheckoutRequestID;
    transactions[checkoutRequestID] = {
      status: 'PENDING',
      phone,
      amount,
      date: new Date()
    };

    console.log(`STK Push initiated: ${checkoutRequestID}`);
    res.json(response.data);

  } catch (err) {
    console.error('STK Error:', err.response?.data || err.message);
    res.status(500).json({ error: 'STK Push failed', details: err.response?.data || err.message });
  }
});

// 3. Callback URL (Safaricom calls this when user enters PIN)
app.post('/api/mpesa/callback', (req, res) => {
  try {
    const callbackData = req.body.Body.stkCallback;
    const checkoutRequestID = callbackData.CheckoutRequestID;
    const resultCode = callbackData.ResultCode;

    console.log(`Callback received for ${checkoutRequestID}. Code: ${resultCode}`);

    if (transactions[checkoutRequestID]) {
      if (resultCode === 0) {
        transactions[checkoutRequestID].status = 'COMPLETED';
        // You can extract M-Pesa Receipt Number here if needed:
        // const receipt = callbackData.CallbackMetadata.Item.find(i => i.Name === 'MpesaReceiptNumber').Value;
      } else {
        transactions[checkoutRequestID].status = 'FAILED';
      }
    }

    res.json({ result: 'ok' });
  } catch (err) {
    console.error("Callback Error:", err);
    res.status(500).json({ error: 'Callback processing failed' });
  }
});

// 4. Status Check Endpoint (Frontend polls this)
app.get('/api/mpesa/status/:checkoutRequestID', (req, res) => {
  const { checkoutRequestID } = req.params;
  const transaction = transactions[checkoutRequestID];

  if (!transaction) {
    return res.status(404).json({ status: 'NOT_FOUND' });
  }

  res.json({ status: transaction.status });
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
