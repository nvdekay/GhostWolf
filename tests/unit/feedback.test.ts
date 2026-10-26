// P2: toast/màn chuyển cảnh dùng đúng key do người gọi tạo, nên timer luôn xóa được.
import { describe, expect, it } from 'vitest'
import { feedbackReducer, type FeedbackState } from '@/app/feedbackState'

const empty: FeedbackState = { toast: null, curtain: null }

describe('feedbackReducer', () => {
  it('giữ nguyên key được truyền vào và xóa đúng bằng key đó', () => {
    let s = feedbackReducer(empty, { type: 'toast', text: 'Xong', tone: 'info', key: 7 })
    expect(s.toast?.key).toBe(7)
    s = feedbackReducer(s, { type: 'clearToast', key: 7 })
    expect(s.toast).toBeNull()

    s = feedbackReducer(s, { type: 'curtain', title: 'Đêm', sub: '1', icon: 'moon', key: 8 })
    s = feedbackReducer(s, { type: 'clearCurtain', key: 8 })
    expect(s.curtain).toBeNull()
  })

  it('timer của toast cũ không xóa toast mới', () => {
    let s = feedbackReducer(empty, { type: 'toast', text: 'A', tone: 'info', key: 1 })
    s = feedbackReducer(s, { type: 'toast', text: 'B', tone: 'error', key: 2 })
    s = feedbackReducer(s, { type: 'clearToast', key: 1 })
    expect(s.toast?.text).toBe('B')
  })
})
