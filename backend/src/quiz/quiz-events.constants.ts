export const QUIZ_EVENT_TYPES = [
  'quiz_start',
  'zone_select',
  'step_view',
  'step_complete',
  'quiz_complete',
] as const;

export type QuizEventType = (typeof QUIZ_EVENT_TYPES)[number];

export const QUIZ_ZONES = ['face', 'hair'] as const;
export type QuizZone = (typeof QUIZ_ZONES)[number];

/** Порядок воронки для отчёта (face + hair ветки). */
export const QUIZ_FUNNEL_STEPS: { key: string; label: string; zone?: QuizZone }[] = [
  { key: 'start', label: 'Старт / приветствие' },
  { key: 'zone', label: 'Лицо или волосы' },
  { key: 'age', label: 'Возраст', zone: 'face' },
  { key: 'spf', label: 'SPF', zone: 'face' },
  { key: 'issues', label: 'Проблемы кожи', zone: 'face' },
  { key: 'tasks', label: 'Задачи ухода', zone: 'face' },
  { key: 'swelling', label: 'Отёчность', zone: 'face' },
  { key: 'photo', label: 'Фото', zone: 'face' },
  { key: 'result', label: 'Результат', zone: 'face' },
  { key: 'hair_cleansing', label: 'Волосы: очищение', zone: 'hair' },
  { key: 'hair_care', label: 'Волосы: уход', zone: 'hair' },
  { key: 'hair_done', label: 'Волосы: финал', zone: 'hair' },
];
