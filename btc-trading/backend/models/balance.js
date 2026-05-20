// In-memory balance storage
const balances = {
  USD: 100000.00,
  BTC: 1.5,
  USDT: 50000.00
};

const Balance = {
  get: (asset) => balances[asset] || 0,
  
  getAll: () => ({ ...balances }),
  
  update: (asset, amount) => {
    if (balances[asset] !== undefined) {
      balances[asset] += amount;
    }
    return balances[asset];
  },
  
  set: (asset, amount) => {
    balances[asset] = amount;
    return balances[asset];
  },
  
  reset: () => {
    balances.USD = 100000.00;
    balances.BTC = 1.5;
    balances.USDT = 50000.00;
  }
};

module.exports = Balance;