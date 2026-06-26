import {
  getCompanyInfo,
  getServices,
  type CompanyInfo,
  type Service,
} from "@/lib/strapi";

const FALLBACK_COMPANY: CompanyInfo = {
  name: "示例企业",
  tagline: "用户说出需求,我们一键生成并部署你的企业独立站",
  description:
    "Strapi 后端未连接,正在显示占位内容。启动后端并刷新即可看到来自 CMS 的真实数据。",
  email: "hello@example.com",
  phone: "+86 400-000-0000",
  address: "中国 · 上海",
};

const FALLBACK_SERVICES: Service[] = [
  {
    id: 1,
    title: "企业官网定制",
    description: "根据客户品牌与需求,定制响应式企业独立站。",
    icon: "globe",
    order: 1,
  },
];

export default async function Home() {
  const [companyData, servicesData] = await Promise.all([
    getCompanyInfo(),
    getServices(),
  ]);

  const company = companyData ?? FALLBACK_COMPANY;
  const services =
    servicesData && servicesData.length > 0 ? servicesData : FALLBACK_SERVICES;
  const connected = companyData !== null;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <span className="text-lg font-bold tracking-tight">{company.name}</span>
          <nav className="hidden gap-8 text-sm text-zinc-600 sm:flex">
            <a href="#services" className="hover:text-zinc-900">
              服务
            </a>
            <a href="#about" className="hover:text-zinc-900">
              关于我们
            </a>
            <a href="#contact" className="hover:text-zinc-900">
              联系我们
            </a>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-24 text-center">
        <span className="inline-block rounded-full bg-indigo-50 px-4 py-1 text-sm font-medium text-indigo-600">
          {connected ? "数据来自 Strapi CMS" : "演示占位数据(后端未连接)"}
        </span>
        <h1 className="mx-auto mt-6 max-w-3xl text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
          {company.tagline}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-zinc-600">
          {company.description}
        </p>
        <div className="mt-10 flex justify-center gap-4">
          <a
            href="#contact"
            className="rounded-lg bg-indigo-600 px-6 py-3 font-medium text-white hover:bg-indigo-700"
          >
            免费咨询
          </a>
          <a
            href="#services"
            className="rounded-lg border border-zinc-200 px-6 py-3 font-medium hover:bg-zinc-50"
          >
            查看服务
          </a>
        </div>
      </section>

      <section id="services" className="bg-zinc-50 py-24">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight">
            我们的服务
          </h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {services.map((service) => (
              <div
                key={service.id}
                className="rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-xl">
                  ★
                </div>
                <h3 className="mt-4 text-lg font-semibold">{service.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">
                  {service.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="about" className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h2 className="text-3xl font-bold tracking-tight">关于我们</h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-zinc-600">
          {company.description}
        </p>
      </section>

      <section id="contact" className="bg-zinc-900 py-24 text-white">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight">联系我们</h2>
          <p className="mt-4 text-zinc-300">
            准备好搭建你的企业独立站了吗?随时联系我们。
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="text-sm text-zinc-400">邮箱</p>
              <p className="mt-1 font-medium">{company.email}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">电话</p>
              <p className="mt-1 font-medium">{company.phone}</p>
            </div>
            <div>
              <p className="text-sm text-zinc-400">地址</p>
              <p className="mt-1 font-medium">{company.address}</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-100 py-8 text-center text-sm text-zinc-500">
        © {new Date().getFullYear()} {company.name} · 基于 Strapi + Next.js 构建
      </footer>
    </div>
  );
}
