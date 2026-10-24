import { Curtain, Dialog, Sheet, Toast } from '@/components/overlay'
import { BoardDialogs, MenuSheet, PlayerSheet } from '@/features/board/BoardSheets'
import { startFromAssign } from '@/features/assign/actions'
import { HowToSheet } from '@/features/home/HowToSheet'
import { CustomRoleSheet, RoleDetailSheet } from '@/features/roles/RoleSheets'
import { closeRoom } from '@/features/setup/actions'
import { setState, useAppState } from './store'

const closeSheet = () => setState({ sheet: null })
const closeDialog = () => setState({ dialog: null })

/** Sheet, hộp thoại, toast và màn chuyển cảnh nằm trên mọi màn hình. */
export function Overlays() {
  const { sheet, dialog, toast, curtain, assign } = useAppState()
  const viewed = assign?.order.filter((o) => o.viewed).length ?? 0
  const total = assign?.order.length ?? 0

  return (
    <>
      {sheet && (
        <Sheet onClose={closeSheet}>
          {sheet.type === 'role' && <RoleDetailSheet id={sheet.id} />}
          {sheet.type === 'player' && <PlayerSheet id={sheet.id} />}
          {sheet.type === 'howto' && <HowToSheet />}
          {sheet.type === 'custom' && <CustomRoleSheet />}
          {sheet.type === 'menu' && <MenuSheet />}
        </Sheet>
      )}

      {dialog === 'exitDeal' && (
        <Dialog
          title="Dừng chia vai?"
          onClose={closeDialog}
          actions={
            <>
              <button className="btn btn-secondary" onClick={closeDialog}>
                Tiếp tục chia
              </button>
              <button
                className="btn btn-ink"
                onClick={() => setState({ dialog: null, deal: null, screen: 'roles' })}
              >
                Về bộ vai
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Vai đã chia sẽ bị hủy. Khi chia lại, mọi người sẽ nhận vai mới.
          </p>
        </Dialog>
      )}
      {dialog === 'leaveRoom' && (
        <Dialog
          title="Đóng phòng?"
          onClose={closeDialog}
          actions={
            <>
              <button className="btn btn-secondary" onClick={closeDialog}>
                Ở lại
              </button>
              <button className="btn btn-danger" onClick={closeRoom}>
                Đóng phòng
              </button>
            </>
          }
        >
          <p className="dialog__body">
            Mọi người trong phòng sẽ bị ngắt kết nối và mã phòng hết hiệu lực.
          </p>
        </Dialog>
      )}
      {dialog === 'startEarly' && (
        <Dialog
          title="Chưa phải ai cũng xem vai"
          onClose={closeDialog}
          actions={
            <>
              <button className="btn btn-secondary" onClick={closeDialog}>
                Chờ thêm
              </button>
              <button
                className="btn btn-ink"
                onClick={() => {
                  setState({ dialog: null })
                  startFromAssign()
                }}
              >
                Vẫn bắt đầu
              </button>
            </>
          }
        >
          <p className="dialog__body">
            {viewed}/{total} người đã xem vai. Bắt đầu đêm bây giờ, người chưa xem vẫn mở được vai
            trên máy của mình.
          </p>
        </Dialog>
      )}
      <BoardDialogs />

      {toast && <Toast key={toast.key} text={toast.text} />}
      {curtain && (
        <Curtain key={curtain.key} title={curtain.title} sub={curtain.sub} icon={curtain.icon} />
      )}
    </>
  )
}
