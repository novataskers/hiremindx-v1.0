import { headers } from "next/headers";

type CurrencyInfo = {
  countryName: string;
  countryCode: string;
  currencyCode: string;
  exchangeRate: number;
  locale: string;
  source: "ipapi" | "fallback";
};

type IpApiResponse = {
  country_name?: string;
  country_code?: string;
  currency?: string;
  error?: boolean;
  message?: string;
};

type OpenErApiResponse = {
  result?: string;
  rates?: Record<string, number>;
};

type RestCountriesResponse = {
  name?: {
    common?: string;
    official?: string;
  };
  cca2?: string;
  currencies?: Record<string, { name?: string; symbol?: string }>;
};

type HeaderReader = {
  get(name: string): string | null;
};

const FALLBACK_COUNTRY_CODE = "GB";
const FALLBACK_COUNTRY_NAME = "United Kingdom";
const FALLBACK_CURRENCY_CODE = "GBP";
const FALLBACK_LOCALE = "en-GB";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestHeaders = await headers();
  const countryHint = normalizeCountryCode(requestHeaders.get("x-vercel-ip-country"));
  const ipAddress = getClientIp(requestHeaders);

  try {
    if (countryHint) {
      const geoInfoFromCountry = await resolveGeoInfoByCountry(countryHint);
      if (geoInfoFromCountry) {
        const exchangeRate = await getGbpExchangeRate(geoInfoFromCountry.currencyCode);
        if (isValidExchangeRate(exchangeRate)) {
          return jsonResponse({
            ...geoInfoFromCountry,
            exchangeRate,
            source: "ipapi",
          });
        }
      }
    }

    if (ipAddress) {
      const geoInfoFromIp = await resolveGeoInfoByIp(ipAddress);
      if (geoInfoFromIp) {
        const exchangeRate = await getGbpExchangeRate(geoInfoFromIp.currencyCode);
        if (isValidExchangeRate(exchangeRate)) {
          return jsonResponse({
            ...geoInfoFromIp,
            exchangeRate,
            source: "ipapi",
          });
        }
      }
    }
  } catch {
    // Fall through to the safe fallback response below.
  }

  return jsonResponse(createFallbackInfo(countryHint));
}

function isValidExchangeRate(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function jsonResponse(payload: CurrencyInfo): Response {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

function createFallbackInfo(countryHint: string | null): CurrencyInfo {
  const countryCode = countryHint || FALLBACK_COUNTRY_CODE;

  return {
    countryName: countryCode === FALLBACK_COUNTRY_CODE ? FALLBACK_COUNTRY_NAME : getCountryName(countryCode),
    countryCode,
    currencyCode: FALLBACK_CURRENCY_CODE,
    exchangeRate: 1,
    locale: countryCode === FALLBACK_COUNTRY_CODE ? FALLBACK_LOCALE : buildLocale(countryCode),
    source: "fallback",
  };
}

function getClientIp(requestHeaders: HeaderReader): string | null {
  const headerCandidates = [
    requestHeaders.get("x-forwarded-for"),
    requestHeaders.get("x-real-ip"),
    requestHeaders.get("cf-connecting-ip"),
    requestHeaders.get("x-client-ip"),
    requestHeaders.get("true-client-ip"),
  ];

  for (const headerValue of headerCandidates) {
    const ip = extractFirstIp(headerValue);
    if (ip) {
      return ip;
    }
  }

  return null;
}

function extractFirstIp(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  for (const part of headerValue.split(",")) {
    const ip = sanitizeIp(part);
    if (ip) {
      return ip;
    }
  }

  return null;
}

function sanitizeIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim().replace(/^"|"$/g, "");
  if (!trimmed || trimmed.toLowerCase() === "unknown") {
    return null;
  }

  if (trimmed.startsWith("[") && trimmed.includes("]")) {
    const endIndex = trimmed.indexOf("]");
    const bracketValue = trimmed.slice(1, endIndex).trim();
    return bracketValue.length > 0 ? bracketValue : null;
  }

  const ipv4WithPort = trimmed.match(/^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/);
  if (ipv4WithPort) {
    return ipv4WithPort[1];
  }

  return trimmed;
}

function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length === 2 ? normalized : null;
}

function normalizeCurrencyCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length === 3 ? normalized : null;
}

function cleanCountryName(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildLocale(countryCode: string): string {
  return `en-${countryCode}`;
}

function getCountryName(countryCode: string): string {
  try {
    const displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    const resolvedName = displayNames.of(countryCode);

    if (resolvedName) {
      return resolvedName;
    }
  } catch {
    // Ignore and fall back to the code below.
  }

  return countryCode;
}

function extractCurrencyCode(currencies: RestCountriesResponse["currencies"]): string | null {
  if (!currencies || typeof currencies !== "object") {
    return null;
  }

  const currencyKeys = Object.keys(currencies).filter((key) => normalizeCurrencyCode(key));
  return normalizeCurrencyCode(currencyKeys[0] ?? null);
}

async function resolveGeoInfoByCountry(
  countryCode: string
): Promise<Omit<CurrencyInfo, "exchangeRate" | "source"> | null> {
  const response = await fetch(
    `https://restcountries.com/v3.1/alpha/${encodeURIComponent(countryCode)}?fields=name,cca2,currencies`,
    {
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as RestCountriesResponse | RestCountriesResponse[];
  const country = Array.isArray(data) ? data[0] : data;

  if (!country) {
    return null;
  }

  const resolvedCountryCode = normalizeCountryCode(country.cca2) ?? countryCode;
  const currencyCode = extractCurrencyCode(country.currencies);

  if (!resolvedCountryCode || !currencyCode) {
    return null;
  }

  return {
    countryName:
      cleanCountryName(country.name?.common) ??
      cleanCountryName(country.name?.official) ??
      getCountryName(resolvedCountryCode),
    countryCode: resolvedCountryCode,
    currencyCode,
    locale: buildLocale(resolvedCountryCode),
  };
}

async function resolveGeoInfoByIp(ipAddress: string): Promise<Omit<CurrencyInfo, "exchangeRate" | "source"> | null> {
  const response = await fetch(`https://ipapi.co/${encodeURIComponent(ipAddress)}/json/`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as IpApiResponse;

  if (data.error) {
    return null;
  }

  const countryCode = normalizeCountryCode(data.country_code);
  const currencyCode = normalizeCurrencyCode(data.currency);

  if (!countryCode || !currencyCode) {
    return null;
  }

  return {
    countryName: cleanCountryName(data.country_name) ?? getCountryName(countryCode),
    countryCode,
    currencyCode,
    locale: buildLocale(countryCode),
  };
}

async function getGbpExchangeRate(currencyCode: string): Promise<number | null> {
  const normalizedCurrencyCode = normalizeCurrencyCode(currencyCode);

  if (!normalizedCurrencyCode) {
    return null;
  }

  if (normalizedCurrencyCode === FALLBACK_CURRENCY_CODE) {
    return 1;
  }

  const response = await fetch("https://open.er-api.com/v6/latest/GBP", {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as OpenErApiResponse;
  const rate = data.rates?.[normalizedCurrencyCode];

  if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    return null;
  }

  return rate;
}
