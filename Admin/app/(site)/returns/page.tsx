import type { Metadata } from 'next';
import { ContentPage, contentPageStyles as styles } from '../content/ContentPage';

export const metadata: Metadata = {
  title: 'Обмен и возврат — Jcos',
};

export default function ReturnsPage() {
  return (
    <ContentPage title="Обмен и возврат">
      <p className={styles.text}>
        Условия обмена и возврата товаров надлежащего и ненадлежащего качества
        — в соответствии с Законом о защите прав потребителей. Полный текст
        (сроки, исключения, порядок оформления) будет размещён здесь до
        публичного запуска.
      </p>
      <p className={styles.text}>
        По вопросам возврата напишите на контактный email из раздела «Контакты».
      </p>
    </ContentPage>
  );
}
