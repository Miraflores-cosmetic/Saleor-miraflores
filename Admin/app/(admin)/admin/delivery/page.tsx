import { redirect } from 'next/navigation';

/** Progress-bar перенесён в «Корзина». */
export default function AdminDeliveryRedirect() {
  redirect('/admin/cart');
}
