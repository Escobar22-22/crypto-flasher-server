const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(bodyParser.json());

app.post('/flash-btc', async (req, res) => {
  const { wif, recipient, amount } = req.body;
  try {
    const keyPair = bitcoin.ECPair.fromWIF(wif);
    const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey });

    const utxos = await axios.get(`https://blockstream.info/api/address/${address}/utxo`);
    let inputSum = 0;
    const txb = new bitcoin.TransactionBuilder();
    txb.setVersion(2); // enables RBF

    for (const utxo of utxos.data) {
      txb.addInput(utxo.txid, utxo.vout, 0xfffffffd); // RBF-enabled input
      inputSum += utxo.value;
      if (inputSum >= amount * 1e8 + 100) break;
    }

    const sendAmount = Math.floor(amount * 1e8);
    const change = inputSum - sendAmount - 100;
    txb.addOutput(recipient, sendAmount);
    if (change > 0) txb.addOutput(address, change);

    utxos.data.forEach((_, i) => txb.sign(i, keyPair));

    const rawTx = txb.buildIncomplete().toHex();
    const broadcast = await axios.post('https://blockstream.info/api/tx', rawTx);

    res.json({ txid: broadcast.data, note: 'Broadcasted fake/spoofed transaction with low fee. Will appear temporarily in some wallets.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Enhanced Bitcoin Flasher running on http://localhost:${PORT}`);
});