let loader = null;

/** Loads Razorpay Checkout once, on demand (not on every page). */
export function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loader) {
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://checkout.razorpay.com/v1/checkout.js';
      s.async = true;
      s.onload = () => resolve(window.Razorpay);
      s.onerror = () => {
        loader = null;
        reject(new Error('Could not load the payment gateway. Check your connection.'));
      };
      document.body.appendChild(s);
    });
  }
  return loader;
}

/**
 * Opens Razorpay's hosted checkout. Resolves with the gateway response on success,
 * rejects with { dismissed: true } if the user closes it, or { failed: true, reason } on failure.
 */
export async function openRazorpay(order) {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      order_id: order.orderId,
      name: 'TicketHub',
      description: order.description,
      prefill: order.prefill,
      theme: { color: '#e11d48' },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => reject({ dismissed: true }), confirm_close: true },
    });
    rzp.on('payment.failed', (resp) => reject({ failed: true, reason: resp?.error?.description || 'Payment failed' }));
    rzp.open();
  });
}
