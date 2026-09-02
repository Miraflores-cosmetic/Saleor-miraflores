import { describe, expect, it } from 'vitest';
import { isOffersFilename, parseOffersXml } from './onec-offers.parser';

const SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<КоммерческаяИнформация xmlns="urn:1C.ru:commerceml_210" ВерсияСхемы="2.08">
  <ПакетПредложений>
    <Предложения>
      <Предложение>
        <Ид>4f3ecdf1-4302-11f1-9a50-f662e7beb2aa</Ид>
        <Наименование>крем "Дневной"</Наименование>
        <Штрихкод>4610505200353</Штрихкод>
        <Артикул>4610505200353</Артикул>
        <Цены>
          <Цена>
            <ЦенаЗаЕдиницу>5820</ЦенаЗаЕдиницу>
          </Цена>
        </Цены>
        <Количество>11</Количество>
      </Предложение>
      <Предложение>
        <Ид>aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee#ffff</Ид>
        <Наименование>тест</Наименование>
        <Цены><Цена><ЦенаЗаЕдиницу>1 820,5</ЦенаЗаЕдиницу></Цена></Цены>
        <Количество>0</Количество>
      </Предложение>
    </Предложения>
  </ПакетПредложений>
</КоммерческаяИнформация>`;

describe('parseOffersXml', () => {
  it('parses price, stock and onecId', () => {
    const rows = parseOffersXml(SAMPLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      onecId: '4f3ecdf1-4302-11f1-9a50-f662e7beb2aa',
      sku: '4610505200353',
      price: 5820,
      quantity: 11,
    });
    expect(rows[1]?.onecId).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(rows[1]?.price).toBe(1821);
    expect(rows[1]?.quantity).toBe(0);
  });

  it('detects offers filenames', () => {
    expect(isOffersFilename('offers.xml')).toBe(true);
    expect(isOffersFilename('import.xml')).toBe(false);
  });
});
