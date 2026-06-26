const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL ?? 'http://localhost:1337';

export type Service = {
  id: number;
  title: string;
  description: string;
  icon: string;
  order: number;
};

export type CompanyInfo = {
  name: string;
  tagline: string;
  description: string;
  email: string;
  phone: string;
  address: string;
};

async function fetchFromStrapi<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${STRAPI_URL}${path}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data as T;
  } catch {
    return null;
  }
}

export function getServices(): Promise<Service[] | null> {
  return fetchFromStrapi<Service[]>('/api/services?sort=order:asc');
}

export function getCompanyInfo(): Promise<CompanyInfo | null> {
  return fetchFromStrapi<CompanyInfo>('/api/company-info');
}
