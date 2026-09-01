import type { Metadata } from 'next';
import { ContentPage, contentPageStyles as styles } from '../content/ContentPage';

export const metadata: Metadata = {
  title: 'Cookies — Jcos',
};

export default function CookiesPage() {
  return (
    <ContentPage title="Cookies">
      <p className={styles.text}>
        Мы можем использовать cookie и сходные технологии для работы сессии,
        корзины, аналитики и безопасности. Подробный перечень целей и сроков
        хранения будет описан здесь и в политике конфиденциальности.
      </p>
      <p className={styles.text}>
        Версия документа: <span className={styles.meta}>1</span>.
      </p>
    </ContentPage>
  );
}