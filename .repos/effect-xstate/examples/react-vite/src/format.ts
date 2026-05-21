export const formatCurrency = (config: { readonly value: number }): string =>
  new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(config.value);
