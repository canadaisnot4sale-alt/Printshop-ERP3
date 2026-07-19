export const money = (n) =>
  new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(
    Number(n || 0)
  );

export const num = (n, d = 2) => Number(n || 0).toFixed(d);
