export const CART_PATH = '/cart';
export const CHECKOUT_PATH = '/checkout';
export const MY_ORDERS_PATH = '/account/orders';

/** Set on /cart when a checkout was refused for its lines (D59). */
export const CONFLICT_QUERY = 'conflict';
export const CONFLICT_LINES = 'lines';

/** PRD §7.4's `/orders/:id/placed`; the id is the checkout's (D88). */
export const placedPath = (checkoutId: string): string => `/orders/${encodeURIComponent(checkoutId)}/placed`;
export const orderPath = (orderId: string): string => `${MY_ORDERS_PATH}/${encodeURIComponent(orderId)}`;
