const metricHeaders = { impressions: 'Impressions', clicks: 'Clicks', spend: 'Spend', conversions: 'Conversions', conversionValue: 'Conversion Value' };
const dimensionHeaders = { campaignId: 'Campaign ID', campaign: 'Campaign', status: 'Status', campaignType: 'Campaign Type', adGroupId: 'Ad Group ID', adGroup: 'Ad Group', adId: 'Ad ID', adType: 'Ad Type' };
const dimensions = { monthly: [], campaigns: ['campaignId', 'campaign', 'status', 'campaignType'], adGroups: ['campaign', 'adGroupId', 'adGroup', 'status'], ads: ['campaign', 'adGroup', 'adId', 'status', 'adType'] };
export function normalizeAds(values, type) {
  if (!Array.isArray(values) || !values.length) return [];
  const headers = values[0].map(value => String(value).trim());
  const required = ['Month', ...Object.values(metricHeaders), ...dimensions[type].map(key => dimensionHeaders[key])];
  if (required.some(header => !headers.includes(header))) throw new Error(`Google Ads ${type}: missing required columns.`);
  const get = (row, header) => row[headers.indexOf(header)];
  const seen = new Set();
  return values.slice(1).filter(row => row.some(value => String(value ?? '').trim())).map(row => {
    const raw = get(row, 'Month');
    const month = typeof raw === 'number' ? new Date(Date.UTC(1899, 11, 30) + raw * 86400000).toISOString().slice(0,7) : String(raw ?? '').trim().replace(/-01$/, '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error(`Google Ads ${type}: invalid month.`);
    const result = { month };
    for (const [key, header] of Object.entries(metricHeaders)) {
      const value = get(row, header);
      const numeric = typeof value === 'number' ? value : Number(String(value ?? '').replaceAll(',', '').trim());
      if (value === undefined || value === null || String(value).trim() === '' || !Number.isFinite(numeric) || numeric < 0) throw new Error(`Google Ads ${type}: missing or invalid ${header}.`);
      result[key] = numeric;
    }
    for (const key of dimensions[type]) result[key] = String(get(row, dimensionHeaders[key]) ?? '').trim();
    const identity = [month, ...dimensions[type].filter(key => !['status','campaignType','adType'].includes(key)).map(key => result[key])].join('|');
    if (seen.has(identity)) throw new Error(`Google Ads ${type}: duplicate monthly rows.`);
    seen.add(identity);
    return result;
  });
}
export function adsTotals(rows) {
  const totals = { impressions: 0, clicks: 0, spend: 0, conversions: 0, conversionValue: 0 };
  rows.forEach(row => Object.keys(totals).forEach(key => { totals[key] += row[key]; }));
  return { ...totals, ctr: totals.impressions ? totals.clicks / totals.impressions * 100 : null, cpc: totals.clicks ? totals.spend / totals.clicks : null, cpm: totals.impressions ? totals.spend / totals.impressions * 1000 : null, cpa: totals.conversions ? totals.spend / totals.conversions : null, roas: totals.spend ? totals.conversionValue / totals.spend : null };
}
export function adsGrouped(rows, keys) {
  const groups = new Map();
  [...rows].sort((a,b) => a.month.localeCompare(b.month)).forEach(row => {
    const identity = JSON.stringify(keys.map(key => row[key]));
    if (!groups.has(identity)) groups.set(identity, []);
    groups.get(identity).push(row);
  });
  return [...groups].map(([identity, group]) => ({ ...group[group.length - 1], ...adsTotals(group), __key: identity })).sort((a,b) => b.spend - a.spend);
}
