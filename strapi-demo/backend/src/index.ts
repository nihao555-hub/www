import type { Core } from '@strapi/strapi';

const SERVICES_SEED = [
  {
    title: '企业官网定制',
    description: '根据客户品牌与需求,定制响应式企业独立站,涵盖首页、产品、案例与联系页面。',
    icon: 'globe',
    order: 1,
  },
  {
    title: '内容管理(CMS)',
    description: '基于 Strapi 的可视化后台,客户无需开发即可自助维护文案、图片与新闻动态。',
    icon: 'edit',
    order: 2,
  },
  {
    title: '一键部署上线',
    description: '前端配合 Vercel,后端配合 Coolify/自托管,提交需求后快速生成并部署。',
    icon: 'rocket',
    order: 3,
  },
  {
    title: 'SEO 与性能优化',
    description: '服务端渲染 + 站点地图 + 结构化数据,帮助企业站获得更好的搜索排名与加载速度。',
    icon: 'trending-up',
    order: 4,
  },
];

const COMPANY_INFO_SEED = {
  name: '示例企业',
  tagline: '用户说出需求,我们一键生成并部署你的企业独立站',
  description:
    '我们是一家专注于为中小企业提供独立站搭建与交付的团队。基于现代化开源技术栈(Strapi + Next.js),从需求到上线一站式完成。',
  email: 'hello@example.com',
  phone: '+86 400-000-0000',
  address: '中国 · 上海',
};

async function setPublicPermissions(strapi: Core.Strapi) {
  const publicRole = await strapi
    .query('plugin::users-permissions.role')
    .findOne({ where: { type: 'public' } });

  if (!publicRole) return;

  const actions = [
    'api::service.service.find',
    'api::service.service.findOne',
    'api::company-info.company-info.find',
  ];

  for (const action of actions) {
    const existing = await strapi
      .query('plugin::users-permissions.permission')
      .findOne({ where: { action, role: publicRole.id } });

    if (!existing) {
      await strapi.query('plugin::users-permissions.permission').create({
        data: { action, role: publicRole.id },
      });
    }
  }
}

async function seedContent(strapi: Core.Strapi) {
  const existingServices = await strapi.documents('api::service.service').count({});
  if (existingServices === 0) {
    for (const service of SERVICES_SEED) {
      await strapi.documents('api::service.service').create({
        data: service,
        status: 'published',
      });
    }
    strapi.log.info(`[seed] Created ${SERVICES_SEED.length} services`);
  }

  const existingInfo = await strapi.documents('api::company-info.company-info').findFirst();
  if (!existingInfo) {
    await strapi.documents('api::company-info.company-info').create({
      data: COMPANY_INFO_SEED,
      status: 'published',
    });
    strapi.log.info('[seed] Created company info');
  }
}

export default {
  register(/* { strapi }: { strapi: Core.Strapi } */) {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await setPublicPermissions(strapi);
    await seedContent(strapi);
  },
};
