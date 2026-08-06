const clean = (value) => String(value ?? "").trim();

const monthKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};

const monthIndex = (key) => {
  const [year, month] = key.split("-").map(Number);
  return year * 12 + month - 1;
};

export function buildMonthlyRetention(orders) {
  const activityByCustomer = new Map();
  orders.forEach((order) => {
    const customerId = clean(order.customer_id);
    const month = monthKey(order.created_at);
    if (!customerId || !month) return;
    if (!activityByCustomer.has(customerId)) activityByCustomer.set(customerId, new Set());
    activityByCustomer.get(customerId).add(month);
  });

  const cohorts = new Map();
  activityByCustomer.forEach((months, customerId) => {
    const cohortMonth = [...months].sort()[0];
    if (!cohorts.has(cohortMonth)) cohorts.set(cohortMonth, []);
    cohorts.get(cohortMonth).push({ customerId, months });
  });

  const cohortMonths = [...cohorts.keys()].sort();
  const latestMonth = [...activityByCustomer.values()].flatMap((months) => [...months]).sort().at(-1);
  const maxOffset = latestMonth && cohortMonths.length ? monthIndex(latestMonth) - monthIndex(cohortMonths[0]) : 0;
  return {
    maxOffset,
    rows: cohortMonths.map((cohortMonth) => {
      const members = cohorts.get(cohortMonth);
      const size = members.length;
      const availableOffsets = latestMonth ? monthIndex(latestMonth) - monthIndex(cohortMonth) : 0;
      const retention = Array.from({ length: availableOffsets + 1 }, (_, offset) => {
        const targetIndex = monthIndex(cohortMonth) + offset;
        const retained = members.filter(({ months }) => [...months].some((month) => monthIndex(month) === targetIndex)).length;
        return { retained, percentage: size ? retained / size * 100 : 0 };
      });
      return { cohortMonth, size, retention };
    }),
  };
}
