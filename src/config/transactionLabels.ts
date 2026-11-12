// 僅轉譯畫面文字，不改動既有交易狀態或追蹤邏輯。
export const transactionLabels = {
  idle: '尚未操作', validating: '正在檢查操作條件',
  'awaiting-wallet': '等待 MetaMask 確認', submitted: '交易已送出，尚未確認',
  confirming: '等待鏈上確認', success: '已確認成功', failed: '操作失敗', unknown: '交易狀態未知，請查詢原交易',
} as const
