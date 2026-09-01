import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <main style={{ padding: '120px 2rem 80px', textAlign: 'center' }}>
      <h1 style={{ fontSize: 24, fontWeight: 400, margin: '0 0 12px' }}>Товар не найден</h1>
      <p style={{ color: '#9d9d9d', margin: '0 0 24px' }}>
        Возможно, он скрыт или ссылка устарела.
      </p>
      <Link href="/catalog" style={{ textDecoration: 'underline' }}>
        В каталог
      </Link>
    </main>
  );
}
