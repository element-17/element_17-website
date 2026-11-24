export type ModuleId = 'home' | 'blog' | 'projects' | 'about' | 'contact'

/** 章节导航骨架（所有业务内容均实时来自后端 API，不做静态文案兜底） */
export interface ModuleDef {
  id: ModuleId
  index: string
  label: string
  en: string
  /** 信息面板所在一侧（3D 主体陈设在另一侧） */
  side: 'left' | 'right'
}

export const MODULES: ModuleDef[] = [
  { id: 'home', index: '00', label: '首页', en: 'Home', side: 'left' },
  { id: 'blog', index: '01', label: '随笔', en: 'Blog', side: 'left' },
  { id: 'projects', index: '02', label: '作品', en: 'Projects', side: 'right' },
  { id: 'about', index: '03', label: '关于', en: 'About', side: 'right' },
  { id: 'contact', index: '04', label: '联系', en: 'Contact', side: 'left' },
]

export const MODULE_IDS = MODULES.map((m) => m.id)

export const moduleIndex = (id: ModuleId) => MODULE_IDS.indexOf(id)

export const isModuleId = (v: string): v is ModuleId =>
  (MODULE_IDS as string[]).includes(v)
