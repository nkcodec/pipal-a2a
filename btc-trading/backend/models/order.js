// In-memory order storage
let orders = [];
let orderIdCounter = 1;

const Order = {
  create: (orderData) => {
    const order = {
      id: orderIdCounter++,
      type: orderData.type,
      side: orderData.side,
      price: orderData.price,
      amount: orderData.amount,
      status: 'pending',
      exchange: orderData.exchange,
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    return order;
  },
  
  findAll: () => orders,
  
  findById: (id) => orders.find(o => o.id === id),
  
  findByExchange: (exchange) => orders.filter(o => o.exchange === exchange),
  
  updateStatus: (id, status) => {
    const order = orders.find(o => o.id === id);
    if (order) {
      order.status = status;
      order.updatedAt = new Date().toISOString();
    }
    return order;
  },
  
  clear: () => {
    orders = [];
    orderIdCounter = 1;
  }
};

module.exports = Order;