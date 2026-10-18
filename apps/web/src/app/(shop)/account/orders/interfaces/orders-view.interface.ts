import type { BuyerOrderSummary } from '@app/contracts';

export interface OrdersViewProps {
  orders: BuyerOrderSummary[];
  hasMore: boolean;
  onMore: () => void;
}
