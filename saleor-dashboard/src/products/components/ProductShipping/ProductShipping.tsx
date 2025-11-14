// @ts-strict-ignore
import { DashboardCard } from "@dashboard/components/Card";
import { MetadataInput, ProductErrorFragment } from "@dashboard/graphql";
import { getFormErrors, getProductErrorMessage } from "@dashboard/utils/errors";
import createNonNegativeValueChangeHandler from "@dashboard/utils/handlers/nonNegativeValueChangeHandler";
import { Box, Input, Text } from "@saleor/macaw-ui-next";
import * as React from "react";
import { useIntl } from "react-intl";

interface ProductShippingProps {
  data: {
    weight: string;
    metadata?: MetadataInput[];
  };
  disabled: boolean;
  errors: ProductErrorFragment[];
  weightUnit: string;
  onChange: (event: React.ChangeEvent<any>) => void;
  onMetadataChange?: (event: React.ChangeEvent<any>) => void;
}

export const ProductShipping = (props: ProductShippingProps) => {
  const { data, disabled, errors, weightUnit, onChange, onMetadataChange } = props;
  const intl = useIntl();
  const formErrors = getFormErrors(["weight"], errors);
  const handleChange = createNonNegativeValueChangeHandler(onChange);

  const getMeta = React.useCallback(
    (key: string) => data?.metadata?.find(m => m.key === key)?.value ?? "",
    [data?.metadata],
  );

  const setMeta = React.useCallback(
    (key: string, value: string) => {
      if (!onMetadataChange) return;
      const current: MetadataInput[] = data?.metadata ?? [];
      const idx = current.findIndex(m => m.key === key);
      const next: MetadataInput[] = idx >= 0
        ? current.map((m, i) => (i === idx ? { ...m, value } : m))
        : [...current, { key, value }];

      onMetadataChange({
        target: {
          name: "metadata",
          value: next,
        },
      } as unknown as React.ChangeEvent<any>);
    },
    [data?.metadata, onMetadataChange],
  );

  const parseNonNegative = (val: string) => {
    const num = Number(val);
    if (!isFinite(num) || num < 0) return "";
    return String(num);
  };

  const lengthMm = getMeta("dimensions.length_mm");
  const widthMm = getMeta("dimensions.width_mm");
  const heightMm = getMeta("dimensions.height_mm");

  const volumeM3 = React.useMemo(() => {
    const l = Number(lengthMm || 0);
    const w = Number(widthMm || 0);
    const h = Number(heightMm || 0);
    const m3 = (l * w * h) / 1_000_000_000; // mm^3 -> m^3
    return Number.isFinite(m3) && m3 > 0 ? m3.toFixed(6) : "0";
  }, [lengthMm, widthMm, heightMm]);

  React.useEffect(() => {
    // keep computed volume in metadata
    setMeta("dimensions.volume_m3", volumeM3);
  }, [volumeM3, setMeta]);

  const mapWeightUnitToRu = (unit: string) => {
    switch ((unit || "").toLowerCase()) {
      case "kg":
        return "кг";
      case "g":
        return "г";
      case "lb":
        return "фунт";
      case "oz":
        return "унция";
      default:
        return unit || "";
    }
  };

  return (
    <DashboardCard>
      <DashboardCard.Header>
        <DashboardCard.Title>
          {intl.formatMessage({
            id: "3rIMq/",
            defaultMessage: "Shipping",
            description: "product shipping",
          })}
        </DashboardCard.Title>
      </DashboardCard.Header>
      <DashboardCard.Content>
        <Box __width="25%" marginBottom={4}>
          <Input
            disabled={disabled}
            label={intl.formatMessage({
              id: "SUbxSK",
              defaultMessage: "Weight",
              description: "product weight",
            })}
            error={!!formErrors.weight}
            helperText={getProductErrorMessage(formErrors.weight, intl)}
            name="weight"
            type="number"
            size="small"
            value={data.weight}
            onChange={handleChange}
            endAdornment={<Text marginRight={2}>{mapWeightUnitToRu(weightUnit) || ""}</Text>}
          />
        </Box>
        <Box display="grid" __gridTemplateColumns="repeat(4, minmax(0, 1fr))" gap={3}>
          <Input
            disabled={disabled}
            label={intl.formatMessage({
              id: "len-mm",
              defaultMessage: "Длина",
              description: "product length",
            })}
            name="dimensions.length_mm"
            type="number"
            size="small"
            value={lengthMm}
            onChange={e => setMeta("dimensions.length_mm", parseNonNegative(e.target.value))}
            endAdornment={<Text marginRight={2}>мм</Text>}
          />
          <Input
            disabled={disabled}
            label={intl.formatMessage({
              id: "wid-mm",
              defaultMessage: "Ширина",
              description: "product width",
            })}
            name="dimensions.width_mm"
            type="number"
            size="small"
            value={widthMm}
            onChange={e => setMeta("dimensions.width_mm", parseNonNegative(e.target.value))}
            endAdornment={<Text marginRight={2}>мм</Text>}
          />
          <Input
            disabled={disabled}
            label={intl.formatMessage({
              id: "hei-mm",
              defaultMessage: "Высота",
              description: "product height",
            })}
            name="dimensions.height_mm"
            type="number"
            size="small"
            value={heightMm}
            onChange={e => setMeta("dimensions.height_mm", parseNonNegative(e.target.value))}
            endAdornment={<Text marginRight={2}>мм</Text>}
          />
          <Input
            disabled={disabled}
            label={intl.formatMessage({
              id: "vol-m3",
              defaultMessage: "Объём",
              description: "product volume",
            })}
            name="dimensions.volume_m3"
            type="number"
            size="small"
            value={volumeM3}
            onChange={() => {}}
            endAdornment={<Text marginRight={2}>м³</Text>}
            helperText={intl.formatMessage({ id: "vol-hint", defaultMessage: "Рассчитывается автоматически" })}
          />
        </Box>
      </DashboardCard.Content>
    </DashboardCard>
  );
};
