/* State của toast và màn chuyển cảnh (tách khỏi component để test và fast refresh). */
import type { IconName } from '@/components/Icon'

export interface FeedbackState {
  toast: { text: string; key: number; tone: 'info' | 'error' } | null
  curtain: { title: string; sub: string; icon: IconName; key: number } | null
}

type FeedbackAction =
  | { type: 'toast'; text: string; tone: 'info' | 'error'; key: number }
  | { type: 'curtain'; title: string; sub: string; icon: IconName; key: number }
  | { type: 'clearToast'; key: number }
  | { type: 'clearCurtain'; key: number }

/** Key do người gọi tạo một lần và dùng chung cho state lẫn timer xóa (export để test). */
export function feedbackReducer(s: FeedbackState, a: FeedbackAction): FeedbackState {
  switch (a.type) {
    case 'toast':
      return { ...s, toast: { text: a.text, tone: a.tone, key: a.key } }
    case 'curtain':
      return { ...s, curtain: { title: a.title, sub: a.sub, icon: a.icon, key: a.key } }
    case 'clearToast':
      return s.toast?.key === a.key ? { ...s, toast: null } : s
    case 'clearCurtain':
      return s.curtain?.key === a.key ? { ...s, curtain: null } : s
  }
}
