import type { Metadata } from 'next';
import { ContentPage, contentPageStyles as styles } from '../content/ContentPage';

export const metadata: Metadata = {
  title: 'Контакты — Jcos',
};

export default function ContactsPage() {
  return (
    <ContentPage title="Контакты">
      <p className={styles.text}>
        Служба поддержки и реквизиты продавца будут указаны здесь до открытия
        продаж (email, телефон, ИП/ООО, ИНН, адрес).
      </p>
      <p className={styles.text}>
        Пока сайт в подготовке — пишите через форму обратной связи или канал,
        который появится в футере после настройки.
      </p>
    </ContentPage>
  );
}
