import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import AppLayout from './layouts/AppLayout.vue';
import MouseToolTransitionDemo from './demos/MouseToolTransitionDemo.vue';
import MouseToolVueDemo from './demos/MouseToolVueDemo.vue';
import type { NavSection } from './types';

type NavRouteMeta = {
  section: NavSection;
};

const navRoutes = [
  { path: '/map', name: 'map', section: '地图' },
  { path: '/project', name: 'project', section: '项目' },
  { path: '/data', name: 'data', section: '数据' },
  { path: '/ai', name: 'ai', section: 'AI' },
  { path: '/history', name: 'history', section: '历史' },
  { path: '/settings', name: 'settings', section: '设置' }
] satisfies Array<{ path: string; name: string; section: NavSection }>;

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/map' },
  {
    path: '/mousetool-vue-demo',
    name: 'mousetool-vue-demo',
    component: MouseToolVueDemo
  },
  {
    path: '/mousetool-transition-demo',
    name: 'mousetool-transition-demo',
    component: MouseToolTransitionDemo
  },
  ...navRoutes.map((route) => ({
    path: route.path,
    name: route.name,
    component: AppLayout,
    meta: { section: route.section } satisfies NavRouteMeta
  }))
];

export const router = createRouter({
  history: createWebHistory(),
  routes
});
